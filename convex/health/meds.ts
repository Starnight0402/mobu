import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { mutation, query, QueryCtx } from "../_generated/server";
import { coupleIds, coupleTimeZone, ownDoc, readers, requireText, trimOrUndef } from "./access";
import { interactionWarnings } from "./interactions";
import { describeSchedule, dosesPerDay, Schedule, slotKey, slotsOn } from "./schedule";
import { addDays, DAY_MS, isDate, isHm, localDate, localToUtc } from "./time";
import { scheduleV, whoV } from "./validators";

const LATE_MIN = 60;

function validateSchedule(s: Schedule) {
  if (!isDate(s.startDate)) throw new Error("Start date isn't valid");
  if (s.endDate && (!isDate(s.endDate) || s.endDate < s.startDate)) throw new Error("End date must be after the start");
  if (s.type !== "prn") {
    if (!s.times.length) throw new Error("Add at least one time");
    if (s.times.length > 12) throw new Error("Up to 12 times a day");
    if (!s.times.every(isHm)) throw new Error("Times look like 08:30");
  }
  if (s.type === "weekly" && !(s.days?.length && s.days.every((d) => d >= 0 && d <= 6))) throw new Error("Pick the days of the week");
  if (s.type === "interval" && !(s.everyDays && s.everyDays >= 2 && s.everyDays <= 90)) throw new Error("Every 2 to 90 days");
}

export function runsOut(m: Doc<"medications">, today: string): string | null {
  if (m.stockCount == null) return null;
  const perDay = dosesPerDay(m.schedule) * (m.perDose ?? 1);
  if (perDay <= 0) return null;
  return addDays(today, Math.floor(m.stockCount / perDay));
}

async function dosesForMed(ctx: QueryCtx, medId: Id<"medications">, fromSlot: string, toSlot: string) {
  return await ctx.db
    .query("doseLogs")
    .withIndex("by_med_slot", (q) => q.eq("medId", medId).gte("slot", fromSlot).lte("slot", toSlot))
    .collect();
}

/** Today's schedule for everyone visible: each slot with taken / skipped / late / due. */
export async function todayFor(ctx: QueryCtx, ownerIds: { userId: Id<"users">; isMe: boolean }[], tz: string) {
  const now = Date.now();
  const today = localDate(now, tz);
  const slots = [];
  const prn = [];
  for (const { userId, isMe } of ownerIds) {
    const meds = (
      await ctx.db
        .query("medications")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .collect()
    ).filter((m) => m.active);
    for (const m of meds) {
      if (m.schedule.type === "prn") {
        const since = now - DAY_MS;
        const logs = (await dosesForMed(ctx, m._id, "prn:", "prn:~")).filter((l) => l.at >= since);
        const lastAt = logs.reduce((mx, l) => Math.max(mx, l.at), 0) || null;
        prn.push({
          medId: m._id,
          ownerId: userId,
          isMe,
          name: m.name,
          strength: m.strength,
          purpose: m.purpose,
          lastAt,
          countToday: logs.length,
          maxPerDay: m.prnMaxPerDay,
          minGapHours: m.prnMinGapHours,
          nextAt: lastAt && m.prnMinGapHours ? lastAt + m.prnMinGapHours * 3_600_000 : null,
        });
        continue;
      }
      const times = slotsOn(m.schedule, today);
      if (!times.length) continue;
      const logs = await dosesForMed(ctx, m._id, slotKey(today, "00:00"), slotKey(today, "23:59"));
      for (const hm of times) {
        const slot = slotKey(today, hm);
        const log = logs.find((l) => l.slot === slot);
        const at = localToUtc(today, hm, tz);
        slots.push({
          medId: m._id,
          ownerId: userId,
          isMe,
          slot,
          hm,
          at,
          name: m.name,
          strength: m.strength,
          instructions: m.instructions,
          kind: m.kind,
          status: log ? log.status : now > at + LATE_MIN * 60_000 ? "late" : now >= at - 30 * 60_000 ? "due" : "upcoming",
          reason: log?.reason,
        });
      }
    }
  }
  slots.sort((a, b) => a.at - b.at);
  return { date: today, slots, prn };
}

export const today = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const list = await readers(ctx, who, "meds");
    return await todayFor(ctx, list, await coupleTimeZone(ctx));
  },
});

export const list = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const tz = await coupleTimeZone(ctx);
    const today = localDate(Date.now(), tz);
    const out = [];
    for (const reader of await readers(ctx, who, "meds")) {
      const meds = await ctx.db
        .query("medications")
        .withIndex("by_owner", (q) => q.eq("ownerId", reader.userId))
        .collect();
      const full = reader.level === "full";
      const active = meds.filter((m) => m.active);
      out.push({
        userId: reader.userId,
        isMe: reader.isMe,
        meds: meds.map((m) => ({
          ...m,
          purpose: full ? m.purpose : undefined,
          prescriber: full ? m.prescriber : undefined,
          instructions: full ? m.instructions : undefined,
          scheduleText: describeSchedule(m.schedule),
          runsOut: m.active ? runsOut(m, today) : null,
          courseLeft: m.schedule.endDate && m.active ? Math.max(0, Math.round((Date.parse(m.schedule.endDate) - Date.parse(today)) / DAY_MS)) : null,
        })),
        warnings: interactionWarnings(active.map((m) => m.name)),
      });
    }
    return out;
  },
});

/** Share of scheduled doses taken over the last `days` days. */
export const adherence = query({
  args: { who: whoV, days: v.number() },
  handler: async (ctx, { who, days }) => {
    const tz = await coupleTimeZone(ctx);
    const now = Date.now();
    const today = localDate(now, tz);
    const n = Math.min(Math.max(1, Math.round(days)), 90);
    const out = [];
    for (const reader of await readers(ctx, who, "meds")) {
      if (reader.level !== "full") continue;
      const meds = await ctx.db
        .query("medications")
        .withIndex("by_owner", (q) => q.eq("ownerId", reader.userId))
        .collect();
      let scheduled = 0;
      let taken = 0;
      let skipped = 0;
      for (const m of meds) {
        if (m.schedule.type === "prn") continue;
        const from = addDays(today, -(n - 1));
        const logs = await dosesForMed(ctx, m._id, slotKey(from, "00:00"), slotKey(today, "23:59"));
        const bySlot = new Map(logs.map((l) => [l.slot, l]));
        for (let i = n - 1; i >= 0; i--) {
          const date = addDays(today, -i);
          if (m.stoppedAt && date > m.stoppedAt) continue;
          for (const hm of slotsOn(m.schedule, date)) {
            // Only doses whose time has passed (plus the grace hour) count.
            if (localToUtc(date, hm, tz) + LATE_MIN * 60_000 > now) continue;
            scheduled++;
            const l = bySlot.get(slotKey(date, hm));
            if (l?.status === "taken") taken++;
            else if (l?.status === "skipped") skipped++;
          }
        }
      }
      out.push({
        userId: reader.userId,
        isMe: reader.isMe,
        scheduled,
        taken,
        skipped,
        missed: scheduled - taken - skipped,
        pct: scheduled ? Math.round((taken / scheduled) * 100) : null,
      });
    }
    return out;
  },
});

const medFields = {
  name: v.string(),
  strength: v.optional(v.string()),
  form: v.optional(v.string()),
  purpose: v.optional(v.string()),
  prescriber: v.optional(v.string()),
  instructions: v.optional(v.string()),
  kind: v.union(v.literal("medicine"), v.literal("supplement")),
  schedule: scheduleV,
  prnMinGapHours: v.optional(v.number()),
  prnMaxPerDay: v.optional(v.number()),
  stockCount: v.optional(v.number()),
  perDose: v.optional(v.number()),
  recordId: v.optional(v.id("healthRecords")),
  nudgePartner: v.optional(v.boolean()),
};

function cleanMed(args: {
  name: string;
  strength?: string;
  form?: string;
  purpose?: string;
  prescriber?: string;
  instructions?: string;
  schedule: Schedule;
  stockCount?: number;
  perDose?: number;
  prnMinGapHours?: number;
  prnMaxPerDay?: number;
}) {
  validateSchedule(args.schedule);
  if (args.stockCount != null && !(args.stockCount >= 0)) throw new Error("Stock can't be negative");
  if (args.perDose != null && !(args.perDose > 0)) throw new Error("Units per dose must be more than 0");
  if (args.prnMinGapHours != null && !(args.prnMinGapHours >= 0 && args.prnMinGapHours <= 72)) throw new Error("Gap between doses: 0 to 72 hours");
  if (args.prnMaxPerDay != null && !(args.prnMaxPerDay >= 1 && args.prnMaxPerDay <= 24)) throw new Error("Max per day: 1 to 24");
  return {
    name: requireText(args.name, "Medicine name", 120),
    strength: trimOrUndef(args.strength),
    form: trimOrUndef(args.form),
    purpose: trimOrUndef(args.purpose),
    prescriber: trimOrUndef(args.prescriber),
    instructions: trimOrUndef(args.instructions),
    schedule: { ...args.schedule, times: [...new Set(args.schedule.times)].sort() },
  };
}

export const add = mutation({
  args: medFields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.insert("medications", {
      ...args,
      ...cleanMed(args),
      ownerId: me,
      active: true,
      nudgePartner: args.nudgePartner ?? true,
    });
  },
});

export const update = mutation({
  args: { id: v.id("medications"), ...medFields },
  handler: async (ctx, { id, ...args }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Medicine");
    await ctx.db.patch(id, { ...args, ...cleanMed(args), nudgePartner: args.nudgePartner ?? true });
  },
});

export const setActive = mutation({
  args: { id: v.id("medications"), active: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { id, active, reason }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Medicine");
    const today = localDate(Date.now(), await coupleTimeZone(ctx));
    await ctx.db.patch(id, active
      ? { active: true, stoppedAt: undefined, stoppedReason: undefined }
      : { active: false, stoppedAt: today, stoppedReason: trimOrUndef(reason) });
  },
});

export const remove = mutation({
  args: { id: v.id("medications") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Medicine");
    const logs = await ctx.db
      .query("doseLogs")
      .withIndex("by_med_slot", (q) => q.eq("medId", id))
      .collect();
    for (const l of logs) await ctx.db.delete(l._id);
    await ctx.db.delete(id);
  },
});

export const setStock = mutation({
  args: { id: v.id("medications"), stockCount: v.number() },
  handler: async (ctx, { id, stockCount }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Medicine");
    if (!(stockCount >= 0)) throw new Error("Stock can't be negative");
    await ctx.db.patch(id, { stockCount });
  },
});

function adjustStock(m: Doc<"medications">, delta: number) {
  if (m.stockCount == null) return {};
  return { stockCount: Math.max(0, m.stockCount + delta * (m.perDose ?? 1)) };
}

/** Mark a scheduled dose taken or skipped. Idempotent; stock follows. */
export const logDose = mutation({
  args: {
    medId: v.id("medications"),
    slot: v.string(),
    status: v.union(v.literal("taken"), v.literal("skipped")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { medId, slot, status, reason }) => {
    const m = await ownDoc(ctx, await ctx.db.get(medId), "Medicine");
    const { me } = await coupleIds(ctx);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) throw new Error("Unknown dose time");
    const [date, hm] = slot.split("T");
    if (!slotsOn(m.schedule, date).includes(hm)) throw new Error("That dose isn't on the schedule");
    const existing = await ctx.db
      .query("doseLogs")
      .withIndex("by_med_slot", (q) => q.eq("medId", medId).eq("slot", slot))
      .unique();
    const wasTaken = existing?.status === "taken";
    const nowTaken = status === "taken";
    if (existing) await ctx.db.patch(existing._id, { status, reason: trimOrUndef(reason), at: Date.now(), loggedBy: me });
    else await ctx.db.insert("doseLogs", { ownerId: m.ownerId, medId, slot, status, reason: trimOrUndef(reason), at: Date.now(), loggedBy: me });
    if (wasTaken !== nowTaken) await ctx.db.patch(medId, adjustStock(m, nowTaken ? -1 : 1));
  },
});

export const unlogDose = mutation({
  args: { medId: v.id("medications"), slot: v.string() },
  handler: async (ctx, { medId, slot }) => {
    const m = await ownDoc(ctx, await ctx.db.get(medId), "Medicine");
    const existing = await ctx.db
      .query("doseLogs")
      .withIndex("by_med_slot", (q) => q.eq("medId", medId).eq("slot", slot))
      .unique();
    if (!existing) return;
    if (existing.status === "taken") await ctx.db.patch(medId, adjustStock(m, 1));
    await ctx.db.delete(existing._id);
  },
});

/**
 * An as-needed dose. Refuses one that breaks the minimum gap or the daily
 * maximum unless `force` (you took it anyway and want it recorded).
 */
export const takePrn = mutation({
  args: { medId: v.id("medications"), force: v.optional(v.boolean()) },
  handler: async (ctx, { medId, force }) => {
    const m = await ownDoc(ctx, await ctx.db.get(medId), "Medicine");
    const { me } = await coupleIds(ctx);
    const now = Date.now();
    const recent = (await dosesForMed(ctx, medId, "prn:", "prn:~")).filter((l) => l.at >= now - DAY_MS);
    const last = recent.reduce((mx, l) => Math.max(mx, l.at), 0);
    if (!force) {
      if (m.prnMinGapHours && last && now - last < m.prnMinGapHours * 3_600_000) {
        const wait = Math.ceil((last + m.prnMinGapHours * 3_600_000 - now) / 60_000);
        return { ok: false, warning: `Last dose was too recent. The next one is allowed in ${wait >= 60 ? `${Math.floor(wait / 60)} h ${wait % 60} min` : `${wait} min`}.` };
      }
      if (m.prnMaxPerDay && recent.length >= m.prnMaxPerDay) {
        return { ok: false, warning: `That's already ${recent.length} in 24 hours, the most allowed.` };
      }
    }
    await ctx.db.insert("doseLogs", { ownerId: m.ownerId, medId, slot: `prn:${now}`, status: "taken", at: now, loggedBy: me });
    await ctx.db.patch(medId, adjustStock(m, -1));
    return { ok: true, warning: null };
  },
});

/** Recent dose history for one medicine. */
export const history = query({
  args: { medId: v.id("medications") },
  handler: async (ctx, { medId }) => {
    await coupleIds(ctx);
    const m = await ctx.db.get(medId);
    if (!m) return [];
    const list = await readers(ctx, "both", "meds");
    const r = list.find((x) => x.userId === m.ownerId);
    if (!r || r.level !== "full") throw new Error("Not shared with you");
    const logs = await ctx.db
      .query("doseLogs")
      .withIndex("by_med_slot", (q) => q.eq("medId", medId))
      .collect();
    return logs.sort((a, b) => b.at - a.at).slice(0, 120);
  },
});

/* ---------------- Home medicine cabinet (shared) ---------------- */

const cabinetFields = {
  name: v.string(),
  qty: v.optional(v.string()),
  expiry: v.optional(v.string()),
  kind: v.union(v.literal("medicine"), v.literal("firstaid"), v.literal("device")),
  notes: v.optional(v.string()),
};

function checkExpiry(expiry?: string) {
  if (expiry && !/^\d{4}-(0[1-9]|1[0-2])$/.test(expiry)) throw new Error("Expiry looks like 2027-03");
}

export const cabinet = query({
  args: {},
  handler: async (ctx) => {
    await coupleIds(ctx);
    const items = await ctx.db.query("cabinetItems").collect();
    return items.sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
  },
});

export const cabinetAdd = mutation({
  args: cabinetFields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    checkExpiry(args.expiry);
    return await ctx.db.insert("cabinetItems", {
      ...args,
      name: requireText(args.name, "Name", 120),
      qty: trimOrUndef(args.qty),
      notes: trimOrUndef(args.notes),
      addedBy: me,
    });
  },
});

export const cabinetUpdate = mutation({
  args: { id: v.id("cabinetItems"), ...cabinetFields },
  handler: async (ctx, { id, ...args }) => {
    await coupleIds(ctx);
    if (!(await ctx.db.get(id))) throw new Error("Item not found");
    checkExpiry(args.expiry);
    await ctx.db.patch(id, { ...args, name: requireText(args.name, "Name", 120), qty: trimOrUndef(args.qty), notes: trimOrUndef(args.notes) });
  },
});

export const cabinetRemove = mutation({
  args: { id: v.id("cabinetItems") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});


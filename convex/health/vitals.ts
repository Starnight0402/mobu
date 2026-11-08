import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { coupleIds, ownDoc, profileOf, readers, trimOrUndef } from "./access";
import { DAY_MS } from "./time";
import { flowV, vitalExtraV, vitalTypeV, whoV } from "./validators";

type VitalType = Doc<"vitals">["type"];

/** Plausible ranges: catches a typo (720 for 72) before it lands on a chart. */
const RANGE: Partial<Record<VitalType, [number, number]>> = {
  bp: [50, 260],
  heartRate: [25, 240],
  restingHr: [25, 200],
  hrv: [1, 300],
  spo2: [50, 100],
  respRate: [4, 60],
  temp: [30, 45],
  glucose: [20, 700],
  weight: [2, 400],
  height: [30, 260],
  bodyFat: [2, 75],
  waist: [30, 250],
  vo2max: [5, 100],
  steps: [0, 200_000],
  water: [0, 15],
};

export const UNIT: Record<VitalType, string> = {
  bp: "mmHg",
  heartRate: "bpm",
  restingHr: "bpm",
  hrv: "ms",
  spo2: "%",
  respRate: "/min",
  temp: "°C",
  glucose: "mg/dL",
  weight: "kg",
  height: "cm",
  bodyFat: "%",
  waist: "cm",
  vo2max: "ml/kg/min",
  steps: "steps",
  distance: "km",
  calories: "kcal",
  activeMinutes: "min",
  water: "L",
  sleep: "h",
  exercise: "min",
};

export const series = query({
  args: { who: whoV, type: vitalTypeV, days: v.number() },
  handler: async (ctx, { who, type, days }) => {
    const since = Date.now() - Math.min(days, 3650) * DAY_MS;
    const out = [];
    for (const reader of await readers(ctx, who, "vitals")) {
      const rows = await ctx.db
        .query("vitals")
        .withIndex("by_owner_type_time", (q) => q.eq("ownerId", reader.userId).eq("type", type).gte("time", since))
        .order("desc")
        .take(2000);
      out.push({ userId: reader.userId, isMe: reader.isMe, points: rows.reverse() });
    }
    return out;
  },
});

const SNAPSHOT_TYPES: VitalType[] = [
  "bp",
  "restingHr",
  "heartRate",
  "hrv",
  "spo2",
  "respRate",
  "temp",
  "glucose",
  "weight",
  "height",
  "bodyFat",
  "waist",
  "vo2max",
  "steps",
  "distance",
  "calories",
  "activeMinutes",
  "water",
  "sleep",
  "exercise",
];

/** Latest reading of every type, plus 30-day averages, per person. */
export const latest = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const since30 = Date.now() - 30 * DAY_MS;
    const out = [];
    for (const reader of await readers(ctx, who, "vitals")) {
      const latestByType: Partial<Record<VitalType, Doc<"vitals">>> = {};
      const avg30: Partial<Record<VitalType, { value: number; value2?: number; n: number }>> = {};
      for (const type of SNAPSHOT_TYPES) {
        const recent = await ctx.db
          .query("vitals")
          .withIndex("by_owner_type_time", (q) => q.eq("ownerId", reader.userId).eq("type", type).gte("time", since30))
          .collect();
        const last =
          recent[recent.length - 1] ??
          (await ctx.db
            .query("vitals")
            .withIndex("by_owner_type_time", (q) => q.eq("ownerId", reader.userId).eq("type", type))
            .order("desc")
            .first());
        if (last) latestByType[type] = last;
        if (recent.length) {
          const n = recent.length;
          const value = recent.reduce((s, r) => s + r.value, 0) / n;
          const v2 = recent.filter((r) => r.value2 != null);
          avg30[type] = {
            value: Math.round(value * 10) / 10,
            value2: v2.length ? Math.round(v2.reduce((s, r) => s + (r.value2 as number), 0) / v2.length) : undefined,
            n,
          };
        }
      }
      const profile = await profileOf(ctx, reader.userId);
      out.push({
        userId: reader.userId,
        isMe: reader.isMe,
        latest: latestByType,
        avg30,
        heightCm: profile?.heightCm ?? latestByType.height?.value,
        healthConnectAt: profile?.healthConnectAt,
      });
    }
    return out;
  },
});

function checkRange(type: VitalType, value: number, value2?: number) {
  const r = RANGE[type];
  if (!Number.isFinite(value)) throw new Error("Enter a number");
  if (r && (value < r[0] || value > r[1])) throw new Error(`That doesn't look right for ${type}: ${value}`);
  if (type === "bp") {
    if (value2 == null || value2 < 30 || value2 > 160) throw new Error("Enter both numbers, like 120/80");
    if (value2 >= value) throw new Error("The top number should be higher than the bottom one");
  }
}

export const add = mutation({
  args: {
    type: vitalTypeV,
    value: v.number(),
    value2: v.optional(v.number()),
    time: v.optional(v.number()),
    context: v.optional(v.string()),
    extra: v.optional(vitalExtraV),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    checkRange(args.type, args.value, args.value2);
    const time = args.time ?? Date.now();
    if (time > Date.now() + 5 * 60_000) throw new Error("That time is in the future");
    return await ctx.db.insert("vitals", {
      ownerId: me,
      type: args.type,
      value: args.value,
      value2: args.value2,
      unit: UNIT[args.type],
      time,
      context: trimOrUndef(args.context),
      source: "manual",
      extra: args.extra,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("vitals") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Reading");
    await ctx.db.delete(id);
  },
});

const hcVitalV = v.object({
  hcId: v.string(),
  type: vitalTypeV,
  time: v.number(),
  value: v.number(),
  value2: v.optional(v.number()),
  context: v.optional(v.string()),
  source: v.string(),
  extra: v.optional(vitalExtraV),
});

const hcCycleV = v.object({
  date: v.string(),
  flow: v.optional(flowV),
  bbt: v.optional(v.number()),
  ovulationTest: v.optional(
    v.union(v.literal("positive"), v.literal("high"), v.literal("negative"), v.literal("inconclusive")),
  ),
  mucus: v.optional(
    v.union(v.literal("dry"), v.literal("sticky"), v.literal("creamy"), v.literal("watery"), v.literal("eggwhite")),
  ),
  intimacy: v.optional(v.union(v.literal("protected"), v.literal("unprotected"))),
});

/**
 * A batch read from Android Health Connect. Upserts on Health Connect's own
 * record id, so syncing the same week twice changes nothing. Readings Mobu
 * wrote itself are skipped by the client (they're already here as manual).
 */
export const importHealthConnect = mutation({
  args: { vitals: v.array(hcVitalV), cycle: v.optional(v.array(hcCycleV)), done: v.optional(v.boolean()) },
  handler: async (ctx, { vitals, cycle, done }) => {
    const { me } = await coupleIds(ctx);
    if (vitals.length > 400 || (cycle?.length ?? 0) > 400) throw new Error("Send at most 400 items at a time");
    let added = 0;
    let updated = 0;
    for (const item of vitals) {
      const r = RANGE[item.type];
      if (!Number.isFinite(item.value) || (r && (item.value < r[0] || item.value > r[1]))) continue;
      const existing = await ctx.db
        .query("vitals")
        .withIndex("by_owner_hc", (q) => q.eq("ownerId", me).eq("hcId", item.hcId))
        .unique();
      const doc = { ...item, ownerId: me, unit: UNIT[item.type] };
      if (existing) {
        if (existing.value !== item.value || existing.value2 !== item.value2 || existing.time !== item.time) {
          await ctx.db.patch(existing._id, doc);
          updated++;
        }
      } else {
        await ctx.db.insert("vitals", doc);
        added++;
      }
    }
    for (const day of cycle ?? []) {
      const existing = await ctx.db
        .query("cycleLogs")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", me).eq("date", day.date))
        .unique();
      const fields = Object.fromEntries(Object.entries(day).filter(([k, val]) => k !== "date" && val !== undefined));
      if (existing) {
        // What you logged by hand in Mobu wins over a synced value.
        const fill = Object.fromEntries(
          Object.entries(fields).filter(([k]) => existing[k as keyof typeof existing] === undefined),
        );
        if (Object.keys(fill).length) await ctx.db.patch(existing._id, fill);
      } else {
        await ctx.db.insert("cycleLogs", { ownerId: me, date: day.date, ...fields, source: "Health Connect" });
      }
    }
    if (done) {
      const p = await profileOf(ctx, me);
      if (p) await ctx.db.patch(p._id, { healthConnectAt: Date.now() });
      else await ctx.db.insert("healthProfiles", { ownerId: me, healthConnectAt: Date.now() });
    }
    return { added, updated };
  },
});

/** Manual readings since a time, for writing back to Health Connect. */
export const manualSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const { me } = await coupleIds(ctx);
    const out: Doc<"vitals">[] = [];
    for (const type of ["bp", "glucose", "weight", "temp", "spo2", "height", "bodyFat"] as VitalType[]) {
      out.push(
        ...(await ctx.db
          .query("vitals")
          .withIndex("by_owner_type_time", (q) => q.eq("ownerId", me).eq("type", type).gte("time", since))
          .collect()),
      );
    }
    return out.filter((r) => r.source === "manual");
  },
});

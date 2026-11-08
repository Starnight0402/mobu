import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { mutation, query, QueryCtx } from "../_generated/server";
import { coupleIds, coupleTimeZone, ownDoc, readers, requireText, trimOrUndef } from "./access";
import { DAY_MS, localDate } from "./time";
import { whoV } from "./validators";

function forLevel(s: Doc<"symptoms">, full: boolean) {
  return full ? s : { ...s, notes: undefined, triggers: undefined, photoStorageId: undefined };
}

export const list = query({
  args: { who: whoV, days: v.number() },
  handler: async (ctx, { who, days }) => {
    const since = Date.now() - Math.min(days, 3650) * DAY_MS;
    const out = [];
    for (const reader of await readers(ctx, who, "symptoms")) {
      const rows = await ctx.db
        .query("symptoms")
        .withIndex("by_owner_at", (q) => q.eq("ownerId", reader.userId).gte("at", since))
        .order("desc")
        .take(500);
      for (const s of rows) {
        const full = reader.level === "full";
        out.push({
          ...forLevel(s, full),
          isMine: reader.isMe,
          photoUrl: full && s.photoStorageId ? await ctx.storage.getUrl(s.photoStorageId) : null,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

export const log = mutation({
  args: {
    name: v.string(),
    severity: v.number(),
    at: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    bodyParts: v.optional(v.array(v.string())),
    triggers: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    episodeId: v.optional(v.id("episodes")),
    photoStorageId: v.optional(v.id("_storage")),
    series: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (!(args.severity >= 0 && args.severity <= 10)) throw new Error("Severity is 0 to 10");
    if (args.episodeId) await ownDoc(ctx, await ctx.db.get(args.episodeId), "Illness");
    return await ctx.db.insert("symptoms", {
      ...args,
      ownerId: me,
      name: requireText(args.name, "Symptom", 80),
      severity: Math.round(args.severity),
      at: args.at ?? Date.now(),
      notes: trimOrUndef(args.notes),
      series: trimOrUndef(args.series),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("symptoms") },
  handler: async (ctx, { id }) => {
    const s = await ownDoc(ctx, await ctx.db.get(id), "Symptom");
    if (s.photoStorageId) await ctx.storage.delete(s.photoStorageId);
    await ctx.db.delete(id);
  },
});

async function sleepByNight(ctx: QueryCtx, ownerId: Id<"users">, since: number, tz: string) {
  // A sleep session belongs to the date it ended on (the morning after).
  const rows = await ctx.db
    .query("vitals")
    .withIndex("by_owner_type_time", (q) => q.eq("ownerId", ownerId).eq("type", "sleep").gte("time", since))
    .collect();
  const out = new Map<string, number>();
  for (const r of rows) {
    const d = localDate(r.extra?.endTime ?? r.time, tz);
    out.set(d, (out.get(d) ?? 0) + r.value);
  }
  return out;
}

/**
 * Patterns worked out from your own logs. Only simple, checkable ones: how
 * often a symptom came up, and whether it tended to follow short sleep or low
 * water. Nothing is inferred beyond what the numbers say.
 */
export const patterns = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const tz = await coupleTimeZone(ctx);
    const since = Date.now() - 60 * DAY_MS;
    const out = [];
    for (const reader of await readers(ctx, who, "symptoms")) {
      if (reader.level !== "full") continue;
      const rows = await ctx.db
        .query("symptoms")
        .withIndex("by_owner_at", (q) => q.eq("ownerId", reader.userId).gte("at", since))
        .collect();
      const byName = new Map<string, Doc<"symptoms">[]>();
      for (const s of rows) byName.set(s.name.toLowerCase(), [...(byName.get(s.name.toLowerCase()) ?? []), s]);
      const sleep = await sleepByNight(ctx, reader.userId, since - DAY_MS, tz);
      const water = await ctx.db
        .query("vitals")
        .withIndex("by_owner_type_time", (q) => q.eq("ownerId", reader.userId).eq("type", "water").gte("time", since))
        .collect();
      const waterByDay = new Map<string, number>();
      for (const w of water) {
        const d = localDate(w.time, tz);
        waterByDay.set(d, (waterByDay.get(d) ?? 0) + w.value);
      }
      const notes: string[] = [];
      for (const [, list] of [...byName.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3)) {
        if (list.length < 3) continue;
        const name = list[0].name;
        const days = [...new Set(list.map((s) => localDate(s.at, tz)))];
        let note = `${name}: ${list.length} times in the last 60 days.`;
        const withSleep = days.filter((d) => sleep.has(d));
        if (withSleep.length >= 3) {
          const short = withSleep.filter((d) => (sleep.get(d) ?? 99) < 6).length;
          if (short / withSleep.length >= 0.6) note += ` ${short} of ${withSleep.length} came after a night under 6 hours of sleep.`;
        }
        const withWater = days.filter((d) => waterByDay.has(d));
        if (withWater.length >= 3) {
          const low = withWater.filter((d) => (waterByDay.get(d) ?? 99) < 1.5).length;
          if (low / withWater.length >= 0.6) note += ` ${low} of ${withWater.length} were on days with under 1.5 L of water.`;
        }
        notes.push(note);
      }
      out.push({ userId: reader.userId, isMe: reader.isMe, notes });
    }
    return out;
  },
});

/* ---------------- Illness episodes ---------------- */

export const episodes = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const out = [];
    for (const reader of await readers(ctx, who, "symptoms")) {
      const rows = await ctx.db
        .query("episodes")
        .withIndex("by_owner_start", (q) => q.eq("ownerId", reader.userId))
        .order("desc")
        .take(100);
      for (const e of rows) {
        const temps = await ctx.db
          .query("careLogs")
          .withIndex("by_episode_at", (q) => q.eq("episodeId", e._id))
          .collect();
        out.push({
          ...e,
          notes: reader.level === "full" ? e.notes : undefined,
          isMine: reader.isMe,
          temps: temps.filter((t) => t.kind === "temp" && t.value != null).map((t) => ({ at: t.at, value: t.value as number })),
          medCount: temps.filter((t) => t.kind === "med").length,
        });
      }
    }
    return out.sort((a, b) => b.start - a.start);
  },
});

export const startEpisode = mutation({
  args: { title: v.string(), start: v.optional(v.number()), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.insert("episodes", {
      ownerId: me,
      title: requireText(args.title, "Name"),
      start: args.start ?? Date.now(),
      status: "ongoing",
      careMode: false,
      notes: trimOrUndef(args.notes),
    });
  },
});

export const updateEpisode = mutation({
  args: {
    id: v.id("episodes"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    resolved: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, title, notes, resolved }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Illness");
    await ctx.db.patch(id, {
      ...(title !== undefined ? { title: requireText(title, "Name") } : {}),
      ...(notes !== undefined ? { notes: trimOrUndef(notes) } : {}),
      ...(resolved !== undefined
        ? resolved
          ? { status: "resolved" as const, end: Date.now(), careMode: false }
          : { status: "ongoing" as const, end: undefined }
        : {}),
    });
  },
});

export const removeEpisode = mutation({
  args: { id: v.id("episodes") },
  handler: async (ctx, { id }) => {
    const e = await ownDoc(ctx, await ctx.db.get(id), "Illness");
    for (const l of await ctx.db
      .query("careLogs")
      .withIndex("by_episode_at", (q) => q.eq("episodeId", id))
      .collect()) {
      await ctx.db.delete(l._id);
    }
    for (const s of await ctx.db
      .query("symptoms")
      .withIndex("by_owner_at", (q) => q.eq("ownerId", e.ownerId).gte("at", e.start - DAY_MS))
      .collect()) {
      if (s.episodeId === id) await ctx.db.patch(s._id, { episodeId: undefined });
    }
    await ctx.db.delete(id);
  },
});

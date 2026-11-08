import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { coupleIds, coupleTimeZone, profileOf, readers, trimOrUndef } from "./access";
import { summarise } from "./cycleLogic";
import { addDays, isDate, localDate } from "./time";
import { flowV, whoV } from "./validators";

/*
 * Cycle tracking, for whichever of you switches it on. The partner sees it at
 * the owner's chosen level: everything, dates only (periods and predictions,
 * no symptoms or intimacy), or nothing.
 */

export const overview = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const today = localDate(Date.now(), await coupleTimeZone(ctx));
    const since = addDays(today, -400);
    const out = [];
    for (const reader of await readers(ctx, who, "cycle")) {
      const profile = await profileOf(ctx, reader.userId);
      if (!profile?.cycleEnabled) {
        if (reader.isMe) out.push({ userId: reader.userId, isMe: true, enabled: false as const });
        continue;
      }
      const logs = await ctx.db
        .query("cycleLogs")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", reader.userId).gte("date", since))
        .collect();
      const full = reader.level === "full";
      out.push({
        userId: reader.userId,
        isMe: reader.isMe,
        enabled: true as const,
        mode: profile.cycleMode ?? "track",
        level: reader.level,
        summary: summarise(logs, today),
        logs: logs.map((l) =>
          full
            ? l
            : { _id: l._id, date: l.date, flow: l.flow, ownerId: l.ownerId, _creationTime: l._creationTime },
        ),
        today,
      });
    }
    return out;
  },
});

export const logDay = mutation({
  args: {
    date: v.string(),
    flow: v.optional(flowV),
    symptoms: v.optional(v.array(v.string())),
    bbt: v.optional(v.number()),
    ovulationTest: v.optional(
      v.union(v.literal("positive"), v.literal("high"), v.literal("negative"), v.literal("inconclusive")),
    ),
    mucus: v.optional(
      v.union(v.literal("dry"), v.literal("sticky"), v.literal("creamy"), v.literal("watery"), v.literal("eggwhite")),
    ),
    intimacy: v.optional(v.union(v.literal("protected"), v.literal("unprotected"))),
    contraception: v.optional(v.string()),
    notes: v.optional(v.string()),
    clear: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { date, clear, ...fields }) => {
    const { me } = await coupleIds(ctx);
    if (!isDate(date)) throw new Error("That date isn't valid");
    const today = localDate(Date.now(), await coupleTimeZone(ctx));
    if (date > addDays(today, 1)) throw new Error("You can't log a future day");
    if (fields.bbt != null && !(fields.bbt >= 34 && fields.bbt <= 39)) throw new Error("Temperature in °C, like 36.5");
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
    if (patch.notes !== undefined) patch.notes = trimOrUndef(patch.notes as string);
    for (const k of clear ?? []) patch[k] = undefined;
    const existing = await ctx.db
      .query("cycleLogs")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", me).eq("date", date))
      .unique();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("cycleLogs", { ownerId: me, date, ...patch, source: "manual" });
  },
});

/** Start a period on `date` and mark the following days, for a quick log. */
export const logPeriod = mutation({
  args: { start: v.string(), days: v.number() },
  handler: async (ctx, { start, days }) => {
    const { me } = await coupleIds(ctx);
    if (!isDate(start)) throw new Error("That date isn't valid");
    const n = Math.min(Math.max(1, Math.round(days)), 10);
    for (let i = 0; i < n; i++) {
      const date = addDays(start, i);
      const flow = i === 0 || i === 1 ? "medium" : i < n - 1 ? "light" : "light";
      const existing = await ctx.db
        .query("cycleLogs")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", me).eq("date", date))
        .unique();
      if (existing) {
        if (!existing.flow || existing.flow === "none") await ctx.db.patch(existing._id, { flow });
      } else await ctx.db.insert("cycleLogs", { ownerId: me, date, flow, source: "manual" });
    }
  },
});

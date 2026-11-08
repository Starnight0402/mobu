import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { displayName } from "../authHelpers";
import { coupleIds, ownDoc, readers, trimOrUndef } from "./access";
import { DAY_MS, isDate } from "./time";
import { whoV } from "./validators";
import { GAD7, PHQ9 } from "./mindQuestions";

/*
 * Mood (from the existing daily Logs), PHQ-9 and GAD-7 check-ins, and therapy
 * sessions. Hidden from the partner unless the owner shares it; "summary"
 * shares mood only.
 */

export function band(kind: "phq9" | "gad7", score: number): string {
  if (score <= 4) return "minimal";
  if (score <= 9) return "mild";
  if (score <= 14) return "moderate";
  if (kind === "phq9" && score <= 19) return "moderately severe";
  return "severe";
}

export const overview = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const since = Date.now() - 30 * DAY_MS;
    const out = [];
    for (const reader of await readers(ctx, who, "mind")) {
      const user = await ctx.db.get(reader.userId);
      const name = user ? displayName(user) : "";
      const moods = (await ctx.db.query("tracking").withIndex("by_type", (q) => q.eq("type", "mood")).collect())
        .filter((t) => t.user === name && t._creationTime >= since)
        .map((t) => ({ at: t._creationTime, value: t.value }));
      const full = reader.level === "full";
      const checkins = full
        ? (await ctx.db.query("checkins").withIndex("by_owner_at", (q) => q.eq("ownerId", reader.userId)).collect())
            .sort((a, b) => b.at - a.at)
            .map((c) => ({ ...c, band: band(c.kind, c.score) }))
        : [];
      const sessions = full
        ? (await ctx.db.query("therapySessions").withIndex("by_owner", (q) => q.eq("ownerId", reader.userId)).collect()).sort((a, b) =>
            b.date.localeCompare(a.date),
          )
        : [];
      out.push({ userId: reader.userId, isMe: reader.isMe, level: reader.level, moods, checkins, sessions });
    }
    return out;
  },
});

export const addCheckin = mutation({
  args: { kind: v.union(v.literal("phq9"), v.literal("gad7")), answers: v.array(v.number()) },
  handler: async (ctx, { kind, answers }) => {
    const { me } = await coupleIds(ctx);
    const n = kind === "phq9" ? PHQ9.length : GAD7.length;
    if (answers.length !== n || !answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)) {
      throw new Error("Answer every question");
    }
    const score = answers.reduce((s, a) => s + a, 0);
    await ctx.db.insert("checkins", { ownerId: me, kind, answers, score, at: Date.now() });
    // The last PHQ-9 question is about self-harm; any answer above "not at all"
    // gets a gentle prompt in the UI, which reads this back.
    return { score, band: band(kind, score), selfHarm: kind === "phq9" && answers[8] > 0 };
  },
});

export const removeCheckin = mutation({
  args: { id: v.id("checkins") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Check-in");
    await ctx.db.delete(id);
  },
});

export const addSession = mutation({
  args: { date: v.string(), with: v.optional(v.string()), notes: v.optional(v.string()), homework: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (!isDate(args.date)) throw new Error("That date isn't valid");
    return await ctx.db.insert("therapySessions", {
      ownerId: me,
      date: args.date,
      with: trimOrUndef(args.with),
      notes: trimOrUndef(args.notes),
      homework: trimOrUndef(args.homework),
    });
  },
});

export const removeSession = mutation({
  args: { id: v.id("therapySessions") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Session");
    await ctx.db.delete(id);
  },
});

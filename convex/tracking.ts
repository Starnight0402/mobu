import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { displayName, requireUser, requireUserId } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("tracking").order("desc").take(100);
  },
});

export const add = mutation({
  args: {
    type: v.union(
      v.literal("money"),
      v.literal("mood"),
      v.literal("health"),
      v.literal("food"),
      v.literal("activity"),
      v.literal("location"),
    ),
    value: v.number(),
    category: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tracking", { ...args, user: displayName(user) });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const allTracking = await ctx.db.query("tracking").collect();
    const mood = allTracking.filter((t) => t.type === "mood");
    const activities = allTracking.filter((t) => t.type === "activity");
    const expenses = await ctx.db.query("expenses").collect();

    const totalMoney = expenses.reduce((sum, e) => sum + e.amount, 0);
    const avgMood = mood.length > 0 ? mood.reduce((sum, t) => sum + t.value, 0) / mood.length : 0;

    const activityCounts = new Map<string, number>();
    for (const a of activities) {
      const key = a.category || "Other";
      activityCounts.set(key, (activityCounts.get(key) || 0) + 1);
    }

    const totalMemories = (await ctx.db.query("memories").collect()).length;

    return {
      totalMoney,
      avgMood,
      activities: Array.from(activityCounts.entries()).map(([category, count]) => ({ category, count })),
      totalMemories,
      connectionScore: 84,
    };
  },
});

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Consecutive days (ending today or yesterday) where entries from both
// partners exist -- a Duolingo-style streak, but for showing up for each
// other instead of a language app.
export const streak = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const allTracking = await ctx.db.query("tracking").collect();

    const usersByDay = new Map<string, Set<string>>();
    for (const t of allTracking) {
      const key = dayKey(t._creationTime);
      if (!usersByDay.has(key)) usersByDay.set(key, new Set());
      usersByDay.get(key)!.add(t.user);
    }

    let streakCount = 0;
    const cursor = new Date();
    // Allow today to still be "in progress" without breaking the streak.
    if ((usersByDay.get(dayKey(cursor.getTime()))?.size ?? 0) < 2) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while ((usersByDay.get(dayKey(cursor.getTime()))?.size ?? 0) >= 2) {
      streakCount++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { days: streakCount };
  },
});

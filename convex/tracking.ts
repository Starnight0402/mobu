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
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tracking", { ...args, user: displayName(user) });
  },
});

// One-tap "we're here" check-in: logs a location-type entry with GPS coords
// for today, used by the togetherness calendar to tell in-person days from
// long-distance days.
export const checkIn = mutation({
  args: { lat: v.number(), lng: v.number(), place: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tracking", {
      type: "location",
      value: 1,
      category: args.place ?? "Check-in",
      lat: args.lat,
      lng: args.lng,
      user: displayName(user),
    });
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

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const TOGETHER_RADIUS_KM = 0.5;

// Per-day status for the given month, based on location check-ins:
// 'together' (both partners checked in within 500m), 'apart' (both checked
// in but far apart -- long distance that day), or 'none' (no check-in data).
export const togetherness = query({
  args: { year: v.number(), month: v.number() }, // month: 0-11
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const locations = await ctx.db
      .query("tracking")
      .withIndex("by_type", (q) => q.eq("type", "location"))
      .collect();

    const byDay = new Map<number, { user: string; lat: number; lng: number }[]>();
    for (const entry of locations) {
      if (entry.lat === undefined || entry.lng === undefined) continue;
      const d = new Date(entry._creationTime);
      if (d.getFullYear() !== args.year || d.getMonth() !== args.month) continue;
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push({ user: entry.user, lat: entry.lat, lng: entry.lng });
    }

    const result: Record<number, "together" | "apart" | "none"> = {};
    for (const [day, points] of byDay) {
      const users = new Set(points.map((p) => p.user));
      if (users.size < 2) {
        result[day] = "none";
        continue;
      }
      const distinctUsers = [...users];
      const a = points.find((p) => p.user === distinctUsers[0])!;
      const b = points.find((p) => p.user === distinctUsers[1])!;
      result[day] = haversineKm(a, b) <= TOGETHER_RADIUS_KM ? "together" : "apart";
    }
    return result;
  },
});

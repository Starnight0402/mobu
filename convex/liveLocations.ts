import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const share = mutation({
  args: { lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()), sharingUntil: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("liveLocations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("liveLocations", { userId, ...args });
    }
  },
});

export const stopSharing = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("liveLocations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// Both partners' current (non-expired) shared locations.
export const both = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db.query("liveLocations").collect();
    const now = Date.now();
    const active = all.filter((l) => l.sharingUntil > now);
    return {
      mine: active.find((l) => l.userId === userId) ?? null,
      partner: active.find((l) => l.userId !== userId) ?? null,
    };
  },
});

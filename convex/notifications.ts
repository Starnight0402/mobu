import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
  },
});

/**
 * Unread counts keyed by the screen each notification points at, so the nav
 * can badge the specific tab rather than showing one undifferentiated dot.
 */
export const unread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
      .collect();

    const byTab: Record<string, number> = {};
    for (const row of rows) {
      const tab = row.tab ?? "home";
      byTab[tab] = (byTab[tab] ?? 0) + 1;
    }
    return { total: rows.length, byTab };
  },
});

/** Clear the badge for one screen when you actually look at it. */
export const markTabRead = mutation({
  args: { tab: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      if ((row.tab ?? "home") === args.tab) {
        await ctx.db.patch(row._id, { readAt: now });
      }
    }
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch(row._id, { readAt: now });
    }
  },
});

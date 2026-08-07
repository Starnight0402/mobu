import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("capsules").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    type: v.union(
      v.literal("letter"),
      v.literal("photos"),
      v.literal("voice"),
      v.literal("video"),
    ),
    unlockDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return await ctx.db.insert("capsules", {
      title: args.title,
      type: args.type,
      unlockDate: args.unlockDate,
    });
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.get(userId);
  },
});

export const setName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Name can't be empty");
    await ctx.db.patch(userId, { name: trimmed });
  },
});

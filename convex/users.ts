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

// The other allowlisted account. Since sign-up only ever admits the two
// configured emails (see auth.ts), "the other user in the table" reliably
// means "my partner" — used for expense attribution, chat, and presence.
export const partner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db.query("users").collect();
    return all.find((u) => u._id !== userId) ?? null;
  },
});

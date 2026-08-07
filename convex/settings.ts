import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";

async function getValue(ctx: QueryCtx, key: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value;
}

async function setValue(ctx: MutationCtx, key: string, value: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { value });
  } else {
    await ctx.db.insert("settings", { key, value });
  }
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const currency = await getValue(ctx, "currency");
    const timezone = await getValue(ctx, "timezone");
    return {
      currency: currency ?? "USD",
      timezone: timezone ?? "UTC",
    };
  },
});

export const save = mutation({
  args: { currency: v.string(), timezone: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await setValue(ctx, "currency", args.currency);
    await setValue(ctx, "timezone", args.timezone);
  },
});

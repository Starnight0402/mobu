import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("expenses").order("desc").collect();
  },
});

export const add = mutation({
  args: {
    amount: v.number(),
    splitRatio: v.number(),
    category: v.string(),
    currency: v.string(),
    note: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(args.amount > 0)) throw new Error("Amount must be greater than 0");
    if (args.splitRatio < 0 || args.splitRatio > 100) throw new Error("Split ratio must be between 0 and 100");
    if (!args.category.trim()) throw new Error("Category can't be empty");
    return await ctx.db.insert("expenses", { ...args, payerId: userId, settled: false });
  },
});

// Net balance between the two partners across all unsettled expenses.
// youOwe / theyOwe are both non-negative; the frontend nets them for display.
export const balance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const allUsers = await ctx.db.query("users").collect();
    const unsettled = await ctx.db
      .query("expenses")
      .filter((q) => q.eq(q.field("settled"), false))
      .collect();

    const owedByUser = new Map<string, number>();
    for (const exp of unsettled) {
      const payerShare = exp.amount * (exp.splitRatio / 100);
      const otherShare = exp.amount - payerShare;
      const other = allUsers.find((u) => u._id !== exp.payerId);
      if (other) {
        owedByUser.set(other._id, (owedByUser.get(other._id) ?? 0) + otherShare);
      }
    }

    const partnerUser = allUsers.find((u) => u._id !== userId) ?? null;
    const youOwe = owedByUser.get(userId) ?? 0;
    const theyOwe = partnerUser ? (owedByUser.get(partnerUser._id) ?? 0) : 0;

    return {
      youOwe: Math.round(youOwe * 100) / 100,
      theyOwe: Math.round(theyOwe * 100) / 100,
      partnerName: partnerUser?.name || partnerUser?.email?.split("@")[0] || "your partner",
    };
  },
});

export const settleAll = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const unsettled = await ctx.db
      .query("expenses")
      .filter((q) => q.eq(q.field("settled"), false))
      .collect();
    for (const exp of unsettled) {
      await ctx.db.patch(exp._id, { settled: true });
    }
  },
});

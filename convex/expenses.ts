import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";

function personName(user: Doc<"users"> | null) {
  return user?.name || user?.email?.split("@")[0] || "Your partner";
}

/** What the non-payer owes the payer for a single expense. */
function lentAmount(expense: Doc<"expenses">) {
  const payerShare = expense.amount * (expense.splitRatio / 100);
  return Math.round((expense.amount - payerShare) * 100) / 100;
}

async function partnerOf(ctx: QueryCtx, userId: Id<"users">) {
  const all = await ctx.db.query("users").collect();
  return all.find((u) => u._id !== userId) ?? null;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("expenses").order("desc").collect();
    const users = await ctx.db.query("users").collect();
    const nameOf = (id: Id<"users">) => personName(users.find((u) => u._id === id) ?? null);

    return await Promise.all(
      rows.map(async (e) => ({
        ...e,
        spentAt: e.spentAt ?? e._creationTime,
        payerName: nameOf(e.payerId),
        paidByMe: e.payerId === userId,
        lent: lentAmount(e),
        // Signed from the viewer's perspective: positive means it moves the
        // balance in your favour.
        myDelta: e.payerId === userId ? lentAmount(e) : -lentAmount(e),
        receiptUrl: e.receiptStorageId ? await ctx.storage.getUrl(e.receiptStorageId) : null,
      })),
    );
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
    spentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(args.amount > 0)) throw new Error("Amount must be greater than 0");
    if (args.splitRatio < 0 || args.splitRatio > 100) {
      throw new Error("Split ratio must be between 0 and 100");
    }
    if (!args.category.trim()) throw new Error("Category can't be empty");
    return await ctx.db.insert("expenses", {
      ...args,
      category: args.category.trim(),
      payerId: userId,
      settled: false,
      spentAt: args.spentAt ?? Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("expenses"),
    amount: v.number(),
    splitRatio: v.number(),
    category: v.string(),
    currency: v.string(),
    note: v.optional(v.string()),
    spentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (!(args.amount > 0)) throw new Error("Amount must be greater than 0");
    if (args.splitRatio < 0 || args.splitRatio > 100) {
      throw new Error("Split ratio must be between 0 and 100");
    }
    if (!args.category.trim()) throw new Error("Category can't be empty");
    const { id, ...rest } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("That expense no longer exists");
    if (existing.settled) throw new Error("Settled expenses can't be edited");
    await ctx.db.patch(id, { ...rest, category: rest.category.trim() });
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const expense = await ctx.db.get(args.id);
    if (!expense) return;
    if (expense.receiptStorageId) {
      await ctx.storage.delete(expense.receiptStorageId);
    }
    await ctx.db.delete(args.id);
  },
});

/**
 * Net balance per currency. Positive `net` means your partner owes you.
 *
 * Amounts used to be summed across every currency as if ₹ and $ were
 * interchangeable; they're now kept in separate buckets.
 */
export const balance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const partner = await partnerOf(ctx, userId);
    const unsettled = await ctx.db
      .query("expenses")
      .withIndex("by_settled", (q) => q.eq("settled", false))
      .collect();

    const netByCurrency = new Map<string, number>();
    for (const expense of unsettled) {
      const lent = lentAmount(expense);
      const signed = expense.payerId === userId ? lent : -lent;
      netByCurrency.set(expense.currency, (netByCurrency.get(expense.currency) ?? 0) + signed);
    }

    const byCurrency = [...netByCurrency.entries()]
      .map(([currency, net]) => ({ currency, net: Math.round(net * 100) / 100 }))
      .filter((row) => Math.abs(row.net) > 0.005)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    return {
      byCurrency,
      partnerName: personName(partner),
      partnerId: partner?._id ?? null,
      unsettledCount: unsettled.length,
    };
  },
});

/**
 * Record that the outstanding balance in one currency was actually paid, then
 * close out the expenses it covered.
 */
export const settleUp = mutation({
  args: { currency: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const partner = await partnerOf(ctx, userId);
    if (!partner) throw new Error("There's nobody to settle up with yet");

    const unsettled = (
      await ctx.db
        .query("expenses")
        .withIndex("by_settled", (q) => q.eq("settled", false))
        .collect()
    ).filter((e) => e.currency === args.currency);

    if (unsettled.length === 0) throw new Error("Nothing to settle in that currency");

    let net = 0;
    for (const expense of unsettled) {
      const lent = lentAmount(expense);
      net += expense.payerId === userId ? lent : -lent;
    }
    net = Math.round(net * 100) / 100;

    const now = Date.now();
    if (Math.abs(net) > 0.005) {
      await ctx.db.insert("settlements", {
        // net > 0 means the partner owed you, so they're the one paying.
        fromUserId: net > 0 ? partner._id : userId,
        toUserId: net > 0 ? userId : partner._id,
        amount: Math.abs(net),
        currency: args.currency,
        note: args.note,
        settledAt: now,
      });
    }

    for (const expense of unsettled) {
      await ctx.db.patch(expense._id, { settled: true, settledAt: now });
    }
    return { amount: Math.abs(net), currency: args.currency };
  },
});

export const settlements = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("settlements").withIndex("by_settledAt").order("desc").take(50);
    const users = await ctx.db.query("users").collect();
    const nameOf = (id: Id<"users">) => personName(users.find((u) => u._id === id) ?? null);

    return rows.map((s) => ({
      ...s,
      fromName: nameOf(s.fromUserId),
      toName: nameOf(s.toUserId),
      paidByMe: s.fromUserId === userId,
    }));
  },
});

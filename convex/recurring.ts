import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, QueryCtx } from "./_generated/server";
import { partnerOf, requireUserId } from "./authHelpers";
import { displayNameOf, notifyUser } from "./notify";

/**
 * Expenses that repeat every month (rent, subscriptions, the maid). A rule
 * creates a normal expense on its day each month, paid by whoever set it up,
 * so everything downstream (balance, analytics, export) just sees expenses.
 */

// Offsets (hours) for the timezone names the Settings screen offers. "Today"
// has to be the couple's today, not the server's, or a 1st-of-the-month rule
// fires on the 31st for anyone east of UTC.
const TZ_OFFSET_HOURS: Record<string, number> = { UTC: 0, GMT: 0, EST: -5, PST: -8, IST: 5.5 };

async function localNow(ctx: QueryCtx) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "timezone"))
    .unique();
  const offset = TZ_OFFSET_HOURS[row?.value ?? "UTC"] ?? 0;
  const shifted = new Date(Date.now() + offset * 3_600_000);
  return {
    day: shifted.getUTCDate(),
    monthKey: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`,
    // Noon on that local day, expressed as a real timestamp.
    spentAt: Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12) - offset * 3_600_000,
  };
}

function personName(user: Doc<"users"> | null) {
  return displayNameOf(user);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rules = await ctx.db.query("recurringExpenses").collect();
    const users = await ctx.db.query("users").collect();
    return rules
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
      .map((r) => ({
        ...r,
        payerName: personName(users.find((u) => u._id === r.payerId) ?? null),
        paidByMe: r.payerId === userId,
      }));
  },
});

export const add = mutation({
  args: {
    amount: v.number(),
    splitRatio: v.number(),
    category: v.string(),
    currency: v.string(),
    note: v.optional(v.string()),
    dayOfMonth: v.number(),
    // True when the caller has already recorded this month's expense by hand
    // (the "repeat monthly" box on the add form), so the first automatic one
    // is next month's rather than a duplicate today.
    startsNextMonth: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(args.amount > 0)) throw new Error("Amount must be greater than 0");
    if (args.splitRatio < 0 || args.splitRatio > 100) throw new Error("Split ratio must be between 0 and 100");
    if (!args.category.trim()) throw new Error("Category can't be empty");
    // Capped at 28 so "the 31st" never silently skips February.
    const dayOfMonth = Math.min(28, Math.max(1, Math.round(args.dayOfMonth)));
    const { startsNextMonth, ...rest } = args;
    const now = await localNow(ctx);
    return await ctx.db.insert("recurringExpenses", {
      ...rest,
      category: args.category.trim(),
      dayOfMonth,
      payerId: userId,
      active: true,
      lastCreatedFor: startsNextMonth === false ? undefined : now.monthKey,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("recurringExpenses"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await ctx.db.patch(args.id, { active: args.active });
  },
});

export const remove = mutation({
  args: { id: v.id("recurringExpenses") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await ctx.db.delete(args.id);
  },
});

/** Daily: turn every rule that has come due this month into a real expense. */
export const runDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = await localNow(ctx);
    const rules = await ctx.db.query("recurringExpenses").collect();
    for (const rule of rules) {
      if (!rule.active || rule.lastCreatedFor === now.monthKey || now.day < rule.dayOfMonth) continue;

      // Stamp first: if anything below throws, the transaction rolls back and
      // we retry tomorrow, but a rule can never create two in one month.
      await ctx.db.patch(rule._id, { lastCreatedFor: now.monthKey });
      await ctx.db.insert("expenses", {
        amount: rule.amount,
        payerId: rule.payerId,
        splitRatio: rule.splitRatio,
        category: rule.category,
        currency: rule.currency,
        note: rule.note ? `${rule.note} (monthly)` : "Monthly",
        settled: false,
        spentAt: now.spentAt,
      });

      const partner = await partnerOf(ctx, rule.payerId as Id<"users">);
      if (partner) {
        const payer = await ctx.db.get(rule.payerId);
        const owed = Math.round(rule.amount * (1 - rule.splitRatio / 100) * 100) / 100;
        await notifyUser(ctx, {
          userId: partner._id,
          kind: "expense",
          title: `${personName(payer)}'s monthly ${rule.category} was added`,
          body: `you owe ${rule.currency} ${owed.toFixed(2)}`,
          tab: "split",
        });
      }
    }
  },
});

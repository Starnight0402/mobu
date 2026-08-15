import { v } from "convex/values";
import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { Id } from "./_generated/dataModel";

async function partnerOf(ctx: MutationCtx, userId: Id<"users">) {
  const all = await ctx.db.query("users").collect();
  return all.find((u) => u._id !== userId) ?? null;
}

/**
 * Bulk-inserts a batch of Splitwise-derived rows. Parsing and the "who is
 * who" mapping already happened client-side (see src/lib/splitwiseImport.ts)
 * — this only validates and writes, in small batches called repeatedly from
 * the client so a large export never risks a single mutation's ~1s execution
 * budget.
 */
export const importBatch = mutation({
  args: {
    expenses: v.array(
      v.object({
        amount: v.number(),
        payerId: v.id("users"),
        splitRatio: v.number(),
        category: v.string(),
        currency: v.string(),
        note: v.optional(v.string()),
        spentAt: v.number(),
      }),
    ),
    settlements: v.array(
      v.object({
        fromUserId: v.id("users"),
        toUserId: v.id("users"),
        amount: v.number(),
        currency: v.string(),
        note: v.optional(v.string()),
        settledAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const partner = await partnerOf(ctx, userId);
    const validIds = new Set([userId, partner?._id].filter(Boolean));

    for (const e of args.expenses) {
      if (!validIds.has(e.payerId)) throw new Error("Import batch references an unknown payer");
      if (!(e.amount > 0)) continue;
      if (e.splitRatio < 0 || e.splitRatio > 100) continue;
      await ctx.db.insert("expenses", {
        ...e,
        category: e.category.trim() || "General",
        // Imported history is a record, not a live balance to replay — the
        // importer nets the whole export down to one "carried over" expense
        // per currency (sent through this same batch, unsettled) for
        // whatever's still actually outstanding.
        settled: true,
        settledAt: e.spentAt,
      });
    }

    for (const s of args.settlements) {
      if (!validIds.has(s.fromUserId) || !validIds.has(s.toUserId)) {
        throw new Error("Import batch references an unknown party");
      }
      if (!(s.amount > 0)) continue;
      await ctx.db.insert("settlements", s);
    }

    return { expenses: args.expenses.length, settlements: args.settlements.length };
  },
});

/**
 * The one exception to "everything imported is settled": a single unsettled
 * carryover expense per currency with a non-zero final balance, so the
 * app's existing balance/settle-up flow picks up exactly where Splitwise
 * left off.
 */
export const importCarryover = mutation({
  args: {
    rows: v.array(
      v.object({
        currency: v.string(),
        amount: v.number(),
        // The person who is owed money (payer, with splitRatio 0 — none of
        // it was "their" share, so the partner owes the full amount).
        owedToId: v.id("users"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const partner = await partnerOf(ctx, userId);
    const validIds = new Set([userId, partner?._id].filter(Boolean));

    for (const r of args.rows) {
      if (!validIds.has(r.owedToId)) throw new Error("Carryover references an unknown party");
      if (!(r.amount > 0)) continue;
      await ctx.db.insert("expenses", {
        amount: r.amount,
        payerId: r.owedToId,
        splitRatio: 0,
        category: "Splitwise carryover",
        currency: r.currency,
        note: "Opening balance imported from Splitwise",
        settled: false,
        spentAt: Date.now(),
      });
    }
  },
});

/**
 * One-off reset for redoing an import from scratch. Internal rather than a
 * client-callable mutation -- there's no UI for wiping every expense, this
 * is meant to be run once via the CLI, not exposed as an in-app button.
 */
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expenses = await ctx.db.query("expenses").collect();
    for (const e of expenses) {
      if (e.receiptStorageId) await ctx.storage.delete(e.receiptStorageId);
      await ctx.db.delete(e._id);
    }
    const settlements = await ctx.db.query("settlements").collect();
    for (const s of settlements) await ctx.db.delete(s._id);
    return { expenses: expenses.length, settlements: settlements.length };
  },
});

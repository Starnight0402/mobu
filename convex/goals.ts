import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { displayNameOf, notifyUser, partnerOf } from "./notify";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("goals").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    category: v.union(
      v.literal("cooking"),
      v.literal("travel"),
      v.literal("fitness"),
      v.literal("relaxation"),
      v.literal("adventure"),
    ),
    target: v.number(),
    current: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (!args.title.trim()) throw new Error("Title can't be empty");
    if (!(args.target > 0)) throw new Error("Target must be greater than 0");
    return await ctx.db.insert("goals", {
      title: args.title,
      category: args.category,
      target: args.target,
      current: args.current ?? 0,
      completed: false,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("goals") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");
    await ctx.db.delete(args.id);
  },
});

export const updateProgress = mutation({
  args: { id: v.id("goals"), current: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.current < 0) throw new Error("Progress can't be negative");
    const goal = await ctx.db.get(args.id);
    if (!goal) throw new Error("Goal not found");

    const completed = args.current >= goal.target;
    await ctx.db.patch(args.id, { current: args.current, completed });

    // Only on the transition, so nudging progress on a finished goal doesn't
    // re-congratulate anyone.
    if (completed && !goal.completed) {
      const partner = await partnerOf(ctx, userId);
      if (partner) {
        const actor = await ctx.db.get(userId);
        await notifyUser(ctx, {
          userId: partner._id,
          kind: "goal",
          title: "Goal complete 🎉",
          body: `${displayNameOf(actor)} finished "${goal.title}"`,
          tab: "goals",
        });
      }
    }
  },
});

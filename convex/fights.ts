import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserId } from "./authHelpers";
import { displayNameOf, notifyUser, partnerOf } from "./notify";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("fights").order("desc").take(200);
  },
});

export const create = mutation({
  args: {
    description: v.string(),
    severity: v.number(),
    initiatedBy: v.optional(v.id("users")),
    fightDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const description = args.description.trim();
    if (!description) throw new Error("Description can't be empty");
    if (args.severity < 1 || args.severity > 5) throw new Error("Severity must be between 1 and 5");

    const id = await ctx.db.insert("fights", {
      description,
      severity: args.severity,
      initiatedBy: args.initiatedBy,
      resolved: false,
      fightDate: args.fightDate,
    });

    const partner = await partnerOf(ctx, user._id);
    if (partner) {
      await notifyUser(ctx, {
        userId: partner._id,
        kind: "fight",
        title: `${displayNameOf(user)} logged a fight`,
        body: description.length > 80 ? description.slice(0, 77) + "…" : description,
        tab: "fights",
      });
    }
    return id;
  },
});

export const resolve = mutation({
  args: { id: v.id("fights"), resolution: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const fight = await ctx.db.get(args.id);
    if (!fight) throw new Error("Fight not found");
    await ctx.db.patch(args.id, {
      resolved: true,
      resolution: args.resolution?.trim() || undefined,
      resolvedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("fights") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const fight = await ctx.db.get(args.id);
    if (!fight) throw new Error("Fight not found");
    await ctx.db.delete(args.id);
  },
});

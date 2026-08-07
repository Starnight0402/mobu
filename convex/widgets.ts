import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

const sizeValidator = v.union(
  v.literal("small"),
  v.literal("wide"),
  v.literal("tall"),
  v.literal("large"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const widgets = await ctx.db.query("widgets").collect();
    return widgets.sort((a, b) => a.order - b.order);
  },
});

export const saveAll = mutation({
  args: {
    widgets: v.array(
      v.object({
        id: v.string(),
        size: sizeValidator,
        order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    for (const item of args.widgets) {
      const existing = await ctx.db
        .query("widgets")
        .withIndex("by_widgetId", (q) => q.eq("widgetId", item.id))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { size: item.size, order: item.order });
      } else {
        await ctx.db.insert("widgets", { widgetId: item.id, size: item.size, order: item.order });
      }
    }
  },
});

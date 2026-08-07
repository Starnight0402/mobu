import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

const categoryValidator = v.union(
  v.literal("photo"),
  v.literal("travel"),
  v.literal("food"),
  v.literal("milestone"),
  v.literal("event"),
);

const memoryFields = {
  title: v.string(),
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  category: v.optional(categoryValidator),
  location: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  cardWidth: v.optional(v.number()),
  cardHeight: v.optional(v.number()),
  textSize: v.optional(v.number()),
  fontFamily: v.optional(v.string()),
  textColor: v.optional(v.string()),
  bgColor: v.optional(v.string()),
  borderStyle: v.optional(v.string()),
  borderWidth: v.optional(v.number()),
  borderColor: v.optional(v.string()),
  shadowEffect: v.optional(v.string()),
  bgImageOverlay: v.optional(v.string()),
};

interface MemoryInput {
  title: string;
  description?: string;
  imageUrl?: string;
  category?: "photo" | "travel" | "food" | "milestone" | "event";
  location?: string;
  lat?: number;
  lng?: number;
  cardWidth?: number;
  cardHeight?: number;
  textSize?: number;
  fontFamily?: string;
  textColor?: string;
  bgColor?: string;
  borderStyle?: string;
  borderWidth?: number;
  borderColor?: string;
  shadowEffect?: string;
  bgImageOverlay?: string;
}

function withDefaults(args: MemoryInput) {
  return {
    ...args,
    category: args.category ?? "photo",
    cardWidth: args.cardWidth ?? 220,
    cardHeight: args.cardHeight ?? 280,
    textSize: args.textSize ?? 14,
    fontFamily: args.fontFamily ?? "'Caveat', cursive",
    textColor: args.textColor ?? "#000000",
    bgColor: args.bgColor ?? "#f8f8f8",
    borderStyle: args.borderStyle ?? "none",
    borderWidth: args.borderWidth ?? 0,
    borderColor: args.borderColor ?? "#000000",
    shadowEffect: args.shadowEffect ?? "xl",
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("memories").order("desc").collect();
  },
});

export const create = mutation({
  args: memoryFields,
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return await ctx.db.insert("memories", withDefaults(args));
  },
});

export const update = mutation({
  args: { id: v.id("memories"), ...memoryFields },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id, ...rest } = args;
    await ctx.db.patch(id, withDefaults(rest));
  },
});

export const remove = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await ctx.db.delete(args.id);
  },
});

import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
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
  imageStorageId: v.optional(v.id("_storage")),
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
  imageStorageId?: Doc<"memories">["imageStorageId"];
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

// Uploaded files (imageStorageId) take priority over a raw imageUrl string
// (external link or, for anything created before Phase 5, a base64 data URL).
async function resolveImageUrl(ctx: QueryCtx, memory: Doc<"memories">) {
  if (memory.imageStorageId) {
    const url = await ctx.storage.getUrl(memory.imageStorageId);
    if (url) return url;
  }
  return memory.imageUrl;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const memories = await ctx.db.query("memories").order("desc").collect();
    return await Promise.all(
      memories.map(async (m) => ({ ...m, imageUrl: await resolveImageUrl(ctx, m) })),
    );
  },
});

// Memories from this same month/day in a previous year -- surfaced on the
// Dashboard as a little "remember this?" callback.
export const onThisDay = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const today = new Date();
    const memories = await ctx.db.query("memories").collect();
    const matches = memories.filter((m) => {
      const d = new Date(m._creationTime);
      return (
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate() &&
        d.getFullYear() < today.getFullYear()
      );
    });
    return await Promise.all(matches.map(async (m) => ({ ...m, imageUrl: await resolveImageUrl(ctx, m) })));
  },
});

export const create = mutation({
  args: memoryFields,
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (!args.title.trim()) throw new Error("Title can't be empty");
    return await ctx.db.insert("memories", withDefaults(args));
  },
});

export const update = mutation({
  args: { id: v.id("memories"), ...memoryFields },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (!args.title.trim()) throw new Error("Title can't be empty");
    const { id, ...rest } = args;
    await ctx.db.patch(id, withDefaults(rest));
  },
});

export const remove = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const memory = await ctx.db.get(args.id);
    if (memory?.imageStorageId) {
      await ctx.storage.delete(memory.imageStorageId);
    }
    await ctx.db.delete(args.id);
  },
});

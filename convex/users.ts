import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";

async function withAvatarUrl(ctx: QueryCtx, user: Doc<"users">) {
  const avatarUrl = user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null;
  return { ...user, avatarUrl };
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    return user && (await withAvatarUrl(ctx, user));
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (user?.avatarStorageId && user.avatarStorageId !== args.storageId) {
      await ctx.storage.delete(user.avatarStorageId);
    }
    await ctx.db.patch(userId, { avatarStorageId: args.storageId });
  },
});

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (user?.avatarStorageId) {
      await ctx.storage.delete(user.avatarStorageId);
    }
    await ctx.db.patch(userId, { avatarStorageId: undefined });
  },
});

export const setName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Name can't be empty");
    await ctx.db.patch(userId, { name: trimmed });
  },
});

// The other allowlisted account. Since sign-up only ever admits the two
// configured emails (see auth.ts), "the other user in the table" reliably
// means "my partner" — used for expense attribution, chat, and presence.
export const partner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db.query("users").collect();
    const other = all.find((u) => u._id !== userId);
    return other ? await withAvatarUrl(ctx, other) : null;
  },
});

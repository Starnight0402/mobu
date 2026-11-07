import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { displayNameOf, notifyUser, partnerOf } from "./notify";

async function withUrls(ctx: QueryCtx, m: Doc<"messages">) {
  return {
    ...m,
    imageUrl: m.imageStorageId ? await ctx.storage.getUrl(m.imageStorageId) : null,
    voiceUrl: m.voiceStorageId ? await ctx.storage.getUrl(m.voiceStorageId) : null,
  };
}

const PAGE = 200;
const MAX_LIMIT = 5000;

/**
 * The newest `limit` messages, oldest first. The chat asks for a bigger
 * limit when you tap "Load earlier"; it stays one live query, so new messages,
 * reactions and deletions keep arriving without any paging bookkeeping.
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const me = await ctx.db.get(userId);
    // "Clear chat" only moves this user's starting line; nothing is removed.
    const clearedAt = me?.chatClearedAt ?? 0;
    const limit = Math.min(Math.max(Math.floor(args.limit ?? PAGE), 1), MAX_LIMIT);
    // One extra tells us whether anything older exists.
    const page = await ctx.db
      .query("messages")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", clearedAt))
      .order("desc")
      .take(limit + 1);
    const hasMore = page.length > limit;
    const visible = page
      .slice(0, limit)
      .filter((m) => !m.hiddenFor?.includes(userId))
      .reverse();
    return { messages: await Promise.all(visible.map((m) => withUrls(ctx, m))), hasMore };
  },
});

async function deleteFiles(ctx: MutationCtx, m: Doc<"messages">) {
  for (const id of [m.imageStorageId, m.voiceStorageId]) {
    if (id) await ctx.storage.delete(id);
  }
}

/** Unsend: your own message disappears for both of you, leaving a placeholder. */
export const deleteForEveryone = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const m = await ctx.db.get(id);
    if (!m || m.deletedAt) return;
    if (m.senderId !== userId) throw new Error("Only the sender can delete a message for everyone");
    await deleteFiles(ctx, m);
    await ctx.db.patch(id, {
      text: undefined,
      imageStorageId: undefined,
      voiceStorageId: undefined,
      voiceDuration: undefined,
      reaction: undefined,
      deletedAt: Date.now(),
    });
  },
});

/** Hides one message on your side only. */
export const deleteForMe = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const m = await ctx.db.get(id);
    if (!m) return;
    const hiddenFor = [...new Set([...(m.hiddenFor ?? []), userId])];
    // Once neither of you can see it, there's no reason to keep it (or its files).
    const partner = await partnerOf(ctx, userId);
    if (partner && hiddenFor.includes(partner._id)) {
      await deleteFiles(ctx, m);
      await ctx.db.delete(id);
      return;
    }
    await ctx.db.patch(id, { hiddenFor });
  },
});

/** Hides everything sent so far on your side; your partner's history is untouched. */
export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await ctx.db.patch(userId, { chatClearedAt: Date.now() });
  },
});

export const send = mutation({
  args: {
    text: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    voiceStorageId: v.optional(v.id("_storage")),
    voiceDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const senderId = await requireUserId(ctx);
    if (!args.text && !args.imageStorageId && !args.voiceStorageId) {
      throw new Error("Empty message");
    }
    const id = await ctx.db.insert("messages", { ...args, senderId });

    const partner = await partnerOf(ctx, senderId);
    if (partner) {
      const sender = await ctx.db.get(senderId);
      await notifyUser(ctx, {
        userId: partner._id,
        kind: "message",
        title: displayNameOf(sender),
        body: args.text
          ? args.text.slice(0, 140)
          : args.imageStorageId
            ? "📷 Sent a photo"
            : "🎤 Sent a voice note",
        tab: "chat",
      });
    }
    return id;
  },
});

// Cheap enough to keep subscribed app-wide: true while the partner has sent
// something this device hasn't acknowledged yet.
export const hasUndelivered = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const recent = await ctx.db.query("messages").order("desc").take(50);
    return recent.some((m) => m.senderId !== userId && m.deliveredAt === undefined);
  },
});

/** The recipient's app has received the messages (not necessarily opened chat). */
export const markDelivered = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const recent = await ctx.db.query("messages").order("desc").take(50);
    const now = Date.now();
    for (const m of recent) {
      if (m.senderId !== userId && m.deliveredAt === undefined) {
        await ctx.db.patch(m._id, { deliveredAt: now });
      }
    }
  },
});

export const markRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const unread = await ctx.db
      .query("messages")
      .filter((q) => q.and(q.neq(q.field("senderId"), userId), q.eq(q.field("readAt"), undefined)))
      .collect();
    const now = Date.now();
    for (const m of unread) {
      await ctx.db.patch(m._id, { readAt: now, deliveredAt: m.deliveredAt ?? now });
    }
  },
});

export const react = mutation({
  args: { id: v.id("messages"), reaction: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const m = await ctx.db.get(args.id);
    if (!m || m.deletedAt) return;
    await ctx.db.patch(args.id, { reaction: args.reaction });
  },
});

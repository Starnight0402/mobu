import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { displayNameOf, notifyUser, partnerOf } from "./notify";

async function withUrls(ctx: QueryCtx, m: Doc<"messages">) {
  return {
    ...m,
    imageUrl: m.imageStorageId ? await ctx.storage.getUrl(m.imageStorageId) : null,
    voiceUrl: m.voiceStorageId ? await ctx.storage.getUrl(m.voiceStorageId) : null,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const messages = await ctx.db.query("messages").order("desc").take(200);
    messages.reverse();
    return await Promise.all(messages.map((m) => withUrls(ctx, m)));
  },
});

export const send = mutation({
  args: {
    text: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    voiceStorageId: v.optional(v.id("_storage")),
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

export const markRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const unread = await ctx.db
      .query("messages")
      .filter((q) => q.and(q.neq(q.field("senderId"), userId), q.eq(q.field("readAt"), undefined)))
      .collect();
    for (const m of unread) {
      await ctx.db.patch(m._id, { readAt: Date.now() });
    }
  },
});

export const react = mutation({
  args: { id: v.id("messages"), reaction: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await ctx.db.patch(args.id, { reaction: args.reaction });
  },
});

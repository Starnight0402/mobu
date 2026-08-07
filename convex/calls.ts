import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const sendSignal = mutation({
  args: {
    callId: v.string(),
    toUserId: v.id("users"),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate"),
      v.literal("hangup"),
    ),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const fromUserId = await requireUserId(ctx);
    return await ctx.db.insert("callSignals", { ...args, fromUserId });
  },
});

// All signals for a call addressed to me, oldest first — drives the WebRTC
// offer/answer/ICE-candidate exchange once a call is underway.
export const signalsFor = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const signals = await ctx.db
      .query("callSignals")
      .withIndex("by_callId", (q) => q.eq("callId", args.callId))
      .collect();
    return signals.filter((s) => s.toUserId === userId);
  },
});

// The most recent "offer" addressed to me that hasn't been answered or
// hung up yet -- this is how the callee's client detects a ringing call
// without a separate "ring" event type.
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db.query("callSignals").order("desc").take(50);
    const forMe = all.filter((s) => s.toUserId === userId);
    const offer = forMe.find((s) => s.type === "offer");
    if (!offer) return null;
    const resolved = forMe.some(
      (s) => s.callId === offer.callId && (s.type === "answer" || s.type === "hangup"),
    );
    if (resolved) return null;
    return offer;
  },
});

export const endCall = mutation({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const signals = await ctx.db
      .query("callSignals")
      .withIndex("by_callId", (q) => q.eq("callId", args.callId))
      .collect();
    for (const s of signals) {
      await ctx.db.delete(s._id);
    }
  },
});

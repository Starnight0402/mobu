import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { requireUserId } from "./authHelpers";

// A ringing call nobody picks up shouldn't ring forever if the caller's tab
// died before it could clean up.
const RING_TIMEOUT_MS = 45_000;

const signalType = v.union(
  v.literal("offer"),
  v.literal("answer"),
  v.literal("ice-candidate"),
  v.literal("hangup"),
  v.literal("media-state"),
);

async function callByCallId(ctx: QueryCtx, callId: string) {
  return await ctx.db
    .query("calls")
    .withIndex("by_callId", (q) => q.eq("callId", callId))
    .unique();
}

async function describe(ctx: QueryCtx, call: Doc<"calls">, viewerId: Id<"users">) {
  const otherId = call.callerId === viewerId ? call.calleeId : call.callerId;
  const other = await ctx.db.get(otherId);
  return {
    ...call,
    isCaller: call.callerId === viewerId,
    peerId: otherId,
    peerName: other?.name || other?.email?.split("@")[0] || "Your partner",
  };
}

/** Ring the partner, recording the attempt so both sides can observe it. */
export const start = mutation({
  args: { calleeId: v.id("users") },
  handler: async (ctx, args) => {
    const callerId = await requireUserId(ctx);
    if (args.calleeId === callerId) throw new Error("You can't call yourself");

    // Clear anything stale on either side so a crashed tab can't wedge the
    // line permanently.
    for (const status of ["ringing", "active"] as const) {
      const mine = await ctx.db
        .query("calls")
        .withIndex("by_caller_status", (q) => q.eq("callerId", callerId).eq("status", status))
        .collect();
      for (const call of mine) {
        await ctx.db.patch(call._id, { status: "ended", endedAt: Date.now(), endedReason: "failed" });
      }
    }

    // The document id doubles as the callId — no RNG needed, and guaranteed
    // unique. (The client used crypto.randomUUID(), which is undefined
    // outside a secure context and threw before the call could even start.)
    const docId = await ctx.db.insert("calls", {
      callId: "",
      callerId,
      calleeId: args.calleeId,
      status: "ringing",
      startedAt: Date.now(),
    });
    await ctx.db.patch(docId, { callId: docId });
    return docId as string;
  },
});

export const sendSignal = mutation({
  args: {
    callId: v.string(),
    toUserId: v.id("users"),
    type: signalType,
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const fromUserId = await requireUserId(ctx);
    return await ctx.db.insert("callSignals", { ...args, fromUserId });
  },
});

// Signals for a call addressed to me, oldest first — drives the WebRTC
// offer/answer/ICE exchange. Indexed on (callId, toUserId) so this stays cheap
// as candidates pile up.
export const signalsFor = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("callSignals")
      .withIndex("by_callId_and_to", (q) => q.eq("callId", args.callId).eq("toUserId", userId))
      .collect();
  },
});

/**
 * The call I'm currently party to, ringing or connected, from either side.
 * The provider subscribes to this app-wide, so the phone rings no matter
 * which tab you're on — previously only the Call screen was listening.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const candidates: Doc<"calls">[] = [];
    for (const status of ["active", "ringing"] as const) {
      candidates.push(
        ...(await ctx.db
          .query("calls")
          .withIndex("by_callee_status", (q) => q.eq("calleeId", userId).eq("status", status))
          .collect()),
        ...(await ctx.db
          .query("calls")
          .withIndex("by_caller_status", (q) => q.eq("callerId", userId).eq("status", status))
          .collect()),
      );
    }

    const live = candidates
      // Drop rings the caller abandoned without cleaning up.
      .filter((c) => c.status === "active" || Date.now() - c.startedAt < RING_TIMEOUT_MS)
      // Connected calls win over a stray ring, then most recent.
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return b.startedAt - a.startedAt;
      })[0];

    return live ? await describe(ctx, live, userId) : null;
  },
});

export const answer = mutation({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const call = await callByCallId(ctx, args.callId);
    if (!call) throw new Error("That call no longer exists");
    if (call.calleeId !== userId) throw new Error("That call isn't for you");
    await ctx.db.patch(call._id, { status: "active", answeredAt: Date.now() });
  },
});

export const end = mutation({
  args: {
    callId: v.string(),
    reason: v.optional(
      v.union(
        v.literal("hangup"),
        v.literal("declined"),
        v.literal("missed"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const call = await callByCallId(ctx, args.callId);
    if (!call) return;
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new Error("That call isn't yours to end");
    }
    if (call.status !== "ended") {
      await ctx.db.patch(call._id, {
        status: "ended",
        endedAt: Date.now(),
        endedReason: args.reason ?? "hangup",
      });
    }
  },
});

// Signals are only useful while the call is negotiating, so they're purged
// once it's over rather than accumulating forever.
export const purgeSignals = mutation({
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

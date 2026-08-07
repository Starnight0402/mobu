import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Phase 1: mirrors the existing SQLite `tracking` table for functional parity.
  // `user` stays a free-text label (matching the current 'Partner 1'/'Partner 2'
  // strings) until Phase 2 wires up real accounts and this becomes v.id("users").
  // Phase 5 will split `money` entries out into a dedicated `expenses` table.
  tracking: defineTable({
    type: v.union(
      v.literal("money"),
      v.literal("mood"),
      v.literal("health"),
      v.literal("food"),
      v.literal("activity"),
      v.literal("location"),
    ),
    value: v.number(),
    category: v.optional(v.string()),
    note: v.optional(v.string()),
    user: v.string(),
  }).index("by_type", ["type"]),

  memories: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    category: v.union(
      v.literal("photo"),
      v.literal("travel"),
      v.literal("food"),
      v.literal("milestone"),
      v.literal("event"),
    ),
    location: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    // Persisted MemoryBoard layout position (Phase 5 fixes the current
    // Math.random()-on-every-render layout in MemoryBoard.tsx).
    positionX: v.optional(v.number()),
    positionY: v.optional(v.number()),
    cardWidth: v.number(),
    cardHeight: v.number(),
    textSize: v.number(),
    fontFamily: v.string(),
    textColor: v.string(),
    bgColor: v.string(),
    borderStyle: v.string(),
    borderWidth: v.number(),
    borderColor: v.string(),
    shadowEffect: v.string(),
    bgImageOverlay: v.optional(v.string()),
  }),

  // Phase 5: dedicated expense tracking, replacing the hack where split
  // info was string-concatenated into `tracking.note`.
  expenses: defineTable({
    amount: v.number(),
    payerId: v.id("users"),
    splitRatio: v.number(), // payer's share, 0-100
    category: v.string(),
    currency: v.string(),
    note: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
    settled: v.boolean(),
  }).index("by_payer", ["payerId"]),

  goals: defineTable({
    title: v.string(),
    category: v.union(
      v.literal("cooking"),
      v.literal("travel"),
      v.literal("fitness"),
      v.literal("relaxation"),
      v.literal("adventure"),
    ),
    target: v.number(),
    current: v.number(),
    completed: v.boolean(),
  }),

  capsules: defineTable({
    title: v.string(),
    type: v.union(
      v.literal("letter"),
      v.literal("photos"),
      v.literal("voice"),
      v.literal("video"),
    ),
    unlockDate: v.string(),
    contentStorageId: v.optional(v.id("_storage")),
    contentText: v.optional(v.string()),
  }),

  insights: defineTable({
    title: v.string(),
    content: v.string(),
    type: v.union(v.literal("pattern"), v.literal("trend"), v.literal("suggestion")),
  }),

  widgets: defineTable({
    widgetId: v.string(),
    size: v.union(v.literal("small"), v.literal("wide"), v.literal("tall"), v.literal("large")),
    order: v.number(),
  }).index("by_widgetId", ["widgetId"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  // Net-new tables (Phases 6-8), defined now so the schema is stable from the start.
  messages: defineTable({
    senderId: v.id("users"),
    text: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    voiceStorageId: v.optional(v.id("_storage")),
    reaction: v.optional(v.string()),
    readAt: v.optional(v.number()),
  }),

  liveLocations: defineTable({
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    sharingUntil: v.number(),
  }).index("by_user", ["userId"]),

  callSignals: defineTable({
    callId: v.string(),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate"),
      v.literal("hangup"),
    ),
    payload: v.string(),
  }).index("by_callId", ["callId"]),
});

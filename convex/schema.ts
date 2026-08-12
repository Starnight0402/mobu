import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // authTables.users only has a free-text `image` (used for OAuth avatar
  // URLs). We override it with our own uploaded-photo storage reference,
  // keeping every other built-in field/index identical so auth keeps working.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    avatarStorageId: v.optional(v.id("_storage")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

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
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
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
    // When the memory actually happened, editable independently of
    // _creationTime (which is just when the row was inserted/uploaded).
    memoryDate: v.optional(v.number()),
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
    // When the money was actually spent, so an expense can be backdated
    // instead of being pinned to _creationTime.
    spentAt: v.optional(v.number()),
    settledAt: v.optional(v.number()),
  })
    .index("by_payer", ["payerId"])
    .index("by_settled", ["settled"]),

  // A record of money actually changing hands. Settling used to just flip
  // every expense's `settled` flag, which erased any trace of who paid whom.
  settlements: defineTable({
    fromUserId: v.id("users"), // the debtor, who handed the money over
    toUserId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    note: v.optional(v.string()),
    settledAt: v.number(),
  }).index("by_settledAt", ["settledAt"]),

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

  // One row per call attempt. Ringing state used to be *inferred* by scanning
  // the newest 50 signals for an unanswered offer, which broke as soon as a
  // call produced more than 50 ICE candidates — the offer fell out of the
  // window and the callee's phone stopped ringing mid-call.
  calls: defineTable({
    callId: v.string(),
    callerId: v.id("users"),
    calleeId: v.id("users"),
    status: v.union(v.literal("ringing"), v.literal("active"), v.literal("ended")),
    startedAt: v.number(),
    answeredAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    endedReason: v.optional(
      v.union(
        v.literal("hangup"),
        v.literal("declined"),
        v.literal("missed"),
        v.literal("failed"),
      ),
    ),
  })
    .index("by_callId", ["callId"])
    .index("by_callee_status", ["calleeId", "status"])
    .index("by_caller_status", ["callerId", "status"]),

  // One row per browser/device that has granted notification permission.
  // Endpoints go stale (browser reinstall, permission revoked), so the sender
  // prunes any that come back 404/410.
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    // Web push subscriptions key on `endpoint`; native FCM registrations key
    // on `"fcm:" + token` so both share one row shape and one unique index.
    endpoint: v.string(),
    p256dh: v.optional(v.string()),
    auth: v.optional(v.string()),
    fcmToken: v.optional(v.string()),
    label: v.optional(v.string()),
    lastSeenAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // The in-app half of notifications: what drives unread badges and the
  // notification list, independent of whether a push was actually delivered.
  notifications: defineTable({
    userId: v.id("users"), // recipient
    kind: v.union(
      v.literal("call"),
      v.literal("missed-call"),
      v.literal("message"),
      v.literal("expense"),
      v.literal("memory"),
      v.literal("checkin"),
      v.literal("goal"),
      v.literal("insight"),
      v.literal("capsule"),
      v.literal("streak"),
    ),
    title: v.string(),
    body: v.string(),
    /** Which screen to open when it's tapped. */
    tab: v.optional(v.string()),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "readAt"]),

  callSignals: defineTable({
    callId: v.string(),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate"),
      v.literal("hangup"),
      // Mute / camera-off state, so the other side can show "camera off"
      // instead of an unexplained black rectangle.
      v.literal("media-state"),
    ),
    payload: v.string(),
  })
    .index("by_callId", ["callId"])
    .index("by_callId_and_to", ["callId", "toUserId"]),
});

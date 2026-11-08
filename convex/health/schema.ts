import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  careKindV,
  claimStageV,
  contactV,
  cycleModeV,
  eyeV,
  fileV,
  flagV,
  flowV,
  historyKindV,
  lifestyleV,
  recordSourceV,
  recordStatusV,
  recordTypeV,
  remindersV,
  scheduleV,
  severityV,
  shareCategoryV,
  shareLevelV,
  unitsV,
  vitalExtraV,
  vitalTypeV,
} from "./validators";

/*
 * Health tables, spread into the main schema.
 *
 * Every per-person row carries `ownerId`. Reads go through health/access.ts,
 * which applies what the owner chose to share with their partner; that rule is
 * enforced here on the server, never only hidden in the UI. Household things
 * (the medicine cabinet, doctors and hospitals, insurance) have no owner and
 * are visible to both.
 */
export const healthTables = {
  healthProfiles: defineTable({
    ownerId: v.id("users"),
    dob: v.optional(v.string()),
    sexAtBirth: v.optional(v.union(v.literal("female"), v.literal("male"), v.literal("intersex"))),
    heightCm: v.optional(v.number()),
    bloodGroup: v.optional(v.string()),
    organDonor: v.optional(v.union(v.literal("yes"), v.literal("no"))),
    emergencyContacts: v.optional(v.array(contactV)),
    abhaNumber: v.optional(v.string()),
    abhaAddress: v.optional(v.string()),
    abhaName: v.optional(v.string()),
    abhaVerifiedAt: v.optional(v.number()),
    abhaCardStorageId: v.optional(v.id("_storage")),
    lifestyle: v.optional(lifestyleV),
    dentalNotes: v.optional(v.string()),
    hearingNotes: v.optional(v.string()),
    lastBloodDonation: v.optional(v.string()),
    cycleEnabled: v.optional(v.boolean()),
    cycleMode: v.optional(cycleModeV),
    reminders: v.optional(remindersV),
    units: v.optional(unitsV),
    healthConnectAt: v.optional(v.number()),
    // Off: reports aren't sent to Gemini; values are typed in instead.
    aiReading: v.optional(v.boolean()),
  }).index("by_owner", ["ownerId"]),

  healthSharing: defineTable({
    ownerId: v.id("users"),
    category: shareCategoryV,
    level: shareLevelV,
  }).index("by_owner", ["ownerId"]),

  healthRecords: defineTable({
    ownerId: v.id("users"),
    type: recordTypeV,
    title: v.string(),
    date: v.string(), // YYYY-MM-DD
    provider: v.optional(v.string()),
    doctor: v.optional(v.string()),
    files: v.array(fileV),
    folder: v.optional(v.string()),
    visitId: v.optional(v.id("appointments")),
    status: recordStatusV,
    error: v.optional(v.string()),
    source: recordSourceV,
    summary: v.optional(v.string()),
    questions: v.optional(v.array(v.string())),
    extractionJson: v.optional(v.string()),
    reportName: v.optional(v.string()),
    nameMatch: v.optional(v.union(v.literal("match"), v.literal("mismatch"), v.literal("unknown"))),
    cost: v.optional(v.number()),
    expenseId: v.optional(v.id("expenses")),
    preventive: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    searchText: v.string(),
  })
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_owner_status", ["ownerId", "status"])
    .searchIndex("search", { searchField: "searchText", filterFields: ["ownerId"] }),

  labResults: defineTable({
    ownerId: v.id("users"),
    recordId: v.optional(v.id("healthRecords")),
    date: v.string(),
    code: v.string(),
    name: v.string(),
    panel: v.string(),
    value: v.optional(v.number()),
    valueText: v.optional(v.string()),
    unit: v.optional(v.string()),
    refLow: v.optional(v.number()),
    refHigh: v.optional(v.number()),
    refText: v.optional(v.string()),
    flag: v.optional(flagV),
    source: v.union(v.literal("report"), v.literal("manual"), v.literal("fhir")),
    notes: v.optional(v.string()),
  })
    .index("by_owner_code", ["ownerId", "code", "date"])
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_record", ["recordId"]),

  labTargets: defineTable({
    ownerId: v.id("users"),
    code: v.string(),
    low: v.optional(v.number()),
    high: v.optional(v.number()),
    setBy: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_owner_code", ["ownerId", "code"]),

  vitals: defineTable({
    ownerId: v.id("users"),
    type: vitalTypeV,
    time: v.number(),
    value: v.number(),
    value2: v.optional(v.number()),
    unit: v.optional(v.string()),
    context: v.optional(v.string()),
    source: v.string(), // "manual", or the app that wrote it to Health Connect
    hcId: v.optional(v.string()),
    extra: v.optional(vitalExtraV),
  })
    .index("by_owner_type_time", ["ownerId", "type", "time"])
    .index("by_owner_hc", ["ownerId", "hcId"]),

  medications: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    strength: v.optional(v.string()),
    form: v.optional(v.string()),
    purpose: v.optional(v.string()),
    prescriber: v.optional(v.string()),
    instructions: v.optional(v.string()),
    kind: v.union(v.literal("medicine"), v.literal("supplement")),
    schedule: scheduleV,
    prnMinGapHours: v.optional(v.number()),
    prnMaxPerDay: v.optional(v.number()),
    stockCount: v.optional(v.number()),
    perDose: v.optional(v.number()),
    active: v.boolean(),
    stoppedAt: v.optional(v.string()),
    stoppedReason: v.optional(v.string()),
    recordId: v.optional(v.id("healthRecords")),
    nudgePartner: v.boolean(),
  }).index("by_owner", ["ownerId"]),

  doseLogs: defineTable({
    ownerId: v.id("users"),
    medId: v.id("medications"),
    slot: v.string(), // "YYYY-MM-DDTHH:mm" in the couple's timezone, or "prn:<ms>"
    status: v.union(v.literal("taken"), v.literal("skipped")),
    reason: v.optional(v.string()),
    at: v.number(),
    loggedBy: v.id("users"),
  })
    .index("by_med_slot", ["medId", "slot"])
    .index("by_owner_at", ["ownerId", "at"]),

  cabinetItems: defineTable({
    name: v.string(),
    qty: v.optional(v.string()),
    expiry: v.optional(v.string()), // YYYY-MM
    kind: v.union(v.literal("medicine"), v.literal("firstaid"), v.literal("device")),
    notes: v.optional(v.string()),
    addedBy: v.id("users"),
  }),

  providers: defineTable({
    kind: v.union(
      v.literal("doctor"),
      v.literal("lab"),
      v.literal("pharmacy"),
      v.literal("hospital"),
      v.literal("dentist"),
      v.literal("clinic"),
      v.literal("other"),
    ),
    name: v.string(),
    specialty: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    cashless: v.optional(v.boolean()),
    patients: v.array(v.id("users")),
    notes: v.optional(v.string()),
    addedBy: v.id("users"),
  }),

  appointments: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    kind: v.union(
      v.literal("consult"),
      v.literal("test"),
      v.literal("dental"),
      v.literal("eye"),
      v.literal("vaccine"),
      v.literal("therapy"),
      v.literal("other"),
    ),
    doctor: v.optional(v.string()),
    specialty: v.optional(v.string()),
    providerId: v.optional(v.id("providers")),
    place: v.optional(v.string()),
    start: v.number(),
    isVideo: v.optional(v.boolean()),
    status: v.union(v.literal("upcoming"), v.literal("done"), v.literal("cancelled")),
    fastingFrom: v.optional(v.number()),
    prepNotes: v.optional(v.string()),
    bring: v.array(v.object({ text: v.string(), done: v.boolean() })),
    questions: v.array(v.object({ text: v.string(), done: v.boolean(), by: v.id("users") })),
    companion: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    followUp: v.optional(v.string()),
    fee: v.optional(v.number()),
    expenseId: v.optional(v.id("expenses")),
    voiceStorageId: v.optional(v.id("_storage")),
  }).index("by_owner_start", ["ownerId", "start"]),

  historyItems: defineTable({
    ownerId: v.id("users"),
    kind: historyKindV,
    name: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("improving"), v.literal("resolved"))),
    severity: v.optional(severityV),
    category: v.optional(
      v.union(v.literal("medicine"), v.literal("food"), v.literal("environment"), v.literal("other")),
    ),
    reaction: v.optional(v.string()),
    date: v.optional(v.string()),
    endDate: v.optional(v.string()),
    relative: v.optional(v.string()),
    ageAtOnset: v.optional(v.number()),
    place: v.optional(v.string()),
    doctor: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_owner_kind", ["ownerId", "kind"]),

  eyePrescriptions: defineTable({
    ownerId: v.id("users"),
    date: v.string(),
    kind: v.union(v.literal("glasses"), v.literal("contacts")),
    right: eyeV,
    left: eyeV,
    pd: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  immunizations: defineTable({
    ownerId: v.id("users"),
    vaccine: v.string(),
    dose: v.optional(v.string()),
    date: v.string(),
    place: v.optional(v.string()),
    batch: v.optional(v.string()),
    recordId: v.optional(v.id("healthRecords")),
    notes: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  preventive: defineTable({
    ownerId: v.id("users"),
    key: v.string(),
    lastDone: v.optional(v.string()),
    intervalMonths: v.optional(v.number()),
    disabled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }).index("by_owner_key", ["ownerId", "key"]),

  symptoms: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    severity: v.number(), // 1-10
    at: v.number(),
    durationMin: v.optional(v.number()),
    bodyParts: v.optional(v.array(v.string())),
    triggers: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    episodeId: v.optional(v.id("episodes")),
    photoStorageId: v.optional(v.id("_storage")),
    series: v.optional(v.string()),
  }).index("by_owner_at", ["ownerId", "at"]),

  episodes: defineTable({
    ownerId: v.id("users"), // the person who is ill
    title: v.string(),
    start: v.number(),
    end: v.optional(v.number()),
    status: v.union(v.literal("ongoing"), v.literal("resolved")),
    careMode: v.boolean(),
    caregiverId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  })
    .index("by_owner_start", ["ownerId", "start"])
    .index("by_status", ["status"]),

  careLogs: defineTable({
    episodeId: v.id("episodes"),
    ownerId: v.id("users"),
    kind: careKindV,
    value: v.optional(v.number()),
    unit: v.optional(v.string()),
    text: v.optional(v.string()),
    medId: v.optional(v.id("medications")),
    medName: v.optional(v.string()),
    at: v.number(),
    loggedBy: v.id("users"),
  }).index("by_episode_at", ["episodeId", "at"]),

  cycleLogs: defineTable({
    ownerId: v.id("users"),
    date: v.string(),
    flow: v.optional(flowV),
    symptoms: v.optional(v.array(v.string())),
    bbt: v.optional(v.number()),
    ovulationTest: v.optional(
      v.union(v.literal("positive"), v.literal("high"), v.literal("negative"), v.literal("inconclusive")),
    ),
    mucus: v.optional(
      v.union(v.literal("dry"), v.literal("sticky"), v.literal("creamy"), v.literal("watery"), v.literal("eggwhite")),
    ),
    intimacy: v.optional(v.union(v.literal("protected"), v.literal("unprotected"))),
    contraception: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
  }).index("by_owner_date", ["ownerId", "date"]),

  checkins: defineTable({
    ownerId: v.id("users"),
    kind: v.union(v.literal("phq9"), v.literal("gad7")),
    answers: v.array(v.number()),
    score: v.number(),
    at: v.number(),
  }).index("by_owner_at", ["ownerId", "at"]),

  therapySessions: defineTable({
    ownerId: v.id("users"),
    date: v.string(),
    with: v.optional(v.string()),
    notes: v.optional(v.string()),
    homework: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  insurancePolicies: defineTable({
    insurer: v.string(),
    plan: v.optional(v.string()),
    kind: v.union(v.literal("floater"), v.literal("individual"), v.literal("group"), v.literal("topup")),
    members: v.array(v.id("users")),
    sumInsured: v.optional(v.number()),
    premium: v.optional(v.number()),
    policyNumber: v.optional(v.string()),
    tpa: v.optional(v.string()),
    tpaPhone: v.optional(v.string()),
    start: v.optional(v.string()),
    renewal: v.optional(v.string()),
    waitingNotes: v.optional(v.string()),
    files: v.array(fileV),
    active: v.boolean(),
    notes: v.optional(v.string()),
    addedBy: v.id("users"),
  }),

  claims: defineTable({
    policyId: v.id("insurancePolicies"),
    patientId: v.id("users"),
    title: v.string(),
    kind: v.union(v.literal("cashless"), v.literal("reimbursement")),
    claimed: v.optional(v.number()),
    approved: v.optional(v.number()),
    paid: v.optional(v.number()),
    stage: claimStageV,
    filedOn: v.optional(v.string()),
    claimNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_policy", ["policyId"]),

  shareLinks: defineTable({
    ownerId: v.id("users"),
    token: v.string(),
    kind: v.union(v.literal("doctor"), v.literal("medid")),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    revoked: v.boolean(),
    label: v.optional(v.string()),
    opens: v.number(),
    lastOpenedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_owner", ["ownerId"]),

  healthAccessLog: defineTable({
    ownerId: v.id("users"),
    kind: v.union(v.literal("link"), v.literal("partner")),
    label: v.string(),
    at: v.number(),
  }).index("by_owner_at", ["ownerId", "at"]),

  abdmTxns: defineTable({
    userId: v.id("users"),
    txnId: v.string(),
    scope: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  reminderLog: defineTable({
    key: v.string(),
    at: v.number(),
  }).index("by_key", ["key"]),
};

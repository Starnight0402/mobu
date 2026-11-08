import { v } from "convex/values";

/*
 * Validators shared by the health tables (health/schema.ts) and the functions
 * that write them, so an allowed value is defined exactly once.
 */

export const whoV = v.union(v.literal("me"), v.literal("partner"), v.literal("both"));

export const recordTypeV = v.union(
  v.literal("lab"),
  v.literal("prescription"),
  v.literal("imaging"),
  v.literal("consult"),
  v.literal("discharge"),
  v.literal("vaccine"),
  v.literal("bill"),
  v.literal("insurance"),
  v.literal("dental"),
  v.literal("eye"),
  v.literal("ecg"),
  v.literal("other"),
);

export const recordStatusV = v.union(
  v.literal("processing"),
  v.literal("review"),
  v.literal("saved"),
  v.literal("failed"),
);

export const recordSourceV = v.union(
  v.literal("upload"),
  v.literal("scan"),
  v.literal("share"),
  v.literal("abha"),
  v.literal("fhir"),
  v.literal("manual"),
);

export const fileV = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mime: v.string(),
  size: v.optional(v.number()),
});

export const flagV = v.union(
  v.literal("low"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("borderline"),
  v.literal("abnormal"),
);

export const vitalTypeV = v.union(
  v.literal("bp"),
  v.literal("heartRate"),
  v.literal("restingHr"),
  v.literal("hrv"),
  v.literal("spo2"),
  v.literal("respRate"),
  v.literal("temp"),
  v.literal("glucose"),
  v.literal("weight"),
  v.literal("height"),
  v.literal("bodyFat"),
  v.literal("waist"),
  v.literal("vo2max"),
  v.literal("steps"),
  v.literal("distance"),
  v.literal("calories"),
  v.literal("activeMinutes"),
  v.literal("water"),
  v.literal("sleep"),
  v.literal("exercise"),
);

export const vitalExtraV = v.object({
  durationMin: v.optional(v.number()),
  stages: v.optional(v.array(v.object({ stage: v.string(), min: v.number() }))),
  exerciseType: v.optional(v.string()),
  title: v.optional(v.string()),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  distanceKm: v.optional(v.number()),
  kcal: v.optional(v.number()),
  endTime: v.optional(v.number()),
});

export const scheduleV = v.object({
  type: v.union(v.literal("daily"), v.literal("weekly"), v.literal("interval"), v.literal("prn")),
  times: v.array(v.string()), // "HH:mm", couple's timezone
  days: v.optional(v.array(v.number())), // weekly: 0 = Sunday
  everyDays: v.optional(v.number()), // interval
  startDate: v.string(), // YYYY-MM-DD
  endDate: v.optional(v.string()),
});

export const historyKindV = v.union(
  v.literal("condition"),
  v.literal("allergy"),
  v.literal("procedure"),
  v.literal("hospitalization"),
  v.literal("injury"),
  v.literal("implant"),
  v.literal("family"),
);

export const severityV = v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"));

export const eyeV = v.object({
  sph: v.optional(v.number()),
  cyl: v.optional(v.number()),
  axis: v.optional(v.number()),
  add: v.optional(v.number()),
});

export const flowV = v.union(
  v.literal("none"),
  v.literal("spotting"),
  v.literal("light"),
  v.literal("medium"),
  v.literal("heavy"),
);

export const shareLevelV = v.union(v.literal("full"), v.literal("summary"), v.literal("dates"), v.literal("hidden"));

export const shareCategoryV = v.union(
  v.literal("records"),
  v.literal("meds"),
  v.literal("visits"),
  v.literal("vitals"),
  v.literal("symptoms"),
  v.literal("cycle"),
  v.literal("mind"),
);

export const claimStageV = v.union(
  v.literal("filed"),
  v.literal("documents"),
  v.literal("review"),
  v.literal("approved"),
  v.literal("paid"),
  v.literal("rejected"),
);

export const careKindV = v.union(
  v.literal("temp"),
  v.literal("med"),
  v.literal("fluid"),
  v.literal("food"),
  v.literal("symptom"),
  v.literal("note"),
);

export const contactV = v.object({ name: v.string(), relation: v.optional(v.string()), phone: v.string() });

export const remindersV = v.object({
  doses: v.boolean(),
  refills: v.boolean(),
  appointments: v.boolean(),
  prevention: v.boolean(),
  renewals: v.boolean(),
  hideDetails: v.boolean(),
});

export const unitsV = v.object({
  glucose: v.union(v.literal("mg/dL"), v.literal("mmol/L")),
  cholesterol: v.union(v.literal("mg/dL"), v.literal("mmol/L")),
  weight: v.union(v.literal("kg"), v.literal("lb")),
  temp: v.union(v.literal("C"), v.literal("F")),
});

export const lifestyleV = v.object({
  smoking: v.optional(v.string()),
  alcohol: v.optional(v.string()),
  diet: v.optional(v.string()),
  exercise: v.optional(v.string()),
  occupation: v.optional(v.string()),
});

export const cycleModeV = v.union(
  v.literal("track"),
  v.literal("ttc"),
  v.literal("pregnancy"),
  v.literal("perimenopause"),
);

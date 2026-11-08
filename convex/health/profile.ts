import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { mutation, query, QueryCtx } from "../_generated/server";
import { displayName } from "../authHelpers";
import {
  ALLOWED_LEVELS,
  coupleIds,
  profileOf,
  readers,
  sharingLevels,
  SHARE_CATEGORIES,
  trimOrUndef,
} from "./access";
import {
  contactV,
  cycleModeV,
  lifestyleV,
  remindersV,
  shareCategoryV,
  shareLevelV,
  unitsV,
  whoV,
} from "./validators";
import { isDate } from "./time";

export const DEFAULT_REMINDERS = {
  doses: true,
  refills: true,
  appointments: true,
  prevention: true,
  renewals: true,
  hideDetails: true,
};
export const DEFAULT_UNITS = { glucose: "mg/dL", cholesterol: "mg/dL", weight: "kg", temp: "C" } as const;

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

async function person(ctx: QueryCtx, userId: Id<"users">, isMe: boolean) {
  const user = await ctx.db.get(userId);
  const profile = await profileOf(ctx, userId);
  const abhaCardUrl = profile?.abhaCardStorageId ? await ctx.storage.getUrl(profile.abhaCardStorageId) : null;
  return {
    userId,
    isMe,
    name: user ? displayName(user) : "Partner",
    profile: profile
      ? {
          ...profile,
          reminders: profile.reminders ?? DEFAULT_REMINDERS,
          units: profile.units ?? DEFAULT_UNITS,
        }
      : null,
    abhaCardUrl,
  };
}

/** Both people's basics, labelled. Profiles are always visible to both. */
export const people = query({
  args: {},
  handler: async (ctx) => {
    const list = await readers(ctx, "both");
    return await Promise.all(list.map((r) => person(ctx, r.userId, r.isMe)));
  },
});

export const save = mutation({
  args: {
    dob: v.optional(v.string()),
    sexAtBirth: v.optional(v.union(v.literal("female"), v.literal("male"), v.literal("intersex"))),
    heightCm: v.optional(v.number()),
    bloodGroup: v.optional(v.string()),
    organDonor: v.optional(v.union(v.literal("yes"), v.literal("no"))),
    emergencyContacts: v.optional(v.array(contactV)),
    abhaNumber: v.optional(v.string()),
    abhaAddress: v.optional(v.string()),
    abhaCardStorageId: v.optional(v.id("_storage")),
    lifestyle: v.optional(lifestyleV),
    dentalNotes: v.optional(v.string()),
    hearingNotes: v.optional(v.string()),
    lastBloodDonation: v.optional(v.string()),
    cycleEnabled: v.optional(v.boolean()),
    cycleMode: v.optional(cycleModeV),
    reminders: v.optional(remindersV),
    units: v.optional(unitsV),
    aiReading: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (args.dob !== undefined && args.dob !== "" && !isDate(args.dob)) throw new Error("Date of birth isn't a valid date");
    if (args.heightCm !== undefined && !(args.heightCm > 30 && args.heightCm < 260)) throw new Error("Height should be in centimetres");
    if (args.bloodGroup && !BLOOD_GROUPS.includes(args.bloodGroup)) throw new Error("Unknown blood group");
    if (args.abhaNumber) {
      const digits = args.abhaNumber.replace(/\D/g, "");
      if (digits.length !== 14) throw new Error("An ABHA number has 14 digits");
      args.abhaNumber = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
    }
    if (args.abhaAddress && !/^[a-zA-Z0-9._-]{3,32}@(abdm|sbx)$/i.test(args.abhaAddress.trim())) {
      throw new Error("An ABHA address looks like name@abdm");
    }
    const patch = {
      ...args,
      dob: args.dob === "" ? undefined : args.dob,
      abhaAddress: trimOrUndef(args.abhaAddress)?.toLowerCase(),
      dentalNotes: args.dentalNotes === undefined ? undefined : trimOrUndef(args.dentalNotes),
      emergencyContacts: args.emergencyContacts?.filter((c) => c.name.trim() && c.phone.trim()),
    };
    // Only fields actually sent are changed.
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => k in args));
    const existing = await profileOf(ctx, me);
    if (existing) {
      if (args.abhaCardStorageId && existing.abhaCardStorageId && existing.abhaCardStorageId !== args.abhaCardStorageId) {
        await ctx.storage.delete(existing.abhaCardStorageId);
      }
      await ctx.db.patch(existing._id, clean);
    } else {
      await ctx.db.insert("healthProfiles", { ownerId: me, ...clean });
    }
  },
});

/** Removes everything health-related of mine. Your partner's data is untouched. */
export const deleteMine = mutation({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    const gone = async (docs: { _id: Id<any> }[]) => { for (const d of docs) await ctx.db.delete(d._id); };
    for (const r of await ctx.db.query("healthRecords").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect()) {
      for (const f of r.files) await ctx.storage.delete(f.storageId).catch(() => {});
      await ctx.db.delete(r._id);
    }
    for (const s of await ctx.db.query("symptoms").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect()) {
      if (s.photoStorageId) await ctx.storage.delete(s.photoStorageId).catch(() => {});
      await ctx.db.delete(s._id);
    }
    for (const a of await ctx.db.query("appointments").withIndex("by_owner_start", (q) => q.eq("ownerId", me)).collect()) {
      if (a.voiceStorageId) await ctx.storage.delete(a.voiceStorageId).catch(() => {});
      await ctx.db.delete(a._id);
    }
    await gone(await ctx.db.query("labResults").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("labTargets").withIndex("by_owner_code", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("vitals").withIndex("by_owner_type_time", (q) => q.eq("ownerId", me)).collect());
    for (const m of await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect()) {
      await gone(await ctx.db.query("doseLogs").withIndex("by_med_slot", (q) => q.eq("medId", m._id)).collect());
      await ctx.db.delete(m._id);
    }
    await gone(await ctx.db.query("historyItems").withIndex("by_owner_kind", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("eyePrescriptions").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("immunizations").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("preventive").withIndex("by_owner_key", (q) => q.eq("ownerId", me)).collect());
    for (const e of await ctx.db.query("episodes").withIndex("by_owner_start", (q) => q.eq("ownerId", me)).collect()) {
      await gone(await ctx.db.query("careLogs").withIndex("by_episode_at", (q) => q.eq("episodeId", e._id)).collect());
      await ctx.db.delete(e._id);
    }
    await gone(await ctx.db.query("cycleLogs").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("checkins").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("therapySessions").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("shareLinks").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("healthAccessLog").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect());
    await gone(await ctx.db.query("healthSharing").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect());
    const p = await profileOf(ctx, me);
    if (p?.abhaCardStorageId) await ctx.storage.delete(p.abhaCardStorageId).catch(() => {});
    if (p) await ctx.db.delete(p._id);
  },
});

export const unlinkAbha = mutation({
  args: {},
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    const p = await profileOf(ctx, me);
    if (!p) return;
    if (p.abhaCardStorageId) await ctx.storage.delete(p.abhaCardStorageId);
    await ctx.db.patch(p._id, {
      abhaNumber: undefined,
      abhaAddress: undefined,
      abhaName: undefined,
      abhaVerifiedAt: undefined,
      abhaCardStorageId: undefined,
    });
  },
});

/** What I share with my partner, and what they share with me. */
export const sharing = query({
  args: {},
  handler: async (ctx) => {
    const { me, partner } = await coupleIds(ctx);
    return {
      mine: await sharingLevels(ctx, me),
      theirs: partner ? await sharingLevels(ctx, partner._id) : null,
      allowed: ALLOWED_LEVELS,
      categories: SHARE_CATEGORIES,
    };
  },
});

export const setSharing = mutation({
  args: { category: shareCategoryV, level: shareLevelV },
  handler: async (ctx, { category, level }) => {
    const { me } = await coupleIds(ctx);
    if (!ALLOWED_LEVELS[category].includes(level)) throw new Error(`"${level}" isn't an option for ${category}`);
    const existing = (
      await ctx.db
        .query("healthSharing")
        .withIndex("by_owner", (q) => q.eq("ownerId", me))
        .collect()
    ).find((r) => r.category === category);
    if (existing) await ctx.db.patch(existing._id, { level });
    else await ctx.db.insert("healthSharing", { ownerId: me, category, level });
  },
});

/**
 * Everything a first responder needs, for one or both people. Always visible
 * to both partners, whatever the sharing settings say.
 */
export async function medicalIdFor(ctx: QueryCtx, ownerId: Id<"users">) {
  const user = await ctx.db.get(ownerId);
  const profile = await profileOf(ctx, ownerId);
  const history = await ctx.db
    .query("historyItems")
    .withIndex("by_owner_kind", (q) => q.eq("ownerId", ownerId))
    .collect();
  const meds = (
    await ctx.db
      .query("medications")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect()
  ).filter((m) => m.active);
  const policies = (await ctx.db.query("insurancePolicies").collect()).filter(
    (p) => p.active && p.members.includes(ownerId),
  );
  return {
    userId: ownerId,
    name: user ? displayName(user) : "Partner",
    dob: profile?.dob,
    heightCm: profile?.heightCm,
    bloodGroup: profile?.bloodGroup,
    organDonor: profile?.organDonor,
    abhaNumber: profile?.abhaNumber,
    abhaAddress: profile?.abhaAddress,
    contacts: profile?.emergencyContacts ?? [],
    allergies: history
      .filter((h) => h.kind === "allergy")
      .map((h) => ({ name: h.name, reaction: h.reaction, severity: h.severity, category: h.category })),
    conditions: history.filter((h) => h.kind === "condition" && h.status !== "resolved").map((h) => h.name),
    implants: history.filter((h) => h.kind === "implant").map((h) => h.name),
    medications: meds.map((m) => [m.name, m.strength].filter(Boolean).join(" ")),
    insurance: policies.map((p) => ({
      insurer: p.insurer,
      policyNumber: p.policyNumber,
      tpaPhone: p.tpaPhone,
    })),
  };
}

export const medicalId = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const list = await readers(ctx, who);
    const ids = await Promise.all(list.map((r) => medicalIdFor(ctx, r.userId)));
    return ids.map((m, i) => ({ ...m, isMe: list[i].isMe }));
  },
});

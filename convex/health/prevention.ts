import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { mutation, query, QueryCtx } from "../_generated/server";
import { coupleIds, coupleTimeZone, ownDoc, profileOf, readers, trimOrUndef } from "./access";
import { preventionFor, SCREENINGS, VACCINES } from "./preventionLogic";
import { isDate, localDate } from "./time";
import { whoV } from "./validators";

export async function preventionOf(ctx: QueryCtx, ownerId: Id<"users">, today: string) {
  const profile = await profileOf(ctx, ownerId);
  const immunizations = await ctx.db
    .query("immunizations")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  const overrides = await ctx.db
    .query("preventive")
    .withIndex("by_owner_key", (q) => q.eq("ownerId", ownerId))
    .collect();
  const family = await ctx.db
    .query("historyItems")
    .withIndex("by_owner_kind", (q) => q.eq("ownerId", ownerId).eq("kind", "family"))
    .collect();
  // The newest saved record (or finished visit) of each kind counts as "done".
  const lastRecordByType: Record<string, string> = {};
  const records = await ctx.db
    .query("healthRecords")
    .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
    .collect();
  for (const r of records) {
    if (r.status !== "saved") continue;
    if (!lastRecordByType[r.type] || r.date > lastRecordByType[r.type]) lastRecordByType[r.type] = r.date;
  }
  const tz = await coupleTimeZone(ctx);
  const visits = await ctx.db
    .query("appointments")
    .withIndex("by_owner_start", (q) => q.eq("ownerId", ownerId))
    .collect();
  for (const a of visits) {
    if (a.status !== "done") continue;
    const type = a.kind === "dental" ? "dental" : a.kind === "eye" ? "eye" : null;
    if (!type) continue;
    const d = localDate(a.start, tz);
    if (!lastRecordByType[type] || d > lastRecordByType[type]) lastRecordByType[type] = d;
  }
  const bpRecent = await ctx.db
    .query("vitals")
    .withIndex("by_owner_type_time", (q) => q.eq("ownerId", ownerId).eq("type", "bp"))
    .order("desc")
    .first();
  const bpOverride = overrides.find((o) => o.key === "bp");
  const effectiveOverrides = bpRecent
    ? [
        ...overrides.filter((o) => o.key !== "bp"),
        { ...bpOverride, key: "bp", lastDone: [bpOverride?.lastDone, localDate(bpRecent.time, tz)].filter(Boolean).sort().pop() },
      ]
    : overrides;

  return {
    ...preventionFor({
      dob: profile?.dob,
      sex: profile?.sexAtBirth,
      familyText: family.map((f) => `${f.name} ${f.notes ?? ""}`).join(" "),
      immunizations,
      overrides: effectiveOverrides,
      lastRecordByType,
      today,
    }),
    immunizations: immunizations.sort((a, b) => b.date.localeCompare(a.date)),
    missingProfile: !profile?.dob || !profile?.sexAtBirth,
  };
}

export const overview = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const today = localDate(Date.now(), await coupleTimeZone(ctx));
    const out = [];
    for (const reader of await readers(ctx, who)) {
      out.push({ userId: reader.userId, isMe: reader.isMe, ...(await preventionOf(ctx, reader.userId, today)) });
    }
    return out;
  },
});

export const addImmunization = mutation({
  args: {
    vaccine: v.string(),
    dose: v.optional(v.string()),
    date: v.string(),
    place: v.optional(v.string()),
    batch: v.optional(v.string()),
    recordId: v.optional(v.id("healthRecords")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (!VACCINES.some((x) => x.key === args.vaccine)) throw new Error("Unknown vaccine");
    if (!isDate(args.date)) throw new Error("That date isn't valid");
    return await ctx.db.insert("immunizations", {
      ...args,
      ownerId: me,
      dose: trimOrUndef(args.dose),
      place: trimOrUndef(args.place),
      batch: trimOrUndef(args.batch),
      notes: trimOrUndef(args.notes),
    });
  },
});

export const removeImmunization = mutation({
  args: { id: v.id("immunizations") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Vaccine record");
    await ctx.db.delete(id);
  },
});

/** Mark a screening done, change its interval, or switch it off. */
export const setScreening = mutation({
  args: {
    key: v.string(),
    lastDone: v.optional(v.string()),
    intervalMonths: v.optional(v.number()),
    disabled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (!SCREENINGS.some((s) => s.key === args.key) && !VACCINES.some((s) => s.key === args.key)) throw new Error("Unknown item");
    if (args.lastDone && !isDate(args.lastDone)) throw new Error("That date isn't valid");
    if (args.intervalMonths != null && !(args.intervalMonths >= 1 && args.intervalMonths <= 240)) throw new Error("Interval: 1 to 240 months");
    const existing = await ctx.db
      .query("preventive")
      .withIndex("by_owner_key", (q) => q.eq("ownerId", me).eq("key", args.key))
      .unique();
    const patch = Object.fromEntries(Object.entries(args).filter(([k, val]) => k !== "key" && val !== undefined));
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("preventive", { ownerId: me, key: args.key, ...patch });
  },
});

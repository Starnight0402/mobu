import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { coupleIds, levelForOwner, ownDoc, readers, requireText, trimOrUndef } from "./access";
import { isDate } from "./time";
import { whoV } from "./validators";

const kindV = v.union(
  v.literal("consult"),
  v.literal("test"),
  v.literal("dental"),
  v.literal("eye"),
  v.literal("vaccine"),
  v.literal("therapy"),
  v.literal("other"),
);

function forLevel(a: Doc<"appointments">, full: boolean) {
  return full
    ? a
    : { ...a, notes: undefined, diagnosis: undefined, questions: [], prepNotes: undefined, voiceStorageId: undefined };
}

export const list = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const out = [];
    for (const reader of await readers(ctx, who, "visits")) {
      const rows = await ctx.db
        .query("appointments")
        .withIndex("by_owner_start", (q) => q.eq("ownerId", reader.userId))
        .order("desc")
        .take(300);
      out.push(...rows.map((a) => ({ ...forLevel(a, reader.level === "full"), isMine: reader.isMe })));
    }
    return out.sort((a, b) => b.start - a.start);
  },
});

export const get = query({
  args: { id: v.id("appointments") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    const a = await ctx.db.get(id);
    if (!a) return null;
    const level = await levelForOwner(ctx, a.ownerId, "visits");
    const { me } = await coupleIds(ctx);
    const records = (
      await ctx.db
        .query("healthRecords")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", a.ownerId))
        .collect()
    )
      .filter((r) => r.visitId === id && r.status === "saved")
      .map((r) => ({ _id: r._id, title: r.title, type: r.type, date: r.date }));
    const provider = a.providerId ? await ctx.db.get(a.providerId) : null;
    const voiceUrl = a.voiceStorageId && level === "full" ? await ctx.storage.getUrl(a.voiceStorageId) : null;
    return { ...forLevel(a, level === "full"), isMine: a.ownerId === me, records, provider, voiceUrl, canEdit: a.ownerId === me };
  },
});

const fields = {
  title: v.string(),
  kind: kindV,
  doctor: v.optional(v.string()),
  specialty: v.optional(v.string()),
  providerId: v.optional(v.id("providers")),
  place: v.optional(v.string()),
  start: v.number(),
  isVideo: v.optional(v.boolean()),
  fastingFrom: v.optional(v.number()),
  prepNotes: v.optional(v.string()),
  bring: v.optional(v.array(v.string())),
  companion: v.optional(v.boolean()),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (args.fastingFrom != null && args.fastingFrom >= args.start) throw new Error("Fasting has to start before the appointment");
    return await ctx.db.insert("appointments", {
      ...args,
      ownerId: me,
      title: requireText(args.title, "Title"),
      doctor: trimOrUndef(args.doctor),
      specialty: trimOrUndef(args.specialty),
      place: trimOrUndef(args.place),
      prepNotes: trimOrUndef(args.prepNotes),
      status: args.start < Date.now() - 6 * 3_600_000 ? "done" : "upcoming",
      bring: (args.bring ?? []).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })),
      questions: [],
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("appointments"),
    title: v.optional(v.string()),
    kind: v.optional(kindV),
    doctor: v.optional(v.string()),
    specialty: v.optional(v.string()),
    providerId: v.optional(v.id("providers")),
    place: v.optional(v.string()),
    start: v.optional(v.number()),
    isVideo: v.optional(v.boolean()),
    fastingFrom: v.optional(v.number()),
    prepNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    followUp: v.optional(v.string()),
    fee: v.optional(v.number()),
    expenseId: v.optional(v.id("expenses")),
    voiceStorageId: v.optional(v.id("_storage")),
    status: v.optional(v.union(v.literal("upcoming"), v.literal("done"), v.literal("cancelled"))),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await ownDoc(ctx, await ctx.db.get(id), "Visit");
    if (args.title !== undefined) args.title = requireText(args.title, "Title");
    if (args.followUp && !isDate(args.followUp)) throw new Error("Follow-up date isn't valid");
    if (args.fee != null && !(args.fee >= 0)) throw new Error("Fee can't be negative");
    if (args.voiceStorageId && a.voiceStorageId && a.voiceStorageId !== args.voiceStorageId) {
      await ctx.storage.delete(a.voiceStorageId);
    }
    await ctx.db.patch(id, args);
  },
});

export const remove = mutation({
  args: { id: v.id("appointments") },
  handler: async (ctx, { id }) => {
    const a = await ownDoc(ctx, await ctx.db.get(id), "Visit");
    if (a.voiceStorageId) await ctx.storage.delete(a.voiceStorageId);
    for (const r of (await ctx.db
      .query("healthRecords")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", a.ownerId))
      .collect()).filter((r) => r.visitId === id)) {
      await ctx.db.patch(r._id, { visitId: undefined });
    }
    await ctx.db.delete(id);
  },
});

/** Both of you can add questions and tick the lists, on either person's visit. */
async function collaborative(ctx: Parameters<typeof levelForOwner>[0], id: Doc<"appointments">["_id"]) {
  await coupleIds(ctx);
  const a = await ctx.db.get(id);
  if (!a) throw new Error("Visit not found");
  const level = await levelForOwner(ctx, a.ownerId, "visits");
  if (level !== "full") throw new Error("Only a summary of this visit is shared with you");
  return a;
}

export const addItem = mutation({
  args: { id: v.id("appointments"), list: v.union(v.literal("bring"), v.literal("questions")), text: v.string() },
  handler: async (ctx, { id, list, text }) => {
    const a = await collaborative(ctx, id);
    const { me } = await coupleIds(ctx);
    const t = requireText(text, "Text", 300);
    if (list === "bring") await ctx.db.patch(id, { bring: [...a.bring, { text: t, done: false }].slice(0, 50) });
    else await ctx.db.patch(id, { questions: [...a.questions, { text: t, done: false, by: me }].slice(0, 50) });
  },
});

export const toggleItem = mutation({
  args: { id: v.id("appointments"), list: v.union(v.literal("bring"), v.literal("questions")), index: v.number() },
  handler: async (ctx, { id, list, index }) => {
    const a = await collaborative(ctx, id);
    const items = [...a[list]];
    if (!items[index]) return;
    items[index] = { ...items[index], done: !items[index].done };
    await ctx.db.patch(id, { [list]: items });
  },
});

export const removeItem = mutation({
  args: { id: v.id("appointments"), list: v.union(v.literal("bring"), v.literal("questions")), index: v.number() },
  handler: async (ctx, { id, list, index }) => {
    const a = await collaborative(ctx, id);
    await ctx.db.patch(id, { [list]: a[list].filter((_, i) => i !== index) });
  },
});

/** "I'm coming along": either person can set it. */
export const setCompanion = mutation({
  args: { id: v.id("appointments"), value: v.boolean() },
  handler: async (ctx, { id, value }) => {
    await collaborative(ctx, id);
    await ctx.db.patch(id, { companion: value });
  },
});

/* ---------------- Doctors, labs, pharmacies, hospitals (shared) ---------------- */

const providerKindV = v.union(
  v.literal("doctor"),
  v.literal("lab"),
  v.literal("pharmacy"),
  v.literal("hospital"),
  v.literal("dentist"),
  v.literal("clinic"),
  v.literal("other"),
);

const providerFields = {
  kind: providerKindV,
  name: v.string(),
  specialty: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(v.string()),
  cashless: v.optional(v.boolean()),
  patients: v.array(v.id("users")),
  notes: v.optional(v.string()),
};

export const providers = query({
  args: {},
  handler: async (ctx) => {
    const { me, partner } = await coupleIds(ctx);
    const rows = await ctx.db.query("providers").collect();
    const visits = [
      ...(await ctx.db.query("appointments").withIndex("by_owner_start", (q) => q.eq("ownerId", me)).collect()),
      ...(partner
        ? await ctx.db.query("appointments").withIndex("by_owner_start", (q) => q.eq("ownerId", partner._id)).collect()
        : []),
    ];
    return rows
      .map((p) => {
        const seen = visits.filter((a) => a.providerId === p._id && a.status === "done");
        return { ...p, visits: seen.length, lastVisit: seen.reduce((mx, a) => Math.max(mx, a.start), 0) || null };
      })
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  },
});

export const addProvider = mutation({
  args: providerFields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.insert("providers", {
      ...args,
      name: requireText(args.name, "Name", 120),
      specialty: trimOrUndef(args.specialty),
      phone: trimOrUndef(args.phone),
      address: trimOrUndef(args.address),
      notes: trimOrUndef(args.notes),
      addedBy: me,
    });
  },
});

export const updateProvider = mutation({
  args: { id: v.id("providers"), ...providerFields },
  handler: async (ctx, { id, ...args }) => {
    await coupleIds(ctx);
    if (!(await ctx.db.get(id))) throw new Error("Not found");
    await ctx.db.patch(id, {
      ...args,
      name: requireText(args.name, "Name", 120),
      specialty: trimOrUndef(args.specialty),
      phone: trimOrUndef(args.phone),
      address: trimOrUndef(args.address),
      notes: trimOrUndef(args.notes),
    });
  },
});

export const removeProvider = mutation({
  args: { id: v.id("providers") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

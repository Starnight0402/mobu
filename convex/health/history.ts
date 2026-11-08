import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { coupleIds, ownDoc, readers, requireText, trimOrUndef } from "./access";
import { isDate } from "./time";
import { eyeV, historyKindV, severityV, whoV } from "./validators";

/*
 * Conditions, allergies, surgeries, hospital stays, injuries, implants and
 * family history, plus glasses prescriptions. Always visible to both: it's the
 * background a doctor (or an ER) asks the partner for.
 */

export const list = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const out = [];
    for (const reader of await readers(ctx, who)) {
      const items = await ctx.db
        .query("historyItems")
        .withIndex("by_owner_kind", (q) => q.eq("ownerId", reader.userId))
        .collect();
      const eyes = (
        await ctx.db
          .query("eyePrescriptions")
          .withIndex("by_owner", (q) => q.eq("ownerId", reader.userId))
          .collect()
      ).sort((a, b) => b.date.localeCompare(a.date));
      out.push({
        userId: reader.userId,
        isMe: reader.isMe,
        items: items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
        eyes,
      });
    }
    return out;
  },
});

const fields = {
  kind: historyKindV,
  name: v.string(),
  status: v.optional(v.union(v.literal("active"), v.literal("improving"), v.literal("resolved"))),
  severity: v.optional(severityV),
  category: v.optional(v.union(v.literal("medicine"), v.literal("food"), v.literal("environment"), v.literal("other"))),
  reaction: v.optional(v.string()),
  date: v.optional(v.string()),
  endDate: v.optional(v.string()),
  relative: v.optional(v.string()),
  ageAtOnset: v.optional(v.number()),
  place: v.optional(v.string()),
  doctor: v.optional(v.string()),
  notes: v.optional(v.string()),
};

function clean<T extends { name: string; date?: string; endDate?: string; reaction?: string; relative?: string; place?: string; doctor?: string; notes?: string; ageAtOnset?: number; kind: string }>(a: T) {
  for (const d of [a.date, a.endDate]) if (d && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d)) throw new Error("Dates look like 2024, 2024-09 or 2024-09-12");
  if (a.kind === "family" && !a.relative?.trim()) throw new Error("Say which relative");
  if (a.ageAtOnset != null && !(a.ageAtOnset >= 0 && a.ageAtOnset < 120)) throw new Error("Age doesn't look right");
  return {
    ...a,
    name: requireText(a.name, "Name", 160),
    reaction: trimOrUndef(a.reaction),
    relative: trimOrUndef(a.relative),
    place: trimOrUndef(a.place),
    doctor: trimOrUndef(a.doctor),
    notes: trimOrUndef(a.notes),
  };
}

export const add = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.insert("historyItems", { ...clean(args), ownerId: me });
  },
});

export const update = mutation({
  args: { id: v.id("historyItems"), ...fields },
  handler: async (ctx, { id, ...args }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Item");
    await ctx.db.replace(id, { ...clean(args), ownerId: (await ctx.db.get(id))!.ownerId });
  },
});

export const remove = mutation({
  args: { id: v.id("historyItems") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Item");
    await ctx.db.delete(id);
  },
});

export const addEye = mutation({
  args: {
    date: v.string(),
    kind: v.union(v.literal("glasses"), v.literal("contacts")),
    right: eyeV,
    left: eyeV,
    pd: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (!isDate(args.date)) throw new Error("That date isn't valid");
    for (const e of [args.right, args.left]) {
      if (e.sph != null && Math.abs(e.sph) > 30) throw new Error("SPH looks wrong");
      if (e.cyl != null && Math.abs(e.cyl) > 10) throw new Error("CYL looks wrong");
      if (e.axis != null && !(e.axis >= 0 && e.axis <= 180)) throw new Error("Axis is 0 to 180");
    }
    return await ctx.db.insert("eyePrescriptions", { ...args, notes: trimOrUndef(args.notes), ownerId: me });
  },
});

export const removeEye = mutation({
  args: { id: v.id("eyePrescriptions") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Prescription");
    await ctx.db.delete(id);
  },
});

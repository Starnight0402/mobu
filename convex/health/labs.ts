import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { mutation, query, QueryCtx } from "../_generated/server";
import { coupleIds, levelForOwner, ownDoc, readers, trimOrUndef } from "./access";
import { flagFor, PANELS, testFor } from "./labLogic";
import { insertResult } from "./records";
import { isDate } from "./time";
import { flagV, whoV } from "./validators";

async function targetsFor(ctx: QueryCtx, ownerId: Id<"users">) {
  const rows = await ctx.db
    .query("labTargets")
    .withIndex("by_owner_code", (q) => q.eq("ownerId", ownerId))
    .collect();
  return new Map(rows.map((t) => [t.code, t]));
}

function judged(r: Doc<"labResults">, target?: Doc<"labTargets">) {
  return flagFor(r.value, r.refLow, r.refHigh, target) ?? r.flag;
}

/** Every marker per person: latest value, its flag and a short history. */
export const overview = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const people = [];
    for (const reader of await readers(ctx, who, "records")) {
      const results = await ctx.db
        .query("labResults")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", reader.userId))
        .collect();
      const targets = await targetsFor(ctx, reader.userId);
      const byCode = new Map<string, Doc<"labResults">[]>();
      for (const r of results) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
      const markers = [...byCode.entries()].map(([code, rows]) => {
        rows.sort((a, b) => a.date.localeCompare(b.date) || a._creationTime - b._creationTime);
        const latest = rows[rows.length - 1];
        const test = testFor(code, latest.name);
        const target = targets.get(code);
        return {
          code,
          name: test.code.startsWith("x:") ? latest.name : test.name,
          panel: latest.panel || test.panel,
          unit: latest.unit ?? test.unit,
          latest: {
            value: latest.value,
            valueText: latest.valueText,
            date: latest.date,
            refLow: target?.low ?? latest.refLow,
            refHigh: target?.high ?? latest.refHigh,
            flag: judged(latest, target),
          },
          history: rows.filter((r) => r.value != null).map((r) => ({ date: r.date, value: r.value as number })),
          count: rows.length,
          hasTarget: !!target,
        };
      });
      const panelOrder = (p: string) => (PANELS as string[]).indexOf(p);
      markers.sort((a, b) => panelOrder(a.panel) - panelOrder(b.panel) || a.name.localeCompare(b.name));
      const out = markers.filter((m) => m.latest.flag === "high" || m.latest.flag === "low" || m.latest.flag === "abnormal").length;
      const near = markers.filter((m) => m.latest.flag === "borderline").length;
      const last = results.map((r) => r.date).sort().pop();
      people.push({ userId: reader.userId, isMe: reader.isMe, markers, counts: { tracked: markers.length, out, near }, lastTest: last });
    }
    return people;
  },
});

/** One marker over time, with the report each point came from. */
export const marker = query({
  args: { ownerId: v.id("users"), code: v.string() },
  handler: async (ctx, { ownerId, code }) => {
    await levelForOwner(ctx, ownerId, "records");
    const { me } = await coupleIds(ctx);
    const rows = (
      await ctx.db
        .query("labResults")
        .withIndex("by_owner_code", (q) => q.eq("ownerId", ownerId).eq("code", code))
        .collect()
    ).sort((a, b) => a.date.localeCompare(b.date));
    const target = (await targetsFor(ctx, ownerId)).get(code);
    const test = testFor(code, rows[0]?.name);
    const results = await Promise.all(
      rows.map(async (r) => {
        const rec = r.recordId ? await ctx.db.get(r.recordId) : null;
        return {
          _id: r._id,
          date: r.date,
          value: r.value,
          valueText: r.valueText,
          unit: r.unit,
          refLow: r.refLow,
          refHigh: r.refHigh,
          refText: r.refText,
          flag: judged(r, target),
          source: r.source,
          recordId: r.recordId,
          lab: rec?.provider,
          recordTitle: rec?.title,
        };
      }),
    );
    // Medicines that started during this marker's history, to mark on the chart.
    const meds = (
      await ctx.db
        .query("medications")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).map((m) => ({ name: m.name, start: m.schedule.startDate, purpose: m.purpose }));
    return {
      code,
      name: code.startsWith("x:") ? rows[0]?.name ?? code : test.name,
      panel: test.panel,
      unit: rows[rows.length - 1]?.unit ?? test.unit,
      loinc: test.loinc,
      about: test.about,
      si: test.si ?? null,
      target: target ? { low: target.low, high: target.high, setBy: target.setBy, note: target.note } : null,
      results,
      meds,
      isMine: ownerId === me,
    };
  },
});

export const setTarget = mutation({
  args: {
    code: v.string(),
    low: v.optional(v.number()),
    high: v.optional(v.number()),
    setBy: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    if (args.low == null && args.high == null) throw new Error("Set a lower or an upper limit");
    if (args.low != null && args.high != null && args.low >= args.high) throw new Error("The lower limit must be below the upper one");
    const existing = await ctx.db
      .query("labTargets")
      .withIndex("by_owner_code", (q) => q.eq("ownerId", me).eq("code", args.code))
      .unique();
    const doc = { low: args.low, high: args.high, setBy: trimOrUndef(args.setBy), note: trimOrUndef(args.note) };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("labTargets", { ownerId: me, code: args.code, ...doc });
  },
});

export const clearTarget = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { me } = await coupleIds(ctx);
    const existing = await ctx.db
      .query("labTargets")
      .withIndex("by_owner_code", (q) => q.eq("ownerId", me).eq("code", code))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** A value from somewhere without a report: a pharmacy, a health camp. */
export const addManual = mutation({
  args: {
    code: v.optional(v.string()),
    name: v.string(),
    date: v.string(),
    value: v.optional(v.number()),
    valueText: v.optional(v.string()),
    unit: v.optional(v.string()),
    refLow: v.optional(v.number()),
    refHigh: v.optional(v.number()),
    refText: v.optional(v.string()),
    flag: v.optional(flagV),
  },
  handler: async (ctx, { date, ...r }) => {
    const { me } = await coupleIds(ctx);
    if (!isDate(date)) throw new Error("That date isn't valid");
    if (r.value == null && !r.valueText?.trim()) throw new Error("Enter a value");
    if (!r.name.trim()) throw new Error("Name the test");
    await insertResult(ctx, me, date, r, "manual");
  },
});

export const removeResult = mutation({
  args: { id: v.id("labResults") },
  handler: async (ctx, { id }) => {
    await ownDoc(ctx, await ctx.db.get(id), "Result");
    await ctx.db.delete(id);
  },
});

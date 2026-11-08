import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, query, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { coupleIds, profileOf } from "./access";
import { buildSearchText, insertResult } from "./records";
import { parseBundle } from "./fhir";
import { UNIT } from "./vitals";

/*
 * Import a FHIR bundle (a .json file from a hospital, the ABHA app or another
 * health app): lab values, vitals, conditions, allergies, procedures, vaccines,
 * medicines and any attached PDFs or images become Mobu records.
 */

const MAX_BUNDLE = 25 * 1024 * 1024;

interface ImportCounts {
  labs: number;
  vitals: number;
  history: number;
  vaccines: number;
  meds: number;
  documents: number;
}

export const importBundle = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }): Promise<ImportCounts> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Upload not found");
    try {
      if (blob.size > MAX_BUNDLE) throw new Error("This file is too large (25 MB max)");
      let json: unknown;
      try {
        json = JSON.parse(await blob.text());
      } catch {
        throw new Error("This file isn't JSON. FHIR exports end in .json");
      }
      const parsed = parseBundle(json);
      const docs: { title: string; date: string; type: string; storageId: Id<"_storage">; mime: string; size: number }[] = [];
      for (const d of parsed.documents.slice(0, 40)) {
        const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
        const id = await ctx.storage.store(new Blob([bytes], { type: d.mime }));
        docs.push({ title: d.title, date: d.date, type: d.type, storageId: id, mime: d.mime, size: bytes.length });
      }
      const counts: ImportCounts = await ctx.runMutation(internal.health.fhirImport.save, {
        userId,
        labs: parsed.labs.slice(0, 2000),
        vitals: parsed.vitals.filter((x) => Number.isFinite(x.time)).slice(0, 3000),
        history: parsed.history.slice(0, 500),
        vaccines: parsed.vaccines.slice(0, 200),
        meds: parsed.meds.slice(0, 200),
        docs,
      });
      return counts;
    } finally {
      await ctx.storage.delete(storageId);
    }
  },
});

export const save = internalMutation({
  args: {
    userId: v.id("users"),
    labs: v.array(
      v.object({
        code: v.optional(v.string()),
        name: v.string(),
        date: v.string(),
        value: v.optional(v.number()),
        valueText: v.optional(v.string()),
        unit: v.optional(v.string()),
        refLow: v.optional(v.number()),
        refHigh: v.optional(v.number()),
        refText: v.optional(v.string()),
      }),
    ),
    vitals: v.array(v.object({ type: v.string(), time: v.number(), value: v.number(), value2: v.optional(v.number()) })),
    history: v.array(
      v.object({
        kind: v.union(v.literal("condition"), v.literal("allergy"), v.literal("procedure"), v.literal("hospitalization")),
        name: v.string(),
        date: v.optional(v.string()),
        status: v.optional(v.union(v.literal("active"), v.literal("resolved"))),
        reaction: v.optional(v.string()),
        severity: v.optional(v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"))),
        category: v.optional(v.union(v.literal("medicine"), v.literal("food"), v.literal("environment"), v.literal("other"))),
      }),
    ),
    vaccines: v.array(v.object({ vaccine: v.string(), date: v.string(), dose: v.optional(v.string()), name: v.string() })),
    meds: v.array(v.object({ name: v.string(), instructions: v.optional(v.string()), active: v.boolean(), start: v.optional(v.string()) })),
    docs: v.array(
      v.object({ title: v.string(), date: v.string(), type: v.string(), storageId: v.id("_storage"), mime: v.string(), size: v.number() }),
    ),
  },
  handler: async (ctx, a): Promise<ImportCounts> => {
    const me = a.userId;
    const today = new Date().toISOString().slice(0, 10);
    const existingHistory = await ctx.db.query("historyItems").withIndex("by_owner_kind", (q) => q.eq("ownerId", me)).collect();
    const seen = new Set(existingHistory.map((h) => `${h.kind}:${h.name.toLowerCase()}`));
    let history = 0;
    for (const h of a.history) {
      const key = `${h.kind}:${h.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await ctx.db.insert("historyItems", { ownerId: me, ...h, name: h.name.slice(0, 160) });
      history++;
    }
    const imms = await ctx.db.query("immunizations").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect();
    let vaccines = 0;
    for (const x of a.vaccines) {
      if (imms.some((i) => i.vaccine === x.vaccine && i.date === x.date)) continue;
      await ctx.db.insert("immunizations", { ownerId: me, vaccine: x.vaccine, date: x.date, dose: x.dose, notes: `Imported: ${x.name}` });
      vaccines++;
    }
    const meds = await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect();
    let medsAdded = 0;
    for (const m of a.meds) {
      if (meds.some((x) => x.name.toLowerCase() === m.name.toLowerCase())) continue;
      // Imported as "when needed" so nothing starts reminding until you set real times.
      await ctx.db.insert("medications", {
        ownerId: me,
        name: m.name.slice(0, 120),
        instructions: m.instructions,
        kind: "medicine",
        schedule: { type: "prn", times: [], startDate: m.start ?? today },
        active: m.active,
        stoppedAt: m.active ? undefined : today,
        stoppedReason: m.active ? undefined : "Imported from a record",
        nudgePartner: false,
      });
      medsAdded++;
    }
    // Lab values go on one "Imported results" record per date.
    const byDate = new Map<string, typeof a.labs>();
    for (const l of a.labs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
    for (const [date, labs] of byDate) {
      const doc = { ownerId: me, type: "lab" as const, title: "Imported lab results", date, files: [], status: "saved" as const, source: "fhir" as const };
      const rid = await ctx.db.insert("healthRecords", { ...doc, searchText: buildSearchText(doc, labs.map((l) => l.name)) });
      for (const l of labs) await insertResult(ctx, me, date, l, "fhir", rid);
    }
    let vitals = 0;
    for (const x of a.vitals) {
      const type = x.type as keyof typeof UNIT;
      if (!(type in UNIT)) continue;
      const hcId = `fhir:${type}:${x.time}`;
      const dup = await ctx.db.query("vitals").withIndex("by_owner_hc", (q) => q.eq("ownerId", me).eq("hcId", hcId)).unique();
      if (dup) continue;
      await ctx.db.insert("vitals", { ownerId: me, type, time: x.time, value: x.value, value2: x.value2, unit: UNIT[type], source: "Imported record", hcId });
      vitals++;
    }
    const recordTypes = ["lab", "imaging", "discharge", "consult", "prescription", "other"] as const;
    for (const d of a.docs) {
      const type = (recordTypes as readonly string[]).includes(d.type) ? (d.type as (typeof recordTypes)[number]) : "other";
      const doc = {
        ownerId: me,
        type,
        title: d.title.slice(0, 120),
        date: d.date,
        files: [{ storageId: d.storageId, name: d.title, mime: d.mime, size: d.size }],
        status: "saved" as const,
        source: "fhir" as const,
      };
      await ctx.db.insert("healthRecords", { ...doc, searchText: buildSearchText(doc) });
    }
    return { labs: a.labs.length, vitals, history, vaccines, meds: medsAdded, documents: a.docs.length };
  },
});

/** Everything of mine, for "Export" (JSON or, via fhir.buildBundle, FHIR). */
export const myExport = query({
  args: {},
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    return await exportMine(ctx, me);
  },
});

export async function exportMine(ctx: QueryCtx, me: Id<"users">) {
  {
    const user = await ctx.db.get(me);
    const [records, labs, vitals, meds, doses, visits, history, eyes, imms, symptoms, episodes, cycle, checkins, sessions] = await Promise.all([
      ctx.db.query("healthRecords").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("labResults").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("vitals").withIndex("by_owner_type_time", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("doseLogs").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("appointments").withIndex("by_owner_start", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("historyItems").withIndex("by_owner_kind", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("eyePrescriptions").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("immunizations").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("symptoms").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("episodes").withIndex("by_owner_start", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("cycleLogs").withIndex("by_owner_date", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("checkins").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).collect(),
      ctx.db.query("therapySessions").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect(),
    ]);
    const files = [];
    for (const r of records) {
      for (const f of r.files) files.push({ record: r.title, date: r.date, name: f.name, mime: f.mime, url: await ctx.storage.getUrl(f.storageId) });
    }
    return {
      exportedAt: new Date().toISOString(),
      name: user?.name ?? "",
      profile: await profileOf(ctx, me),
      records: records.map(({ extractionJson: _x, searchText: _s, ...r }) => r),
      labs,
      vitals,
      medications: meds,
      doseLogs: doses,
      appointments: visits,
      history,
      eyePrescriptions: eyes,
      immunizations: imms,
      symptoms,
      episodes,
      cycle,
      checkins,
      therapySessions: sessions,
      files,
    };
  }
}

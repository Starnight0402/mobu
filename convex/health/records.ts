import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { displayName } from "../authHelpers";
import { coupleIds, levelForOwner, ownDoc, readers, requireText, trimOrUndef } from "./access";
import { customCode, flagFor, LAB_BY_CODE, normaliseUnit, parseRange, testFor } from "./labLogic";
import { fileV, flagV, recordSourceV, recordStatusV, recordTypeV, whoV } from "./validators";
import { isDate } from "./time";

export const RECORD_TYPE_LABEL: Record<Doc<"healthRecords">["type"], string> = {
  lab: "Lab report",
  prescription: "Prescription",
  imaging: "Imaging",
  consult: "Consult note",
  discharge: "Discharge summary",
  vaccine: "Vaccine certificate",
  bill: "Bill",
  insurance: "Insurance",
  dental: "Dental",
  eye: "Eye",
  ecg: "ECG",
  other: "Other",
};

const MAX_FILES = 20;

export function buildSearchText(
  r: Pick<Doc<"healthRecords">, "title" | "provider" | "doctor" | "folder" | "notes" | "summary" | "type">,
  extra: string[] = [],
): string {
  return [RECORD_TYPE_LABEL[r.type], r.title, r.provider, r.doctor, r.folder, r.notes, r.summary, ...extra]
    .filter(Boolean)
    .join(" \n")
    .slice(0, 30_000);
}

async function flaggedCounts(ctx: { db: QueryCtx["db"] }, ownerId: Id<"users">) {
  const results = await ctx.db
    .query("labResults")
    .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
    .collect();
  const counts = new Map<string, number>();
  for (const r of results) {
    if (!r.recordId) continue;
    if (r.flag === "high" || r.flag === "low" || r.flag === "abnormal") {
      counts.set(r.recordId, (counts.get(r.recordId) ?? 0) + 1);
    }
  }
  return { counts, withResults: new Set(results.map((r) => r.recordId).filter(Boolean) as string[]) };
}

function rowFor(r: Doc<"healthRecords">, flagged: number, hasResults: boolean, full: boolean) {
  return {
    _id: r._id,
    ownerId: r.ownerId,
    type: r.type,
    title: r.title,
    date: r.date,
    provider: r.provider,
    doctor: full ? r.doctor : undefined,
    folder: r.folder,
    status: r.status,
    source: r.source,
    fileCount: r.files.length,
    flagged,
    hasResults,
    cost: full ? r.cost : undefined,
  };
}

/** Records for the list, newest first. Your own unfinished uploads included. */
export const list = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const out = [];
    for (const reader of await readers(ctx, who, "records")) {
      const rows = await ctx.db
        .query("healthRecords")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", reader.userId))
        .order("desc")
        .take(500);
      const { counts, withResults } = await flaggedCounts(ctx, reader.userId);
      for (const r of rows) {
        if (!reader.isMe && r.status !== "saved") continue;
        out.push(rowFor(r, counts.get(r._id) ?? 0, withResults.has(r._id), reader.level === "full"));
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  },
});

/** Full-text search across the text inside reports. */
export const search = query({
  args: { who: whoV, q: v.string() },
  handler: async (ctx, { who, q }) => {
    const text = q.trim();
    if (!text) return [];
    const out = [];
    for (const reader of await readers(ctx, who, "records")) {
      const hits = await ctx.db
        .query("healthRecords")
        .withSearchIndex("search", (s) => s.search("searchText", text).eq("ownerId", reader.userId))
        .take(30);
      const { counts, withResults } = await flaggedCounts(ctx, reader.userId);
      for (const r of hits) {
        if (!reader.isMe && r.status !== "saved") continue;
        out.push(rowFor(r, counts.get(r._id) ?? 0, withResults.has(r._id), reader.level === "full"));
      }
    }
    return out;
  },
});

export const folders = query({
  args: { who: whoV },
  handler: async (ctx, { who }) => {
    const counts = new Map<string, number>();
    for (const reader of await readers(ctx, who, "records")) {
      const rows = await ctx.db
        .query("healthRecords")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", reader.userId))
        .collect();
      for (const r of rows) if (r.folder) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  },
});

export const get = query({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    const r = await ctx.db.get(id);
    if (!r) return null;
    const level = await levelForOwner(ctx, r.ownerId, "records");
    if (level !== "full") throw new Error("Only a summary of this record is shared with you");
    const { me } = await coupleIds(ctx);
    const files = await Promise.all(
      r.files.map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })),
    );
    const results = await ctx.db
      .query("labResults")
      .withIndex("by_record", (q) => q.eq("recordId", id))
      .collect();
    const visit = r.visitId ? await ctx.db.get(r.visitId) : null;
    return {
      ...r,
      isMine: r.ownerId === me,
      files,
      results: results.map((x) => ({ ...x, panel: x.panel || testFor(x.code).panel })),
      visit: visit ? { _id: visit._id, title: visit.title, start: visit.start, doctor: visit.doctor } : null,
    };
  },
});

/** My uploads that are being read or are waiting for me to check them. */
export const pending = query({
  args: {},
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    const rows = [];
    for (const status of ["processing", "review", "failed"] as const) {
      rows.push(
        ...(await ctx.db
          .query("healthRecords")
          .withIndex("by_owner_status", (q) => q.eq("ownerId", me).eq("status", status))
          .collect()),
      );
    }
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((r) => ({ _id: r._id, title: r.title, status: r.status, error: r.error, date: r.date, type: r.type }));
  },
});

export const create = mutation({
  args: {
    files: v.array(fileV),
    type: v.optional(recordTypeV),
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    provider: v.optional(v.string()),
    doctor: v.optional(v.string()),
    folder: v.optional(v.string()),
    visitId: v.optional(v.id("appointments")),
    notes: v.optional(v.string()),
    source: recordSourceV,
    /** Read the document with AI and hold it for review before saving. */
    read: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    const profile = await ctx.db.query("healthProfiles").withIndex("by_owner", (q) => q.eq("ownerId", me)).unique();
    if (profile?.aiReading === false) args.read = false;
    if (args.files.length > MAX_FILES) throw new Error(`Up to ${MAX_FILES} pages per record`);
    if (!args.read && args.files.length === 0 && !args.title?.trim()) throw new Error("Add a file or a title");
    if (args.date && !isDate(args.date)) throw new Error("That date isn't valid");
    if (args.visitId) await ownDoc(ctx, await ctx.db.get(args.visitId), "Visit");
    const doc = {
      ownerId: me,
      type: args.type ?? "other",
      title: trimOrUndef(args.title) ?? (args.read ? "Reading…" : "Untitled record"),
      date: args.date ?? new Date().toISOString().slice(0, 10),
      provider: trimOrUndef(args.provider),
      doctor: trimOrUndef(args.doctor),
      folder: trimOrUndef(args.folder),
      visitId: args.visitId,
      notes: trimOrUndef(args.notes),
      files: args.files,
      source: args.source,
      status: (args.read && args.files.length ? "processing" : "saved") as Doc<"healthRecords">["status"],
    };
    const id = await ctx.db.insert("healthRecords", { ...doc, searchText: buildSearchText(doc) });
    if (doc.status === "processing") await ctx.scheduler.runAfter(0, internal.health.extract.run, { id });
    return id;
  },
});

export const reread = mutation({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    const r = await ownDoc(ctx, await ctx.db.get(id), "Record");
    if (!r.files.length) throw new Error("This record has no file to read");
    await ctx.db.patch(id, { status: "processing", error: undefined });
    await ctx.scheduler.runAfter(0, internal.health.extract.run, { id });
  },
});

const resultInputV = v.object({
  code: v.optional(v.string()),
  name: v.string(),
  value: v.optional(v.number()),
  valueText: v.optional(v.string()),
  unit: v.optional(v.string()),
  refLow: v.optional(v.number()),
  refHigh: v.optional(v.number()),
  refText: v.optional(v.string()),
  flag: v.optional(flagV),
});

export type ResultInput = {
  code?: string;
  name: string;
  value?: number;
  valueText?: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  flag?: Doc<"labResults">["flag"];
};

/** Normalises one printed result and writes it. Shared with manual entry and FHIR import. */
export async function insertResult(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  date: string,
  r: ResultInput,
  source: Doc<"labResults">["source"],
  recordId?: Id<"healthRecords">,
) {
  const name = r.name.trim().slice(0, 120);
  if (!name) return;
  const code = r.code && (LAB_BY_CODE[r.code] || r.code.startsWith("x:")) ? r.code : customCode(name);
  const test = testFor(code, name);
  let { value, unit } = r;
  let { refLow, refHigh } = r;
  if (refLow == null && refHigh == null && r.refText) ({ low: refLow, high: refHigh } = parseRange(r.refText));
  if (value != null) {
    const n = normaliseUnit(code, value, unit);
    if (n.converted && test.si) {
      value = n.value;
      unit = n.unit;
      if (refLow != null) refLow = Math.round((refLow / test.si.factor) * 100) / 100;
      if (refHigh != null) refHigh = Math.round((refHigh / test.si.factor) * 100) / 100;
    }
  }
  const target = await ctx.db
    .query("labTargets")
    .withIndex("by_owner_code", (q) => q.eq("ownerId", ownerId).eq("code", code))
    .unique();
  const computed = flagFor(value, refLow, refHigh, target);
  await ctx.db.insert("labResults", {
    ownerId,
    recordId,
    date,
    code,
    name,
    panel: test.panel,
    value,
    valueText: trimOrUndef(r.valueText),
    unit: trimOrUndef(unit),
    refLow,
    refHigh,
    refText: trimOrUndef(r.refText),
    // Text results (urine "Trace", "Positive") keep the flag the report printed.
    flag: computed ?? r.flag,
    source,
  });
}

/** Saves a reviewed record: its details, and the values you confirmed. */
export const saveReview = mutation({
  args: {
    id: v.id("healthRecords"),
    type: recordTypeV,
    title: v.string(),
    date: v.string(),
    provider: v.optional(v.string()),
    doctor: v.optional(v.string()),
    folder: v.optional(v.string()),
    visitId: v.optional(v.id("appointments")),
    notes: v.optional(v.string()),
    cost: v.optional(v.number()),
    preventive: v.optional(v.boolean()),
    results: v.array(resultInputV),
    vaccines: v.optional(v.array(v.object({ vaccine: v.string(), dose: v.optional(v.string()), date: v.string() }))),
  },
  handler: async (ctx, args) => {
    const r = await ownDoc(ctx, await ctx.db.get(args.id), "Record");
    if (!isDate(args.date)) throw new Error("That date isn't valid");
    if (args.results.length > 300) throw new Error("Too many values in one record");
    if (args.cost != null && !(args.cost >= 0)) throw new Error("Cost can't be negative");
    const title = requireText(args.title, "Title");

    for (const old of await ctx.db
      .query("labResults")
      .withIndex("by_record", (q) => q.eq("recordId", args.id))
      .collect()) {
      await ctx.db.delete(old._id);
    }
    for (const res of args.results) await insertResult(ctx, r.ownerId, args.date, res, "report", args.id);
    for (const vac of args.vaccines ?? []) {
      if (!isDate(vac.date)) continue;
      await ctx.db.insert("immunizations", {
        ownerId: r.ownerId,
        vaccine: vac.vaccine,
        dose: trimOrUndef(vac.dose),
        date: vac.date,
        recordId: args.id,
      });
    }
    const patch = {
      type: args.type,
      title,
      date: args.date,
      provider: trimOrUndef(args.provider),
      doctor: trimOrUndef(args.doctor),
      folder: trimOrUndef(args.folder),
      visitId: args.visitId,
      notes: trimOrUndef(args.notes),
      cost: args.cost,
      preventive: args.preventive,
      status: "saved" as const,
      error: undefined,
    };
    await ctx.db.patch(args.id, {
      ...patch,
      searchText: buildSearchText(
        { ...patch, summary: r.summary },
        args.results.map((x) => `${x.name} ${x.value ?? x.valueText ?? ""} ${x.unit ?? ""}`),
      ),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("healthRecords"),
    type: v.optional(recordTypeV),
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    provider: v.optional(v.string()),
    doctor: v.optional(v.string()),
    folder: v.optional(v.string()),
    visitId: v.optional(v.id("appointments")),
    notes: v.optional(v.string()),
    cost: v.optional(v.number()),
    expenseId: v.optional(v.id("expenses")),
    addFiles: v.optional(v.array(fileV)),
  },
  handler: async (ctx, { id, addFiles, ...args }) => {
    const r = await ownDoc(ctx, await ctx.db.get(id), "Record");
    if (args.date && !isDate(args.date)) throw new Error("That date isn't valid");
    if (args.title !== undefined) args.title = requireText(args.title, "Title");
    const files = addFiles ? [...r.files, ...addFiles].slice(0, MAX_FILES) : r.files;
    const next = { ...r, ...args, files };
    await ctx.db.patch(id, {
      ...args,
      files,
      folder: args.folder === undefined ? r.folder : trimOrUndef(args.folder),
      searchText: buildSearchText(next, [r.searchText]),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    const r = await ownDoc(ctx, await ctx.db.get(id), "Record");
    for (const f of r.files) await ctx.storage.delete(f.storageId).catch(() => {});
    for (const res of await ctx.db
      .query("labResults")
      .withIndex("by_record", (q) => q.eq("recordId", id))
      .collect()) {
      await ctx.db.delete(res._id);
    }
    for (const imm of (await ctx.db
      .query("immunizations")
      .withIndex("by_owner", (q) => q.eq("ownerId", r.ownerId))
      .collect()).filter((i) => i.recordId === id)) {
      await ctx.db.patch(imm._id, { recordId: undefined });
    }
    await ctx.db.delete(id);
  },
});

/** Logs that the partner opened one of your records (shown in Share -> Who looked). */
export const markViewed = mutation({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    const { me } = await coupleIds(ctx);
    const r = await ctx.db.get(id);
    if (!r || r.ownerId === me) return;
    await levelForOwner(ctx, r.ownerId, "records");
    const viewer = await ctx.db.get(me);
    const label = `${viewer ? displayName(viewer) : "Your partner"} viewed “${r.title}”`;
    const recent = await ctx.db
      .query("healthAccessLog")
      .withIndex("by_owner_at", (q) => q.eq("ownerId", r.ownerId).gt("at", Date.now() - 3_600_000))
      .collect();
    if (recent.some((x) => x.label === label)) return;
    await ctx.db.insert("healthAccessLog", { ownerId: r.ownerId, kind: "partner", label, at: Date.now() });
  },
});

/* ---------------- internal: the AI reader ---------------- */

export const forExtraction = internalQuery({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    const r = await ctx.db.get(id);
    if (!r) return null;
    const owner = await ctx.db.get(r.ownerId);
    return { record: r, ownerName: owner ? displayName(owner) : "" };
  },
});

export const setExtraction = internalMutation({
  args: {
    id: v.id("healthRecords"),
    status: recordStatusV,
    error: v.optional(v.string()),
    extractionJson: v.optional(v.string()),
    summary: v.optional(v.string()),
    questions: v.optional(v.array(v.string())),
    type: v.optional(recordTypeV),
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    provider: v.optional(v.string()),
    doctor: v.optional(v.string()),
    reportName: v.optional(v.string()),
    nameMatch: v.optional(v.union(v.literal("match"), v.literal("mismatch"), v.literal("unknown"))),
    rawText: v.optional(v.string()),
  },
  handler: async (ctx, { id, rawText, ...args }) => {
    const r = await ctx.db.get(id);
    if (!r) return;
    const patch = Object.fromEntries(Object.entries(args).filter(([, val]) => val !== undefined));
    const next = { ...r, ...patch };
    await ctx.db.patch(id, { ...patch, searchText: buildSearchText(next, rawText ? [rawText] : []) });
  },
});

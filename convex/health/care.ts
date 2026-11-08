import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { displayName } from "../authHelpers";
import { notifyUser } from "../notify";
import { coupleIds, requireText, trimOrUndef } from "./access";
import { DAY_MS } from "./time";
import { careKindV } from "./validators";

/*
 * Care mode: one of you is ill, the other is looking after them. Both phones
 * see and add to the same log, and the dose timer counts doses given from
 * either phone. Visible to both by design, whatever the sharing settings.
 */

const DEFAULT_LIMITS: { words: string[]; gapHours: number; maxPerDay: number }[] = [
  { words: ["paracetamol", "acetaminophen", "crocin", "dolo", "calpol"], gapHours: 4, maxPerDay: 4 },
  { words: ["ibuprofen", "brufen", "advil"], gapHours: 6, maxPerDay: 3 },
  { words: ["cetirizine", "levocetirizine", "loratadine", "fexofenadine"], gapHours: 24, maxPerDay: 1 },
];

function limitsFor(name: string, med?: Doc<"medications"> | null) {
  if (med?.prnMinGapHours || med?.prnMaxPerDay) return { gapHours: med.prnMinGapHours, maxPerDay: med.prnMaxPerDay };
  const n = name.toLowerCase();
  return DEFAULT_LIMITS.find((d) => d.words.some((w) => n.includes(w))) ?? null;
}

async function inCouple(ctx: Parameters<typeof coupleIds>[0], userId: Doc<"users">["_id"]) {
  const { me, partner } = await coupleIds(ctx);
  if (userId !== me && userId !== partner?._id) throw new Error("Not found");
  return { me, partner };
}

export const active = query({
  args: {},
  handler: async (ctx) => {
    const { me, partner } = await coupleIds(ctx);
    const ongoing = (await ctx.db.query("episodes").withIndex("by_status", (q) => q.eq("status", "ongoing")).collect()).filter(
      (e) => e.careMode && (e.ownerId === me || e.ownerId === partner?._id),
    );
    const out = [];
    const now = Date.now();
    for (const e of ongoing) {
      const logs = (
        await ctx.db
          .query("careLogs")
          .withIndex("by_episode_at", (q) => q.eq("episodeId", e._id))
          .collect()
      ).sort((a, b) => b.at - a.at);
      const users = new Map<string, string>();
      for (const id of new Set(logs.map((l) => l.loggedBy))) {
        const u = await ctx.db.get(id);
        users.set(id, id === me ? "You" : u ? displayName(u) : "Partner");
      }
      const timers = new Map<string, { medName: string; lastAt: number; countToday: number; nextAt: number | null; maxPerDay?: number }>();
      for (const l of logs) {
        if (l.kind !== "med" || !l.medName) continue;
        const key = l.medName.toLowerCase();
        const t = timers.get(key) ?? { medName: l.medName, lastAt: l.at, countToday: 0, nextAt: null };
        if (l.at >= now - DAY_MS) t.countToday++;
        timers.set(key, t);
      }
      for (const t of timers.values()) {
        const med = (await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", e.ownerId)).collect()).find(
          (m) => m.name.toLowerCase() === t.medName.toLowerCase(),
        );
        const lim = limitsFor(t.medName, med);
        if (lim?.gapHours) t.nextAt = t.lastAt + lim.gapHours * 3_600_000;
        if (lim?.maxPerDay) t.maxPerDay = lim.maxPerDay;
      }
      const patient = await ctx.db.get(e.ownerId);
      out.push({
        episode: e,
        patientName: e.ownerId === me ? "You" : patient ? displayName(patient) : "Partner",
        patientIsMe: e.ownerId === me,
        logs: logs.map((l) => ({ ...l, by: users.get(l.loggedBy) ?? "" })),
        timers: [...timers.values()],
        fluidsToday: logs.filter((l) => l.kind === "fluid" && l.at >= now - DAY_MS).reduce((s, l) => s + (l.value ?? 0), 0),
      });
    }
    return out;
  },
});

export const start = mutation({
  args: { patient: v.union(v.literal("me"), v.literal("partner")), title: v.string() },
  handler: async (ctx, { patient, title }) => {
    const { me, partner } = await coupleIds(ctx);
    const ownerId = patient === "me" ? me : partner?._id;
    if (!ownerId) throw new Error("No partner yet");
    const existing = (await ctx.db.query("episodes").withIndex("by_status", (q) => q.eq("status", "ongoing")).collect()).find(
      (e) => e.ownerId === ownerId && e.careMode,
    );
    if (existing) return existing._id;
    const id = await ctx.db.insert("episodes", {
      ownerId,
      title: requireText(title, "Name"),
      start: Date.now(),
      status: "ongoing",
      careMode: true,
      caregiverId: patient === "me" ? partner?._id : me,
    });
    const other = patient === "me" ? partner : await ctx.db.get(ownerId);
    const self = await ctx.db.get(me);
    if (other) {
      await notifyUser(ctx, {
        userId: other._id,
        kind: "health",
        title: patient === "me" ? `${self ? displayName(self) : "Your partner"} isn't feeling well` : "Care mode is on",
        body: patient === "me" ? "They started care mode. Their log is open for you." : `${self ? displayName(self) : "Your partner"} is looking after you`,
        tab: "health-care",
      });
    }
    return id;
  },
});

export const log = mutation({
  args: {
    episodeId: v.id("episodes"),
    kind: careKindV,
    value: v.optional(v.number()),
    unit: v.optional(v.string()),
    text: v.optional(v.string()),
    medId: v.optional(v.id("medications")),
    medName: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await coupleIds(ctx);
    const e = await ctx.db.get(args.episodeId);
    if (!e) throw new Error("Not found");
    const { me } = await inCouple(ctx, e.ownerId);
    if (e.status !== "ongoing") throw new Error("Care mode has ended");
    if (args.kind === "temp" && !(args.value != null && args.value >= 33 && args.value <= 43)) throw new Error("Temperature in °C, like 38.5");
    if (args.kind === "med" && !args.medName?.trim()) throw new Error("Which medicine?");
    if (args.kind === "fluid" && !(args.value != null && args.value > 0 && args.value <= 3000)) throw new Error("Fluids in ml");
    if ((args.kind === "note" || args.kind === "symptom" || args.kind === "food") && !args.text?.trim()) throw new Error("Write something");
    let medName = trimOrUndef(args.medName);
    if (args.medId) {
      const m = await ctx.db.get(args.medId);
      if (!m || m.ownerId !== e.ownerId) throw new Error("Medicine not found");
      medName = [m.name, m.strength].filter(Boolean).join(" ");
    }
    await ctx.db.insert("careLogs", {
      episodeId: args.episodeId,
      ownerId: e.ownerId,
      kind: args.kind,
      value: args.value,
      unit: args.unit ?? (args.kind === "temp" ? "°C" : args.kind === "fluid" ? "ml" : undefined),
      text: trimOrUndef(args.text),
      medId: args.medId,
      medName,
      at: args.at ?? Date.now(),
      loggedBy: me,
    });
  },
});

export const removeLog = mutation({
  args: { id: v.id("careLogs") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    const l = await ctx.db.get(id);
    if (!l) return;
    await inCouple(ctx, l.ownerId);
    await ctx.db.delete(id);
  },
});

export const end = mutation({
  args: { episodeId: v.id("episodes"), resolved: v.boolean() },
  handler: async (ctx, { episodeId, resolved }) => {
    await coupleIds(ctx);
    const e = await ctx.db.get(episodeId);
    if (!e) return;
    await inCouple(ctx, e.ownerId);
    await ctx.db.patch(episodeId, resolved ? { careMode: false, status: "resolved", end: Date.now() } : { careMode: false });
  },
});

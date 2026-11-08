import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../_generated/dataModel";
import { action, internalMutation, mutation, query, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { coupleIds, coupleTimeZone, trimOrUndef } from "./access";
import { medicalIdFor } from "./profile";
import { testFor } from "./labLogic";
import { addDays, localDate } from "./time";
import { describeSchedule } from "./schedule";

/*
 * View-only links for a doctor (or the Medical ID QR code). The page is served
 * by convex/http.ts at /health/share?t=<token>, needs no account, and shows
 * only what the owner picked. Tokens are 24 random bytes made in an action
 * (real randomness), each open is counted, and links expire or can be revoked.
 */

export const SCOPES = ["meds", "allergies", "conditions", "labs", "visits", "vitals", "care", "vaccines"] as const;

export const links = query({
  args: {},
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    const rows = await ctx.db.query("shareLinks").withIndex("by_owner", (q) => q.eq("ownerId", me)).collect();
    return rows.filter((r) => !r.revoked).sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const accessLog = query({
  args: {},
  handler: async (ctx) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.query("healthAccessLog").withIndex("by_owner_at", (q) => q.eq("ownerId", me)).order("desc").take(50);
  },
});

export const insertLink = internalMutation({
  args: {
    ownerId: v.id("users"),
    token: v.string(),
    kind: v.union(v.literal("doctor"), v.literal("medid")),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.kind === "medid") {
      // One live Medical ID link per person: a new one replaces the old.
      for (const old of await ctx.db.query("shareLinks").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).collect()) {
        if (old.kind === "medid" && !old.revoked) await ctx.db.patch(old._id, { revoked: true });
      }
    }
    await ctx.db.insert("shareLinks", { ...args, label: trimOrUndef(args.label), revoked: false, opens: 0 });
  },
});

export const createLink = action({
  args: {
    kind: v.union(v.literal("doctor"), v.literal("medid")),
    scopes: v.array(v.string()),
    hours: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ token: string; url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const scopes = args.scopes.filter((s) => (SCOPES as readonly string[]).includes(s));
    if (args.kind === "doctor" && !scopes.length) throw new Error("Pick at least one thing to share");
    if (args.hours != null && !(args.hours >= 1 && args.hours <= 24 * 30)) throw new Error("Links last 1 hour to 30 days");
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await ctx.runMutation(internal.health.sharing.insertLink, {
      ownerId: userId,
      token,
      kind: args.kind,
      scopes: args.kind === "medid" ? [] : scopes,
      expiresAt: args.kind === "doctor" ? Date.now() + (args.hours ?? 24) * 3_600_000 : undefined,
      label: args.label,
    });
    return { token, url: `${process.env.CONVEX_SITE_URL}/health/share?t=${token}` };
  },
});

export const revokeLink = mutation({
  args: { id: v.id("shareLinks") },
  handler: async (ctx, { id }) => {
    const { me } = await coupleIds(ctx);
    const l = await ctx.db.get(id);
    if (!l || l.ownerId !== me) throw new Error("Link not found");
    await ctx.db.patch(id, { revoked: true });
  },
});

async function pageFor(ctx: MutationCtx, ownerId: Id<"users">, kind: "doctor" | "medid", scopes: string[]) {
  const id = await medicalIdFor(ctx, ownerId);
  if (kind === "medid") return { kind, id };
  const tz = await coupleTimeZone(ctx);
  const today = localDate(Date.now(), tz);
  const has = (s: string) => scopes.includes(s);
  const out: Record<string, unknown> = { kind, id, scopes };
  if (has("meds")) {
    out.meds = (await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect())
      .filter((m) => m.active)
      .map((m) => ({ name: [m.name, m.strength].filter(Boolean).join(" "), schedule: describeSchedule(m.schedule), purpose: m.purpose, since: m.schedule.startDate }));
  }
  if (has("allergies") || has("conditions")) {
    const items = await ctx.db.query("historyItems").withIndex("by_owner_kind", (q) => q.eq("ownerId", ownerId)).collect();
    if (has("conditions"))
      out.history = items
        .filter((h) => h.kind !== "allergy")
        .map((h) => ({ kind: h.kind, name: h.name, status: h.status, date: h.date, relative: h.relative }));
  }
  if (has("labs")) {
    const since = addDays(today, -366);
    const rows = await ctx.db.query("labResults").withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId).gte("date", since)).collect();
    out.labs = rows
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => ({ date: r.date, name: testFor(r.code, r.name).code.startsWith("x:") ? r.name : testFor(r.code).name, value: r.value ?? r.valueText, unit: r.unit, ref: r.refText ?? [r.refLow, r.refHigh].filter((x) => x != null).join("–"), flag: r.flag }));
  }
  if (has("visits")) {
    const rows = await ctx.db.query("appointments").withIndex("by_owner_start", (q) => q.eq("ownerId", ownerId)).order("desc").take(30);
    out.visits = rows.map((a) => ({
      date: localDate(a.start, tz),
      title: a.title,
      doctor: a.doctor,
      status: a.status,
      diagnosis: a.diagnosis,
      questions: a.status === "upcoming" ? a.questions.filter((q) => !q.done).map((q) => q.text) : [],
    }));
  }
  if (has("vitals")) {
    const since = Date.now() - 90 * 86_400_000;
    const vit = [];
    for (const type of ["bp", "glucose", "weight", "restingHr", "spo2", "temp"] as const) {
      const rows = await ctx.db.query("vitals").withIndex("by_owner_type_time", (q) => q.eq("ownerId", ownerId).eq("type", type).gte("time", since)).collect();
      vit.push(...rows.slice(-20).map((r) => ({ type, date: localDate(r.time, tz), value: r.value2 != null ? `${r.value}/${r.value2}` : String(r.value), unit: r.unit, context: r.context })));
    }
    out.vitals = vit;
  }
  if (has("vaccines")) {
    out.vaccines = (await ctx.db.query("immunizations").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect()).map((i) => ({ vaccine: i.vaccine, dose: i.dose, date: i.date }));
  }
  if (has("care")) {
    const eps = (await ctx.db.query("episodes").withIndex("by_owner_start", (q) => q.eq("ownerId", ownerId)).order("desc").take(1))[0];
    if (eps) {
      const logs = await ctx.db.query("careLogs").withIndex("by_episode_at", (q) => q.eq("episodeId", eps._id)).collect();
      out.care = {
        title: eps.title,
        start: eps.start,
        logs: logs.sort((a, b) => a.at - b.at).map((l) => ({ at: l.at, kind: l.kind, value: l.value, unit: l.unit, text: l.text, medName: l.medName })),
        tz,
      };
    }
  }
  return out;
}

/** Called by the public page: validates the token, counts the open, returns the data. */
export const openLink = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!link || link.revoked) return { error: "This link isn't valid any more." };
    if (link.expiresAt && link.expiresAt < Date.now()) return { error: "This link has expired." };
    await ctx.db.patch(link._id, { opens: link.opens + 1, lastOpenedAt: Date.now() });
    await ctx.db.insert("healthAccessLog", {
      ownerId: link.ownerId,
      kind: "link",
      label: link.kind === "medid" ? "Medical ID card opened" : `${link.label ? `“${link.label}”` : "Doctor link"} opened`,
      at: Date.now(),
    });
    return { data: await pageFor(ctx, link.ownerId, link.kind, link.scopes), expiresAt: link.expiresAt };
  },
});

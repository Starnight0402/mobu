import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { displayName } from "../authHelpers";
import { coupleIds, coupleTimeZone, requireText, trimOrUndef } from "./access";
import { isDate, localDate } from "./time";
import { claimStageV, fileV } from "./validators";

/*
 * Health insurance (shared by the household), claims, what health has cost
 * (read from Split's expenses), and the Section 80D tax total.
 */

export const MEDICAL_CATEGORY = /medic|health|doctor|pharm|hospital|dental|dentist|clinic|lab|test|medicine|physio|therapy|optic|insurance/i;

/** Indian financial year (April to March) containing `date`. */
function fyStart(date: string) {
  const [y, m] = date.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const { me, partner } = await coupleIds(ctx);
    const tz = await coupleTimeZone(ctx);
    const today = localDate(Date.now(), tz);
    const names = new Map<string, string>();
    for (const u of [await ctx.db.get(me), partner]) if (u) names.set(u._id, u._id === me ? "You" : displayName(u));

    const policies = await ctx.db.query("insurancePolicies").collect();
    const out = [];
    for (const p of policies) {
      const claims = await ctx.db
        .query("claims")
        .withIndex("by_policy", (q) => q.eq("policyId", p._id))
        .collect();
      const files = await Promise.all(p.files.map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.storageId) })));
      const used = claims.filter((c) => c.stage === "paid" || c.stage === "approved").reduce((s, c) => s + (c.paid ?? c.approved ?? 0), 0);
      out.push({
        ...p,
        files,
        memberNames: p.members.map((m) => names.get(m) ?? "Partner"),
        claims: claims.map((c) => ({ ...c, patientName: names.get(c.patientId) ?? "Partner" })).sort((a, b) => (b.filedOn ?? "").localeCompare(a.filedOn ?? "")),
        used,
        daysToRenewal: p.renewal ? Math.round((Date.parse(p.renewal) - Date.parse(today)) / 86_400_000) : null,
      });
    }

    // Spend: Split expenses in a medical-looking category, this calendar year.
    const year = today.slice(0, 4);
    const expenses = (await ctx.db.query("expenses").collect()).filter((e) => {
      const d = localDate(e.spentAt ?? e._creationTime, tz);
      return d.startsWith(year) && MEDICAL_CATEGORY.test(e.category);
    });
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    const spend = {
      year,
      total: expenses.reduce((s, e) => s + e.amount, 0),
      currency: expenses[0]?.currency,
      byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    };

    // 80D (old regime): premiums for self, spouse and children up to ₹25,000,
    // within which up to ₹5,000 can be preventive health check-ups.
    const fy = fyStart(today);
    const premiums = policies
      .filter((p) => p.active && p.premium && p.kind !== "group" && p.members.some((m) => m === me || m === partner?._id))
      .reduce((s, p) => s + (p.premium ?? 0), 0);
    let preventiveSpend = 0;
    for (const uid of [me, partner?._id].filter(Boolean) as Id<"users">[]) {
      const recs = await ctx.db
        .query("healthRecords")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", uid).gte("date", fy))
        .collect();
      preventiveSpend += recs.filter((r) => r.preventive && r.cost).reduce((s, r) => s + (r.cost ?? 0), 0);
    }
    const preventive = Math.min(preventiveSpend, 5000);
    const deductible = Math.min(premiums + preventive, 25000);
    return {
      policies: out,
      spend,
      tax: { fyStart: fy, premiums, preventiveSpend, preventive, deductible, limit: 25000 },
    };
  },
});

const policyFields = {
  insurer: v.string(),
  plan: v.optional(v.string()),
  kind: v.union(v.literal("floater"), v.literal("individual"), v.literal("group"), v.literal("topup")),
  members: v.array(v.id("users")),
  sumInsured: v.optional(v.number()),
  premium: v.optional(v.number()),
  policyNumber: v.optional(v.string()),
  tpa: v.optional(v.string()),
  tpaPhone: v.optional(v.string()),
  start: v.optional(v.string()),
  renewal: v.optional(v.string()),
  waitingNotes: v.optional(v.string()),
  notes: v.optional(v.string()),
  files: v.optional(v.array(fileV)),
  active: v.optional(v.boolean()),
};

async function cleanPolicy(ctx: Parameters<typeof coupleIds>[0], a: { insurer: string; members: Id<"users">[]; start?: string; renewal?: string; sumInsured?: number; premium?: number; plan?: string; policyNumber?: string; tpa?: string; tpaPhone?: string; waitingNotes?: string; notes?: string }) {
  const { me, partner } = await coupleIds(ctx);
  if (!a.members.length) throw new Error("Pick who's covered");
  if (a.members.some((m) => m !== me && m !== partner?._id)) throw new Error("Members must be one of you");
  for (const d of [a.start, a.renewal]) if (d && !isDate(d)) throw new Error("Dates look like 2027-03-14");
  for (const n of [a.sumInsured, a.premium]) if (n != null && !(n >= 0)) throw new Error("Amounts can't be negative");
  return {
    insurer: requireText(a.insurer, "Insurer", 120),
    plan: trimOrUndef(a.plan),
    policyNumber: trimOrUndef(a.policyNumber),
    tpa: trimOrUndef(a.tpa),
    tpaPhone: trimOrUndef(a.tpaPhone),
    waitingNotes: trimOrUndef(a.waitingNotes),
    notes: trimOrUndef(a.notes),
  };
}

export const addPolicy = mutation({
  args: policyFields,
  handler: async (ctx, args) => {
    const { me } = await coupleIds(ctx);
    return await ctx.db.insert("insurancePolicies", {
      ...args,
      ...(await cleanPolicy(ctx, args)),
      files: args.files ?? [],
      active: args.active ?? true,
      addedBy: me,
    });
  },
});

export const updatePolicy = mutation({
  args: { id: v.id("insurancePolicies"), ...policyFields },
  handler: async (ctx, { id, ...args }) => {
    await coupleIds(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new Error("Policy not found");
    await ctx.db.patch(id, { ...args, ...(await cleanPolicy(ctx, args)), files: args.files ?? p.files, active: args.active ?? p.active });
  },
});

export const removePolicy = mutation({
  args: { id: v.id("insurancePolicies") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    const p = await ctx.db.get(id);
    if (!p) return;
    for (const f of p.files) await ctx.storage.delete(f.storageId).catch(() => {});
    for (const c of await ctx.db.query("claims").withIndex("by_policy", (q) => q.eq("policyId", id)).collect()) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
  },
});

const claimFields = {
  policyId: v.id("insurancePolicies"),
  patientId: v.id("users"),
  title: v.string(),
  kind: v.union(v.literal("cashless"), v.literal("reimbursement")),
  claimed: v.optional(v.number()),
  approved: v.optional(v.number()),
  paid: v.optional(v.number()),
  stage: claimStageV,
  filedOn: v.optional(v.string()),
  claimNumber: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const saveClaim = mutation({
  args: { id: v.optional(v.id("claims")), ...claimFields },
  handler: async (ctx, { id, ...args }) => {
    const { me, partner } = await coupleIds(ctx);
    if (!(await ctx.db.get(args.policyId))) throw new Error("Policy not found");
    if (args.patientId !== me && args.patientId !== partner?._id) throw new Error("Pick one of you");
    if (args.filedOn && !isDate(args.filedOn)) throw new Error("That date isn't valid");
    const doc = { ...args, title: requireText(args.title, "Title"), claimNumber: trimOrUndef(args.claimNumber), notes: trimOrUndef(args.notes) };
    if (id) {
      if (!(await ctx.db.get(id))) throw new Error("Claim not found");
      await ctx.db.patch(id, doc);
      return id;
    }
    return await ctx.db.insert("claims", doc);
  },
});

export const removeClaim = mutation({
  args: { id: v.id("claims") },
  handler: async (ctx, { id }) => {
    await coupleIds(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

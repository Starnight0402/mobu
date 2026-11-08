import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { partnerOf, requireUserId } from "../authHelpers";
import { safeTimeZone } from "./time";

/*
 * Who can see what.
 *
 * Each person decides, per category, what their partner sees of their health:
 * everything, a summary, dates only (cycle) or nothing. This module is the one
 * place that rule lives, and every health query goes through it, so it's
 * enforced on the server and can't be bypassed by a different client.
 *
 * Medical ID, history, prevention and insurance aren't in the list: they're
 * always visible to both, because they matter in an emergency.
 */

export type Who = "me" | "partner" | "both";
export type ShareCategory = "records" | "meds" | "visits" | "vitals" | "symptoms" | "cycle" | "mind";
export type Level = "full" | "summary" | "dates" | "hidden";

export const SHARE_CATEGORIES: ShareCategory[] = ["records", "meds", "visits", "vitals", "symptoms", "cycle", "mind"];

export const DEFAULT_LEVEL: Record<ShareCategory, Level> = {
  records: "full",
  meds: "full",
  visits: "full",
  vitals: "full",
  symptoms: "summary",
  cycle: "dates",
  mind: "hidden",
};

/** Levels that make sense per category, for validation and the settings UI. */
export const ALLOWED_LEVELS: Record<ShareCategory, Level[]> = {
  records: ["full", "summary", "hidden"],
  meds: ["full", "summary", "hidden"],
  visits: ["full", "summary", "hidden"],
  vitals: ["full", "hidden"],
  symptoms: ["full", "summary", "hidden"],
  cycle: ["full", "dates", "hidden"],
  mind: ["full", "summary", "hidden"],
};

type Ctx = QueryCtx | MutationCtx;

export async function sharingLevels(ctx: Ctx, ownerId: Id<"users">): Promise<Record<ShareCategory, Level>> {
  const rows = await ctx.db
    .query("healthSharing")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  const out = { ...DEFAULT_LEVEL };
  for (const r of rows) out[r.category] = r.level;
  return out;
}

export interface Reader {
  userId: Id<"users">;
  level: Level;
  isMe: boolean;
}

/**
 * The people whose rows the caller may read for `category`, with the level
 * each is visible at. Without a category (the always-shared areas) the
 * partner is fully visible.
 */
export async function readers(ctx: Ctx, who: Who, category?: ShareCategory): Promise<Reader[]> {
  const me = await requireUserId(ctx);
  const out: Reader[] = [];
  if (who !== "partner") out.push({ userId: me, level: "full", isMe: true });
  if (who !== "me") {
    const partner = await partnerOf(ctx, me);
    if (partner) {
      const level = category ? (await sharingLevels(ctx, partner._id))[category] : "full";
      if (level !== "hidden") out.push({ userId: partner._id, level, isMe: false });
    }
  }
  return out;
}

/** The level the caller sees `ownerId`'s rows at; throws if hidden. */
export async function levelForOwner(ctx: Ctx, ownerId: Id<"users">, category?: ShareCategory): Promise<Level> {
  const me = await requireUserId(ctx);
  if (ownerId === me) return "full";
  const partner = await partnerOf(ctx, me);
  if (!partner || partner._id !== ownerId) throw new Error("Not found");
  if (!category) return "full";
  const level = (await sharingLevels(ctx, ownerId))[category];
  if (level === "hidden") throw new Error("Not shared with you");
  return level;
}

/** Loads a per-person row the caller owns, for writing. */
export async function ownDoc<T extends { ownerId: Id<"users"> }>(
  ctx: Ctx,
  doc: T | null,
  what = "Item",
): Promise<T> {
  const me = await requireUserId(ctx);
  if (!doc) throw new Error(`${what} not found`);
  if (doc.ownerId !== me) throw new Error(`You can only change your own ${what.toLowerCase()}`);
  return doc;
}

export async function coupleIds(ctx: Ctx): Promise<{ me: Id<"users">; partner: Doc<"users"> | null }> {
  const me = await requireUserId(ctx);
  return { me, partner: await partnerOf(ctx, me) };
}

export async function coupleTimeZone(ctx: Ctx): Promise<string> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "timezone"))
    .unique();
  return safeTimeZone(row?.value);
}

export async function profileOf(ctx: Ctx, ownerId: Id<"users">) {
  return await ctx.db
    .query("healthProfiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

export const trimOrUndef = (s: string | undefined) => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function requireText(s: string, what: string, max = 200): string {
  const t = s.trim();
  if (!t) throw new Error(`${what} can't be empty`);
  if (t.length > max) throw new Error(`${what} is too long`);
  return t;
}

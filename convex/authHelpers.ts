import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  return userId;
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Not signed in");
  return user;
}

/**
 * The other half of the couple.
 *
 * "Any user that isn't me" only holds while the table has exactly two rows.
 * Signing in with an emailed code before auth linked accounts by email could
 * leave a second user row for the same person; then the plain lookup could
 * pick a stale row nobody signs in to, so calls, notifications and expense
 * attribution silently went to the wrong place for one partner. Skip rows
 * that share my email, and among the partner's rows use the one with the
 * newest session.
 */
export async function partnerOf(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const me = await ctx.db.get(userId);
  const others = (await ctx.db.query("users").collect()).filter(
    (u) => u._id !== userId && !(me?.email && u.email === me.email),
  );
  if (others.length <= 1) return others[0] ?? null;

  let best = others[0];
  let bestSeen = -1;
  for (const u of others) {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", u._id))
      .order("desc")
      .first();
    const seen = session?._creationTime ?? u._creationTime;
    if (seen > bestSeen) {
      best = u;
      bestSeen = seen;
    }
  }
  return best;
}

export function displayName(user: { name?: string; email?: string }): string {
  return user.name || user.email?.split("@")[0] || "Partner";
}

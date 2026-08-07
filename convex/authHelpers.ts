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

export function displayName(user: { name?: string; email?: string }): string {
  return user.name || user.email?.split("@")[0] || "Partner";
}

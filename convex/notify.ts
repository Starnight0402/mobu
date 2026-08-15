import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

export type NotificationKind =
  | "call"
  | "missed-call"
  | "message"
  | "expense"
  | "memory"
  | "checkin"
  | "goal"
  | "insight"
  | "capsule"
  | "streak"
  | "fight";

interface NotifyArgs {
  userId: Id<"users">;
  kind: NotificationKind;
  title: string;
  body: string;
  tab?: string;
  /** Calls ring rather than chime: they stay on screen until acted on. */
  urgent?: boolean;
}

export function displayNameOf(user: Doc<"users"> | null): string {
  return user?.name || user?.email?.split("@")[0] || "Your partner";
}

/**
 * Record a notification and fire the matching web push.
 *
 * Deliberately a plain helper rather than a Convex function so callers keep
 * their own transaction: if the mutation that triggered it rolls back, the
 * notification row rolls back with it and no push is scheduled.
 */
export async function notifyUser(ctx: MutationCtx, args: NotifyArgs) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
    tab: args.tab,
  });

  // Scheduled rather than awaited: a slow or failing push service must never
  // hold up (or fail) the write that triggered it.
  await ctx.scheduler.runAfter(0, internal.push.send, {
    userId: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
    tab: args.tab,
    urgent: args.urgent ?? false,
  });
}

/** The other half of the couple — everything here notifies exactly one person. */
export async function partnerOf(ctx: MutationCtx, userId: Id<"users">) {
  const all = await ctx.db.query("users").collect();
  return all.find((u) => u._id !== userId) ?? null;
}

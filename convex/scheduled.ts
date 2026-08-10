import { internalMutation } from "./_generated/server";
import { notifyUser } from "./notify";

const DAY_MS = 24 * 60 * 60 * 1000;

function isSameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
}

/**
 * Daily sweep for the notifications that aren't triggered by somebody doing
 * something: capsules coming due, a streak about to lapse, and a weekly nudge
 * toward the insights screen.
 *
 * Insights are computed on read rather than stored, so there's no "an insight
 * was created" event to hook — a weekly ping is the honest equivalent.
 */
export const dailyDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    if (users.length === 0) return;

    /* ------------------------------ capsules ------------------------------ */
    const capsules = await ctx.db.query("capsules").collect();
    for (const capsule of capsules) {
      const unlockAt = new Date(capsule.unlockDate).getTime();
      if (Number.isNaN(unlockAt)) continue;
      // Fires on the day it becomes available, once.
      if (!isSameDay(unlockAt, now)) continue;
      for (const user of users) {
        await notifyUser(ctx, {
          userId: user._id,
          kind: "capsule",
          title: "A time capsule just unlocked 🔓",
          body: capsule.title,
          tab: "capsules",
        });
      }
    }

    /* ------------------------------- streak ------------------------------- */
    const tracking = await ctx.db.query("tracking").collect();
    const loggedToday = new Set(
      tracking.filter((t) => isSameDay(t._creationTime, now)).map((t) => t.user),
    );
    const loggedYesterday = new Set(
      tracking.filter((t) => isSameDay(t._creationTime, now - DAY_MS)).map((t) => t.user),
    );

    // Only worth nudging if there's a run going that today would break.
    if (loggedYesterday.size >= 2) {
      for (const user of users) {
        const name = user.name || user.email?.split("@")[0] || "";
        if (name && !loggedToday.has(name)) {
          await notifyUser(ctx, {
            userId: user._id,
            kind: "streak",
            title: "Keep the streak alive",
            body: "You haven't logged anything today yet.",
            tab: "track",
          });
        }
      }
    }

    /* ------------------------------ insights ------------------------------ */
    if (new Date(now).getDay() === 0) {
      for (const user of users) {
        await notifyUser(ctx, {
          userId: user._id,
          kind: "insight",
          title: "Your week in review",
          body: "New patterns from the week are ready to look at.",
          tab: "insights",
        });
      }
    }
  },
});

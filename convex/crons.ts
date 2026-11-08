import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 13:30 UTC is 19:00 IST — early evening, when a "you haven't logged today"
// nudge is still actionable rather than a 3am buzz.
crons.daily(
  "daily digest",
  { hourUTC: 13, minuteUTC: 30 },
  internal.scheduled.dailyDigest,
);

// 18:35 UTC is 00:05 IST: just after midnight, so a rule due on the 1st is
// there when you wake up.
crons.daily(
  "recurring expenses",
  { hourUTC: 18, minuteUTC: 35 },
  internal.recurring.runDue,
);

// Health: dose times, the missed-dose nudge, fasting and appointment reminders.
crons.interval("health reminders", { minutes: 5 }, internal.health.reminders.tick);

// 02:30 UTC is 08:00 IST: refills, prevention, renewals, expiring medicines.
crons.daily("health daily", { hourUTC: 2, minuteUTC: 30 }, internal.health.reminders.daily);

export default crons;

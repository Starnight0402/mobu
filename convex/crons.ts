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

export default crons;

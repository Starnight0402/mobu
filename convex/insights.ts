import { query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

interface Insight {
  id: string;
  title: string;
  content: string;
  type: "pattern" | "trend" | "suggestion";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Genuinely computed from the couple's own data (no AI/LLM call) -- replaces
// the old hardcoded seed rows that never reflected anything real.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const insights: Insight[] = [];
    const now = Date.now();

    const tracking = await ctx.db.query("tracking").collect();
    const moods = tracking.filter((t) => t.type === "mood");
    const activities = tracking.filter((t) => t.type === "activity");

    // Mood trend: last 7 days vs the 7 before that.
    const recentMoods = moods.filter((m) => now - m._creationTime < 7 * DAY_MS);
    const priorMoods = moods.filter(
      (m) => now - m._creationTime >= 7 * DAY_MS && now - m._creationTime < 14 * DAY_MS,
    );
    if (recentMoods.length >= 2 && priorMoods.length >= 2) {
      const avg = (arr: typeof moods) => arr.reduce((s, m) => s + m.value, 0) / arr.length;
      const recentAvg = avg(recentMoods);
      const priorAvg = avg(priorMoods);
      const delta = recentAvg - priorAvg;
      if (Math.abs(delta) >= 0.5) {
        insights.push({
          id: "mood-trend",
          title: delta > 0 ? "Mood's been climbing" : "Mood's dipped a bit",
          content: `Average mood this week is ${recentAvg.toFixed(1)}/10, ${delta > 0 ? "up" : "down"} from ${priorAvg.toFixed(1)}/10 the week before.`,
          type: "trend",
        });
      }
    }

    // Most common activity.
    if (activities.length >= 3) {
      const counts = new Map<string, number>();
      for (const a of activities) {
        const key = a.category || "Other";
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const [topActivity, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      insights.push({
        id: "top-activity",
        title: `${topActivity} is your thing`,
        content: `You've logged "${topActivity}" ${topCount} time${topCount === 1 ? "" : "s"} — your most common shared activity.`,
        type: "pattern",
      });
    }

    // Most common day of week for activities together.
    if (activities.length >= 4) {
      const dayCounts = new Map<number, number>();
      for (const a of activities) {
        const day = new Date(a._creationTime).getDay();
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      }
      const [topDay, topDayCount] = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topDayCount >= 2) {
        insights.push({
          id: "top-day",
          title: `${DAY_NAMES[topDay]}s are your day`,
          content: `More shared activities happen on ${DAY_NAMES[topDay]} than any other day.`,
          type: "pattern",
        });
      }
    }

    // Memories captured this month vs last month.
    const memories = await ctx.db.query("memories").collect();
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
    const thisMonth = memories.filter((m) => m._creationTime >= thisMonthStart).length;
    const lastMonth = memories.filter((m) => m._creationTime >= lastMonthStart && m._creationTime < thisMonthStart).length;
    if (thisMonth > 0 || lastMonth > 0) {
      insights.push({
        id: "memory-pace",
        title: thisMonth >= lastMonth ? "Capturing more moments" : "Slower month for memories",
        content: `${thisMonth} memories pinned so far this month, vs ${lastMonth} last month.`,
        type: "trend",
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "getting-started",
        title: "Just getting started",
        content: "Log a few more moods and activities together and patterns will start showing up here.",
        type: "suggestion",
      });
    }

    return insights;
  },
});

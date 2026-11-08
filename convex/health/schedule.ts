import { daysBetween, weekday } from "./time";

export interface Schedule {
  type: "daily" | "weekly" | "interval" | "prn";
  times: string[];
  days?: number[];
  everyDays?: number;
  startDate: string;
  endDate?: string;
}

/** The dose times ("HH:mm") a schedule has on a given local date. */
export function slotsOn(schedule: Schedule, date: string): string[] {
  if (schedule.type === "prn") return [];
  if (date < schedule.startDate) return [];
  if (schedule.endDate && date > schedule.endDate) return [];
  if (schedule.type === "weekly" && !(schedule.days ?? []).includes(weekday(date))) return [];
  if (schedule.type === "interval") {
    const every = Math.max(1, Math.round(schedule.everyDays ?? 1));
    if (daysBetween(schedule.startDate, date) % every !== 0) return [];
  }
  return [...new Set(schedule.times)].sort();
}

export const slotKey = (date: string, hm: string) => `${date}T${hm}`;

/** How many doses a schedule uses per day on average (for "runs out on"). */
export function dosesPerDay(schedule: Schedule): number {
  const n = new Set(schedule.times).size;
  switch (schedule.type) {
    case "daily":
      return n;
    case "weekly":
      return (n * (schedule.days?.length ?? 0)) / 7;
    case "interval":
      return n / Math.max(1, schedule.everyDays ?? 1);
    case "prn":
      return 0;
  }
}

/** Plain description: "Daily at 06:30", "Sundays at 09:00", "Every 3 days at 08:00". */
export function describeSchedule(s: Schedule): string {
  const at = s.times.length ? ` at ${[...s.times].sort().join(", ")}` : "";
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  switch (s.type) {
    case "daily":
      return `Daily${at}`;
    case "weekly":
      return `${(s.days ?? []).map((d) => names[d]).join(", ") || "Weekly"}${at}`;
    case "interval":
      return `Every ${s.everyDays ?? 1} days${at}`;
    case "prn":
      return "When needed";
  }
}

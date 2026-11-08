import { addDays, daysBetween } from "./time";

/*
 * Periods, cycle lengths and predictions from daily flow logs. Predictions are
 * estimates and always shown with a range; the "worth a doctor's look" flags
 * use the usual clinical thresholds (cycles under 21 or over 35 days, periods
 * over 7 days, bleeding between periods).
 */

export type Flow = "none" | "spotting" | "light" | "medium" | "heavy";
export interface CycleDay {
  date: string;
  flow?: Flow;
}

export interface Period {
  start: string;
  end: string;
  days: number;
}

const bleeding = (f?: Flow) => f === "light" || f === "medium" || f === "heavy";

/** Consecutive bleeding days (one missing or spotting day bridged) form a period. */
export function periodsFrom(days: CycleDay[]): Period[] {
  const bleedDates = days
    .filter((d) => bleeding(d.flow))
    .map((d) => d.date)
    .sort();
  const out: Period[] = [];
  for (const date of bleedDates) {
    const last = out[out.length - 1];
    if (last && daysBetween(last.end, date) <= 2) {
      last.end = date;
      last.days = daysBetween(last.start, date) + 1;
    } else {
      out.push({ start: date, end: date, days: 1 });
    }
  }
  return out;
}

export interface CycleSummary {
  periods: Period[];
  cycleLengths: number[];
  avgCycle: number | null;
  avgPeriod: number | null;
  minCycle: number | null;
  maxCycle: number | null;
  lastStart: string | null;
  cycleDay: number | null;
  nextStart: string | null;
  nextStartRange: number; // ± days
  ovulation: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  flags: string[];
}

export function summarise(days: CycleDay[], today: string, typical = 28): CycleSummary {
  const periods = periodsFrom(days);
  const lengths: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const len = daysBetween(periods[i - 1].start, periods[i].start);
    // A gap this long is a missed log, not a cycle.
    if (len >= 10 && len <= 90) lengths.push(len);
  }
  const recent = lengths.slice(-6);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgCycle = avg(recent);
  const avgPeriod = avg(periods.slice(-6).map((p) => p.days));
  const minCycle = recent.length ? Math.min(...recent) : null;
  const maxCycle = recent.length ? Math.max(...recent) : null;
  const lastStart = periods.length ? periods[periods.length - 1].start : null;
  const length = avgCycle ?? typical;

  let nextStart: string | null = null;
  let ovulation: string | null = null;
  let fertileStart: string | null = null;
  let fertileEnd: string | null = null;
  if (lastStart) {
    nextStart = addDays(lastStart, length);
    // A prediction already in the past rolls forward a cycle (a late period
    // keeps showing as "late", see flags).
    while (daysBetween(today, nextStart) < -length / 2) nextStart = addDays(nextStart, length);
    ovulation = addDays(nextStart, -14);
    fertileStart = addDays(ovulation, -5);
    fertileEnd = addDays(ovulation, 1);
  }
  const nextStartRange = minCycle != null && maxCycle != null ? Math.max(1, Math.ceil((maxCycle - minCycle) / 2)) : 3;

  const flags: string[] = [];
  if (recent.some((l) => l < 21)) flags.push("A cycle was shorter than 21 days.");
  if (recent.some((l) => l > 35)) flags.push("A cycle was longer than 35 days.");
  if (periods.slice(-6).some((p) => p.days > 7)) flags.push("A period lasted more than 7 days.");
  if (minCycle != null && maxCycle != null && maxCycle - minCycle > 9) flags.push("Cycle length varies by more than 9 days.");
  const between = days.filter(
    (d) => d.flow === "spotting" && !periods.some((p) => daysBetween(p.start, d.date) >= -2 && daysBetween(d.date, p.end) >= -2),
  );
  if (between.some((d) => daysBetween(d.date, today) <= 90)) flags.push("Spotting between periods in the last 3 months.");
  if (lastStart && daysBetween(lastStart, today) > length + 7) flags.push("Period is more than a week later than expected.");

  return {
    periods,
    cycleLengths: lengths,
    avgCycle,
    avgPeriod,
    minCycle,
    maxCycle,
    lastStart,
    cycleDay: lastStart ? daysBetween(lastStart, today) + 1 : null,
    nextStart,
    nextStartRange,
    ovulation,
    fertileStart,
    fertileEnd,
    flags,
  };
}

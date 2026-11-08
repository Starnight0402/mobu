/*
 * Dates for health live in the couple's timezone (Settings -> timezone): a
 * 21:30 dose is 21:30 at home, and "today" is home's today, wherever the
 * server runs. Pure functions; no library, just Intl.
 */

export const DAY_MS = 86_400_000;

// Settings -> timezone stores short names (IST, EST, PST...), which Intl does not
// accept as time zones, so they're mapped to real ones (with the right DST).
const ALIASES: Record<string, string> = {
  IST: "Asia/Kolkata",
  EST: "America/New_York",
  PST: "America/Los_Angeles",
  GMT: "Europe/London",
  UTC: "UTC",
};

export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  const name = ALIASES[tz] ?? tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return "UTC";
  }
}

function parts(at: number, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(at))) out[p.type] = p.value;
  return out;
}

/** Milliseconds to add to UTC to get wall-clock time in `tz` at instant `at`. */
export function tzOffsetMs(tz: string, at: number): number {
  const p = parts(at, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in `tz`. */
export function localParts(at: number, tz: string): { date: string; hm: string } {
  const p = parts(at, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

export function localDate(at: number, tz: string): string {
  return localParts(at, tz).date;
}

/** The UTC instant of a wall-clock date + time in `tz` (handles DST shifts). */
export function localToUtc(date: string, hm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMs(tz, guess);
  let t = guess - off1;
  const off2 = tzOffsetMs(tz, t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** 0 = Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ageOn(dob: string | undefined, today: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age;
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

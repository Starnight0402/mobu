import { addMonths, ageOn, daysBetween } from "./time";

/*
 * Adult vaccines and screenings, with the rules that decide when each is due.
 *
 * Intervals follow the Association of Physicians of India adult immunisation
 * guidelines (2024, 2026 update) and widely used international screening
 * guidance. Every interval can be changed per person (the `preventive` table),
 * because the doctor's advice beats a default.
 */

export type Sex = "female" | "male" | "intersex" | undefined;

export interface VaccineDef {
  key: string;
  name: string;
  rule:
    | { type: "yearly" }
    | { type: "booster"; years: number }
    | { type: "series"; doses: number }
    | { type: "once" }
    | { type: "record" };
  minAge?: number;
  maxAge?: number;
  discussFrom?: number; // past maxAge: "talk to your doctor" rather than due
  note: string;
}

export const VACCINES: VaccineDef[] = [
  { key: "influenza", name: "Influenza (flu)", rule: { type: "yearly" }, note: "Every year, best before winter or the monsoon." },
  { key: "td", name: "Td (tetanus, diphtheria)", rule: { type: "booster", years: 10 }, note: "A booster every 10 years, sooner after a dirty wound." },
  { key: "hepb", name: "Hepatitis B", rule: { type: "series", doses: 3 }, note: "3 doses (0, 1 and 6 months) if not vaccinated as a child." },
  { key: "hpv", name: "HPV", rule: { type: "series", doses: 3 }, maxAge: 26, discussFrom: 45, note: "Up to 26 for everyone; 27–45 after a talk with your doctor." },
  { key: "typhoid", name: "Typhoid", rule: { type: "booster", years: 3 }, note: "Conjugate vaccine, or the Vi polysaccharide one every 3 years." },
  { key: "hepa", name: "Hepatitis A", rule: { type: "series", doses: 2 }, note: "2 doses if not immune." },
  { key: "mmr", name: "MMR (measles, mumps, rubella)", rule: { type: "series", doses: 2 }, note: "2 doses if there's no record of childhood doses." },
  { key: "varicella", name: "Chickenpox (varicella)", rule: { type: "series", doses: 2 }, note: "2 doses if you've never had chickenpox." },
  { key: "covid", name: "COVID-19", rule: { type: "record" }, note: "Boosters as advised for your age and health." },
  { key: "pneumococcal", name: "Pneumococcal", rule: { type: "once" }, minAge: 50, note: "From 50, or earlier with diabetes, heart, lung or kidney disease." },
  { key: "zoster", name: "Shingles (zoster)", rule: { type: "series", doses: 2 }, minAge: 50, note: "2 doses from 50." },
  { key: "rabies", name: "Rabies", rule: { type: "record" }, note: "Keep a record of any doses after a bite or before travel." },
];

export interface ScreeningDef {
  key: string;
  name: string;
  detail: string;
  intervalMonths: number;
  /** Habits (self-checks) are listed without due dates or reminders. */
  habit?: boolean;
  sex?: "female" | "male";
  fromAge?: number;
  toAge?: number;
  /** Family-history words that move the start age earlier. */
  familyWords?: string[];
  familyFromAge?: number;
  recordTypes?: string[]; // a saved record of these types counts as "done"
}

export const SCREENINGS: ScreeningDef[] = [
  { key: "annual_panel", name: "Annual blood panel", detail: "Blood count, sugar (HbA1c), lipids, thyroid, liver, kidney, vitamin D and B12 as advised", intervalMonths: 12, fromAge: 18, recordTypes: ["lab"] },
  { key: "bp", name: "Blood pressure check", detail: "At home or at the clinic", intervalMonths: 12, fromAge: 18 },
  { key: "dental", name: "Dental check-up and cleaning", detail: "Every 6 months", intervalMonths: 6, recordTypes: ["dental"] },
  { key: "eye", name: "Eye exam", detail: "Every 1–2 years; yearly from 40", intervalMonths: 24, recordTypes: ["eye"] },
  { key: "cervical", name: "Cervical screening (Pap or HPV test)", detail: "Pap every 3 years, or an HPV test every 5 years, from 25 to 65", intervalMonths: 36, sex: "female", fromAge: 25, toAge: 65 },
  { key: "mammogram", name: "Mammogram", detail: "Every 1–2 years from 40; earlier with a family history of breast cancer", intervalMonths: 24, sex: "female", fromAge: 40, familyWords: ["breast"], familyFromAge: 30 },
  { key: "colon", name: "Colon screening", detail: "Stool test yearly or colonoscopy every 10 years from 45", intervalMonths: 120, fromAge: 45, familyWords: ["colon", "bowel", "rectal", "colorectal"], familyFromAge: 40 },
  { key: "psa", name: "Prostate (PSA) discussion", detail: "Talk about PSA testing from 50, or 45 with a family history", intervalMonths: 24, sex: "male", fromAge: 50, familyWords: ["prostate"], familyFromAge: 45 },
  { key: "bone", name: "Bone density (DEXA)", detail: "From 65 (70 for men), earlier with risk factors", intervalMonths: 24, fromAge: 65 },
  { key: "hearing", name: "Hearing test", detail: "Every few years from 50", intervalMonths: 36, fromAge: 50 },
  { key: "breast_self", name: "Breast self-check", detail: "Monthly; know what's normal for you", intervalMonths: 1, habit: true, sex: "female", fromAge: 20 },
  { key: "testicular_self", name: "Testicular self-check", detail: "Monthly", intervalMonths: 1, habit: true, sex: "male", fromAge: 15 },
  { key: "skin_self", name: "Skin self-check", detail: "Monthly; photo-track moles in Symptoms", intervalMonths: 1, habit: true },
];

export type DueStatus = "done" | "due" | "overdue" | "upcoming" | "later" | "discuss" | "unknown" | "habit" | "record";

export interface PreventiveItem {
  key: string;
  name: string;
  detail: string;
  kind: "vaccine" | "screening";
  status: DueStatus;
  lastDone?: string;
  dueOn?: string;
  dosesDone?: number;
  dosesNeeded?: number;
  intervalMonths?: number;
  startsAtAge?: number;
}

export interface Override {
  key: string;
  lastDone?: string;
  intervalMonths?: number;
  disabled?: boolean;
}

function dueStatus(dueOn: string, today: string): DueStatus {
  const d = daysBetween(today, dueOn);
  if (d < -30) return "overdue";
  if (d <= 30) return "due";
  return "upcoming";
}

export function vaccineStatus(
  def: VaccineDef,
  doses: { date: string }[],
  age: number | null,
  today: string,
): PreventiveItem {
  const sorted = [...doses].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1]?.date;
  const base = { key: def.key, name: def.name, detail: def.note, kind: "vaccine" as const, lastDone: last, dosesDone: sorted.length };
  if (age != null && def.minAge != null && age < def.minAge) return { ...base, status: "later", startsAtAge: def.minAge };
  // Age-gated vaccines wait until we know how old you are.
  if (age == null && (def.minAge != null || def.maxAge != null)) return { ...base, status: "later" };
  const pastMax = age != null && def.maxAge != null && age > def.maxAge;
  switch (def.rule.type) {
    case "yearly": {
      // Nothing logged is "no record", not "overdue": a new profile shouldn't open with a wall of due items.
      if (!last) return { ...base, status: "unknown" };
      const dueOn = addMonths(last, 12);
      const s = dueStatus(dueOn, today);
      return { ...base, status: s === "upcoming" ? "done" : s, dueOn };
    }
    case "booster": {
      if (!last) return { ...base, status: "unknown" };
      const dueOn = addMonths(last, def.rule.years * 12);
      const s = dueStatus(dueOn, today);
      return { ...base, status: s === "upcoming" ? "done" : s, dueOn };
    }
    case "series": {
      const needed = def.rule.doses;
      if (sorted.length >= needed) return { ...base, status: "done", dosesNeeded: needed };
      if (pastMax) {
        if (def.discussFrom != null && age! <= def.discussFrom) return { ...base, status: "discuss", dosesNeeded: needed };
        return { ...base, status: sorted.length ? "done" : "later", dosesNeeded: needed };
      }
      return { ...base, status: sorted.length ? "due" : "unknown", dosesNeeded: needed };
    }
    case "once":
      return { ...base, status: last ? "done" : "unknown" };
    case "record":
      return { ...base, status: "record" };
  }
}

export function screeningStatus(
  def: ScreeningDef,
  ctx: { age: number | null; sex: Sex; familyText: string; lastFromRecords?: string; override?: Override },
  today: string,
): PreventiveItem | null {
  if (def.sex && (!ctx.sex || (ctx.sex !== def.sex && ctx.sex !== "intersex"))) return null;
  const familyHit = def.familyWords?.some((w) => ctx.familyText.includes(w));
  const fromAge = familyHit && def.familyFromAge != null ? def.familyFromAge : def.fromAge;
  const interval = ctx.override?.intervalMonths ?? (def.key === "eye" && (ctx.age ?? 0) >= 40 ? 12 : def.intervalMonths);
  const base = { key: def.key, name: def.name, detail: def.detail, kind: "screening" as const, intervalMonths: interval };
  if (def.habit) return { ...base, status: "habit" };
  if (ctx.age == null && (fromAge != null || def.toAge != null)) return null;
  if (ctx.age != null && fromAge != null && ctx.age < fromAge) return { ...base, status: "later", startsAtAge: fromAge };
  if (ctx.age != null && def.toAge != null && ctx.age > def.toAge) return null;
  const candidates = [ctx.override?.lastDone, ctx.lastFromRecords].filter(Boolean) as string[];
  const last = candidates.sort().pop();
  if (!last) return { ...base, status: "unknown" };
  const dueOn = addMonths(last, interval);
  const s = dueStatus(dueOn, today);
  return { ...base, status: s === "upcoming" ? "done" : s, lastDone: last, dueOn };
}

export function preventionFor(input: {
  dob?: string;
  sex: Sex;
  familyText: string;
  immunizations: { vaccine: string; date: string }[];
  overrides: Override[];
  lastRecordByType: Record<string, string>;
  today: string;
}): { vaccines: PreventiveItem[]; screenings: PreventiveItem[]; habits: PreventiveItem[]; later: PreventiveItem[] } {
  const age = ageOn(input.dob, input.today);
  const ov = Object.fromEntries(input.overrides.map((o) => [o.key, o]));
  const vaccines = VACCINES.filter((d) => !ov[d.key]?.disabled).map((d) =>
    vaccineStatus(
      d,
      input.immunizations.filter((i) => i.vaccine === d.key),
      age,
      input.today,
    ),
  );
  const all = SCREENINGS.filter((d) => !ov[d.key]?.disabled)
    .map((d) =>
      screeningStatus(
        d,
        {
          age,
          sex: input.sex,
          familyText: input.familyText.toLowerCase(),
          override: ov[d.key],
          lastFromRecords: (d.recordTypes ?? []).map((t) => input.lastRecordByType[t]).filter(Boolean).sort().pop(),
        },
        input.today,
      ),
    )
    .filter((x): x is PreventiveItem => x !== null);
  return {
    vaccines,
    screenings: all.filter((s) => s.status !== "habit" && s.status !== "later"),
    habits: all.filter((s) => s.status === "habit"),
    later: [...all.filter((s) => s.status === "later"), ...vaccines.filter((v) => v.status === "later" && v.startsAtAge != null)],
  };
}

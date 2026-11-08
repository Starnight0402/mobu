/*
 * The lab-test catalogue and the rules for judging a value.
 *
 * Reports name the same test a dozen ways ("S. TSH", "TSH, Ultrasensitive",
 * "Thyroid Stimulating Hormone"). Gemini is given these codes and maps each
 * printed line to one, so a marker's history lines up across labs. A line
 * with no match keeps its own name under an "x:" code.
 *
 * `si` converts the stored unit to the alternative one by multiplication.
 */

export interface LabTest {
  code: string;
  name: string;
  panel: Panel;
  unit: string;
  loinc?: string;
  si?: { unit: string; factor: number };
  about?: string;
}

export type Panel =
  | "Lipids"
  | "Diabetes"
  | "Thyroid"
  | "Blood count"
  | "Iron"
  | "Vitamins & minerals"
  | "Liver"
  | "Kidney"
  | "Electrolytes"
  | "Urine"
  | "Hormones"
  | "Inflammation"
  | "Cardiac"
  | "Other";

export const PANELS: Panel[] = [
  "Lipids",
  "Diabetes",
  "Thyroid",
  "Blood count",
  "Iron",
  "Vitamins & minerals",
  "Liver",
  "Kidney",
  "Electrolytes",
  "Urine",
  "Hormones",
  "Inflammation",
  "Cardiac",
  "Other",
];

const mgdlChol = { unit: "mmol/L", factor: 0.02586 };

export const LAB_TESTS: LabTest[] = [
  // Lipids
  { code: "total_cholesterol", name: "Total cholesterol", panel: "Lipids", unit: "mg/dL", loinc: "2093-3", si: mgdlChol },
  { code: "ldl", name: "LDL cholesterol", panel: "Lipids", unit: "mg/dL", loinc: "13457-7", si: mgdlChol,
    about: "LDL carries cholesterol into artery walls. Lower is better for heart health. Diet, activity, weight and medicine all move it, usually over 6–12 weeks." },
  { code: "hdl", name: "HDL cholesterol", panel: "Lipids", unit: "mg/dL", loinc: "2085-9", si: mgdlChol,
    about: "HDL carries cholesterol away from arteries. Higher is better. Exercise raises it." },
  { code: "triglycerides", name: "Triglycerides", panel: "Lipids", unit: "mg/dL", loinc: "2571-8", si: { unit: "mmol/L", factor: 0.01129 },
    about: "Fat in the blood. Rises with sugar, refined carbs and alcohol; best measured fasting." },
  { code: "vldl", name: "VLDL cholesterol", panel: "Lipids", unit: "mg/dL", loinc: "13458-5", si: mgdlChol },
  { code: "non_hdl", name: "Non-HDL cholesterol", panel: "Lipids", unit: "mg/dL", loinc: "43396-1", si: mgdlChol },
  { code: "chol_hdl_ratio", name: "Total/HDL ratio", panel: "Lipids", unit: "ratio", loinc: "9830-1" },
  { code: "ldl_hdl_ratio", name: "LDL/HDL ratio", panel: "Lipids", unit: "ratio", loinc: "11054-4" },
  { code: "apob", name: "Apolipoprotein B", panel: "Lipids", unit: "mg/dL", loinc: "1884-6" },
  { code: "lpa", name: "Lipoprotein(a)", panel: "Lipids", unit: "mg/dL", loinc: "10835-7" },
  // Diabetes
  { code: "hba1c", name: "HbA1c", panel: "Diabetes", unit: "%", loinc: "4548-4",
    about: "Average blood sugar over about 3 months. Under 5.7% is normal, 5.7–6.4% is prediabetes, 6.5% or more suggests diabetes." },
  { code: "glucose_fasting", name: "Fasting glucose", panel: "Diabetes", unit: "mg/dL", loinc: "1558-6", si: { unit: "mmol/L", factor: 0.0555 } },
  { code: "glucose_pp", name: "Post-meal glucose (2 h)", panel: "Diabetes", unit: "mg/dL", loinc: "1521-4", si: { unit: "mmol/L", factor: 0.0555 } },
  { code: "glucose_random", name: "Random glucose", panel: "Diabetes", unit: "mg/dL", loinc: "2345-7", si: { unit: "mmol/L", factor: 0.0555 } },
  { code: "eag", name: "Estimated average glucose", panel: "Diabetes", unit: "mg/dL", loinc: "27353-2", si: { unit: "mmol/L", factor: 0.0555 } },
  { code: "insulin_fasting", name: "Fasting insulin", panel: "Diabetes", unit: "µIU/mL", loinc: "20448-7" },
  { code: "homa_ir", name: "HOMA-IR", panel: "Diabetes", unit: "index" },
  // Thyroid
  { code: "tsh", name: "TSH", panel: "Thyroid", unit: "µIU/mL", loinc: "3016-3",
    about: "The brain's signal to the thyroid. High usually means an underactive thyroid; low, an overactive one. Thyroid medicine doses are tuned to it." },
  { code: "ft4", name: "Free T4", panel: "Thyroid", unit: "ng/dL", loinc: "3024-7" },
  { code: "ft3", name: "Free T3", panel: "Thyroid", unit: "pg/mL", loinc: "3051-0" },
  { code: "t3", name: "Total T3", panel: "Thyroid", unit: "ng/dL", loinc: "3053-6" },
  { code: "t4", name: "Total T4", panel: "Thyroid", unit: "µg/dL", loinc: "3026-2" },
  { code: "anti_tpo", name: "Anti-TPO antibodies", panel: "Thyroid", unit: "IU/mL", loinc: "8099-4" },
  // Blood count
  { code: "hemoglobin", name: "Haemoglobin", panel: "Blood count", unit: "g/dL", loinc: "718-7", si: { unit: "g/L", factor: 10 },
    about: "Carries oxygen in red blood cells. Low means anaemia, often from low iron, B12 or folate." },
  { code: "rbc", name: "Red blood cells", panel: "Blood count", unit: "million/µL", loinc: "789-8" },
  { code: "wbc", name: "White blood cells", panel: "Blood count", unit: "thousand/µL", loinc: "6690-2" },
  { code: "platelets", name: "Platelets", panel: "Blood count", unit: "thousand/µL", loinc: "777-3" },
  { code: "hematocrit", name: "Haematocrit (PCV)", panel: "Blood count", unit: "%", loinc: "4544-3" },
  { code: "mcv", name: "MCV", panel: "Blood count", unit: "fL", loinc: "787-2" },
  { code: "mch", name: "MCH", panel: "Blood count", unit: "pg", loinc: "785-6" },
  { code: "mchc", name: "MCHC", panel: "Blood count", unit: "g/dL", loinc: "786-4" },
  { code: "rdw", name: "RDW", panel: "Blood count", unit: "%", loinc: "788-0" },
  { code: "neutrophils", name: "Neutrophils", panel: "Blood count", unit: "%", loinc: "770-8" },
  { code: "lymphocytes", name: "Lymphocytes", panel: "Blood count", unit: "%", loinc: "736-9" },
  { code: "monocytes", name: "Monocytes", panel: "Blood count", unit: "%", loinc: "5905-5" },
  { code: "eosinophils", name: "Eosinophils", panel: "Blood count", unit: "%", loinc: "713-8" },
  { code: "basophils", name: "Basophils", panel: "Blood count", unit: "%", loinc: "706-2" },
  { code: "esr", name: "ESR", panel: "Blood count", unit: "mm/h", loinc: "4537-7" },
  // Iron
  { code: "ferritin", name: "Ferritin", panel: "Iron", unit: "ng/mL", loinc: "2276-4", about: "The body's iron store. The first thing to drop in iron deficiency." },
  { code: "iron", name: "Serum iron", panel: "Iron", unit: "µg/dL", loinc: "2498-4" },
  { code: "tibc", name: "TIBC", panel: "Iron", unit: "µg/dL", loinc: "2500-7" },
  { code: "transferrin_sat", name: "Transferrin saturation", panel: "Iron", unit: "%", loinc: "2502-3" },
  // Vitamins & minerals
  { code: "vit_d", name: "Vitamin D (25-OH)", panel: "Vitamins & minerals", unit: "ng/mL", loinc: "1989-3", si: { unit: "nmol/L", factor: 2.496 },
    about: "Needed for bones, muscles and immunity. Very common to be low in India; usually fixed with a weekly or daily supplement." },
  { code: "vit_b12", name: "Vitamin B12", panel: "Vitamins & minerals", unit: "pg/mL", loinc: "2132-9", si: { unit: "pmol/L", factor: 0.738 },
    about: "Needed for nerves and red blood cells. Often low with vegetarian diets or long-term metformin." },
  { code: "folate", name: "Folate", panel: "Vitamins & minerals", unit: "ng/mL", loinc: "2284-8" },
  { code: "calcium", name: "Calcium", panel: "Vitamins & minerals", unit: "mg/dL", loinc: "17861-6", si: { unit: "mmol/L", factor: 0.2495 } },
  { code: "magnesium", name: "Magnesium", panel: "Vitamins & minerals", unit: "mg/dL", loinc: "19123-9" },
  { code: "phosphorus", name: "Phosphorus", panel: "Vitamins & minerals", unit: "mg/dL", loinc: "2777-1" },
  { code: "zinc", name: "Zinc", panel: "Vitamins & minerals", unit: "µg/dL", loinc: "5763-8" },
  // Liver
  { code: "bilirubin_total", name: "Bilirubin, total", panel: "Liver", unit: "mg/dL", loinc: "1975-2", si: { unit: "µmol/L", factor: 17.1 } },
  { code: "bilirubin_direct", name: "Bilirubin, direct", panel: "Liver", unit: "mg/dL", loinc: "1968-7", si: { unit: "µmol/L", factor: 17.1 } },
  { code: "bilirubin_indirect", name: "Bilirubin, indirect", panel: "Liver", unit: "mg/dL", loinc: "1971-1", si: { unit: "µmol/L", factor: 17.1 } },
  { code: "ast", name: "AST (SGOT)", panel: "Liver", unit: "U/L", loinc: "1920-8" },
  { code: "alt", name: "ALT (SGPT)", panel: "Liver", unit: "U/L", loinc: "1742-6", about: "A liver enzyme. Raised by fatty liver, alcohol, some medicines and infections." },
  { code: "alp", name: "Alkaline phosphatase", panel: "Liver", unit: "U/L", loinc: "6768-6" },
  { code: "ggt", name: "GGT", panel: "Liver", unit: "U/L", loinc: "2324-2" },
  { code: "total_protein", name: "Total protein", panel: "Liver", unit: "g/dL", loinc: "2885-2" },
  { code: "albumin", name: "Albumin", panel: "Liver", unit: "g/dL", loinc: "1751-7" },
  { code: "globulin", name: "Globulin", panel: "Liver", unit: "g/dL", loinc: "10834-0" },
  { code: "ag_ratio", name: "A/G ratio", panel: "Liver", unit: "ratio", loinc: "1759-0" },
  // Kidney
  { code: "creatinine", name: "Creatinine", panel: "Kidney", unit: "mg/dL", loinc: "2160-0", si: { unit: "µmol/L", factor: 88.4 } },
  { code: "urea", name: "Urea", panel: "Kidney", unit: "mg/dL", loinc: "3091-6" },
  { code: "bun", name: "Blood urea nitrogen", panel: "Kidney", unit: "mg/dL", loinc: "3094-0" },
  { code: "uric_acid", name: "Uric acid", panel: "Kidney", unit: "mg/dL", loinc: "3084-1", si: { unit: "µmol/L", factor: 59.48 } },
  { code: "egfr", name: "eGFR", panel: "Kidney", unit: "mL/min/1.73m²", loinc: "62238-1", about: "How well the kidneys filter, estimated from creatinine. 90 or more is normal." },
  { code: "bun_creat_ratio", name: "BUN/creatinine ratio", panel: "Kidney", unit: "ratio" },
  // Electrolytes
  { code: "sodium", name: "Sodium", panel: "Electrolytes", unit: "mmol/L", loinc: "2951-2" },
  { code: "potassium", name: "Potassium", panel: "Electrolytes", unit: "mmol/L", loinc: "2823-3" },
  { code: "chloride", name: "Chloride", panel: "Electrolytes", unit: "mmol/L", loinc: "2075-0" },
  { code: "bicarbonate", name: "Bicarbonate", panel: "Electrolytes", unit: "mmol/L", loinc: "1963-8" },
  // Urine
  { code: "urine_protein", name: "Urine protein", panel: "Urine", unit: "", loinc: "2888-6" },
  { code: "urine_glucose", name: "Urine glucose", panel: "Urine", unit: "", loinc: "2350-7" },
  { code: "urine_ketones", name: "Urine ketones", panel: "Urine", unit: "", loinc: "2514-8" },
  { code: "urine_ph", name: "Urine pH", panel: "Urine", unit: "", loinc: "2756-5" },
  { code: "urine_sg", name: "Urine specific gravity", panel: "Urine", unit: "", loinc: "2965-2" },
  { code: "urine_pus_cells", name: "Urine pus cells", panel: "Urine", unit: "/hpf", loinc: "5821-4" },
  { code: "urine_rbc", name: "Urine red cells", panel: "Urine", unit: "/hpf", loinc: "13945-1" },
  { code: "urine_acr", name: "Urine albumin/creatinine ratio", panel: "Urine", unit: "mg/g", loinc: "14959-1" },
  // Hormones
  { code: "testosterone", name: "Testosterone", panel: "Hormones", unit: "ng/dL", loinc: "2986-8" },
  { code: "estradiol", name: "Estradiol", panel: "Hormones", unit: "pg/mL", loinc: "2243-4" },
  { code: "progesterone", name: "Progesterone", panel: "Hormones", unit: "ng/mL", loinc: "2839-9" },
  { code: "lh", name: "LH", panel: "Hormones", unit: "mIU/mL", loinc: "10501-5" },
  { code: "fsh", name: "FSH", panel: "Hormones", unit: "mIU/mL", loinc: "15067-2" },
  { code: "prolactin", name: "Prolactin", panel: "Hormones", unit: "ng/mL", loinc: "2842-3" },
  { code: "amh", name: "AMH", panel: "Hormones", unit: "ng/mL", loinc: "38476-3" },
  { code: "cortisol", name: "Cortisol", panel: "Hormones", unit: "µg/dL", loinc: "2143-6" },
  { code: "beta_hcg", name: "Beta hCG", panel: "Hormones", unit: "mIU/mL", loinc: "21198-7" },
  // Inflammation
  { code: "crp", name: "CRP", panel: "Inflammation", unit: "mg/L", loinc: "1988-5" },
  { code: "hs_crp", name: "hs-CRP", panel: "Inflammation", unit: "mg/L", loinc: "30522-7" },
  // Cardiac
  { code: "homocysteine", name: "Homocysteine", panel: "Cardiac", unit: "µmol/L", loinc: "13965-9" },
  // Other
  { code: "psa", name: "PSA", panel: "Other", unit: "ng/mL", loinc: "2857-1" },
];

export const LAB_BY_CODE: Record<string, LabTest> = Object.fromEntries(LAB_TESTS.map((t) => [t.code, t]));

export function testFor(code: string, fallbackName?: string): LabTest {
  return (
    LAB_BY_CODE[code] ?? {
      code,
      name: fallbackName ?? code.replace(/^x:/, "").replace(/_/g, " "),
      panel: "Other",
      unit: "",
    }
  );
}

/** A stable code for a test the catalogue doesn't know. */
export function customCode(name: string): string {
  return (
    "x:" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40)
  );
}

export type Flag = "low" | "high" | "normal" | "borderline" | "abnormal";

/**
 * Judge a value against its range. A personal target (set by a doctor) wins
 * over the lab's printed range. "Near the edge" is the last 5% of the range
 * on the inside (5% of the limit when only one side is given).
 */
export function flagFor(
  value: number | undefined,
  low?: number,
  high?: number,
  target?: { low?: number; high?: number } | null,
): Flag | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  const lo = target?.low ?? (target?.high != null ? undefined : low);
  const hi = target?.high ?? (target?.low != null ? undefined : high);
  if (lo == null && hi == null) return undefined;
  if (lo != null && value < lo) return "low";
  if (hi != null && value > hi) return "high";
  const margin =
    lo != null && hi != null ? (hi - lo) * 0.05 : Math.abs((hi ?? lo) as number) * 0.05;
  if (hi != null && value >= hi - margin) return "borderline";
  if (lo != null && value <= lo + margin) return "borderline";
  return "normal";
}

/** Convert a stored value to the test's alternative unit, if it has one. */
export function toAltUnit(code: string, value: number): { value: number; unit: string } | null {
  const t = LAB_BY_CODE[code];
  if (!t?.si) return null;
  const v = value * t.si.factor;
  return { value: Math.round(v * 100) / 100, unit: t.si.unit };
}

/**
 * Bring a value printed in the alternative unit back to the catalogue's unit,
 * so a "5.2 mmol/L" glucose and a "94 mg/dL" glucose sit on one chart.
 */
export function normaliseUnit(
  code: string,
  value: number,
  unit: string | undefined,
): { value: number; unit: string | undefined; converted: boolean } {
  const t = LAB_BY_CODE[code];
  if (!t || !unit) return { value, unit, converted: false };
  const u = unit.replace(/\s/g, "").toLowerCase();
  if (t.si && u === t.si.unit.replace(/\s/g, "").toLowerCase()) {
    return { value: Math.round((value / t.si.factor) * 100) / 100, unit: t.unit, converted: true };
  }
  return { value, unit, converted: false };
}

export const FLAG_RANK: Record<Flag, number> = { high: 3, low: 3, abnormal: 3, borderline: 2, normal: 1 };

/** Parse a printed range like "70 - 99", "<100", "> 40", "0.4–4.5". */
export function parseRange(text: string | undefined): { low?: number; high?: number } {
  if (!text) return {};
  const t = text.replace(/,/g, "");
  const between = t.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) return { low: +between[1], high: +between[2] };
  const lt = t.match(/(?:<|≤|up to|upto|less than)\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (lt) return { high: +lt[1] };
  const gt = t.match(/(?:>|≥|more than|greater than)\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (gt) return { low: +gt[1] };
  return {};
}

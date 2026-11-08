/*
 * A short list of well-known medicine pairs worth a warning. Deliberately
 * small and conservative: it catches common, clearly documented combinations
 * and always ends with "check with your pharmacist", rather than pretending to
 * be a full interaction database.
 */

interface Rule {
  a: string[];
  b: string[];
  severity: "caution" | "serious";
  text: string;
}

const RULES: Rule[] = [
  {
    a: ["levothyroxine", "thyroxine", "eltroxin", "thyronorm"],
    b: ["iron", "ferrous", "ferric", "calcium", "shelcal", "antacid", "digene", "gelusil", "sucralfate", "multivitamin"],
    severity: "caution",
    text: "Keep these 4 hours apart. Iron, calcium and antacids cut how much thyroid medicine the body absorbs.",
  },
  {
    a: ["ciprofloxacin", "levofloxacin", "ofloxacin", "norfloxacin", "moxifloxacin", "doxycycline", "tetracycline"],
    b: ["iron", "ferrous", "calcium", "antacid", "zinc", "magnesium", "multivitamin", "digene", "gelusil"],
    severity: "caution",
    text: "Take the antibiotic 2 hours before or 6 hours after. Minerals and antacids stop it being absorbed.",
  },
  {
    a: ["atorvastatin", "simvastatin", "lovastatin", "rosuvastatin"],
    b: ["clarithromycin", "erythromycin", "itraconazole", "ketoconazole"],
    severity: "serious",
    text: "This antibiotic or antifungal can raise statin levels and cause muscle damage. Ask your doctor about pausing the statin.",
  },
  {
    a: ["warfarin", "acenocoumarol", "acitrom", "apixaban", "rivaroxaban", "dabigatran", "clopidogrel"],
    b: ["aspirin", "ibuprofen", "diclofenac", "naproxen", "aceclofenac", "ketorolac", "nimesulide", "mefenamic"],
    severity: "serious",
    text: "Together these raise the risk of bleeding. Paracetamol is usually the safer painkiller; check with your doctor.",
  },
  {
    a: ["sildenafil", "tadalafil", "vardenafil"],
    b: ["nitroglycerin", "isosorbide", "nitrate", "sorbitrate", "nicorandil"],
    severity: "serious",
    text: "Never take these together: blood pressure can drop dangerously.",
  },
  {
    a: ["sertraline", "fluoxetine", "escitalopram", "citalopram", "paroxetine", "venlafaxine", "duloxetine"],
    b: ["tramadol", "linezolid", "sumatriptan", "ondansetron"],
    severity: "caution",
    text: "Together these can cause serotonin syndrome (agitation, fever, shaking). Check with your doctor.",
  },
  {
    a: ["enalapril", "ramipril", "lisinopril", "telmisartan", "losartan", "olmesartan", "valsartan"],
    b: ["spironolactone", "potassium", "eplerenone"],
    severity: "caution",
    text: "Together these can push potassium too high. Your doctor may want a blood test.",
  },
  {
    a: ["enalapril", "ramipril", "lisinopril", "telmisartan", "losartan", "olmesartan", "valsartan"],
    b: ["ibuprofen", "diclofenac", "naproxen", "aceclofenac", "nimesulide"],
    severity: "caution",
    text: "Painkillers like these can strain the kidneys and weaken blood pressure medicine, especially with regular use.",
  },
  {
    a: ["methotrexate"],
    b: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "trimethoprim", "septran", "cotrimoxazole"],
    severity: "serious",
    text: "This can raise methotrexate to toxic levels. Check with your doctor before taking it.",
  },
  {
    a: ["metformin"],
    b: ["alcohol"],
    severity: "caution",
    text: "Heavy drinking with metformin raises the risk of a rare but serious acid build-up.",
  },
];

const PARACETAMOL = ["paracetamol", "acetaminophen", "crocin", "dolo", "calpol", "combiflam", "sumo"];

export interface Warning {
  meds: [string, string];
  severity: "caution" | "serious";
  text: string;
}

const has = (name: string, words: string[]) => {
  const n = name.toLowerCase();
  return words.some((w) => n.includes(w));
};

export function interactionWarnings(names: string[]): Warning[] {
  const out: Warning[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      for (const r of RULES) {
        if (has(names[i], r.a) && has(names[j], r.b)) {
          out.push({ meds: [names[i], names[j]], severity: r.severity, text: r.text });
        }
      }
    }
  }
  const pcm = names.filter((n) => has(n, PARACETAMOL));
  if (pcm.length > 1) {
    out.push({
      meds: [pcm[0], pcm[1]],
      severity: "serious",
      text: "Both contain paracetamol. Count them together: no more than 4 g in a day.",
    });
  }
  return out;
}

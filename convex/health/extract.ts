import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { LAB_TESTS } from "./labLogic";
import { VACCINES } from "./preventionLogic";

/*
 * Reads an uploaded health document with Gemini: what kind of document it is,
 * its date, lab, doctor, every test value with its unit and printed range, any
 * medicines (prescriptions) or vaccines (certificates), plus a short summary in
 * plain words. Nothing is saved as data yet: the record goes to "review" and
 * the person confirms or fixes each value first (records.saveReview).
 *
 * Needs GEMINI_API_KEY in the Convex environment. GEMINI_MODEL overrides the
 * model; by default it uses Google's "latest Flash" alias, with a pinned
 * fallback in case the alias is unavailable.
 */

const MAX_INLINE_BYTES = 18 * 1024 * 1024; // Gemini's inline request limit is 20 MB
const SUPPORTED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|text\/plain)$/;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    documentType: {
      type: "STRING",
      enum: ["lab", "prescription", "imaging", "consult", "discharge", "vaccine", "bill", "insurance", "dental", "eye", "ecg", "other"],
    },
    title: { type: "STRING", description: "Short title, e.g. 'Lipid profile + HbA1c' or 'Prescription, Dr. Mehta'" },
    date: { type: "STRING", description: "Sample collection or document date as YYYY-MM-DD", nullable: true },
    provider: { type: "STRING", description: "Lab, hospital or clinic name", nullable: true },
    doctor: { type: "STRING", description: "Referring or treating doctor", nullable: true },
    patientName: { type: "STRING", nullable: true },
    summary: { type: "STRING", description: "2-4 plain sentences for the patient. No diagnosis." },
    questions: { type: "ARRAY", items: { type: "STRING" }, description: "0-3 questions worth asking the doctor" },
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          code: { type: "STRING", nullable: true },
          name: { type: "STRING" },
          value: { type: "NUMBER", nullable: true },
          valueText: { type: "STRING", nullable: true },
          unit: { type: "STRING", nullable: true },
          refLow: { type: "NUMBER", nullable: true },
          refHigh: { type: "NUMBER", nullable: true },
          refText: { type: "STRING", nullable: true },
          flag: { type: "STRING", enum: ["low", "high", "normal", "abnormal"], nullable: true },
          confidence: { type: "STRING", enum: ["high", "low"] },
          readAs: { type: "STRING", nullable: true, description: "What the blurry text literally looked like, when confidence is low" },
        },
        required: ["name", "confidence"],
      },
    },
    medications: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          strength: { type: "STRING", nullable: true },
          form: { type: "STRING", nullable: true },
          times: { type: "ARRAY", items: { type: "STRING" }, description: "24h HH:mm times if derivable, e.g. 1-0-1 -> 08:00, 20:00" },
          frequency: { type: "STRING", nullable: true },
          durationDays: { type: "NUMBER", nullable: true },
          instructions: { type: "STRING", nullable: true },
          asNeeded: { type: "BOOLEAN" },
        },
        required: ["name", "asNeeded"],
      },
    },
    vaccines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { vaccine: { type: "STRING" }, dose: { type: "STRING", nullable: true }, date: { type: "STRING", nullable: true } },
        required: ["vaccine"],
      },
    },
    diagnoses: { type: "ARRAY", items: { type: "STRING" } },
    followUp: { type: "STRING", nullable: true },
    amount: { type: "NUMBER", nullable: true, description: "Total amount for bills" },
    fasting: { type: "BOOLEAN", nullable: true },
    rawText: { type: "STRING", description: "All readable text, for search. Up to ~4000 characters." },
  },
  required: ["documentType", "title", "summary", "results", "rawText"],
};

function prompt(ownerName: string, today: string) {
  const codes = LAB_TESTS.map((t) => `${t.code}=${t.name}`).join("; ");
  const vaccines = VACCINES.map((v) => `${v.key}=${v.name}`).join("; ");
  return `You read Indian medical documents (lab reports, prescriptions, discharge summaries, scans, bills, vaccine certificates) for a personal health record.
Today is ${today}. The record belongs to "${ownerName}".

Rules:
- Copy every test result exactly as printed: value, unit, and the printed reference range (refText verbatim, plus numeric refLow/refHigh when the range has numbers; "<100" means refHigh 100).
- For each result set "code" to the matching key from this list, or null if none fits: ${codes}.
- Numbers only in "value"; text results ("Negative", "Trace", "Reactive") go in "valueText".
- If a value is blurry or ambiguous, set confidence "low" and put what it literally looks like in readAs. Never guess silently.
- documentType: lab report=lab, Rx=prescription, X-ray/CT/MRI/USG=imaging, OPD note=consult, discharge summary=discharge, vaccine certificate=vaccine, invoice/receipt=bill, policy/claim=insurance, dental=dental, eye/optometry=eye, ECG/TMT/echo=ecg.
- Prescriptions: list each medicine. Convert Indian dosing like 1-0-1 (morning-afternoon-night) to times 08:00 and 20:00, BD=2/day, TDS=3/day, OD=1/day, HS=bedtime 22:00, SOS=asNeeded.
- Vaccine certificates: map vaccine to one of: ${vaccines}.
- summary: 2-4 short plain sentences a non-doctor understands: what was tested and which values are outside the printed range, compared with nothing else. Do not diagnose or recommend treatment.
- questions: up to 3 short questions the patient could ask their doctor about this document.
- Dates as YYYY-MM-DD. Use the sample collection date for lab reports.`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function callGemini(parts: Part[], schema: object): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Report reading isn't set up: add GEMINI_API_KEY in the Convex dashboard");
  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  );
  let lastError = "";
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
        if (!text) throw new Error("The AI couldn't read this document");
        return text;
      }
      lastError = `${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status === 404) break; // try the next model
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
        continue;
      }
      throw new Error(`Gemini error ${lastError}`);
    }
  }
  throw new Error(`No Gemini model available (${lastError})`);
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export const run = internalAction({
  args: { id: v.id("healthRecords") },
  handler: async (ctx, { id }) => {
    const data = await ctx.runQuery(internal.health.records.forExtraction, { id });
    if (!data) return;
    const { record, ownerName } = data;
    try {
      const parts: Part[] = [{ text: prompt(ownerName, new Date().toISOString().slice(0, 10)) }];
      let total = 0;
      for (const f of record.files) {
        if (!SUPPORTED.test(f.mime)) continue;
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) continue;
        total += blob.size;
        if (total > MAX_INLINE_BYTES) throw new Error("These files are too large to read together. Split them into smaller records.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        parts.push({ inline_data: { mime_type: f.mime, data: toBase64(bytes) } });
      }
      if (parts.length === 1) throw new Error("No readable pages (use photos or a PDF)");

      const out = JSON.parse(await callGemini(parts, RESPONSE_SCHEMA));
      const reportName: string | undefined = out.patientName || undefined;
      let nameMatch: "match" | "mismatch" | "unknown" = "unknown";
      if (reportName && ownerName) {
        const a = normName(reportName);
        const first = normName(ownerName.split(/\s+/)[0]);
        nameMatch = first.length >= 3 && a.includes(first) ? "match" : "mismatch";
      }
      const date = typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : undefined;
      await ctx.runMutation(internal.health.records.setExtraction, {
        id,
        status: "review",
        extractionJson: JSON.stringify(out).slice(0, 900_000),
        summary: typeof out.summary === "string" ? out.summary.slice(0, 2000) : undefined,
        questions: Array.isArray(out.questions) ? out.questions.slice(0, 3).map(String) : undefined,
        type: out.documentType,
        title: typeof out.title === "string" && out.title.trim() ? out.title.trim().slice(0, 120) : undefined,
        date,
        provider: out.provider || undefined,
        doctor: out.doctor || undefined,
        reportName,
        nameMatch,
        rawText: typeof out.rawText === "string" ? out.rawText.slice(0, 8000) : undefined,
      });
    } catch (e) {
      await ctx.runMutation(internal.health.records.setExtraction, {
        id,
        status: "failed",
        error: e instanceof Error ? e.message.slice(0, 300) : "Couldn't read this document",
      });
    }
  },
});

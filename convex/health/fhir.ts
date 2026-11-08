import { LAB_TESTS } from "./labLogic";
import { VACCINES } from "./preventionLogic";

/*
 * FHIR R4, both ways: parsing a bundle someone downloaded (from a hospital,
 * the ABHA app, another health app) into Mobu's shapes, and building one from
 * Mobu's data for export. Pure functions, shared by the server and the app.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res = Record<string, any>;

const VITAL_LOINC: Record<string, { type: string; scale?: number }> = {
  "8867-4": { type: "heartRate" },
  "40443-4": { type: "restingHr" },
  "59408-5": { type: "spo2" },
  "2708-6": { type: "spo2" },
  "8310-5": { type: "temp" },
  "29463-7": { type: "weight" },
  "3141-9": { type: "weight" },
  "8302-2": { type: "height" },
  "9279-1": { type: "respRate" },
  "41982-0": { type: "bodyFat" },
  "8280-0": { type: "waist" },
};

const text = (cc: Res | undefined): string | undefined =>
  cc?.text ?? cc?.coding?.find((c: Res) => c.display)?.display ?? cc?.coding?.[0]?.code;

const loincOf = (cc: Res | undefined): string | undefined =>
  cc?.coding?.find((c: Res) => typeof c.system === "string" && c.system.includes("loinc"))?.code;

const day = (s: unknown): string | undefined =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;

export interface ParsedBundle {
  labs: { code?: string; name: string; date: string; value?: number; valueText?: string; unit?: string; refLow?: number; refHigh?: number; refText?: string }[];
  vitals: { type: string; time: number; value: number; value2?: number }[];
  history: { kind: "condition" | "allergy" | "procedure" | "hospitalization"; name: string; date?: string; status?: "active" | "resolved"; reaction?: string; severity?: "mild" | "moderate" | "severe"; category?: "medicine" | "food" | "environment" | "other" }[];
  vaccines: { vaccine: string; date: string; dose?: string; name: string }[];
  meds: { name: string; instructions?: string; active: boolean; start?: string }[];
  documents: { title: string; date: string; mime: string; data: string; type: "lab" | "imaging" | "discharge" | "consult" | "prescription" | "other" }[];
}

function vaccineKey(name: string): string | undefined {
  const n = name.toLowerCase();
  const rules: [string, string[]][] = [
    ["influenza", ["influenza", "flu"]],
    ["td", ["tetanus", "td ", "tdap", "diphtheria"]],
    ["hepb", ["hepatitis b", "hep b", "hepb"]],
    ["hepa", ["hepatitis a", "hep a", "hepa"]],
    ["hpv", ["hpv", "papilloma", "gardasil", "cervavac"]],
    ["typhoid", ["typhoid", "typbar"]],
    ["mmr", ["mmr", "measles", "mumps", "rubella"]],
    ["varicella", ["varicella", "chickenpox"]],
    ["covid", ["covid", "covishield", "covaxin", "sars-cov"]],
    ["pneumococcal", ["pneumo", "pcv", "ppsv"]],
    ["zoster", ["zoster", "shingles", "shingrix"]],
    ["rabies", ["rabies"]],
  ];
  return rules.find(([, words]) => words.some((w) => n.includes(w)))?.[0];
}

function docType(t: string): ParsedBundle["documents"][number]["type"] {
  const s = t.toLowerCase();
  if (/discharge/.test(s)) return "discharge";
  if (/x-?ray|ct|mri|usg|ultrasound|imaging|radiolog/.test(s)) return "imaging";
  if (/prescription|rx/.test(s)) return "prescription";
  if (/lab|report|diagnostic|blood|test/.test(s)) return "lab";
  if (/consult|op |opd|note/.test(s)) return "consult";
  return "other";
}

export function parseBundle(json: unknown): ParsedBundle {
  const out: ParsedBundle = { labs: [], vitals: [], history: [], vaccines: [], meds: [], documents: [] };
  const root = json as Res;
  const resources: Res[] =
    root?.resourceType === "Bundle"
      ? (root.entry ?? []).map((e: Res) => e.resource).filter(Boolean)
      : Array.isArray(json)
        ? (json as Res[])
        : root?.resourceType
          ? [root]
          : [];
  if (!resources.length) throw new Error("This file isn't a FHIR bundle");

  for (const r of resources) {
    switch (r.resourceType) {
      case "Observation": {
        const loinc = loincOf(r.code);
        const when = r.effectiveDateTime ?? r.effectivePeriod?.start ?? r.issued;
        const date = day(when);
        if (!date) break;
        if (loinc === "85354-9" || loinc === "55284-4") {
          const comp = (code: string) => r.component?.find((c: Res) => loincOf(c.code) === code)?.valueQuantity?.value;
          const sys = comp("8480-6");
          const dia = comp("8462-4");
          if (typeof sys === "number" && typeof dia === "number") out.vitals.push({ type: "bp", time: Date.parse(when), value: sys, value2: dia });
          break;
        }
        const vital = loinc ? VITAL_LOINC[loinc] : undefined;
        const q = r.valueQuantity;
        if (vital && typeof q?.value === "number") {
          let value = q.value;
          if (vital.type === "height" && /^m$/i.test(q.unit ?? q.code ?? "")) value *= 100;
          if (vital.type === "temp" && /f/i.test(q.unit ?? "") && value > 50) value = Math.round(((value - 32) * 5 / 9) * 10) / 10;
          out.vitals.push({ type: vital.type, time: Date.parse(when), value });
          break;
        }
        const name = text(r.code);
        if (!name) break;
        const test = loinc ? LAB_TESTS.find((t) => t.loinc === loinc) : undefined;
        const range = r.referenceRange?.[0];
        out.labs.push({
          code: test?.code,
          name,
          date,
          value: typeof q?.value === "number" ? q.value : undefined,
          valueText: q ? undefined : (r.valueString ?? text(r.valueCodeableConcept)),
          unit: q?.unit ?? q?.code,
          refLow: range?.low?.value,
          refHigh: range?.high?.value,
          refText: range?.text,
        });
        break;
      }
      case "Condition": {
        const name = text(r.code);
        if (!name) break;
        const st = r.clinicalStatus?.coding?.[0]?.code;
        out.history.push({ kind: "condition", name, date: day(r.onsetDateTime ?? r.recordedDate), status: st === "resolved" || st === "inactive" ? "resolved" : "active" });
        break;
      }
      case "AllergyIntolerance": {
        const name = text(r.code);
        if (!name) break;
        const cat = r.category?.[0];
        const sev = r.reaction?.[0]?.severity;
        out.history.push({
          kind: "allergy",
          name,
          reaction: text(r.reaction?.[0]?.manifestation?.[0]),
          severity: sev === "mild" || sev === "moderate" || sev === "severe" ? sev : r.criticality === "high" ? "severe" : undefined,
          category: cat === "medication" ? "medicine" : cat === "food" ? "food" : cat === "environment" ? "environment" : undefined,
          date: day(r.onsetDateTime ?? r.recordedDate),
        });
        break;
      }
      case "Procedure": {
        const name = text(r.code);
        if (name) out.history.push({ kind: "procedure", name, date: day(r.performedDateTime ?? r.performedPeriod?.start) });
        break;
      }
      case "Encounter": {
        if (r.class?.code === "IMP" || r.class?.code === "ACUTE") {
          const name = text(r.reasonCode?.[0]) ?? text(r.type?.[0]) ?? "Hospital stay";
          out.history.push({ kind: "hospitalization", name, date: day(r.period?.start) });
        }
        break;
      }
      case "Immunization": {
        const name = text(r.vaccineCode);
        const date = day(r.occurrenceDateTime);
        const key = name ? vaccineKey(name) : undefined;
        if (name && date && key) out.vaccines.push({ vaccine: key, date, name, dose: r.protocolApplied?.[0]?.doseNumberPositiveInt?.toString() });
        break;
      }
      case "MedicationRequest":
      case "MedicationStatement": {
        const name = text(r.medicationCodeableConcept) ?? r.medicationReference?.display;
        if (!name) break;
        out.meds.push({
          name,
          instructions: r.dosageInstruction?.[0]?.text ?? r.dosage?.[0]?.text,
          active: r.status === "active",
          start: day(r.authoredOn ?? r.effectiveDateTime ?? r.effectivePeriod?.start),
        });
        break;
      }
      case "DocumentReference":
      case "DiagnosticReport": {
        const atts: Res[] =
          r.resourceType === "DocumentReference" ? (r.content ?? []).map((c: Res) => c.attachment) : (r.presentedForm ?? []);
        const title = text(r.type) ?? text(r.code) ?? r.description ?? "Document";
        const date = day(r.date ?? r.effectiveDateTime ?? r.issued) ?? new Date().toISOString().slice(0, 10);
        for (const a of atts) {
          if (a?.data && a.contentType) {
            out.documents.push({ title: a.title ?? title, date, mime: a.contentType, data: a.data, type: r.resourceType === "DiagnosticReport" ? "lab" : docType(title) });
          }
        }
        break;
      }
      case "Binary":
        if (r.data && r.contentType) out.documents.push({ title: "Attachment", date: new Date().toISOString().slice(0, 10), mime: r.contentType, data: r.data, type: "other" });
        break;
    }
  }
  return out;
}

/** Mobu data -> a FHIR R4 collection bundle (export). */
export function buildBundle(input: {
  name: string;
  dob?: string;
  sex?: string;
  labs: { code: string; name: string; date: string; value?: number; valueText?: string; unit?: string; refLow?: number; refHigh?: number }[];
  vitals: { type: string; time: number; value: number; value2?: number; unit?: string }[];
  history: { kind: string; name: string; date?: string; status?: string; reaction?: string; severity?: string }[];
  immunizations: { vaccine: string; date: string; dose?: string }[];
  meds: { name: string; strength?: string; active: boolean; instructions?: string; start: string }[];
}): object {
  const pid = "patient-1";
  const subject = { reference: `Patient/${pid}` };
  const entries: Res[] = [
    {
      resourceType: "Patient",
      id: pid,
      name: [{ text: input.name }],
      birthDate: input.dob,
      gender: input.sex === "female" ? "female" : input.sex === "male" ? "male" : input.sex ? "other" : undefined,
    },
  ];
  const vitalCode = Object.fromEntries(Object.entries(VITAL_LOINC).map(([k, v]) => [v.type, k]));
  let n = 0;
  const id = () => `r${++n}`;
  for (const l of input.labs) {
    const t = LAB_TESTS.find((x) => x.code === l.code);
    entries.push({
      resourceType: "Observation",
      id: id(),
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
      code: { text: l.name, coding: t?.loinc ? [{ system: "http://loinc.org", code: t.loinc, display: t.name }] : undefined },
      subject,
      effectiveDateTime: l.date,
      valueQuantity: l.value != null ? { value: l.value, unit: l.unit } : undefined,
      valueString: l.value == null ? l.valueText : undefined,
      referenceRange: l.refLow != null || l.refHigh != null ? [{ low: l.refLow != null ? { value: l.refLow } : undefined, high: l.refHigh != null ? { value: l.refHigh } : undefined }] : undefined,
    });
  }
  for (const v of input.vitals) {
    const when = new Date(v.time).toISOString();
    if (v.type === "bp") {
      entries.push({
        resourceType: "Observation",
        id: id(),
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure" }] },
        subject,
        effectiveDateTime: when,
        component: [
          { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: v.value, unit: "mmHg" } },
          { code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] }, valueQuantity: { value: v.value2, unit: "mmHg" } },
        ],
      });
    } else if (vitalCode[v.type]) {
      entries.push({
        resourceType: "Observation",
        id: id(),
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: vitalCode[v.type] }], text: v.type },
        subject,
        effectiveDateTime: when,
        valueQuantity: { value: v.value, unit: v.unit },
      });
    }
  }
  for (const h of input.history) {
    if (h.kind === "condition") {
      entries.push({ resourceType: "Condition", id: id(), subject, code: { text: h.name }, onsetDateTime: h.date, clinicalStatus: { coding: [{ code: h.status === "resolved" ? "resolved" : "active" }] } });
    } else if (h.kind === "allergy") {
      entries.push({ resourceType: "AllergyIntolerance", id: id(), patient: subject, code: { text: h.name }, reaction: h.reaction ? [{ manifestation: [{ text: h.reaction }], severity: h.severity }] : undefined });
    } else if (h.kind === "procedure" || h.kind === "hospitalization" || h.kind === "injury" || h.kind === "implant") {
      entries.push({ resourceType: "Procedure", id: id(), subject, status: "completed", code: { text: `${h.kind}: ${h.name}` }, performedDateTime: h.date });
    } else if (h.kind === "family") {
      entries.push({ resourceType: "FamilyMemberHistory", id: id(), patient: subject, status: "completed", condition: [{ code: { text: h.name } }] });
    }
  }
  for (const i of input.immunizations) {
    entries.push({ resourceType: "Immunization", id: id(), patient: subject, status: "completed", vaccineCode: { text: VACCINES.find((x) => x.key === i.vaccine)?.name ?? i.vaccine }, occurrenceDateTime: i.date });
  }
  for (const m of input.meds) {
    entries.push({ resourceType: "MedicationStatement", id: id(), subject, status: m.active ? "active" : "completed", medicationCodeableConcept: { text: [m.name, m.strength].filter(Boolean).join(" ") }, dosage: m.instructions ? [{ text: m.instructions }] : undefined, effectiveDateTime: m.start });
  }
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: entries.map((resource) => ({ fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`, resource: JSON.parse(JSON.stringify(resource)) })),
  };
}

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { VACCINES } from "./preventionLogic";

/*
 * The public, view-only page behind a doctor link or the Medical ID QR code.
 * Plain server-rendered HTML (no app, no login), everything escaped, no
 * caching, and robots told to stay away.
 */

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* eslint-disable @typescript-eslint/no-explicit-any */
function section(title: string, body: string) {
  return body ? `<section><h2>${esc(title)}</h2>${body}</section>` : "";
}

function table(head: string[], rows: string[][]) {
  if (!rows.length) return "";
  return `<div class="t"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function renderSharePage(result: { error?: string; data?: any; expiresAt?: number }): string {
  const style = `
:root{--bg:#fbf6f1;--fg:#1e1620;--mute:#6b6070;--line:#e8dfd8;--accent:#6a45c9;--warn:#d4513f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#110d13;--fg:#f6efe9;--mute:#a59aa8;--line:#2a2230;--accent:#c3a6ff;--warn:#ff8f7e;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left)) 48px}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin:28px 0 8px}
.sub{color:var(--mute);font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:16px}
.k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}.v{font-size:18px}
.warn{color:var(--warn);font-weight:600}ul{margin:0;padding-left:20px}li{margin:3px 0}
.t{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;font-weight:500;color:var(--mute);font-size:12px;padding:6px 8px}
td{border-top:1px solid var(--line);padding:8px;vertical-align:top}.hi{color:var(--warn);font-weight:600}
footer{margin-top:40px;color:var(--mute);font-size:12px}.err{padding:60px 0;text-align:center}`;
  const shell = (title: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${style}</style></head><body><main>${body}</main></body></html>`;

  if (result.error || !result.data) return shell("Mobu", `<div class="err"><h1>${esc(result.error ?? "Not found")}</h1><p class="sub">Ask for a new link.</p></div>`);
  const d = result.data;
  const id = d.id;
  const age = id.dob ? Math.floor((Date.now() - Date.parse(id.dob)) / 31_557_600_000) : null;
  const header = `<h1>${esc(id.name)}</h1><div class="sub">${d.kind === "medid" ? "Medical ID" : "Shared health summary"}${
    result.expiresAt ? ` · link expires ${esc(new Date(result.expiresAt).toLocaleString("en-IN"))}` : ""
  }</div>
  <div class="grid">
    <div><div class="k">Blood group</div><div class="v">${esc(id.bloodGroup ?? "Not set")}</div></div>
    ${age != null ? `<div><div class="k">Age</div><div class="v">${age}</div></div>` : ""}
    ${id.organDonor ? `<div><div class="k">Organ donor</div><div class="v">${id.organDonor === "yes" ? "Yes" : "No"}</div></div>` : ""}
    ${id.abhaNumber ? `<div><div class="k">ABHA</div><div class="v">${esc(id.abhaNumber)}</div></div>` : ""}
  </div>`;
  const allergies = section(
    "Allergies",
    id.allergies.length
      ? `<ul>${id.allergies
          .map((a: any) => `<li class="${a.severity === "severe" ? "warn" : ""}">${esc(a.name)}${a.reaction ? `: ${esc(a.reaction)}` : ""}${a.severity ? ` (${esc(a.severity)})` : ""}</li>`)
          .join("")}</ul>`
      : "<p>No known allergies recorded.</p>",
  );
  const conditions = section("Conditions", id.conditions.length ? `<ul>${id.conditions.map((c: string) => `<li>${esc(c)}</li>`).join("")}</ul>` : "");
  const implants = section("Implants and devices", id.implants.length ? `<ul>${id.implants.map((c: string) => `<li>${esc(c)}</li>`).join("")}</ul>` : "");
  const meds = d.meds
    ? section("Current medicines", table(["Medicine", "When", "For", "Since"], d.meds.map((m: any) => [esc(m.name), esc(m.schedule), esc(m.purpose ?? ""), esc(m.since)])))
    : section("Current medicines", id.medications.length ? `<ul>${id.medications.map((m: string) => `<li>${esc(m)}</li>`).join("")}</ul>` : "");
  const contacts = section(
    "Emergency contacts",
    id.contacts.length ? `<ul>${id.contacts.map((c: any) => `<li>${esc(c.name)}${c.relation ? ` (${esc(c.relation)})` : ""}: <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></li>`).join("")}</ul>` : "",
  );
  const insurance = section("Insurance", id.insurance.length ? `<ul>${id.insurance.map((p: any) => `<li>${esc(p.insurer)}${p.policyNumber ? ` · ${esc(p.policyNumber)}` : ""}${p.tpaPhone ? ` · helpline ${esc(p.tpaPhone)}` : ""}</li>`).join("")}</ul>` : "");

  let body = header + allergies + conditions + meds + implants + contacts;
  if (d.kind === "medid") body += insurance;
  if (d.history) {
    body += section(
      "History",
      table(["Type", "Item", "When", "Status"], d.history.map((h: any) => [esc(h.kind === "family" ? `Family (${h.relative ?? ""})` : h.kind), esc(h.name), esc(h.date ?? ""), esc(h.status ?? "")])),
    );
  }
  if (d.labs) {
    body += section(
      "Lab results, last 12 months",
      table(["Date", "Test", "Result", "Range"], d.labs.map((l: any) => [esc(l.date), esc(l.name), `<span class="${l.flag === "high" || l.flag === "low" || l.flag === "abnormal" ? "hi" : ""}">${esc(l.value)} ${esc(l.unit ?? "")}</span>`, esc(l.ref)])),
    );
  }
  if (d.vitals) body += section("Recent readings", table(["Date", "Reading", "Value", "Note"], d.vitals.map((r: any) => [esc(r.date), esc(r.type), `${esc(r.value)} ${esc(r.unit ?? "")}`, esc(r.context ?? "")])));
  if (d.visits) {
    body += section(
      "Visits",
      table(["Date", "Visit", "Doctor", "Notes"], d.visits.map((a: any) => [esc(a.date), esc(a.title), esc(a.doctor ?? ""), esc([a.diagnosis, ...(a.questions ?? []).map((q: string) => `Question: ${q}`)].filter(Boolean).join(" · "))])),
    );
  }
  if (d.vaccines) {
    const name = (k: string) => VACCINES.find((v) => v.key === k)?.name ?? k;
    body += section("Vaccines", table(["Vaccine", "Dose", "Date"], d.vaccines.map((x: any) => [esc(name(x.vaccine)), esc(x.dose ?? ""), esc(x.date)])));
  }
  if (d.care) {
    const fmt = (at: number) => new Date(at).toLocaleString("en-IN", { timeZone: d.care.tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    body += section(
      `Illness log: ${d.care.title}`,
      table(["Time", "What", "Detail"], d.care.logs.map((l: any) => [esc(fmt(l.at)), esc(l.kind), esc(l.medName ?? (l.value != null ? `${l.value} ${l.unit ?? ""}` : l.text ?? ""))])),
    );
  }
  body += `<footer>Shared from Mobu, a private app for two. Read-only. This information was entered by the patient.</footer>`;
  return shell(`${id.name} · ${d.kind === "medid" ? "Medical ID" : "Health summary"}`, body);
}

export const sharePage = httpAction(async (ctx, request): Promise<Response> => {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const result: { error?: string; data?: unknown; expiresAt?: number } = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await ctx.runMutation(internal.health.sharing.openLink, { token })
    : { error: "This link isn't valid." };
  return new Response(renderSharePage(result), {
    status: result.error ? 404 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
});

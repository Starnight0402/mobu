import React, { useMemo, useState } from 'react';
import { Braces, FileDown, FolderArchive, FileText, Copy, Trash2 } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useAction } from 'convex/react';
import { useQuery, useMutation, } from '../../lib/queryCache';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { takeHealthIntent } from '../../lib/healthIntent';
import { saveTextFile } from '../../lib/saveFile';
import { buildBundle } from '../../../convex/health/fhir';
import { Btn, Card, Chips, fmtWhen, List, Note, Row, Screen, Section, Select, attempt, usePeople } from './ui';

const SCOPES = [
  { value: 'meds', label: 'Current medicines' },
  { value: 'allergies', label: 'Allergies' },
  { value: 'conditions', label: 'Conditions and history' },
  { value: 'labs', label: 'Labs, 12 months' },
  { value: 'vitals', label: 'Recent readings' },
  { value: 'visits', label: 'Visits' },
  { value: 'vaccines', label: 'Vaccines' },
  { value: 'care', label: 'Illness log' },
];
const LEVEL_LABEL: Record<string, string> = { full: 'Everything', summary: 'Summary', dates: 'Dates only', hidden: 'Hidden' };
const CATEGORY_LABEL: Record<string, string> = { records: 'Records and labs', meds: 'Medicines and doses', visits: 'Visits', vitals: 'Vitals and body', symptoms: 'Symptoms', cycle: 'Cycle', mind: 'Mind' };

export const ShareView: React.FC = () => {
  const sharing = useQuery(api.health.profile.sharing);
  const setSharing = useMutation(api.health.profile.setSharing);
  const links = useQuery(api.health.sharing.links) ?? [];
  const log = useQuery(api.health.sharing.accessLog) ?? [];
  const createLink = useAction(api.health.sharing.createLink);
  const revoke = useMutation(api.health.sharing.revokeLink);
  const convex = useConvex();
  const { partnerName } = usePeople();
  const intent = useMemo(() => takeHealthIntent('health-share'), []);
  const [scopes, setScopes] = useState<string[]>(intent === 'care' ? ['care', 'meds', 'allergies'] : ['meds', 'allergies', 'conditions', 'labs']);
  const [hours, setHours] = useState('24');
  const [made, setMade] = useState<string | null>(null);

  const toggle = (v: string) => setScopes(scopes.includes(v) ? scopes.filter((s) => s !== v) : [...scopes, v]);
  const make = async () => {
    const r = await attempt(() => createLink({ kind: 'doctor', scopes, hours: +hours }));
    if (r) setMade(r.url);
  };
  const qr = useMemo(() => {
    if (!made) return null;
    const q = qrcode(0, 'M');
    q.addData(made);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [made]);

  const exportJson = async () => {
    const data = await attempt(() => convex.query(api.health.fhirImport.myExport, {}));
    if (data) await saveTextFile(`health-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  };
  const exportFhir = async () => {
    const d = await attempt(() => convex.query(api.health.fhirImport.myExport, {}));
    if (!d) return;
    const bundle = buildBundle({
      name: d.name,
      dob: d.profile?.dob,
      sex: d.profile?.sexAtBirth,
      labs: d.labs.map((l) => ({ code: l.code, name: l.name, date: l.date, value: l.value, valueText: l.valueText, unit: l.unit, refLow: l.refLow, refHigh: l.refHigh })),
      vitals: d.vitals.map((v) => ({ type: v.type, time: v.time, value: v.value, value2: v.value2, unit: v.unit })),
      history: d.history.map((h) => ({ kind: h.kind, name: h.name, date: h.date, status: h.status, reaction: h.reaction, severity: h.severity })),
      immunizations: d.immunizations.map((i) => ({ vaccine: i.vaccine, date: i.date, dose: i.dose })),
      meds: d.medications.map((m) => ({ name: m.name, strength: m.strength, active: m.active, instructions: m.instructions, start: m.schedule.startDate })),
    });
    await saveTextFile(`health-fhir-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2), 'application/fhir+json');
  };
  const exportLinks = async () => {
    const d = await attempt(() => convex.query(api.health.fhirImport.myExport, {}));
    if (d) await saveTextFile('health-file-links.txt', d.files.map((f) => `${f.date}  ${f.record}  ${f.name}\n${f.url}\n`).join('\n') || 'No files', 'text/plain');
  };

  return (
    <Screen title="Share" sub="Doctors, each other, exports">
      <Card>
        <span className="text-base">Share with a doctor</span>
        <Chips multi value={scopes} onChange={toggle} options={SCOPES} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Link expires after</span>
          <div className="w-40"><Select value={hours} onChange={setHours} options={[{ value: '1', label: '1 hour' }, { value: '24', label: '24 hours' }, { value: '168', label: '7 days' }, { value: '720', label: '30 days' }]} /></div>
        </div>
        <Btn disabled={!scopes.length} onClick={make}>Make a link and QR code</Btn>
        {made && qr && (
          <div className="flex items-center gap-4">
            <div className="h-32 w-32 shrink-0 rounded-xl bg-white p-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="break-all font-mono text-[11px] text-white/55">{made}</span>
              <button type="button" className="flex items-center gap-1.5 text-sm text-nothing-purple" onClick={() => navigator.clipboard?.writeText(made).catch(() => {})}><Copy size={14} />Copy link</button>
            </div>
          </div>
        )}
        <span className="text-xs text-white/45">A view-only page. The doctor needs no account. You see each time it's opened, and can turn it off any time.</span>
      </Card>

      {links.length > 0 && (
        <Section title="Active links">
          <List>
            {links.map((l) => (
              <Row key={l._id} title={l.kind === 'medid' ? 'Medical ID card' : l.label ?? `Doctor link: ${l.scopes.join(', ')}`} meta={`${l.expiresAt ? `expires ${fmtWhen(l.expiresAt)}` : 'no expiry'} · opened ${l.opens}×`} end={<button aria-label="Turn off" onClick={() => attempt(() => revoke({ id: l._id }))} className="text-white/30"><Trash2 size={15} /></button>} />
            ))}
          </List>
        </Section>
      )}

      <Section title="Between the two of you">
        <div className="glass divide-y divide-white/[0.07]">
          {sharing && sharing.categories.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm">{CATEGORY_LABEL[c]}</span>
              <div className="w-36"><Select value={sharing.mine[c]} onChange={(level) => attempt(() => setSharing({ category: c, level }))} options={sharing.allowed[c].map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} aria-label={CATEGORY_LABEL[c]} /></div>
            </div>
          ))}
        </div>
        <Note>This is what {partnerName} sees of your health. Each of you sets your own, and it is enforced on the server. Medical ID, history, prevention and insurance are always visible to both.</Note>
      </Section>
      {sharing?.theirs && (
        <Note>{partnerName} shares with you: {sharing.categories.map((c) => `${CATEGORY_LABEL[c].toLowerCase()} (${LEVEL_LABEL[sharing.theirs![c]].toLowerCase()})`).join(', ')}.</Note>
      )}

      {log.length > 0 && (
        <Section title="Who looked">
          <List>{log.slice(0, 15).map((l) => <Row key={l._id} title={l.label} meta={fmtWhen(l.at)} />)}</List>
        </Section>
      )}

      <Section title="Export your health data">
        <List>
          <Row icon={<FileDown size={16} />} title="Everything as JSON" meta="Records, labs, readings, medicines, history. Your data only." onClick={exportJson} />
          <Row icon={<Braces size={16} />} title="FHIR file for other health apps" meta="The standard hospitals and Health Connect use" onClick={exportFhir} />
          <Row icon={<FolderArchive size={16} />} title="Links to all original files" meta="Open each report and save it" onClick={exportLinks} />
          <Row icon={<FileText size={16} />} title="Download all our data" meta="In Settings. Now includes your health data." />
        </List>
      </Section>
    </Screen>
  );
};

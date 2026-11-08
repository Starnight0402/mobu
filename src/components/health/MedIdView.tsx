import React, { useMemo, useState } from 'react';
import { Asterisk, Image as ImageIcon, QrCode, Trash2 } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useAction } from 'convex/react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { goToTab } from '../../lib/navigation';
import { Av, Btn, Card, cx, Field, fmtDate, Input, List, Note, PersonSwitch, Pill, Row, Screen, Select, Sheet, Toggle, attempt, usePeople, useWho } from './ui';

function ageOf(dob?: string) {
  if (!dob) return null;
  return Math.floor((Date.now() - Date.parse(dob)) / 31_557_600_000);
}

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="h-32 w-32 shrink-0 rounded-xl bg-white p-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export const MedIdView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const ids = useQuery(api.health.profile.medicalId, { who });
  const links = useQuery(api.health.sharing.links) ?? [];
  const createLink = useAction(api.health.sharing.createLink);
  const revoke = useMutation(api.health.sharing.revokeLink);
  const [edit, setEdit] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const medLink = links.find((l) => l.kind === 'medid');

  const makeQr = async () => {
    const r = await attempt(() => createLink({ kind: 'medid', scopes: [] }));
    if (r) setUrl(r.url);
  };

  return (
    <Screen title="Medical ID" sub="For emergencies">
      <PersonSwitch />
      {ids?.map((m) => {
        const age = ageOf(m.dob);
        const name = m.isMe ? meName : partnerName;
        return (
          <div key={m.userId} className="glass space-y-4 p-4" style={{ background: 'linear-gradient(140deg, color-mix(in oklab, var(--color-coral) 22%, var(--color-surface)), var(--color-surface) 55%)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Av isMe={m.isMe} size="lg" name={name} /><div><div className="text-lg">{name}</div><div className="text-xs text-white/50">{[age ? `${age} years` : null, m.heightCm ? `${m.heightCm} cm` : null].filter(Boolean).join(' · ')}</div></div></div>
              <Pill tone="coral"><Asterisk size={13} />Medical ID</Pill>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field2 k="Blood" v={m.bloodGroup ?? 'Not set'} mono />
              <Field2 k="Organ donor" v={m.organDonor === 'yes' ? 'Yes' : m.organDonor === 'no' ? 'No' : 'Not set'} />
              <Field2 k="ABHA" v={m.abhaNumber ? `••${m.abhaNumber.slice(-9)}` : 'Not linked'} mono />
            </div>
            <Block label="Allergies" empty="None recorded">{m.allergies.map((a) => <span key={a.name} className={cx(a.severity === 'severe' && 'font-semibold text-coral')}>{a.name}{a.reaction ? `: ${a.reaction}` : ''}{a.severity ? ` (${a.severity})` : ''}</span>)}</Block>
            <Block label="Conditions" empty="None recorded">{m.conditions.map((c) => <span key={c}>{c}</span>)}</Block>
            <Block label="Medicines" empty="None">{m.medications.map((c) => <span key={c}>{c}</span>)}</Block>
            {m.implants.length > 0 && <Block label="Implants" empty="">{m.implants.map((c) => <span key={c}>{c}</span>)}</Block>}
            <Block label="Call" empty="Add an emergency contact">{m.contacts.map((c) => <a key={c.phone} href={`tel:${c.phone}`} className="text-nothing-purple">{c.name}{c.relation ? ` (${c.relation})` : ''} · <span className="font-mono">{c.phone}</span></a>)}</Block>
            {m.insurance.length > 0 && <Block label="Insurance" empty="">{m.insurance.map((i) => <span key={i.insurer}>{i.insurer}{i.policyNumber ? ` · ${i.policyNumber}` : ''}{i.tpaPhone ? ` · helpline ${i.tpaPhone}` : ''}</span>)}</Block>}
          </div>
        );
      })}
      <Btn kind="secondary" onClick={() => setEdit(true)}>Edit my details</Btn>

      <Card>
        <div className="flex items-center gap-4">
          {url ? <Qr text={url} /> : <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/30"><QrCode size={34} /></span>}
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[15px]">QR code for the full card</span>
            <span className="text-xs text-white/50">Anyone who scans it sees a read-only page with your allergies, medicines and contacts. Nothing else, and it needs no login.</span>
            {medLink && !url && <span className="text-xs text-sage">A link is active.</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Btn kind="secondary" onClick={makeQr}>{url || medLink ? 'Make a new code' : 'Make my QR code'}</Btn>
          {medLink && <Btn kind="danger" onClick={() => attempt(() => revoke({ id: medLink._id })).then(() => setUrl(null))}><Trash2 size={16} />Turn off</Btn>}
        </div>
        {url && <Note>Save a screenshot, print it, or keep it on your lock screen. Making a new code switches the old one off.</Note>}
      </Card>
      <Note>Your partner can always see your Medical ID, whatever else you hide. It is for the moments they need it.</Note>
      <button type="button" onClick={() => goToTab('health-history')} className="px-1 text-sm text-nothing-purple">Allergies and conditions live in History</button>
      <EditSheet open={edit} onClose={() => setEdit(false)} />
    </Screen>
  );
};

const Field2 = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <div className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-[0.12em] text-white/45">{k}</span><span className={cx('text-[15px]', mono && 'font-mono')}>{v}</span></div>
);
function Block({ label, empty, children }: { label: string; empty: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  if (!items.length && !empty) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="flex flex-col text-sm">{items.length ? items : <span className="text-white/40">{empty}</span>}</div>
    </div>
  );
}

function EditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const people = useQuery(api.health.profile.people);
  const save = useMutation(api.health.profile.save);
  const mine = people?.find((p) => p.isMe)?.profile;
  const [f, setF] = useState<null | { dob: string; sex: string; height: string; blood: string; donor: string; contacts: { name: string; relation: string; phone: string }[] }>(null);
  React.useEffect(() => {
    if (open && people) setF({ dob: mine?.dob ?? '', sex: mine?.sexAtBirth ?? '', height: mine?.heightCm ? String(mine.heightCm) : '', blood: mine?.bloodGroup ?? '', donor: mine?.organDonor ?? '', contacts: (mine?.emergencyContacts ?? []).map((c) => ({ name: c.name, relation: c.relation ?? '', phone: c.phone })) });
  }, [open, people]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  return (
    <Sheet open={open} onClose={onClose} title="My details">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date of birth"><Input type="date" value={f.dob} onChange={(e) => set({ dob: e.target.value })} /></Field>
        <Field label="Sex at birth"><Select value={f.sex} onChange={(v) => set({ sex: v })} options={[{ value: '', label: '–' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'intersex', label: 'Intersex' }]} /></Field>
        <Field label="Height (cm)"><Input inputMode="numeric" value={f.height} onChange={(e) => set({ height: e.target.value })} /></Field>
        <Field label="Blood group"><Select value={f.blood} onChange={(v) => set({ blood: v })} options={[{ value: '', label: '–' }, ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({ value: b, label: b }))]} /></Field>
      </div>
      <Field label="Organ donor"><Select value={f.donor} onChange={(v) => set({ donor: v })} options={[{ value: '', label: 'Not set' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></Field>
      <Note>Date of birth and sex at birth decide which screenings and lab ranges apply to you.</Note>
      <div className="space-y-2">
        <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-white/40">Emergency contacts</span>
        {f.contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label="Name" value={c.name} onChange={(e) => set({ contacts: f.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Name" className="nothing-input !px-3 !py-2" />
            <input aria-label="Phone" inputMode="tel" value={c.phone} onChange={(e) => set({ contacts: f.contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) })} placeholder="Phone" className="nothing-input !px-3 !py-2 font-mono" />
            <button type="button" aria-label="Remove" onClick={() => set({ contacts: f.contacts.filter((_, j) => j !== i) })} className="text-white/30"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ contacts: [...f.contacts, { name: '', relation: '', phone: '' }] })} className="text-sm text-nothing-purple">Add a contact</button>
      </div>
      <Btn onClick={async () => {
        const ok = await attempt(() => save({ dob: f.dob, sexAtBirth: (f.sex || undefined) as never, heightCm: f.height ? Number(f.height) : undefined, bloodGroup: f.blood || undefined, organDonor: (f.donor || undefined) as never, emergencyContacts: f.contacts.filter((c) => c.name && c.phone) }));
        if (ok !== undefined) onClose();
      }}>Save</Btn>
    </Sheet>
  );
}

export { ImageIcon, Toggle, List, Row, fmtDate };

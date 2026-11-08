import React, { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Calendar, Check, Copy, Glasses, MapPin, Mic, Plus, Smile, Stethoscope, Trash2, UtensilsCrossed, Video, X, FlaskConical, Syringe, Brain } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { takeHealthIntent, setHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import { confirmDialog } from '../Dialog';
import {
  Av, Btn, Card, cx, Empty, Field, fmtDate, fmtWhen, IconBtn, Input, List, Note, Overlay, PersonSwitch, Pill, Row, Screen, Section,
  Segmented, Select, Sheet, TextArea, Toggle, attempt, localInput, money, num, usePeople, useUpload, useWho,
} from './ui';

type Kind = 'consult' | 'test' | 'dental' | 'eye' | 'vaccine' | 'therapy' | 'other';
const KINDS: { value: Kind; label: string; icon: LucideIcon }[] = [
  { value: 'consult', label: 'Doctor', icon: Stethoscope },
  { value: 'test', label: 'Test', icon: FlaskConical },
  { value: 'dental', label: 'Dental', icon: Smile },
  { value: 'eye', label: 'Eye', icon: Glasses },
  { value: 'vaccine', label: 'Vaccine', icon: Syringe },
  { value: 'therapy', label: 'Therapy', icon: Brain },
  { value: 'other', label: 'Other', icon: Calendar },
];
const kindIcon = (k: string) => KINDS.find((x) => x.value === k)?.icon ?? Calendar;

export const VisitsView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const visits = useQuery(api.health.visits.list, { who });
  const providers = useQuery(api.health.visits.providers) ?? [];
  const [editing, setEditing] = useState<Doc<'appointments'> | 'new' | null>(null);
  const [open, setOpen] = useState<Id<'appointments'> | null>(null);
  const [prov, setProv] = useState<Doc<'providers'> | 'new' | null>(null);
  useEffect(() => {
    if (takeHealthIntent('health-visits') === 'add') setEditing('new');
  }, []);
  const now = Date.now();
  const upcoming = (visits ?? []).filter((v) => v.status === 'upcoming' && v.start > now - 3 * 3_600_000).sort((a, b) => a.start - b.start);
  const past = (visits ?? []).filter((v) => !upcoming.includes(v) && v.status !== 'cancelled');
  const both = who === 'both';

  return (
    <Screen title="Visits" sub="Appointments and your doctors" actions={<IconBtn icon={Plus} label="New appointment" primary onClick={() => setEditing('new')} />}>
      <PersonSwitch />
      <Section title="Coming up">
        {upcoming.length === 0 ? (
          <Empty icon={Calendar} title="No appointments coming up" body="Add one to get a reminder the evening before, a fasting reminder, and a list of questions to ask." />
        ) : (
          upcoming.map((v) => {
            const Icon = kindIcon(v.kind);
            return (
              <Card key={v._id} onClick={() => setOpen(v._id)}>
                <div className="flex items-center justify-between">
                  <Pill tone="purple">{fmtWhen(v.start)}</Pill>
                  <span className="flex items-center gap-1">{both && <Av isMe={v.isMine} name={v.isMine ? meName : partnerName} />}{v.companion && <Av isMe={!v.isMine} name={!v.isMine ? meName : partnerName} />}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Icon size={18} className="mt-1 text-white/40" />
                  <div>
                    <div className="text-lg leading-snug">{v.title}</div>
                    <div className="text-sm text-white/45">{[v.doctor, v.specialty, v.isVideo ? 'Video call' : v.place].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {v.fastingFrom && <Pill tone="gold">Fast from {new Date(v.fastingFrom).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Pill>}
                  {v.questions.length > 0 && <Pill>{v.questions.filter((q) => !q.done).length} questions</Pill>}
                  {v.bring.length > 0 && <Pill>{v.bring.filter((b) => !b.done).length} to take</Pill>}
                  {v.companion && <Pill tone="sage">Going together</Pill>}
                </div>
              </Card>
            );
          })
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Past visits">
          <List>
            {past.slice(0, 30).map((v) => {
              const Icon = kindIcon(v.kind);
              return (
                <Row key={v._id} icon={<Icon size={16} />} title={v.title} meta={[fmtDate(new Date(v.start).toISOString()), v.doctor, v.diagnosis ?? v.notes?.slice(0, 80)].filter(Boolean).join(' · ')} onClick={() => setOpen(v._id)}
                  end={<>{both && <Av isMe={v.isMine} size="sm" name={v.isMine ? meName : partnerName} />}{v.fee != null && <span className="font-mono text-xs text-white/55">{money(v.fee)}</span>}</>} />
              );
            })}
          </List>
        </Section>
      )}

      <Section title="Care team" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setProv('new')}>Add</button>}>
        {providers.length ? (
          <List>
            {providers.map((p) => (
              <Row key={p._id} icon={p.kind === 'doctor' || p.kind === 'dentist' ? <Stethoscope size={16} /> : <Building2 size={16} />} tone={p.kind === 'doctor' ? 'purple' : undefined}
                title={p.name} meta={[p.specialty ?? p.kind, p.phone, p.cashless ? 'cashless ✓' : null, p.visits ? `seen ${p.visits}×` : null].filter(Boolean).join(' · ')} onClick={() => setProv(p)} />
            ))}
          </List>
        ) : (
          <Note>Your doctors, labs, pharmacies and hospitals, with phone numbers and which ones take your insurance cashless.</Note>
        )}
      </Section>

      {editing && <VisitForm visit={editing === 'new' ? null : editing} providers={providers} onClose={() => setEditing(null)} />}
      {prov && <ProviderForm p={prov === 'new' ? null : prov} onClose={() => setProv(null)} />}
      <Overlay open={!!open} onClose={() => setOpen(null)}>{open && <VisitDetail id={open} onEdit={(v) => setEditing(v)} onClose={() => setOpen(null)} />}</Overlay>
    </Screen>
  );
};

function VisitDetail({ id, onEdit, onClose }: { id: Id<'appointments'>; onEdit: (v: Doc<'appointments'>) => void; onClose: () => void }) {
  const v = useQuery(api.health.visits.get, { id });
  const settings = useQuery(api.settings.get);
  const { meId } = usePeople();
  const addItem = useMutation(api.health.visits.addItem);
  const toggleItem = useMutation(api.health.visits.toggleItem);
  const removeItem = useMutation(api.health.visits.removeItem);
  const setCompanion = useMutation(api.health.visits.setCompanion);
  const update = useMutation(api.health.visits.update);
  const addExpense = useMutation(api.expenses.add);
  const upload = useUpload();
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [newQ, setNewQ] = useState('');
  const [newB, setNewB] = useState('');
  const [after, setAfter] = useState<{ diagnosis: string; notes: string; followUp: string; fee: string } | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  useEffect(() => {
    if (v && !after) {
      setAfter({ diagnosis: v.diagnosis ?? '', notes: v.notes ?? '', followUp: v.followUp ?? '', fee: v.fee != null ? String(v.fee) : '' });
      if (v.status === 'done' || v.start < Date.now() - 3_600_000) setPhase('after');
    }
  }, [v, after]);
  if (!v || !after) return <p className="py-20 text-center text-white/40">Loading…</p>;

  const record = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    const ok = await confirmDialog({ title: 'Record the advice?', body: 'Ask the doctor first. The recording is saved with this visit.', confirmLabel: 'Start recording' });
    if (!ok) return;
    await attempt(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        await attempt(async () => {
          const up = await upload(blob, { compress: false, name: 'advice.webm' });
          await update({ id, voiceStorageId: up.storageId });
        });
      };
      rec.start();
      setRecording(rec);
    }, "Couldn't start recording");
  };

  const saveAfter = async () => {
    const fee = num(after.fee);
    await attempt(async () => {
      await update({ id, diagnosis: after.diagnosis, notes: after.notes, followUp: after.followUp || undefined, fee, status: 'done' });
      if (fee && !v.expenseId && (await confirmDialog({ title: `Add the ${money(fee)} fee to Split?`, confirmLabel: 'Add to Split' }))) {
        const expenseId = await addExpense({ amount: fee, splitRatio: 50, category: 'Medical', currency: settings?.currency ?? 'INR', note: v.title, spentAt: v.start });
        await update({ id, expenseId });
      }
    });
  };

  const checklist = (list: 'bring' | 'questions', items: { text: string; done: boolean; by?: string }[], value: string, setValue: (s: string) => void, placeholder: string) => (
    <List>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <button type="button" aria-label="Done" onClick={() => attempt(() => toggleItem({ id, list, index: i }))} className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]', it.done ? 'border-sage bg-sage text-nothing-black' : 'border-white/25')}>{it.done && <Check size={13} />}</button>
          <span className="flex min-w-0 flex-1 flex-col"><span className={cx('text-sm', it.done && 'text-white/40 line-through')}>{it.text}</span>{it.by && <span className="text-[11px] text-white/35">Added by {it.by === meId ? 'you' : 'your partner'}</span>}</span>
          <button type="button" aria-label="Remove" onClick={() => attempt(() => removeItem({ id, list, index: i }))} className="text-white/25"><X size={14} /></button>
        </div>
      ))}
      <form className="flex items-center gap-2 px-4 py-2" onSubmit={async (e) => { e.preventDefault(); if (!value.trim()) return; await attempt(() => addItem({ id, list, text: value })); setValue(''); }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-white/35" />
        <button type="submit" className="text-sm text-nothing-purple">Add</button>
      </form>
    </List>
  );

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-1">
        <h1 className="dot-matrix text-[1.7rem] font-medium leading-tight">{v.title}</h1>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{[v.doctor, fmtWhen(v.start)].filter(Boolean).join(' · ')}</p>
      </header>
      <Segmented value={phase} onChange={setPhase} options={[{ value: 'before', label: 'Before' }, { value: 'after', label: 'During & after' }]} />
      {phase === 'before' ? (
        <>
          <List>
            {v.fastingFrom && <Row icon={<UtensilsCrossed size={16} />} tone="gold" title={`Fast from ${fmtWhen(v.fastingFrom)}`} meta="Water is fine. You'll get a reminder 30 minutes before." />}
            {v.prepNotes && <Row icon={<Stethoscope size={16} />} title={v.prepNotes} />}
            {(v.place || v.provider) && <Row icon={v.isVideo ? <Video size={16} /> : <MapPin size={16} />} title={v.isVideo ? 'Video consult' : v.place ?? v.provider?.name} meta={v.provider?.phone} />}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">{v.isMine ? 'Partner is coming along' : "I'm coming along"}</span>
              <Toggle on={!!v.companion} onChange={(val) => attempt(() => setCompanion({ id, value: val }))} label="Coming along" />
            </div>
          </List>
          <Section title="Take along">{checklist('bring', v.bring, newB, setNewB, 'Last 3 reports, insurance card…')}</Section>
          <Section title="Questions to ask">{checklist('questions', v.questions, newQ, setNewQ, 'Add a question')}</Section>
          <Note>Either of you can add questions and tick things off.</Note>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            {v.isMine && <Btn kind="secondary" onClick={record}><Mic size={16} />{recording ? 'Stop recording' : v.voiceUrl ? 'Record again' : 'Record advice'}</Btn>}
            {v.isMine && <Btn kind="secondary" onClick={() => { setHealthIntent('health-records', 'upload'); onClose(); goToTab('health-records'); }}>Scan prescription</Btn>}
          </div>
          {v.voiceUrl && <audio controls src={v.voiceUrl} className="w-full" />}
          {v.isMine ? (
            <Card>
              <Field label="Diagnosis"><Input value={after.diagnosis} onChange={(e) => setAfter({ ...after, diagnosis: e.target.value })} /></Field>
              <Field label="What the doctor said"><TextArea value={after.notes} onChange={(e) => setAfter({ ...after, notes: e.target.value })} placeholder="Continue medicine. Walk 30 min daily. Retest in 3 months." /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Follow-up"><Input type="date" value={after.followUp} onChange={(e) => setAfter({ ...after, followUp: e.target.value })} /></Field>
                <Field label="Fee ₹"><Input inputMode="decimal" value={after.fee} onChange={(e) => setAfter({ ...after, fee: e.target.value })} /></Field>
              </div>
              <Btn onClick={saveAfter}>Save visit</Btn>
            </Card>
          ) : (
            <List>
              {v.diagnosis && <Row title="Diagnosis" meta={v.diagnosis} />}
              {v.notes && <Row title="Notes" meta={v.notes} />}
              {v.followUp && <Row title="Follow-up" meta={fmtDate(v.followUp)} />}
            </List>
          )}
          {v.records.length > 0 && (
            <Section title="Records from this visit">
              <List>{v.records.map((r) => <Row key={r._id} title={r.title} meta={fmtDate(r.date)} onClick={() => { setHealthIntent('health-records', `open:${r._id}`); onClose(); goToTab('health-records'); }} />)}</List>
            </Section>
          )}
        </>
      )}
      {v.canEdit && (
        <div className="flex gap-2">
          <Btn kind="secondary" onClick={() => onEdit(v as Doc<'appointments'>)}>Edit</Btn>
          {v.status === 'upcoming' && <Btn kind="secondary" onClick={() => attempt(() => update({ id, status: 'cancelled' }))}>Cancel visit</Btn>}
        </div>
      )}
    </div>
  );
}

function VisitForm({ visit, providers, onClose }: { visit: Doc<'appointments'> | null; providers: Doc<'providers'>[]; onClose: () => void }) {
  const create = useMutation(api.health.visits.create);
  const update = useMutation(api.health.visits.update);
  const remove = useMutation(api.health.visits.remove);
  const [f, setF] = useState({
    title: visit?.title ?? '',
    kind: (visit?.kind ?? 'consult') as Kind,
    doctor: visit?.doctor ?? '',
    specialty: visit?.specialty ?? '',
    providerId: visit?.providerId ?? '',
    place: visit?.place ?? '',
    start: localInput(visit?.start ?? Date.now() + 86_400_000),
    isVideo: visit?.isVideo ?? false,
    fasting: !!visit?.fastingFrom,
    fastingHours: visit?.fastingFrom && visit.start ? String(Math.round((visit.start - visit.fastingFrom) / 3_600_000)) : '12',
    prepNotes: visit?.prepNotes ?? '',
    bring: '',
  });
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF({ ...f, [k]: val });
  const save = async () => {
    const start = new Date(f.start).getTime();
    const fastingFrom = f.fasting ? start - (num(f.fastingHours) ?? 12) * 3_600_000 : undefined;
    const p = providers.find((x) => x._id === f.providerId);
    const base = {
      title: f.title || [KINDS.find((k) => k.value === f.kind)?.label, f.doctor].filter(Boolean).join(' · '),
      kind: f.kind,
      doctor: f.doctor || (p?.kind === 'doctor' ? p.name : undefined),
      specialty: f.specialty || p?.specialty,
      providerId: (f.providerId || undefined) as Id<'providers'> | undefined,
      place: f.place || p?.address,
      start,
      isVideo: f.isVideo,
      fastingFrom,
      prepNotes: f.prepNotes,
    };
    const ok = await attempt(() => (visit ? update({ id: visit._id, ...base }) : create({ ...base, bring: f.bring.split(',').map((s) => s.trim()).filter(Boolean) })));
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={visit ? 'Edit appointment' : 'New appointment'}>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {KINDS.map((k) => <button key={k.value} type="button" onClick={() => set('kind', k.value)} className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px]', f.kind === k.value ? 'bg-white text-black' : 'glass')}><k.icon size={14} />{k.label}</button>)}
      </div>
      <Field label="What for"><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Thyroid follow-up" /></Field>
      <Field label="When"><Input type="datetime-local" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
      {providers.length > 0 && <Field label="From your care team"><Select value={f.providerId} onChange={(val) => set('providerId', val)} options={[{ value: '', label: 'Someone else' }, ...providers.map((p) => ({ value: p._id, label: `${p.name}${p.specialty ? ` · ${p.specialty}` : ''}` }))]} /></Field>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Doctor"><Input value={f.doctor} onChange={(e) => set('doctor', e.target.value)} placeholder="Dr. A. Iyer" /></Field>
        <Field label="Speciality"><Input value={f.specialty} onChange={(e) => set('specialty', e.target.value)} placeholder="Endocrinology" /></Field>
      </div>
      <Field label="Where"><Input value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="Lakeview Hospital, OPD B" /></Field>
      <div className="flex items-center justify-between"><span className="text-sm">Video consult</span><Toggle on={f.isVideo} onChange={(val) => set('isVideo', val)} label="Video consult" /></div>
      <div className="flex items-center justify-between"><span className="text-sm">Fasting needed</span><Toggle on={f.fasting} onChange={(val) => set('fasting', val)} label="Fasting" /></div>
      {f.fasting && <Field label="Hours of fasting before"><Input inputMode="numeric" value={f.fastingHours} onChange={(e) => set('fastingHours', e.target.value)} /></Field>}
      <Field label="Preparation"><Input value={f.prepNotes} onChange={(e) => set('prepNotes', e.target.value)} placeholder="Take medicine after the blood draw" /></Field>
      {!visit && <Field label="Take along (comma separated)"><Input value={f.bring} onChange={(e) => set('bring', e.target.value)} placeholder="Old reports, insurance card" /></Field>}
      <Btn onClick={save}>{visit ? 'Save' : 'Add appointment'}</Btn>
      {visit && <Btn kind="danger" onClick={async () => { if (await confirmDialog({ title: 'Delete this appointment?', confirmLabel: 'Delete', danger: true })) { await attempt(() => remove({ id: visit._id })); onClose(); } }}><Trash2 size={16} />Delete</Btn>}
    </Sheet>
  );
}

function ProviderForm({ p, onClose }: { p: Doc<'providers'> | null; onClose: () => void }) {
  const { meId, partnerId, partnerName } = usePeople();
  const add = useMutation(api.health.visits.addProvider);
  const update = useMutation(api.health.visits.updateProvider);
  const remove = useMutation(api.health.visits.removeProvider);
  const [f, setF] = useState({
    kind: p?.kind ?? ('doctor' as Doc<'providers'>['kind']),
    name: p?.name ?? '',
    specialty: p?.specialty ?? '',
    phone: p?.phone ?? '',
    address: p?.address ?? '',
    cashless: p?.cashless ?? false,
    notes: p?.notes ?? '',
    forMe: p ? p.patients.includes(meId!) : true,
    forPartner: p ? !!partnerId && p.patients.includes(partnerId) : true,
  });
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF({ ...f, [k]: val });
  const patients = useMemo(() => [f.forMe && meId, f.forPartner && partnerId].filter(Boolean) as Id<'users'>[], [f.forMe, f.forPartner, meId, partnerId]);
  const save = async () => {
    const payload = { kind: f.kind, name: f.name, specialty: f.specialty, phone: f.phone, address: f.address, cashless: f.cashless, notes: f.notes, patients };
    const ok = await attempt(() => (p ? update({ id: p._id, ...payload }) : add(payload)));
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={p ? p.name : 'Add to care team'}>
      <Select value={f.kind} onChange={(val) => set('kind', val)} options={['doctor', 'dentist', 'clinic', 'hospital', 'lab', 'pharmacy', 'other'].map((k) => ({ value: k as Doc<'providers'>['kind'], label: k[0].toUpperCase() + k.slice(1) }))} />
      <Field label="Name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Speciality"><Input value={f.specialty} onChange={(e) => set('specialty', e.target.value)} /></Field>
        <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="Address"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
      {p?.phone && <Btn kind="secondary" onClick={() => navigator.clipboard?.writeText(p.phone!).catch(() => {})}><Copy size={16} />Copy number</Btn>}
      <div className="flex items-center justify-between"><span className="text-sm">Cashless with our insurance</span><Toggle on={f.cashless} onChange={(val) => set('cashless', val)} label="Cashless" /></div>
      <div className="flex items-center justify-between"><span className="text-sm">Sees me</span><Toggle on={f.forMe} onChange={(val) => set('forMe', val)} label="Sees me" /></div>
      {partnerId && <div className="flex items-center justify-between"><span className="text-sm">Sees {partnerName}</span><Toggle on={f.forPartner} onChange={(val) => set('forPartner', val)} label="Sees partner" /></div>}
      <Field label="Notes"><Input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Timings, how to book" /></Field>
      <Btn onClick={save}>Save</Btn>
      {p && <Btn kind="danger" onClick={async () => { await attempt(() => remove({ id: p._id })); onClose(); }}>Remove</Btn>}
    </Sheet>
  );
}

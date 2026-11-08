import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import { Av, Btn, Chips, Field, fmtDate, IconBtn, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Select, Sheet, TextArea, attempt, num, usePeople, useWho } from './ui';
import { Plus } from 'lucide-react';

type Kind = Doc<'historyItems'>['kind'];
const KIND_LABEL: Record<Kind, string> = { condition: 'Condition', allergy: 'Allergy', procedure: 'Surgery or procedure', hospitalization: 'Hospital stay', injury: 'Injury', implant: 'Implant or device', family: 'Family history' };
const sevTone = (s?: string) => (s === 'severe' ? 'coral' : s === 'moderate' ? 'gold' : 'muted');

export const HistoryView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const data = useQuery(api.health.history.list, { who });
  const [edit, setEdit] = useState<Doc<'historyItems'> | Kind | null>(null);
  const [eyeOpen, setEyeOpen] = useState(false);
  const both = (data?.length ?? 0) > 1;

  return (
    <Screen title="History" sub="The background every doctor asks for" actions={<IconBtn icon={Plus} label="Add" primary onClick={() => setEdit('condition')} />}>
      <PersonSwitch />
      {data?.map((p) => {
        const name = p.isMe ? meName : partnerName;
        const of = (k: Kind) => p.items.filter((i) => i.kind === k);
        const open = (i: Doc<'historyItems'>) => (p.isMe ? () => setEdit(i) : undefined);
        const group = (title: string, kinds: Kind[], render: (i: Doc<'historyItems'>) => React.ReactNode) => {
          const items = kinds.flatMap(of);
          if (!items.length) return null;
          return <Section title={title}><List>{items.map(render)}</List></Section>;
        };
        return (
          <div key={p.userId} className="space-y-4">
            {both && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}
            {group('Conditions', ['condition'], (i) => <Row key={i._id} icon={<span className={`h-2 w-2 rounded-full ${i.status === 'resolved' ? 'bg-white/25' : i.status === 'improving' ? 'bg-gold' : 'bg-coral'}`} />} title={i.name} meta={[i.status ? i.status[0].toUpperCase() + i.status.slice(1) : null, i.date && `since ${fmtDate(i.date)}`, i.doctor].filter(Boolean).join(' · ')} onClick={open(i)} />)}
            {group('Allergies and intolerances', ['allergy'], (i) => <Row key={i._id} title={i.name} meta={[i.category, i.reaction, i.date && fmtDate(i.date)].filter(Boolean).join(' · ')} onClick={open(i)} end={i.severity ? <Pill tone={sevTone(i.severity)}>{i.severity[0].toUpperCase() + i.severity.slice(1)}</Pill> : undefined} />)}
            {group('Surgeries, stays and injuries', ['procedure', 'hospitalization', 'injury'], (i) => <Row key={i._id} title={i.name} meta={[KIND_LABEL[i.kind], i.date && fmtDate(i.date), i.place, i.notes].filter(Boolean).join(' · ')} onClick={open(i)} />)}
            {group('Implants and devices', ['implant'], (i) => <Row key={i._id} title={i.name} meta={[i.date && fmtDate(i.date), i.notes].filter(Boolean).join(' · ')} onClick={open(i)} />)}
            {group('Family history', ['family'], (i) => <Row key={i._id} title={i.relative ?? 'Relative'} meta={[i.name, i.ageAtOnset ? `at ${i.ageAtOnset}` : null, i.notes].filter(Boolean).join(' · ')} onClick={open(i)} />)}
            {of('condition').length + of('allergy').length + of('family').length === 0 && p.isMe && <Note>Add your conditions, allergies and family history. Family history moves screening earlier in Prevention (breast, colon, prostate, heart).</Note>}
            <Section title="Glasses" action={p.isMe ? <button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setEyeOpen(true)}>Add</button> : undefined}>
              {p.eyes[0] ? (
                <div className="glass overflow-x-auto p-2">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-white/40"><th className="p-2">{p.eyes[0].kind === 'glasses' ? 'Glasses' : 'Lenses'} · {fmtDate(p.eyes[0].date)}</th><th className="p-2 text-right">SPH</th><th className="p-2 text-right">CYL</th><th className="p-2 text-right">AXIS</th><th className="p-2 text-right">ADD</th></tr></thead>
                    <tbody className="font-mono">
                      {(['right', 'left'] as const).map((side) => <tr key={side} className="border-t border-white/[0.07]"><td className="p-2 font-sans">{side === 'right' ? 'Right eye' : 'Left eye'}</td>{(['sph', 'cyl', 'axis', 'add'] as const).map((k) => <td key={k} className="p-2 text-right">{p.eyes[0][side][k] ?? '–'}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <Note>Keep your latest prescription handy for ordering new glasses.</Note>}
            </Section>
          </div>
        );
      })}
      {edit && <ItemForm start={edit} onClose={() => setEdit(null)} />}
      {eyeOpen && <EyeForm onClose={() => setEyeOpen(false)} />}
    </Screen>
  );
};

function ItemForm({ start, onClose }: { start: Doc<'historyItems'> | Kind; onClose: () => void }) {
  const existing = typeof start === 'string' ? null : start;
  const add = useMutation(api.health.history.add);
  const update = useMutation(api.health.history.update);
  const remove = useMutation(api.health.history.remove);
  const [f, setF] = useState({
    kind: (existing?.kind ?? (start as Kind)) as Kind,
    name: existing?.name ?? '',
    status: existing?.status ?? 'active',
    severity: existing?.severity ?? '',
    category: existing?.category ?? 'medicine',
    reaction: existing?.reaction ?? '',
    date: existing?.date ?? '',
    relative: existing?.relative ?? '',
    age: existing?.ageAtOnset != null ? String(existing.ageAtOnset) : '',
    place: existing?.place ?? '',
    doctor: existing?.doctor ?? '',
    notes: existing?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const save = async () => {
    const payload = {
      kind: f.kind,
      name: f.name,
      status: f.kind === 'condition' ? (f.status as never) : undefined,
      severity: f.kind === 'allergy' && f.severity ? (f.severity as never) : undefined,
      category: f.kind === 'allergy' ? (f.category as never) : undefined,
      reaction: f.reaction,
      date: f.date || undefined,
      relative: f.kind === 'family' ? f.relative : undefined,
      ageAtOnset: f.kind === 'family' ? num(f.age) : undefined,
      place: f.place,
      doctor: f.doctor,
      notes: f.notes,
    };
    const ok = await attempt(() => (existing ? update({ id: existing._id, ...payload }) : add(payload)));
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={existing ? 'Edit' : 'Add to history'}>
      {!existing && <Chips value={f.kind} onChange={(v) => set('kind', v)} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />}
      <Field label={f.kind === 'family' ? 'Condition' : 'Name'}><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={f.kind === 'allergy' ? 'Penicillin' : f.kind === 'family' ? 'Type 2 diabetes' : ''} /></Field>
      {f.kind === 'family' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Who"><Input value={f.relative} onChange={(e) => set('relative', e.target.value)} placeholder="Father" /></Field>
          <Field label="Age then"><Input inputMode="numeric" value={f.age} onChange={(e) => set('age', e.target.value)} /></Field>
        </div>
      )}
      {f.kind === 'condition' && <Field label="Status"><Select value={f.status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'improving', label: 'Improving' }, { value: 'resolved', label: 'Resolved' }]} /></Field>}
      {f.kind === 'allergy' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type"><Select value={f.category} onChange={(v) => set('category', v)} options={[{ value: 'medicine', label: 'Medicine' }, { value: 'food', label: 'Food' }, { value: 'environment', label: 'Environment' }, { value: 'other', label: 'Other' }]} /></Field>
          <Field label="How bad"><Select value={f.severity} onChange={(v) => set('severity', v)} options={[{ value: '', label: '–' }, { value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }]} /></Field>
        </div>
      )}
      {f.kind === 'allergy' && <Field label="Reaction"><Input value={f.reaction} onChange={(e) => set('reaction', e.target.value)} placeholder="Hives, swelling" /></Field>}
      {f.kind !== 'family' && <Field label={f.kind === 'condition' ? 'Since' : 'When'} hint="Year, month or full date"><Input value={f.date} onChange={(e) => set('date', e.target.value)} placeholder="2024-09" /></Field>}
      {['procedure', 'hospitalization'].includes(f.kind) && <Field label="Where"><Input value={f.place} onChange={(e) => set('place', e.target.value)} /></Field>}
      {f.kind === 'condition' && <Field label="Doctor"><Input value={f.doctor} onChange={(e) => set('doctor', e.target.value)} /></Field>}
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <Btn onClick={save}>Save</Btn>
      {existing && <Btn kind="danger" onClick={async () => { await attempt(() => remove({ id: existing._id })); onClose(); }}><Trash2 size={16} />Delete</Btn>}
    </Sheet>
  );
}

function EyeForm({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.health.history.addEye);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<'glasses' | 'contacts'>('glasses');
  const [v, setV] = useState({ rs: '', rc: '', ra: '', ls: '', lc: '', la: '', add: '' });
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val });
  const f = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const cell = (k: keyof typeof v, label: string) => <Field label={label}><Input inputMode="decimal" value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>;
  return (
    <Sheet open onClose={onClose} title="Eye prescription">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="For"><Select value={kind} onChange={setKind} options={[{ value: 'glasses', label: 'Glasses' }, { value: 'contacts', label: 'Contact lenses' }]} /></Field>
      </div>
      <p className="text-xs uppercase tracking-[0.12em] text-white/40">Right eye</p>
      <div className="grid grid-cols-3 gap-2">{cell('rs', 'SPH')}{cell('rc', 'CYL')}{cell('ra', 'AXIS')}</div>
      <p className="text-xs uppercase tracking-[0.12em] text-white/40">Left eye</p>
      <div className="grid grid-cols-3 gap-2">{cell('ls', 'SPH')}{cell('lc', 'CYL')}{cell('la', 'AXIS')}</div>
      {cell('add', 'ADD (reading)')}
      <Btn onClick={async () => { const ok = await attempt(() => add({ date, kind, right: { sph: f(v.rs), cyl: f(v.rc), axis: f(v.ra), add: f(v.add) }, left: { sph: f(v.ls), cyl: f(v.lc), axis: f(v.la), add: f(v.add) } })); if (ok) onClose(); }}>Save</Btn>
    </Sheet>
  );
}

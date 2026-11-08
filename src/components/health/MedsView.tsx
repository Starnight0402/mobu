import React, { useEffect, useState } from 'react';
import { BellRing, Check, Leaf, Package, Pill as PillIcon, Plus, Bandage, TriangleAlert, Trash2, X } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { takeHealthIntent } from '../../lib/healthIntent';
import { confirmDialog } from '../Dialog';
import { haptic } from '../../lib/haptics';
import {
  Av, Btn, Card, cx, Empty, Field, fmtDate, fmtTime, IconBtn, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section,
  Segmented, Select, Sheet, TextArea, Toggle, attempt, num, todayStr, usePeople, useWho,
} from './ui';

const SKIP_REASONS = ['Felt sick', 'Ran out', 'Forgot', 'Doctor said stop', 'Side effects', 'Other'];

export const MedsView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const today = useQuery(api.health.meds.today, { who });
  const lists = useQuery(api.health.meds.list, { who });
  const adherence = useQuery(api.health.meds.adherence, { who, days: 30 });
  const cabinet = useQuery(api.health.meds.cabinet) ?? [];
  const logDose = useMutation(api.health.meds.logDose);
  const unlogDose = useMutation(api.health.meds.unlogDose);
  const takePrn = useMutation(api.health.meds.takePrn);
  const [editing, setEditing] = useState<Doc<'medications'> | 'new' | null>(null);
  const [skipping, setSkipping] = useState<{ medId: Id<'medications'>; slot: string; name: string } | null>(null);
  const [cabEdit, setCabEdit] = useState<Doc<'cabinetItems'> | 'new' | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (takeHealthIntent('health-meds') === 'add') setEditing('new');
  }, []);

  const both = (lists?.length ?? 0) > 1;
  const nameFor = (isMe: boolean) => (isMe ? meName : partnerName);

  const prn = async (medId: Id<'medications'>, name: string) => {
    const res = await attempt(() => takePrn({ medId }));
    if (!res) return;
    if (!res.ok && (await confirmDialog({ title: `Log ${name} anyway?`, body: res.warning ?? '', confirmLabel: 'I took it' }))) {
      await attempt(() => takePrn({ medId, force: true }));
    } else if (res.ok) haptic('success');
  };

  return (
    <Screen title="Medicines" sub="Doses, refills and the cabinet" actions={<IconBtn icon={Plus} label="Add medicine" primary onClick={() => setEditing('new')} />}>
      <PersonSwitch />

      {(adherence?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {adherence!.map((a) => (
            <div key={a.userId} className="glass flex flex-col gap-1.5 rounded-[20px] p-3">
              <span className="flex items-center gap-1.5 text-[11px] text-white/45"><Av isMe={a.isMe} size="sm" name={nameFor(a.isMe)} />Last 30 days</span>
              <span className="font-mono text-xl">{a.pct == null ? '–' : `${a.pct}%`}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><i className={cx('block h-full rounded-full', (a.pct ?? 0) >= 90 ? 'bg-sage' : (a.pct ?? 0) >= 75 ? 'bg-gold' : 'bg-coral')} style={{ width: `${a.pct ?? 0}%` }} /></div>
              <span className="text-[11px] text-white/45">{a.scheduled ? `${a.missed} missed · ${a.skipped} skipped` : 'No scheduled doses yet'}</span>
            </div>
          ))}
        </div>
      )}

      <Section title="Today">
        {today && today.slots.length === 0 && today.prn.length === 0 ? (
          <Empty icon={PillIcon} title="Nothing scheduled today" body="Add a medicine or supplement to get dose reminders and refill alerts." action={<button className="mt-2 text-sm text-nothing-purple" onClick={() => setEditing('new')}>Add a medicine</button>} />
        ) : (
          <List>
            {today?.slots.map((d) => (
              <div key={`${d.medId}${d.slot}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-11 shrink-0 font-mono text-xs text-white/45">{d.hm}</span>
                <button
                  type="button"
                  disabled={!d.isMe}
                  aria-label={d.status === 'taken' ? 'Mark not taken' : 'Mark taken'}
                  onClick={async () => {
                    haptic(d.status === 'taken' ? 'toggleOff' : 'success');
                    await attempt(() => (d.status === 'taken' ? unlogDose({ medId: d.medId, slot: d.slot }) : logDose({ medId: d.medId, slot: d.slot, status: 'taken' })));
                  }}
                  className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px]', d.status === 'taken' ? 'border-sage bg-sage text-nothing-black' : d.status === 'skipped' ? 'border-dashed border-white/30' : d.status === 'late' ? 'border-coral' : 'border-white/25')}
                >
                  {d.status === 'taken' && <Check size={15} />}
                </button>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cx('text-[15px]', d.status === 'taken' && 'text-white/40 line-through decoration-white/25')}>{d.name}{d.strength ? ` ${d.strength}` : ''}</span>
                  <span className="text-xs text-white/45">{d.status === 'late' ? 'Not marked yet' : d.status === 'skipped' ? `Skipped${d.reason ? ` · ${d.reason}` : ''}` : d.instructions}</span>
                </span>
                {d.isMe && d.status !== 'taken' && d.status !== 'skipped' && (
                  <button type="button" onClick={() => setSkipping({ medId: d.medId, slot: d.slot, name: d.name })} className="text-xs text-white/40">Skip</button>
                )}
                {both && <Av isMe={d.isMe} size="sm" name={nameFor(d.isMe)} />}
              </div>
            ))}
            {today?.prn.map((p) => (
              <Row
                key={p.medId}
                icon={<PillIcon size={16} />}
                title={`${p.name}${p.strength ? ` ${p.strength}` : ''}`}
                meta={[p.purpose, 'when needed', p.lastAt ? `last ${fmtTime(p.lastAt)}` : null, p.countToday ? `${p.countToday}${p.maxPerDay ? ` of ${p.maxPerDay}` : ''} in 24 h` : null, p.nextAt && p.nextAt > Date.now() ? `next after ${fmtTime(p.nextAt)}` : null].filter(Boolean).join(' · ')}
                end={p.isMe ? <Pill tone="purple" onClick={() => prn(p.medId, p.name)}>Took one</Pill> : both ? <Av isMe={false} size="sm" name={partnerName} /> : undefined}
              />
            ))}
          </List>
        )}
      </Section>

      {lists?.map((l) => (
        <React.Fragment key={l.userId}>
          {l.warnings.map((w, i) => (
            <Card key={i} className={w.severity === 'serious' ? 'border-coral/50' : 'border-gold/40'}>
              <span className={cx('flex items-center gap-2 text-[15px]', w.severity === 'serious' ? 'text-coral' : 'text-gold')}><TriangleAlert size={16} />{w.meds[0]} + {w.meds[1]}</span>
              <span className="text-sm text-white/65">{w.text}</span>
              <span className="text-xs text-white/40">Check with your pharmacist or doctor.</span>
            </Card>
          ))}
          <Section title={<>{both && <Av isMe={l.isMe} size="sm" name={nameFor(l.isMe)} />}Taking now</>}>
            {l.meds.filter((m) => m.active).length === 0 ? (
              <p className="px-1 text-sm text-white/40">Nothing right now.</p>
            ) : (
              <List>
                {l.meds.filter((m) => m.active).map((m) => {
                  const low = m.runsOut && m.runsOut <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
                  const pct = m.stockCount != null ? Math.min(100, (m.stockCount / Math.max(m.stockCount, 30)) * 100) : null;
                  return (
                    <button key={m._id} type="button" disabled={!l.isMe} onClick={() => setEditing(m)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', m.kind === 'supplement' ? 'bg-sage/15 text-sage' : 'bg-gold/15 text-gold')}>{m.kind === 'supplement' ? <Leaf size={16} /> : <PillIcon size={16} />}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px]">{m.name}{m.strength ? ` ${m.strength}` : ''}</span>
                        <span className="text-xs text-white/45">{[m.scheduleText, m.purpose, m.prescriber, m.courseLeft != null ? `course ends ${fmtDate(m.schedule.endDate)}` : null].filter(Boolean).join(' · ')}</span>
                        {pct != null && (
                          <>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><i className={cx('block h-full rounded-full', low ? 'bg-coral' : 'bg-nothing-purple')} style={{ width: `${pct}%` }} /></div>
                            <span className={cx('text-xs', low ? 'text-coral' : 'text-white/45')}>{m.stockCount} left{m.runsOut ? ` · runs out around ${fmtDate(m.runsOut)}` : ''}</span>
                          </>
                        )}
                      </span>
                      {low && <Pill tone="gold">Refill</Pill>}
                      {m.nudgePartner && l.isMe && <BellRing size={14} className="mt-1 text-white/30" aria-label="Partner gets nudged on a missed dose" />}
                    </button>
                  );
                })}
              </List>
            )}
          </Section>
          {l.meds.some((m) => !m.active) && (
            <Section title="Past medicines" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide' : `Show ${l.meds.filter((m) => !m.active).length}`}</button>}>
              {showPast && (
                <List>
                  {l.meds.filter((m) => !m.active).map((m) => (
                    <Row key={m._id} title={`${m.name}${m.strength ? ` ${m.strength}` : ''}`} meta={[`${fmtDate(m.schedule.startDate)} – ${fmtDate(m.stoppedAt ?? m.schedule.endDate)}`, m.purpose, m.stoppedReason].filter(Boolean).join(' · ')} onClick={l.isMe ? () => setEditing(m) : undefined} />
                  ))}
                </List>
              )}
            </Section>
          )}
        </React.Fragment>
      ))}

      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-nothing-purple/15 text-nothing-purple"><BellRing size={16} /></span>
          <span className="flex-1 text-sm text-white/65">If a dose isn't marked within an hour, the other one of you gets a quiet ping, without the medicine's name. Switch it off per medicine.</span>
        </div>
      </Card>

      <Section title="Home cabinet" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setCabEdit('new')}>Add</button>}>
        {cabinet.length ? (
          <List>
            {cabinet.map((c) => {
              const month = new Date().toISOString().slice(0, 7);
              const soon = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 7);
              return (
                <Row key={c._id} icon={c.kind === 'firstaid' ? <Bandage size={16} /> : <Package size={16} />} title={c.name} meta={[c.qty, c.notes].filter(Boolean).join(' · ')} onClick={() => setCabEdit(c)}
                  end={c.expiry ? <Pill tone={c.expiry < month ? 'coral' : c.expiry <= soon ? 'gold' : 'muted'}>{c.expiry < month ? 'Expired' : 'Exp'} {fmtDate(c.expiry)}</Pill> : undefined} />
              );
            })}
          </List>
        ) : (
          <Note>Keep track of what's at home: paracetamol, ORS, the first-aid kit, with expiry dates. You both see the same cabinet.</Note>
        )}
      </Section>
      <Note>Scan a prescription in Records and its medicines can be added in one tap. Reminders come as phone notifications.</Note>

      {editing && <MedForm med={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Sheet open={!!skipping} onClose={() => setSkipping(null)} title={`Skip ${skipping?.name ?? ''}?`}>
        <div className="grid grid-cols-2 gap-2">
          {SKIP_REASONS.map((r) => (
            <Btn key={r} kind="secondary" onClick={async () => { if (!skipping) return; await attempt(() => logDose({ medId: skipping.medId, slot: skipping.slot, status: 'skipped', reason: r })); setSkipping(null); }}>{r}</Btn>
          ))}
        </div>
      </Sheet>
      {cabEdit && <CabinetForm item={cabEdit === 'new' ? null : cabEdit} onClose={() => setCabEdit(null)} />}
    </Screen>
  );
};

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MedForm({ med, onClose }: { med: Doc<'medications'> | null; onClose: () => void }) {
  const add = useMutation(api.health.meds.add);
  const update = useMutation(api.health.meds.update);
  const setActive = useMutation(api.health.meds.setActive);
  const remove = useMutation(api.health.meds.remove);
  const [f, setF] = useState({
    name: med?.name ?? '',
    strength: med?.strength ?? '',
    form: med?.form ?? 'Tablet',
    purpose: med?.purpose ?? '',
    prescriber: med?.prescriber ?? '',
    instructions: med?.instructions ?? '',
    kind: med?.kind ?? ('medicine' as 'medicine' | 'supplement'),
    type: med?.schedule.type ?? ('daily' as 'daily' | 'weekly' | 'interval' | 'prn'),
    times: med?.schedule.times.length ? med.schedule.times : ['08:00'],
    days: med?.schedule.days ?? [0],
    everyDays: String(med?.schedule.everyDays ?? 2),
    startDate: med?.schedule.startDate ?? todayStr(),
    endDate: med?.schedule.endDate ?? '',
    stock: med?.stockCount != null ? String(med.stockCount) : '',
    perDose: String(med?.perDose ?? 1),
    gap: med?.prnMinGapHours != null ? String(med.prnMinGapHours) : '',
    max: med?.prnMaxPerDay != null ? String(med.prnMaxPerDay) : '',
    nudge: med?.nudgePartner ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const save = async () => {
    const payload = {
      name: f.name,
      strength: f.strength,
      form: f.form,
      purpose: f.purpose,
      prescriber: f.prescriber,
      instructions: f.instructions,
      kind: f.kind,
      schedule: { type: f.type, times: f.type === 'prn' ? [] : f.times, days: f.type === 'weekly' ? f.days : undefined, everyDays: f.type === 'interval' ? num(f.everyDays) : undefined, startDate: f.startDate, endDate: f.endDate || undefined },
      stockCount: num(f.stock),
      perDose: num(f.perDose),
      prnMinGapHours: f.type === 'prn' ? num(f.gap) : undefined,
      prnMaxPerDay: f.type === 'prn' ? num(f.max) : undefined,
      nudgePartner: f.nudge,
    };
    const ok = await attempt(() => (med ? update({ id: med._id, ...payload }) : add(payload)));
    if (ok !== undefined) {
      haptic('success');
      onClose();
    }
  };
  return (
    <Sheet open onClose={onClose} title={med ? 'Edit medicine' : 'Add a medicine'}>
      <Segmented small value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'medicine', label: 'Medicine' }, { value: 'supplement', label: 'Supplement' }]} />
      <Field label="Name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Atorvastatin" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Strength"><Input value={f.strength} onChange={(e) => set('strength', e.target.value)} placeholder="10 mg" /></Field>
        <Field label="Form"><Select value={f.form} onChange={(v) => set('form', v)} options={['Tablet', 'Capsule', 'Syrup', 'Sachet', 'Injection', 'Drops', 'Inhaler', 'Cream', 'Other'].map((x) => ({ value: x, label: x }))} /></Field>
      </div>
      <Field label="How often">
        <Select value={f.type} onChange={(v) => set('type', v)} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Some days of the week' }, { value: 'interval', label: 'Every few days' }, { value: 'prn', label: 'Only when needed' }]} />
      </Field>
      {f.type !== 'prn' && (
        <Field label="Times">
          <div className="flex flex-wrap gap-2">
            {f.times.map((t, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" value={t} onChange={(e) => set('times', f.times.map((x, j) => (j === i ? e.target.value : x)))} className="nothing-input !w-28 !px-3 !py-2 font-mono" />
                {f.times.length > 1 && <button type="button" aria-label="Remove time" onClick={() => set('times', f.times.filter((_, j) => j !== i))} className="text-white/30"><X size={15} /></button>}
              </span>
            ))}
            <button type="button" onClick={() => set('times', [...f.times, '20:00'])} className="rounded-2xl border border-dashed border-white/20 px-3 text-sm text-white/55">+ time</button>
          </div>
        </Field>
      )}
      {f.type === 'weekly' && (
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => (
            <button key={i} type="button" onClick={() => set('days', f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i])} className={cx('h-10 flex-1 rounded-full text-sm', f.days.includes(i) ? 'bg-white text-black' : 'glass')}>{d}</button>
          ))}
        </div>
      )}
      {f.type === 'interval' && <Field label="Every how many days"><Input inputMode="numeric" value={f.everyDays} onChange={(e) => set('everyDays', e.target.value)} /></Field>}
      {f.type === 'prn' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Hours between doses"><Input inputMode="decimal" value={f.gap} onChange={(e) => set('gap', e.target.value)} placeholder="4" /></Field>
          <Field label="Max per day"><Input inputMode="numeric" value={f.max} onChange={(e) => set('max', e.target.value)} placeholder="4" /></Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End (course)"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="In stock"><Input inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value)} placeholder="30" /></Field>
        <Field label="Units per dose"><Input inputMode="decimal" value={f.perDose} onChange={(e) => set('perDose', e.target.value)} /></Field>
      </div>
      <Field label="For"><Input value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Cholesterol" /></Field>
      <Field label="Prescribed by"><Input value={f.prescriber} onChange={(e) => set('prescriber', e.target.value)} placeholder="Dr. Mehta" /></Field>
      <Field label="Instructions"><TextArea value={f.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="After dinner. Empty stomach. With milk." /></Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Nudge my partner if I miss a dose</span>
        <Toggle on={f.nudge} onChange={(v) => set('nudge', v)} label="Nudge partner" />
      </div>
      <Btn onClick={save}>{med ? 'Save' : 'Add medicine'}</Btn>
      {med && (
        <div className="flex gap-2">
          <Btn kind="secondary" onClick={async () => { await attempt(() => setActive({ id: med._id, active: !med.active, reason: med.active ? 'Stopped' : undefined })); onClose(); }}>{med.active ? 'Stop taking' : 'Start again'}</Btn>
          <Btn kind="danger" onClick={async () => { if (await confirmDialog({ title: `Delete ${med.name}?`, body: 'Its dose history goes too. To keep the history, use Stop taking.', confirmLabel: 'Delete', danger: true })) { await attempt(() => remove({ id: med._id })); onClose(); } }}><Trash2 size={16} />Delete</Btn>
        </div>
      )}
    </Sheet>
  );
}

function CabinetForm({ item, onClose }: { item: Doc<'cabinetItems'> | null; onClose: () => void }) {
  const add = useMutation(api.health.meds.cabinetAdd);
  const update = useMutation(api.health.meds.cabinetUpdate);
  const remove = useMutation(api.health.meds.cabinetRemove);
  const [name, setName] = useState(item?.name ?? '');
  const [qty, setQty] = useState(item?.qty ?? '');
  const [expiry, setExpiry] = useState(item?.expiry ?? '');
  const [kind, setKind] = useState<'medicine' | 'firstaid' | 'device'>(item?.kind ?? 'medicine');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const save = async () => {
    const payload = { name, qty, expiry: expiry || undefined, kind, notes };
    const ok = await attempt(() => (item ? update({ id: item._id, ...payload }) : add(payload)));
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={item ? 'Cabinet item' : 'Add to the cabinet'}>
      <Segmented small value={kind} onChange={setKind} options={[{ value: 'medicine', label: 'Medicine' }, { value: 'firstaid', label: 'First aid' }, { value: 'device', label: 'Device' }]} />
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ORS sachets" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="How many"><Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="6 left" /></Field>
        <Field label="Expires"><Input type="month" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Btn onClick={save}>Save</Btn>
      {item && <Btn kind="danger" onClick={async () => { await attempt(() => remove({ id: item._id })); onClose(); }}>Remove</Btn>}
    </Sheet>
  );
}

import React, { useEffect, useState } from 'react';
import { CalendarCheck, Syringe, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { takeHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import { VACCINES } from '../../../convex/health/preventionLogic';
import { Av, Btn, Card, Field, fmtDate, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Select, Sheet, Tone, Toggle, attempt, num, todayStr, usePeople, useWho } from './ui';

const STATUS: Record<string, { label: (x: { dueOn?: string; startsAtAge?: number; dosesDone?: number; dosesNeeded?: number; lastDone?: string }) => string; tone: Tone }> = {
  done: { label: (x) => (x.dueOn ? `Next ${fmtDate(x.dueOn)}` : x.dosesNeeded ? 'Done' : x.lastDone ? fmtDate(x.lastDone) : 'Done'), tone: 'sage' },
  due: { label: (x) => (x.dosesNeeded && x.dosesDone ? `${x.dosesDone} of ${x.dosesNeeded}` : 'Due'), tone: 'gold' },
  overdue: { label: () => 'Overdue', tone: 'coral' },
  upcoming: { label: (x) => fmtDate(x.dueOn), tone: 'muted' },
  later: { label: (x) => (x.startsAtAge ? `From ${x.startsAtAge}` : 'Later'), tone: 'muted' },
  discuss: { label: () => 'Ask doctor', tone: 'purple' },
  unknown: { label: () => 'No record', tone: 'muted' },
  record: { label: (x) => (x.dosesDone ? `${x.dosesDone} doses` : 'None'), tone: 'muted' },
  habit: { label: () => 'Monthly', tone: 'muted' },
};

export const PreventionView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const data = useQuery(api.health.prevention.overview, { who });
  const [vaccineFor, setVaccineFor] = useState<string | null>(null);
  const [screening, setScreening] = useState<{ key: string; name: string; intervalMonths?: number } | null>(null);
  useEffect(() => {
    if (takeHealthIntent('health-prevention') === 'vaccine') setVaccineFor('influenza');
  }, []);
  const both = (data?.length ?? 0) > 1;

  return (
    <Screen title="Prevention" sub="Vaccines, screenings, routine checks">
      <PersonSwitch />
      {data?.map((p) => {
        const upNext = [...p.vaccines, ...p.screenings].filter((x) => x.status === 'due' || x.status === 'overdue').sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1));
        const name = p.isMe ? meName : partnerName;
        return (
          <div key={p.userId} className="space-y-4">
            {both && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}
            {p.missingProfile && p.isMe && (
              <Card onClick={() => goToTab('health-settings')}>
                <span className="text-sm text-white/65">Add your date of birth and sex at birth in Health settings, so screenings match your age.</span>
              </Card>
            )}
            {upNext.length > 0 && (
              <Section title="Up next">
                <List>
                  {upNext.map((x) => (
                    <Row key={x.key} icon={x.kind === 'vaccine' ? <Syringe size={16} /> : <CalendarCheck size={16} />} tone={x.status === 'overdue' ? 'coral' : 'gold'} title={x.name} meta={x.lastDone ? `Last ${fmtDate(x.lastDone)}` : x.detail}
                      onClick={p.isMe ? () => (x.kind === 'vaccine' ? setVaccineFor(x.key) : setScreening({ key: x.key, name: x.name, intervalMonths: x.intervalMonths })) : undefined}
                      end={<Pill tone={STATUS[x.status].tone}>{STATUS[x.status].label(x)}</Pill>} />
                  ))}
                </List>
              </Section>
            )}
            <Section title="Vaccines" action={p.isMe ? <button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setVaccineFor('influenza')}>Add a dose</button> : undefined}>
              <List>
                {p.vaccines.filter((v) => v.status !== 'later').map((v) => (
                  <Row key={v.key} title={v.name} meta={v.detail} onClick={p.isMe ? () => setVaccineFor(v.key) : undefined} end={<Pill tone={STATUS[v.status].tone}>{STATUS[v.status].label(v)}</Pill>} />
                ))}
              </List>
              <Note>“No record” means nothing is logged yet. Add the date of the last dose (childhood card, a certificate in Records) and Mobu starts tracking when it's due.</Note>
            </Section>
            {p.screenings.length > 0 && (
              <Section title="Screenings and check-ups">
                <List>
                  {p.screenings.map((s) => (
                    <Row key={s.key} title={s.name} meta={s.detail} onClick={p.isMe ? () => setScreening({ key: s.key, name: s.name, intervalMonths: s.intervalMonths }) : undefined} end={<Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label(s)}</Pill>} />
                  ))}
                </List>
              </Section>
            )}
            {p.habits.length > 0 && (
              <Section title="Monthly self-checks">
                <List>{p.habits.map((h) => <Row key={h.key} title={h.name} meta={h.detail} />)}</List>
              </Section>
            )}
            {p.later.length > 0 && (
              <Card>
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Later in life</span>
                <p className="text-sm text-white/60">{p.later.map((l) => `${l.name}${l.startsAtAge ? ` from ${l.startsAtAge}` : ''}`).join(' · ')}. These switch on by themselves at the right age.</p>
              </Card>
            )}
            {p.immunizations.length > 0 && (
              <Section title="Vaccine record">
                <List>
                  {p.immunizations.map((i) => (
                    <ImmRow key={i._id} id={i._id} name={VACCINES.find((v) => v.key === i.vaccine)?.name ?? i.vaccine} meta={[fmtDate(i.date), i.dose, i.place].filter(Boolean).join(' · ')} mine={p.isMe} />
                  ))}
                </List>
              </Section>
            )}
          </div>
        );
      })}
      <Note>Intervals follow the Association of Physicians of India adult immunisation guidelines and common screening guidance. Your doctor can change any of them: tap a screening to edit.</Note>
      <VaccineSheet keyName={vaccineFor} onClose={() => setVaccineFor(null)} />
      <ScreeningSheet item={screening} onClose={() => setScreening(null)} />
    </Screen>
  );
};

function ImmRow({ id, name, meta, mine }: { id: string; name: string; meta: string; mine: boolean }) {
  const remove = useMutation(api.health.prevention.removeImmunization);
  return <Row title={name} meta={meta} end={mine ? <button aria-label="Delete" onClick={() => attempt(() => remove({ id: id as never }))} className="text-white/25"><Trash2 size={14} /></button> : undefined} />;
}

function VaccineSheet({ keyName, onClose }: { keyName: string | null; onClose: () => void }) {
  const add = useMutation(api.health.prevention.addImmunization);
  const [vaccine, setVaccine] = useState('influenza');
  const [date, setDate] = useState(todayStr());
  const [dose, setDose] = useState('');
  const [place, setPlace] = useState('');
  useEffect(() => {
    if (keyName) setVaccine(keyName);
  }, [keyName]);
  return (
    <Sheet open={!!keyName} onClose={onClose} title="Add a vaccine dose">
      <Field label="Vaccine"><Select value={vaccine} onChange={setVaccine} options={VACCINES.map((v) => ({ value: v.key, label: v.name }))} /></Field>
      <p className="text-sm text-white/50">{VACCINES.find((v) => v.key === vaccine)?.note}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Dose"><Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="1 of 3, booster" /></Field>
      </div>
      <Field label="Where"><Input value={place} onChange={(e) => setPlace(e.target.value)} /></Field>
      <Note>Got a certificate? Upload it in Records and the dose is added for you.</Note>
      <Btn onClick={async () => { const ok = await attempt(() => add({ vaccine, date, dose, place })); if (ok) onClose(); }}>Save dose</Btn>
    </Sheet>
  );
}

function ScreeningSheet({ item, onClose }: { item: { key: string; name: string; intervalMonths?: number } | null; onClose: () => void }) {
  const set = useMutation(api.health.prevention.setScreening);
  const [date, setDate] = useState(todayStr());
  const [interval, setInterval] = useState('');
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (item) {
      setInterval(item.intervalMonths ? String(item.intervalMonths) : '');
      setOff(false);
    }
  }, [item]);
  if (!item) return null;
  return (
    <Sheet open onClose={onClose} title={item.name}>
      <Field label="Last done"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Repeat every (months)" hint="Change it if your doctor advised differently"><Input inputMode="numeric" value={interval} onChange={(e) => setInterval(e.target.value)} /></Field>
      <div className="flex items-center justify-between"><span className="text-sm">Not relevant for me</span><Toggle on={off} onChange={setOff} label="Not relevant" /></div>
      <Btn onClick={async () => { const ok = await attempt(() => set({ key: item.key, lastDone: off ? undefined : date, intervalMonths: num(interval), disabled: off || undefined })); if (ok !== undefined) onClose(); }}>Save</Btn>
    </Sheet>
  );
}

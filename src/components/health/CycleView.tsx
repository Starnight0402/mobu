import React, { useMemo, useState } from 'react';
import { Flower2, TriangleAlert } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { goToTab } from '../../lib/navigation';
import { Av, Btn, Card, cx, Field, fmtDate, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Select, Sheet, Tile, Tiles, attempt, num, todayStr, usePeople, useWho } from './ui';

type Flow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';
const FLOWS: Flow[] = ['none', 'spotting', 'light', 'medium', 'heavy'];
const SYMPTOMS = ['Cramps', 'Bloating', 'Headache', 'Back pain', 'Acne', 'Tender breasts', 'Low mood', 'Irritable', 'Tired', 'Cravings', 'Nausea', 'Spotting'];
const MODES = [
  { value: 'track', label: 'Track only' },
  { value: 'ttc', label: 'Trying to conceive' },
  { value: 'pregnancy', label: 'Pregnancy' },
  { value: 'perimenopause', label: 'Perimenopause' },
] as const;

export const CycleView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const data = useQuery(api.health.cycle.overview, { who });
  const save = useMutation(api.health.profile.save);

  return (
    <Screen title="Cycle" sub="Optional, per person">
      <PersonSwitch />
      {data?.length === 0 && (
        <Card>
          <span className="text-sm text-white/60">{who === 'partner' ? `${partnerName} hasn't shared cycle tracking with you, or hasn't turned it on.` : 'Nothing to show.'}</span>
        </Card>
      )}
      {data?.map((p) =>
        !p.enabled ? (
          <Card key={p.userId}>
            <Flower2 size={22} className="text-coral" />
            <p className="text-[15px]">Track periods, symptoms and predictions. Switch it on just for yourself; your partner sees dates only unless you choose otherwise in Share.</p>
            <Btn onClick={() => attempt(() => save({ cycleEnabled: true, cycleMode: 'track' }))}>Turn on cycle tracking</Btn>
          </Card>
        ) : (
          <CycleFor key={p.userId} p={p} name={p.isMe ? meName : partnerName} showName={(data?.length ?? 0) > 1} />
        ),
      )}
    </Screen>
  );
};

type Data = NonNullable<ReturnType<typeof useQuery<typeof api.health.cycle.overview>>>[number];
type Enabled = Extract<Data, { enabled: true }>;

function CycleFor({ p, name, showName }: { p: Enabled; name: string; showName: boolean }) {
  const s = p.summary;
  const save = useMutation(api.health.profile.save);
  const logPeriod = useMutation(api.health.cycle.logPeriod);
  const [day, setDay] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const length = s.avgCycle ?? 28;
  const byDate = useMemo(() => new Map(p.logs.map((l) => [l.date, l])), [p.logs]);
  const today = p.today;
  const ring = useMemo(() => {
    if (!s.cycleDay) return null;
    const pct = (d: number) => `${Math.min(100, (d / length) * 100)}%`;
    const period = s.avgPeriod ?? 5;
    const ov = length - 14;
    return {
      bg: `conic-gradient(var(--color-coral) 0 ${pct(period)}, color-mix(in oklab, var(--color-white) 10%, transparent) ${pct(period)} ${pct(ov - 5)}, var(--color-azure) ${pct(ov - 5)} ${pct(ov)}, var(--color-nothing-purple) ${pct(ov)} ${pct(ov + 1)}, var(--color-azure) ${pct(ov + 1)} ${pct(ov + 2)}, color-mix(in oklab, var(--color-white) 10%, transparent) ${pct(ov + 2)} 100%)`,
      angle: (Math.min(s.cycleDay, length) / length) * 360,
    };
  }, [s, length]);

  // Last 35 days as a strip calendar.
  const strip = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (34 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, log: byDate.get(d) };
  });
  const predictedDays = new Set<string>();
  if (s.nextStart) for (let i = 0; i < (s.avgPeriod ?? 5); i++) predictedDays.add(new Date(Date.parse(`${s.nextStart}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      {showName && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}
      {ring ? (
        <div className="relative mx-auto h-[170px] w-[170px]">
          <div className="h-full w-full rounded-full" style={{ background: ring.bg, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px))' }} />
          <span className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${ring.angle}deg)` }}><span className="absolute -left-[7px] -top-[92px] h-3.5 w-3.5 rounded-full border-[3px] border-nothing-black bg-white" /></span>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">Day</span>
            <span className="font-mono text-[34px] leading-none">{s.cycleDay}</span>
            <span className="text-xs text-white/45">of about {length}</span>
          </div>
        </div>
      ) : (
        <Card><span className="text-sm text-white/60">Log your last period to see predictions.</span>{p.isMe && <Btn onClick={() => setPeriodStart(todayStr())}>Log a period</Btn>}</Card>
      )}
      <div className="flex flex-wrap justify-center gap-4 text-[11px] text-white/45">
        <span className="flex items-center gap-1.5"><i className="inline-block h-[7px] w-[7px] rounded-full bg-coral" />Period</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-[7px] w-[7px] rounded-full bg-azure" />Fertile window (estimate)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-[7px] w-[7px] rounded-full bg-nothing-purple" />Ovulation (estimate)</span>
      </div>
      <Tiles>
        <Tile label="Next period" value={s.nextStart ? fmtDate(s.nextStart, false) : '–'} sub={s.nextStart ? `± ${s.nextStartRange} days` : undefined} />
        <Tile label="Avg cycle" value={s.avgCycle ? `${s.avgCycle} d` : '–'} sub={s.minCycle != null ? `${s.minCycle}–${s.maxCycle}` : 'needs 2 periods'} />
        <Tile label="Avg period" value={s.avgPeriod ? `${s.avgPeriod} d` : '–'} />
      </Tiles>
      {s.fertileStart && p.level === 'full' && <Note>Fertile window around {fmtDate(s.fertileStart, false)} – {fmtDate(s.fertileEnd, false)}, ovulation around {fmtDate(s.ovulation, false)}. Estimates from your history; not contraception.</Note>}

      <Section title="Last 5 weeks">
        <div className="grid grid-cols-7 gap-1.5">
          {strip.map(({ date, log }) => {
            const flow = (log as { flow?: Flow } | undefined)?.flow;
            return (
              <button key={date} type="button" disabled={!p.isMe} onClick={() => setDay(date)}
                className={cx('flex aspect-square flex-col items-center justify-center rounded-xl text-[11px]', date === today && 'ring-1 ring-white/60',
                  flow === 'heavy' ? 'bg-coral text-nothing-black' : flow === 'medium' ? 'bg-coral/70 text-nothing-black' : flow === 'light' ? 'bg-coral/35' : flow === 'spotting' ? 'bg-coral/15' : 'glass')}>
                <span className="font-mono">{+date.slice(8)}</span>
                {((log as { symptoms?: string[] } | undefined)?.symptoms?.length ?? 0) > 0 && <i className="mt-0.5 inline-block h-1 w-1 rounded-full bg-gold" />}
              </button>
            );
          })}
        </div>
        {s.nextStart && <Note>Next predicted: {[...predictedDays].map((d) => fmtDate(d, false)).join(', ')}</Note>}
      </Section>

      {p.isMe && (
        <div className="flex gap-2">
          <Btn onClick={() => setDay(today)}>Log today</Btn>
          <Btn kind="secondary" onClick={() => setPeriodStart(todayStr())}>Period started</Btn>
        </div>
      )}

      {s.cycleLengths.length > 0 && (
        <Card>
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Recent cycles</span>
          <div className="flex h-[70px] items-end gap-2">
            {s.cycleLengths.slice(-6).map((l, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-white/45">
                <b className="relative block w-full overflow-hidden rounded-md bg-nothing-purple/20" style={{ height: `${Math.min(60, (l / 40) * 60)}px` }}>
                  <i className="absolute inset-x-0 bottom-0 bg-coral/75" style={{ height: `${((s.periods[i]?.days ?? 5) / l) * 100}%` }} />
                </b>
                {l}
              </div>
            ))}
          </div>
        </Card>
      )}

      {s.flags.length > 0 && (
        <Card className="border-gold/40">
          <span className="flex items-center gap-2 text-gold"><TriangleAlert size={16} />Worth a doctor's look</span>
          <ul className="list-disc space-y-1 pl-5 text-sm text-white/65">{s.flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Card>
      )}

      {p.isMe && (
        <List>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 text-sm">Mode</span>
            <div className="w-48"><Select value={p.mode} onChange={(v) => attempt(() => save({ cycleMode: v }))} options={MODES.map((m) => ({ value: m.value, label: m.label }))} /></div>
          </div>
          <Row title="What your partner sees" meta="Dates only by default. Change it in Share." onClick={() => goToTab('health-share')} />
          <Row title="Turn off cycle tracking" meta="Your logs are kept" onClick={() => attempt(() => save({ cycleEnabled: false }))} />
        </List>
      )}
      {!p.isMe && p.level === 'dates' && <Note>{name} shares period dates and predictions with you. Symptoms and other details stay private.</Note>}

      {p.isMe && <DaySheet date={day} existing={day ? byDate.get(day) : undefined} onClose={() => setDay(null)} />}
      <Sheet open={!!periodStart} onClose={() => setPeriodStart(null)} title="Period started">
        <Field label="First day"><Input type="date" value={periodStart ?? ''} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
        <Btn onClick={async () => { const ok = await attempt(() => logPeriod({ start: periodStart!, days: p.summary.avgPeriod ?? 5 })); if (ok !== undefined) setPeriodStart(null); }}>Mark {p.summary.avgPeriod ?? 5} days</Btn>
        <Note>Adjust any day afterwards on the calendar.</Note>
      </Sheet>
    </div>
  );
}

function DaySheet({ date, existing, onClose }: { date: string | null; existing?: Enabled['logs'][number]; onClose: () => void }) {
  const logDay = useMutation(api.health.cycle.logDay);
  const e = existing as (Enabled['logs'][number] & { symptoms?: string[]; bbt?: number; ovulationTest?: string; mucus?: string; intimacy?: string; notes?: string }) | undefined;
  const [flow, setFlow] = useState<Flow>((e?.flow as Flow) ?? 'none');
  const [symptoms, setSymptoms] = useState<string[]>(e?.symptoms ?? []);
  const [bbt, setBbt] = useState(e?.bbt != null ? String(e.bbt) : '');
  const [test, setTest] = useState(e?.ovulationTest ?? '');
  const [mucus, setMucus] = useState(e?.mucus ?? '');
  const [intimacy, setIntimacy] = useState(e?.intimacy ?? '');
  const [notes, setNotes] = useState(e?.notes ?? '');
  React.useEffect(() => {
    setFlow((e?.flow as Flow) ?? 'none');
    setSymptoms(e?.symptoms ?? []);
    setBbt(e?.bbt != null ? String(e.bbt) : '');
    setTest(e?.ovulationTest ?? '');
    setMucus(e?.mucus ?? '');
    setIntimacy(e?.intimacy ?? '');
    setNotes(e?.notes ?? '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!date) return null;
  const save = async () => {
    const clear = [!bbt && 'bbt', !test && 'ovulationTest', !mucus && 'mucus', !intimacy && 'intimacy'].filter(Boolean) as string[];
    const ok = await attempt(() =>
      logDay({ date, flow, symptoms, bbt: num(bbt), ovulationTest: (test || undefined) as never, mucus: (mucus || undefined) as never, intimacy: (intimacy || undefined) as never, notes, clear }),
    );
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={fmtDate(date)}>
      <Field label="Flow">
        <div className="grid grid-cols-5 gap-1.5">{FLOWS.map((f) => <button key={f} type="button" onClick={() => setFlow(f)} className={cx('rounded-full py-2 text-xs capitalize', flow === f ? 'bg-coral text-nothing-black' : 'glass')}>{f === 'none' ? 'None' : f}</button>)}</div>
      </Field>
      <Field label="Symptoms">
        <div className="flex flex-wrap gap-1.5">{SYMPTOMS.map((s) => <button key={s} type="button" onClick={() => setSymptoms(symptoms.includes(s) ? symptoms.filter((x) => x !== s) : [...symptoms, s])} className={cx('rounded-full px-3 py-1.5 text-xs', symptoms.includes(s) ? 'bg-gold/20 text-gold' : 'glass')}>{s}</button>)}</div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Basal temp °C"><Input inputMode="decimal" value={bbt} onChange={(ev) => setBbt(ev.target.value)} placeholder="36.5" /></Field>
        <Field label="Ovulation test"><Select value={test} onChange={setTest} options={[{ value: '', label: '–' }, { value: 'negative', label: 'Negative' }, { value: 'high', label: 'High' }, { value: 'positive', label: 'Positive' }, { value: 'inconclusive', label: 'Unclear' }]} /></Field>
        <Field label="Cervical mucus"><Select value={mucus} onChange={setMucus} options={[{ value: '', label: '–' }, { value: 'dry', label: 'Dry' }, { value: 'sticky', label: 'Sticky' }, { value: 'creamy', label: 'Creamy' }, { value: 'watery', label: 'Watery' }, { value: 'eggwhite', label: 'Egg white' }]} /></Field>
        <Field label="Intimacy (private)"><Select value={intimacy} onChange={setIntimacy} options={[{ value: '', label: '–' }, { value: 'protected', label: 'Protected' }, { value: 'unprotected', label: 'Unprotected' }]} /></Field>
      </div>
      <Field label="Notes"><Input value={notes} onChange={(ev) => setNotes(ev.target.value)} /></Field>
      <Btn onClick={save}>Save day</Btn>
      <Pill tone="muted">Synced with Health Connect when it's connected</Pill>
    </Sheet>
  );
}

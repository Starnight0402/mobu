import React, { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, Droplet, Dumbbell, Flame, Footprints, Gauge, GlassWater, HeartPulse, Moon, Plus, Ruler, Scale, Thermometer, Trash2, Waves, Wind } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { takeHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import {
  Av, Btn, Card, Chips, Empty, Field, fmtNum, fmtWhen, IconBtn, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Select, Sheet,
  Tile, Tiles, TrendChart, attempt, localInput, num, usePeople, useWho, Segmented,
} from './ui';

type VitalType = 'bp' | 'heartRate' | 'restingHr' | 'hrv' | 'spo2' | 'respRate' | 'temp' | 'glucose' | 'weight' | 'height' | 'bodyFat' | 'waist' | 'vo2max' | 'steps' | 'distance' | 'calories' | 'activeMinutes' | 'water' | 'sleep' | 'exercise';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '3 months' },
  { value: '365', label: 'Year' },
  { value: '3650', label: 'All' },
];

export function bpClass(sys: number, dia: number): { label: string; tone: 'sage' | 'gold' | 'coral' } {
  if (sys >= 180 || dia >= 120) return { label: 'Very high, get help now', tone: 'coral' };
  if (sys >= 140 || dia >= 90) return { label: 'High (stage 2)', tone: 'coral' };
  if (sys >= 130 || dia >= 80) return { label: 'High (stage 1)', tone: 'gold' };
  if (sys >= 120) return { label: 'Elevated', tone: 'gold' };
  if (sys < 90 || dia < 60) return { label: 'Low', tone: 'gold' };
  return { label: 'Normal', tone: 'sage' };
}

export const VitalsView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const [days, setDays] = useState('30');
  const [logOpen, setLogOpen] = useState(false);
  const latest = useQuery(api.health.vitals.latest, { who });
  useEffect(() => {
    if (takeHealthIntent('health-vitals') === 'log') setLogOpen(true);
  }, []);

  return (
    <Screen title="Vitals & body" sub="Readings, sleep and movement" actions={<IconBtn icon={Plus} label="Log a reading" primary onClick={() => setLogOpen(true)} />}>
      <PersonSwitch />
      <Chips value={days} onChange={setDays} options={RANGES} />
      {(latest ?? []).map((p) => (
        <PersonVitals key={p.userId} p={p} days={+days} showName={(latest?.length ?? 0) > 1} name={p.isMe ? meName : partnerName} />
      ))}
      {latest && !latest.some((p) => p.healthConnectAt) && (
        <Card onClick={() => goToTab('health-settings')}>
          <span className="text-[15px]">Connect Health Connect</span>
          <span className="text-sm text-white/55">Steps, sleep, heart rate, BP, blood sugar and weight from your watch, BP monitor or glucometer, on their own.</span>
        </Card>
      )}
      <Note>Meals and mood live in Logs. Readings you type here are also written to Health Connect when it's connected.</Note>
      <LogReading open={logOpen} onClose={() => setLogOpen(false)} />
    </Screen>
  );
};

type Latest = NonNullable<ReturnType<typeof useQuery<typeof api.health.vitals.latest>>>[number];

function useSeries(type: VitalType, days: number, userId: string) {
  const [who] = useWho();
  const data = useQuery(api.health.vitals.series, { who, type, days });
  return data?.find((d) => d.userId === userId)?.points ?? [];
}

function PersonVitals({ p, days, showName, name }: { p: Latest; days: number; showName: boolean; name: string }) {
  const l = p.latest;
  const a = p.avg30;
  const hasAny = Object.keys(l).length > 0;
  const bp = useSeries('bp', days, p.userId);
  const weight = useSeries('weight', days, p.userId);
  const glucose = useSeries('glucose', days, p.userId);
  const sleep = useSeries('sleep', Math.min(days, 30), p.userId);
  const steps = useSeries('steps', Math.min(days, 30), p.userId);
  const exercise = useSeries('exercise', 30, p.userId);
  const remove = useMutation(api.health.vitals.remove);
  const xl = (pts: { time: number }[]) => (pts.length > 1 ? [pts[0], pts[pts.length - 1]].map((x) => ({ x: x.time, label: new Date(x.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })) : []);
  const bmi = l.weight && p.heightCm ? l.weight.value / (p.heightCm / 100) ** 2 : null;
  const lastSleep = l.sleep;
  const bpAvg = a.bp;

  if (!hasAny) {
    return (
      <div className="space-y-4">
        {showName && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}
        <Empty icon={Activity} title="No readings yet" body={p.isMe ? 'Log a blood pressure, sugar or weight reading with the + above, or connect Health Connect in Health settings to bring in your watch and devices.' : 'Nothing logged yet.'} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showName && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Blood pressure</span>
            <div className="font-mono text-[28px] leading-tight">{bpAvg ? `${Math.round(bpAvg.value)}/${bpAvg.value2}` : l.bp ? `${l.bp.value}/${l.bp.value2}` : '–'} <small className="font-sans text-xs text-white/45">{bpAvg ? 'avg 30 d' : 'mmHg'}</small></div>
          </div>
          {(bpAvg || l.bp) && (() => { const c = bpClass(bpAvg ? bpAvg.value : l.bp!.value, bpAvg?.value2 ?? l.bp!.value2 ?? 0); return <Pill tone={c.tone}>{c.label}</Pill>; })()}
        </div>
        {bp.length > 1 && (
          <TrendChart label="Blood pressure" limits={[130, 80]} xLabels={xl(bp)} series={[{ tone: 'purple', dots: bp.length < 20, points: bp.map((r) => ({ x: r.time, y: r.value })) }, { tone: 'azure', dots: bp.length < 20, points: bp.map((r) => ({ x: r.time, y: r.value2 ?? 0 })) }]} />
        )}
        {l.bp && <span className="text-xs text-white/45">Last: {l.bp.value}/{l.bp.value2} · {fmtWhen(l.bp.time)}{l.bp.context ? ` · ${l.bp.context}` : ''} · {l.bp.source === 'manual' ? 'typed in' : l.bp.source}</span>}
      </Card>

      <Tiles cols={2}>
        <Tile icon={Activity} label="Resting heart rate" value={l.restingHr ? fmtNum(l.restingHr.value, 0) : '–'} unit="bpm" sub={a.restingHr ? `30-day avg ${fmtNum(a.restingHr.value, 0)}` : undefined} />
        <Tile icon={Waves} label="HRV" value={l.hrv ? fmtNum(l.hrv.value, 0) : '–'} unit="ms" />
        <Tile icon={Droplet} label="SpO₂" value={l.spo2 ? fmtNum(l.spo2.value, 0) : '–'} unit="%" sub={l.spo2 && l.spo2.value < 94 ? 'Low: recheck' : undefined} tone={l.spo2 && l.spo2.value < 92 ? 'coral' : undefined} />
        <Tile icon={Wind} label="Breathing rate" value={l.respRate ? fmtNum(l.respRate.value, 0) : '–'} unit="/min" />
        <Tile icon={Thermometer} label="Temperature" value={l.temp ? fmtNum(l.temp.value) : '–'} unit="°C" sub={l.temp ? fmtWhen(l.temp.time) : undefined} tone={l.temp && l.temp.value >= 38 ? 'coral' : undefined} />
        <Tile icon={Gauge} label="VO₂ max" value={l.vo2max ? fmtNum(l.vo2max.value, 0) : '–'} unit="ml/kg/min" />
      </Tiles>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Weight</span>
            <div className="font-mono text-[28px] leading-tight">{l.weight ? fmtNum(l.weight.value) : '–'} <small className="font-sans text-xs text-white/45">kg</small></div>
          </div>
          {weight.length > 1 && <Pill tone="muted">{fmtNum(weight[weight.length - 1].value - weight[0].value)} kg</Pill>}
        </div>
        {weight.length > 1 && <TrendChart label="Weight" height={110} xLabels={xl(weight)} series={[{ tone: p.isMe ? 'purple' : 'azure', dots: weight.length < 15, points: weight.map((r) => ({ x: r.time, y: r.value })) }]} />}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><div className="text-xs text-white/45">BMI</div><div className="font-mono">{bmi ? fmtNum(bmi) : '–'}</div></div>
          <div><div className="text-xs text-white/45">Waist</div><div className="font-mono">{l.waist ? `${fmtNum(l.waist.value)} cm` : '–'}</div></div>
          <div><div className="text-xs text-white/45">Body fat</div><div className="font-mono">{l.bodyFat ? `${fmtNum(l.bodyFat.value)} %` : '–'}</div></div>
        </div>
      </Card>

      {glucose.length > 0 && (
        <Section title="Blood sugar">
          <List>
            {[...glucose].reverse().slice(0, 6).map((g) => (
              <Row key={g._id} title={g.context ?? 'Reading'} meta={`${fmtWhen(g.time)} · ${g.source === 'manual' ? 'typed in' : g.source}`} end={<span className="flex items-center gap-2"><span className="font-mono">{g.value}</span><span className={`inline-block h-[7px] w-[7px] rounded-full ${g.value > 180 || g.value < 70 ? 'bg-coral' : g.value > 140 ? 'bg-gold' : 'bg-sage'}`} />{p.isMe && g.source === 'manual' && <button aria-label="Delete" onClick={() => attempt(() => remove({ id: g._id }))} className="text-white/25"><Trash2 size={14} /></button>}</span>} />
            ))}
          </List>
        </Section>
      )}

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Sleep {lastSleep ? fmtWhen(lastSleep.extra?.endTime ?? lastSleep.time).split(' ')[0].toLowerCase() : ''}</span>
            <div className="font-mono text-[28px] leading-tight">{lastSleep ? `${Math.floor(lastSleep.value)}h ${Math.round((lastSleep.value % 1) * 60)}m` : '–'}</div>
          </div>
          {a.sleep && <span className="text-right text-xs text-white/45">30-day avg<br />{Math.floor(a.sleep.value)}h {Math.round((a.sleep.value % 1) * 60)}m</span>}
        </div>
        {lastSleep?.extra?.stages && lastSleep.extra.stages.length > 0 && <SleepStages stages={lastSleep.extra.stages} />}
        {sleep.length > 2 && <TrendChart label="Sleep hours" height={90} limits={[7]} xLabels={xl(sleep)} series={[{ tone: 'azure', points: sleep.map((r) => ({ x: r.time, y: Math.round(r.value * 10) / 10 })) }]} />}
      </Card>

      <Tiles>
        <Tile icon={Footprints} label="Steps" value={l.steps ? fmtNum(l.steps.value, 0) : '–'} sub={steps.length ? `avg ${fmtNum(Math.round(steps.reduce((s, x) => s + x.value, 0) / steps.length), 0)}` : undefined} />
        <Tile icon={Flame} label="Active" value={l.activeMinutes ? fmtNum(l.activeMinutes.value, 0) : '–'} unit="min" />
        <Tile icon={GlassWater} label="Water" value={l.water ? fmtNum(l.water.value) : '–'} unit="L" />
      </Tiles>
      {exercise.length > 0 && (
        <List>
          {[...exercise].reverse().slice(0, 5).map((e) => (
            <Row key={e._id} icon={<Dumbbell size={16} />} tone="sage" title={`${e.extra?.title ?? e.extra?.exerciseType ?? 'Workout'} · ${fmtNum(e.value, 0)} min`} meta={[fmtWhen(e.time), e.extra?.distanceKm ? `${fmtNum(e.extra.distanceKm)} km` : null, e.extra?.kcal ? `${fmtNum(e.extra.kcal, 0)} kcal` : null].filter(Boolean).join(' · ')} />
          ))}
        </List>
      )}
    </div>
  );
}

const STAGE_COLOR: Record<string, string> = { deep: 'bg-nothing-purple', light: 'bg-azure', rem: 'bg-sage', awake: 'bg-coral', sleeping: 'bg-azure', unknown: 'bg-white/20', out_of_bed: 'bg-coral' };
function SleepStages({ stages }: { stages: { stage: string; min: number }[] }) {
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const s of stages) t[s.stage] = (t[s.stage] ?? 0) + s.min;
    return t;
  }, [stages]);
  const h = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return (
    <>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-md">
        {stages.map((s, i) => <i key={i} className={`block h-full ${STAGE_COLOR[s.stage] ?? 'bg-white/20'}`} style={{ flex: s.min }} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
        {Object.entries(totals).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><i className={`inline-block h-[7px] w-[7px] rounded-full ${STAGE_COLOR[k] ?? 'bg-white/20'}`} />{k === 'rem' ? 'REM' : k[0].toUpperCase() + k.slice(1)} {h(v)}</span>)}
      </div>
    </>
  );
}

const LOG_TYPES: { type: VitalType; label: string; icon: LucideIcon; unit: string }[] = [
  { type: 'bp', label: 'BP', icon: HeartPulse, unit: 'mmHg' },
  { type: 'glucose', label: 'Sugar', icon: Droplet, unit: 'mg/dL' },
  { type: 'weight', label: 'Weight', icon: Scale, unit: 'kg' },
  { type: 'temp', label: 'Temp', icon: Thermometer, unit: '°C' },
  { type: 'heartRate', label: 'Pulse', icon: Activity, unit: 'bpm' },
  { type: 'spo2', label: 'SpO₂', icon: Wind, unit: '%' },
  { type: 'waist', label: 'Waist', icon: Ruler, unit: 'cm' },
  { type: 'water', label: 'Water', icon: GlassWater, unit: 'L' },
  { type: 'height', label: 'Height', icon: Ruler, unit: 'cm' },
  { type: 'bodyFat', label: 'Body fat', icon: Scale, unit: '%' },
  { type: 'sleep', label: 'Sleep', icon: Moon, unit: 'hours' },
  { type: 'steps', label: 'Steps', icon: Footprints, unit: 'steps' },
];

const GLUCOSE_CONTEXT = ['Fasting', 'Before breakfast', 'After breakfast (2 h)', 'Before lunch', 'After lunch (2 h)', 'Before dinner', 'After dinner (2 h)', 'Bedtime', 'Random'];

function LogReading({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useMutation(api.health.vitals.add);
  const [type, setType] = useState<VitalType>('bp');
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [pulse, setPulse] = useState('');
  const [context, setContext] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [when, setWhen] = useState(localInput(Date.now()));
  const info = LOG_TYPES.find((t) => t.type === type)!;
  useEffect(() => {
    if (open) setWhen(localInput(Date.now()));
  }, [open]);
  const save = async () => {
    const time = new Date(when).getTime();
    let value = num(v1);
    if (value == null) return;
    if (type === 'temp' && tempUnit === 'F') value = Math.round((((value - 32) * 5) / 9) * 10) / 10;
    const ok = await attempt(async () => {
      await add({ type, value, value2: type === 'bp' ? num(v2) : undefined, time, context: context || undefined });
      if (type === 'bp' && num(pulse)) await add({ type: 'heartRate', value: num(pulse)!, time, context: 'With BP' });
    });
    if (ok !== undefined) {
      setV1('');
      setV2('');
      setPulse('');
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log a reading">
      <div className="grid grid-cols-4 gap-2">
        {LOG_TYPES.map((t) => (
          <button key={t.type} type="button" onClick={() => { setType(t.type); setContext(''); }} className={`flex flex-col items-center gap-1.5 rounded-[18px] px-1 py-3 text-[11px] ${type === t.type ? 'bg-white text-black' : 'glass'}`}>
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>
      {type === 'bp' ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Top"><Input inputMode="numeric" value={v1} onChange={(e) => setV1(e.target.value)} placeholder="120" /></Field>
          <Field label="Bottom"><Input inputMode="numeric" value={v2} onChange={(e) => setV2(e.target.value)} placeholder="80" /></Field>
          <Field label="Pulse"><Input inputMode="numeric" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="72" /></Field>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={`Value (${type === 'temp' ? `°${tempUnit}` : info.unit})`}><Input inputMode="decimal" value={v1} onChange={(e) => setV1(e.target.value)} /></Field></div>
          {type === 'temp' && <div className="w-28"><Segmented small value={tempUnit} onChange={setTempUnit} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} /></div>}
        </div>
      )}
      {type === 'glucose' && <Field label="When"><Select value={context} onChange={setContext} options={[{ value: '', label: 'Pick one' }, ...GLUCOSE_CONTEXT.map((c) => ({ value: c, label: c }))]} /></Field>}
      {type === 'bp' && <Field label="How"><Select value={context} onChange={setContext} options={[{ value: '', label: 'Sitting, left arm' }, ...['Sitting, right arm', 'Standing', 'Lying down', 'After exercise', 'Morning, before coffee', 'Evening'].map((c) => ({ value: c, label: c }))]} /></Field>}
      <Field label="Time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Btn onClick={save}>Save reading</Btn>
    </Sheet>
  );
}

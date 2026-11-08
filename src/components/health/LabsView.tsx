import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus, TrendingDown, TrendingUp, Target, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { takeHealthIntent, setHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import { LAB_TESTS, PANELS, toAltUnit } from '../../../convex/health/labLogic';
import {
  Av, Btn, Card, Chips, Empty, Field, fmtDate, flagLabel, flagTone, IconBtn, Input, List, Note, Overlay, PersonSwitch, Pill,
  Row, Screen, Section, Segmented, Select, Sheet, Spark, Tile, Tiles, TrendChart, attempt, dayX, num, todayStr, usePeople, useWho, fmtNum,
} from './ui';

export const LabsView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const data = useQuery(api.health.labs.overview, { who });
  const [panel, setPanel] = useState<string>('All');
  const [open, setOpen] = useState<{ ownerId: Id<'users'>; code: string } | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const i = takeHealthIntent('health-labs');
    if (i?.startsWith('marker:')) {
      const [, ownerId, ...code] = i.split(':');
      setOpen({ ownerId: ownerId as Id<'users'>, code: code.join(':') });
    }
    if (i === 'add') setAdding(true);
  }, []);

  const totals = useMemo(() => {
    const t = { tracked: 0, out: 0, near: 0, last: '' };
    for (const p of data ?? []) {
      t.tracked += p.counts.tracked;
      t.out += p.counts.out;
      t.near += p.counts.near;
      if (p.lastTest && p.lastTest > t.last) t.last = p.lastTest;
    }
    return t;
  }, [data]);

  const panels = useMemo(() => ['All', ...PANELS.filter((p) => data?.some((d) => d.markers.some((m) => m.panel === p)))], [data]);
  const both = (data?.length ?? 0) > 1;

  // Markers you both have, for the side-by-side chart.
  const shared = useMemo(() => {
    if (!data || data.length < 2) return null;
    const [a, b] = data;
    const common = a.markers.find((m) => m.history.length >= 2 && b.markers.some((n) => n.code === m.code && n.history.length >= 1));
    if (!common) return null;
    const other = b.markers.find((n) => n.code === common.code)!;
    return { a, b, m: common, n: other };
  }, [data]);

  return (
    <Screen title="Lab results" sub="Every value, from every report" actions={<IconBtn icon={Plus} label="Add a value" primary onClick={() => setAdding(true)} />}>
      <PersonSwitch />
      <Tiles>
        <Tile label="Tracked" value={totals.tracked} sub="markers" />
        <Tile label="Out of range" value={totals.out} tone={totals.out ? 'coral' : undefined} sub={totals.near ? `+${totals.near} near the edge` : 'none near the edge'} />
        <Tile label="Last test" value={totals.last ? fmtDate(totals.last, false) : '–'} />
      </Tiles>
      {panels.length > 2 && <Chips value={panel} onChange={setPanel} options={panels.map((p) => ({ value: p, label: p }))} />}

      {data && totals.tracked === 0 && (
        <Empty icon={FlaskConical} title="No lab values yet" body="Upload a lab report in Records and the values land here, charted over time." action={<button className="mt-2 text-sm text-nothing-purple" onClick={() => { setHealthIntent('health-records', 'upload'); goToTab('health-records'); }}>Upload a report</button>} />
      )}

      {(data ?? []).map((p) =>
        PANELS.filter((pn) => panel === 'All' || pn === panel).map((pn) => {
          const markers = p.markers.filter((m) => m.panel === pn);
          if (!markers.length) return null;
          return (
            <Section key={`${p.userId}${pn}`} title={<>{both && <Av isMe={p.isMe} size="sm" name={p.isMe ? meName : partnerName} />}{pn}</>}>
              <List>
                {markers.map((m) => (
                  <Row
                    key={m.code}
                    title={m.name}
                    meta={[m.unit, m.latest.refLow != null || m.latest.refHigh != null ? `${m.hasTarget ? 'target' : 'range'} ${m.latest.refLow ?? ''}${m.latest.refLow != null && m.latest.refHigh != null ? '–' : m.latest.refHigh != null ? '<' : '>'}${m.latest.refHigh ?? ''}` : null, fmtDate(m.latest.date)].filter(Boolean).join(' · ')}
                    onClick={() => setOpen({ ownerId: p.userId, code: m.code })}
                    end={
                      <span className="flex items-center gap-3">
                        <Spark values={m.history.map((h) => h.value)} low={m.latest.refLow} high={m.latest.refHigh} />
                        <span className="flex flex-col items-end gap-1">
                          <span className="font-mono text-[15px]">{m.latest.value != null ? fmtNum(m.latest.value, 2) : m.latest.valueText}</span>
                          {m.latest.flag && m.latest.flag !== 'normal' ? <Pill tone={flagTone(m.latest.flag)}>{flagLabel(m.latest.flag)}</Pill> : null}
                        </span>
                      </span>
                    }
                  />
                ))}
              </List>
            </Section>
          );
        }),
      )}

      {shared && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[15px]">{shared.m.name}, both of you</span>
            <span className="flex gap-3 text-[11px] text-white/45"><span className="flex items-center gap-1"><Av isMe size="sm" name={meName} />Me</span><span className="flex items-center gap-1"><Av isMe={false} size="sm" name={partnerName} />{partnerName.split(' ')[0]}</span></span>
          </div>
          <TrendChart
            label={`${shared.m.name} for both`}
            band={[shared.m.latest.refLow, shared.m.latest.refHigh]}
            series={[
              { tone: shared.a.isMe ? 'purple' : 'azure', points: shared.m.history.map((h) => ({ x: dayX(h.date), y: h.value })) },
              { tone: shared.b.isMe ? 'purple' : 'azure', points: shared.n.history.map((h) => ({ x: dayX(h.date), y: h.value })) },
            ]}
            xLabels={[...shared.m.history, ...shared.n.history].sort((a, b) => a.date.localeCompare(b.date)).filter((_, i, all) => i === 0 || i === all.length - 1).map((h) => ({ x: dayX(h.date), label: fmtDate(h.date) }))}
          />
          <Note>Shaded band is the usual range.</Note>
        </Card>
      )}

      <AddValue open={adding} onClose={() => setAdding(false)} />
      <Overlay open={!!open} onClose={() => setOpen(null)}>{open && <Marker ownerId={open.ownerId} code={open.code} />}</Overlay>
    </Screen>
  );
};

function Marker({ ownerId, code }: { ownerId: Id<'users'>; code: string }) {
  const m = useQuery(api.health.labs.marker, { ownerId, code });
  const removeResult = useMutation(api.health.labs.removeResult);
  const [unit, setUnit] = useState<'base' | 'alt'>('base');
  const [editTarget, setEditTarget] = useState(false);
  if (!m) return <p className="py-20 text-center text-white/40">Loading…</p>;
  const nums = m.results.filter((r) => r.value != null) as (typeof m.results[number] & { value: number })[];
  const last = m.results[m.results.length - 1];
  const first = nums[0];
  const show = (v: number | undefined) => (v == null ? '–' : unit === 'alt' && m.si ? fmtNum(toAltUnit(code, v)?.value, 2) : fmtNum(v, 2));
  const change = nums.length >= 2 && first.value ? Math.round(((nums[nums.length - 1].value - first.value) / first.value) * 100) : null;
  const band: [number | undefined, number | undefined] = [m.target?.low ?? last?.refLow, m.target?.high ?? last?.refHigh];
  const events = m.meds.filter((x) => nums.length && x.start >= nums[0].date && x.start <= nums[nums.length - 1].date).map((x) => ({ x: dayX(x.start), label: x.name.split(' ')[0] }));

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-1">
        <h1 className="dot-matrix text-[1.7rem] font-medium leading-tight">{m.name}</h1>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{[m.panel, m.loinc ? `LOINC ${m.loinc}` : null].filter(Boolean).join(' · ')}</p>
      </header>
      <Card>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[44px] leading-none tracking-tighter">{last?.value != null ? show(last.value) : last?.valueText}<small className="ml-1 font-sans text-sm tracking-normal text-white/45">{unit === 'alt' && m.si ? m.si.unit : m.unit}</small></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {last?.flag && <Pill tone={flagTone(last.flag)}>{flagLabel(last.flag)}</Pill>}
              {change != null && change !== 0 && <Pill tone="muted">{change < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}{Math.abs(change)}% since {fmtDate(first.date)}</Pill>}
            </div>
          </div>
          {m.si && <div className="w-40"><Segmented small value={unit} onChange={setUnit} options={[{ value: 'base', label: m.unit }, { value: 'alt', label: m.si.unit }]} /></div>}
        </div>
        {nums.length > 0 && (
          <TrendChart
            label={`${m.name} over time`}
            band={band}
            series={[{ tone: 'muted', labels: nums.length <= 8, points: nums.map((r) => ({ x: dayX(r.date), y: r.value })) }]}
            status={(y) => (band[1] != null && y > band[1]) || (band[0] != null && y < band[0]) ? 'hi' : 'ok'}
            events={events}
            xLabels={nums.length > 1 ? [nums[0], nums[nums.length - 1]].map((r) => ({ x: dayX(r.date), label: fmtDate(r.date) })) : [{ x: dayX(nums[0].date), label: fmtDate(nums[0].date) }]}
          />
        )}
      </Card>
      <List>
        <Row icon={<Target size={16} />} title="Your target" meta={m.target ? `${m.target.low != null ? `from ${m.target.low}` : ''}${m.target.high != null ? ` under ${m.target.high}` : ''}${m.target.setBy ? ` · set by ${m.target.setBy}` : ''}` : 'None: each value uses its report\'s range'} onClick={m.isMine ? () => setEditTarget(true) : undefined} />
      </List>
      <Section title="All results">
        <List>
          {[...m.results].reverse().map((r) => (
            <Row
              key={r._id}
              title={<span className="font-mono">{r.value != null ? show(r.value) : r.valueText} <span className="font-sans text-xs text-white/45">{unit === 'alt' && m.si ? m.si.unit : r.unit}</span></span>}
              meta={[fmtDate(r.date), r.lab ?? (r.source === 'manual' ? 'Typed in' : r.recordTitle), r.refText ?? (r.refLow != null || r.refHigh != null ? `range ${r.refLow ?? ''}–${r.refHigh ?? ''}` : null)].filter(Boolean).join(' · ')}
              end={
                <span className="flex items-center gap-2">
                  {r.flag && r.flag !== 'normal' && <Pill tone={flagTone(r.flag)}>{flagLabel(r.flag)}</Pill>}
                  {m.isMine && r.source === 'manual' && <button aria-label="Delete" onClick={() => attempt(() => removeResult({ id: r._id }))} className="text-white/30"><Trash2 size={15} /></button>}
                </span>
              }
            />
          ))}
        </List>
        <Note>Labs print different ranges for the same test, so each point is judged against its own report's range, unless your doctor set a target.</Note>
      </Section>
      {m.about && (
        <Card>
          <span className="text-[15px]">What it is</span>
          <p className="text-sm text-white/65">{m.about}</p>
        </Card>
      )}
      {m.isMine && <TargetSheet open={editTarget} onClose={() => setEditTarget(false)} code={code} current={m.target} />}
    </div>
  );
}

function TargetSheet({ open, onClose, code, current }: { open: boolean; onClose: () => void; code: string; current: { low?: number; high?: number; setBy?: string } | null }) {
  const setTarget = useMutation(api.health.labs.setTarget);
  const clear = useMutation(api.health.labs.clearTarget);
  const [low, setLow] = useState(current?.low != null ? String(current.low) : '');
  const [high, setHigh] = useState(current?.high != null ? String(current.high) : '');
  const [by, setBy] = useState(current?.setBy ?? '');
  return (
    <Sheet open={open} onClose={onClose} title="Your target">
      <p className="text-sm text-white/55">If your doctor gave you a target (like LDL under 100), it replaces the lab's printed range for flags and charts.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="At least"><Input inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} /></Field>
        <Field label="Under"><Input inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} /></Field>
      </div>
      <Field label="Set by"><Input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Dr. Mehta" /></Field>
      <div className="flex gap-2">
        {current && <Btn kind="secondary" onClick={async () => { await attempt(() => clear({ code })); onClose(); }}>Remove</Btn>}
        <Btn onClick={async () => { const ok = await attempt(() => setTarget({ code, low: num(low), high: num(high), setBy: by })); if (ok !== undefined) onClose(); }}>Save</Btn>
      </div>
    </Sheet>
  );
}

function AddValue({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useMutation(api.health.labs.addManual);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [range, setRange] = useState('');
  const [date, setDate] = useState(todayStr());
  const test = LAB_TESTS.find((t) => t.code === code);
  const save = async () => {
    const n = num(value);
    const ok = await attempt(() => add({ code: code || undefined, name: test?.name ?? name, date, value: n, valueText: n == null ? value : undefined, unit: unit || test?.unit, refText: range || undefined }));
    if (ok !== undefined) {
      setValue('');
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a lab value">
      <Field label="Test">
        <Select value={code} onChange={(v) => { setCode(v); setUnit(LAB_TESTS.find((t) => t.code === v)?.unit ?? ''); }} options={[{ value: '', label: 'Other (type a name)' }, ...LAB_TESTS.map((t) => ({ value: t.code, label: `${t.name} · ${t.panel}` }))]} />
      </Field>
      {!code && <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dengue NS1" /></Field>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Result"><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="96 or Negative" /></Field>
        <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field label="Range (optional)"><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="70 - 99" /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Btn onClick={save}>Save value</Btn>
    </Sheet>
  );
}

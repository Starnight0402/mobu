import React, { useEffect, useRef, useState } from 'react';
import { Camera, HandHeart, Plus, Sparkles, Thermometer, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { takeHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import { Av, Btn, Card, Chips, cx, Empty, Field, fmtWhen, IconBtn, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Sheet, TextArea, TrendChart, attempt, localInput, usePeople, useUpload, useWho } from './ui';

const COMMON = ['Headache', 'Fever', 'Cough', 'Cold', 'Sore throat', 'Acidity', 'Back pain', 'Tired', 'Cramps', 'Allergy', 'Nausea', 'Loose motions', 'Body ache', 'Dizziness', 'Rash', 'Breathless'];
const PARTS = ['Head', 'Eyes', 'Throat', 'Chest', 'Stomach', 'Lower back', 'Upper back', 'Arms', 'Legs', 'Joints', 'Skin'];
const TRIGGERS = ['Poor sleep', 'Stress', 'Screen time', 'Food', 'Dehydration', 'Weather', 'Exercise', 'Period', 'Travel'];

export const SymptomsView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const symptoms = useQuery(api.health.symptoms.list, { who, days: 90 });
  const episodes = useQuery(api.health.symptoms.episodes, { who });
  const patterns = useQuery(api.health.symptoms.patterns, { who });
  const startEpisode = useMutation(api.health.symptoms.startEpisode);
  const updateEpisode = useMutation(api.health.symptoms.updateEpisode);
  const remove = useMutation(api.health.symptoms.remove);
  const [log, setLog] = useState<string | null>(null);
  const [newIll, setNewIll] = useState<string | null>(null);
  useEffect(() => {
    if (takeHealthIntent('health-symptoms') === 'log') setLog('');
  }, []);
  const both = who === 'both';
  const ongoing = (episodes ?? []).filter((e) => e.status === 'ongoing');
  const past = (episodes ?? []).filter((e) => e.status === 'resolved');
  const series = new Map<string, { url: string; at: number }[]>();
  for (const s of symptoms ?? []) if (s.series && s.photoUrl) series.set(s.series, [...(series.get(s.series) ?? []), { url: s.photoUrl, at: s.at }]);

  return (
    <Screen title="Symptoms" sub="Log it, see patterns, track illness" actions={<IconBtn icon={Plus} label="Log a symptom" primary onClick={() => setLog('')} />}>
      <PersonSwitch />
      <Section title="How do you feel?">
        <Chips<string> value="" onChange={(v) => setLog(v)} options={COMMON.map((c) => ({ value: c, label: c }))} />
      </Section>

      {ongoing.map((e) => (
        <Card key={e._id}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">{both && <Av isMe={e.isMine} name={e.isMine ? meName : partnerName} />}<span className="text-base">{e.title}</span></span>
            <Pill tone="coral">Day {Math.floor((Date.now() - e.start) / 86_400_000) + 1}</Pill>
          </div>
          {e.temps.length > 1 && (
            <TrendChart label="Temperature" height={110} limits={[38]} series={[{ tone: 'coral', labels: e.temps.length <= 8, points: e.temps.map((t) => ({ x: t.at, y: t.value })) }]} status={(y) => (y >= 38 ? 'hi' : y >= 37.5 ? 'bd' : 'ok')} />
          )}
          <div className="flex gap-2">
            <Btn kind="secondary" onClick={() => goToTab('health-care')}><HandHeart size={16} />Care mode</Btn>
            {e.isMine && <Btn kind="secondary" onClick={() => attempt(() => updateEpisode({ id: e._id, resolved: true }))}>I'm better</Btn>}
          </div>
        </Card>
      ))}

      {patterns?.some((p) => p.notes.length) && patterns.map((p) => p.notes.length > 0 && (
        <div key={p.userId} className="flex flex-col gap-2 rounded-3xl border border-nothing-purple/35 bg-nothing-purple/[0.08] p-4">
          <span className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-nothing-purple"><Sparkles size={14} />Patterns{both ? ` · ${p.isMe ? 'Me' : partnerName}` : ''}</span>
          {p.notes.map((n) => <p key={n} className="text-[15px]">{n}</p>)}
          <span className="text-xs text-white/40">Worked out from your own logs. Worth mentioning to a doctor if it keeps up.</span>
        </div>
      ))}

      <Section title="Recent">
        {symptoms && symptoms.length === 0 ? (
          <Empty icon={Thermometer} title="Nothing logged" body="Tap a symptom above. Logging how often and how bad helps a doctor more than “it happens sometimes”." />
        ) : (
          <List>
            {(symptoms ?? []).slice(0, 40).map((s) => (
              <Row key={s._id} title={<>{s.name} <span className="font-mono text-xs text-white/45">{s.severity}/10</span></>}
                meta={[fmtWhen(s.at), s.durationMin ? `${s.durationMin >= 60 ? `${Math.round(s.durationMin / 60)} h` : `${s.durationMin} min`}` : null, s.bodyParts?.join(', '), s.triggers?.join(', '), s.notes].filter(Boolean).join(' · ')}
                end={<span className="flex items-center gap-2">{both && <Av isMe={s.isMine} size="sm" name={s.isMine ? meName : partnerName} />}{s.isMine && <button aria-label="Delete" onClick={() => attempt(() => remove({ id: s._id }))} className="text-white/25"><Trash2 size={14} /></button>}</span>} />
            ))}
          </List>
        )}
      </Section>

      {series.size > 0 && (
        <Section title="Photo series">
          {[...series.entries()].map(([name, photos]) => (
            <Card key={name}>
              <span className="text-[15px]">{name}</span>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {photos.sort((a, b) => a.at - b.at).map((p) => (
                  <figure key={p.at} className="shrink-0"><img src={p.url} alt={name} className="h-24 w-24 rounded-xl object-cover" /><figcaption className="mt-1 text-[10px] text-white/40">{new Date(p.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</figcaption></figure>
                ))}
              </div>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Illnesses" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setNewIll('')}>Start one</button>}>
        {past.length ? (
          <List>{past.map((e) => <Row key={e._id} title={e.title} meta={`${new Date(e.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${e.end ? ` · ${Math.max(1, Math.round((e.end - e.start) / 86_400_000))} days` : ''}${e.medCount ? ` · ${e.medCount} doses given` : ''}`} end={both ? <Av isMe={e.isMine} size="sm" name={e.isMine ? meName : partnerName} /> : undefined} />)}</List>
        ) : (
          <Note>An illness pulls together the temperatures, medicines, visits and reports from one bout, like “Dengue, Sep 2024”.</Note>
        )}
      </Section>
      <Sheet open={newIll !== null} onClose={() => setNewIll(null)} title="Start an illness">
        <Field label="What is it"><Input value={newIll ?? ''} onChange={(e) => setNewIll(e.target.value)} placeholder="Viral fever" /></Field>
        <Btn onClick={async () => { const ok = await attempt(() => startEpisode({ title: newIll ?? '' })); if (ok) setNewIll(null); }}>Start</Btn>
      </Sheet>
      <LogSheet name={log} episodes={ongoing.filter((e) => e.isMine).map((e) => ({ id: e._id, title: e.title }))} onClose={() => setLog(null)} />
    </Screen>
  );
};

function LogSheet({ name, episodes, onClose }: { name: string | null; episodes: { id: string; title: string }[]; onClose: () => void }) {
  const log = useMutation(api.health.symptoms.log);
  const upload = useUpload();
  const photo = useRef<HTMLInputElement>(null);
  const [n, setN] = useState('');
  const [severity, setSeverity] = useState(5);
  const [duration, setDuration] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState(localInput(Date.now()));
  const [file, setFile] = useState<File | null>(null);
  const [seriesName, setSeriesName] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  useEffect(() => {
    if (name !== null) {
      setN(name);
      setWhen(localInput(Date.now()));
      setParts([]);
      setTriggers([]);
      setNotes('');
      setFile(null);
    }
  }, [name]);
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const save = async () => {
    const ok = await attempt(async () => {
      const ph = file ? await upload(file) : null;
      await log({ name: n, severity, at: new Date(when).getTime(), durationMin: duration ? Math.round(parseFloat(duration) * 60) : undefined, bodyParts: parts, triggers, notes, photoStorageId: ph?.storageId, series: seriesName || undefined, episodeId: (episodeId || undefined) as never });
    });
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet open={name !== null} onClose={onClose} title="Log a symptom">
      <Field label="What"><Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Headache" list="symptom-names" /></Field>
      <datalist id="symptom-names">{COMMON.map((c) => <option key={c} value={c} />)}</datalist>
      <Field label={`How bad: ${severity}/10`}>
        <input type="range" min={1} max={10} value={severity} onChange={(e) => setSeverity(+e.target.value)} className="w-full accent-[var(--color-coral)]" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="When"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Lasted (hours)"><Input inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
      </div>
      <Field label="Where"><div className="flex flex-wrap gap-1.5">{PARTS.map((p) => <button key={p} type="button" onClick={() => toggle(parts, p, setParts)} className={cx('rounded-full px-3 py-1.5 text-xs', parts.includes(p) ? 'bg-coral/20 text-coral' : 'glass')}>{p}</button>)}</div></Field>
      <Field label="Might be from"><div className="flex flex-wrap gap-1.5">{TRIGGERS.map((p) => <button key={p} type="button" onClick={() => toggle(triggers, p, setTriggers)} className={cx('rounded-full px-3 py-1.5 text-xs', triggers.includes(p) ? 'bg-gold/20 text-gold' : 'glass')}>{p}</button>)}</div></Field>
      {episodes.length > 0 && (
        <Field label="Part of an illness">
          <select value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} className="nothing-input w-full"><option value="">No</option>{episodes.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
        </Field>
      )}
      <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Btn kind="secondary" onClick={() => photo.current?.click()}><Camera size={16} />{file ? 'Photo added' : 'Add a photo (rash, mole, wound)'}</Btn>
      {file && <Field label="Photo series" hint="Same name each month to compare, e.g. “Mole, left shoulder”"><Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} /></Field>}
      <Btn onClick={save}>Save</Btn>
    </Sheet>
  );
}

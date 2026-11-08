import React, { useState } from 'react';
import { GlassWater, HandHeart, NotebookPen, Pill as PillIcon, Siren, Thermometer, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { goToTab } from '../../lib/navigation';
import { setHealthIntent } from '../../lib/healthIntent';
import { confirmDialog } from '../Dialog';
import { haptic } from '../../lib/haptics';
import { Btn, Card, Field, fmtTime, fmtWhen, Input, List, Note, Row, Screen, Section, Segmented, Sheet, TextArea, attempt, num, usePeople } from './ui';

type Kind = 'temp' | 'med' | 'fluid' | 'food' | 'symptom' | 'note';

export const CareView: React.FC = () => {
  const active = useQuery(api.health.care.active) ?? [];
  const { partnerName, hasPartner } = usePeople();
  const start = useMutation(api.health.care.start);
  const end = useMutation(api.health.care.end);
  const [who, setWho] = useState<'partner' | 'me'>('partner');
  const [title, setTitle] = useState('');

  if (!active.length) {
    return (
      <Screen title="Care mode" sub="When one of you is ill">
        <Card>
          <HandHeart size={22} className="text-coral" />
          <p className="text-[15px]">One of you is unwell and the other is looking after them. Care mode gives you both one shared log: temperatures, medicines given, fluids, notes, and a dose timer that counts from both phones.</p>
        </Card>
        {hasPartner && (
          <Card>
            <Segmented value={who} onChange={setWho} options={[{ value: 'partner', label: `${partnerName.split(' ')[0]} is ill` }, { value: 'me', label: "I'm ill" }]} />
            <Field label="What's going on"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Viral fever, food poisoning…" /></Field>
            <Btn onClick={() => attempt(() => start({ patient: who, title: title || 'Unwell' }))}>Start care mode</Btn>
          </Card>
        )}
        <Note>The other person gets a notification when you start it.</Note>
      </Screen>
    );
  }

  return (
    <Screen title="Care mode" sub="Shared log">
      {active.map((c) => (
        <CareEpisode key={c.episode._id} c={c} onEnd={async (resolved) => {
          if (await confirmDialog({ title: resolved ? 'Mark as better?' : 'End care mode?', body: resolved ? 'The illness is saved in Symptoms with this log.' : 'The log is kept; you can start again any time.', confirmLabel: resolved ? 'Better now' : 'End' })) {
            await attempt(() => end({ episodeId: c.episode._id, resolved }));
          }
        }} />
      ))}
    </Screen>
  );
};

type Active = NonNullable<ReturnType<typeof useQuery<typeof api.health.care.active>>>[number];

function CareEpisode({ c, onEnd }: { c: Active; onEnd: (resolved: boolean) => void }) {
  const log = useMutation(api.health.care.log);
  const removeLog = useMutation(api.health.care.removeLog);
  const [kind, setKind] = useState<Kind | null>(null);
  const now = Date.now();
  const latestTemp = c.logs.find((l) => l.kind === 'temp');
  const startedDays = Math.floor((now - c.episode.start) / 86_400_000) + 1;
  const highFever = c.logs.some((l) => l.kind === 'temp' && (l.value ?? 0) >= 39 && l.at > now - 86_400_000);

  return (
    <div className="space-y-4">
      <header className="space-y-0.5 px-1">
        <p className="text-[15px]">{c.patientIsMe ? 'You are unwell' : `Looking after ${c.patientName}`}: {c.episode.title}</p>
        <p className="text-xs text-white/45">Day {startedDays} · started {fmtWhen(c.episode.start)}</p>
      </header>

      {c.timers.map((t) => {
        const wait = t.nextAt && t.nextAt > now;
        return (
          <Card key={t.medName} className={wait ? 'bg-coral/[0.08]' : 'bg-sage/[0.08]'}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">Next {t.medName}</div>
                <div className="font-mono text-[28px] leading-tight">{wait ? `after ${fmtTime(t.nextAt!)}` : 'allowed now'}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">24 h</div>
                <div className={`font-mono text-xl ${t.maxPerDay && t.countToday >= t.maxPerDay ? 'text-coral' : ''}`}>{t.countToday}{t.maxPerDay ? ` of ${t.maxPerDay}` : ''}</div>
              </div>
            </div>
            <span className="text-xs text-white/45">Last given {fmtTime(t.lastAt)}. Counted from both phones.</span>
          </Card>
        );
      })}

      <div className="grid grid-cols-4 gap-2">
        {([
          ['temp', 'Temp', Thermometer, 'text-coral'],
          ['med', 'Medicine', PillIcon, 'text-nothing-purple'],
          ['fluid', 'Fluids', GlassWater, 'text-azure'],
          ['note', 'Note', NotebookPen, 'text-gold'],
        ] as const).map(([k, label, Icon, tint]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className="glass flex flex-col items-center gap-1.5 rounded-[18px] px-1 py-3.5 text-[11px]">
            <Icon size={19} className={tint} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 text-sm">
        <span className="glass flex-1 rounded-2xl px-3 py-2"><span className="text-xs text-white/45">Last temp</span><br /><span className="font-mono">{latestTemp ? `${latestTemp.value} °C` : '–'}</span></span>
        <span className="glass flex-1 rounded-2xl px-3 py-2"><span className="text-xs text-white/45">Fluids today</span><br /><span className="font-mono">{(c.fluidsToday / 1000).toFixed(1)} L</span></span>
      </div>

      <Section title="Log">
        <List>
          {c.logs.slice(0, 60).map((l) => (
            <Row key={l._id} icon={<span className="font-mono text-[11px]">{fmtTime(l.at)}</span>}
              title={l.kind === 'temp' ? `Temperature ${l.value} °C` : l.kind === 'med' ? l.medName : l.kind === 'fluid' ? `${l.text ?? 'Fluids'} ${l.value} ml` : l.text}
              meta={`${fmtWhen(l.at).split(' ')[0]} · ${l.by}`}
              end={<span className="flex items-center gap-2">{l.kind === 'temp' && (l.value ?? 0) >= 38 && <span className="inline-block h-[7px] w-[7px] rounded-full bg-coral" />}<button aria-label="Delete" onClick={() => attempt(() => removeLog({ id: l._id }))} className="text-white/25"><Trash2 size={14} /></button></span>} />
          ))}
        </List>
      </Section>

      <Card className={highFever ? 'border-coral/50' : undefined}>
        <span className="flex items-center gap-2 text-[15px]"><Siren size={17} className="text-coral" />Call a doctor if</span>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/65">
          <li>Fever stays at 39 °C or above, or lasts more than 3 days</li>
          <li>Breathlessness, chest pain, confusion, a rash, or any bleeding</li>
          <li>Can't keep fluids down, or passing very little urine</li>
          <li>Severe headache with a stiff neck</li>
        </ul>
        <span className="text-xs text-white/40">General guidance, not a diagnosis. In dengue season, ask about a dengue test early.</span>
      </Card>

      <div className="flex gap-2">
        <Btn kind="secondary" onClick={() => { setHealthIntent('health-share', 'care'); goToTab('health-share'); }}>Share with doctor</Btn>
        <Btn kind="secondary" onClick={() => onEnd(false)}>End</Btn>
        <Btn onClick={() => onEnd(true)}>Better now</Btn>
      </div>
      <LogSheet kind={kind} onClose={() => setKind(null)} onSave={async (args) => { const ok = await attempt(() => log({ episodeId: c.episode._id as Id<'episodes'>, ...args })); if (ok !== undefined) { haptic('success'); setKind(null); } }} />
    </div>
  );
}

function LogSheet({ kind, onClose, onSave }: { kind: Kind | null; onClose: () => void; onSave: (a: { kind: Kind; value?: number; text?: string; medName?: string }) => void }) {
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const title = kind === 'temp' ? 'Temperature' : kind === 'med' ? 'Medicine given' : kind === 'fluid' ? 'Fluids' : 'Note';
  const save = () => {
    if (kind === 'temp') {
      let v = num(value);
      if (v != null && unit === 'F') v = Math.round((((v - 32) * 5) / 9) * 10) / 10;
      onSave({ kind, value: v });
    } else if (kind === 'med') onSave({ kind, medName: text });
    else if (kind === 'fluid') onSave({ kind, value: num(value), text: text || undefined });
    else if (kind) onSave({ kind, text });
    setValue('');
    setText('');
  };
  return (
    <Sheet open={!!kind} onClose={onClose} title={title}>
      {kind === 'temp' && (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={`Reading (°${unit})`}><Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={unit === 'C' ? '38.5' : '101.3'} /></Field></div>
          <div className="w-28"><Segmented small value={unit} onChange={setUnit} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} /></div>
        </div>
      )}
      {kind === 'med' && (
        <>
          <Field label="Which medicine"><Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Paracetamol 650" list="care-meds" /></Field>
          <datalist id="care-meds">{['Paracetamol 650', 'Paracetamol 500', 'Cetirizine 10', 'ORS', 'Ondansetron 4', 'Pantoprazole 40', 'Ibuprofen 400'].map((m) => <option key={m} value={m} />)}</datalist>
          <div className="flex flex-wrap gap-1.5">{['Paracetamol 650', 'Cetirizine 10', 'Ondansetron 4'].map((m) => <button key={m} type="button" onClick={() => setText(m)} className="glass rounded-full px-3 py-1.5 text-xs">{m}</button>)}</div>
        </>
      )}
      {kind === 'fluid' && (
        <>
          <div className="flex flex-wrap gap-1.5">{['Water', 'ORS', 'Coconut water', 'Soup', 'Juice'].map((m) => <button key={m} type="button" onClick={() => setText(m)} className={`rounded-full px-3 py-1.5 text-xs ${text === m ? 'bg-white text-black' : 'glass'}`}>{m}</button>)}</div>
          <Field label="How much (ml)"><Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="250" /></Field>
        </>
      )}
      {(kind === 'note' || kind === 'symptom' || kind === 'food') && <Field label="Note"><TextArea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Throat is worse, ate some khichdi" /></Field>}
      <Btn onClick={save}>Save</Btn>
    </Sheet>
  );
}


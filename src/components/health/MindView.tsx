import React, { useState } from 'react';
import { CloudRain, Lock, MessageCircleHeart, Trash2, Zap } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { goToTab } from '../../lib/navigation';
import { GAD7, PHQ9 } from '../../../convex/health/mindQuestions';
import { noticeDialog } from '../Dialog';
import { Av, Btn, Card, cx, Field, fmtDate, Input, List, Note, PersonSwitch, Pill, Row, Screen, Section, Sheet, TextArea, TrendChart, attempt, todayStr, usePeople, useWho } from './ui';

const OPTIONS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

export const MindView: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName } = usePeople();
  const data = useQuery(api.health.mind.overview, { who });
  const [check, setCheck] = useState<'phq9' | 'gad7' | null>(null);
  const [session, setSession] = useState(false);
  const removeCheckin = useMutation(api.health.mind.removeCheckin);
  const removeSession = useMutation(api.health.mind.removeSession);

  return (
    <Screen title="Mind" sub="Private to you unless you share" actions={<span className="glass flex h-10 w-10 items-center justify-center rounded-full"><Lock size={16} /></span>}>
      <PersonSwitch />
      {data?.length === 0 && <Card><span className="text-sm text-white/60">{partnerName} keeps this private.</span></Card>}
      {data?.map((p) => {
        const name = p.isMe ? meName : partnerName;
        const phq = p.checkins.filter((c) => c.kind === 'phq9');
        const gad = p.checkins.filter((c) => c.kind === 'gad7');
        return (
          <div key={p.userId} className="space-y-4">
            {(data?.length ?? 0) > 1 && <p className="flex items-center gap-1.5 px-1 text-sm text-white/55"><Av isMe={p.isMe} size="sm" name={name} />{p.isMe ? 'Me' : name}</p>}
            <Card>
              <div className="flex justify-between"><span className="text-[11px] uppercase tracking-[0.14em] text-white/40">Mood, 30 days</span><span className="text-xs text-white/40">From daily Logs</span></div>
              {p.moods.length > 1 ? (
                <TrendChart label="Mood" height={100} yTicks={[1, 3, 5]} series={[{ tone: p.isMe ? 'purple' : 'azure', points: p.moods.map((m) => ({ x: m.at, y: m.value })) }]} />
              ) : (
                <p className="text-sm text-white/50">Log your mood on Home a few days and the trend shows here.</p>
              )}
            </Card>
            {p.isMe && (
              <Section title="Check-ins, every 2 weeks">
                <List>
                  <Row icon={<CloudRain size={16} />} tone="purple" title="Low mood check (PHQ-9)" meta={phq[0] ? `Last: ${phq[0].score} · ${phq[0].band} · ${fmtDate(new Date(phq[0].at).toISOString())}` : '9 questions, 2 minutes'} onClick={() => setCheck('phq9')} />
                  <Row icon={<Zap size={16} />} tone="azure" title="Anxiety check (GAD-7)" meta={gad[0] ? `Last: ${gad[0].score} · ${gad[0].band} · ${fmtDate(new Date(gad[0].at).toISOString())}` : '7 questions, 2 minutes'} onClick={() => setCheck('gad7')} />
                </List>
                <Note>Scores: 0–4 minimal, 5–9 mild, 10–14 moderate, 15+ high. 10 or more is a good reason to talk to a professional.</Note>
              </Section>
            )}
            {p.checkins.length > 0 && (
              <Section title="History">
                <List>
                  {p.checkins.slice(0, 12).map((c) => (
                    <Row key={c._id} title={`${c.kind === 'phq9' ? 'PHQ-9' : 'GAD-7'}: ${c.score}`} meta={`${c.band} · ${new Date(c.at).toLocaleDateString('en-IN')}`} end={<span className="flex items-center gap-2"><Pill tone={c.score >= 15 ? 'coral' : c.score >= 10 ? 'gold' : 'sage'}>{c.band}</Pill>{p.isMe && <button aria-label="Delete" onClick={() => attempt(() => removeCheckin({ id: c._id }))} className="text-white/25"><Trash2 size={14} /></button>}</span>} />
                  ))}
                </List>
              </Section>
            )}
            {(p.isMe || p.sessions.length > 0) && (
              <Section title="Therapy sessions" action={p.isMe ? <button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setSession(true)}>Add</button> : undefined}>
                {p.sessions.length ? (
                  <List>{p.sessions.map((s) => <Row key={s._id} icon={<MessageCircleHeart size={16} />} tone="sage" title={[fmtDate(s.date), s.with].filter(Boolean).join(' · ')} meta={[s.notes, s.homework && `To try: ${s.homework}`].filter(Boolean).join(' · ')} end={p.isMe ? <button aria-label="Delete" onClick={() => attempt(() => removeSession({ id: s._id }))} className="text-white/25"><Trash2 size={14} /></button> : undefined} />)}</List>
                ) : (
                  <Note>Notes and things to try between sessions, kept just for you.</Note>
                )}
              </Section>
            )}
          </div>
        );
      })}
      <List>
        <Row title="What your partner sees" meta="Nothing by default. Change it in Share." onClick={() => goToTab('health-share')} />
      </List>
      <div className="flex flex-col gap-1.5 rounded-3xl bg-nothing-purple/10 p-4">
        <span className="text-[15px]">Need to talk to someone now?</span>
        <span className="text-sm text-white/65">Tele-MANAS, free and 24×7 in India: <b className="font-mono">14416</b> or <b className="font-mono">1-800-891-4416</b></span>
      </div>
      <Checkin kind={check} onClose={() => setCheck(null)} />
      <SessionSheet open={session} onClose={() => setSession(false)} />
    </Screen>
  );
};

function Checkin({ kind, onClose }: { kind: 'phq9' | 'gad7' | null; onClose: () => void }) {
  const add = useMutation(api.health.mind.addCheckin);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const qs = kind === 'phq9' ? PHQ9 : GAD7;
  React.useEffect(() => setAnswers(kind ? qs.map(() => null) : []), [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kind) return null;
  const done = answers.every((a) => a != null);
  return (
    <Sheet open onClose={onClose} title={kind === 'phq9' ? 'Over the last 2 weeks…' : 'Over the last 2 weeks…'}>
      <p className="text-sm text-white/55">How often have you been bothered by:</p>
      {qs.map((q, i) => (
        <div key={i} className="space-y-2">
          <p className="text-[15px]">{i + 1}. {q}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {OPTIONS.map((o, v) => (
              <button key={o} type="button" onClick={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))} className={cx('rounded-2xl px-3 py-2 text-left text-xs', answers[i] === v ? 'bg-white text-black' : 'glass')}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <Btn disabled={!done} onClick={async () => {
        const res = await attempt(() => add({ kind, answers: answers as number[] }));
        if (!res) return;
        onClose();
        await noticeDialog(`Score ${res.score}: ${res.band}`, res.selfHarm
          ? 'You mentioned thoughts of being better off dead or hurting yourself. Please talk to someone today: Tele-MANAS 14416 is free and open all day, or tell your partner or a doctor.'
          : res.score >= 10 ? 'That is worth talking to a doctor or counsellor about. You can share this score with them.' : 'Saved. Check in again in two weeks.');
      }}>See my score</Btn>
      <Note>These are standard screening questionnaires, not a diagnosis.</Note>
    </Sheet>
  );
}

function SessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useMutation(api.health.mind.addSession);
  const [date, setDate] = useState(todayStr());
  const [w, setW] = useState('');
  const [notes, setNotes] = useState('');
  const [hw, setHw] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Therapy session">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="With"><Input value={w} onChange={(e) => setW(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="To try before next time"><Input value={hw} onChange={(e) => setHw(e.target.value)} /></Field>
      <Btn onClick={async () => { const ok = await attempt(() => add({ date, with: w, notes, homework: hw })); if (ok) { setNotes(''); setHw(''); onClose(); } }}>Save</Btn>
    </Sheet>
  );
}

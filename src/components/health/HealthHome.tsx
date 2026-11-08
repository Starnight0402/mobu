import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, BookOpen, Brain, Check, Contact, FileText, FlaskConical, Flower2, Footprints, HandHeart, HeartPulse,
  Moon, Pill, Plus, Scale, Search, Share2, ShieldCheck, SlidersHorizontal, Stethoscope, Syringe, Thermometer, Droplet,
  CalendarPlus, FilePlus,
} from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import { goToTab } from '../../lib/navigation';
import { haptic } from '../../lib/haptics';
import { setHealthIntent } from '../../lib/healthIntent';
import { Av, Card, cx, IconBtn, List, Note, PersonSwitch, Pill as Tag, Screen, Section, Sheet, Tile, Tiles, Tone, usePeople, useWho, fmtNum, attempt, fmtWhen } from './ui';

const MODULES: { tab: string; label: string; icon: LucideIcon; tint: string }[] = [
  { tab: 'health-records', label: 'Records', icon: FileText, tint: 'text-nothing-purple' },
  { tab: 'health-labs', label: 'Lab results', icon: FlaskConical, tint: 'text-coral' },
  { tab: 'health-vitals', label: 'Vitals & body', icon: Activity, tint: 'text-sage' },
  { tab: 'health-meds', label: 'Medicines', icon: Pill, tint: 'text-gold' },
  { tab: 'health-visits', label: 'Visits & doctors', icon: Stethoscope, tint: 'text-azure' },
  { tab: 'health-prevention', label: 'Prevention', icon: Syringe, tint: 'text-sage' },
  { tab: 'health-symptoms', label: 'Symptoms', icon: Thermometer, tint: 'text-coral' },
  { tab: 'health-care', label: 'Care mode', icon: HandHeart, tint: 'text-coral' },
  { tab: 'health-medid', label: 'Medical ID', icon: Contact, tint: 'text-coral' },
  { tab: 'health-history', label: 'History', icon: BookOpen, tint: 'text-nothing-purple' },
  { tab: 'health-cycle', label: 'Cycle', icon: Flower2, tint: 'text-coral' },
  { tab: 'health-mind', label: 'Mind', icon: Brain, tint: 'text-nothing-purple' },
  { tab: 'health-insurance', label: 'Insurance', icon: ShieldCheck, tint: 'text-azure' },
  { tab: 'health-share', label: 'Share & export', icon: Share2, tint: 'text-gold' },
  { tab: 'health-settings', label: 'Health settings', icon: SlidersHorizontal, tint: 'text-white/60' },
];

export const ADD_HEALTH: { label: string; icon: LucideIcon; tab: string; intent?: string }[] = [
  { label: 'Report', icon: FilePlus, tab: 'health-records', intent: 'upload' },
  { label: 'Reading', icon: Activity, tab: 'health-vitals', intent: 'log' },
  { label: 'Medicine', icon: Pill, tab: 'health-meds', intent: 'add' },
  { label: 'Symptom', icon: Thermometer, tab: 'health-symptoms', intent: 'log' },
  { label: 'Appointment', icon: CalendarPlus, tab: 'health-visits', intent: 'add' },
  { label: 'Vaccine', icon: Syringe, tab: 'health-prevention', intent: 'vaccine' },
];

export function openHealth(tab: string, intent?: string) {
  if (intent) setHealthIntent(tab, intent);
  goToTab(tab);
}

export const HealthHome: React.FC = () => {
  const [who] = useWho();
  const { meName, partnerName, isMe } = usePeople();
  const summary = useQuery(api.health.summary.today);
  const vitals = useQuery(api.health.vitals.latest, { who });
  const logDose = useMutation(api.health.meds.logDose);
  const unlogDose = useMutation(api.health.meds.unlogDose);
  const [adding, setAdding] = useState(false);

  const show = (mine: boolean) => who === 'both' || (who === 'me') === mine;
  const attention = (summary?.attention ?? []).filter((a) => show(a.isMe) || ('both' in a && a.both));
  const doses = (summary?.doses ?? []).filter((d) => show(d.isMe));
  const taken = doses.filter((d) => d.status === 'taken').length;

  const toggleDose = async (d: (typeof doses)[number]) => {
    if (!d.isMe) return;
    haptic(d.status === 'taken' ? 'toggleOff' : 'success');
    await attempt(() =>
      d.status === 'taken' ? unlogDose({ medId: d.medId, slot: d.slot }) : logDose({ medId: d.medId, slot: d.slot, status: 'taken' }),
    );
  };

  return (
    <Screen
      title="Health"
      sub="Both of us, in one place"
      back={null}
      actions={
        <>
          <IconBtn icon={Search} label="Search records" onClick={() => openHealth('health-records', 'search')} />
          <IconBtn icon={Plus} label="Add" primary onClick={() => setAdding(true)} />
        </>
      }
    >
      <PersonSwitch />

      {attention.length > 0 && (
        <Section title={<>Needs attention <span className="font-mono">{attention.length}</span></>}>
          <List>
            {attention.slice(0, 8).map((a) => (
              <button key={a.key} type="button" onClick={() => goToTab(a.tab)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                {'both' in a && a.both ? (
                  <span className="flex"><Av isMe name={meName} /><span className="-ml-1.5"><Av isMe={false} name={partnerName} /></span></span>
                ) : (
                  <Av isMe={a.isMe} name={a.isMe ? meName : partnerName} />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] leading-snug">{a.title}</span>
                  {a.detail && <span className="text-xs text-white/45">{a.detail}</span>}
                </span>
                <Tag tone={a.tone as Tone}>{a.label}</Tag>
              </button>
            ))}
          </List>
        </Section>
      )}

      <Section title={<>Today's medicines {doses.length > 0 && <span className="font-mono">{taken} of {doses.length}</span>}</>} action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => goToTab('health-meds')}>All</button>}>
        {doses.length ? (
          <List>
            {doses.map((d) => (
              <button key={`${d.medId}${d.slot}`} type="button" onClick={() => toggleDose(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-label={`${d.name} at ${d.hm}`}>
                <span className="w-11 shrink-0 font-mono text-xs text-white/45">{d.hm}</span>
                <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]', d.status === 'taken' ? 'border-sage bg-sage text-nothing-black' : d.status === 'skipped' ? 'border-dashed border-white/30' : d.status === 'late' ? 'border-coral' : 'border-white/25')}>
                  {d.status === 'taken' && <Check size={14} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cx('text-[15px]', d.status === 'taken' && 'text-white/40 line-through decoration-white/25')}>{d.name}{d.strength ? ` ${d.strength}` : ''}</span>
                  <span className="text-xs text-white/45">{d.status === 'late' ? 'Not marked yet' : d.status === 'skipped' ? `Skipped${d.reason ? ` · ${d.reason}` : ''}` : d.instructions ?? (d.kind === 'supplement' ? 'Supplement' : '')}</span>
                </span>
                <Av isMe={d.isMe} size="sm" name={d.isMe ? meName : partnerName} />
              </button>
            ))}
          </List>
        ) : (
          <Card onClick={() => openHealth('health-meds', 'add')}>
            <span className="text-sm text-white/55">No doses scheduled today. Add a medicine to get reminders.</span>
          </Card>
        )}
      </Section>

      <Section title="Latest readings" action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => goToTab('health-vitals')}>All vitals</button>}>
        {(vitals ?? []).map((p) => {
          const l = p.latest;
          const tile = (label: string, value: React.ReactNode, unit: string | undefined, icon: LucideIcon, sub?: string) => (
            <Tile key={label} label={label} value={value} unit={unit} icon={icon as never} sub={sub} onClick={() => goToTab('health-vitals')} />
          );
          return (
            <div key={p.userId} className="space-y-2">
              {who === 'both' && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-white/45"><Av isMe={p.isMe} size="sm" name={isMe(p.userId) ? meName : partnerName} />{p.isMe ? 'Me' : partnerName}</p>
              )}
              <Tiles>
                {tile('BP', l.bp ? `${l.bp.value}/${l.bp.value2}` : '–', undefined, HeartPulse, l.bp ? fmtWhen(l.bp.time) : 'Not logged')}
                {tile('Resting HR', l.restingHr ? fmtNum(l.restingHr.value, 0) : '–', 'bpm', Activity)}
                {tile('Weight', l.weight ? fmtNum(l.weight.value) : '–', 'kg', Scale)}
                {tile('Sleep', l.sleep ? `${Math.floor(l.sleep.value)}h${String(Math.round((l.sleep.value % 1) * 60)).padStart(2, '0')}` : '–', undefined, Moon)}
                {tile('Steps', l.steps ? fmtNum(l.steps.value, 0) : '–', undefined, Footprints)}
                {tile('SpO₂', l.spo2 ? fmtNum(l.spo2.value, 0) : '–', '%', Droplet)}
              </Tiles>
            </div>
          );
        })}
        <Note>{vitals?.some((v) => v.healthConnectAt) ? `Health Connect synced ${fmtWhen(Math.max(...vitals.map((v) => v.healthConnectAt ?? 0)))}` : 'Connect Health Connect in Health settings to pull in your watch, BP monitor and glucometer.'}</Note>
      </Section>

      <Section title="Everything">
        <div className="grid grid-cols-3 gap-2">
          {MODULES.map((m) => (
            <button key={m.tab} type="button" onClick={() => goToTab(m.tab)} className="glass flex min-h-[86px] flex-col items-start gap-2.5 rounded-[20px] p-3 text-left">
              <m.icon size={18} className={m.tint} />
              <span className="text-[13px] leading-tight">{m.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Note>Mobu keeps and organises your records. It doesn't diagnose. Anything flagged here is something to bring up with your doctor.</Note>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to Health">
        <div className="grid grid-cols-3 gap-2">
          {ADD_HEALTH.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setAdding(false);
                openHealth(a.tab, a.intent);
              }}
              className="glass flex flex-col items-center gap-2 rounded-[18px] px-2 py-4 text-[13px]"
            >
              <a.icon size={20} className="text-nothing-purple" />
              {a.label}
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
};

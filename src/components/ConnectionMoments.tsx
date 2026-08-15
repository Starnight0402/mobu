import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Heart, Sparkles, Home, HandHeart, Gift, BookOpen } from 'lucide-react';
import { SERIES } from './ChatStatsDashboard';
import type { Episode } from './ConflictEpisodes';

const SIGNAL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'Building a life': Home,
  'Opening up': BookOpen,
  'Backing each other': HandHeart,
  'Looking after': Heart,
  'Gratitude': Gift,
};

const TOPIC_LABEL: Record<string, string> = {
  future: 'Building a life',
  vulnerability: 'Opening up',
  support: 'Backing each other',
  caretaking: 'Looking after',
  gratitude: 'Gratitude',
};

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const ConnectionMoments: React.FC<{ episodes: Episode[]; senders: string[] }> = ({
  episodes, senders,
}) => {
  const [open, setOpen] = useState<string | null>(null);

  if (episodes.length === 0) {
    return (
      <div className="glass p-6 text-center text-white/40 text-sm flex flex-col items-center gap-2">
        <Sparkles size={20} className="text-white/20" />
        No connection moments detected yet — import a longer stretch of chat.
      </div>
    );
  }

  const colorOf = (name?: string) => {
    const i = senders.indexOf(name ?? '');
    return i >= 0 ? SERIES[i] : 'rgba(255,255,255,0.25)';
  };

  // Which kinds of closeness happen most — the mirror of the fight topics.
  const signalCounts = new Map<string, number>();
  for (const e of episodes) {
    for (const s of e.context.signals ?? []) {
      signalCounts.set(s, (signalCounts.get(s) ?? 0) + 1);
    }
  }
  const signalRows = [...signalCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxSignal = Math.max(1, ...signalRows.map((r) => r[1]));

  const totalMessages = episodes.reduce((s, e) => s + e.messageCount, 0);
  const deepest = [...episodes].sort((a, b) => b.score - a.score)[0];
  const mutual = episodes.filter((e) => e.repaired).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat v={`${episodes.length}`} l="Deep moments" />
        <Stat v={totalMessages.toLocaleString()} l="Messages in them" />
        <Stat v={`${mutual}/${episodes.length}`} l="Both took part" />
        <Stat v={TOPIC_LABEL[deepest?.topic] ?? deepest?.topic ?? '—'} l="Deepest theme" small />
      </div>

      <div className="glass p-5 space-y-3">
        <h3 className="text-[10px] uppercase tracking-widest text-white/40">How you're close</h3>
        {signalRows.map(([sig, n]) => {
          const Icon = SIGNAL_ICONS[sig] ?? Sparkles;
          return (
            <div key={sig} className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11.5px] text-white/60 w-36 shrink-0">
                <Icon size={12} className="text-emerald-400/70 shrink-0" />
                <span className="truncate">{sig}</span>
              </span>
              <div className="flex-1 h-4 rounded-md bg-white/[0.04] overflow-hidden">
                <div className="h-full rounded-md bg-emerald-400/60" style={{ width: `${(n / maxSignal) * 100}%` }} />
              </div>
              <span className="text-[9.5px] font-mono text-white/40 w-8 text-right tabular-nums">{n}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono px-1">
          Every moment — tap to read it
        </div>
        {episodes.map((e) => {
          const isOpen = open === e._id;
          const hours = Math.max(1, Math.round((e.endedAt - e.startedAt) / 3600000));
          return (
            <motion.div key={e._id} layout className="glass overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : e._id)} className="w-full p-4 text-left space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full"
                        style={{ background: i <= e.severity ? '#34d399' : 'rgba(255,255,255,0.12)' }} />
                    ))}
                    <span className="text-[10px] font-mono text-white/40 ml-1">
                      {fmtDate(e.startedAt)} · {fmtTime(e.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
                      {hours}h · {e.messageCount} msgs
                    </span>
                    <ChevronDown size={14} className={`text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(e.context.signals ?? []).map((s) => {
                    const Icon = SIGNAL_ICONS[s] ?? Sparkles;
                    return (
                      <span key={s} className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/60">
                        <Icon size={9} /> {s}
                      </span>
                    );
                  })}
                </div>

                {!isOpen && e.excerpts[0] && (
                  <p className="text-[12.5px] text-white/55 leading-relaxed line-clamp-2">
                    "{e.excerpts[0].text.slice(0, 150)}…"
                  </p>
                )}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 pb-4 space-y-3"
                  >
                    <div className="space-y-2 border-t border-white/5 pt-3">
                      {e.excerpts.map((x, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider"
                            style={{ color: colorOf(x.sender) }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorOf(x.sender) }} />
                            {x.sender}
                            <span className="text-white/25">{fmtTime(x.at)}</span>
                          </div>
                          <p className="text-[12.5px] text-white/70 leading-relaxed pl-3 border-l border-emerald-400/25">
                            {x.text}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-4 border-t border-dashed border-white/10 pt-3">
                      <Ctx v={`${e.messageCount}`} l={`messages · ${e.context.volumeRatio}× your ${e.context.baseline}/day`} />
                      <Ctx v={`${hours}h`} l="unbroken stretch" />
                      {e.context.nextDayMessages !== null && (
                        <Ctx v={`${e.context.nextDayMessages}`} l="messages the day after" />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
        <Sparkles size={13} className="text-emerald-400/50 shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/40 leading-relaxed">
          These are stretches where you both talked at length, warmly, with no conflict in them —
          opening up, backing each other, planning a life, looking after each other. Same method as
          the Fights tab, opposite sign.
        </p>
      </div>
    </div>
  );
};

const Stat: React.FC<{ v: string; l: string; small?: boolean }> = ({ v, l, small }) => (
  <div className="glass p-3 flex flex-col gap-1">
    <div className={`font-display leading-tight ${small ? 'text-sm' : 'text-xl'} tabular-nums`}>{v}</div>
    <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{l}</div>
  </div>
);

const Ctx: React.FC<{ v: string; l: string }> = ({ v, l }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-xs tabular-nums text-white/80">{v}</span>
    <span className="text-[9px] text-white/30">{l}</span>
  </div>
);

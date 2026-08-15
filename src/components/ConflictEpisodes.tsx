import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Swords, AlertTriangle } from 'lucide-react';
import { SERIES } from './ChatStatsDashboard';

export interface Episode {
  kind?: 'conflict' | 'connection';
  _id: string;
  date: string;
  startedAt: number;
  endedAt: number;
  severity: number;
  topic?: string;
  score: number;
  openedBy?: string;
  closedBy?: string;
  repaired: boolean;
  excerpts: Array<{ sender: string; text: string; at: number }>;
  context: {
    days: number;
    messagesInEpisode: number;
    peakDayMessages: number;
    baseline: number;
    volumeRatio: number;
    longestGapHours: number;
    nextDayMessages: number | null;
    toneDrop?: number;
    signals?: string[];
  };
}

const TOPIC_LABEL: Record<string, string> = {
  trust: 'Trust & secrecy',
  communication: 'How we talk',
  attention: 'Attention & replies',
  family: 'Family & future',
  money: 'Money & career',
  plans: 'Plans & logistics',
  distance: 'Being apart',
  other: 'Other',
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const ConflictEpisodes: React.FC<{ episodes: Episode[]; senders: string[] }> = ({
  episodes, senders,
}) => {
  const [open, setOpen] = useState<string | null>(null);

  if (episodes.length === 0) {
    return (
      <div className="glass p-6 text-center text-white/40 text-sm flex flex-col items-center gap-2">
        <Swords size={20} className="text-white/20" />
        No conflict episodes detected in this chat.
      </div>
    );
  }

  const colorOf = (name?: string) => {
    const i = senders.indexOf(name ?? '');
    return i >= 0 ? SERIES[i] : 'rgba(255,255,255,0.25)';
  };

  // Topic rollup — count and average severity, so a theme that's rare but
  // heavy doesn't hide behind one that's frequent and trivial.
  const topics = new Map<string, { n: number; sev: number }>();
  for (const e of episodes) {
    const k = e.topic ?? 'other';
    const cur = topics.get(k) ?? { n: 0, sev: 0 };
    topics.set(k, { n: cur.n + 1, sev: cur.sev + e.severity });
  }
  const topicRows = [...topics.entries()]
    .map(([k, v]) => ({ k, n: v.n, avg: v.sev / v.n }))
    .sort((a, b) => b.n - a.n || b.avg - a.avg);
  const maxN = Math.max(...topicRows.map((t) => t.n));
  const heaviest = [...topicRows].sort((a, b) => b.avg - a.avg)[0];
  const unrepaired = episodes.filter((e) => !e.repaired).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat v={`${episodes.length}`} l="Episodes found" />
        <Stat v={`${(episodes.reduce((s, e) => s + e.severity, 0) / episodes.length).toFixed(1)}/5`} l="Avg severity" />
        <Stat v={`${episodes.length - unrepaired}/${episodes.length}`} l="Ended in repair" />
        <Stat v={TOPIC_LABEL[heaviest?.k] ?? '—'} l="Heaviest theme" small />
      </div>

      <div className="glass p-5 space-y-3">
        <h3 className="text-[10px] uppercase tracking-widest text-white/40">What they're about</h3>
        {topicRows.map((t) => (
          <div key={t.k} className="flex items-center gap-3">
            <span className="text-[11.5px] text-white/60 w-28 shrink-0 truncate">{TOPIC_LABEL[t.k] ?? t.k}</span>
            <div className="flex-1 h-4 rounded-md bg-white/[0.04] overflow-hidden">
              <div className="h-full rounded-md bg-red-400/70" style={{ width: `${(t.n / maxN) * 100}%` }} />
            </div>
            <span className="text-[9.5px] font-mono text-white/40 w-20 text-right tabular-nums">
              {t.n} · sev {t.avg.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono px-1">
          Every episode — tap to read what was said
        </div>
        {episodes.map((e) => {
          const isOpen = open === e._id;
          return (
            <motion.div key={e._id} layout className="glass overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : e._id)}
                className="w-full p-4 text-left space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full"
                        style={{ background: i <= e.severity ? '#f87171' : 'rgba(255,255,255,0.12)' }} />
                    ))}
                    <span className="text-[10px] font-mono text-white/40 ml-1">
                      {fmtDate(e.date)}{e.context.days > 1 ? ` · ${e.context.days} days` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
                      e.repaired
                        ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                        : 'text-red-400 border-red-400/30 bg-red-400/10'
                    }`}>
                      {e.repaired ? 'Repaired' : 'No repair'}
                    </span>
                    <ChevronDown size={14} className={`text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/60">
                    {TOPIC_LABEL[e.topic ?? 'other'] ?? e.topic}
                  </span>
                  {e.openedBy && (
                    <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorOf(e.openedBy) }} />
                      Opened by {e.openedBy}
                    </span>
                  )}
                  {e.closedBy && (
                    <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorOf(e.closedBy) }} />
                      Closed by {e.closedBy}
                    </span>
                  )}
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
                            <span className="text-white/25">
                              {new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[12.5px] text-white/70 leading-relaxed pl-3 border-l border-white/10">
                            {x.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-4 border-t border-dashed border-white/10 pt-3">
                      <Ctx v={`${e.context.messagesInEpisode}`}
                        l={`messages · ${e.context.volumeRatio}× your ${e.context.baseline}/day`}
                        down={e.context.volumeRatio < 0.8} />
                      <Ctx v={`${e.context.longestGapHours}h`} l="longest silence"
                        down={e.context.longestGapHours > 8} />
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

      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <AlertTriangle size={13} className="text-white/25 shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/35 leading-relaxed">
          Episodes are detected from the chat by looking for long back-and-forth messages and
          serious phrasing. It's a heuristic — it can miss things settled in person or on a call,
          and occasionally flags an intense conversation that wasn't a fight.
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

const Ctx: React.FC<{ v: string; l: string; down?: boolean }> = ({ v, l, down }) => (
  <div className="flex flex-col gap-0.5">
    <span className={`font-mono text-xs tabular-nums ${down ? 'text-red-400' : 'text-white/80'}`}>{v}</span>
    <span className="text-[9px] text-white/30">{l}</span>
  </div>
);

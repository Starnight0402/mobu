import React from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { motion } from 'motion/react';
import { MessageSquare, Clock, Flame, Moon, Zap, Image as ImageIcon } from 'lucide-react';

/** Mirrors ChatStats in convex/chatAnalysis.ts (stored as a JSON string). */
export interface ChatStats {
  totalMessages: number;
  dateRange: { start: number; end: number };
  daysCovered: number;
  spanDays: number;
  avgPerDay: number;
  senders: string[];
  bySender: Record<string, {
    messages: number; words: number; media: number;
    avgMessageLength: number; questionRate: number; longMessages: number;
  }>;
  dailyCounts: Array<Record<string, number | string>>;
  weeklyCounts: Array<Record<string, number | string>>;
  monthlyCounts: Array<Record<string, number | string>>;
  hourlyHeatmap: number[][];
  responseTimes: Record<string, { avgMinutes: number; medianMinutes: number; samples: number }>;
  streaks: { longest: number; current: number };
  longestSilence: { hours: number; start: number; end: number };
  initiations: Record<string, number>;
  doubleTexts: Record<string, number>;
  topWords: Record<string, Array<[string, number]>>;
  topEmojis: Array<[string, number]>;
  mediaCount: number;
}

// Two-series categorical palette, validated for colour-vision deficiency
// against this app's black surface (worst-pair ΔE 31 deutan / 30 normal).
export const SERIES = ['#a855f7', '#d95926'];

const AXIS = { stroke: '#666', fontSize: 10, tickLine: false, axisLine: false } as const;
const TOOLTIP = {
  contentStyle: { backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' },
  itemStyle: { color: '#fff' },
  labelStyle: { color: '#888', fontSize: 11 },
} as const;

const fmt = (n: number) => n.toLocaleString();
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const Card: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode; delay?: number }> = ({
  title, right, children, delay = 0,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="glass p-5 space-y-4"
  >
    {(title || right) && (
      <div className="flex items-baseline justify-between gap-3">
        {title && <h3 className="text-[10px] uppercase tracking-widest text-white/40">{title}</h3>}
        {right}
      </div>
    )}
    {children}
  </motion.div>
);

const Legend2: React.FC<{ senders: string[] }> = ({ senders }) => (
  <div className="flex gap-3">
    {senders.map((s, i) => (
      <span key={s} className="flex items-center gap-1.5 text-[11px] text-white/60">
        <span className="w-2 h-2 rounded-sm" style={{ background: SERIES[i] }} />
        {s}
      </span>
    ))}
  </div>
);

export const ChatStatsDashboard: React.FC<{ stats: ChatStats }> = ({ stats }) => {
  const { senders } = stats;
  const tiles = [
    { icon: MessageSquare, v: fmt(stats.totalMessages), l: 'Messages' },
    { icon: Zap, v: fmt(stats.avgPerDay), l: 'Avg / day' },
    { icon: Clock, v: `${stats.daysCovered}`, l: 'Days covered' },
    { icon: Flame, v: `${stats.streaks.longest}`, l: 'Longest streak' },
    { icon: Moon, v: `${Math.round(stats.longestSilence.hours)}h`, l: 'Longest silence' },
    { icon: ImageIcon, v: fmt(stats.mediaCount), l: 'Media shared' },
  ];

  // Weekly is the readable default: daily is noisy past a couple of months and
  // the backend pre-aggregates both, so this costs nothing.
  const volume = stats.weeklyCounts.map((r) => ({ ...r, label: shortDate(new Date(String(r.weekStart)).getTime()) }));

  const balance = [
    { metric: 'Messages', ...Object.fromEntries(senders.map((s) => [s, stats.bySender[s].messages])) },
    { metric: 'Words', ...Object.fromEntries(senders.map((s) => [s, stats.bySender[s].words])) },
    { metric: 'Media', ...Object.fromEntries(senders.map((s) => [s, stats.bySender[s].media])) },
    { metric: 'Started', ...Object.fromEntries(senders.map((s) => [s, stats.initiations[s]])) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.l}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass p-3 flex flex-col gap-1.5"
            >
              <Icon size={13} className="text-white/30" />
              <div className="font-display text-xl tabular-nums leading-none">{t.v}</div>
              <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{t.l}</div>
            </motion.div>
          );
        })}
      </div>

      <Card title="Messages over time" right={<Legend2 senders={senders} />} delay={0.05}>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volume}>
              <defs>
                {senders.map((s, i) => (
                  <linearGradient key={s} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES[i]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={SERIES[i]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip {...TOOLTIP} />
              {senders.map((s, i) => (
                <Area key={s} type="monotone" dataKey={s} stroke={SERIES[i]} strokeWidth={2}
                  fill={`url(#g${i})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Who texts more" right={<Legend2 senders={senders} />} delay={0.1}>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={balance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="metric" {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              {senders.map((s, i) => (
                <Bar key={s} dataKey={s} fill={SERIES[i]} radius={[6, 6, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {senders.map((s, i) => {
            const b = stats.bySender[s];
            const r = stats.responseTimes[s];
            return (
              <div key={s} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5"
                style={{ borderLeft: `3px solid ${SERIES[i]}` }}>
                <div className="text-sm font-display">{s}</div>
                <Row l="Replies in" v={`${r.medianMinutes}m median`} />
                <Row l="Asks questions" v={`${(b.questionRate * 100).toFixed(1)}%`} />
                <Row l="Avg length" v={`${b.avgMessageLength} chars`} />
                <Row l="Long messages" v={`${b.longMessages}`} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="When you talk" right={<span className="text-[10px] text-white/30 font-mono">HOUR × DAY</span>} delay={0.15}>
        <Heatmap grid={stats.hourlyHeatmap} />
      </Card>

      <Card title="Words & emoji" delay={0.2}>
        <div className="grid sm:grid-cols-2 gap-5">
          {senders.map((s, i) => (
            <div key={s} className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <span className="w-2 h-2 rounded-sm" style={{ background: SERIES[i] }} />
                {s} says most
              </div>
              {stats.topWords[s].slice(0, 8).map(([w, n]) => {
                const max = stats.topWords[s][0]?.[1] || 1;
                return (
                  <div key={w} className="flex items-center gap-2">
                    <span className="text-[11px] text-white/60 w-16 shrink-0 truncate">{w}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: SERIES[i] }} />
                    </div>
                    <span className="text-[10px] text-white/30 font-mono w-8 text-right tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {stats.topEmojis.slice(0, 10).map(([e, n]) => (
            <span key={e} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-sm">
              {e}<span className="text-[10px] text-white/40 font-mono tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
};

const Row: React.FC<{ l: string; v: string }> = ({ l, v }) => (
  <div className="flex justify-between text-[11px]">
    <span className="text-white/40">{l}</span>
    <span className="text-white/80 tabular-nums">{v}</span>
  </div>
);

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Hand-rolled: recharts has no heatmap primitive worth bending into shape. */
const Heatmap: React.FC<{ grid: number[][] }> = ({ grid }) => {
  const max = Math.max(1, ...grid.flat());
  const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px] space-y-1">
        {grid.map((row, d) => (
          <div key={d} className="grid gap-[3px]" style={{ gridTemplateColumns: '18px repeat(24, 1fr)' }}>
            <div className="text-[8px] text-white/25 font-mono flex items-center">{DAYS[d]}</div>
            {row.map((v, h) => (
              <div
                key={h}
                title={`${DAY_NAMES[d]} ${hourLabel(h)} — ${v} messages`}
                className="aspect-square rounded-[3px]"
                style={{ background: SERIES[0], opacity: v === 0 ? 0.05 : 0.12 + (v / max) * 0.88 }}
              />
            ))}
          </div>
        ))}
        <div className="grid gap-[3px] pt-0.5" style={{ gridTemplateColumns: '18px repeat(24, 1fr)' }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-[7px] text-white/25 font-mono text-center">
              {h % 3 === 0 ? hourLabel(h) : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

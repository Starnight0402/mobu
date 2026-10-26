import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Trophy, Receipt, Calendar } from 'lucide-react';
import { formatMoney } from '../lib/currency';

/** The slice of an expense row the analytics needs. */
export interface AnalyticsExpense {
  _id: string;
  amount: number;
  currency: string;
  category: string;
  note?: string;
  spentAt: number;
  paidByMe: boolean;
  splitRatio: number; // the payer's share, 0-100
}

type Mode = 'month' | 'year' | 'all';

const MODES: { id: Mode; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

// Category bar colours, from the app palette.
const BAR_COLORS = ['#c3a6ff', '#ff8f7e', '#9ed9b6', '#f2c879', '#8fc1ff', '#e29bd0', '#7fd6d1', '#b3a8b1'];

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const sum = (rows: AnalyticsExpense[]) => rows.reduce((s, e) => s + e.amount, 0);

/** What this person's share of an expense actually is (the payer's share is splitRatio). */
const myShare = (e: AnalyticsExpense) => (e.paidByMe ? e.amount * (e.splitRatio / 100) : e.amount * ((100 - e.splitRatio) / 100));

interface Range {
  from: number;
  to: number; // exclusive
  label: string;
}

function rangeFor(mode: Mode, year: number, month: number, all: AnalyticsExpense[]): Range {
  if (mode === 'month') {
    return {
      from: new Date(year, month, 1).getTime(),
      to: new Date(year, month + 1, 1).getTime(),
      label: new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }
  if (mode === 'year') {
    return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime(), label: String(year) };
  }
  const first = all.length ? Math.min(...all.map((e) => e.spentAt)) : Date.now();
  return { from: first, to: Date.now() + 1, label: 'Everything so far' };
}

function previousRange(mode: Mode, year: number, month: number): Range | null {
  if (mode === 'month') {
    const d = new Date(year, month - 1, 1);
    return rangeFor('month', d.getFullYear(), d.getMonth(), []);
  }
  if (mode === 'year') return rangeFor('year', year - 1, 0, []);
  return null;
}

export const AnalyticsView: React.FC<{
  expenses: AnalyticsExpense[];
  partnerName: string;
  defaultCurrency: string;
  categoryIcon: (category: string) => React.ComponentType<{ size?: number; className?: string }>;
}> = ({ expenses, partnerName, defaultCurrency, categoryIcon: CategoryIcon }) => {
  const now = new Date();
  const [mode, setMode] = useState<Mode>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Totals never mix currencies: pick one at a time, defaulting to the one spent most.
  const currencies = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [expenses]);
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked && currencies.includes(picked) ? picked : (currencies[0] ?? defaultCurrency);

  const inCurrency = useMemo(() => expenses.filter((e) => e.currency === currency), [expenses, currency]);
  const range = rangeFor(mode, year, month, inCurrency);
  const rows = useMemo(
    () => inCurrency.filter((e) => e.spentAt >= range.from && e.spentAt < range.to),
    [inCurrency, range.from, range.to],
  );

  const prev = previousRange(mode, year, month);
  const prevTotal = prev ? sum(inCurrency.filter((e) => e.spentAt >= prev.from && e.spentAt < prev.to)) : null;
  const total = sum(rows);

  const atPresent = mode === 'month' ? year === now.getFullYear() && month === now.getMonth() : year === now.getFullYear();
  const earliestYear = inCurrency.length ? new Date(Math.min(...inCurrency.map((e) => e.spentAt))).getFullYear() : year;
  const canGoBack = mode === 'month' ? true : year > earliestYear;

  const step = (dir: -1 | 1) => {
    if (mode === 'month') {
      const d = new Date(year, month + dir, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    } else if (mode === 'year') {
      setYear((y) => y + dir);
    }
  };

  // ---- derived numbers ----
  const paidByMe = sum(rows.filter((e) => e.paidByMe));
  const paidByThem = total - paidByMe;
  const myCost = rows.reduce((s, e) => s + myShare(e), 0);
  const theirCost = total - myCost;

  const dayCount = Math.max(
    1,
    Math.round(((mode === 'all' ? Date.now() : Math.min(range.to, Date.now())) - range.from) / 86_400_000),
  );
  const perDay = total / dayCount;
  const perMonth = mode === 'all' || mode === 'year' ? total / Math.max(1, dayCount / 30.44) : null;

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.category || 'Other', (map.get(e.category || 'Other') ?? 0) + e.amount);
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    return rest > 0 ? [...top, ['Other', rest] as [string, number]] : top;
  }, [rows]);

  const biggest = rows.reduce<AnalyticsExpense | null>((b, e) => (!b || e.amount > b.amount ? e : b), null);

  // Bars: days of the month, months of the year, or the last 12 months for all-time.
  const bars = useMemo(() => {
    if (mode === 'month') {
      const days = new Date(year, month + 1, 0).getDate();
      const values = Array.from({ length: days }, () => 0);
      for (const e of rows) values[new Date(e.spentAt).getDate() - 1] += e.amount;
      return values.map((value, i) => ({ value, label: String(i + 1), tick: i === 0 || (i + 1) % 5 === 0 }));
    }
    if (mode === 'year') {
      const values = Array.from({ length: 12 }, () => 0);
      for (const e of rows) values[new Date(e.spentAt).getMonth()] += e.amount;
      return values.map((value, i) => ({
        value,
        label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }),
        tick: true,
      }));
    }
    const out: { value: number; label: string; tick: boolean }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = d.getTime();
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      out.push({
        value: sum(inCurrency.filter((e) => e.spentAt >= from && e.spentAt < to)),
        label: d.toLocaleDateString(undefined, { month: 'narrow' }),
        tick: true,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, year, month, rows, inCurrency]);
  const maxBar = Math.max(...bars.map((b) => b.value), 1);

  const change = prevTotal != null && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const paidPct = total > 0 ? (paidByMe / total) * 100 : 50;

  if (expenses.length === 0) {
    return (
      <div className="glass flex flex-col items-center gap-2 p-10 text-center">
        <Receipt size={28} className="text-white/30" />
        <p className="font-display text-lg">Nothing to analyse yet</p>
        <p className="text-sm text-white/50">Add your first expense and the numbers show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Period" className="flex rounded-full border border-white/10 bg-surface p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`h-9 flex-1 rounded-full text-[13px] transition-colors ${
              mode === m.id ? 'bg-white font-semibold text-black' : 'text-white/60'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        {mode === 'all' ? (
          <p className="font-display text-lg">{range.label}</p>
        ) : (
          <>
            <button
              onClick={() => step(-1)}
              disabled={!canGoBack}
              aria-label="Previous"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="font-display text-lg">{range.label}</p>
            <button
              onClick={() => step(1)}
              disabled={atPresent}
              aria-label="Next"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {currencies.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Currency">
          {currencies.map((c) => (
            <button
              key={c}
              onClick={() => setPicked(c)}
              aria-pressed={c === currency}
              className={`h-9 rounded-full px-4 text-[13px] ${
                c === currency ? 'bg-nothing-purple font-semibold text-black' : 'border border-white/10 bg-surface text-white/60'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Total */}
      <section className="glass space-y-3 p-6">
        <p className="text-sm text-white/60">Together we spent</p>
        <p className="font-display text-5xl font-medium tracking-tight">{formatMoney(total, currency)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
          <span>
            {rows.length} expense{rows.length === 1 ? '' : 's'}
          </span>
          {perMonth != null ? (
            <span>{formatMoney(perMonth, currency)} / month</span>
          ) : (
            <span>{formatMoney(perDay, currency)} / day</span>
          )}
          {change != null && (
            <span className={`flex items-center gap-1 ${change > 0 ? 'text-coral' : 'text-sage'}`}>
              {change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(change).toFixed(0)}% {change > 0 ? 'more' : 'less'} than {mode === 'month' ? 'last month' : 'last year'}
            </span>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-white/50">No expenses in this period.</div>
      ) : (
        <>
          {/* Trend */}
          <section className="glass space-y-3 p-5">
            <h2 className="font-display text-lg">{mode === 'month' ? 'Day by day' : mode === 'year' ? 'Month by month' : 'Last 12 months'}</h2>
            <div role="img" aria-label="Spending over time" className="flex h-32 items-end gap-[3px]">
              {bars.map((b, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t-[4px] bg-nothing-purple/80"
                    style={{ height: b.value > 0 ? `${Math.max(4, (b.value / maxBar) * 100)}%` : '2px', opacity: b.value > 0 ? 1 : 0.25 }}
                    title={`${b.label}: ${formatMoney(b.value, currency)}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] text-[10px] text-white/50">
              {bars.map((b, i) => (
                <span key={i} className="min-w-0 flex-1 text-center">
                  {b.tick ? b.label : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-white/50">Biggest {mode === 'month' ? 'day' : 'month'}: {formatMoney(maxBar, currency)}</p>
          </section>

          {/* Who */}
          <section className="glass space-y-4 p-5">
            <h2 className="font-display text-lg">Who paid, and whose it was</h2>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span>You paid {formatMoney(paidByMe, currency)}</span>
                <span>
                  {partnerName} paid {formatMoney(paidByThem, currency)}
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Share of payments">
                <div className="h-full bg-nothing-purple" style={{ width: `${paidPct}%` }} />
                <div className="h-full bg-coral" style={{ width: `${100 - paidPct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-xs text-white/50">Your share</p>
                <p className="font-display text-xl">{formatMoney(myCost, currency)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-xs text-white/50">{partnerName}'s share</p>
                <p className="font-display text-xl">{formatMoney(theirCost, currency)}</p>
              </div>
            </div>
          </section>

          {/* Categories */}
          <section className="glass space-y-3.5 p-5">
            <h2 className="font-display text-lg">Where it went</h2>
            {categories.map(([name, value], i) => {
              const Icon = CategoryIcon(name);
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon size={15} className="shrink-0 text-white/60" />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="shrink-0 text-white/70">
                      {formatMoney(value, currency)} <span className="text-white/40">· {pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </section>

          {/* Highlights */}
          <section className="grid grid-cols-2 gap-3">
            {biggest && (
              <div className="glass space-y-1 p-4">
                <p className="flex items-center gap-1.5 text-xs text-white/50">
                  <Trophy size={13} className="text-gold" /> Biggest expense
                </p>
                <p className="font-display text-xl">{formatMoney(biggest.amount, currency)}</p>
                <p className="truncate text-xs text-white/60">{biggest.note || biggest.category}</p>
              </div>
            )}
            <div className="glass space-y-1 p-4">
              <p className="flex items-center gap-1.5 text-xs text-white/50">
                <Calendar size={13} className="text-nothing-purple" /> Average expense
              </p>
              <p className="font-display text-xl">{formatMoney(total / rows.length, currency)}</p>
              <p className="text-xs text-white/60">
                across {rows.length} expense{rows.length === 1 ? '' : 's'}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

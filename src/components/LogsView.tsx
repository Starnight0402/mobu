import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { formatMoney } from '../lib/currency';
import {
  Search,
  Wallet,
  Smile,
  Activity,
  Coffee,
  Heart,
  MapPin,
  X,
  Trash2,
  Pencil,
  ScrollText,
} from 'lucide-react';

type LogEntry = {
  id: string;
  kind: 'tracking' | 'expense';
  type: 'money' | 'mood' | 'health' | 'food' | 'activity' | 'location';
  value: number;
  category?: string;
  note?: string;
  user: string;
  at: number;
  currency: string | null;
  editable: boolean;
};

const TYPE_META = {
  money: { icon: Wallet, label: 'Money', tint: 'text-emerald-400' },
  mood: { icon: Smile, label: 'Mood', tint: 'text-yellow-400' },
  activity: { icon: Activity, label: 'Activity', tint: 'text-sky-400' },
  food: { icon: Coffee, label: 'Food', tint: 'text-orange-400' },
  health: { icon: Heart, label: 'Health', tint: 'text-rose-400' },
  location: { icon: MapPin, label: 'Check-in', tint: 'text-nothing-purple' },
} as const;

const TYPE_ORDER = ['money', 'mood', 'activity', 'food', 'health', 'location'] as const;

function dayLabel(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function describeValue(entry: LogEntry) {
  switch (entry.type) {
    case 'money':
      return formatMoney(entry.value, entry.currency ?? 'USD');
    case 'mood':
      return `${entry.value}/10`;
    case 'location':
      return 'Checked in';
    default:
      return entry.category || TYPE_META[entry.type].label;
  }
}

export const LogsView: React.FC = () => {
  const feed = (useQuery(api.tracking.feed, {}) ?? []) as LogEntry[];
  const removeTracking = useMutation(api.tracking.remove);
  const removeExpense = useMutation(api.expenses.remove);

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const people = useMemo(
    () => [...new Set(feed.map((e) => e.user))].filter(Boolean).sort(),
    [feed],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return feed.filter((entry) => {
      if (typeFilter && entry.type !== typeFilter) return false;
      if (personFilter && entry.user !== personFilter) return false;
      if (!needle) return true;
      return (
        (entry.category ?? '').toLowerCase().includes(needle) ||
        (entry.note ?? '').toLowerCase().includes(needle) ||
        entry.user.toLowerCase().includes(needle)
      );
    });
  }, [feed, typeFilter, personFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const entry of filtered) {
      const key = dayLabel(entry.at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return [...map.entries()];
  }, [filtered]);

  const handleDelete = async (entry: LogEntry) => {
    if (entry.kind === 'expense') {
      await removeExpense({ id: entry.id as Id<'expenses'> });
    } else {
      await removeTracking({ id: entry.id as Id<'tracking'> });
    }
    setSelected(null);
  };

  return (
    <div className="space-y-5 pb-32">
      <header className="space-y-1">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Logs</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">
          {feed.length} entries · everything you've both tracked
        </p>
      </header>

      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes, categories, people…"
          className="nothing-input w-full pl-11 text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <Chip active={!typeFilter} onClick={() => setTypeFilter(null)} label="All" />
        {TYPE_ORDER.map((type) => {
          const Icon = TYPE_META[type].icon;
          return (
            <Chip
              key={type}
              active={typeFilter === type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              label={TYPE_META[type].label}
              icon={<Icon size={13} />}
            />
          );
        })}
      </div>

      {people.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <Chip active={!personFilter} onClick={() => setPersonFilter(null)} label="Everyone" />
          {people.map((person) => (
            <Chip
              key={person}
              active={personFilter === person}
              onClick={() => setPersonFilter(personFilter === person ? null : person)}
              label={person}
            />
          ))}
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 px-6 py-14 text-center">
          <ScrollText size={22} className="text-white/20" />
          <p className="text-sm text-white/50">
            {feed.length === 0 ? 'Nothing logged yet' : 'Nothing matches those filters'}
          </p>
          <p className="text-[11px] text-white/30">
            {feed.length === 0 ? 'Use the + button to log your first entry.' : 'Try clearing the search.'}
          </p>
        </div>
      ) : (
        grouped.map(([day, entries]) => (
          <section key={day} className="space-y-2">
            <h2 className="ml-1 text-[10px] uppercase tracking-[0.2em] text-white/40">{day}</h2>
            <div className="space-y-2">
              {entries.map((entry) => {
                const meta = TYPE_META[entry.type];
                const Icon = meta.icon;
                return (
                  <motion.button
                    key={entry.id}
                    layout
                    onClick={() => setSelected(entry)}
                    className="glass-dark flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <Icon size={17} className={meta.tint} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.category || meta.label}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/40">
                        {entry.user} ·{' '}
                        {new Date(entry.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm text-white/70">{describeValue(entry)}</p>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <AnimatePresence>
        {selected && (
          <LogDetailSheet
            entry={selected}
            onClose={() => setSelected(null)}
            onDelete={() => handleDelete(selected)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}> = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] transition-all ${
      active ? 'border-white bg-white text-black' : 'border-white/10 text-white/50 hover:border-white/30'
    }`}
  >
    {icon}
    {label}
  </button>
);

const LogDetailSheet: React.FC<{
  entry: LogEntry;
  onClose: () => void;
  onDelete: () => Promise<void>;
}> = ({ entry, onClose, onDelete }) => {
  const updateTracking = useMutation(api.tracking.update);

  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(entry.category ?? '');
  const [value, setValue] = useState(String(entry.value));
  const [note, setNote] = useState(entry.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = TYPE_META[entry.type];
  const Icon = meta.icon;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateTracking({
        id: entry.id as Id<'tracking'>,
        type: entry.type,
        value: Number(value) || 0,
        category: category.trim() || undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change.');
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[120] mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border-t border-x border-white/10 bg-[#0b0b0b] px-5 pt-3"
        style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
              <Icon size={16} className={meta.tint} />
            </div>
            <div>
              <h2 className="text-base font-medium">{entry.category || meta.label}</h2>
              <p className="text-[11px] text-white/40">
                {entry.user} ·{' '}
                {new Date(entry.at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="nothing-input w-full text-sm"
              />
            </div>
            {(entry.type === 'mood' || entry.type === 'health') && (
              <div className="space-y-2">
                <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Value</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="nothing-input w-full font-mono text-sm"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="nothing-input h-24 w-full resize-none text-sm"
              />
            </div>
            {error && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
            <button
              onClick={() => void save()}
              disabled={busy}
              className="w-full rounded-2xl bg-nothing-purple py-4 text-[11px] font-medium uppercase tracking-[0.3em] text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="font-mono text-3xl">{describeValue(entry)}</p>
            {entry.note && <p className="text-sm leading-relaxed text-white/60">{entry.note}</p>}

            {!entry.editable && (
              <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[11px] text-white/40">
                Expenses are edited on the Split screen, where you can see how a change moves the
                balance.
              </p>
            )}

            <div className="flex gap-2">
              {entry.editable && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 py-3.5 text-[11px] uppercase tracking-widest text-white/70 transition-colors hover:bg-white/5"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              <button
                onClick={() => (confirming ? void onDelete() : setConfirming(true))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[11px] uppercase tracking-widest transition-colors ${
                  confirming ? 'bg-red-500 text-white' : 'border border-red-500/20 bg-red-500/10 text-red-400'
                }`}
              >
                <Trash2 size={14} /> {confirming ? 'Tap to confirm' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};

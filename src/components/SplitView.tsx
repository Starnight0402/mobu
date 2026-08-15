import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { CURRENCIES, currencySymbol, formatMoney } from '../lib/currency';
import { SplitwiseImportModal } from './SplitwiseImportModal';
import {
  Plus,
  Scale,
  PartyPopper,
  Download,
  Upload,
  X,
  Trash2,
  Pencil,
  Receipt,
  ArrowLeftRight,
  Utensils,
  Car,
  Home,
  ShoppingBag,
  Film,
  Plane,
  Coins,
} from 'lucide-react';

type Expense = NonNullable<ReturnType<typeof useExpenses>>[number];
function useExpenses() {
  return useQuery(api.expenses.list);
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Food: Utensils,
  Groceries: ShoppingBag,
  Transport: Car,
  Rent: Home,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Travel: Plane,
};
const QUICK_CATEGORIES = ['Food', 'Groceries', 'Transport', 'Rent', 'Shopping', 'Entertainment', 'Travel'];

function categoryIcon(category: string) {
  return CATEGORY_ICONS[category] ?? Coins;
}

function monthKey(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export const SplitView: React.FC = () => {
  const expenses = useExpenses() ?? [];
  const balance = useQuery(api.expenses.balance);
  const settlements = useQuery(api.expenses.settlements) ?? [];
  const settings = useQuery(api.settings.get);
  const settleUp = useMutation(api.expenses.settleUp);
  const removeExpense = useMutation(api.expenses.remove);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const defaultCurrency = settings?.currency ?? 'USD';
  const partnerName = balance?.partnerName ?? 'your partner';

  const visible = showSettled ? expenses : expenses.filter((e) => !e.settled);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const expense of visible) {
      const key = monthKey(expense.spentAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(expense);
    }
    return [...map.entries()];
  }, [visible]);

  const handleSettle = async (currency: string) => {
    setBusy(true);
    setError(null);
    try {
      await settleUp({ currency });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not settle up.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Category', 'Amount', 'Currency', 'Paid by', 'Payer share %', 'Lent', 'Settled', 'Note'],
      ...expenses.map((e) => [
        new Date(e.spentAt).toISOString(),
        e.category,
        e.amount.toString(),
        e.currency,
        e.payerName,
        e.splitRatio.toString(),
        e.lent.toString(),
        e.settled ? 'yes' : 'no',
        e.note ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mobu-expenses.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-32">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-medium tracking-tight dot-matrix">Split</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Who owes who</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            title="Import from Splitwise"
            aria-label="Import from Splitwise"
            className="flex h-11 w-11 items-center justify-center rounded-full glass text-white/60 transition-all hover:text-white"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={exportCsv}
            title="Export as CSV"
            aria-label="Export as CSV"
            className="flex h-11 w-11 items-center justify-center rounded-full glass text-white/60 transition-all hover:text-white"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      {importOpen && <SplitwiseImportModal onClose={() => setImportOpen(false)} />}

      {error && (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* Balance */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 space-y-4">
        {!balance || balance.byCurrency.length === 0 ? (
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-nothing-purple/20 bg-nothing-purple/10">
              <PartyPopper size={18} className="text-nothing-purple" />
            </div>
            <div>
              <p className="text-sm font-medium">All settled up</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-white/40">
                Nothing outstanding with {partnerName}
              </p>
            </div>
          </div>
        ) : (
          balance.byCurrency.map((row) => (
            <div key={row.currency} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-nothing-purple/20 bg-nothing-purple/10">
                  <Scale size={18} className="text-nothing-purple" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {row.net > 0
                      ? `${partnerName} owes you ${formatMoney(row.net, row.currency)}`
                      : `You owe ${partnerName} ${formatMoney(row.net, row.currency)}`}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-white/40">
                    Outstanding · {row.currency}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void handleSettle(row.currency)}
                disabled={busy}
                className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-white/60 transition-all hover:border-nothing-purple hover:text-nothing-purple disabled:opacity-40"
              >
                Settle
              </button>
            </div>
          ))
        )}
      </motion.section>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setEditing(null);
            setComposerOpen(true);
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-nothing-purple py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={16} /> Add expense
        </button>
        <button
          onClick={() => setShowSettled((v) => !v)}
          className={`rounded-2xl border px-4 py-3.5 text-[10px] uppercase tracking-widest transition-all ${
            showSettled
              ? 'border-nothing-purple/40 bg-nothing-purple/10 text-nothing-purple'
              : 'border-white/10 text-white/40'
          }`}
        >
          {showSettled ? 'All' : 'Open'}
        </button>
      </div>

      {/* Expenses */}
      {grouped.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Receipt size={22} className="text-white/20" />
          <p className="text-sm text-white/50">No expenses yet</p>
          <p className="text-[11px] text-white/30">Add the first one and the balance sorts itself out.</p>
        </div>
      ) : (
        grouped.map(([month, rows]) => (
          <section key={month} className="space-y-2">
            <h2 className="ml-1 text-[10px] uppercase tracking-[0.2em] text-white/40">{month}</h2>
            <div className="space-y-2">
              {rows.map((expense) => {
                const Icon = categoryIcon(expense.category);
                return (
                  <button
                    key={expense._id}
                    onClick={() => setDetail(expense)}
                    className="glass-dark flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <Icon size={17} className="text-white/50" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{expense.category}</p>
                      <p className="mt-0.5 text-[11px] text-white/40">
                        {expense.paidByMe ? 'You' : expense.payerName} paid{' '}
                        {formatMoney(expense.amount, expense.currency)}
                        {expense.settled && ' · settled'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`font-mono text-sm ${
                          expense.settled
                            ? 'text-white/30'
                            : expense.myDelta > 0
                              ? 'text-green-400'
                              : 'text-orange-400'
                        }`}
                      >
                        {expense.myDelta > 0 ? '+' : '−'}
                        {formatMoney(expense.myDelta, expense.currency)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-white/30">
                        {expense.myDelta > 0 ? 'you lent' : 'you owe'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {settlements.length > 0 && (
        <section className="space-y-2">
          <h2 className="ml-1 text-[10px] uppercase tracking-[0.2em] text-white/40">Settlement history</h2>
          <div className="space-y-2">
            {settlements.map((s) => (
              <div key={s._id} className="glass-dark flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nothing-purple/10">
                  <ArrowLeftRight size={16} className="text-nothing-purple" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {s.paidByMe ? 'You' : s.fromName} paid {s.paidByMe ? s.toName : 'you'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {new Date(s.settledAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-white/70">
                  {formatMoney(s.amount, s.currency)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>
        {detail && (
          <ExpenseDetailSheet
            expense={detail}
            partnerName={partnerName}
            onClose={() => setDetail(null)}
            onEdit={() => {
              setEditing(detail);
              setDetail(null);
              setComposerOpen(true);
            }}
            onDelete={async () => {
              await removeExpense({ id: detail._id as Id<'expenses'> });
              setDetail(null);
            }}
          />
        )}
        {composerOpen && (
          <ExpenseComposer
            existing={editing}
            defaultCurrency={defaultCurrency}
            partnerName={partnerName}
            onClose={() => {
              setComposerOpen(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => (
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
        <h2 className="text-lg font-medium">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </motion.div>
  </>
);

const ExpenseDetailSheet: React.FC<{
  expense: Expense;
  partnerName: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}> = ({ expense, partnerName, onClose, onEdit, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const payerShare = Math.round(expense.amount * (expense.splitRatio / 100) * 100) / 100;

  return (
    <Sheet title={expense.category} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="font-mono text-3xl">{formatMoney(expense.amount, expense.currency)}</p>
          <p className="mt-1 text-[11px] uppercase tracking-widest text-white/40">
            {new Date(expense.spentAt).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <Row label={`${expense.paidByMe ? 'You' : expense.payerName} paid`} value={formatMoney(expense.amount, expense.currency)} />
          <Row
            label={`${expense.paidByMe ? 'Your' : `${expense.payerName}'s`} share`}
            value={formatMoney(payerShare, expense.currency)}
          />
          <Row
            label={`${expense.paidByMe ? partnerName : 'Your'} share`}
            value={formatMoney(expense.lent, expense.currency)}
          />
          <div className="border-t border-white/5 pt-2">
            <Row
              label={expense.myDelta > 0 ? 'You are owed' : 'You owe'}
              value={formatMoney(expense.myDelta, expense.currency)}
              accent={expense.myDelta > 0 ? 'text-green-400' : 'text-orange-400'}
            />
          </div>
        </div>

        {expense.note && <p className="text-sm leading-relaxed text-white/60">{expense.note}</p>}
        {expense.receiptUrl && (
          <img src={expense.receiptUrl} alt="Receipt" className="w-full rounded-2xl" referrerPolicy="no-referrer" />
        )}

        {expense.settled ? (
          <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[11px] text-white/40">
            This expense has been settled, so it can no longer be edited.
          </p>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 py-3.5 text-[11px] uppercase tracking-widest text-white/70 transition-colors hover:bg-white/5"
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              onClick={() => (confirming ? void onDelete() : setConfirming(true))}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[11px] uppercase tracking-widest transition-colors ${
                confirming ? 'bg-red-500 text-white' : 'border border-red-500/20 bg-red-500/10 text-red-400'
              }`}
            >
              <Trash2 size={14} /> {confirming ? 'Tap to confirm' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
};

const Row: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div className="flex items-center justify-between">
    <span className="text-[11px] uppercase tracking-wider text-white/40">{label}</span>
    <span className={`font-mono text-sm ${accent ?? 'text-white/80'}`}>{value}</span>
  </div>
);

const ExpenseComposer: React.FC<{
  existing: Expense | null;
  defaultCurrency: string;
  partnerName: string;
  onClose: () => void;
}> = ({ existing, defaultCurrency, partnerName, onClose }) => {
  const addExpense = useMutation(api.expenses.add);
  const updateExpense = useMutation(api.expenses.update);

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [splitRatio, setSplitRatio] = useState(existing ? existing.splitRatio : 50);
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState(
    new Date(existing?.spentAt ?? Date.now()).toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseFloat(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && category.trim().length > 0;
  const yourShare = Number.isFinite(parsed) ? (parsed * splitRatio) / 100 : 0;
  const theirShare = Number.isFinite(parsed) ? parsed - yourShare : 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        amount: parsed,
        splitRatio,
        category: category.trim(),
        currency,
        note: note.trim() || undefined,
        spentAt: new Date(`${date}T12:00:00`).getTime(),
      };
      if (existing) {
        await updateExpense({ id: existing._id as Id<'expenses'>, ...payload });
      } else {
        await addExpense(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that expense.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={existing ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="nothing-input w-24 shrink-0 appearance-none text-center"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencySymbol(c)} {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            autoFocus
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="nothing-input min-w-0 flex-1 font-mono text-2xl"
          />
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Category</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-2 text-[11px] transition-all ${
                  category === c
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 text-white/50 hover:border-white/30'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or type your own…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="nothing-input w-full text-sm"
          />
        </div>

        <div className="space-y-3">
          <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Split</label>
          <div className="flex gap-2">
            {[
              { label: 'Equally', value: 50 },
              { label: 'I paid, all mine', value: 100 },
              { label: `All ${partnerName}'s`, value: 0 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSplitRatio(preset.value)}
                className={`flex-1 rounded-xl border px-2 py-2.5 text-[10px] uppercase tracking-wider transition-all ${
                  splitRatio === preset.value
                    ? 'border-nothing-purple bg-nothing-purple/15 text-nothing-purple'
                    : 'border-white/10 text-white/40'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={splitRatio}
            onChange={(e) => setSplitRatio(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-nothing-purple"
          />
          <div className="flex justify-between text-[11px] text-white/50">
            <span>
              You: <span className="font-mono text-white/80">{formatMoney(yourShare, currency)}</span>
            </span>
            <span>
              {partnerName}:{' '}
              <span className="font-mono text-white/80">{formatMoney(theirShare, currency)}</span>
            </span>
          </div>
          <p className="text-center text-[10px] uppercase tracking-widest text-white/25">
            You pay now · they owe you {formatMoney(theirShare, currency)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="nothing-input w-full text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="ml-1 text-[10px] uppercase tracking-widest text-white/30">Note</label>
            <input
              type="text"
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="nothing-input w-full text-sm"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!valid || saving}
          className="w-full rounded-2xl bg-nothing-purple py-4 text-[11px] font-medium uppercase tracking-[0.3em] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </Sheet>
  );
};

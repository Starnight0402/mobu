import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useBackHandler } from '../lib/backButtonStack';
import { CURRENCIES, currencySymbol, formatMoney } from '../lib/currency';
import { SplitwiseImportModal } from './SplitwiseImportModal';
import { AnalyticsView, SpendSummary } from './SplitAnalytics';
import { buildExpenseCsv, parseExpenseCsv } from '../lib/expenseCsv';
import { saveTextFile } from '../lib/saveFile';
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
  Search,
  FileUp,
  AlertTriangle,
  Repeat,
  Pause,
  Play,
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

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

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
  const clearAllExpenses = useMutation(api.expenses.clearAll);
  const importRows = useMutation(api.expenses.importRows);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  // Defaults to showing everything, not just outstanding expenses -- a
  // Splitwise import writes its whole history as settled (so it doesn't
  // distort the live balance), and those entries shouldn't be invisible by
  // default just because they're already paid off.
  const [showSettled, setShowSettled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'expenses' | 'analytics'>('expenses');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [payerFilter, setPayerFilter] = useState<'all' | 'me' | 'them'>('all');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const recurring = useQuery(api.recurring.list) ?? [];
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const defaultCurrency = settings?.currency ?? 'USD';
  const partnerName = balance?.partnerName ?? 'your partner';

  const categoriesInUse = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [expenses]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (catFilter && e.category !== catFilter) return false;
      if (payerFilter === 'me' && !e.paidByMe) return false;
      if (payerFilter === 'them' && e.paidByMe) return false;
      if (!q) return true;
      return [e.category, e.note ?? '', e.payerName, e.currency].some((f) => f.toLowerCase().includes(q));
    });
  }, [expenses, search, catFilter, payerFilter]);
  const filtering = !!catFilter || payerFilter !== 'all' || !!search.trim();

  const visible = showSettled ? searched : searched.filter((e) => !e.settled);

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

  const exportCsv = async () => {
    setError(null);
    try {
      const csv = buildExpenseCsv(expenses);
      await saveTextFile('mobu-expenses.csv', csv, 'text/csv');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export expenses.');
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    setError(null);
    try {
      await clearAllExpenses({});
      setConfirmClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete expenses.');
    } finally {
      setClearing(false);
    }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvNotice(null);
    setCsvBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const { rows, error: parseError } = parseExpenseCsv(text);
      if (parseError) {
        setError(parseError);
        return;
      }
      const { inserted } = await importRows({ rows });
      setCsvNotice(`Imported ${inserted} expense${inserted === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.');
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-medium tracking-tight dot-matrix">Split</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Who owes who</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => void handleCsvFile(e)}
          />
          <button
            onClick={() => csvFileRef.current?.click()}
            disabled={csvBusy}
            title="Upload expenses from CSV"
            aria-label="Upload expenses from CSV"
            className="flex h-11 w-11 items-center justify-center rounded-full glass text-white/60 transition-all hover:text-white disabled:opacity-40"
          >
            <FileUp size={16} />
          </button>
          <button
            onClick={() => setImportOpen(true)}
            title="Import from Splitwise"
            aria-label="Import from Splitwise"
            className="flex h-11 w-11 items-center justify-center rounded-full glass text-white/60 transition-all hover:text-white"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={() => void exportCsv()}
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

      {csvNotice && (
        <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-300">
          {csvNotice}
        </p>
      )}

      <div role="tablist" aria-label="Split views" className="flex rounded-full border border-white/10 bg-surface p-1">
        {(
          [
            { id: 'expenses', label: 'Expenses' },
            { id: 'analytics', label: 'Analytics' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-10 flex-1 rounded-full text-sm transition-colors ${
              tab === t.id ? 'bg-white font-semibold text-black' : 'text-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? (
        <AnalyticsView
          expenses={expenses}
          partnerName={partnerName}
          defaultCurrency={defaultCurrency}
          budget={settings?.monthlyBudget ?? 0}
          onEditBudget={() => setBudgetOpen(true)}
          categoryIcon={categoryIcon}
        />
      ) : (
        <>
      <SpendSummary
        expenses={expenses}
        currency={defaultCurrency}
        budget={settings?.monthlyBudget ?? 0}
        onOpenAnalytics={() => setTab('analytics')}
        onEditBudget={() => setBudgetOpen(true)}
      />

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search expenses…"
          className="nothing-input w-full pl-10 text-sm"
        />
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 no-scrollbar" role="group" aria-label="Filters">
        <button
          onClick={() => setRecurringOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-nothing-purple/40 bg-nothing-purple/10 px-3.5 text-[13px] text-nothing-purple"
        >
          <Repeat size={13} /> Monthly{recurring.length > 0 ? ` · ${recurring.filter((r) => r.active).length}` : ''}
        </button>
        {(
          [
            { id: 'all', label: 'Everyone' },
            { id: 'me', label: 'Paid by you' },
            { id: 'them', label: `Paid by ${partnerName}` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setPayerFilter(f.id)}
            aria-pressed={payerFilter === f.id}
            className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] ${
              payerFilter === f.id ? 'bg-white font-semibold text-black' : 'border border-white/10 bg-surface text-white/60'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
        {categoriesInUse.map((c) => (
          <button
            key={c}
            onClick={() => setCatFilter(catFilter === c ? null : c)}
            aria-pressed={catFilter === c}
            className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] ${
              catFilter === c ? 'bg-nothing-purple font-semibold text-black' : 'border border-white/10 bg-surface text-white/60'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {filtering && (
        <p className="-mt-3 ml-1 text-xs text-white/50">
          {visible.length} expense{visible.length === 1 ? '' : 's'} · {formatMoney(visible.reduce((t, e) => t + e.amount, 0), defaultCurrency)}
          {new Set(visible.map((e) => e.currency)).size > 1 ? ' (mixed currencies)' : ''}
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
        {expenses.length > 0 && (
          <button
            onClick={() => void handleClearAll()}
            onBlur={() => setConfirmClear(false)}
            disabled={clearing}
            title="Delete all expenses"
            aria-label="Delete all expenses"
            className={`flex h-12.5 items-center justify-center gap-1.5 rounded-2xl border px-3 text-[10px] uppercase tracking-widest transition-all disabled:opacity-40 ${
              confirmClear
                ? 'border-red-500 bg-red-500 text-white'
                : 'border-red-500/20 bg-red-500/10 text-red-400'
            }`}
          >
            {confirmClear ? <AlertTriangle size={14} /> : <Trash2 size={14} />}
            {confirmClear ? 'Confirm' : ''}
          </button>
        )}
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

        </>
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
        {budgetOpen && (
          <BudgetSheet
            current={settings?.monthlyBudget ?? 0}
            currency={defaultCurrency}
            onClose={() => setBudgetOpen(false)}
          />
        )}
        {recurringOpen && <RecurringSheet rules={recurring} partnerName={partnerName} onClose={() => setRecurringOpen(false)} />}
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
}) => {
  useBackHandler(true, onClose);
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
      className="fixed inset-x-0 bottom-0 z-[120] mx-auto max-h-[88dvh] w-full max-w-lg glass-sheet overflow-y-auto rounded-t-[2rem] border-t border-x px-5 pt-3"
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
};

const BudgetSheet: React.FC<{ current: number; currency: string; onClose: () => void }> = ({ current, currency, onClose }) => {
  const save = useMutation(api.settings.setMonthlyBudget);
  const [value, setValue] = useState(current > 0 ? String(current) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseFloat(value);

  const submit = async (next: number) => {
    setSaving(true);
    setError(null);
    try {
      await save({ amount: next });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the budget.');
      setSaving(false);
    }
  };

  return (
    <Sheet title="Monthly budget" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-white/60">
          One shared limit for what you two spend each month. The bar on this screen shows how much is left.
        </p>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-center text-lg text-white/60">{currencySymbol(currency)}</span>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Monthly budget amount"
            className="nothing-input min-w-0 flex-1 font-mono text-2xl"
          />
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <button
          onClick={() => void submit(amount)}
          disabled={saving || !Number.isFinite(amount) || amount <= 0}
          className="h-12 w-full rounded-full bg-white font-semibold text-black disabled:opacity-40"
        >
          Save budget
        </button>
        {current > 0 && (
          <button onClick={() => void submit(0)} disabled={saving} className="h-11 w-full text-sm text-white/50">
            Remove budget
          </button>
        )}
      </div>
    </Sheet>
  );
};

const RecurringSheet: React.FC<{
  rules: NonNullable<ReturnType<typeof useRecurringRules>>;
  partnerName: string;
  onClose: () => void;
}> = ({ rules, partnerName, onClose }) => {
  const setActive = useMutation(api.recurring.setActive);
  const remove = useMutation(api.recurring.remove);

  return (
    <Sheet title="Monthly expenses" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          These are added automatically on their day each month. To add one, tick "Repeat every month" when you add an expense.
        </p>
        {rules.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
            Nothing repeats yet. Rent, subscriptions and bills are good ones.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r._id} className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 ${r.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.category} · {formatMoney(r.amount, r.currency)}
                  </p>
                  <p className="text-xs text-white/50">
                    {ordinal(r.dayOfMonth)} of every month · {r.paidByMe ? 'you pay' : `${r.payerName || partnerName} pays`}
                    {r.active ? '' : ' · paused'}
                  </p>
                </div>
                <button
                  onClick={() => void setActive({ id: r._id as Id<'recurringExpenses'>, active: !r.active })}
                  aria-label={r.active ? 'Pause' : 'Resume'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
                >
                  {r.active ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Stop repeating ${r.category}? Expenses already added stay.`)) void remove({ id: r._id as Id<'recurringExpenses'> });
                  }}
                  aria-label="Delete"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-coral"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
};
function useRecurringRules() {
  return useQuery(api.recurring.list);
}

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
  const addRecurring = useMutation(api.recurring.add);
  const [repeat, setRepeat] = useState(false);

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency);
  const [splitRatio, setSplitRatio] = useState(existing ? existing.splitRatio : 50);
  const [note, setNote] = useState(existing?.note ?? '');
  // The user's local calendar day: toISOString() is UTC, which for anyone east
  // of it shows yesterday's date for the first hours of the day.
  const [date, setDate] = useState(() => {
    const d = new Date(existing?.spentAt ?? Date.now());
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
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
        if (repeat) {
          await addRecurring({
            amount: payload.amount,
            splitRatio: payload.splitRatio,
            category: payload.category,
            currency: payload.currency,
            note: payload.note,
            dayOfMonth: new Date(payload.spentAt).getDate(),
            startsNextMonth: true,
          });
        }
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

        {!existing && (
          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[#c3a6ff]"
            />
            <span className="flex-1">
              <span className="block text-sm">Repeat every month</span>
              <span className="block text-xs text-white/50">
                {repeat
                  ? `Added automatically on the ${ordinal(Math.min(28, new Date(`${date}T12:00:00`).getDate()))} of each month, starting next month`
                  : 'Rent, subscriptions, bills'}
              </span>
            </span>
            <Repeat size={16} className="shrink-0 text-white/40" />
          </label>
        )}

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

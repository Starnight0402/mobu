import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion } from 'motion/react';
import { X, Upload, Loader2, ArrowRight, AlertTriangle, Check } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { formatMoney } from '../lib/currency';
import { parseSplitwiseCsv, computeCarryover, type SplitwiseParseResult } from '../lib/splitwiseImport';

const BATCH_SIZE = 150;

type Stage = 'pick' | 'map' | 'review' | 'importing' | 'done';

export const SplitwiseImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const currentUser = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const importBatch = useMutation(api.splitImport.importBatch);
  const importCarryover = useMutation(api.splitImport.importCarryover);

  const [stage, setStage] = useState<Stage>('pick');
  const [parsed, setParsed] = useState<SplitwiseParseResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [meIndex, setMeIndex] = useState<0 | 1 | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ expenses: number; settlements: number; carryover: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    const text = await file.text();
    const result = parseSplitwiseCsv(text);
    if (result.error) {
      setFileError(result.error);
      return;
    }
    setParsed(result);
    // Guess who's who by matching the Splitwise column name against your own
    // display name — right most of the time, always double-checked below.
    const myName = (currentUser?.name ?? '').toLowerCase().trim();
    const guess = myName
      ? result.people.findIndex((p) => p.toLowerCase().includes(myName) || myName.includes(p.toLowerCase()))
      : -1;
    setMeIndex(guess === 0 || guess === 1 ? (guess as 0 | 1) : null);
    setStage('map');
  };

  const carryover = useMemo(() => {
    if (!parsed || meIndex === null) return [];
    return computeCarryover(parsed.expenses, parsed.settlements);
  }, [parsed, meIndex]);

  const runImport = async () => {
    if (!parsed || meIndex === null || !currentUser || !partner) return;
    const meId = currentUser._id;
    const partnerId = partner._id;
    const idFor = (i: 0 | 1): Id<'users'> => (i === meIndex ? meId : partnerId);

    const expenseRows = parsed.expenses.map((e) => ({
      amount: e.cost,
      payerId: idFor(e.payerIndex),
      splitRatio: e.payerShare,
      category: e.category,
      currency: e.currency,
      note: e.description || undefined,
      spentAt: e.date,
    }));
    const settlementRows = parsed.settlements.map((s) => ({
      fromUserId: idFor(s.fromIndex),
      toUserId: idFor(s.toIndex),
      amount: s.cost,
      currency: s.currency,
      note: s.note,
      settledAt: s.date,
    }));

    setStage('importing');
    const total = expenseRows.length + settlementRows.length;
    setProgress({ done: 0, total });

    let done = 0;
    for (let i = 0; i < expenseRows.length || i < settlementRows.length; i += BATCH_SIZE) {
      const eBatch = expenseRows.slice(i, i + BATCH_SIZE);
      const sBatch = i < settlementRows.length ? settlementRows.slice(i, i + BATCH_SIZE) : [];
      await importBatch({ expenses: eBatch, settlements: sBatch });
      done += eBatch.length + sBatch.length;
      setProgress({ done, total });
    }

    const carryoverRows = carryover.map((c) => ({
      currency: c.currency,
      amount: Math.abs(c.net),
      owedToId: idFor(c.net > 0 ? 0 : 1),
    }));
    if (carryoverRows.length > 0) {
      await importCarryover({ rows: carryoverRows });
    }

    setResult({ expenses: expenseRows.length, settlements: settlementRows.length, carryover: carryoverRows.length });
    setStage('done');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={stage === 'importing' ? undefined : onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative glass w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="dot-matrix text-lg">Import from Splitwise</h3>
          {stage !== 'importing' && (
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X size={20} />
            </button>
          )}
        </div>

        {stage === 'pick' && (
          <div className="space-y-4">
            <p className="text-sm text-white/60 leading-relaxed">
              In Splitwise: open your group with {partner?.name ?? 'your partner'} → Settings → Export as CSV.
              Upload that file here — everything gets added to Split, and your current Splitwise balance carries
              over as one clean entry so nothing's lost.
            </p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="nothing-button w-full justify-center">
              <Upload size={16} /> Choose CSV file
            </button>
            {fileError && (
              <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {fileError}
              </p>
            )}
          </div>
        )}

        {stage === 'map' && parsed && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">Found {parsed.people.length} people in this export. Which one is you?</p>
            <div className="grid grid-cols-2 gap-3">
              {parsed.people.map((name, i) => (
                <button
                  key={name}
                  onClick={() => setMeIndex(i as 0 | 1)}
                  className={`rounded-2xl border p-4 text-sm transition-all ${
                    meIndex === i
                      ? 'border-nothing-purple bg-nothing-purple/15 text-white'
                      : 'border-white/10 text-white/50 hover:border-white/30'
                  }`}
                >
                  {name}
                  {meIndex === i && <Check size={14} className="inline ml-1.5 text-nothing-purple" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStage('review')}
              disabled={meIndex === null}
              className="w-full py-4 bg-nothing-purple text-white rounded-2xl font-medium uppercase tracking-widest text-xs disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Review import <ArrowRight size={14} />
            </button>
          </div>
        )}

        {stage === 'review' && parsed && meIndex !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <MiniStat v={`${parsed.expenses.length}`} l="Expenses" />
              <MiniStat v={`${parsed.settlements.length}`} l="Settlements" />
            </div>
            {parsed.dateRange && (
              <p className="text-[11px] text-white/40">
                {new Date(parsed.dateRange.start).toLocaleDateString()} –{' '}
                {new Date(parsed.dateRange.end).toLocaleDateString()}
              </p>
            )}

            {carryover.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  Current balance, carried over
                </div>
                {carryover.map((c) => (
                  <div key={c.currency} className="rounded-2xl border border-nothing-purple/20 bg-nothing-purple/10 px-4 py-3 text-sm">
                    {c.net > 0
                      ? `${partner?.name ?? 'Partner'} owes you ${formatMoney(c.net, c.currency)}`
                      : `You owe ${partner?.name ?? 'partner'} ${formatMoney(Math.abs(c.net), c.currency)}`}
                  </div>
                ))}
              </div>
            )}

            {parsed.skipped.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-white/50 leading-relaxed">
                  {parsed.skipped.length} row{parsed.skipped.length === 1 ? '' : 's'} couldn't be read cleanly and
                  {parsed.skipped.length === 1 ? " wasn't" : " weren't"} imported — mostly summary rows Splitwise
                  adds to the export. Add anything missing manually.
                </p>
              </div>
            )}

            <p className="text-[11px] text-white/35 leading-relaxed">
              Every expense and settlement is added as history. Only the current balance above (if any) is left
              outstanding, so Settle Up in Split still works exactly as before.
            </p>

            <button
              onClick={() => void runImport()}
              className="w-full py-4 bg-nothing-purple text-white rounded-2xl font-medium uppercase tracking-widest text-xs"
            >
              Import {parsed.expenses.length + parsed.settlements.length} entries
            </button>
          </div>
        )}

        {stage === 'importing' && (
          <div className="space-y-4 py-6 flex flex-col items-center">
            <Loader2 size={24} className="animate-spin text-nothing-purple" />
            <p className="text-sm text-white/60">
              Importing {progress.done} / {progress.total}…
            </p>
            <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-nothing-purple transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="space-y-4 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center mx-auto">
              <Check size={22} className="text-emerald-400" />
            </div>
            <p className="text-sm text-white/70">
              Imported {result.expenses} expenses and {result.settlements} settlements
              {result.carryover > 0 ? `, plus ${result.carryover} carried-over balance${result.carryover > 1 ? 's' : ''}` : ''}.
            </p>
            <button onClick={onClose} className="w-full py-4 bg-white text-black rounded-2xl font-medium uppercase tracking-widest text-xs">
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const MiniStat: React.FC<{ v: string; l: string }> = ({ v, l }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
    <div className="font-display text-xl tabular-nums">{v}</div>
    <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{l}</div>
  </div>
);

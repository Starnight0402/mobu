import React, { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Plus, X, Check, Trash2, User } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

const SEVERITY_LABELS = ['Minor tiff', 'Small spat', 'Real argument', 'Big fight', 'Major blowup'];

export const FightLogView: React.FC = () => {
  const fights = useQuery(api.fights.list) ?? [];
  const currentUser = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const createFight = useMutation(api.fights.create);
  const resolveFight = useMutation(api.fights.resolve);
  const removeFight = useMutation(api.fights.remove);

  const [isAdding, setIsAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState(2);
  const [initiatedBy, setInitiatedBy] = useState<Id<'users'> | undefined>(undefined);
  const [resolvingId, setResolvingId] = useState<Id<'fights'> | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const addFight = async () => {
    if (!description.trim()) return;
    await createFight({ description: description.trim(), severity, initiatedBy });
    setIsAdding(false);
    setDescription('');
    setSeverity(2);
    setInitiatedBy(undefined);
  };

  const submitResolve = async () => {
    if (!resolvingId) return;
    await resolveFight({ id: resolvingId, resolution: resolutionNote.trim() || undefined });
    setResolvingId(null);
    setResolutionNote('');
  };

  const deleteFight = async (id: Id<'fights'>) => {
    if (confirm('Delete this log entry?')) await removeFight({ id });
  };

  const nameFor = (id?: Id<'users'>) => {
    if (!id) return null;
    if (id === currentUser?._id) return currentUser?.name ?? 'You';
    if (id === partner?._id) return partner?.name ?? 'Partner';
    return null;
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <h1 className="text-4xl font-display font-medium tracking-tight dot-matrix">Fight Log</h1>
          <p className="text-white/40 text-sm uppercase tracking-widest">Track it honestly, fix it faster</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
        >
          <Plus size={20} />
        </button>
      </header>

      {fights.length === 0 ? (
        <div className="glass p-6 text-center text-white/40 text-sm flex flex-col items-center gap-2">
          <Swords size={22} className="text-white/20" />
          Nothing logged. Hopefully it stays that way — but if something happens, log it here.
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {fights.map((f) => (
              <motion.div
                key={f._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass p-6 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${i < f.severity ? 'bg-red-400' : 'bg-white/10'}`}
                      />
                    ))}
                    <span className="text-[10px] uppercase tracking-widest text-white/40 ml-1">
                      {SEVERITY_LABELS[f.severity - 1]}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteFight(f._id)}
                    aria-label="Delete entry"
                    className="text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <p className="text-sm text-white/80 leading-relaxed">{f.description}</p>

                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>{new Date(f.fightDate ?? f._creationTime).toLocaleDateString()}</span>
                  {nameFor(f.initiatedBy) && (
                    <span className="flex items-center gap-1">
                      <User size={11} /> Started by {nameFor(f.initiatedBy)}
                    </span>
                  )}
                </div>

                {f.resolved ? (
                  <div className="flex items-start gap-2 pt-2 border-t border-white/5 text-xs text-emerald-400/90">
                    <Check size={14} className="shrink-0 mt-0.5" />
                    <span>{f.resolution || 'Marked resolved'}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setResolvingId(f._id);
                      setResolutionNote('');
                    }}
                    className="w-full py-2.5 rounded-xl border border-white/10 text-[11px] uppercase tracking-widest text-white/50 hover:border-white/30 hover:text-white transition-all"
                  >
                    Mark resolved
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Log a fight */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setIsAdding(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative glass p-8 w-full max-w-md space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="dot-matrix text-xl">Log a fight</h3>
                <button onClick={() => setIsAdding(false)} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <textarea
                  placeholder="What happened?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="nothing-input w-full resize-none"
                />
                <div>
                  <label className="text-[11px] text-white/40 uppercase tracking-widest mb-2 block">
                    How big was it — {SEVERITY_LABELS[severity - 1]}
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSeverity(s)}
                        className={`flex-1 py-2.5 rounded-xl border text-xs transition-all ${
                          s === severity
                            ? 'border-red-400/50 bg-red-400/15 text-white'
                            : 'border-white/10 text-white/40 hover:border-white/30'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-white/40 uppercase tracking-widest mb-2 block">
                    Who started it (optional)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: undefined, label: 'Unsure' },
                      { id: currentUser?._id, label: currentUser?.name ?? 'Me' },
                      { id: partner?._id, label: partner?.name ?? 'Partner' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setInitiatedBy(opt.id)}
                        className={`py-2.5 rounded-xl border text-xs transition-all ${
                          initiatedBy === opt.id
                            ? 'border-nothing-purple/50 bg-nothing-purple/15 text-white'
                            : 'border-white/10 text-white/40 hover:border-white/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={addFight}
                  disabled={!description.trim()}
                  className="w-full py-4 bg-red-400/90 text-black rounded-2xl font-medium uppercase tracking-widest text-xs disabled:opacity-40"
                >
                  Save entry
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resolve a fight */}
      <AnimatePresence>
        {resolvingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setResolvingId(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative glass p-8 w-full max-w-md space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="dot-matrix text-xl">How'd it resolve?</h3>
                <button onClick={() => setResolvingId(null)} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <textarea
                placeholder="Optional note — what fixed it, what you agreed on…"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="nothing-input w-full resize-none"
              />
              <button
                onClick={submitResolve}
                className="w-full py-4 bg-emerald-400/90 text-black rounded-2xl font-medium uppercase tracking-widest text-xs"
              >
                Mark resolved
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

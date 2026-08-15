import React, { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion } from 'motion/react';
import {
  Brain, Upload, Loader2, Heart, TrendingUp, AlertTriangle, MessageCircle,
  Lightbulb, Swords, FileText, Users,
} from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { ChatStatsDashboard, SERIES, type ChatStats } from './ChatStatsDashboard';
import { ConflictEpisodes, type Episode } from './ConflictEpisodes';
import { ConnectionMoments } from './ConnectionMoments';

interface Claim { point: string; evidence?: string }
interface PersonRead { behaviour: string[]; suggestions: string[] }
interface Narrative {
  overallScore: number;
  headline: string;
  strengths: Claim[];
  growthAreas: Claim[];
  communicationPatterns: Claim[];
  conflictPatterns: Claim[];
  perPerson?: Record<string, PersonRead>;
  together?: string[];
}

type Tab = 'overview' | 'fights' | 'us' | 'read';

export const RelationshipAnalyzerView: React.FC = () => {
  const latest = useQuery(api.relationshipAnalyzer.latestImport);
  const analyses = useQuery(api.relationshipAnalyzer.list) ?? [];
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const startAnalysis = useMutation(api.relationshipAnalyzer.startAnalysis);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: file });
      const { storageId } = await res.json();
      await startAnalysis({ chatStorageId: storageId, fileName: file.name });
    } catch (err) {
      console.error('Chat import failed', err);
      setError('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const processing = latest?.status === 'processing';
  const stats: ChatStats | null =
    latest?.status === 'done' && latest.stats ? JSON.parse(latest.stats) : null;
  const allEpisodes = (latest?.episodes ?? []) as unknown as Episode[];
  // Rows written before connection detection existed have no `kind` and are
  // all conflicts, so treat a missing value as one.
  const fights = allEpisodes.filter((e) => (e.kind ?? 'conflict') === 'conflict');
  const connections = allEpisodes.filter((e) => e.kind === 'connection');

  const narrativeRow = analyses.find((a) => a.status === 'done' && a.result);
  let narrative: Narrative | null = null;
  try {
    narrative = narrativeRow?.result ? JSON.parse(narrativeRow.result) : null;
  } catch { narrative = null; }

  return (
    <div className="space-y-5 pb-32">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-nothing-purple/15 border border-nothing-purple/30 flex items-center justify-center">
            <Brain size={18} className="text-nothing-purple" />
          </div>
          <div>
            <h1 className="text-2xl font-display tracking-tight">Analyzer</h1>
            <p className="text-[10px] text-white/40 dot-matrix">
              {stats
                ? `${stats.totalMessages.toLocaleString()} messages · ${stats.daysCovered} days`
                : 'IMPORT YOUR CHAT TO BEGIN'}
            </p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} disabled={uploading || processing} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || processing}
          className="nothing-button text-[10px] uppercase tracking-widest disabled:opacity-50 shrink-0"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {stats ? 'Re-import' : 'Import chat'}
        </button>
      </header>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!latest && (
        <div className="glass p-6 space-y-3">
          <FileText size={22} className="text-white/20" />
          <p className="text-sm text-white/60 leading-relaxed">
            Export your WhatsApp chat (Chat → More → Export chat → <span className="text-white/80">Without Media</span>)
            and import the .txt here. It's parsed and kept in your own database, then broken down into
            message patterns, conflict episodes and an AI read — combined with your fights, goals and mood logs.
          </p>
        </div>
      )}

      {processing && (
        <div className="glass p-6 flex items-center gap-3 text-sm text-white/60">
          <Loader2 size={18} className="animate-spin text-nothing-purple" />
          Parsing and analyzing your chat — this takes a minute for a long history.
        </div>
      )}

      {latest?.status === 'error' && (
        <div className="glass p-5 flex items-start gap-3 text-sm text-red-400">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{latest.error}</span>
        </div>
      )}

      {stats && (
        <>
          <div className="flex gap-1 p-1 glass">
            {([
              ['overview', 'Overview'],
              ['fights', `Fights${fights.length ? ` (${fights.length})` : ''}`],
              ['us', `Us${connections.length ? ` (${connections.length})` : ''}`],
              ['read', 'AI read'],
            ] as Array<[Tab, string]>).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-2xl py-2 text-[10px] uppercase tracking-widest transition-colors ${
                  tab === id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'overview' && <ChatStatsDashboard stats={stats} />}
          {tab === 'fights' && <ConflictEpisodes episodes={fights} senders={stats.senders} />}
          {tab === 'us' && <ConnectionMoments episodes={connections} senders={stats.senders} />}
          {tab === 'read' && <AIRead narrative={narrative} senders={stats.senders} />}
        </>
      )}
    </div>
  );
};

const AIRead: React.FC<{ narrative: Narrative | null; senders: string[] }> = ({ narrative, senders }) => {
  if (!narrative) {
    return (
      <div className="glass p-6 text-center text-sm text-white/40 flex flex-col items-center gap-2">
        <Brain size={20} className="text-white/20" />
        The AI read isn't ready yet, or couldn't be generated. Everything else on this
        page is computed directly from your chat and doesn't depend on it.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-nothing-purple/15 border border-nothing-purple/30 flex flex-col items-center justify-center shrink-0">
            <span className="font-display text-xl leading-none">{narrative.overallScore}</span>
            <span className="text-[8px] text-white/40">/10</span>
          </div>
          <p className="text-sm leading-snug">{narrative.headline}</p>
        </div>
      </motion.div>

      <Section icon={Heart} label="Strengths" tone="text-emerald-400" claims={narrative.strengths} />
      <Section icon={AlertTriangle} label="Growth areas" tone="text-amber-400" claims={narrative.growthAreas} />
      <Section icon={MessageCircle} label="Communication patterns" tone="text-sky-400" claims={narrative.communicationPatterns} />
      <Section icon={Swords} label="Conflict patterns" tone="text-red-400" claims={narrative.conflictPatterns} />

      {narrative.perPerson && (
        <div className="glass p-5 space-y-4">
          <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/60">
            <Users size={12} /> Individual patterns
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {senders.map((name, i) => {
              const p = narrative.perPerson?.[name];
              if (!p) return null;
              return (
                <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                  style={{ borderLeft: `3px solid ${SERIES[i]}` }}>
                  <div className="flex items-center gap-2 font-display text-sm">
                    <span className="w-2 h-2 rounded-full" style={{ background: SERIES[i] }} />
                    {name}
                  </div>
                  <ul className="space-y-2">
                    {p.behaviour?.map((b, j) => (
                      <li key={j} className="text-[12.5px] text-white/65 leading-relaxed pl-3 relative">
                        <span className="absolute left-0 text-white/25">·</span>{b}
                      </li>
                    ))}
                  </ul>
                  {p.suggestions?.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[9px] uppercase tracking-wider font-mono text-white/35">
                        What {name} could try
                      </div>
                      {p.suggestions.map((s, j) => (
                        <p key={j} className="text-[12px] text-white/70 leading-relaxed rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                          {s}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {narrative.together && narrative.together.length > 0 && (
        <div className="glass p-5 space-y-3">
          <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-nothing-purple">
            <Lightbulb size={12} /> Together
          </h3>
          {narrative.together.map((t, i) => (
            <p key={i} className="text-[12.5px] text-white/70 leading-relaxed rounded-xl border border-white/10 bg-white/[0.02] p-3">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; tone: string; claims?: Claim[];
}> = ({ icon: Icon, label, tone, claims }) => {
  if (!claims?.length) return null;
  return (
    <div className="glass p-5 space-y-3">
      <h3 className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${tone}`}>
        <Icon size={12} /> {label}
      </h3>
      <ul className="space-y-3">
        {claims.map((c, i) => (
          <li key={i} className="space-y-1">
            <p className="text-[12.5px] text-white/70 leading-relaxed pl-3 relative">
              <span className="absolute left-0 text-white/25">·</span>
              {typeof c === 'string' ? c : c.point}
            </p>
            {typeof c !== 'string' && c.evidence && (
              <p className="text-[9.5px] font-mono text-white/30 pl-3 flex items-center gap-1.5">
                <TrendingUp size={9} /> {c.evidence}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

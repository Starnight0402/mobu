import React, { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Brain,
  Upload,
  Loader2,
  Heart,
  TrendingUp,
  AlertTriangle,
  MessageCircle,
  Lightbulb,
  Sparkles,
  FileText,
  Swords,
} from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { Doc } from '../../convex/_generated/dataModel';

interface AnalysisResult {
  overallScore: number;
  headline: string;
  strengths: string[];
  growthAreas: string[];
  communicationPatterns: string[];
  conflictPatterns: string[];
  trendsOverTime: string[];
  suggestions: string[];
}

export const RelationshipAnalyzerView: React.FC = () => {
  const analyses = useQuery(api.relationshipAnalyzer.list) ?? [];
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const startAnalysis = useMutation(api.relationshipAnalyzer.startAnalysis);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: file,
      });
      const { storageId } = await res.json();
      await startAnalysis({ chatStorageId: storageId });
    } catch (err) {
      console.error('Chat analysis upload failed', err);
      setUploadError('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || analyses.some((a) => a.status === 'processing');

  return (
    <div className="pb-32 pt-2 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-nothing-purple/15 border border-nothing-purple/30 flex items-center justify-center">
          <Brain size={18} className="text-nothing-purple" />
        </div>
        <div>
          <h1 className="text-xl font-display tracking-tight text-white">Relationship Analyzer</h1>
          <p className="text-[11px] text-white/40 dot-matrix">AI READ OF YOUR CHAT + APP DATA</p>
        </div>
      </div>

      <div className="glass p-5 space-y-3">
        <p className="text-sm text-white/60 leading-relaxed">
          Export your WhatsApp chat (Chat → More → Export chat → <span className="text-white/80">Without Media</span>) and
          upload the .txt file here. It's combined with your memories, goals, fight log and mood logs from this app and analyzed by an
          open-source model (Llama 3.3, via Groq) — nothing is used to train anything, and the raw chat text isn't shown back
          to you here.
        </p>
        <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleFile} disabled={busy} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="nothing-button w-full justify-center disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : 'Import WhatsApp chat (.txt)'}
        </button>
        {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
      </div>

      <div className="space-y-4">
        {analyses.length === 0 && (
          <div className="glass p-6 text-center text-white/40 text-sm flex flex-col items-center gap-2">
            <FileText size={22} className="text-white/20" />
            No analysis yet — import a chat export above to run your first one.
          </div>
        )}
        <AnimatePresence>
          {analyses.map((a) => (
            <AnalysisCard key={a._id} analysis={a} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const AnalysisCard: React.FC<{ analysis: Doc<'relationshipAnalyses'> }> = ({ analysis }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="glass p-5 space-y-4"
    >
      <div className="flex items-center justify-between text-[10px] text-white/30 dot-matrix">
        <span>{new Date(analysis._creationTime).toLocaleString()}</span>
        {analysis.messageCount !== undefined && (
          <span>
            {analysis.messageCount.toLocaleString()} messages{analysis.sampled ? ' · sampled across timeline' : ''}
          </span>
        )}
      </div>

      {analysis.status === 'processing' && (
        <div className="flex items-center gap-3 py-4 text-white/60 text-sm">
          <Loader2 size={18} className="animate-spin text-nothing-purple" />
          Analyzing your chat… this can take a couple of minutes for a long history.
        </div>
      )}

      {analysis.status === 'error' && (
        <div className="flex items-start gap-3 py-2 text-red-400 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{analysis.error ?? 'Something went wrong analyzing this chat.'}</span>
        </div>
      )}

      {analysis.status === 'done' && analysis.result && <ResultView raw={analysis.result} />}
    </motion.div>
  );
};

const ResultView: React.FC<{ raw: string }> = ({ raw }) => {
  let parsed: AnalysisResult | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return <p className="text-sm text-white/60 whitespace-pre-wrap">{raw}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-nothing-purple/15 border border-nothing-purple/30 flex flex-col items-center justify-center shrink-0">
          <span className="text-2xl font-display text-white leading-none">{parsed.overallScore}</span>
          <span className="text-[9px] text-white/40">/10</span>
        </div>
        <p className="text-base text-white leading-snug">{parsed.headline}</p>
      </div>

      <Section icon={Heart} label="Strengths" items={parsed.strengths} tone="text-emerald-400" />
      <Section icon={AlertTriangle} label="Growth areas" items={parsed.growthAreas} tone="text-amber-400" />
      <Section icon={MessageCircle} label="Communication patterns" items={parsed.communicationPatterns} tone="text-sky-400" />
      <Section icon={Swords} label="Conflict patterns" items={parsed.conflictPatterns} tone="text-red-400" />
      <Section icon={TrendingUp} label="Trends over time" items={parsed.trendsOverTime} tone="text-nothing-purple" />
      <Section icon={Lightbulb} label="Suggestions" items={parsed.suggestions} tone="text-yellow-300" />
    </div>
  );
};

const Section: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  items: string[];
  tone: string;
}> = ({ icon: Icon, label, items, tone }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-widest ${tone}`}>
        <Icon size={13} />
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-white/70 leading-relaxed flex gap-2">
            <Sparkles size={12} className="text-white/20 mt-1 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Upload, ScanLine, FileUp, Braces, Keyboard, Landmark, Search, Inbox, FlaskConical, ClipboardList,
  FileText, Syringe, Receipt, ShieldCheck, Smile, Glasses, Activity, File, Sparkles, Trash2, RefreshCw, Plus, X, AlertTriangle, Check,
  Pill as PillIcon, Wallet,
} from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { takeHealthIntent, takeSharedFiles, setHealthIntent } from '../../lib/healthIntent';
import { goToTab } from '../../lib/navigation';
import { confirmDialog, noticeDialog } from '../Dialog';
import { haptic } from '../../lib/haptics';
import {
  Av, Btn, Card, Chips, cx, Empty, Field, fmtDate, flagLabel, flagTone, IconBtn, Input, List, Note, Overlay, PersonSwitch,
  Pill, Row, Screen, Section, Select, Sheet, TextArea, Toggle, attempt, usePeople, useUpload, useWho, num, todayStr, money, Dot,
} from './ui';

type RecordType = 'lab' | 'prescription' | 'imaging' | 'consult' | 'discharge' | 'vaccine' | 'bill' | 'insurance' | 'dental' | 'eye' | 'ecg' | 'other';

export const TYPES: { value: RecordType; label: string; icon: LucideIcon; tone: 'coral' | 'purple' | 'azure' | 'sage' | 'gold' | 'muted' }[] = [
  { value: 'lab', label: 'Lab reports', icon: FlaskConical, tone: 'coral' },
  { value: 'prescription', label: 'Prescriptions', icon: ClipboardList, tone: 'purple' },
  { value: 'imaging', label: 'Imaging', icon: ScanLine, tone: 'azure' },
  { value: 'consult', label: 'Consult notes', icon: FileText, tone: 'purple' },
  { value: 'discharge', label: 'Discharge', icon: FileText, tone: 'coral' },
  { value: 'vaccine', label: 'Vaccines', icon: Syringe, tone: 'sage' },
  { value: 'bill', label: 'Bills', icon: Receipt, tone: 'gold' },
  { value: 'insurance', label: 'Insurance', icon: ShieldCheck, tone: 'azure' },
  { value: 'dental', label: 'Dental', icon: Smile, tone: 'purple' },
  { value: 'eye', label: 'Eye', icon: Glasses, tone: 'azure' },
  { value: 'ecg', label: 'ECG', icon: Activity, tone: 'coral' },
  { value: 'other', label: 'Other', icon: File, tone: 'muted' },
];
const typeInfo = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[TYPES.length - 1];

export const RecordsView: React.FC = () => {
  const [who] = useWho();
  const { meId, meName, partnerName } = usePeople();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | RecordType>('all');
  const [folder, setFolder] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState(false);
  const [openId, setOpenId] = useState<Id<'healthRecords'> | null>(null);
  const [reviewId, setReviewId] = useState<Id<'healthRecords'> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useQuery(api.health.records.list, { who });
  const hits = useQuery(api.health.records.search, q.trim().length >= 2 ? { who, q } : 'skip');
  const folders = useQuery(api.health.records.folders, { who }) ?? [];
  const pending = useQuery(api.health.records.pending) ?? [];
  const create = useMutation(api.health.records.create);
  const upload = useUpload();
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    const intent = takeHealthIntent('health-records');
    if (intent === 'upload') setAdding(true);
    if (intent === 'search') setTimeout(() => searchRef.current?.focus(), 200);
    if (intent?.startsWith('open:')) setOpenId(intent.slice(5) as Id<'healthRecords'>);
    const shared = takeSharedFiles();
    if (shared.length) void uploadFiles(shared, 'share');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = async (files: File[], source: 'upload' | 'scan' | 'share') => {
    if (!files.length) return;
    setAdding(false);
    const docs = files.filter((f) => /^image\/|application\/pdf/.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    const json = files.filter((f) => /json/.test(f.type) || f.name.endsWith('.json'));
    if (json.length) await importFhir(json[0]);
    if (!docs.length) return;
    setUploading(docs.length);
    await attempt(async () => {
      const uploaded = [];
      for (const f of docs) uploaded.push(await upload(f));
      // A batch of photos is one document (pages); several PDFs are separate records.
      const pdfs = uploaded.filter((u) => u.mime === 'application/pdf');
      const images = uploaded.filter((u) => u.mime !== 'application/pdf');
      if (images.length) await create({ files: images, source, read: true });
      for (const p of pdfs) await create({ files: [p], source, read: true });
      haptic('success');
    }, "Couldn't upload that");
    setUploading(0);
  };

  const importBundle = useAction(api.health.fhirImport.importBundle);
  const importFhir = async (f: File) => {
    const res = await attempt(async () => {
      const { storageId } = await upload(f, { compress: false });
      return await importBundle({ storageId });
    }, "Couldn't import that file");
    if (res) await noticeDialog('Imported', `${res.documents} documents, ${res.labs} lab values, ${res.vitals} readings, ${res.history} history items, ${res.vaccines} vaccines and ${res.meds} medicines.`);
  };

  const rows = useMemo(() => {
    const base = q.trim().length >= 2 ? hits ?? [] : all ?? [];
    return base.filter((r) => (type === 'all' || r.type === type) && (!folder || r.folder === folder) && r.status === 'saved');
  }, [all, hits, q, type, folder]);

  const byMonth = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.date.slice(0, 7);
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <Screen
      title="Records"
      sub={`${all?.filter((r) => r.status === 'saved').length ?? 0} documents`}
      actions={<IconBtn icon={Upload} label="Add a record" primary onClick={() => setAdding(true)} />}
    >
      <label className="glass flex h-12 items-center gap-2.5 rounded-full px-4 text-white/45">
        <Search size={16} />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inside reports: TSH, Dr. Mehta, X-ray…" className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40" />
        {q && <button type="button" aria-label="Clear" onClick={() => setQ('')}><X size={16} /></button>}
      </label>
      <Chips value={type} onChange={(v) => setType(v)} options={[{ value: 'all' as const, label: 'All' }, ...TYPES.map((t) => ({ value: t.value, label: t.label }))]} />
      <PersonSwitch />

      {(uploading > 0 || pending.length > 0) && (
        <List>
          {uploading > 0 && <Row icon={<Upload size={17} />} tone="purple" title={`Uploading ${uploading} file${uploading > 1 ? 's' : ''}…`} meta="Keep the app open" />}
          {pending.map((p) => (
            <Row
              key={p._id}
              icon={p.status === 'failed' ? <AlertTriangle size={17} /> : p.status === 'processing' ? <Sparkles size={17} /> : <Inbox size={17} />}
              tone={p.status === 'failed' ? 'coral' : p.status === 'processing' ? 'purple' : 'gold'}
              title={p.status === 'processing' ? 'Reading your report…' : p.status === 'review' ? `Check “${p.title}”` : "Couldn't read this one"}
              meta={p.status === 'processing' ? 'Finding the date, the lab and every value' : p.status === 'review' ? 'Values read. Nothing is saved until you confirm.' : p.error}
              onClick={p.status === 'processing' ? undefined : () => (p.status === 'review' ? setReviewId(p._id) : setOpenId(p._id))}
            />
          ))}
        </List>
      )}

      {folders.length > 0 && (
        <Section title="Folders">
          <Chips value={folder ?? ''} onChange={(v) => setFolder(folder === v ? null : v)} options={folders.map((f) => ({ value: f.name, label: `${f.name} · ${f.count}` }))} />
        </Section>
      )}

      {all && rows.length === 0 && (
        <Empty
          icon={FileText}
          title={q ? 'Nothing matches' : 'No records yet'}
          body={q ? 'Search looks inside the text of every report.' : 'Scan a report, upload a PDF, or share one from WhatsApp straight into Mobu.'}
          action={!q ? <button type="button" onClick={() => setAdding(true)} className="mt-2 text-sm text-nothing-purple">Add the first one</button> : undefined}
        />
      )}

      {byMonth.map(([month, list]) => (
        <Section key={month} title={fmtDate(`${month}`)}>
          <List>
            {list.map((r) => {
              const t = typeInfo(r.type);
              return (
                <Row
                  key={r._id}
                  icon={<t.icon size={17} />}
                  tone={t.tone}
                  title={r.title}
                  meta={[r.provider, fmtDate(r.date), r.fileCount ? `${r.fileCount} file${r.fileCount > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                  onClick={() => setOpenId(r._id)}
                  end={
                    <>
                      {who === 'both' && <Av isMe={r.ownerId === meId} size="sm" name={r.ownerId === meId ? meName : partnerName} />}
                      {r.flagged > 0 ? <Pill tone="coral">{r.flagged} flagged</Pill> : r.hasResults ? <Pill tone="sage">In range</Pill> : null}
                    </>
                  }
                />
              );
            })}
          </List>
        </Section>
      ))}
      <Note>Every file keeps its original. Text inside scanned photos is searchable too.</Note>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a record">
        <AddOptions onFiles={uploadFiles} onManual={() => { setAdding(false); setManual(true); }} />
      </Sheet>
      <ManualRecord open={manual} onClose={() => setManual(false)} />
      <Overlay open={!!reviewId} onClose={() => setReviewId(null)}>
        {reviewId && <Review id={reviewId} onDone={() => setReviewId(null)} />}
      </Overlay>
      <Overlay open={!!openId} onClose={() => setOpenId(null)}>
        {openId && <RecordDetail id={openId} onClose={() => setOpenId(null)} onReview={() => { setReviewId(openId); setOpenId(null); }} />}
      </Overlay>
    </Screen>
  );
};

function AddOptions({ onFiles, onManual }: { onFiles: (f: File[], s: 'upload' | 'scan') => void; onManual: () => void }) {
  const scan = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const fhir = useRef<HTMLInputElement>(null);
  const opt = (icon: React.ReactNode, tone: string, title: string, meta: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="glass flex w-full items-center gap-3 rounded-[18px] p-3.5 text-left">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>{icon}</span>
      <span className="flex flex-col"><span className="text-[15px]">{title}</span><span className="text-xs text-white/45">{meta}</span></span>
    </button>
  );
  return (
    <div className="space-y-2">
      <input ref={scan} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles([...(e.target.files ?? [])], 'scan')} />
      <input ref={pick} type="file" accept="image/*,application/pdf,.heic,.heif" multiple hidden onChange={(e) => onFiles([...(e.target.files ?? [])], 'upload')} />
      <input ref={fhir} type="file" accept="application/json,.json" hidden onChange={(e) => onFiles([...(e.target.files ?? [])], 'upload')} />
      {opt(<ScanLine size={17} />, 'bg-nothing-purple/15 text-nothing-purple', 'Scan pages', 'Camera · photograph each page', () => scan.current?.click())}
      {opt(<FileUp size={17} />, 'bg-azure/15 text-azure', 'Upload PDF or photos', 'Several photos become one document', () => pick.current?.click())}
      {opt(<Braces size={17} />, 'bg-sage/15 text-sage', 'Import a FHIR file', 'A .json export from a hospital or the ABHA app', () => fhir.current?.click())}
      {opt(<Landmark size={17} />, 'bg-coral/15 text-coral', 'From ABHA', 'Download records in the ABHA app, then share them here', () => goToTab('health-settings'))}
      {opt(<Keyboard size={17} />, 'bg-gold/15 text-gold', 'Type it in', 'No file: a reading from a pharmacy or camp', onManual)}
      <Note>On your phone you can also share a PDF or photo from WhatsApp, Gmail or Files straight into Mobu. Reports are read with AI (Google Gemini); you check every value before it's saved.</Note>
    </div>
  );
}

function ManualRecord({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useMutation(api.health.records.create);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<RecordType>('consult');
  const [date, setDate] = useState(todayStr());
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');
  const save = async () => {
    const id = await attempt(() => create({ files: [], title, type, date, provider, notes, source: 'manual', read: false }));
    if (id) {
      setTitle('');
      setNotes('');
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New record">
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Health camp BP and sugar" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type"><Select value={type} onChange={setType} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Where"><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Clinic, lab or pharmacy" /></Field>
      <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Note>For lab values without a report, use Lab results → Add a value.</Note>
      <Btn onClick={save}>Save</Btn>
    </Sheet>
  );
}

/* ---------------- Review: check what the AI read ---------------- */

interface XResult { code?: string | null; name: string; value?: number | null; valueText?: string | null; unit?: string | null; refLow?: number | null; refHigh?: number | null; refText?: string | null; flag?: string | null; confidence?: string; readAs?: string | null }
interface XMed { name: string; strength?: string | null; form?: string | null; times?: string[]; frequency?: string | null; durationDays?: number | null; instructions?: string | null; asNeeded?: boolean }
interface Extraction { results?: XResult[]; medications?: XMed[]; vaccines?: { vaccine: string; dose?: string | null; date?: string | null }[]; amount?: number | null; diagnoses?: string[]; followUp?: string | null; fasting?: boolean | null }

type EditRow = { key: number; code?: string; name: string; value: string; unit: string; ref: string; low: boolean; readAs?: string; flag?: string };

function Review({ id, onDone }: { id: Id<'healthRecords'>; onDone: () => void }) {
  const r = useQuery(api.health.records.get, { id });
  const visits = useQuery(api.health.visits.list, { who: 'me' }) ?? [];
  const saveReview = useMutation(api.health.records.saveReview);
  const addMed = useMutation(api.health.meds.add);
  const remove = useMutation(api.health.records.remove);
  const [form, setForm] = useState<null | { type: RecordType; title: string; date: string; provider: string; doctor: string; folder: string; visitId: string; cost: string; preventive: boolean; notes: string }>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [medsAdded, setMedsAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const x: Extraction = useMemo(() => {
    try {
      return r?.extractionJson ? JSON.parse(r.extractionJson) : {};
    } catch {
      return {};
    }
  }, [r?.extractionJson]);

  useEffect(() => {
    if (!r || form) return;
    setForm({
      type: r.type as RecordType,
      title: r.title === 'Reading…' ? '' : r.title,
      date: r.date,
      provider: r.provider ?? '',
      doctor: r.doctor ?? '',
      folder: r.folder ?? '',
      visitId: r.visitId ?? '',
      cost: x.amount ? String(x.amount) : r.cost != null ? String(r.cost) : '',
      preventive: !!r.preventive,
      notes: r.notes ?? '',
    });
    const source: XResult[] = x.results?.length ? x.results : r.results.map((v) => ({ ...v, confidence: 'high' }));
    setRows(
      source.map((v, i) => ({
        key: i,
        code: v.code ?? undefined,
        name: v.name,
        value: v.value != null ? String(v.value) : v.valueText ?? '',
        unit: v.unit ?? '',
        ref: v.refText ?? (v.refLow != null || v.refHigh != null ? `${v.refLow ?? ''}${v.refLow != null && v.refHigh != null ? ' - ' : v.refHigh != null ? '<' : '>'}${v.refHigh ?? ''}` : ''),
        low: v.confidence === 'low',
        readAs: v.readAs ?? undefined,
        flag: v.flag ?? undefined,
      })),
    );
  }, [r, x, form]);

  if (!r || !form) return <p className="py-20 text-center text-white/40">Loading…</p>;
  const set = (k: keyof typeof form, v: string | boolean) => setForm({ ...form, [k]: v });
  const setRow = (key: number, patch: Partial<EditRow>) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch, low: false } : row)));

  const save = async () => {
    setBusy(true);
    const ok = await attempt(() =>
      saveReview({
        id,
        type: form.type,
        title: form.title || typeInfo(form.type).label.replace(/s$/, ''),
        date: form.date,
        provider: form.provider,
        doctor: form.doctor,
        folder: form.folder,
        visitId: (form.visitId || undefined) as Id<'appointments'> | undefined,
        notes: form.notes,
        cost: num(form.cost),
        preventive: form.preventive,
        results: rows
          .filter((row) => row.name.trim() && row.value.trim())
          .map((row) => {
            const n = num(row.value);
            const isNum = n != null && /^[<>]?\s*-?[\d.,]+$/.test(row.value.trim());
            return { code: row.code, name: row.name, value: isNum ? n : undefined, valueText: isNum ? undefined : row.value, unit: row.unit || undefined, refText: row.ref || undefined, flag: !isNum && row.flag === 'abnormal' ? ('abnormal' as const) : undefined };
          }),
        vaccines: (x.vaccines ?? []).map((v) => ({ vaccine: v.vaccine, dose: v.dose ?? undefined, date: v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : form.date })),
      }),
    );
    setBusy(false);
    if (ok !== undefined) {
      haptic('success');
      onDone();
    }
  };

  const addPrescribed = async (m: XMed) => {
    const times = (m.times ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t));
    const endDate = m.durationDays ? new Date(Date.parse(`${form.date}T00:00:00Z`) + (m.durationDays - 1) * 86_400_000).toISOString().slice(0, 10) : undefined;
    const ok = await attempt(() =>
      addMed({
        name: m.name,
        strength: m.strength ?? undefined,
        form: m.form ?? undefined,
        instructions: [m.frequency, m.instructions].filter(Boolean).join(' · ') || undefined,
        prescriber: form.doctor || undefined,
        kind: 'medicine',
        schedule: m.asNeeded || !times.length ? { type: 'prn', times: [], startDate: form.date } : { type: 'daily', times, startDate: todayStr() > form.date ? todayStr() : form.date, endDate },
        recordId: id,
      }),
    );
    if (ok) setMedsAdded([...medsAdded, m.name]);
  };

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-1">
        <h1 className="dot-matrix text-[1.7rem] font-medium leading-tight">Check what we read</h1>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">Nothing is saved until you confirm</p>
      </header>
      {r.nameMatch === 'mismatch' && (
        <Card className="border-coral/40">
          <span className="flex items-center gap-2 text-coral"><AlertTriangle size={16} />The name on this report is “{r.reportName}”</span>
          <span className="text-sm text-white/55">That doesn't look like yours. If it's your partner's, delete it here and add it from their phone.</span>
        </Card>
      )}
      {r.nameMatch === 'match' && <Pill tone="sage"><Check size={13} />Name on report matches</Pill>}
      <FilesStrip files={r.files} />
      {r.summary && <AiCard text={r.summary} />}
      <Card>
        <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Lipid profile + HbA1c" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type"><Select value={form.type} onChange={(v) => set('type', v)} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} /></Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Lab / hospital"><Input value={form.provider} onChange={(e) => set('provider', e.target.value)} /></Field>
          <Field label="Doctor"><Input value={form.doctor} onChange={(e) => set('doctor', e.target.value)} /></Field>
          <Field label="Folder"><Input value={form.folder} onChange={(e) => set('folder', e.target.value)} placeholder="Thyroid follow-up" /></Field>
          <Field label="Cost ₹"><Input inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
        </div>
        {visits.length > 0 && (
          <Field label="Link to a visit">
            <Select value={form.visitId} onChange={(v) => set('visitId', v)} options={[{ value: '', label: 'None' }, ...visits.slice(0, 20).map((v) => ({ value: v._id, label: `${v.title} · ${new Date(v.start).toLocaleDateString('en-IN')}` }))]} />
          </Field>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Preventive check-up <span className="block text-xs text-white/45">Counts toward the 80D ₹5,000 limit</span></span>
          <Toggle on={form.preventive} onChange={(v) => set('preventive', v)} label="Preventive check-up" />
        </div>
      </Card>

      <Section title={`${rows.length} values found`} action={<button className="text-xs normal-case tracking-normal text-nothing-purple" onClick={() => setRows([...rows, { key: Date.now(), name: '', value: '', unit: '', ref: '', low: false }])}>Add a value</button>}>
        {rows.length > 0 && (
          <div className="glass divide-y divide-white/[0.07]">
            {rows.map((row) => (
              <div key={row.key} className={cx('space-y-2 p-3', row.low && 'bg-gold/10')}>
                {row.low && <p className="text-xs text-gold">Blurry{row.readAs ? `: read as “${row.readAs}”` : ''}. Please check.</p>}
                <div className="flex gap-2">
                  <input aria-label="Test" value={row.name} onChange={(e) => setRow(row.key, { name: e.target.value })} className="nothing-input min-w-0 flex-[2] !px-3 !py-2" />
                  <button type="button" aria-label="Remove" onClick={() => setRows(rows.filter((x2) => x2.key !== row.key))} className="text-white/30"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input aria-label="Result" value={row.value} onChange={(e) => setRow(row.key, { value: e.target.value })} className="nothing-input !px-3 !py-2 font-mono" placeholder="Result" />
                  <input aria-label="Unit" value={row.unit} onChange={(e) => setRow(row.key, { unit: e.target.value })} className="nothing-input !px-3 !py-2" placeholder="Unit" />
                  <input aria-label="Range" value={row.ref} onChange={(e) => setRow(row.key, { ref: e.target.value })} className="nothing-input !px-3 !py-2 font-mono" placeholder="Range" />
                </div>
              </div>
            ))}
          </div>
        )}
        <Note>Each value is judged against the range printed on this report, because labs differ. Units in mmol/L are converted so charts line up.</Note>
      </Section>

      {(x.medications?.length ?? 0) > 0 && (
        <Section title="Medicines on this prescription">
          <List>
            {x.medications!.map((m) => (
              <Row
                key={m.name}
                icon={<PillIcon size={17} />}
                tone="gold"
                title={[m.name, m.strength].filter(Boolean).join(' ')}
                meta={[m.frequency, m.times?.join(', '), m.durationDays ? `${m.durationDays} days` : null, m.instructions].filter(Boolean).join(' · ')}
                end={medsAdded.includes(m.name) ? <Pill tone="sage">Added</Pill> : <Pill tone="purple" onClick={() => addPrescribed(m)}>Add to Medicines</Pill>}
              />
            ))}
          </List>
        </Section>
      )}
      {(x.vaccines?.length ?? 0) > 0 && <Note>{x.vaccines!.length} vaccine dose(s) found. They'll be added to Prevention when you save.</Note>}
      {(x.diagnoses?.length ?? 0) > 0 && <Note>Diagnoses mentioned: {x.diagnoses!.join(', ')}. Add any that matter to History.</Note>}

      <div className="flex gap-2">
        <Btn kind="secondary" onClick={async () => { if (await confirmDialog({ title: 'Delete this upload?', confirmLabel: 'Delete', danger: true })) { await attempt(() => remove({ id })); onDone(); } }}>Delete</Btn>
        <Btn onClick={save} busy={busy}>Save record + {rows.filter((x2) => x2.value.trim()).length} values</Btn>
      </div>
    </div>
  );
}

function AiCard({ text, questions }: { text: string; questions?: string[] }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-3xl border border-nothing-purple/35 bg-nothing-purple/[0.08] p-4">
      <span className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-nothing-purple"><Sparkles size={14} />In plain words</span>
      <p className="text-[15px] leading-relaxed">{text}</p>
      {questions && questions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-white/45">Worth asking your doctor</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      )}
      <span className="text-xs text-white/40">Written by AI from this report. It can be wrong. Check with your doctor.</span>
    </div>
  );
}

function FilesStrip({ files }: { files: { name: string; mime: string; url: string | null }[] }) {
  if (!files.length) return null;
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {files.map((f, i) => (
        <a key={i} href={f.url ?? '#'} target="_blank" rel="noreferrer" className="glass flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[11px] text-white/50">
          {f.mime.startsWith('image/') && f.url ? <img src={f.url} alt={f.name} className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 p-2 text-center"><FileText size={20} />PDF</span>}
        </a>
      ))}
    </div>
  );
}

/* ---------------- Record detail ---------------- */

function RecordDetail({ id, onClose, onReview }: { id: Id<'healthRecords'>; onClose: () => void; onReview: () => void }) {
  const r = useQuery(api.health.records.get, { id });
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.health.records.update);
  const remove = useMutation(api.health.records.remove);
  const reread = useMutation(api.health.records.reread);
  const markViewed = useMutation(api.health.records.markViewed);
  const addExpense = useMutation(api.expenses.add);
  const upload = useUpload();
  const morePages = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    if (r && !r.isMine) void markViewed({ id }).catch(() => {});
  }, [r?.isMine, id, markViewed, r]);

  if (r === undefined) return <p className="py-20 text-center text-white/40">Loading…</p>;
  if (!r) return <Empty icon={FileText} title="This record was deleted" />;
  const t = typeInfo(r.type);

  const toSplit = async () => {
    if (!r.cost) return;
    const expenseId = await attempt(() => addExpense({ amount: r.cost!, splitRatio: 50, category: 'Medical', currency: settings?.currency ?? 'INR', note: r.title, spentAt: Date.parse(`${r.date}T12:00:00`) }));
    if (expenseId) await attempt(() => update({ id, expenseId }));
  };

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-1">
        <Pill tone={t.tone}>{t.label.replace(/s$/, '')}</Pill>
        <h1 className="dot-matrix text-[1.7rem] font-medium leading-tight">{r.title}</h1>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{[r.provider, fmtDate(r.date)].filter(Boolean).join(' · ')}</p>
      </header>
      {r.status === 'review' && r.isMine && <Btn onClick={onReview}>Check the values and save</Btn>}
      {r.status === 'failed' && r.isMine && (
        <Card className="border-coral/40">
          <span className="text-coral">{r.error ?? "Couldn't read this document"}</span>
          <Btn kind="secondary" onClick={() => attempt(() => reread({ id }))}><RefreshCw size={16} />Try reading again</Btn>
        </Card>
      )}
      <FilesStrip files={r.files} />
      {r.summary && <AiCard text={r.summary} questions={r.questions} />}

      {r.results.length > 0 && (
        <Section title="Values">
          <List>
            {r.results.map((v) => (
              <Row
                key={v._id}
                title={v.name}
                meta={[v.refText ?? (v.refLow != null || v.refHigh != null ? `Range ${v.refLow ?? ''}–${v.refHigh ?? ''}` : null), v.unit].filter(Boolean).join(' · ')}
                onClick={() => { setHealthIntent('health-labs', `marker:${r.ownerId}:${v.code}`); onClose(); goToTab('health-labs'); }}
                end={<><span className="font-mono text-[15px]">{v.value ?? v.valueText}</span>{v.flag && v.flag !== 'normal' && <Pill tone={flagTone(v.flag)}>{flagLabel(v.flag)}</Pill>}</>}
              />
            ))}
          </List>
        </Section>
      )}

      <List>
        {r.doctor && <Row title="Doctor" end={<span className="text-sm text-white/70">{r.doctor}</span>} />}
        {r.visit && <Row title="Visit" end={<span className="text-sm text-nothing-purple">{r.visit.title}</span>} />}
        {r.folder && <Row title="Folder" end={<span className="text-sm text-white/70">{r.folder}</span>} />}
        {r.cost != null && (
          <Row
            icon={<Wallet size={16} />}
            title={`Cost ${money(r.cost)}`}
            end={r.expenseId ? <Pill tone="sage">In Split</Pill> : r.isMine ? <Pill tone="purple" onClick={toSplit}>Add to Split</Pill> : undefined}
          />
        )}
        <Row title="Added from" end={<span className="text-sm text-white/55">{{ upload: 'Upload', scan: 'Scan', share: 'Shared in', abha: 'ABHA', fhir: 'FHIR import', manual: 'Typed in' }[r.source]}</span>} />
      </List>

      {r.isMine && (
        <>
          <Field label="Notes">
            <TextArea value={notes ?? r.notes ?? ''} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes != null && notes !== (r.notes ?? '') && attempt(() => update({ id, notes }))} placeholder="Anything to remember about this" />
          </Field>
          <input
            ref={morePages}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              await attempt(async () => {
                const up = [];
                for (const f of files) up.push(await upload(f));
                await update({ id, addFiles: up });
              });
            }}
          />
          <div className="flex gap-2">
            <Btn kind="secondary" onClick={() => morePages.current?.click()}><Plus size={16} />Add pages</Btn>
            <Btn kind="danger" onClick={async () => { if (await confirmDialog({ title: `Delete “${r.title}”?`, body: 'Its files and values go with it.', confirmLabel: 'Delete', danger: true })) { await attempt(() => remove({ id })); onClose(); } }}><Trash2 size={16} />Delete</Btn>
          </div>
        </>
      )}
      {!r.isMine && <Note><Dot tone="azure" /> This is your partner's record. They can see that you opened it.</Note>}
    </div>
  );
}

export { AiCard, FilesStrip };

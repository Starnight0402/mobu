import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';
import { useQuery, useMutation } from '../../lib/queryCache';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { BottomSheet } from '../BottomSheet';
import { noticeDialog } from '../Dialog';
import { useBackHandler } from '../../lib/backButtonStack';
import { goToTab, historyIndex } from '../../lib/navigation';
import { compressImage } from '../../lib/image';
import { haptic } from '../../lib/haptics';

/*
 * The Health section's shared pieces: the Me / Partner / Both switch, screen
 * header, cards, rows, pills, sheets, form fields, charts and helpers. Built
 * from the app's own glass recipe and tokens so Health looks like Mobu.
 */

export type Who = 'me' | 'partner' | 'both';

/* ---------------- Me / Partner / Both (shared across screens) ---------------- */

const WHO_KEY = 'mobu-health-who';
let who: Who = (() => {
  try {
    const v = localStorage.getItem(WHO_KEY);
    return v === 'me' || v === 'partner' || v === 'both' ? v : 'both';
  } catch {
    return 'both';
  }
})();
const whoListeners = new Set<() => void>();
export function setWho(next: Who) {
  who = next;
  try {
    localStorage.setItem(WHO_KEY, next);
  } catch {
    /* private mode */
  }
  whoListeners.forEach((l) => l());
}
export function useWho(): [Who, (w: Who) => void] {
  const value = useSyncExternalStore(
    (l) => {
      whoListeners.add(l);
      return () => whoListeners.delete(l);
    },
    () => who,
  );
  return [value, setWho];
}

/** Names and ids of the two of you. */
export function usePeople() {
  const me = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const meId = me?._id as Id<'users'> | undefined;
  const partnerId = partner?._id as Id<'users'> | undefined;
  const meName = me?.name ?? 'Me';
  const partnerName = partner?.name ?? 'Partner';
  const isMe = useCallback((id: string | undefined) => !!id && id === meId, [meId]);
  const nameOf = useCallback((id: string | undefined) => (id === meId ? meName : partnerName), [meId, meName, partnerName]);
  return { meId, partnerId, meName, partnerName, isMe, nameOf, hasPartner: !!partner };
}

/* ---------------- Basics ---------------- */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Av({ isMe, name, size = 'md' }: { isMe: boolean; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-[18px] h-[18px] text-[9px]' : size === 'lg' ? 'w-10 h-10 text-base' : 'w-[22px] h-[22px] text-[11px]';
  return (
    <span
      className={cx(s, 'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-nothing-black', isMe ? 'bg-nothing-purple' : 'bg-azure')}
      aria-label={name}
    >
      {(name ?? (isMe ? 'M' : 'P')).trim().charAt(0).toUpperCase()}
    </span>
  );
}

export type Tone = 'coral' | 'gold' | 'sage' | 'purple' | 'azure' | 'muted';
const PILL: Record<Tone, string> = {
  coral: 'bg-coral/15 text-coral',
  gold: 'bg-gold/15 text-gold',
  sage: 'bg-sage/15 text-sage',
  purple: 'bg-nothing-purple/15 text-nothing-purple',
  azure: 'bg-azure/15 text-azure',
  muted: 'bg-white/10 text-white/60',
};
const DOT: Record<Tone, string> = {
  coral: 'bg-coral',
  gold: 'bg-gold',
  sage: 'bg-sage',
  purple: 'bg-nothing-purple',
  azure: 'bg-azure',
  muted: 'bg-white/25',
};

export function Pill({ tone = 'muted', children, onClick }: { tone?: Tone; children: React.ReactNode; onClick?: () => void }) {
  const cls = cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium leading-none', PILL[tone]);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}
export const Dot = ({ tone }: { tone: Tone }) => <span className={cx('inline-block h-[7px] w-[7px] shrink-0 rounded-full', DOT[tone])} />;

export const flagTone = (flag?: string | null): Tone =>
  flag === 'high' || flag === 'low' || flag === 'abnormal' ? 'coral' : flag === 'borderline' ? 'gold' : flag === 'normal' ? 'sage' : 'muted';
export const flagLabel = (flag?: string | null) =>
  flag === 'high' ? 'High' : flag === 'low' ? 'Low' : flag === 'abnormal' ? 'Abnormal' : flag === 'borderline' ? 'Near edge' : flag === 'normal' ? 'In range' : '';

/* ---------------- Layout ---------------- */

export function Screen({
  title,
  sub,
  back = 'health',
  backLabel = 'Health',
  actions,
  children,
}: {
  title: string;
  sub?: string;
  back?: string | null;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 pb-36">
      {back && (
        <button
          type="button"
          onClick={() => (historyIndex() > 0 ? window.history.back() : goToTab(back))}
          className="-mb-2 flex items-center gap-1 text-sm text-white/40"
        >
          <ChevronLeft size={16} />
          {backLabel}
        </button>
      )}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="dot-matrix text-[2rem] font-medium leading-none tracking-tight [text-wrap:balance]">{title}</h1>
          {sub && <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{sub}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function IconBtn({ icon: Icon, label, onClick, primary }: { icon: LucideIcon; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        haptic('tap');
        onClick();
      }}
      className={cx(
        'flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95',
        primary ? 'bg-white text-black shadow-xl' : 'glass',
      )}
    >
      <Icon size={primary ? 20 : 17} />
    </button>
  );
}

export function Section({ title, action, children }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      {(title || action) && (
        <div className="flex items-baseline justify-between px-1 text-[11px] uppercase tracking-[0.14em] text-white/40">
          <span className="flex items-center gap-2">{title}</span>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const LinkBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="text-xs normal-case tracking-normal text-nothing-purple">
    {children}
  </button>
);

export const Card = ({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) =>
  onClick ? (
    <button type="button" onClick={onClick} className={cx('glass flex w-full flex-col gap-3 p-4 text-left', className)}>
      {children}
    </button>
  ) : (
    <div className={cx('glass flex flex-col gap-3 p-4', className)}>{children}</div>
  );

export const List = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cx('glass divide-y divide-white/[0.07] overflow-hidden', className)}>{children}</div>
);

export function Row({
  icon,
  title,
  meta,
  end,
  onClick,
  tone,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  end?: React.ReactNode;
  onClick?: () => void;
  tone?: Tone;
}) {
  const inner = (
    <>
      {icon && (
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone ? PILL[tone] : 'bg-white/[0.07]')}>{icon}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-snug">{title}</span>
        {meta && <span className="text-xs leading-snug text-white/45">{meta}</span>}
      </span>
      {end && <span className="flex shrink-0 flex-col items-end gap-1 text-right">{end}</span>}
      {onClick && !end && <ChevronRight size={16} className="shrink-0 text-white/20" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      {inner}
    </button>
  ) : (
    <div className="flex w-full items-center gap-3 px-4 py-3">{inner}</div>
  );
}

export function Empty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-2 px-6 py-8 text-center">
      <Icon size={22} className="text-white/30" />
      <p className="text-[15px]">{title}</p>
      {body && <p className="max-w-xs text-sm text-white/45">{body}</p>}
      {action}
    </div>
  );
}

export const Note = ({ children }: { children: React.ReactNode }) => <p className="px-1 text-xs leading-relaxed text-white/40">{children}</p>;

export function Tiles({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cx('grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{children}</div>;
}
export function Tile({ label, value, unit, sub, icon: Icon, onClick, tone }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; icon?: LucideIcon; onClick?: () => void; tone?: Tone }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-white/45">
        {Icon && <Icon size={13} />}
        {label}
      </span>
      <span className={cx('font-mono text-xl leading-tight tracking-tight', tone === 'coral' && 'text-coral')}>
        {value}
        {unit && <small className="ml-0.5 font-sans text-[11px] tracking-normal text-white/45">{unit}</small>}
      </span>
      {sub && <span className="text-[11px] text-white/45">{sub}</span>}
    </>
  );
  const cls = 'glass flex flex-col gap-1 rounded-[20px] p-3 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------------- Controls ---------------- */

export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { value: NoInfer<T>; label: React.ReactNode }[]; onChange: (v: NoInfer<T>) => void; small?: boolean }) {
  return (
    <div className={cx('flex gap-0.5 rounded-full p-1', small ? 'bg-white/[0.06]' : 'glass')} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => {
            haptic('select');
            onChange(o.value);
          }}
          className={cx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] transition-colors',
            small ? 'h-8 px-2' : 'h-9 px-2',
            o.value === value ? 'bg-raised text-white shadow-[inset_0_1px_0_var(--glass-highlight)]' : 'text-white/55',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PersonSwitch({ allowBoth = true }: { allowBoth?: boolean }) {
  const [value, set] = useWho();
  const { meName, partnerName, hasPartner } = usePeople();
  if (!hasPartner) return null;
  const opts: { value: Who; label: React.ReactNode }[] = [
    { value: 'me', label: <><Av isMe size="sm" name={meName} />Me</> },
    { value: 'partner', label: <><Av isMe={false} size="sm" name={partnerName} />{partnerName.split(' ')[0]}</> },
  ];
  if (allowBoth) opts.push({ value: 'both', label: 'Both' });
  return <Segmented value={!allowBoth && value === 'both' ? 'me' : value} options={opts} onChange={set} />;
}

export function Chips<T extends string>({ value, options, onChange, multi }: { value: T | T[]; options: { value: NoInfer<T>; label: string }[]; onChange: (v: NoInfer<T>) => void; multi?: boolean }) {
  const on = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            haptic('select');
            onChange(o.value);
          }}
          className={cx(
            'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] transition-colors',
            on(o.value) ? 'border-transparent bg-white text-black' : 'border-white/15 bg-surface text-white/65',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        haptic(on ? 'toggleOff' : 'toggleOn');
        onChange(!on);
      }}
      className={cx('relative h-[26px] w-[42px] shrink-0 rounded-full transition-colors', on ? 'bg-sage' : 'bg-white/20')}
    >
      <span className={cx('absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-nothing-black transition-transform', on && 'translate-x-4')} />
    </button>
  );
}

export function Btn({ children, onClick, kind = 'primary', disabled, busy, type = 'button', className }: { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; busy?: boolean; type?: 'button' | 'submit'; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] transition-all active:scale-[0.98] disabled:opacity-40',
        kind === 'primary' && 'bg-white text-black',
        kind === 'secondary' && 'glass',
        kind === 'danger' && 'bg-coral/15 text-coral',
        className,
      )}
    >
      {busy ? <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> : children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-white/40">{label}</span>
      {children}
      {hint && <span className="ml-2 text-[11px] text-white/35">{hint}</span>}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...p }, ref) => (
  <input ref={ref} {...p} className={cx('nothing-input w-full', className)} />
));
Input.displayName = 'Input';
export const TextArea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx('nothing-input min-h-[84px] w-full resize-y', p.className)} />
);
export function Select<T extends string>({ value, onChange, options, ...p }: { value: T; onChange: (v: NoInfer<T>) => void; options: { value: NoInfer<T>; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select {...p} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx('nothing-input w-full appearance-none', p.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Bottom sheet with Back-button support and a scrollable body. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useBackHandler(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <BottomSheet label={title} onClose={onClose}>
          <div className="max-h-[78dvh] space-y-4 overflow-y-auto overscroll-contain pb-2">
            <h2 className="text-[22px] font-medium tracking-tight">{title}</h2>
            {children}
          </div>
        </BottomSheet>
      )}
    </AnimatePresence>
  );
}

/** A full-screen layer over the current screen (detail views), with Back support. */
export function Overlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useBackHandler(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-nothing-black" style={{ paddingTop: 'max(1.75rem, calc(env(safe-area-inset-top) + 1rem))' }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: 'var(--ambient)' }} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <button type="button" onClick={onClose} className="mb-3 flex items-center gap-1 text-sm text-white/40">
          <ChevronLeft size={16} />
          Back
        </button>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Errors and actions ---------------- */

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/Uncaught Error: ([^\n]+)/);
  return (m ? m[1] : msg.replace(/^\[CONVEX[^\]]*\]\s*(\[[^\]]*\]\s*)?/, '').replace(/Server Error\s*/, '')).trim() || 'Something went wrong';
}

/** Runs an action; on failure shows why in a dialog. Returns the result or undefined. */
export async function attempt<T>(fn: () => Promise<T>, title = "Couldn't save that"): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    haptic('error');
    await noticeDialog(title, errorText(e));
    return undefined;
  }
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, title?: string) => {
    setBusy(true);
    try {
      return await attempt(fn, title);
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}

/* ---------------- Files ---------------- */

export function useUpload() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  return useCallback(
    async (file: File | Blob, opts: { compress?: boolean; name?: string } = {}) => {
      let blob: Blob = file;
      const mime = file.type || 'application/octet-stream';
      if (opts.compress !== false && /^image\//.test(mime) && !/gif|svg/.test(mime)) {
        // Documents need to stay legible: larger than photo compression.
        blob = await compressImage(file as File, 2400, 0.85, 1_800_000);
      }
      if (blob.size > 20 * 1024 * 1024) throw new Error('Files can be up to 20 MB');
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || mime }, body: blob });
      if (!res.ok) throw new Error('Upload failed. Check your connection and try again.');
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      return { storageId, name: opts.name ?? (file as File).name ?? 'file', mime: blob.type || mime, size: blob.size };
    },
    [generateUploadUrl],
  );
}

/* ---------------- Dates and numbers ---------------- */

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function fmtDate(s?: string | null, withYear = true) {
  if (!s) return '';
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(`${s}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(+d)) return s;
  const sameYear = s.slice(0, 4) === String(new Date().getFullYear());
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear && !sameYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function fmtWhen(ms: number) {
  const d = new Date(ms);
  const t = new Date();
  const y = new Date(Date.now() - 86_400_000);
  const day =
    d.toDateString() === t.toDateString()
      ? 'Today'
      : d.toDateString() === y.toDateString()
        ? 'Yesterday'
        : d.toDateString() === new Date(Date.now() + 86_400_000).toDateString()
          ? 'Tomorrow'
          : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${fmtTime(ms)}`;
}
export const fmtNum = (n: number | undefined | null, dp = 1) =>
  n == null || Number.isNaN(n) ? '–' : Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { maximumFractionDigits: dp });
export const money = (n?: number | null) => (n == null ? '–' : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const num = (s: string): number | undefined => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
export function localInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- Charts ---------------- */

type ChartTone = 'purple' | 'azure' | 'coral' | 'muted' | 'sage';
const STROKE: Record<ChartTone, string> = {
  purple: 'var(--color-nothing-purple)',
  azure: 'var(--color-azure)',
  coral: 'var(--color-coral)',
  sage: 'var(--color-sage)',
  muted: 'color-mix(in oklab, var(--color-white) 45%, transparent)',
};
const POINT: Record<string, string> = { hi: 'var(--color-coral)', bd: 'var(--color-gold)', ok: 'var(--color-sage)' };

export interface Series {
  points: { x: number; y: number }[];
  tone: ChartTone;
  dots?: boolean;
  labels?: boolean;
}

/**
 * A small, honest line chart: one scale for marks and labels, an optional
 * shaded "normal" band, dashed limit lines and event markers (medicine started).
 */
export function TrendChart({
  series,
  band,
  limits = [],
  events = [],
  height = 150,
  xLabels = [],
  yTicks,
  status,
  label,
}: {
  series: Series[];
  band?: [number | undefined, number | undefined];
  limits?: number[];
  events?: { x: number; label: string }[];
  height?: number;
  xLabels?: { x: number; label: string }[];
  yTicks?: number[];
  status?: (y: number) => 'hi' | 'bd' | 'ok';
  label: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const W = 320;
  const H = height;
  const P = { l: 32, r: 14, t: 16, b: 22 };
  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...limits, ...(band ? band.filter((b): b is number => b != null) : [])];
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x0 === x1) {
    x0 -= 1;
    x1 += 1;
  }
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.15 || Math.abs(y1) * 0.1 || 1;
  y0 -= pad;
  y1 += pad;
  const X = (x: number) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const Y = (y: number) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = yTicks ?? niceTicks(y0, y1);
  const grid = 'color-mix(in oklab, var(--color-white) 10%, transparent)';
  const tickFill = 'color-mix(in oklab, var(--color-white) 45%, transparent)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
      {band && (band[0] != null || band[1] != null) && (
        <rect
          x={P.l}
          width={W - P.l - P.r}
          y={Y(Math.min(band[1] ?? y1, y1))}
          height={Math.max(0, Y(Math.max(band[0] ?? y0, y0)) - Y(Math.min(band[1] ?? y1, y1)))}
          rx={4}
          fill="color-mix(in oklab, var(--color-sage) 16%, transparent)"
        />
      )}
      {ticks.filter((t) => t >= y0 && t <= y1).map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} stroke={grid} />
          <text x={P.l - 6} y={Y(t) + 3} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill={tickFill}>
            {fmtNum(t)}
          </text>
        </g>
      ))}
      {limits.map((t) => (
        <line key={`l${t}`} x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} stroke="var(--color-gold)" strokeDasharray="3 3" />
      ))}
      {events.filter((e) => e.x >= x0 && e.x <= x1).map((e) => (
        <g key={`${e.x}${e.label}`}>
          <line x1={X(e.x)} x2={X(e.x)} y1={P.t} y2={H - P.b} stroke={tickFill} strokeDasharray="2 3" />
          <text x={X(e.x) + 4} y={P.t + 6} fontSize={9} fill="color-mix(in oklab, var(--color-white) 65%, transparent)">
            {e.label}
          </text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} x={X(l.x)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'} fontSize={9} fontFamily="var(--font-mono)" fill={tickFill}>
          {l.label}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = [...s.points].sort((a, b) => a.x - b.x);
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={STROKE[s.tone]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {s.dots !== false &&
              pts.map((p, i) => (
                <g key={i}>
                  <circle cx={X(p.x)} cy={Y(p.y)} r={i === pts.length - 1 ? 5 : 3.5} fill={status ? POINT[status(p.y)] : STROKE[s.tone]} stroke="var(--color-black)" strokeWidth={2} />
                  {s.labels && (
                    <text x={X(p.x)} y={Y(p.y) - 9} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-white)">
                      {fmtNum(p.y)}
                    </text>
                  )}
                </g>
              ))}
          </g>
        );
      })}
    </svg>
  );
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const mult = [1, 2, 2.5, 5, 10].find((m) => span / (m * step) <= 4) ?? 10;
  const s = mult * step;
  const out: number[] = [];
  for (let t = Math.ceil(lo / s) * s; t <= hi; t += s) out.push(Math.round(t * 1000) / 1000);
  return out;
}

export function Spark({ values, low, high }: { values: number[]; low?: number; high?: number }) {
  if (values.length < 2) return <span className="inline-block w-16" />;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const X = (i: number) => 3 + (i / (values.length - 1)) * 58;
  const Y = (n: number) => 19 - ((n - mn) / (mx - mn || 1)) * 16;
  const last = values[values.length - 1];
  const tone = (high != null && last > high) || (low != null && last < low) ? 'var(--color-coral)' : 'var(--color-sage)';
  return (
    <svg viewBox="0 0 64 22" className="h-[22px] w-16 shrink-0 overflow-visible" aria-hidden>
      <polyline points={values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke="color-mix(in oklab, var(--color-white) 40%, transparent)" strokeWidth={1.5} />
      <circle cx={X(values.length - 1)} cy={Y(last)} r={3} fill={tone} />
    </svg>
  );
}

/** Months-since-epoch-ish x for date strings, so charts space points by real time. */
export const dayX = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000;

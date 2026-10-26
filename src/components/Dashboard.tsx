import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { motion } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { TogetherCalendar } from './TogetherCalendar';
import { useLightbox } from './Lightbox';
import { Avatar } from './Avatar';
import { useNotifications } from './NotificationProvider';
import { currencySymbol } from '../lib/currency';
import { haptic } from '../lib/haptics';
import { Image as ImageIcon, Bell, Phone, MessageCircle, Lock, Wallet, Flame, ChevronRight, Sparkles, Check } from 'lucide-react';

interface DashboardProps {
  /** Lets cards act as entry points into their full screens. */
  onNavigate: (tab: string) => void;
}

const MOODS = [
  { value: 2, label: 'Low' },
  { value: 4, label: 'Meh' },
  { value: 6, label: 'Okay' },
  { value: 8, label: 'Good' },
  { value: 10, label: 'Great' },
] as const;

const DAY_MS = 86_400_000;

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Whole days since a YYYY-MM-DD, counting that day as day 1. */
function dayCount(startDate: string): number | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(+start)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((+today - +start) / DAY_MS) + 1);
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const me = useQuery(api.users.current);
  const partner = useQuery(api.users.partner);
  const settings = useQuery(api.settings.get);
  const recent = useQuery(api.tracking.list) ?? [];
  const memories = useQuery(api.memories.list) ?? [];
  const onThisDay = useQuery(api.memories.onThisDay) ?? [];
  const insights = useQuery(api.insights.list) ?? [];
  const capsules = useQuery(api.capsules.list) ?? [];
  const streak = useQuery(api.tracking.streak);
  const balance = useQuery(api.expenses.balance);
  const live = useQuery(api.liveLocations.both);
  const addEntry = useMutation(api.tracking.add);
  const { openGallery } = useLightbox();
  const { unreadTotal } = useNotifications();

  const [moodSaved, setMoodSaved] = useState<number | null>(null);
  const [moodError, setMoodError] = useState(false);

  const currency = settings?.currency ?? 'USD';
  const days = dayCount(settings?.startDate ?? '');

  // The photo card: a memory from this day in a past year if there is one,
  // otherwise the latest photo.
  const feature = onThisDay.find((m) => m.imageUrl) ?? memories.find((m) => m.imageUrl);
  const featureIsOnThisDay = !!feature && onThisDay.some((m) => m._id === feature._id);
  const featureYears = feature
    ? Math.max(1, new Date().getFullYear() - new Date(feature.memoryDate ?? feature._creationTime).getFullYear())
    : 0;
  const photos = useMemo(
    () =>
      memories
        .filter((m) => !!m.imageUrl)
        .map((m) => ({ src: m.imageUrl as string, alt: m.title, caption: m.title, subcaption: m.location })),
    [memories],
  );

  const distance =
    live?.mine && live?.partner
      ? kmBetween(
          { lat: live.mine.lat, lng: live.mine.lng },
          { lat: live.partner.lat, lng: live.partner.lng },
        )
      : null;

  const upcomingCapsule = capsules.find((c) => new Date(c.unlockDate) > new Date());
  const capsuleDays = upcomingCapsule
    ? Math.max(0, Math.ceil((+new Date(upcomingCapsule.unlockDate) - Date.now()) / DAY_MS))
    : null;
  const owed = balance?.byCurrency?.[0];

  const logMood = async (value: number) => {
    haptic('success');
    setMoodSaved(value);
    setMoodError(false);
    try {
      await addEntry({ type: 'mood', value, category: 'Mood' });
    } catch (err) {
      console.error('Mood log failed', err);
      setMoodSaved(null);
      setMoodError(true);
    }
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const partnerName = partner?.name ?? 'Your person';

  return (
    <div className="space-y-5 pb-32">
      <header className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-white/50">{today}</p>
        <button
          onClick={() => onNavigate('notifications')}
          aria-label={unreadTotal > 0 ? `Alerts, ${unreadTotal} unread` : 'Alerts'}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface text-white"
        >
          <Bell size={19} />
          {unreadTotal > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral" />}
        </button>
      </header>

      <section className="space-y-1.5">
        {days != null ? (
          <h1 className="font-display text-5xl font-medium leading-[1.02] tracking-tight">
            Day {days.toLocaleString()}
            <br />
            <span className="font-normal italic text-nothing-purple">of us.</span>
          </h1>
        ) : (
          <>
            <h1 className="font-display text-5xl font-medium leading-[1.02] tracking-tight">
              Hello,
              <br />
              <span className="font-normal italic text-nothing-purple">{me?.name ?? 'you'}.</span>
            </h1>
            <button onClick={() => onNavigate('settings')} className="text-sm text-nothing-purple underline underline-offset-4">
              Set your day one to start the counter
            </button>
          </>
        )}
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span>
            {me?.name ?? 'You'} &amp; {partnerName}
          </span>
          {!!streak?.days && (
            <span
              className="flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs text-gold"
              title="Consecutive days you've both logged something"
            >
              <Flame size={12} /> {streak.days}-day streak
            </span>
          )}
        </div>
      </section>

      <section className="glass flex items-center gap-3.5 p-3.5">
        <Avatar name={partner?.name} avatarUrl={partner?.avatarUrl} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{partnerName}</p>
          <p className="truncate text-sm text-white/60">
            {distance != null
              ? distance < 0.3
                ? "You're together"
                : `${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km away`
              : live?.partner
                ? 'Sharing location'
                : 'Location not shared'}
          </p>
        </div>
        <button
          onClick={() => onNavigate('call')}
          aria-label={`Call ${partnerName}`}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-white"
        >
          <Phone size={18} />
        </button>
        <button
          onClick={() => onNavigate('chat')}
          aria-label={`Message ${partnerName}`}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-nothing-purple text-black"
        >
          <MessageCircle size={18} />
        </button>
      </section>

      {feature && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-medium">{featureIsOnThisDay ? 'On this day' : 'Latest memory'}</h2>
            <button onClick={() => onNavigate('memories')} className="text-sm text-nothing-purple">
              All memories
            </button>
          </div>
          <button
            type="button"
            onClick={() => openGallery(photos, Math.max(0, photos.findIndex((p) => p.src === feature.imageUrl)))}
            className="relative block h-52 w-full overflow-hidden rounded-3xl bg-raised text-left"
            aria-label={`View ${feature.title}`}
          >
            <img src={feature.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            <span className="absolute inset-x-2 bottom-2 rounded-2xl border border-white/25 bg-black/25 p-3.5 shadow-lg backdrop-blur-xl backdrop-saturate-150">
              <span className="block text-xs uppercase tracking-[0.08em] text-white/80">
                {featureIsOnThisDay
                  ? `${featureYears} year${featureYears === 1 ? '' : 's'} ago`
                  : new Date(feature.memoryDate ?? feature._creationTime).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
              </span>
              <span className="mt-0.5 block font-display text-lg text-white">{feature.title}</span>
            </span>
          </button>
        </section>
      )}

      {photos.length > 1 && (
        <section className="glass p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-medium">
              <ImageIcon size={17} className="text-nothing-purple" /> Memories
            </h2>
            <span className="text-xs text-white/60">{memories.length} total</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.slice(0, 3).map((photo, i) => (
              <button
                key={photo.src}
                type="button"
                onClick={() => openGallery(photos, i)}
                aria-label={`View ${photo.alt}`}
                className="relative aspect-square overflow-hidden rounded-2xl border border-white/20 shadow-md"
              >
                <img src={photo.src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                <span className="absolute inset-x-1 bottom-1 truncate rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white backdrop-blur-md">
                  {photo.alt}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="font-display text-xl font-medium">How are you today?</h2>
        <div className="flex gap-2" role="group" aria-label="Log your mood">
          {MOODS.map((m) => {
            const on = moodSaved === m.value;
            return (
              <button
                key={m.value}
                onClick={() => logMood(m.value)}
                aria-pressed={on}
                className={`flex h-11 flex-1 items-center justify-center gap-1 rounded-full text-[13px] transition-colors ${
                  on ? 'bg-nothing-purple font-semibold text-black' : 'border border-white/10 bg-surface text-white/60'
                }`}
              >
                {on && <Check size={13} />}
                {m.label}
              </button>
            );
          })}
        </div>
        {moodError && <p className="text-xs text-coral">Couldn't save that — try again.</p>}
        {moodSaved != null && !moodError && <p className="text-xs text-white/50">Logged. {partnerName} will see it in Our week.</p>}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button onClick={() => onNavigate('capsules')} className="glass flex flex-col gap-2.5 p-4 text-left">
          <Lock size={20} className="text-nothing-purple" />
          <span className="text-[13px] text-white/60">Next capsule</span>
          <span className="font-display text-2xl">
            {capsuleDays == null ? 'None yet' : capsuleDays === 0 ? 'Today' : `${capsuleDays} day${capsuleDays === 1 ? '' : 's'}`}
          </span>
        </button>
        <button onClick={() => onNavigate('split')} className="glass flex flex-col gap-2.5 p-4 text-left">
          <Wallet size={20} className="text-coral" />
          <span className="text-[13px] text-white/60">
            {!owed || Math.abs(owed.net) < 0.005 ? 'Split' : owed.net > 0 ? `${partnerName} owes you` : `You owe ${partnerName}`}
          </span>
          <span className="font-display text-2xl">
            {!owed || Math.abs(owed.net) < 0.005 ? 'All square' : `${currencySymbol(owed.currency)}${Math.abs(owed.net).toFixed(0)}`}
          </span>
        </button>
      </section>

      {insights.length > 0 && (
        <section className="rounded-3xl border border-nothing-purple/25 bg-nothing-purple/10 p-5">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-nothing-purple">
            <Sparkles size={13} /> Noticed
          </p>
          <p className="mt-1.5 font-display text-xl leading-snug">{insights[0].title}</p>
          {insights[0].content && <p className="mt-1 text-sm text-white/60 line-clamp-3">{insights[0].content}</p>}
        </section>
      )}

      <section className="glass p-5">
        <h2 className="mb-3 font-display text-xl font-medium">Our days together</h2>
        <TogetherCalendar size="wide" />
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-medium">Recent</h2>
            <button onClick={() => onNavigate('logs')} className="flex items-center gap-0.5 text-sm text-nothing-purple">
              All <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {recent.slice(0, 4).map((entry, i) => (
              <motion.div
                key={entry._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.category || entry.type}</p>
                  <p className="text-xs text-white/50">
                    {entry.user} ·{' '}
                    {new Date(entry._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {entry.type === 'money' ? `-${currencySymbol(currency)}${entry.value}` : entry.value}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

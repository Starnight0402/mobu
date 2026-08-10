import React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { KIND_ICONS, useNotifications } from './NotificationProvider';
import { haptic, hapticsSupported } from '../lib/haptics';
import { Bell, BellOff, CheckCheck, BellRing } from 'lucide-react';

function relativeTime(ms: number) {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const NotificationsView: React.FC<{ onNavigate: (tab: string) => void }> = ({
  onNavigate,
}) => {
  const notifications = useQuery(api.notifications.list) ?? [];
  const markAllRead = useMutation(api.notifications.markAllRead);
  const { permission, deviceRegistered, enable, unreadTotal } = useNotifications();

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const needsPermission = permission !== 'granted' || !deviceRegistered;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    const reason = await enable();
    if (reason) setError(reason);
    setBusy(false);
  };

  return (
    <div className="space-y-5 pb-32">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-medium tracking-tight dot-matrix">Alerts</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">
            {unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up'}
          </p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={() => {
              haptic('tap');
              void markAllRead();
            }}
            className="flex h-11 items-center gap-2 rounded-full glass px-4 text-[10px] uppercase tracking-widest text-white/60 transition-colors hover:text-white"
          >
            <CheckCheck size={14} /> Read all
          </button>
        )}
      </header>

      {permission === 'unsupported' ? (
        <div className="glass flex items-start gap-3 p-5">
          <BellOff size={18} className="mt-0.5 shrink-0 text-white/30" />
          <div>
            <p className="text-sm font-medium">Push isn't available in this browser</p>
            <p className="mt-1 text-[11px] text-white/40">
              Alerts will still show here and in the app, just not on your lock screen.
            </p>
          </div>
        </div>
      ) : needsPermission ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass space-y-4 border-nothing-purple/20 bg-nothing-purple/5 p-5"
        >
          <div className="flex items-start gap-3">
            <BellRing size={18} className="mt-0.5 shrink-0 text-nothing-purple" />
            <div>
              <p className="text-sm font-medium">Turn on notifications</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                So calls ring your phone and messages reach you when the app is closed. Add Mobu to
                your home screen first for the most reliable delivery.
              </p>
            </div>
          </div>
          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
          <button
            onClick={() => void turnOn()}
            disabled={busy}
            className="w-full rounded-2xl bg-nothing-purple py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        </motion.div>
      ) : (
        <div className="glass flex items-center gap-3 p-4">
          <Bell size={16} className="shrink-0 text-nothing-purple" />
          <p className="text-[11px] text-white/50">
            Notifications are on for this device{hapticsSupported ? ' · haptics supported' : ''}
          </p>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Bell size={22} className="text-white/20" />
          <p className="text-sm text-white/50">Nothing yet</p>
          <p className="text-[11px] text-white/30">
            Calls, messages and anything your partner logs will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = KIND_ICONS[n.kind] ?? Bell;
            const unread = !n.readAt;
            return (
              <button
                key={n._id}
                onClick={() => {
                  haptic('tap');
                  onNavigate(n.tab ?? 'home');
                }}
                className={`flex w-full items-center gap-3 p-4 text-left transition-colors ${
                  unread ? 'glass border-nothing-purple/20' : 'glass-dark hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    unread ? 'bg-nothing-purple/15' : 'bg-white/5'
                  }`}
                >
                  <Icon size={17} className={unread ? 'text-nothing-purple' : 'text-white/40'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${unread ? 'font-medium' : 'text-white/70'}`}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/40">{n.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[10px] text-white/30">{relativeTime(n._creationTime)}</span>
                  {unread && <span className="h-2 w-2 rounded-full bg-nothing-purple" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

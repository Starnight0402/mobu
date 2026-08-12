import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '../../convex/_generated/api';
import {
  currentSubscription,
  enablePush,
  disablePush,
  permissionState,
  setAppBadge,
  type SerializedSubscription,
} from '../lib/push';
import { haptic } from '../lib/haptics';
import {
  Bell,
  MessageCircle,
  Phone,
  PhoneMissed,
  Wallet,
  Image as ImageIcon,
  MapPin,
  Target,
  Sparkles,
  Lock,
  Flame,
} from 'lucide-react';

export const KIND_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  call: Phone,
  'missed-call': PhoneMissed,
  message: MessageCircle,
  expense: Wallet,
  memory: ImageIcon,
  checkin: MapPin,
  goal: Target,
  insight: Sparkles,
  capsule: Lock,
  streak: Flame,
};

interface Toast {
  id: number;
  kind: string;
  title: string;
  body: string;
  tab: string;
}

interface NotificationsApi {
  unreadByTab: Record<string, number>;
  unreadTotal: number;
  permission: NotificationPermission | 'unsupported';
  deviceRegistered: boolean;
  enable: () => Promise<string | null>;
  disable: () => Promise<void>;
  markTabRead: (tab: string) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
}

const NotificationContext = createContext<NotificationsApi | null>(null);

export function useNotifications(): NotificationsApi {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}

/**
 * Owns everything notification-shaped: push registration, the unread badge
 * counts that feed the nav, and the in-app toasts that stand in for a system
 * notification while the app is focused.
 */
export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigate: (tab: string) => void;
}> = ({ children, onNavigate }) => {
  const unread = useQuery(api.notifications.unread);
  const subscribeMutation = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribeMutation = useMutation(api.pushSubscriptions.unsubscribe);
  const subscribeFcmMutation = useMutation(api.pushSubscriptions.subscribeFcm);
  const unsubscribeFcmMutation = useMutation(api.pushSubscriptions.unsubscribeFcm);
  const markTabReadMutation = useMutation(api.notifications.markTabRead);

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const unreadByTab = unread?.byTab ?? {};
  const unreadTotal = unread?.total ?? 0;

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    haptic(t.kind === 'call' ? 'ring' : 'message');
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);

  // The device registers under whichever transport it subscribed with — a
  // browser endpoint or a native FCM token — each backed by its own mutation.
  const registerSubscription = useCallback(
    (sub: SerializedSubscription) =>
      sub.type === 'fcm'
        ? subscribeFcmMutation({ token: sub.token, label: sub.label })
        : subscribeMutation(sub),
    [subscribeFcmMutation, subscribeMutation],
  );

  /** Returns null on success, or a human-readable reason it didn't work. */
  const enable = useCallback(async (): Promise<string | null> => {
    try {
      const subscription = await enablePush();
      await registerSubscription(subscription);
      setDeviceRegistered(true);
      haptic('success');
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not enable notifications.';
    } finally {
      setPermission(await permissionState());
    }
  }, [registerSubscription]);

  const disable = useCallback(async () => {
    const existing = await disablePush();
    if (existing) {
      if (existing.type === 'fcm') await unsubscribeFcmMutation({ token: existing.token });
      else await unsubscribeMutation({ endpoint: existing.endpoint });
    }
    setDeviceRegistered(false);
  }, [unsubscribeMutation, unsubscribeFcmMutation]);

  useEffect(() => {
    void permissionState().then(setPermission);
  }, []);

  // If permission was granted on a previous visit, re-register silently so a
  // rotated endpoint/token or a cleared server row heals itself on next load.
  useEffect(() => {
    void (async () => {
      if ((await permissionState()) !== 'granted') return;
      const existing = await currentSubscription();
      if (existing) {
        await registerSubscription(existing).catch(() => {});
        setDeviceRegistered(true);
      }
    })();
  }, [registerSubscription]);

  // Native push (Android APK via FCM): foreground pushes become toasts, and
  // tapping a system notification navigates the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];

    handles.push(
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = (notification.data ?? {}) as { kind?: string; tab?: string };
        if (data.kind === 'call') return;
        toast({
          kind: data.kind ?? 'message',
          title: notification.title ?? '',
          body: notification.body ?? '',
          tab: data.tab ?? 'home',
        });
      }),
    );
    handles.push(
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = (action.notification.data ?? {}) as { tab?: string };
        if (data.tab) onNavigate(data.tab);
      }),
    );

    return () => {
      for (const handle of handles) void handle.then((h) => h.remove());
    };
  }, [toast, onNavigate]);

  // Messages from the service worker: foreground pushes become toasts, and a
  // notification tap navigates the already-open tab.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      if (data.source === 'mobu-push' && data.payload) {
        // An incoming call already takes over the whole screen with its own
        // ring and buzz; a toast on top of that is pure noise.
        if (data.payload.kind === 'call') return;
        toast({
          kind: data.payload.kind,
          title: data.payload.title,
          body: data.payload.body,
          tab: data.payload.tab,
        });
      } else if (data.source === 'mobu-navigate' && data.tab) {
        onNavigate(data.tab);
      } else if (data.source === 'mobu-resubscribe') {
        void enable();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [toast, onNavigate, enable]);

  // Deep link from a cold start via notificationclick's openWindow.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab) {
      onNavigate(tab);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [onNavigate]);

  useEffect(() => {
    setAppBadge(unreadTotal);
  }, [unreadTotal]);

  const markTabRead = useCallback(
    (tab: string) => {
      if ((unreadByTab[tab] ?? 0) > 0) void markTabReadMutation({ tab });
    },
    [unreadByTab, markTabReadMutation],
  );

  const value = useMemo<NotificationsApi>(
    () => ({
      unreadByTab,
      unreadTotal,
      permission,
      deviceRegistered,
      enable,
      disable,
      markTabRead,
      toast,
    }),
    [unreadByTab, unreadTotal, permission, deviceRegistered, enable, disable, markTabRead, toast],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-0 z-[250] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = KIND_ICONS[t.kind] ?? Bell;
            return (
              <motion.button
                key={t.id}
                layout
                initial={{ opacity: 0, y: -24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                onClick={() => {
                  onNavigate(t.tab);
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#141414]/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-nothing-purple/15">
                  <Icon size={16} className="text-nothing-purple" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-[11px] text-white/50">{t.body}</p>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

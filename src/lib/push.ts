import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/*
 * VAPID public keys are not secrets — they ship in every client that
 * subscribes, and the matching private key (held only by the Convex backend)
 * is what actually authorises sending. Inlining the default means push works
 * from a plain `npm run build` with no extra CI secret to configure.
 */
const DEFAULT_VAPID_PUBLIC_KEY =
  'BIaFM8E-ezQIlUif63wcPqKMwHTgL14SIBzS_swDWnDYLvoXUkPf66xOpld7iF9dIJ-rj2-I7rhKyIjVPh_vEW8';

export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || DEFAULT_VAPID_PUBLIC_KEY;

const isNative = Capacitor.isNativePlatform();

const webPushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

// Native (Android APK): FCM, bridged through @capacitor/push-notifications.
// Web/PWA: the browser's own Push API. Either counts as "supported".
export const pushSupported = isNative || webPushSupported;

/** base64url -> Uint8Array, the form PushManager.subscribe expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type SerializedSubscription =
  | { type: 'web'; endpoint: string; p256dh: string; auth: string; label: string }
  | { type: 'fcm'; token: string; label: string };

function describeDevice(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Device';
}

function serialize(sub: PushSubscription): SerializedSubscription {
  return {
    type: 'web',
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64(sub.getKey('p256dh')),
    auth: arrayBufferToBase64(sub.getKey('auth')),
    label: describeDevice(),
  };
}

/** Current permission state, native and web unified. */
export async function permissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (isNative) {
    const status = await PushNotifications.checkPermissions();
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'default';
  }
  if (!webPushSupported) return 'unsupported';
  return Notification.permission;
}

// Remembered so disablePush/currentSubscription can act on it without a
// plugin API to look up "the token I already have" on demand.
let lastFcmToken: string | null = null;

function registerFcm(): Promise<SerializedSubscription> {
  return new Promise((resolve, reject) => {
    void (async () => {
      // addListener resolves to the handle asynchronously; both must be
      // awaited before register() so a fast callback can never reference a
      // not-yet-assigned handle.
      const successHandle = await PushNotifications.addListener('registration', (token) => {
        void successHandle.remove();
        void errorHandle.remove();
        lastFcmToken = token.value;
        resolve({ type: 'fcm', token: token.value, label: describeDevice() });
      });
      const errorHandle = await PushNotifications.addListener('registrationError', (err) => {
        void successHandle.remove();
        void errorHandle.remove();
        reject(new Error(err.error || 'Registration failed.'));
      });
      void PushNotifications.register();
    })();
  });
}

/**
 * Ask for permission and subscribe, throwing a message fit to show the user if
 * anything blocks it. Must be called from a user gesture — browsers reject
 * (and Chrome permanently blocks) permission prompts that aren't tied to one.
 */
export async function enablePush(): Promise<SerializedSubscription> {
  if (!pushSupported) {
    throw new Error('This platform does not support notifications.');
  }

  if (isNative) {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') {
      throw new Error('Permission was not granted.');
    }
    return registerFcm();
  }

  if (!window.isSecureContext) {
    throw new Error('Notifications need HTTPS.');
  }
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Re-enable them in your browser site settings.');
  }

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      throw new Error('Permission was not granted.');
    }
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return serialize(existing);

  const subscription = await registration.pushManager.subscribe({
    // Chrome refuses silent push outright; every message must be user-visible.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
  return serialize(subscription);
}

export async function currentSubscription(): Promise<SerializedSubscription | null> {
  if (isNative) {
    if (lastFcmToken) return { type: 'fcm', token: lastFcmToken, label: describeDevice() };
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== 'granted') return null;
    try {
      return await registerFcm();
    } catch {
      return null;
    }
  }
  if (!webPushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? serialize(existing) : null;
}

export async function disablePush(): Promise<SerializedSubscription | null> {
  const existing = await currentSubscription();
  if (!existing) return null;
  if (existing.type === 'fcm') {
    lastFcmToken = null;
    return existing;
  }
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  await sub?.unsubscribe();
  return existing;
}

/** App-icon badge count. Chrome/Android only; a no-op elsewhere. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) {
    void nav.setAppBadge?.(count).catch(() => {});
  } else {
    void nav.clearAppBadge?.().catch(() => {});
  }
}

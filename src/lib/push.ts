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

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

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

export interface SerializedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
}

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
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64(sub.getKey('p256dh')),
    auth: arrayBufferToBase64(sub.getKey('auth')),
    label: describeDevice(),
  };
}

/**
 * Ask for permission and subscribe, throwing a message fit to show the user if
 * anything blocks it. Must be called from a user gesture — browsers reject
 * (and Chrome permanently blocks) permission prompts that aren't tied to one.
 */
export async function enablePush(): Promise<SerializedSubscription> {
  if (!pushSupported) {
    throw new Error('This browser does not support notifications.');
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
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? serialize(existing) : null;
}

export async function disablePush(): Promise<string | null> {
  const existing = await currentSubscription();
  if (!existing) return null;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  await sub?.unsubscribe();
  return existing.endpoint;
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

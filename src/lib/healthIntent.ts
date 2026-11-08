/**
 * "Open this Health screen and start doing X": the + sheet's shortcuts, a
 * notification tap, or a file shared into the app. The target screen reads
 * and clears it on mount, so the intent fires once.
 */
let pending: { tab: string; intent: string; at: number } | null = null;
let pendingFiles: File[] = [];

export function setHealthIntent(tab: string, intent: string) {
  pending = { tab, intent, at: Date.now() };
}

export function takeHealthIntent(tab: string): string | null {
  if (!pending || pending.tab !== tab || Date.now() - pending.at > 10_000) return null;
  const { intent } = pending;
  pending = null;
  return intent;
}

/** Files shared into Mobu from another app (WhatsApp, Gmail, Files). */
export function setSharedFiles(files: File[]) {
  pendingFiles = files;
}
export function takeSharedFiles(): File[] {
  const f = pendingFiles;
  pendingFiles = [];
  return f;
}

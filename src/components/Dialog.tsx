import React, { useSyncExternalStore } from 'react';
import { AnimatePresence } from 'motion/react';
import { BottomSheet } from './BottomSheet';
import { useBackHandler } from '../lib/backButtonStack';
import { haptic } from '../lib/haptics';

/**
 * In-app replacements for window.confirm / window.alert. Inside the Android
 * WebView the native ones are unstyled and titled with the site's address
 * ("mobu.prismintelligence.in says…"); these match the app, sit in thumb
 * reach, and close on Back like every other sheet.
 *
 *   if (await confirmDialog({ title: 'Delete this goal?', confirmLabel: 'Delete', danger: true })) …
 */
interface DialogRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Notice: just an OK button. */
  notice?: boolean;
  resolve: (ok: boolean) => void;
}

let current: DialogRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(req: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  // A new dialog replaces one that's somehow still open; the old one counts as cancelled.
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...req, resolve };
    emit();
  });
}

export function confirmDialog(opts: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return show(opts);
}

export function noticeDialog(title: string, body?: string): Promise<boolean> {
  return show({ title, body, notice: true });
}

function settle(ok: boolean) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  emit();
  resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const DialogHost: React.FC = () => {
  const req = useSyncExternalStore(subscribe, () => current);
  useBackHandler(!!req, () => settle(false));

  return (
    <AnimatePresence>
      {req && (
        // Above every modal and the photo viewer (z-200/250) but below a live call (z-300).
        <BottomSheet key="dialog" label={req.title} onClose={() => settle(false)} z={260}>
          <div className="space-y-4 px-1">
            <div className="space-y-1">
              <h2 className="text-xl font-medium">{req.title}</h2>
              {req.body && <p className="text-sm text-white/50">{req.body}</p>}
            </div>
            <div className="flex gap-2">
              {!req.notice && (
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="min-h-[48px] flex-1 rounded-2xl border border-white/10 bg-surface text-sm"
                >
                  {req.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => {
                  if (req.danger) haptic('warning');
                  settle(true);
                }}
                className={`min-h-[48px] flex-1 rounded-2xl text-sm font-medium ${
                  req.danger ? 'bg-red-500 text-white' : 'bg-nothing-purple text-white'
                }`}
              >
                {req.notice ? 'OK' : req.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </AnimatePresence>
  );
};

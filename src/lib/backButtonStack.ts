import { useEffect, useRef } from 'react';

/**
 * "What closes on Back" for modals, sheets and overlays.
 *
 * Each open overlay pushes a real history entry and sits on a stack. Any Back
 * (the phone's button or gesture, the browser's button, the PWA's) pops that
 * entry; the popstate listener then closes the overlay the entry belonged to.
 * Closing an overlay from its own X button removes its entry again, so Back is
 * never "dead" after you dismiss something by hand.
 */
interface Entry {
  id: number;
  onBack: () => void;
}

/** Open overlays, in the order they opened. */
const stack: Entry[] = [];
/**
 * Overlay ids that own a history entry right now, bottom to top — as history
 * will be once any of our own pending Back calls land. Kept separately from
 * `stack` because the two diverge: an overlay can still be animating out
 * after its entry is gone, and a screen change replaces an overlay's entry.
 */
let historyIds: number[] = [];
// Unique across reloads, so a history entry left over from before a reload
// can never be mistaken for an overlay that's open now.
let nextId = Date.now();
let installed = false;
// Timestamps of history moves we made ourselves; their popstate must not be
// read as the user pressing Back.
let ownPops: number[] = [];
// Several overlays can close in the same tick (confirming a delete closes the
// confirm dialog and the memory under it). Two history.back() calls in a row
// aren't reliably both honoured, so they're batched into one history.go(-n).
let pendingBacks = 0;

interface OverlayState {
  mobuOverlay?: number;
}
const landedOverlay = () => (window.history.state as OverlayState | null)?.mobuOverlay;

function ownBack() {
  pendingBacks++;
  if (pendingBacks > 1) return;
  queueMicrotask(() => {
    const n = pendingBacks;
    pendingBacks = 0;
    ownPops.push(Date.now());
    window.history.go(-n);
  });
}

function onPopState() {
  const now = Date.now();
  ownPops = ownPops.filter((t) => now - t < 1500);
  if (ownPops.length) {
    ownPops.shift();
    return;
  }

  const landed = landedOverlay();
  const pos = landed === undefined ? -1 : historyIds.indexOf(landed);
  if (landed !== undefined && pos === -1) {
    // A leftover entry: its overlay closed without the entry being removed
    // (a screen change from inside stacked sheets, or a reload). Nothing to
    // close here, so carry the Back press on rather than wasting it.
    window.history.back();
    return;
  }
  // Every overlay above the entry we landed on has just been backed out of.
  historyIds = historyIds.slice(0, pos + 1);
  while (stack.length && !historyIds.includes(stack[stack.length - 1].id)) {
    stack.pop()!.onBack();
  }
}

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('popstate', onPopState);
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}

/** True when the current history entry belongs to an open overlay. */
export function onOverlayEntry(): boolean {
  const landed = landedOverlay();
  return landed !== undefined && historyIds.includes(landed);
}

/**
 * A screen change is replacing the current overlay entry: every overlay entry
 * left in history is now stale (they're closing) and gets skipped by Back.
 */
export function forgetOverlayEntries(): void {
  historyIds = [];
}

function open(entry: Entry) {
  install();
  stack.push(entry);
  historyIds.push(entry.id);
  window.history.pushState({ ...(window.history.state ?? {}), mobuOverlay: entry.id }, '');
}

function close(entry: Entry) {
  const i = stack.indexOf(entry);
  // Already popped by a Back press: its history entry is gone too.
  if (i === -1) return;
  stack.splice(i, 1);
  const h = historyIds.indexOf(entry.id);
  if (h === -1) return;
  historyIds.splice(h, 1);
  // Closed by hand while on top: take its entry off the history so the next
  // Back isn't wasted on it. (A lower overlay closing under one that's still
  // open leaves its entry behind; Back skips it later.)
  if (h === historyIds.length) ownBack();
}

/** Registers `onBack` while `active` is true, in open order (last in, first out). */
export function useBackHandler(active: boolean, onBack: () => void) {
  // A ref keeps the registered handler stable across re-renders (so it
  // doesn't push/pop history every time the caller passes a fresh inline
  // function) while still always calling the latest `onBack`.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { id: nextId++, onBack: () => onBackRef.current() };
    open(entry);
    return () => close(entry);
  }, [active]);
}

let blockers = 0;

/** True while a screen that must be dealt with explicitly (a call) is up. */
export function isBackBlocked(): boolean {
  return blockers > 0;
}

/**
 * Makes the Android Back button do nothing while `active`. For full-screen
 * states with their own explicit exit (Hang up / Decline): Back used to walk
 * through the screens hidden underneath the call and then minimise the app
 * mid-call.
 */
export function useBackBlocker(active: boolean) {
  useEffect(() => {
    if (!active) return;
    blockers++;
    return () => {
      blockers--;
    };
  }, [active]);
}

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

const stack: Entry[] = [];
let nextId = 1;
let installed = false;
// Timestamps of history.back() calls we made ourselves; their popstate must not
// be read as the user pressing Back.
let ownPops: number[] = [];

interface OverlayState {
  mobuOverlay?: number;
}
const landedOverlay = () => (window.history.state as OverlayState | null)?.mobuOverlay;

function ownBack() {
  ownPops.push(Date.now());
  window.history.back();
}

function onPopState() {
  const now = Date.now();
  ownPops = ownPops.filter((t) => now - t < 1500);
  if (ownPops.length) {
    ownPops.shift();
    return;
  }

  // We landed on some history entry. Every overlay above the one that entry
  // belongs to has just been backed out of, so close them.
  const landed = landedOverlay();
  const known = landed === undefined || stack.some((e) => e.id === landed);
  if (!known) return;
  while (stack.length && stack[stack.length - 1].id !== landed) {
    const top = stack.pop()!;
    top.onBack();
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

function open(entry: Entry) {
  install();
  stack.push(entry);
  window.history.pushState({ ...(window.history.state ?? {}), mobuOverlay: entry.id }, '');
}

function close(entry: Entry) {
  const i = stack.indexOf(entry);
  // Already popped by a Back press: its history entry is gone too.
  if (i === -1) return;
  stack.splice(i, 1);
  // Closed by hand: take its entry off the history so the next Back isn't wasted on it.
  if (landedOverlay() === entry.id) ownBack();
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

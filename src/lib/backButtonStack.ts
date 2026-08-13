import { useEffect, useRef } from 'react';

/**
 * A stack of "what closes on back" handlers. Any open modal/sheet/overlay
 * pushes itself while open; the global Android back-button listener (see
 * useAndroidBackButton) always defers to the top of this stack before
 * falling back to tab navigation, so back closes whatever's actually on
 * screen instead of exiting the app from under it.
 */
const stack: (() => void)[] = [];

/** Returns true if something was open and handled the back press. */
export function consumeBackPress(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** Registers `onBack` while `active` is true, in open order (last in, first out). */
export function useBackHandler(active: boolean, onBack: () => void) {
  // A ref keeps the registered handler stable across re-renders (so it
  // doesn't push/pop the stack every time the caller passes a fresh inline
  // function) while still always calling the latest `onBack`.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const handler = () => onBackRef.current();
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

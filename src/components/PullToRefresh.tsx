import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, RefreshCw } from 'lucide-react';
import { checkForUpdate } from '../lib/swUpdate';
import { haptic } from '../lib/haptics';

const PULL_THRESHOLD = 72;

/**
 * iOS-style rubber band: offset = (1 - 1 / (x·c/d + 1)) · d.
 * Starts at slope c (≈ the old 0.5 damping), resists harder the further you
 * pull, and approaches — but never reaches — d. With d = screen height the
 * threshold still lands at ~144px of finger travel, same as before, but there's
 * no dead stop at the end like the old hard clamp had.
 */
const RUBBER_BAND_C = 0.55;
const rubberBand = (x: number, d: number) => (1 - 1 / ((x * RUBBER_BAND_C) / d + 1)) * d;

type Phase = 'idle' | 'checking' | 'current';

/**
 * The APK is a thin shell over a live site (see capacitor.config.ts) for OTA
 * updates, and this swipe-down is how you pick up a new deploy without fully
 * closing the app.
 *
 * It only reloads when there is something new (or it can't tell): all the
 * data on screen is already live, so a full reload every time just threw away
 * scroll positions and anything half-typed for nothing. When you're already
 * on the latest version it says so and stays put.
 *
 * Pure touch-event tracking rather than a native SwipeRefreshLayout: it
 * ships instantly over OTA instead of needing an APK rebuild, and touch
 * events simply never fire on desktop, so it's safe there too.
 */
export const PullToRefresh: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const setPullBoth = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      // Views with their own drag/pan gesture (the 3D Hall of Memories'
      // sphere, most notably) opt out — a vertical drag there shouldn't
      // double as a pull-to-refresh.
      // Also opt out of anything inside a modal/sheet or a text field: the page
      // behind a full-screen modal is still at scrollY 0, so a drag inside the
      // form used to reload the app and wipe whatever was being typed.
      if (
        window.scrollY > 0 ||
        busyRef.current ||
        target?.closest('[data-no-pull-refresh], input, textarea, select, [role="dialog"], .fixed')
      ) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || busyRef.current) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPullBoth(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPullBoth(0);
        return;
      }
      setPullBoth(rubberBand(delta, window.innerHeight));
    };

    const refresh = async () => {
      busyRef.current = true;
      setPhase('checking');
      haptic('select');
      const result = await checkForUpdate();
      if (result !== 'current') {
        window.location.reload();
        return;
      }
      setPhase('current');
      setPullBoth(0);
      window.setTimeout(() => {
        setPhase('idle');
        busyRef.current = false;
      }, 1100);
    };

    const onTouchEnd = () => {
      if (startY.current != null && pullRef.current >= PULL_THRESHOLD && !busyRef.current) {
        void refresh();
      } else if (!busyRef.current) {
        setPullBoth(0);
      }
      startY.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const ready = pull >= PULL_THRESHOLD || phase === 'checking';
  const visible = pull > 4 || phase !== 'idle';

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 z-[300] flex justify-center pointer-events-none"
            style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            {phase === 'current' ? (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-surface/90 px-3 text-xs text-white/80 shadow-xl backdrop-blur-xl"
                role="status"
              >
                <Check size={14} className="text-nothing-purple" />
                Up to date
              </motion.div>
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-surface/90 border border-white/10 flex items-center justify-center backdrop-blur-xl shadow-xl"
                style={{ transform: `scale(${phase === 'checking' ? 1 : Math.min(0.6 + (pull / PULL_THRESHOLD) * 0.4, 1)})` }}
              >
                <RefreshCw
                  size={16}
                  className={ready ? 'text-nothing-purple animate-spin' : 'text-white/40'}
                  style={!ready ? { transform: `rotate(${pull * 3}deg)` } : undefined}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
};

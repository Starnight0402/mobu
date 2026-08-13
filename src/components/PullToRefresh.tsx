import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;

/**
 * The APK is a thin shell over a live site (see capacitor.config.ts) for OTA
 * updates, but there was no way to force a refresh short of fully closing
 * the app — this gives touch users the swipe-down gesture they'd expect,
 * which just reloads the page (same mechanism as the resume-reload).
 *
 * Pure touch-event tracking rather than a native SwipeRefreshLayout: it
 * ships instantly over OTA instead of needing an APK rebuild, and touch
 * events simply never fire on desktop, so it's safe there too.
 */
export const PullToRefresh: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      // Views with their own drag/pan gesture (the 3D Hall of Memories'
      // sphere, most notably) opt out — a vertical drag there shouldn't
      // double as a pull-to-refresh.
      if (window.scrollY > 0 || refreshingRef.current || target?.closest('[data-no-pull-refresh]')) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Damped, not 1:1 — a full-length pull should feel like it has real
      // resistance rather than the indicator chasing your finger exactly.
      setPull(Math.min(delta * 0.5, MAX_PULL));
    };

    const onTouchEnd = () => {
      setPull((current) => {
        if (current >= PULL_THRESHOLD && !refreshingRef.current) {
          refreshingRef.current = true;
          setRefreshing(true);
          window.location.reload();
          return current;
        }
        return 0;
      });
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

  const ready = pull >= PULL_THRESHOLD || refreshing;

  return (
    <>
      <AnimatePresence>
        {pull > 4 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 z-[300] flex justify-center pointer-events-none"
            style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <div
              className="w-9 h-9 rounded-full bg-[#141414]/90 border border-white/10 flex items-center justify-center backdrop-blur-xl shadow-xl"
              style={{ transform: `scale(${Math.min(0.6 + (pull / PULL_THRESHOLD) * 0.4, 1)})` }}
            >
              <RefreshCw
                size={16}
                className={ready ? 'text-nothing-purple animate-spin' : 'text-white/40'}
                style={!ready ? { transform: `rotate(${pull * 3}deg)` } : undefined}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
};

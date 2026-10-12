import React, { Suspense, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { haptic } from '../lib/haptics';

// three.js is heavy; keep it out of the main bundle until this tab opens.
const MiniWorldScene = React.lazy(() => import('./MiniWorldScene'));

type Who = 'him' | 'her';

interface Heart {
  id: number;
  x: number;
  y: number;
}

export const MiniWorldView: React.FC = () => {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const nextId = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const onTap = useCallback((_who: Who, clientX: number, clientY: number) => {
    haptic('tap');
    const rect = box.current?.getBoundingClientRect();
    const id = nextId.current++;
    setHearts((h) => [...h, { id, x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }]);
    setTimeout(() => setHearts((h) => h.filter((p) => p.id !== id)), 1200);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mini us</h1>
        <p className="text-sm text-white/50">Tap us.</p>
      </div>

      <div
        ref={box}
        className="relative w-full h-[65dvh] rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1b1030] to-black touch-none"
      >
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
            </div>
          }
        >
          <MiniWorldScene onTap={onTap} />
        </Suspense>

        <AnimatePresence>
          {hearts.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, y: 0, scale: 0.6 }}
              animate={{ opacity: 0, y: -80, scale: 1.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="absolute pointer-events-none text-2xl"
              style={{ left: p.x - 12, top: p.y - 24 }}
            >
              💜
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

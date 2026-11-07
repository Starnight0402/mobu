import React from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';

/**
 * The app's one bottom-sheet look and feel: dimmed backdrop (tap to close), a
 * grab handle, a spring in and out, and drag-down-to-dismiss. Render it inside
 * <AnimatePresence> so it can animate out.
 *
 * It doesn't register for the Back button itself; callers do, with
 * useBackHandler, because some of them (the bar's sheets) need Back wired to
 * their own open state.
 */
export const BottomSheet: React.FC<{
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Backdrop's z-index; the sheet sits one above it. */
  z?: number;
  backdropClassName?: string;
}> = ({ label, onClose, children, z = 110, backdropClassName = 'bg-black/70' }) => (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className={`fixed inset-0 ${backdropClassName}`}
      style={{ zIndex: z }}
    />
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_e, info) => {
        if (info.offset.y > 80 || info.velocity.y > 500) {
          haptic('tick');
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg glass-sheet rounded-t-[2rem] border-t border-x px-5 pt-3"
      style={{ zIndex: z + 1, paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
      {children}
    </motion.div>
  </>
);

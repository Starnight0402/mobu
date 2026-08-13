import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBackHandler } from '../lib/backButtonStack';

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
  subcaption?: string;
}

interface LightboxState {
  images: LightboxImage[];
  index: number;
}

interface LightboxApi {
  /** Open a single image full-screen. */
  openImage: (image: LightboxImage) => void;
  /** Open a gallery, starting at `index`, swipeable left/right. */
  openGallery: (images: LightboxImage[], index: number) => void;
  close: () => void;
}

const LightboxContext = createContext<LightboxApi | null>(null);

/**
 * Full-screen image viewer, mounted once at the app root.
 *
 * Every image surface in the app funnels through this instead of rolling its
 * own modal, so tapping a photo anywhere behaves identically. Images are
 * fitted with object-contain rather than zoomed — on a phone the whole point
 * is that you never have to pinch to see the picture.
 */
export const LightboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LightboxState | null>(null);

  const close = useCallback(() => setState(null), []);

  const openGallery = useCallback((images: LightboxImage[], index: number) => {
    const usable = images.filter((i) => !!i.src);
    if (usable.length === 0) return;
    // The filter above can shift indices, so re-resolve against the original
    // entry rather than trusting the caller's position blindly.
    const target = images[index];
    const resolved = target ? usable.findIndex((i) => i.src === target.src) : 0;
    setState({ images: usable, index: resolved < 0 ? 0 : resolved });
  }, []);

  const openImage = useCallback(
    (image: LightboxImage) => openGallery([image], 0),
    [openGallery],
  );

  const api = useMemo<LightboxApi>(
    () => ({ openImage, openGallery, close }),
    [openImage, openGallery, close],
  );

  return (
    <LightboxContext.Provider value={api}>
      {children}
      <LightboxOverlay state={state} onChange={setState} onClose={close} />
    </LightboxContext.Provider>
  );
};

export function useLightbox(): LightboxApi {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('useLightbox must be used inside <LightboxProvider>');
  return ctx;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

const LightboxOverlay: React.FC<{
  state: LightboxState | null;
  onChange: (next: LightboxState | null) => void;
  onClose: () => void;
}> = ({ state, onChange, onClose }) => {
  const open = !!state;
  const count = state?.images.length ?? 0;
  const current = state ? state.images[state.index] : null;

  useBackHandler(open, onClose);

  const step = useCallback(
    (delta: number) => {
      onChange(
        state && count > 1
          ? { ...state, index: (state.index + delta + count) % count }
          : state,
      );
    },
    [state, count, onChange],
  );

  // Keyboard control, and lock body scroll behind the overlay so the page
  // underneath doesn't drift while you're panning the image on touch.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, step]);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    // Vertical flick wins over horizontal only when it's clearly the dominant
    // gesture, otherwise a sloppy sideways swipe would close the viewer.
    if (Math.abs(offset.y) > Math.abs(offset.x)) {
      if (Math.abs(offset.y) > DISMISS_DISTANCE || Math.abs(velocity.y) > DISMISS_VELOCITY) {
        onClose();
      }
      return;
    }
    if (count > 1 && (Math.abs(offset.x) > DISMISS_DISTANCE || Math.abs(velocity.x) > DISMISS_VELOCITY)) {
      step(offset.x < 0 ? 1 : -1);
    }
  };

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={onClose}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close image"
            className="absolute right-3 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
          >
            <X size={20} />
          </button>

          {count > 1 && (
            <>
              <NavArrow side="left" onClick={(e) => { e.stopPropagation(); step(-1); }} />
              <NavArrow side="right" onClick={(e) => { e.stopPropagation(); step(1); }} />
              <div
                className="absolute left-1/2 -translate-x-1/2 z-10 text-[11px] font-mono text-white/50"
                style={{ top: 'max(1.25rem, calc(env(safe-area-inset-top) + 1rem))' }}
              >
                {state.index + 1} / {count}
              </div>
            </>
          )}

          <motion.img
            key={current.src}
            src={current.src}
            alt={current.alt ?? ''}
            referrerPolicy="no-referrer"
            drag
            dragElastic={0.35}
            dragMomentum={false}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            /* object-contain + max dims means the whole photo is on screen at
               once — no pinch-zoom needed to see what you tapped. */
            className="max-w-full max-h-full object-contain select-none cursor-grab active:cursor-grabbing"
            style={{
              maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 7rem)',
              maxWidth: 'calc(100vw - 1.5rem)',
            }}
            draggable={false}
          />

          {(current.caption || current.subcaption) && (
            <div
              className="absolute left-0 right-0 px-6 text-center pointer-events-none"
              style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
            >
              {current.caption && (
                <p className="text-sm font-medium text-white truncate">{current.caption}</p>
              )}
              {current.subcaption && (
                <p className="text-[11px] uppercase tracking-widest text-white/40 mt-1 truncate">
                  {current.subcaption}
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const NavArrow: React.FC<{ side: 'left' | 'right'; onClick: (e: React.MouseEvent) => void }> = ({
  side,
  onClick,
}) => (
  <button
    onClick={onClick}
    aria-label={side === 'left' ? 'Previous image' : 'Next image'}
    className={`absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white hidden sm:flex items-center justify-center transition-colors ${
      side === 'left' ? 'left-3' : 'right-3'
    }`}
  >
    {side === 'left' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
  </button>
);

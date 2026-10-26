import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Volume2, VolumeX, Heart, HeartHandshake, Music, Moon, CloudRain, LucideIcon } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { Action, ActionKind, COUPLE_ACTIONS, GIFTS, Gift, LIKES, MiniApi, Who, Zone } from './catalog';
import { giftUrl } from './giftArt';
import { isMuted, setMuted, sfx, SfxName } from './sfx';
import { VoiceRecorder, playSqueaky } from './voice';

// three.js is heavy; keep it out of the main bundle until this tab opens.
const MiniWorldScene = React.lazy(() => import('./MiniWorldScene'));

const LOVE_KEY = 'mobu-mini-love';

const TOUCH_ACTION: Record<Zone, ActionKind> = { head: 'pat', body: 'poke', feet: 'tickle' };
const TOUCH_SOUND: Record<Zone, SfxName> = { head: 'aww', body: 'squeak', feet: 'giggle' };

/** Gift art if it has been dropped into public/mini/gifts/, else the emoji. */
const GiftIcon: React.FC<{ gift: Gift }> = ({ gift }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-2xl leading-none">{gift.emoji}</span>;
  return (
    <img
      src={giftUrl(gift.id)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="h-9 w-9 object-contain pointer-events-none"
    />
  );
};

interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  dx: number;
  delay: number;
}

function readLove(): number {
  try {
    return Number(localStorage.getItem(LOVE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export const MiniWorldView: React.FC = () => {
  const minis = useRef<Record<Who, MiniApi | null>>({ him: null, her: null });
  const nextId = useRef(0);
  const recorder = useRef<VoiceRecorder | null>(null);

  const [particles, setParticles] = useState<Particle[]>([]);
  const [target, setTarget] = useState<Who>('her');
  const [muted, setMutedState] = useState(isMuted);
  const [love, setLove] = useState(readLove);
  const loveRef = useRef(love);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const register = useCallback((who: Who, api: MiniApi | null) => {
    minis.current[who] = api;
  }, []);

  const onEmit = useCallback((emojis: string[], x: number, y: number) => {
    const born = emojis.map((emoji, i) => ({
      id: nextId.current++,
      emoji,
      x: x + (Math.random() - 0.5) * 50,
      y,
      dx: (Math.random() - 0.5) * 70,
      delay: i * 0.08,
    }));
    setParticles((p) => [...p, ...born]);
    const ids = new Set(born.map((b) => b.id));
    setTimeout(() => setParticles((p) => p.filter((q) => !ids.has(q.id))), 1800);
  }, []);

  const playBoth = (action: Action) => {
    minis.current.him?.play(action);
    minis.current.her?.play(action);
  };

  const bumpLove = (amount: number) => {
    let next = loveRef.current + amount;
    if (next >= 100) {
      next = 0;
      // Full meter: both celebrate with a dance.
      setTimeout(() => {
        sfx('yay');
        sfx('tune');
        haptic('success');
        playBoth({ kind: 'dance' });
      }, 500);
    }
    loveRef.current = next;
    setLove(next);
    try {
      localStorage.setItem(LOVE_KEY, String(next));
    } catch {
      // Storage unavailable: the meter just resets next visit.
    }
  };

  // Anyone who was sad when you did something nice gets cheered up, with a bonus.
  const cheered = () => {
    sfx('yay');
    haptic('success');
    bumpLove(6);
    setToast('Cheered up!  +6 love');
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  };

  const busyTogether = () =>
    (['him', 'her'] as Who[]).some((w) => {
      const k = minis.current[w]?.current();
      return k != null && COUPLE_ACTIONS.includes(k);
    });

  const onTouch = useCallback((who: Who, zone: Zone) => {
    const mini = minis.current[who];
    if (!mini || busyTogether()) return;
    haptic('tap');
    if (mini.current() === 'sleep') {
      mini.play({ kind: 'wake' });
      sfx('boing');
      return;
    }
    const wasSad = mini.sad();
    mini.play({ kind: TOUCH_ACTION[zone] });
    sfx(TOUCH_SOUND[zone]);
    bumpLove(2);
    if (wasSad) cheered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const giveGift = (gift: Gift) => {
    const mini = minis.current[target];
    if (!mini || busyTogether()) return;
    const wasSad = mini.sad();
    const love = LIKES[target].includes(gift.id);
    const kind: ActionKind = gift.id === 'bottle' ? 'feed' : gift.id === 'blanket' ? 'sleep' : 'gift';
    mini.play({ kind, gift: gift.id, love });
    sfx(love ? 'sparkle' : 'pop');
    if (love) setTimeout(() => sfx('aww'), 250);
    if (kind === 'sleep') setTimeout(() => sfx('snore'), 900);
    haptic(love ? 'success' : 'tap');
    bumpLove(love ? 8 : 4);
    if (wasSad) cheered();
  };

  const together = (kind: 'hug' | 'kiss' | 'dance') => {
    if (busyTogether()) return;
    const wasSad = minis.current.him?.sad() || minis.current.her?.sad();
    playBoth({ kind });
    sfx(kind === 'hug' ? 'aww' : kind === 'kiss' ? 'kiss' : 'tune');
    haptic('success');
    bumpLove(10);
    if (wasSad) cheered();
  };

  const sulk = () => {
    if (busyTogether()) return;
    minis.current[target]?.play({ kind: 'cry' });
    sfx('sob');
    haptic('warning');
  };

  const nap = () => {
    if (busyTogether()) return;
    minis.current[target]?.play({ kind: 'sleep' });
    sfx('snore');
  };

  const startTalk = async () => {
    if (recording) return;
    setVoiceError(null);
    const rec = new VoiceRecorder();
    recorder.current = rec;
    setRecording(true);
    haptic('select');
    try {
      await rec.start(() => void stopTalk());
    } catch {
      recorder.current = null;
      setRecording(false);
      setVoiceError('Mic not available');
    }
  };

  const stopTalk = async () => {
    const rec = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!rec) return;
    const clip = await rec.stop();
    const mini = minis.current[target];
    if (!clip || !mini) return;
    try {
      await playSqueaky(clip, (level) => mini.setTalk(level));
    } catch {
      setVoiceError("Couldn't play that back");
    }
  };

  // Say hi when you open the screen.
  useEffect(() => {
    const id = setTimeout(() => {
      minis.current.him?.play({ kind: 'wave' });
      setTimeout(() => minis.current.her?.play({ kind: 'wave' }), 300);
    }, 900);
    return () => {
      clearTimeout(id);
      void recorder.current?.stop();
    };
  }, []);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const gifts = [...GIFTS].sort(
    (a, b) => Number(LIKES[target].includes(b.id)) - Number(LIKES[target].includes(a.id)),
  );

  return (
    <div className="space-y-4 pb-32">
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-medium tracking-tight">Mini us</h1>
          <p className="text-white/40 text-xs uppercase tracking-widest">Pat · poke · tickle</p>
        </div>
        <button
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="w-10 h-10 rounded-full glass text-white flex items-center justify-center"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </header>

      {/* love meter */}
      <div className="flex items-center gap-3">
        <Heart size={18} className="text-coral" fill="currentColor" />
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-pink-400 to-nothing-purple"
            animate={{ width: `${love}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          />
        </div>
        <span className="text-xs text-white/40 w-8 text-right tabular-nums">{love}%</span>
      </div>

      <div className="relative w-full h-[48dvh] min-h-[300px] rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#2a1747] via-[#1b1030] to-black touch-none select-none">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-nothing-purple animate-pulse" />
            </div>
          }
        >
          <MiniWorldScene register={register} onTouch={onTouch} onEmit={onEmit} />
        </Suspense>

        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], x: p.dx, y: -110, scale: 1.2 }}
              transition={{ duration: 1.5, delay: p.delay, ease: 'easeOut' }}
              className="absolute pointer-events-none text-2xl"
              style={{ left: p.x - 14, top: p.y - 14 }}
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>

        {toast && (
          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-white text-black text-xs font-medium">{toast}</div>
          </div>
        )}

        {recording && (
          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-red-500/80 text-xs font-medium animate-pulse">
              Listening… let go to hear {target === 'her' ? 'her' : 'him'} repeat it
            </div>
          </div>
        )}
        {voiceError && !recording && (
          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-black/70 text-xs text-white/70">{voiceError}</div>
          </div>
        )}
      </div>

      {/* who gets the gift / repeats your voice */}
      <div className="flex gap-2 p-1 rounded-full glass">
        {(['her', 'him'] as Who[]).map((w) => (
          <button
            key={w}
            onClick={() => {
              setTarget(w);
              haptic('select');
            }}
            className={`flex-1 py-2 rounded-full text-sm transition-colors ${
              target === w ? 'bg-white text-black font-medium' : 'text-white/60'
            }`}
          >
            For {w === 'her' ? 'her' : 'him'}
          </button>
        ))}
      </div>

      {/* gifts */}
      <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {gifts.map((g) => {
          const liked = LIKES[target].includes(g.id);
          return (
            <motion.button
              key={g.id}
              whileTap={{ scale: 0.88 }}
              onClick={() => giveGift(g)}
              className="relative shrink-0 w-[72px] py-2 rounded-2xl glass flex flex-col items-center gap-1"
            >
              <GiftIcon gift={g} />
              <span className="text-[10px] text-white/60 leading-tight">{g.label}</span>
              {liked && <span className="absolute -top-1 -right-1 text-xs">💖</span>}
            </motion.button>
          );
        })}
      </div>

      {/* together + talk */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: 'Hug', icon: HeartHandshake, run: () => together('hug') },
          { label: 'Kiss', icon: Heart, run: () => together('kiss') },
          { label: 'Dance', icon: Music, run: () => together('dance') },
          { label: 'Nap', icon: Moon, run: nap },
          { label: 'Sad', icon: CloudRain, run: sulk },
        ].map((b) => (
          <motion.button
            key={b.label}
            whileTap={{ scale: 0.88 }}
            onClick={b.run}
            className="py-3 rounded-2xl glass flex flex-col items-center gap-1"
          >
            <b.icon size={22} />
            <span className="text-[10px] text-white/60">{b.label}</span>
          </motion.button>
        ))}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            void startTalk();
          }}
          onPointerUp={() => void stopTalk()}
          onPointerLeave={() => recording && void stopTalk()}
          onPointerCancel={() => void stopTalk()}
          onContextMenu={(e) => e.preventDefault()}
          className={`py-3 rounded-2xl flex flex-col items-center gap-1 touch-none select-none transition-colors ${
            recording ? 'bg-red-500 text-white' : 'bg-nothing-purple text-white'
          }`}
        >
          <Mic size={20} />
          <span className="text-[10px]">Hold</span>
        </button>
      </div>
    </div>
  );
};

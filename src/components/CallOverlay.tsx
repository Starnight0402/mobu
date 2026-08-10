import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, VideoOff as CamOff, Volume2 } from 'lucide-react';
import { useCall } from './CallProvider';
import { haptic, startRepeatingHaptic } from '../lib/haptics';
import { startRingtone } from '../lib/ringtone';

/**
 * Attaches a MediaStream once the element actually exists.
 *
 * The bug this replaces: streams were assigned to `ref.current.srcObject` at a
 * moment when the <video> hadn't rendered yet, so the ref was null and the
 * assignment silently did nothing — for the local preview every time, and for
 * the remote track whenever it landed before paint.
 */
const VideoSurface: React.FC<{
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
  onBlocked?: () => void;
}> = ({ stream, muted = false, mirrored = false, className, onBlocked }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (!stream) return;
    el.play().catch(() => {
      // Mobile browsers block unmuted autoplay outside a gesture; surface a
      // tap target instead of failing silently into a dead-looking call.
      if (!muted) onBlocked?.();
    });
  }, [stream, muted, onBlocked]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
};

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 96 }) => (
  <div
    className="rounded-full bg-nothing-purple/15 border border-nothing-purple/30 flex items-center justify-center"
    style={{ width: size, height: size }}
  >
    <span className="font-medium text-nothing-purple" style={{ fontSize: size / 2.6 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  </div>
);

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export const CallOverlay: React.FC = () => {
  const {
    phase,
    peerName,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    toggleMute,
    toggleCamera,
    peerMuted,
    peerCameraOff,
    quality,
    hangUp,
    audioBlocked,
    reportAudioBlocked,
    markAudioUnblocked,
  } = useCall();

  const elapsed = useElapsed(phase === 'active');

  const statusLine =
    phase === 'outgoing'
      ? 'Ringing…'
      : phase === 'connecting'
        ? 'Connecting…'
        : quality === 'poor'
          ? 'Poor connection'
          : quality === 'failed'
            ? 'Connection lost'
            : elapsed;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      /* Above the nav and every modal: a live call outranks the rest of the app. */
      className="fixed inset-0 z-[300] bg-black flex flex-col"
    >
      <div className="relative flex-1 overflow-hidden">
        {remoteStream && !peerCameraOff ? (
          <VideoSurface
            stream={remoteStream}
            className="w-full h-full object-cover"
            onBlocked={reportAudioBlocked}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-5 bg-[#0a0a0a]">
            <Avatar name={peerName} />
            <div className="text-center space-y-1">
              <p className="text-xl font-medium">{peerName}</p>
              <p className="text-[11px] uppercase tracking-widest text-white/40">
                {peerCameraOff ? 'Camera off' : statusLine}
              </p>
            </div>
          </div>
        )}

        {/* Header chrome, clear of the notch. */}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none"
          style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.75rem))' }}
        >
          <div>
            <p className="text-sm font-medium">{peerName}</p>
            <p className="text-[11px] uppercase tracking-widest text-white/50">{statusLine}</p>
          </div>
          {peerMuted && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[11px] text-white/70">
              <MicOff size={12} /> Muted
            </span>
          )}
        </div>

        {audioBlocked && (
          <button
            onClick={markAudioUnblocked}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black shadow-2xl"
          >
            <Volume2 size={16} /> Tap to enable sound
          </button>
        )}

        {/* Self-view, draggable so it can be moved off whatever it's covering. */}
        {localStream && (
          <motion.div
            drag
            dragMomentum={false}
            dragElastic={0.08}
            className="absolute right-4 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl cursor-grab active:cursor-grabbing"
            style={{ top: 'max(5.5rem, calc(env(safe-area-inset-top) + 5rem))' }}
          >
            {cameraOff ? (
              <div className="flex h-full w-full items-center justify-center bg-[#141414]">
                <CamOff size={18} className="text-white/40" />
              </div>
            ) : (
              <VideoSurface stream={localStream} muted mirrored className="h-full w-full object-cover" />
            )}
          </motion.div>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-5 bg-black px-6 pt-6"
        style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem))' }}
      >
        <ControlButton
          active={muted}
          onClick={toggleMute}
          label={muted ? 'Unmute' : 'Mute'}
          icon={muted ? <MicOff size={22} /> : <Mic size={22} />}
        />
        <button
          onClick={() => {
            haptic('warning');
            void hangUp();
          }}
          aria-label="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl transition-transform active:scale-90"
        >
          <PhoneOff size={26} />
        </button>
        <ControlButton
          active={cameraOff}
          onClick={toggleCamera}
          label={cameraOff ? 'Camera on' : 'Camera off'}
          icon={cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
        />
      </div>
    </motion.div>
  );
};

const ControlButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active, onClick, label, icon }) => (
  <button
    onClick={() => {
      haptic('tap');
      onClick();
    }}
    aria-label={label}
    aria-pressed={active}
    className={`flex h-14 w-14 items-center justify-center rounded-full transition-all active:scale-90 ${
      active ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
    }`}
  >
    {icon}
  </button>
);

/**
 * Full-screen incoming call. Rendered by the provider at the app root, so it
 * arrives over whatever screen you're on rather than only inside the Call tab.
 */
export const IncomingCallSheet: React.FC = () => {
  const { peerName, accept, decline } = useCall();

  // Ring and buzz until it's answered or declined — a silent visual is easy to
  // miss on a phone that's face-down in a pocket.
  useEffect(() => {
    const stopRing = startRingtone();
    const stopBuzz = startRepeatingHaptic('ring', 3000);
    return () => {
      stopRing();
      stopBuzz();
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-between"
        style={{
          paddingTop: 'max(5rem, calc(env(safe-area-inset-top) + 4rem))',
          paddingBottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 3rem))',
        }}
      >
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          >
            <Avatar name={peerName} size={120} />
          </motion.div>
          <div className="space-y-2">
            <p className="text-2xl font-medium">{peerName}</p>
            <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">
              Incoming video call
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-xs items-center justify-between px-4">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => {
                haptic('warning');
                void decline();
              }}
              aria-label="Decline call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl transition-transform active:scale-90"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-[11px] uppercase tracking-widest text-white/40">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <motion.button
              onClick={() => {
                haptic('success');
                void accept();
              }}
              aria-label="Accept call"
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-xl transition-transform active:scale-90"
            >
              <Phone size={26} />
            </motion.button>
            <span className="text-[11px] uppercase tracking-widest text-white/40">Accept</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

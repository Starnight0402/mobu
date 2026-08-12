import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Phone, Smartphone, ShieldAlert } from 'lucide-react';
import { useCall } from './CallProvider';
import { usingSharedRelay } from '../lib/webrtc';

/**
 * The Call tab is now just a launch pad — all call state and UI live in
 * CallProvider, so navigating away no longer hangs up on your partner.
 */
export const CallView: React.FC = () => {
  const partner = useQuery(api.users.partner);
  const settings = useQuery(api.settings.get);
  const { startCall, canCall, error, clearError, peerName } = useCall();

  const partnerPhone = settings?.partnerPhone?.trim();

  return (
    <div className="space-y-8 pb-32">
      <header className="space-y-1">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Call</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">Free, over the internet</p>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-xs text-red-300">{error}</p>
            <button
              onClick={clearError}
              className="mt-2 text-[11px] uppercase tracking-widest text-white/40 hover:text-white/70"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="glass flex flex-col items-center gap-6 p-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-nothing-purple/20 bg-nothing-purple/10">
          {partner?.avatarUrl ? (
            <img src={partner.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Phone size={28} className="text-nothing-purple" />
          )}
        </div>
        <div>
          <p className="text-lg font-medium">{partner?.name || peerName}</p>
          <p className="mt-1 text-xs text-white/40">
            {partner ? 'Tap to start a video call' : 'Waiting for your partner to sign in'}
          </p>
        </div>
        <button
          onClick={() => void startCall()}
          disabled={!canCall}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-nothing-purple text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
          aria-label="Start video call"
        >
          <Phone size={24} />
        </button>
      </div>

      {/*
       * Escape hatch for when the internet call won't hold up. Uses the normal
       * carrier line via the system dialer — no telephony service, no cost
       * beyond the minutes you already pay for.
       */}
      {partnerPhone ? (
        <a
          href={`tel:${partnerPhone.replace(/[^\d+]/g, '')}`}
          className="glass flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-3">
            <Smartphone size={18} className="text-white/40" />
            <div className="text-left">
              <p className="text-sm font-medium">Call on the phone instead</p>
              <p className="text-[11px] text-white/40">{partnerPhone}</p>
            </div>
          </div>
          <span className="text-[11px] uppercase tracking-widest text-nothing-purple">Dial</span>
        </a>
      ) : (
        <p className="text-center text-[11px] text-white/30">
          Add your partner's number in Settings for a one-tap phone-call fallback.
        </p>
      )}

      {usingSharedRelay && (
        <p className="text-center text-[10px] uppercase tracking-widest text-white/20">
          Using the free shared relay — set VITE_TURN_* for a private one
        </p>
      )}
    </div>
  );
};

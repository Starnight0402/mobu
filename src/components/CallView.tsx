import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../convex/_generated/api';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneIncoming } from 'lucide-react';

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  // TURN relay is optional -- without it, calls still work on most home
  // networks via STUN alone, but may fail across stricter/symmetric NATs.
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  }
  return servers;
}

type CallPhase = 'idle' | 'calling' | 'ringing' | 'active';

export const CallView: React.FC = () => {
  const partner = useQuery(api.users.partner);
  const incoming = useQuery(api.calls.incoming);
  const sendSignal = useMutation(api.calls.sendSignal);
  const endCallMutation = useMutation(api.calls.endCall);

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const processedSignalIds = useRef<Set<string>>(new Set());
  const seenIncomingCallIds = useRef<Set<string>>(new Set());

  const signals = useQuery(api.calls.signalsFor, callId ? { callId } : 'skip') ?? [];

  const cleanup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    processedSignalIds.current.clear();
  };

  const hangup = async (notify = true) => {
    if (notify && callId && partner) {
      await sendSignal({ callId, toUserId: partner._id, type: 'hangup', payload: '' });
    }
    const idToClean = callId;
    cleanup();
    setPhase('idle');
    setCallId(null);
    if (idToClean) {
      setTimeout(() => endCallMutation({ callId: idToClean }), 3000);
    }
  };

  const createPeerConnection = (targetUserId: Id<'users'>, activeCallId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({
          callId: activeCallId,
          toUserId: targetUserId,
          type: 'ice-candidate',
          payload: JSON.stringify(e.candidate),
        });
      }
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        hangup(false);
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    if (!partner) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const newCallId = crypto.randomUUID();
      setCallId(newCallId);
      const pc = createPeerConnection(partner._id, newCallId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ callId: newCallId, toUserId: partner._id, type: 'offer', payload: JSON.stringify(offer) });
      setPhase('calling');
    } catch (err) {
      console.error(err);
      setError('Could not access camera/microphone.');
    }
  };

  const acceptCall = async (offerSignal: Doc<'callSignals'>) => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      setCallId(offerSignal.callId);
      const pc = createPeerConnection(offerSignal.fromUserId, offerSignal.callId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = JSON.parse(offerSignal.payload);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({
        callId: offerSignal.callId,
        toUserId: offerSignal.fromUserId,
        type: 'answer',
        payload: JSON.stringify(answer),
      });
      setPhase('active');
    } catch (err) {
      console.error(err);
      setError('Could not access camera/microphone.');
    }
  };

  const declineCall = async (offerSignal: Doc<'callSignals'>) => {
    await sendSignal({ callId: offerSignal.callId, toUserId: offerSignal.fromUserId, type: 'hangup', payload: '' });
  };

  // Detect a ringing incoming call while idle.
  useEffect(() => {
    if (phase !== 'idle' || !incoming) return;
    if (seenIncomingCallIds.current.has(incoming.callId)) return;
    seenIncomingCallIds.current.add(incoming.callId);
    setPhase('ringing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.callId, phase]);

  // Process signals for the active call (answer / ICE candidates / hangup).
  useEffect(() => {
    for (const s of signals) {
      if (processedSignalIds.current.has(s._id)) continue;
      processedSignalIds.current.add(s._id);
      if (s.type === 'answer' && pcRef.current && phase === 'calling') {
        pcRef.current.setRemoteDescription(new RTCSessionDescription(JSON.parse(s.payload))).then(() => setPhase('active'));
      } else if (s.type === 'ice-candidate' && pcRef.current) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(JSON.parse(s.payload))).catch(console.error);
      } else if (s.type === 'hangup') {
        hangup(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals]);

  useEffect(() => () => cleanup(), []);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoOff));
    setVideoOff(!videoOff);
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="space-y-1">
        <h1 className="text-4xl font-medium tracking-tight dot-matrix">Call</h1>
        <p className="text-white/40 text-[10px] uppercase tracking-widest">Free, over the internet</p>
      </header>

      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

      {phase === 'idle' && (
        <div className="glass p-12 flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-nothing-purple/10 border border-nothing-purple/20 flex items-center justify-center">
            <Phone size={28} className="text-nothing-purple" />
          </div>
          <div>
            <p className="text-lg font-medium">{partner?.name || 'Your partner'}</p>
            <p className="text-xs text-white/40 mt-1">Tap to start a video call</p>
          </div>
          <button
            onClick={startCall}
            disabled={!partner}
            className="w-16 h-16 rounded-full bg-nothing-purple text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
          >
            <Phone size={24} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {phase === 'ringing' && incoming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass p-12 flex flex-col items-center gap-6 text-center border-nothing-purple/40"
          >
            <PhoneIncoming size={28} className="text-nothing-purple animate-pulse" />
            <p className="text-lg font-medium">{partner?.name || 'Your partner'} is calling…</p>
            <div className="flex gap-4">
              <button
                onClick={() => { declineCall(incoming); setPhase('idle'); }}
                className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-all"
              >
                <PhoneOff size={20} />
              </button>
              <button
                onClick={() => acceptCall(incoming)}
                className="w-14 h-14 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center hover:bg-green-500/30 transition-all"
              >
                <Phone size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(phase === 'calling' || phase === 'active') && (
        <div className="relative rounded-[2rem] overflow-hidden border border-white/5 bg-black aspect-[3/4] md:aspect-video">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {phase === 'calling' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="text-sm text-white/60 uppercase tracking-widest">Ringing…</p>
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-4 right-4 w-24 h-32 rounded-xl object-cover border border-white/20"
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={() => hangup(true)}
              className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:brightness-110 transition-all"
            >
              <PhoneOff size={18} />
            </button>
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${videoOff ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
            >
              {videoOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
          </div>
        </div>
      )}

      {!TURN_URL && (
        <p className="text-[10px] text-white/20 text-center uppercase tracking-widest">
          No TURN relay configured — calls work on most networks but may fail across strict NATs
        </p>
      )}
    </div>
  );
};

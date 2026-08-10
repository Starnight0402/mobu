import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Doc } from '../../convex/_generated/dataModel';
import { getCallMedia, iceServers } from '../lib/webrtc';
import { CallOverlay, IncomingCallSheet } from './CallOverlay';

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'active';
export type ConnectionQuality = 'connecting' | 'good' | 'poor' | 'failed';

interface CallContextValue {
  phase: CallPhase;
  peerName: string;
  error: string | null;
  clearError: () => void;
  canCall: boolean;
  startCall: () => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  toggleMute: () => void;
  toggleCamera: () => void;
  peerMuted: boolean;
  peerCameraOff: boolean;
  quality: ConnectionQuality;
  /** Set when the browser refuses to auto-play the remote track unmuted. */
  audioBlocked: boolean;
  reportAudioBlocked: () => void;
  markAudioUnblocked: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

const RING_TIMEOUT_MS = 45_000;

/**
 * Owns the entire WebRTC lifecycle, mounted once at the app root.
 *
 * It used to live inside the Call tab, which meant the callee only ever rang
 * if they happened to be sitting on that screen, and navigating anywhere
 * mid-call unmounted the component and tore the connection down.
 */
export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const partner = useQuery(api.users.partner);
  const call = useQuery(api.calls.current);

  const startMutation = useMutation(api.calls.start);
  const answerMutation = useMutation(api.calls.answer);
  const endMutation = useMutation(api.calls.end);
  const purgeSignals = useMutation(api.calls.purgeSignals);
  const sendSignal = useMutation(api.calls.sendSignal);

  const signals = useQuery(
    api.calls.signalsFor,
    call?.callId ? { callId: call.callId } : 'skip',
  );

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const [peerCameraOff, setPeerCameraOff] = useState(false);
  const [quality, setQuality] = useState<ConnectionQuality>('connecting');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const negotiatedForRef = useRef<string | null>(null);
  const processedRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pumpingRef = useRef(false);
  const signalsRef = useRef<Doc<'callSignals'>[]>([]);
  const callRef = useRef<typeof call>(null);

  signalsRef.current = signals ?? [];
  callRef.current = call;

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    negotiatedForRef.current = null;
    processedRef.current.clear();
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setPeerMuted(false);
    setPeerCameraOff(false);
    setQuality('connecting');
    setAudioBlocked(false);
    setAccepting(false);
  }, []);

  const endCall = useCallback(
    async (reason: 'hangup' | 'declined' | 'missed' | 'failed') => {
      const active = callRef.current;
      teardown();
      if (!active) return;
      await endMutation({ callId: active.callId, reason }).catch(() => {});
      // Signals are dead weight once the call is over; the caller cleans up.
      if (active.isCaller) {
        purgeSignals({ callId: active.callId }).catch(() => {});
      }
    },
    [endMutation, purgeSignals, teardown],
  );

  /* ----------------------------- peer connection ---------------------------- */

  const createPeerConnection = useCallback(
    (callId: string, peerId: Doc<'users'>['_id'], stream: MediaStream) => {
      const pc = new RTCPeerConnection({ iceServers: iceServers() });

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        sendSignal({
          callId,
          toUserId: peerId,
          type: 'ice-candidate',
          payload: JSON.stringify(e.candidate.toJSON()),
        }).catch(() => {});
      };

      // Track events can arrive before any <video> exists. The stream goes
      // into state and a mount-safe effect attaches it — the old code assigned
      // straight to a ref that was still null, silently dropping the remote
      // audio and video for the entire call.
      pc.ontrack = (e) => {
        const [incoming] = e.streams;
        if (incoming) setRemoteStream(incoming);
      };

      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case 'connected':
            setQuality('good');
            break;
          case 'disconnected':
            setQuality('poor');
            break;
          case 'failed':
            setQuality('failed');
            // Read the live call through a ref: the handler is created once,
            // so a captured callId would still be null here.
            void endCall('failed');
            break;
          default:
            break;
        }
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pcRef.current = pc;
      return pc;
    },
    [sendSignal, endCall],
  );

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }, []);

  const handleSignal = useCallback(
    async (signal: Doc<'callSignals'>, pc: RTCPeerConnection) => {
      const active = callRef.current;
      if (!active) return;

      switch (signal.type) {
        case 'offer': {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.payload)));
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({
            callId: active.callId,
            toUserId: signal.fromUserId,
            type: 'answer',
            payload: JSON.stringify(answer),
          });
          break;
        }
        case 'answer': {
          if (pc.signalingState !== 'have-local-offer') break;
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.payload)));
          await flushCandidates(pc);
          break;
        }
        case 'ice-candidate': {
          const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
          // Candidates routinely arrive before the description they belong to.
          // Buffering them is the whole ballgame: the old code called
          // addIceCandidate immediately, threw, and swallowed the error.
          if (!pc.remoteDescription) {
            pendingCandidatesRef.current.push(candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
          break;
        }
        case 'media-state': {
          const state = JSON.parse(signal.payload) as { muted: boolean; cameraOff: boolean };
          setPeerMuted(!!state.muted);
          setPeerCameraOff(!!state.cameraOff);
          break;
        }
        case 'hangup': {
          await endCall('hangup');
          break;
        }
      }
    },
    [flushCandidates, sendSignal, endCall],
  );

  /*
   * Signals are drained strictly one at a time. The previous implementation
   * looped synchronously and fired setRemoteDescription without awaiting, so
   * every ICE candidate behind it was applied against a peer connection that
   * had no remote description yet — and lost.
   */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    const pc = pcRef.current;
    if (!pc) return;

    pumpingRef.current = true;
    try {
      let drained = false;
      while (!drained) {
        drained = true;
        for (const signal of signalsRef.current) {
          if (processedRef.current.has(signal._id)) continue;
          processedRef.current.add(signal._id);
          drained = false;
          try {
            await handleSignal(signal, pc);
          } catch {
            // A single malformed signal shouldn't stall the rest of the queue.
          }
          if (!pcRef.current) return;
        }
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [handleSignal]);

  useEffect(() => {
    void pump();
  }, [signals, pump, localStream]);

  /* ------------------------------- lifecycle -------------------------------- */

  // The server row is the single source of truth. When it disappears or ends —
  // whoever hung up, whichever device — both sides tear down.
  useEffect(() => {
    if (call === undefined) return;
    if (!call) {
      if (pcRef.current || localStreamRef.current) teardown();
    }
  }, [call, teardown]);

  // Caller: once the ring is recorded, negotiate.
  useEffect(() => {
    if (!call || !call.isCaller || call.status !== 'ringing') return;
    if (negotiatedForRef.current === call.callId) return;
    const stream = localStreamRef.current;
    if (!stream) return;

    negotiatedForRef.current = call.callId;
    const pc = createPeerConnection(call.callId, call.peerId, stream);

    (async () => {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await sendSignal({
          callId: call.callId,
          toUserId: call.peerId,
          type: 'offer',
          payload: JSON.stringify(offer),
        });
      } catch {
        setError('Could not start the call. Try again.');
        void endCall('failed');
      }
    })();
  }, [call, createPeerConnection, sendSignal, endCall]);

  // Caller: give up on an unanswered ring instead of ringing forever.
  useEffect(() => {
    if (!call || !call.isCaller || call.status !== 'ringing') return;
    const remaining = Math.max(0, RING_TIMEOUT_MS - (Date.now() - call.startedAt));
    const timer = setTimeout(() => void endCall('missed'), remaining);
    return () => clearTimeout(timer);
  }, [call, endCall]);

  // Keep the screen awake for the duration of a connected call.
  useEffect(() => {
    if (call?.status !== 'active') return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const lock = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } })
      .wakeLock;
    lock
      ?.request('screen')
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      void sentinel?.release().catch(() => {});
    };
  }, [call?.status]);

  useEffect(() => () => teardown(), [teardown]);

  /* -------------------------------- actions --------------------------------- */

  const startCall = useCallback(async () => {
    if (!partner) return;
    setError(null);
    try {
      const { stream } = await getCallMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      await startMutation({ calleeId: partner._id });
    } catch (err) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setError(err instanceof Error ? err.message : 'Could not access camera or microphone.');
    }
  }, [partner, startMutation]);

  const accept = useCallback(async () => {
    const active = callRef.current;
    if (!active || active.isCaller || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const { stream } = await getCallMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      negotiatedForRef.current = active.callId;
      // Tracks must be on the connection before the buffered offer is
      // answered, or the caller gets an answer with nothing to receive.
      createPeerConnection(active.callId, active.peerId, stream);
      await answerMutation({ callId: active.callId });
      await pump();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access camera or microphone.');
      await endCall('failed');
    } finally {
      setAccepting(false);
    }
  }, [accepting, createPeerConnection, answerMutation, pump, endCall]);

  const decline = useCallback(() => endCall('declined'), [endCall]);
  const hangUp = useCallback(() => endCall('hangup'), [endCall]);

  const broadcastMediaState = useCallback(
    (next: { muted: boolean; cameraOff: boolean }) => {
      const active = callRef.current;
      if (!active) return;
      sendSignal({
        callId: active.callId,
        toUserId: active.peerId,
        type: 'media-state',
        payload: JSON.stringify(next),
      }).catch(() => {});
    },
    [sendSignal],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    broadcastMediaState({ muted: next, cameraOff });
  }, [muted, cameraOff, broadcastMediaState]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
    broadcastMediaState({ muted, cameraOff: next });
  }, [cameraOff, muted, broadcastMediaState]);

  const phase: CallPhase = useMemo(() => {
    if (!call) return 'idle';
    if (call.status === 'active') return remoteStream ? 'active' : 'connecting';
    return call.isCaller ? 'outgoing' : 'incoming';
  }, [call, remoteStream]);

  const value: CallContextValue = {
    phase,
    peerName: call?.peerName || partner?.name || 'Your partner',
    error,
    clearError: () => setError(null),
    canCall: !!partner && !call,
    startCall,
    accept,
    decline,
    hangUp,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    toggleMute,
    toggleCamera,
    peerMuted,
    peerCameraOff,
    quality,
    audioBlocked,
    reportAudioBlocked: () => setAudioBlocked(true),
    markAudioUnblocked: () => setAudioBlocked(false),
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      {phase === 'incoming' && <IncomingCallSheet />}
      {(phase === 'outgoing' || phase === 'connecting' || phase === 'active') && <CallOverlay />}
    </CallContext.Provider>
  );
};

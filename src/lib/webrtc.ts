const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

/*
 * Open Relay is Metered's free, no-signup public TURN service. It's the
 * difference between "calls work when we're on the same wifi" and "calls work
 * on mobile data", because carrier CGNAT and symmetric NAT block the direct
 * peer-to-peer path that STUN alone assumes.
 *
 * It's best-effort and shared, so VITE_TURN_* still takes precedence — point
 * those at Cloudflare Realtime (free tier, needs an account) for something
 * you can rely on.
 */
const OPEN_RELAY: RTCIceServer = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turns:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  } else {
    servers.push(OPEN_RELAY);
  }
  return servers;
}

export const usingSharedRelay = !(TURN_URL && TURN_USERNAME && TURN_CREDENTIAL);

/**
 * Camera + mic, degrading to audio-only rather than failing the whole call
 * when there's no usable camera.
 */
export async function getCallMedia(): Promise<{ stream: MediaStream; hasVideo: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      window.isSecureContext
        ? 'This browser cannot access the camera or microphone.'
        : 'Calls need HTTPS. Open the app over https:// (or localhost) and try again.',
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    return { stream, hasVideo: stream.getVideoTracks().length > 0 };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      // Android grants camera/mic as two independent OS permissions, so a
      // combined request can be denied when only one of the two was
      // actually refused — retry audio-only before giving up on the call.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { stream, hasVideo: false };
      } catch {
        throw new Error('Camera and microphone permission was denied. Allow access and try again.');
      }
    }
    // No camera, or it's held by another app — an audio call still beats none.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { stream, hasVideo: false };
  }
}

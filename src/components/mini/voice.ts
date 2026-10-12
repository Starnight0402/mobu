import { audioCtx } from './sfx';

/** Talking-Tom style: record a clip, play it back sped up and squeaky. */

const MAX_SECONDS = 8;
const CHIPMUNK_RATE = 1.6;

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timeout: number | undefined;

  async start(onAutoStop: () => void): Promise<void> {
    // Unlock audio output inside the user gesture, before the await.
    audioCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.timeout = window.setTimeout(onAutoStop, MAX_SECONDS * 1000);
  }

  stop(): Promise<Blob | null> {
    window.clearTimeout(this.timeout);
    const recorder = this.recorder;
    const stream = this.stream;
    this.recorder = null;
    this.stream = null;
    if (!recorder || recorder.state === 'inactive') {
      stream?.getTracks().forEach((t) => t.stop());
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop());
        resolve(this.chunks.length ? new Blob(this.chunks, { type: recorder.mimeType }) : null);
      };
      recorder.stop();
    });
  }
}

/** Plays the clip pitched up, reporting a 0..1 loudness for lip-sync. */
export async function playSqueaky(blob: Blob, onLevel: (level: number) => void): Promise<void> {
  const c = audioCtx();
  const buffer = await c.decodeAudioData(await blob.arrayBuffer());
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = CHIPMUNK_RATE;
  const analyser = c.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  analyser.connect(c.destination);

  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
    raf = requestAnimationFrame(tick);
  };

  return new Promise((resolve) => {
    source.onended = () => {
      cancelAnimationFrame(raf);
      onLevel(0);
      resolve();
    };
    source.start();
    tick();
  });
}

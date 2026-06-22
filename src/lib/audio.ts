// Mic capture -> 16kHz mono Float32 (what Whisper wants), with a live level
// callback so the mic button can pulse to the user's voice.

async function blobTo16kMono(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

export class MicRecorder {
  private media?: MediaStream;
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private audioCtx?: AudioContext;
  private raf = 0;

  async start(onLevel?: (level: number) => void) {
    this.media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.chunks = [];
    this.rec = new MediaRecorder(this.media);
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.start();

    if (onLevel) {
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.media);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }
  }

  async stop(): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error("Not recording"));
      this.rec.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: this.rec?.mimeType || "audio/webm" });
          const audio = await blobTo16kMono(blob);
          this.cleanup();
          resolve(audio);
        } catch (e) {
          this.cleanup();
          reject(e);
        }
      };
      this.rec.stop();
    });
  }

  cancel() {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.cleanup();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    this.audioCtx?.close().catch(() => {});
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = undefined;
    this.rec = undefined;
    this.audioCtx = undefined;
    this.chunks = [];
  }
}

// Trim leading/trailing near-silence so the recognizer gets just the speech,
// not seconds of room tone (which short-utterance models like SenseVoice can
// mis-transcribe). Conservative: a low RMS threshold plus generous padding, and
// internal pauses are preserved (we only cut the outer edges). If no speech is
// found it returns the audio unchanged, so it can never make things worse.
export function trimSilence(audio: Float32Array, sr = 16000): Float32Array {
  const frame = Math.floor(sr * 0.02); // 20ms frames
  if (audio.length < frame * 3) return audio;
  const pad = Math.floor(sr * 0.2); // keep 200ms around the speech
  const thresh = 0.015; // RMS; well below normal speech (~0.05+)
  const rms = (i: number) => {
    let s = 0;
    for (let j = 0; j < frame && i + j < audio.length; j++) {
      const v = audio[i + j];
      s += v * v;
    }
    return Math.sqrt(s / frame);
  };
  let first = -1;
  let last = -1;
  for (let i = 0; i + frame <= audio.length; i += frame) {
    if (rms(i) > thresh) {
      if (first === -1) first = i;
      last = i + frame;
    }
  }
  if (first === -1) return audio; // no speech detected; don't risk cutting
  return audio.slice(Math.max(0, first - pad), Math.min(audio.length, last + pad));
}

// Single shared <audio> for TTS playback so lines don't overlap.
let player: HTMLAudioElement | null = null;
export function playTTS(url: string, onState?: (playing: boolean) => void): HTMLAudioElement {
  if (!player) player = new Audio();
  player.pause();
  player.src = url;
  player.onplay = () => onState?.(true);
  player.onended = () => onState?.(false);
  player.onpause = () => onState?.(false);
  player.onerror = () => onState?.(false);
  player.play().catch(() => onState?.(false));
  return player;
}

// Thin manager around the Whisper worker. One job at a time, promise-based.
export type LoadProgress = { status: string; file?: string; progress?: number };

let worker: Worker | null = null;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function loadWhisper(model: string, onProgress?: (p: LoadProgress) => void): Promise<void> {
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") onProgress?.(m.data);
      else if (m.type === "ready") {
        w.removeEventListener("message", handler);
        resolve();
      } else if (m.type === "error") {
        w.removeEventListener("message", handler);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "load", model });
  });
}

export function transcribe(audio: Float32Array, language: string): Promise<string> {
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "result") {
        w.removeEventListener("message", handler);
        resolve(m.text);
      } else if (m.type === "error") {
        w.removeEventListener("message", handler);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "transcribe", audio, language });
  });
}

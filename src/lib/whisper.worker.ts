/// <reference lib="webworker" />
// Offline speech-to-text via transformers.js (Whisper). Runs entirely in the
// browser; model weights download once and cache in the browser's storage.
import { pipeline, env } from "@huggingface/transformers";

// Use the HF hub for weights; don't look for local model files.
env.allowLocalModels = false;

let transcriber: any = null;
let loadedModel = "";

type InMsg =
  | { type: "load"; model: string }
  | { type: "transcribe"; audio: Float32Array; language: string };

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      if (transcriber && loadedModel === msg.model) {
        (self as any).postMessage({ type: "ready" });
        return;
      }
      loadedModel = msg.model;
      transcriber = await pipeline("automatic-speech-recognition", msg.model, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: any) => (self as any).postMessage({ type: "progress", data: p }),
      });
      (self as any).postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "transcribe") {
      if (!transcriber) throw new Error("Model not loaded");
      const opts: any = { chunk_length_s: 30, stride_length_s: 5 };
      if (msg.language && msg.language !== "auto") {
        opts.language = msg.language;
        opts.task = "transcribe";
      }
      const out = await transcriber(msg.audio, opts);
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) || "";
      (self as any).postMessage({ type: "result", text: text.trim() });
      return;
    }
  } catch (err: any) {
    (self as any).postMessage({ type: "error", message: err?.message || String(err) });
  }
};

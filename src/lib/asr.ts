// Client for the optional NVIDIA speech server (asr_server/server.py, runs in WSL).
// The browser already produces 16 kHz mono float32 PCM (see audio.ts); we POST the
// raw bytes. Falls back to in-browser Whisper when the server isn't running.

// Default to a SAME-ORIGIN relative path ("/asr") that the dev server proxies to
// the local speech server (see vite.config.ts). Going through the page's own origin
// is what lets voice work both locally AND when the app is opened from a phone over
// a Tailscale/HTTPS link — a hard-coded 127.0.0.1 would mean "the phone itself".
// Override with VITE_ASR_URL if you ever run the speech server elsewhere.
const ASR_BASE = (import.meta as any).env?.VITE_ASR_URL || "/asr";

export async function remoteAsrHealthy(): Promise<boolean> {
  try {
    // generous timeout: a cold first connection can be slow; we'd rather wait than
    // wrongly fall back to the weaker browser engine.
    const r = await fetch(`${ASR_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function transcribeRemote(audio: Float32Array, lang = "auto"): Promise<string> {
  // send a tight copy so we never ship a subarray's extra bytes
  const buf = new Float32Array(audio);
  const r = await fetch(`${ASR_BASE}/transcribe?lang=${encodeURIComponent(lang)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
  if (!r.ok) throw new Error(`ASR server ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return (data.text || "").trim();
}

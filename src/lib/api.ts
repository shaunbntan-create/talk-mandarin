import type { ProviderConfig, ScenePool, Turn } from "../types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    (err as any).code = data?.error;
    (err as any).status = res.status;
    throw err;
  }
  return data;
}

export async function getConfig(): Promise<ProviderConfig> {
  return jsonOrThrow(await fetch("/api/config"));
}

export async function saveConfig(
  cfg: Partial<ProviderConfig> & { apiKey?: string }
): Promise<ProviderConfig> {
  return jsonOrThrow(
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    })
  );
}

// Fire-and-forget: nudge the backend to warm the model on app load so the first
// real turn isn't a cold-start wait. Never throws.
export async function warm(): Promise<void> {
  try { await fetch("/api/warm", { method: "POST" }); } catch { /* ignore */ }
}

export async function getVoices(): Promise<{ id: string; label: string }[]> {
  const data = await jsonOrThrow(await fetch("/api/voices"));
  return data.voices;
}

export async function getScenarios(): Promise<ScenePool[]> {
  const data = await jsonOrThrow(await fetch("/api/scenarios"));
  return data.scenarios;
}

export async function chat(messages: ChatMessage[]): Promise<{ turn: Turn; raw: string }> {
  // Retry once on a transient failure (network blip, or the backend restarting
  // mid-request under `node --watch`). Don't retry real client errors like 428.
  for (let attempt = 0; ; attempt++) {
    try {
      return await jsonOrThrow(
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        })
      );
    } catch (e: any) {
      const transient = !e?.status || e.status >= 500;
      if (attempt === 0 && transient) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw e;
    }
  }
}

export function ttsUrl(text: string, voice: string, rate: string): string {
  const p = new URLSearchParams({ text, voice, rate });
  return `/api/tts?${p.toString()}`;
}

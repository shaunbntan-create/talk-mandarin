// Two adapters cover the LLM providers this app supports:
//   - "openai"   : any OpenAI-compatible /chat/completions endpoint.
//                  baseUrl picks the vendor: OpenAI, OpenCode Zen, OpenRouter, LM Studio, Ollama, etc.
//   - "anthropic": native Claude /v1/messages.
// The frontend's Settings panel just stores { provider, baseUrl, apiKey, model }.

const DEFAULT_BASE = {
  openai: "https://api.openai.com/v1",
  opencode: "https://opencode.ai/zen/v1", // OpenCode Zen is OpenAI-compatible; override in Settings if yours differs
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com",
};

export function resolveBaseUrl(cfg) {
  if (cfg.baseUrl && cfg.baseUrl.trim()) return cfg.baseUrl.trim().replace(/\/$/, "");
  return DEFAULT_BASE[cfg.provider] || DEFAULT_BASE.openai;
}

// Returns the assistant's raw text content.
export async function callModel(cfg, system, messages) {
  const provider = cfg.provider === "anthropic" ? "anthropic" : "openai";
  return provider === "anthropic"
    ? callAnthropic(cfg, system, messages)
    : callOpenAICompatible(cfg, system, messages);
}

async function callOpenAICompatible(cfg, system, messages) {
  const base = resolveBaseUrl(cfg);
  const url = `${base}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: [{ role: "system", content: system }, ...messages],
    temperature: cfg.temperature ?? 0.6,
    // Ask for JSON when the endpoint supports it; harmless if ignored.
    response_format: { type: "json_object" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey || ""}`,
      // OpenRouter niceties; ignored elsewhere.
      "HTTP-Referer": "http://localhost:5180",
      "X-Title": "Huaban",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Some endpoints reject response_format. Retry once without it.
    if (res.status === 400) {
      delete body.response_format;
      const retry = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey || ""}` },
        body: JSON.stringify(body),
      });
      if (retry.ok) return extractOpenAI(await retry.json());
      throw httpError(retry.status, await safeText(retry));
    }
    throw httpError(res.status, await safeText(res));
  }
  return extractOpenAI(await res.json());
}

function extractOpenAI(json) {
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Model returned no text content.");
  return text;
}

async function callAnthropic(cfg, system, messages) {
  const base = resolveBaseUrl(cfg);
  const url = `${base}/v1/messages`;
  // Prefill the assistant turn with "{" to coax pure JSON out of Claude.
  const anthroMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  anthroMessages.push({ role: "assistant", content: "{" });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      system,
      max_tokens: 1500,
      temperature: cfg.temperature ?? 0.6,
      messages: anthroMessages,
    }),
  });
  if (!res.ok) throw httpError(res.status, await safeText(res));
  const json = await res.json();
  const text = json?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Model returned no text content.");
  return "{" + text; // re-attach the prefilled brace
}

function httpError(status, detail) {
  const err = new Error(`Provider error ${status}: ${detail.slice(0, 400)}`);
  err.status = status;
  return err;
}
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "(no body)";
  }
}

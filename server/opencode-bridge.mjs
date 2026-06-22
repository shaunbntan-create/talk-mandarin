// OpenAI-compatible -> opencode-serve bridge.
//
// Huaban's backend speaks OpenAI /chat/completions. The OpenCode GO subscription
// is only reachable through the local `opencode serve` native API (session +
// message), NOT through the Zen pay-per-use API key. This tiny proxy translates
// one into the other so Huaban runs on the GO subscription's free models.
//
//   Huaban  --(POST /v1/chat/completions)-->  this bridge  --(POST /session/:id/message)-->  opencode serve
//
// Start opencode serve in a CLEAN directory first (so it doesn't load CLAUDE.md /
// instructions.md as 60k tokens of coding context):
//   cd <empty-dir> && opencode serve --port 4097
// then run this bridge:
//   OC_URL=http://127.0.0.1:4097 PORT=8788 node server/opencode-bridge.mjs

import express from "express";

const OC_URL = (process.env.OC_URL || "http://127.0.0.1:4097").replace(/\/$/, "");
const PORT = process.env.BRIDGE_PORT || 8788;

const app = express();
app.use(express.json({ limit: "2mb" }));

// model "opencode/deepseek-v4-flash-free" -> { providerID:"opencode", modelID:"deepseek-v4-flash-free" }
function parseModel(model) {
  const m = String(model || "opencode/deepseek-v4-flash-free");
  const i = m.indexOf("/");
  if (i === -1) return { providerID: "opencode", modelID: m };
  return { providerID: m.slice(0, i), modelID: m.slice(i + 1) };
}

// Flatten the OpenAI message array into (system prompt, conversation transcript).
function splitMessages(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  // Render prior turns as a labelled transcript; the model produces the next turn.
  const transcript = turns
    .map((m) => `${m.role === "assistant" ? "ASSISTANT" : "USER"}: ${m.content}`)
    .join("\n\n");
  return { system, transcript };
}

async function ocFetch(path, init) {
  const res = await fetch(`${OC_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`opencode ${path} -> ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

app.get("/v1/models", async (_req, res) => {
  res.json({ object: "list", data: [{ id: "opencode/deepseek-v4-flash-free", object: "model" }] });
});

app.post("/v1/chat/completions", async (req, res) => {
  const { model, messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "messages[] required" } });
  }
  const { providerID, modelID } = parseModel(model);
  const { system, transcript } = splitMessages(messages);

  try {
    // fresh session per request — Huaban replays full history each turn, so the
    // bridge stays stateless and the transcript carries all the context.
    const session = await ocFetch("/session", { method: "POST", body: "{}" });
    const sid = session.id;

    const out = await ocFetch(`/session/${sid}/message`, {
      method: "POST",
      body: JSON.stringify({
        model: { providerID, modelID },
        system, // override the build-agent prompt with Huaban's immersion contract
        tools: { bash: false, edit: false, write: false, read: false, glob: false, grep: false, list: false, webfetch: false, patch: false, todowrite: false, todoread: false },
        parts: [{ type: "text", text: transcript }],
      }),
    });

    // The answer lives in text parts; reasoning/step parts are excluded.
    const text = (out.parts || [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();

    // best-effort cleanup; ignore failures
    ocFetch(`/session/${sid}`, { method: "DELETE" }).catch(() => {});

    if (!text) {
      return res.status(502).json({ error: { message: "bridge: model returned no text part" } });
    }

    res.json({
      id: `chatcmpl-bridge-${sid}`,
      object: "chat.completion",
      created: Math.floor(out.info?.time?.created ? out.info.time.created / 1000 : 0),
      model: `${providerID}/${modelID}`,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: out.info?.finish || "stop" }],
      usage: {
        prompt_tokens: out.info?.tokens?.input ?? 0,
        completion_tokens: out.info?.tokens?.output ?? 0,
        total_tokens: out.info?.tokens?.total ?? 0,
      },
    });
  } catch (err) {
    console.error("[bridge]", err.message);
    res.status(err.status || 502).json({ error: { message: err.message } });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, oc: OC_URL }));

app.listen(PORT, () => {
  console.log(`opencode->openai bridge on http://localhost:${PORT}  (opencode serve: ${OC_URL})`);
});

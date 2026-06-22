import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SYSTEM_PROMPT } from "./prompt.mjs";
import { callModel } from "./providers.mjs";
import { synthesize, VOICES } from "./tts.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const PORT = process.env.PORT || 8787;

// ---------- config (LLM provider creds) ----------
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { provider: "openai", baseUrl: "", apiKey: "", model: "", temperature: 0.6 };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
function publicConfig(cfg) {
  const { apiKey, ...rest } = cfg;
  return { ...rest, hasKey: Boolean(apiKey && apiKey.length) };
}

// ---------- robust JSON extraction from model output ----------
function parseTurn(raw) {
  let text = (raw || "").trim();
  // strip ```json fences if present
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall back to the outermost { ... }
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("Could not parse model output as JSON.");
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/voices", (_req, res) => res.json({ voices: VOICES }));
app.get("/api/scenarios", (_req, res) => res.json({ scenarios: SCENARIOS }));

app.get("/api/config", (_req, res) => res.json(publicConfig(loadConfig())));

app.post("/api/config", (req, res) => {
  const cur = loadConfig();
  const body = req.body || {};
  const next = {
    provider: body.provider ?? cur.provider,
    baseUrl: body.baseUrl ?? cur.baseUrl,
    model: body.model ?? cur.model,
    temperature: body.temperature ?? cur.temperature ?? 0.6,
    // keep existing key unless a non-empty new one is sent
    apiKey: body.apiKey && body.apiKey.length ? body.apiKey : cur.apiKey,
  };
  saveConfig(next);
  res.json(publicConfig(next));
});

// ---------- warm-up ----------
// The free model has a big cold-start (~35s on first inference after the gateway
// boots). The frontend pings this on load so that first inference happens while
// the user is still on the start screen, not after they tap "Go hands-free".
let warming = false;
app.post("/api/warm", async (_req, res) => {
  const cfg = loadConfig();
  if (!cfg.model || warming) return res.json({ ok: false });
  warming = true;
  res.json({ ok: true }); // don't make the client wait on the warm-up
  try {
    await callModel(cfg, "You are a warm-up probe. Reply with exactly: ok", [{ role: "user", content: "ping" }]);
  } catch (e) {
    console.error("[warm]", e.message);
  } finally {
    warming = false;
  }
});

// ---------- the tutor brain ----------
app.post("/api/chat", async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.model) {
    return res.status(428).json({ error: "not_configured", message: "Connect a model in Settings first." });
  }
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages) return res.status(400).json({ error: "bad_request", message: "messages[] required." });

  try {
    const raw = await callModel(cfg, SYSTEM_PROMPT, messages);
    let turn;
    try {
      turn = parseTurn(raw);
    } catch (e) {
      // one self-heal retry: ask the model to fix its own JSON
      const fixRaw = await callModel(cfg, SYSTEM_PROMPT, [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: "Your last reply was not valid JSON. Resend the SAME turn as one valid JSON object only." },
      ]);
      turn = parseTurn(fixRaw);
    }
    res.json({ turn, raw });
  } catch (err) {
    console.error("[chat]", err.message);
    res.status(err.status || 502).json({ error: "provider_error", message: err.message });
  }
});

// ---------- TTS ----------
app.get("/api/tts", async (req, res) => {
  const text = req.query.text;
  const voice = req.query.voice || "zh-CN-XiaoxiaoNeural";
  const rate = req.query.rate || "0%";
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const mp3 = await synthesize(String(text), String(voice), String(rate));
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=31536000");
    res.send(mp3);
  } catch (err) {
    console.error("[tts]", err.message);
    res.status(502).json({ error: "tts_error", message: err.message });
  }
});

// ---------- serve built frontend in production ----------
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`话伴 Huaban backend on http://localhost:${PORT}`);
});

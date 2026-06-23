import express from "express";
import cors from "cors";
import fs from "node:fs";
import http from "node:http";
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

// ---------- speech server proxy ----------
// The phone uploads its mic audio same-origin to /asr, and we forward it to the
// local SenseVoice server (asr_server/server.py on 8799) so transcription happens
// on this machine, never on the phone. We stream the raw body straight through
// (it's float32 PCM, not JSON), so this MUST run before express.json(). Mirrors
// the dev-only /asr rewrite in vite.config.ts (strip the /asr prefix).
const ASR_TARGET = process.env.ASR_TARGET || "http://127.0.0.1:8799";
app.use("/asr", (req, res) => {
  const target = new URL(ASR_TARGET);
  const targetPath = req.originalUrl.replace(/^\/asr/, "") || "/";
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (e) => {
    if (!res.headersSent) res.status(502).json({ error: "asr_unreachable", message: e.message });
  });
  req.pipe(proxyReq);
});

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
  // Hashed assets (js/css/fonts) can cache forever; index.html must always be
  // revalidated so phones pick up new builds instead of pinning old asset hashes.
  app.use(
    express.static(dist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`话伴 Huaban backend on http://localhost:${PORT}`);
});

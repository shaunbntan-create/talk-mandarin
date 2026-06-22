# 话伴 Huàbàn

A local-first, **voice-based Chinese immersion tutor**. A native-speaking partner picks a
scene, speaks only Mandarin, and corrects you the instant you slip into English. You answer
out loud; it listens, breaks down your mistakes, and holds you on a line until you say it right.

It started as a Chinese-immersion-agent prompt and became a real app: scenario rotation,
Hanzi-only questions, the `hint` / correction / **hold** flow, per-word pinyin breakdowns,
heritage-learner error-spotting, and edge-tts for every Chinese line.

## How it works

```
You speak  ──►  Whisper (offline, in-browser)  ──►  text
                                                      │
                              the tutor "brain" (your LLM) returns structured JSON
                                                      │
        rendered as scene cards · question bubbles · hint cards · correction cards
                                                      │
                          each Chinese line  ──►  edge-tts  ──►  you hear native audio
```

- **Frontend**: Vite + React + Tailwind v4 + Motion. The LLM returns strict JSON; the UI renders it as cards.
- **Backend** (`server/`): a tiny Node/Express service that (1) proxies your LLM provider and (2) generates edge-tts audio (`zh-CN-XiaoxiaoNeural`). No Python.
- **Speech-to-text**: offline Whisper (`transformers.js`) in the browser by default; an optional NVIDIA speech server gives sharper recognition if you have a GPU (see *Speech recognition* below).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5180. The first thing to do is **Connect a model** (top-right).

### Connecting a model

Settings → *Connect a model*. Pick a preset:

| Preset | Use it for | Base URL | Key |
|---|---|---|---|
| **OpenAI** | GPT models | (default) | OpenAI key |
| **Claude** | Anthropic Claude (best corrections) | (default) | Anthropic key |
| **OpenCode** | your OpenCode subscription | `https://opencode.ai/zen/v1` (edit if yours differs) | OpenCode key |
| **Custom** | OpenRouter, LM Studio, Ollama, any OpenAI-compatible URL | you paste it | as needed |

> The OpenCode preset assumes an **OpenAI-compatible** endpoint (OpenCode Zen). If your OpenCode
> exposes a different API shape, point "Custom" at a local OpenAI-compatible proxy. Your key is
> stored only in `server/config.json` on your machine (gitignored).

### Optional: run free via an OpenCode subscription

Some OpenCode plans give you free models that are only reachable through the local OpenCode
app (`opencode serve`), not as a standalone API key. `server/opencode-bridge.mjs` is a tiny proxy
that lets Huaban use them. With the [OpenCode CLI](https://opencode.ai) installed and logged in:

```bash
# 1. start the OpenCode gateway in an empty folder (keeps its context clean)
mkdir -p /tmp/oc-root && cd /tmp/oc-root && opencode serve --port 4097

# 2. start the bridge (in this repo)
OC_URL=http://127.0.0.1:4097 BRIDGE_PORT=8788 node server/opencode-bridge.mjs

# 3. point Huaban at the bridge in Settings -> Custom:
#    Base URL  http://localhost:8788/v1
#    Model     opencode/deepseek-v4-flash-free   (or any free opencode/* model)
#    API key   anything (the bridge ignores it)
```

### Voice settings

- **Speaking voice / speed** - the tutor's TTS (six Mandarin voices, adjustable rate).
- **Whisper model** - Tiny / Base / Small. Base is the default; Small is most accurate for mixed Chinese-English but downloads ~485MB.
- **Always show pinyin + English** - off by default so you read the Hanzi first and tap to peek.

## Talking to it

- **Speak** with the mic, or **type** in Chinese / English.
- `hint` (or the 💡 button) - breaks the current question down word-by-word so you can build the answer yourself. It never gives the answer.
- `configure` - opens Settings.
- After a correction it **holds**: say the corrected line back before it moves on.

## Hands-free voice mode

Tap **"go hands-free, just talk"** on the start screen. It speaks the scene, then listens and
replies on its own - no buttons. You talk, pause, and it transcribes, answers, speaks back, and
listens again. Tap ✕ to leave.

## Speech recognition: two options

Huaban recognizes your speech one of two ways, picked automatically:

1. **Browser (default, zero setup).** Whisper via `transformers.js`, fully offline in the
   browser. Works for everyone, nothing to install, handles Chinese + English. Voice mode shows
   **"browser ears"**. This is all most people need.
2. **NVIDIA (optional, sharper, needs a GPU).** `asr_server/server.py` wraps
   `nvidia/nemotron-3.5-asr-streaming-0.6b`, a multilingual streaming ASR model - much crisper
   on mixed Chinese-English. Requires **WSL/Linux + an NVIDIA GPU + NeMo**. When the server is
   running, Huaban uses it automatically and voice mode shows **"NVIDIA ears"**; otherwise it
   falls back to option 1.

   ```bash
   # in WSL (one-time): a python 3.11 venv + NeMo from source — details in asr_server/server.py
   cd ~/nemo-asr && . .venv/bin/activate
   uv pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@main" \
                  fastapi "uvicorn[standard]" soundfile imageio-ffmpeg
   ASR_PORT=8799 python /path/to/asr_server/server.py
   ```

On Windows, `scripts/start.cmd` boots the whole local stack (app + optional OpenCode bridge +
NVIDIA speech server) in one double-click.

## Roadmap (not built yet, on purpose)

This is the local-first core. The hosted "$6/month like Duolingo" product would add: accounts +
billing (Stripe), a server-side key so learners don't bring their own, usage metering, and saved
progress. Kept out for now so the loop works on your machine first.

## Project layout

```
server/        Express backend
  prompt.mjs     the immersion-agent system prompt + JSON contract
  scenarios.mjs  the 20-scene pool
  providers.mjs  OpenAI-compatible + Anthropic adapters
  tts.mjs        edge-tts over a direct WebSocket (Sec-MS-GEC token) with on-disk cache
  opencode-bridge.mjs  optional: run free via an OpenCode subscription (see below)
  index.mjs      routes: /api/chat, /api/tts, /api/config
src/           React frontend
  lib/           store (state machine), whisper worker, audio, api, asr (NVIDIA client)
  components/    StartScreen, Conversation, VoiceMode (hands-free), CorrectionCard, etc.
asr_server/    optional NVIDIA speech server (Python/NeMo, runs in WSL on a GPU)
scripts/       start.cmd / start.ps1 — boot the full local stack in one click (Windows)
```

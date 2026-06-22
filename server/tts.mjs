import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

// Minimal Edge TTS client. We talk the readaloud websocket protocol directly
// (Node 21+ ships a global WebSocket) so we control the Sec-MS-GEC token that
// Microsoft now requires — the bundled libraries that omit it get 403'd.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".tts-cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600n; // seconds between 1601-01-01 and 1970-01-01
const CHROMIUM_VERSION = "143.0.3650.75";
const GEC_VERSION = `1-${CHROMIUM_VERSION}`;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

function secMsGec(skewMs = 0) {
  let ticks = BigInt(Math.floor((Date.now() + skewMs) / 1000)) + WIN_EPOCH;
  ticks -= ticks % 300n; // round down to a 5-minute boundary
  ticks *= 10_000_000n; // to 100-nanosecond intervals
  const str = ticks.toString() + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash("sha256").update(str, "ascii").digest("hex").toUpperCase();
}

function synthUrl(skewMs = 0) {
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    ConnectionId: crypto.randomUUID().replace(/-/g, ""),
    "Sec-MS-GEC": secMsGec(skewMs),
    "Sec-MS-GEC-Version": GEC_VERSION,
  });
  return `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?${params}`;
}

function localeFromVoice(voice) {
  const parts = voice.split("-");
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "zh-CN";
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function ssml(text, voice, rate) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${localeFromVoice(voice)}'>` +
    `<voice name='${voice}'><prosody rate='${rate}' pitch='+0Hz'>${escapeXml(text)}</prosody></voice></speak>`
  );
}

// Pull the audio payload out of a binary websocket frame:
// [2-byte big-endian header length][header text][audio bytes]
function extractAudio(buf) {
  const headerLen = (buf[0] << 8) | buf[1];
  const header = buf.subarray(2, 2 + headerLen).toString("utf8");
  if (header.includes("Path:audio")) return buf.subarray(2 + headerLen);
  return null;
}

const CHROME_MAJOR = CHROMIUM_VERSION.split(".")[0];
function wsHeaders() {
  return {
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROME_MAJOR}.0.0.0`,
    // the synth socket requires a muid cookie
    Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
  };
}

function edgeTTS(text, voice, rate, skewMs = 0) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(synthUrl(skewMs), { headers: wsHeaders() });
    const chunks = [];
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch {}
      reject(new Error("Edge TTS timed out"));
    }, 20000);

    // On a 403 the server tells us its clock via the Date header; surface it so
    // synthesize() can recompute the token with the right skew and retry.
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      const err = new Error(`Edge TTS rejected (${res.statusCode})`);
      err.status = res.statusCode;
      err.serverDate = res.headers?.date;
      try { ws.terminate(); } catch {}
      reject(err);
    });

    ws.on("open", () => {
      const ts = new Date().toISOString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
      );
      const requestId = crypto.randomUUID().replace(/-/g, "");
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml(text, voice, rate)}`
      );
    });

    ws.on("message", (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!isBinary) {
        if (buf.toString("utf8").includes("Path:turn.end")) {
          clearTimeout(timer);
          ws.close();
          resolve(Buffer.concat(chunks));
        }
      } else {
        const audio = extractAudio(buf);
        if (audio && audio.length) chunks.push(audio);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Edge TTS connection failed: ${err?.message || "endpoint refused"}`));
    });
    ws.on("close", () => clearTimeout(timer));
  });
}

function cacheKey(text, voice, rate) {
  return crypto.createHash("sha1").update(`${voice}|${rate}|${text}`).digest("hex");
}

/** Synthesize text to an mp3 Buffer, cached on disk by (voice, rate, text). */
export async function synthesize(text, voice = "zh-CN-XiaoxiaoNeural", rate = "0%") {
  const clean = (text || "").trim();
  if (!clean) throw new Error("Empty text for TTS.");
  const file = path.join(CACHE_DIR, `${cacheKey(clean, voice, rate)}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);

  let buf;
  try {
    buf = await edgeTTS(clean, voice, rate);
  } catch (err) {
    // clock-skew recovery: recompute the token against the server's own clock
    if (err.status === 403 && err.serverDate) {
      const skewMs = Date.parse(err.serverDate) - Date.now();
      buf = await edgeTTS(clean, voice, rate, skewMs);
    } else {
      throw err;
    }
  }
  if (!buf.length) throw new Error("TTS produced no audio.");
  fs.writeFileSync(file, buf);
  return buf;
}

export const VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao 晓晓 · female, warm (default)" },
  { id: "zh-CN-XiaoyiNeural", label: "Xiaoyi 晓伊 · female, lively" },
  { id: "zh-CN-YunxiNeural", label: "Yunxi 云希 · male, casual" },
  { id: "zh-CN-YunyangNeural", label: "Yunyang 云扬 · male, news anchor" },
  { id: "zh-CN-liaoning-XiaobeiNeural", label: "Xiaobei 晓北 · female, NE dialect" },
  { id: "zh-TW-HsiaoChenNeural", label: "HsiaoChen 曉臻 · female, Taiwan" },
];

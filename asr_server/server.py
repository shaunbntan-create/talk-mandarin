# SenseVoice speech server for Huaban (CPU, no GPU required).
#
# SenseVoice-Small (Alibaba / FunAudioLLM) is multilingual (zh / en / yue / ja / ko)
# with strong Chinese-English code-switching and very low latency, because it is
# non-autoregressive (no beam search). It runs comfortably on CPU in well under 1GB,
# so unlike the old NeMo server this needs no NVIDIA GPU and no WSL.
#
# Drop-in replacement: SAME HTTP contract the browser already speaks
# (see src/lib/asr.ts) -> no frontend changes.
#   GET  /health                      -> { ok, engine, device }
#   POST /transcribe?lang=auto        -> { text }
#   body of /transcribe = raw 16 kHz mono float32 PCM (what src/lib/audio.ts produces)
#
# Run (Windows or WSL, CPU):
#   pip install -r asr_server/requirements.txt
#   python asr_server/server.py        # first run auto-downloads the model (~230MB)
#
# Reachable from the browser at http://localhost:8799. When it's up, the app prefers
# it automatically and falls back to in-browser Whisper if it's down (see asr.ts).

import os
import tarfile
import urllib.request
from pathlib import Path

import numpy as np
import sherpa_onnx
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

PORT = int(os.environ.get("ASR_PORT", "8799"))
PROVIDER = os.environ.get("ASR_PROVIDER", "cpu")  # set to "cuda" only if you want the GPU
THREADS = int(os.environ.get("ASR_THREADS", str(min(4, os.cpu_count() or 4))))
SR = 16000

HERE = Path(__file__).resolve().parent
MODEL_NAME = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
MODEL_ROOT = Path(os.environ.get("ASR_MODEL_DIR", HERE / "models"))
MODEL_DIR = MODEL_ROOT / MODEL_NAME
MODEL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    f"{MODEL_NAME}.tar.bz2"
)


def ensure_model() -> tuple[str, str]:
    """Download + extract the SenseVoice ONNX model once; return (model, tokens) paths."""
    model_file = MODEL_DIR / "model.int8.onnx"  # int8 = faster + smaller on CPU
    tokens_file = MODEL_DIR / "tokens.txt"
    if model_file.exists() and tokens_file.exists():
        return str(model_file), str(tokens_file)

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    archive = MODEL_ROOT / f"{MODEL_NAME}.tar.bz2"
    if not archive.exists():
        print(f"[asr] downloading SenseVoice model (~230MB) from {MODEL_URL} ...", flush=True)
        urllib.request.urlretrieve(MODEL_URL, archive)
    print("[asr] extracting model ...", flush=True)
    with tarfile.open(archive, "r:bz2") as tar:
        tar.extractall(MODEL_ROOT)
    try:
        archive.unlink()
    except OSError:
        pass
    if not (model_file.exists() and tokens_file.exists()):
        raise RuntimeError(f"Model files missing after extract under {MODEL_DIR}")
    return str(model_file), str(tokens_file)


print("[asr] preparing SenseVoice ...", flush=True)
model_path, tokens_path = ensure_model()
recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
    model=model_path,
    tokens=tokens_path,
    num_threads=THREADS,
    use_itn=True,        # punctuation + inverse text normalization (e.g. digits)
    language="",         # "" = auto-detect; this is what makes zh/en code-switching work
    provider=PROVIDER,
    debug=False,
)
print(f"[asr] ready: SenseVoice on {PROVIDER}, {THREADS} threads, port {PORT}", flush=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


def transcribe_pcm(audio: np.ndarray) -> str:
    stream = recognizer.create_stream()
    stream.accept_waveform(SR, audio)
    recognizer.decode_stream(stream)
    return (stream.result.text or "").strip()


@app.get("/health")
def health():
    return {"ok": True, "engine": "sense-voice", "device": PROVIDER}


@app.post("/transcribe")
async def transcribe(request: Request, lang: str = Query("auto")):
    # `lang` is accepted for backward compatibility but intentionally ignored:
    # SenseVoice auto-detect is precisely what lets one utterance mix Chinese and
    # English. Pinning a single language would defeat the whole point.
    body = await request.body()
    if not body:
        return {"text": ""}
    audio = np.frombuffer(body, dtype=np.float32).copy()
    if audio.size == 0:
        return {"text": ""}
    try:
        return {"text": transcribe_pcm(audio)}
    except Exception as e:  # noqa: BLE001
        return {"text": "", "error": repr(e)[:300]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")

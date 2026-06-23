import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Microphone, Stop, CircleNotch } from "@phosphor-icons/react";
import { MicRecorder, trimSilence } from "../lib/audio";
import { loadWhisper, transcribe as whisperTranscribe } from "../lib/whisper";
import { transcribeRemote, remoteAsrHealthy } from "../lib/asr";
import { useStore } from "../lib/store";

type Status = "idle" | "loading" | "recording" | "thinking";

export function MicButton({
  onResult,
  disabled,
}: {
  onResult: (text: string) => void;
  disabled?: boolean;
}) {
  const prefs = useStore((s) => s.prefs);
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const recRef = useRef<MicRecorder | null>(null);
  const loadRef = useRef<Promise<void> | null>(null);
  const remoteRef = useRef<boolean | null>(null); // is the NVIDIA speech server up?

  function ensureModel() {
    if (!loadRef.current) {
      loadRef.current = loadWhisper(prefs.sttModel, (p) => {
        if (p.status === "progress" && typeof p.progress === "number") setProgress(Math.round(p.progress));
        if (p.status === "ready" || p.status === "done") setProgress(null);
      });
    }
    return loadRef.current;
  }

  async function startRec() {
    setErr(null);
    try {
      const rec = new MicRecorder();
      recRef.current = rec;
      await rec.start(setLevel);
      setStatus("recording");
      // prefer the NVIDIA speech server; only warm the browser model if it's down
      remoteAsrHealthy().then((h) => {
        remoteRef.current = h;
        if (!h) ensureModel().catch(() => {});
      });
    } catch (e: any) {
      recRef.current = null;
      setErr(e?.name === "NotAllowedError" ? "Mic permission denied" : "Mic unavailable");
      setStatus("idle");
    }
  }

  async function stopRec() {
    const rec = recRef.current;
    if (!rec) return;
    setStatus("thinking");
    setLevel(0);
    try {
      const raw = await rec.stop();
      const audio = trimSilence(raw); // hand the recognizer just the speech
      let text = "";
      // Always prefer the SenseVoice server and let it auto-detect the language
      // (that is what mixes Chinese + English in one go). Browser Whisper is only
      // a last resort when the server is genuinely down.
      if (remoteRef.current !== false) {
        try {
          text = await transcribeRemote(audio, "auto");
        } catch {
          await ensureModel();
          text = await whisperTranscribe(audio, prefs.sttLanguage);
        }
      } else {
        await ensureModel();
        text = await whisperTranscribe(audio, prefs.sttLanguage);
      }
      text = (text || "").trim();
      if (!text) {
        // never fail silently — that reads as "the button is broken"
        setErr("Didn't catch that. Try again, a little louder.");
        return;
      }
      setErr(null);
      onResult(text);
    } catch (e: any) {
      setErr(e?.message || "Could not transcribe");
    } finally {
      recRef.current = null;
      setStatus("idle");
    }
  }

  function onClick() {
    if (status === "recording") stopRec();
    else if (status === "idle") startRec();
  }

  const busy = status === "loading" || status === "thinking";
  const recording = status === "recording";

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={recording ? "stop recording" : "start recording"}
        className="relative grid h-14 w-14 place-items-center rounded-full transition active:scale-95 disabled:opacity-50"
        style={{ background: recording ? "var(--color-cinnabar)" : "var(--color-surface)" }}
      >
        {/* live voice rings */}
        {recording && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--color-cinnabar)" }}
            animate={{ scale: 1 + level * 0.6, opacity: 0.25 - level * 0.1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        )}
        {!recording && (
          <span className="absolute inset-0 rounded-full border border-line-strong" />
        )}
        <span className="relative text-cinnabar" style={{ color: recording ? "var(--color-on-cinnabar)" : undefined }}>
          {busy ? (
            <CircleNotch size={24} weight="bold" className="animate-spin" />
          ) : recording ? (
            <Stop size={22} weight="fill" />
          ) : (
            <Microphone size={24} weight="fill" />
          )}
        </span>
      </button>
      <span className="h-4 text-[11px] text-faint">
        {err
          ? err
          : status === "thinking"
            ? "transcribing…"
            : progress !== null
              ? `loading voice ${progress}%`
              : recording
                ? "tap to stop"
                : ""}
      </span>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Microphone, Sparkle } from "@phosphor-icons/react";
import { useStore, spokenLine } from "../lib/store";
import { MicRecorder, playTTS, trimSilence } from "../lib/audio";
import { transcribeRemote, remoteAsrHealthy } from "../lib/asr";
import { loadWhisper, transcribe as whisperTranscribe } from "../lib/whisper";
import { ttsUrl } from "../lib/api";
import { Breakdown } from "./Breakdown";
import { SpeakButton } from "./ui";
import type { Scenario, Turn, Word } from "../types";

// What to show on screen for a given agent turn: the line + pinyin + English + the
// per-word breakdown. Covers questions, hints (which have no audio), and corrections.
function detailFor(turn: Turn | null | undefined): {
  label: string | null;
  hanzi: string;
  pinyin: string | null;
  english: string | null;
  breakdown: Word[];
} | null {
  if (!turn) return null;
  if (turn.mode === "correction" && turn.correction) {
    const b = turn.correction.better;
    return { label: "say it like this", hanzi: b.hanzi, pinyin: b.pinyin, english: b.english, breakdown: b.breakdown || [] };
  }
  if (turn.mode === "hint" && turn.hint) {
    return { label: "hint", hanzi: turn.hint.spaced, pinyin: null, english: turn.hint.english, breakdown: turn.hint.breakdown || [] };
  }
  if (turn.speak) {
    return { label: null, hanzi: turn.speak.hanzi, pinyin: turn.speak.pinyin, english: turn.speak.english, breakdown: turn.speak.breakdown || [] };
  }
  return null;
}

type Phase = "starting" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

const LABEL: Record<Phase, string> = {
  starting: "Warming up…",
  listening: "Listening… just talk",
  transcribing: "Heard you…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Mic unavailable",
};

export function VoiceMode() {
  const voiceMode = useStore((s) => s.voiceMode);
  const exitVoiceMode = useStore((s) => s.exitVoiceMode);
  const entries = useStore((s) => s.entries);

  const [phase, setPhase] = useState<Phase>("starting");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [engine, setEngine] = useState<"nvidia" | "browser">("browser");
  const [typed, setTyped] = useState("");

  // the in-overlay "make a new situation" sheet
  const [making, setMaking] = useState(false);
  const [situation, setSituation] = useState("");
  const [persona, setPersona] = useState("");

  const running = useRef(false);
  const abort = useRef<() => void>(() => {});

  // the active scene (from the most recent "setup" turn) and the latest line
  const scene = ([...entries].reverse().find(
    (e) => e.role === "agent" && e.turn.mode === "setup" && e.turn.scenario
  ) as { role: "agent"; turn: Turn } | undefined)?.turn.scenario as Scenario | undefined;
  const lastAgent = [...entries].reverse().find((e) => e.role === "agent");
  const det = detailFor(lastAgent && lastAgent.role === "agent" ? lastAgent.turn : null);

  function startCustomSituation() {
    const s = situation.trim();
    if (!s) return;
    setMaking(false);
    setHeard("");
    setSituation("");
    setPersona("");
    useStore.getState().start({ kind: "custom", situation: s, persona: persona.trim() });
  }

  useEffect(() => {
    if (!voiceMode) return;
    running.current = true;

    function listen(): Promise<Float32Array | null> {
      return new Promise((resolve) => {
        const rec = new MicRecorder();
        let speech = false;
        let speechMs = 0;   // how much loud audio we've actually heard
        let silenceAt = 0;
        let lastTick = 0;
        let done = false;

        // Calibrate to the room. Right after the tutor speaks you aren't talking
        // yet, so the first stretch is ambient noise: measure it, then set the
        // thresholds relative to it. Fixed thresholds were the bug — too high on
        // a quiet mic (never triggers) and too low in a noisy room (never stops).
        const CAL_MS = 400;
        let floor = 0;
        let startTh = 0.14, endTh = 0.09; // provisional until calibrated
        const SIL_MS = 1000;        // a pause this long ends your turn (room to think)
        const MIN_SPEECH_MS = 350;  // ignore clicks/coughs shorter than this
        const MAX_MS = 15000;       // hard cap on one turn
        const NO_SPEECH_MS = 12000; // total silence: stop and re-listen, don't hang
        const t0 = performance.now();

        const finish = async () => {
          if (done) return;
          done = true;
          try { resolve(await rec.stop()); } catch { resolve(null); }
        };
        const giveUp = () => {
          if (done) return;
          done = true;
          try { rec.cancel(); } catch { /* ignore */ }
          resolve(null);
        };
        abort.current = giveUp;

        rec
          .start((lvl) => {
            setLevel(lvl);
            const now = performance.now();
            const dt = lastTick ? now - lastTick : 0;
            lastTick = now;
            const elapsed = now - t0;

            // calibration window: learn the noise floor, don't endpoint yet
            if (elapsed < CAL_MS) {
              floor = Math.max(floor, lvl);
              startTh = Math.min(0.3, Math.max(0.1, floor + 0.08));
              endTh = Math.min(0.22, Math.max(0.05, floor + 0.04));
              return;
            }

            if (lvl > startTh) {
              speech = true;
              silenceAt = 0;
              speechMs += dt;
            } else if (lvl < endTh) {
              // only end the turn after we've heard real speech, then a full pause
              if (speech && speechMs > MIN_SPEECH_MS) {
                if (!silenceAt) silenceAt = now;
                else if (now - silenceAt > SIL_MS) finish();
              }
            }
            if (speech && elapsed > MAX_MS) finish();
            if (!speech && elapsed > NO_SPEECH_MS) giveUp();
          })
          .catch(() => { setPhase("error"); resolve(null); });
      });
    }

    function speak(line: string): Promise<void> {
      return new Promise((resolve) => {
        const { prefs } = useStore.getState();
        let done = false;
        const fin = () => { if (!done) { done = true; resolve(); } };
        playTTS(ttsUrl(line, prefs.voice, prefs.rate), (playing) => { if (!playing) fin(); });
        setTimeout(fin, 20000); // safety
      });
    }

    (async () => {
      // pick the speech engine
      const useNvidia = await remoteAsrHealthy();
      setEngine(useNvidia ? "nvidia" : "browser");
      console.debug("[huaban] hands-free ASR:", useNvidia ? "SenseVoice (server)" : "browser Whisper");
      if (!useNvidia) {
        try { await loadWhisper(useStore.getState().prefs.sttModel); } catch { /* ignore */ }
      }

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let lastSpokenId: string | null = null;

      while (running.current) {
        const st = useStore.getState();

        // a turn is being generated — wait for it
        if (st.busy) { setPhase("thinking"); await sleep(150); continue; }

        // speak any new agent line before we listen again (incl. the opening scene)
        const la = [...st.entries].reverse().find((e) => e.role === "agent");
        if (la && la.role === "agent" && la.id !== lastSpokenId) {
          lastSpokenId = la.id;
          const line = spokenLine(la.turn);
          if (line && st.prefs.autoPlay !== false) {
            setPhase("speaking");
            await speak(line);
            await sleep(250); // let the speaker go quiet before we open the mic
          }
          continue;
        }

        // listen for the user
        setPhase("listening");
        const raw = await listen();
        if (!running.current) break;
        if (!raw || raw.length < 1600) continue;
        const audio = trimSilence(raw); // hand the recognizer just the speech

        setPhase("transcribing");
        let text = "";
        try {
          // ALWAYS auto-detect: that is exactly what lets one utterance mix Chinese
          // and English. The server ignores the lang hint, but we pass "auto" so the
          // browser fallback never pins a single language either.
          text = useNvidia
            ? await transcribeRemote(audio, "auto")
            : await whisperTranscribe(audio, st.prefs.sttLanguage);
        } catch { text = ""; }
        text = (text || "").trim();
        if (!running.current) break;
        if (!text) continue;
        setHeard(text);

        setPhase("thinking");
        await useStore.getState().sendText(text);
      }
    })();

    return () => {
      running.current = false;
      try { abort.current(); } catch { /* ignore */ }
    };
  }, [voiceMode]);

  if (!voiceMode) return null;

  const scale = 1 + Math.min(level, 1) * (phase === "listening" ? 0.7 : 0.15);
  const active = phase === "listening";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="aurora fixed inset-0 z-[60] flex flex-col items-center justify-between px-6 py-8 safe-b"
      >
        {/* ---- top bar: the active situation + controls ---- */}
        <div className="flex w-full max-w-xl items-start justify-between gap-3">
          <div className="glass min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">The situation</p>
            {scene ? (
              <p className="mt-0.5 truncate text-sm text-ink">
                <span className="mr-1">{scene.emoji}</span>
                <span className="font-medium">{scene.title_en}</span>
                <span className="text-ink/55"> · you're talking to {scene.role}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-ink/55">Setting the scene…</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setMaking((v) => !v)}
              aria-label="new situation"
              className="glass grid h-11 w-11 place-items-center rounded-full text-ink/70 transition hover:text-ink active:scale-95"
            >
              <Sparkle size={18} weight={making ? "fill" : "regular"} className="text-sage" />
            </button>
            <button
              onClick={exitVoiceMode}
              aria-label="leave voice mode"
              className="glass grid h-11 w-11 place-items-center rounded-full text-ink/70 transition hover:text-ink active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ---- new-situation sheet ---- */}
        <AnimatePresence>
          {making && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="w-full max-w-xl overflow-hidden"
            >
              <div className="glass-strong mt-3 space-y-3 rounded-3xl p-4 text-left">
                <input
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="The situation — e.g. ordering street food in Chengdu"
                  className="font-sans w-full rounded-xl border border-white/50 bg-white/45 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-sage"
                />
                <input
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startCustomSituation()}
                  placeholder="Who should I be? — e.g. a cheerful stall vendor"
                  className="font-sans w-full rounded-xl border border-white/50 bg-white/45 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-sage"
                />
                <button
                  onClick={startCustomSituation}
                  disabled={!situation.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-on-cinnabar transition active:scale-[0.98] disabled:opacity-40"
                >
                  <Microphone size={17} weight="fill" />
                  Start this situation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the orb */}
        <div className="flex flex-1 flex-col items-center justify-center gap-10">
          <div className="relative grid place-items-center">
            <motion.div
              className="absolute rounded-full bg-ink/10"
              style={{ width: 220, height: 220 }}
              animate={{ scale: active ? scale : 1, opacity: active ? 0.6 : 0.25 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />
            <motion.div
              className="grid h-40 w-40 place-items-center rounded-full bg-ink text-on-cinnabar"
              animate={
                phase === "thinking"
                  ? { scale: [1, 1.06, 1] }
                  : phase === "speaking"
                  ? { scale: [1, 1.1, 0.97, 1.05, 1] }
                  : { scale: 1 }
              }
              transition={
                phase === "thinking" || phase === "speaking"
                  ? { duration: phase === "speaking" ? 0.7 : 1.1, repeat: Infinity }
                  : { type: "spring", stiffness: 300, damping: 20 }
              }
            >
              <Microphone size={48} weight="fill" />
            </motion.div>
          </div>

          <div className="text-center">
            <p className="font-display text-3xl text-ink">
              {(phase === "thinking" || phase === "starting") && !scene ? "Setting the scene…" : LABEL[phase]}
            </p>
            {heard && phase !== "listening" && (
              <p className="mt-3 max-w-md font-han text-base text-ink/60">“{heard}”</p>
            )}
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-ink/35">
              {engine === "nvidia" ? "SenseVoice · 中文 + English" : "browser ears"}
            </p>
          </div>
        </div>

        {/* what the tutor just said — Hanzi first, reveal the rest only if you ask */}
        <div className="mb-2 w-full max-w-xl">
          {det && <DetailCard key={det.hanzi} det={det} autoReveal={useStore.getState().prefs.autoReveal} />}

          {phase === "error" && (
            <p className="mt-2 text-center text-sm text-ink">
              Couldn’t reach the microphone. Allow mic access, then reopen voice mode.
            </p>
          )}

          {/* type instead of (or as well as) talking — for when speech misses */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = typed.trim();
              if (!t) return;
              setTyped("");
              setHeard(t);
              try { abort.current(); } catch { /* stop listening */ }
              useStore.getState().sendText(t);
            }}
            className="mt-3 flex items-center gap-2"
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or type your answer (中文 / English)"
              className="glass font-han min-w-0 flex-1 rounded-full px-4 py-2.5 text-base text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:text-ink/40"
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-on-cinnabar disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Progressive reveal for hands-free: show only the Hanzi at first. "See more"
// uncovers pinyin + English; "See the breakdown" opens the word-by-word table.
function DetailCard({
  det,
  autoReveal,
}: {
  det: { label: string | null; hanzi: string; pinyin: string | null; english: string | null; breakdown: Word[] };
  autoReveal: boolean;
}) {
  const [gloss, setGloss] = useState(autoReveal);
  const [table, setTable] = useState(false);
  const hasGloss = Boolean(det.pinyin || det.english);

  return (
    <div className="glass max-h-[46vh] overflow-y-auto rounded-3xl p-4 text-left">
      {det.label && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{det.label}</p>
      )}
      <div className="flex items-start gap-3">
        <SpeakButton text={det.hanzi} size="sm" />
        <p className="font-han text-2xl leading-snug text-ink">{det.hanzi}</p>
      </div>

      <AnimatePresence initial={false}>
        {gloss && hasGloss && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {det.pinyin && <p className="pinyin mt-2 text-sm text-cinnabar-deep">{det.pinyin}</p>}
            {det.english && <p className="mt-1 text-sm text-muted">{det.english}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the reveal ladder */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {hasGloss && !gloss && (
          <button onClick={() => setGloss(true)} className="text-xs font-medium text-sage hover:underline">
            see more (pinyin + English)
          </button>
        )}
        {(gloss || !hasGloss) && det.breakdown.length > 0 && !table && (
          <button onClick={() => setTable(true)} className="text-xs font-medium text-sage hover:underline">
            see the breakdown
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {table && det.breakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden"
          >
            <Breakdown words={det.breakdown} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Gear, Microphone, Sparkle, Keyboard, ArrowRight } from "@phosphor-icons/react";
import { useStore } from "../lib/store";

export function StartScreen() {
  const { start, openSettings, enterVoiceMode } = useStore();
  const [making, setMaking] = useState(false);
  const [situation, setSituation] = useState("");
  const [persona, setPersona] = useState("");

  function launchCustom() {
    const s = situation.trim();
    if (!s) return;
    enterVoiceMode({ kind: "custom", situation: s, persona: persona.trim() });
  }

  return (
    <div className="aurora relative flex min-h-[100dvh] flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <span className="font-han text-lg font-bold text-ink wiggly">话伴</span>
        <button
          onClick={openSettings}
          aria-label="settings"
          className="glass grid h-10 w-10 place-items-center rounded-full text-ink/70 transition hover:text-ink active:scale-95"
        >
          <Gear size={17} />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-5 text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-ink/55"
        >
          Chinese immersion
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="font-display text-balance text-4xl text-ink sm:text-5xl"
        >
          Talk your way to fluent Mandarin.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-ink/65"
        >
          A native partner sets a scene, speaks only Chinese, and fixes you the moment you slip into English. You answer out loud.
        </motion.p>

        {/* ---- the main event: hands-free ---- */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => enterVoiceMode()}
          className="glass-strong mt-6 flex w-full max-w-md items-center gap-4 rounded-[28px] p-5 text-left transition-shadow hover:shadow-2xl hover:shadow-ink/15"
        >
          <span className="relative grid h-16 w-16 shrink-0 place-items-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-ink/10"
              animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-on-cinnabar">
              <Microphone size={28} weight="fill" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-display text-2xl text-ink">Go hands-free</span>
            <span className="mt-0.5 block text-sm leading-snug text-ink/60">
              Just talk. I listen, reply out loud, and fix your Chinese in real time.
            </span>
          </span>
          <ArrowRight size={20} className="ml-auto shrink-0 text-ink/40" />
        </motion.button>

        {/* ---- two quieter ways in ---- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="mt-3 flex w-full max-w-md items-center gap-3"
        >
          <button
            onClick={() => setMaking((v) => !v)}
            className="glass flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-medium text-ink/75 transition hover:text-ink"
          >
            <Sparkle size={16} weight={making ? "fill" : "regular"} className="text-sage" />
            Make your own situation
          </button>
          <button
            onClick={() => start()}
            className="glass flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-medium text-ink/65 transition hover:text-ink"
          >
            <Keyboard size={16} />
            Type instead
          </button>
        </motion.div>

        {/* ---- custom situation builder ---- */}
        <AnimatePresence>
          {making && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full max-w-md overflow-hidden"
            >
              <div className="glass mt-3 space-y-3 rounded-[24px] p-4 text-left">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-faint">The situation</span>
                  <input
                    value={situation}
                    onChange={(e) => setSituation(e.target.value)}
                    placeholder="e.g. haggling at a night market in Taipei"
                    className="w-full rounded-xl border border-white/50 bg-white/45 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-sage"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-faint">Who should I be?</span>
                  <input
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && launchCustom()}
                    placeholder="e.g. a sharp-tongued stall owner who loves to bargain"
                    className="w-full rounded-xl border border-white/50 bg-white/45 px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-sage"
                  />
                </label>
                <button
                  onClick={launchCustom}
                  disabled={!situation.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-on-cinnabar transition active:scale-[0.98] disabled:opacity-40"
                >
                  <Microphone size={17} weight="fill" />
                  Start this situation, hands-free
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

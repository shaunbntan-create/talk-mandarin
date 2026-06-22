import { useState } from "react";
import { motion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";
import clsx from "clsx";
import type { Speak, Turn } from "../types";
import { Breakdown } from "./Breakdown";
import { CorrectionCard } from "./CorrectionCard";
import { HintCard } from "./HintCard";
import { Reveal, SpeakButton } from "./ui";
import { useStore } from "../lib/store";

export function AgentBubble({ turn, isLatest }: { turn: Turn; isLatest: boolean }) {
  const prefs = useStore((s) => s.prefs);
  const autoPlay = prefs.autoPlay && isLatest;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      className="max-w-[680px]"
    >
      {turn.mode === "setup" && turn.scenario && <SceneCard turn={turn} />}

      {(turn.mode === "setup" || turn.mode === "question") && turn.speak && (
        <SpeakBlock speak={turn.speak} autoPlay={autoPlay} autoReveal={prefs.autoReveal} note={turn.advance_note} />
      )}

      {turn.mode === "hint" && turn.hint && <HintCard hint={turn.hint} />}

      {turn.mode === "correction" && turn.correction && (
        <CorrectionCard correction={turn.correction} autoPlay={autoPlay} />
      )}

      {turn.mode === "meta" && turn.say_en && (
        <div className="glass rounded-3xl px-4 py-3 text-sm text-ink/70">
          {turn.say_en}
        </div>
      )}
    </motion.div>
  );
}

function SceneCard({ turn }: { turn: Turn }) {
  const s = turn.scenario!;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass mb-3 rounded-3xl p-5"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">{s.emoji}</span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sage">the scene</p>
          <h2 className="font-display text-2xl text-ink">{s.title_en}</h2>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/75">{s.setup_en}</p>
      <p className="mt-2 text-sm text-ink/55">
        <span className="font-medium text-ink/70">You're talking to:</span> {s.role}
      </p>
    </motion.div>
  );
}

function SpeakBlock({
  speak,
  autoPlay,
  autoReveal,
  note,
}: {
  speak: Speak;
  autoPlay: boolean;
  autoReveal: boolean;
  note?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div className="glass rounded-3xl rounded-tl-lg p-4 sm:p-5">
      {note && <p className="mb-2 text-sm font-medium text-sage">{note}</p>}
      <div className="flex items-start gap-3">
        <SpeakButton text={speak.hanzi} autoPlay={autoPlay} />
        <div className="min-w-0">
          <p className="font-han text-[28px] leading-snug text-ink sm:text-3xl">{speak.hanzi}</p>
          <Reveal forceOpen={autoReveal} className="mt-2 block">
            <span className="pinyin text-sm text-cinnabar-deep">{speak.pinyin}</span>
            <span className="ml-2 text-sm text-muted">{speak.english}</span>
          </Reveal>
        </div>
      </div>

      {speak.breakdown?.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-faint hover:text-muted"
          >
            <CaretDown size={13} className={clsx("transition", showBreakdown && "rotate-180")} />
            {showBreakdown ? "hide breakdown" : "break it down"}
          </button>
          {showBreakdown && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 overflow-hidden">
              <Breakdown words={speak.breakdown} />
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

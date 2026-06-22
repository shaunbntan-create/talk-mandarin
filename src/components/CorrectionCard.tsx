import { Check, WarningCircle } from "@phosphor-icons/react";
import type { Correction } from "../types";
import { Breakdown } from "./Breakdown";
import { Reveal, SpeakButton } from "./ui";

export function CorrectionCard({
  correction,
  autoPlay,
}: {
  correction: Correction;
  autoPlay: boolean;
}) {
  const c = correction;
  return (
    <div className="glass overflow-hidden rounded-3xl">
      {/* A — what you said */}
      <div className="bg-amber-soft/50 p-4 sm:p-5">
        <SectionLabel tone="amber">你说的 · what you said</SectionLabel>
        <p className="mt-2 text-ink/90">"{c.yours.text}"</p>
        {c.yours.breakdown?.length > 0 && (
          <div className="mt-3">
            <Breakdown words={c.yours.breakdown} />
          </div>
        )}
      </div>

      {/* flags — the FilChi traps */}
      {c.flags?.length > 0 && (
        <ul className="space-y-1.5 border-t border-line px-4 py-3.5 sm:px-5">
          {c.flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-amber" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {/* fixes */}
      {(c.structure_fix || c.vocab_fill?.length > 0) && (
        <div className="space-y-4 border-t border-line p-4 sm:p-5">
          {c.structure_fix && (
            <div>
              <SectionLabel>📍 结构修正 · structure</SectionLabel>
              <p className="mt-1.5 text-sm text-muted">{c.structure_fix}</p>
            </div>
          )}
          {c.vocab_fill?.length > 0 && (
            <div>
              <SectionLabel>📍 词汇填充 · vocabulary</SectionLabel>
              <ul className="mt-2 space-y-1.5">
                {c.vocab_fill.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="text-muted line-through decoration-amber/60">{v.en}</span>
                    <span className="text-faint">→</span>
                    <span className="font-han text-base font-medium text-ink">{v.zh}</span>
                    <span className="pinyin text-cinnabar-deep">{v.pinyin}</span>
                    <span className="text-muted">{v.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* B — the better way */}
      <div className="border-t border-line bg-sage-soft/40 p-4 sm:p-5">
        <SectionLabel tone="sage">更好的说法 · say it like this</SectionLabel>
        <div className="mt-3 flex items-start gap-3">
          <SpeakButton text={c.better.hanzi} autoPlay={autoPlay} />
          <div className="min-w-0">
            <p className="font-han text-2xl leading-relaxed text-ink">{c.better.hanzi}</p>
            <Reveal className="mt-1.5 block" forceOpen={false}>
              <span className="pinyin text-sm text-cinnabar-deep">{c.better.pinyin}</span>
              <span className="ml-2 text-sm text-muted">{c.better.english}</span>
            </Reveal>
          </div>
        </div>
        <div className="mt-3">
          <Breakdown words={c.better.breakdown} />
        </div>
      </div>

      {/* your turn */}
      <div className="flex items-center gap-3 border-t border-line p-4 sm:px-5">
        <Check size={18} weight="bold" className="shrink-0 text-sage" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">你来说 · your turn</p>
          <p className="font-han text-xl tracking-[0.12em] text-ink">{c.better.spaced}</p>
        </div>
        <SpeakButton text={c.better.hanzi} size="sm" />
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "amber" | "sage";
}) {
  const color = tone === "amber" ? "text-amber" : tone === "sage" ? "text-sage" : "text-faint";
  return <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{children}</p>;
}

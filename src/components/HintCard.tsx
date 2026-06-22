import { Lightbulb } from "@phosphor-icons/react";
import type { Hint } from "../types";
import { Breakdown } from "./Breakdown";

export function HintCard({ hint }: { hint: Hint }) {
  return (
    <div className="glass rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-amber">
        <Lightbulb size={18} weight="fill" />
        <span className="text-xs font-semibold uppercase tracking-wide">Hint</span>
      </div>

      <p className="font-han text-2xl leading-relaxed tracking-[0.15em] text-ink">{hint.spaced}</p>

      <div className="mt-4">
        <Breakdown words={hint.breakdown} />
      </div>

      <p className="mt-4 text-sm text-muted">
        <span className="mr-1.5">💬</span>
        {hint.english}
      </p>

      <p className="mt-4 font-han text-base text-ink">
        如果你可以回说：
        <span className="ml-1 text-faint tracking-widest">________</span>
      </p>
    </div>
  );
}

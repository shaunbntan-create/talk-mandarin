import { motion } from "motion/react";
import type { Word } from "../types";

export function Breakdown({ words }: { words: Word[] }) {
  if (!words?.length) return null;
  return (
    <ul className="divide-y divide-white/40 rounded-2xl border border-white/40 bg-white/35">
      {words.map((w, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.03 * i, duration: 0.25 }}
          className="flex items-baseline gap-3 px-3.5 py-2"
        >
          <span className="font-han text-lg font-medium text-ink min-w-[2.2em]">{w.word}</span>
          <span className="pinyin text-sm text-cinnabar-deep min-w-[4.5em]">{w.pinyin}</span>
          <span className="text-sm text-muted">{w.english}</span>
        </motion.li>
      ))}
    </ul>
  );
}

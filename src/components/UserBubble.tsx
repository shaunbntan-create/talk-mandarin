import { motion } from "motion/react";

export function UserBubble({ text }: { text: string }) {
  // Likely Chinese -> render in the Han face; harmless for Latin/mixed text too.
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 18 }}
      className="ml-auto max-w-[80%]"
    >
      <div className="rounded-3xl rounded-tr-lg bg-ink px-4 py-3 text-paper shadow-lg shadow-ink/10">
        <p className="font-han text-lg leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

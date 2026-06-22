import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Gear, ArrowsClockwise, X } from "@phosphor-icons/react";
import { useStore } from "../lib/store";
import { AgentBubble } from "./AgentBubble";
import { UserBubble } from "./UserBubble";
import { Composer } from "./Composer";

export function Conversation() {
  const { entries, busy, holding, endSession, openSettings, start } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const setupEntry = entries.find((e) => e.role === "agent" && e.turn.mode === "setup");
  const scenario = setupEntry?.role === "agent" ? setupEntry.turn.scenario : undefined;
  const sceneTitle = scenario?.title_en;
  const sceneEmoji = scenario?.emoji;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries.length, busy]);

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="glass sticky top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-han text-lg font-bold text-ink">话伴</span>
          {sceneTitle && (
            <span className="truncate text-sm text-ink/55">
              {sceneEmoji} {sceneTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="new scene" onClick={() => start()}>
            <ArrowsClockwise size={18} />
          </IconBtn>
          <IconBtn label="settings" onClick={openSettings}>
            <Gear size={18} />
          </IconBtn>
          <IconBtn label="end session" onClick={endSession}>
            <X size={18} />
          </IconBtn>
        </div>
      </header>

      <div ref={scrollRef} className="aurora flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {entries.map((e, i) =>
            e.role === "agent" ? (
              <AgentBubble key={e.id} turn={e.turn} isLatest={i === entries.length - 1} />
            ) : (
              <UserBubble key={e.id} text={e.text} />
            )
          )}
          {busy && <Thinking holding={holding} />}
        </div>
      </div>

      <Composer />
    </div>
  );
}

function Thinking({ holding }: { holding: boolean }) {
  return (
    <div className="flex items-center gap-1.5 pl-1 text-faint">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-faint"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
      <span className="ml-1 text-xs">{holding ? "checking your answer…" : "thinking…"}</span>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-paper-deep hover:text-ink"
    >
      {children}
    </button>
  );
}

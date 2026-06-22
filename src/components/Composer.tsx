import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PaperPlaneRight, Lightbulb, ArrowUUpLeft } from "@phosphor-icons/react";
import { useStore } from "../lib/store";
import { MicButton } from "./MicButton";

export function Composer() {
  const { sendText, busy, holding } = useStore();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function send(value?: string) {
    const v = (value ?? text).trim();
    if (!v || busy) return;
    sendText(v);
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  return (
    <div className="bg-transparent">
      <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2 safe-b">
        <AnimatePresence>
          {holding && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2 flex items-center gap-2 text-sm text-amber"
            >
              <ArrowUUpLeft size={16} weight="bold" />
              Say the corrected line back before we move on.
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-3">
          <MicButton
            onResult={(t) => {
              // APPEND each take, never replace. Recording a Chinese word then an
              // English phrase in two taps must build one line, not clobber the
              // first (that was the "it deletes the Chinese" bug). Empty results
              // are ignored so a missed take can't wipe what's already there.
              const add = t.trim();
              if (!add) return;
              setText((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + " " + add : add));
              requestAnimationFrame(() => {
                if (ref.current) { ref.current.focus(); grow(ref.current); }
              });
            }}
            disabled={busy}
          />

          <div className="glass-strong flex min-w-0 flex-1 items-end gap-2 rounded-3xl px-4 py-2.5">
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                grow(e.target);
              }}
              onKeyDown={onKey}
              rows={1}
              placeholder={holding ? "type the corrected line…" : "speak, or type in 中文 / English…"}
              className="font-han max-h-[140px] flex-1 resize-none bg-transparent text-lg leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-base placeholder:text-faint"
            />
            <button
              type="button"
              onClick={() => send("hint")}
              disabled={busy}
              title="break down the question"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-amber transition hover:bg-amber-soft disabled:opacity-40"
            >
              <Lightbulb size={20} weight="fill" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !text.trim()}
            aria-label="send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cinnabar text-on-cinnabar transition hover:bg-cinnabar-deep active:scale-95 disabled:opacity-40"
          >
            <PaperPlaneRight size={20} weight="fill" />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-faint">
          Type <span className="font-medium">hint</span> for a breakdown ·{" "}
          <span className="font-medium">configure</span> for settings · Enter to send
        </p>
      </div>
    </div>
  );
}

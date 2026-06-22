import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SpeakerHigh, SpeakerSimpleSlash } from "@phosphor-icons/react";
import clsx from "clsx";
import { ttsUrl } from "../lib/api";
import { playTTS } from "../lib/audio";
import { useStore } from "../lib/store";

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "quiet";
}) {
  const styles = {
    primary:
      "bg-cinnabar text-on-cinnabar hover:bg-cinnabar-deep shadow-sm shadow-cinnabar/20",
    soft: "bg-cinnabar-soft text-cinnabar-deep hover:brightness-[0.97]",
    ghost: "border border-line-strong text-ink hover:bg-paper-deep",
    quiet: "text-muted hover:text-ink hover:bg-paper-deep",
  }[variant];
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium",
        "transition-all active:scale-[0.97] active:translate-y-px disabled:opacity-50 disabled:pointer-events-none",
        styles,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// Tap-to-reveal: pinyin/English stay hidden behind a soft blur until the learner
// chooses to peek, so they try to read the Hanzi first.
export function Reveal({
  children,
  forceOpen = false,
  className,
  label = "tap to reveal",
}: {
  children: ReactNode;
  forceOpen?: boolean;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label={shown ? "hide" : label}
      className={clsx(
        "group relative text-left transition",
        !shown && "cursor-pointer select-none",
        className
      )}
    >
      <span className={clsx("block transition", !shown && "blur-[5px] opacity-55")}>
        {children}
      </span>
      {!shown && (
        <span className="absolute inset-0 grid place-items-center text-[11px] font-medium uppercase tracking-wide text-faint">
          {label}
        </span>
      )}
    </button>
  );
}

// Replay a Chinese line as audio (edge-tts via the backend).
export function SpeakButton({
  text,
  size = "md",
  autoPlay = false,
}: {
  text: string;
  size?: "sm" | "md";
  autoPlay?: boolean;
}) {
  const { voice, rate } = useStore((s) => s.prefs);
  const [playing, setPlaying] = useState(false);

  function play() {
    playTTS(ttsUrl(text, voice, rate), setPlaying);
  }

  // auto-play once on mount when asked (a user gesture earlier in the flow unlocks audio)
  useEffect(() => {
    if (autoPlay) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={play}
      aria-label="play pronunciation"
      className={clsx(
        dim,
        "shrink-0 grid place-items-center rounded-full border border-line-strong bg-surface text-cinnabar",
        "transition-all hover:bg-cinnabar-soft active:scale-95"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {playing ? (
          <motion.span
            key="on"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
          >
            <Equalizer />
          </motion.span>
        ) : (
          <motion.span key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SpeakerHigh size={size === "sm" ? 16 : 19} weight="fill" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function Equalizer() {
  return (
    <span className="flex items-end gap-[2px] h-[15px]">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[2.5px] rounded-full bg-cinnabar"
          animate={{ height: ["30%", "100%", "45%", "85%", "30%"] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          style={{ height: "30%" }}
        />
      ))}
    </span>
  );
}

export function Pill({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "cinnabar" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        tone === "cinnabar" ? "bg-cinnabar-soft text-cinnabar-deep" : "bg-paper-deep text-muted"
      )}
    >
      {children}
    </span>
  );
}

export { SpeakerSimpleSlash };

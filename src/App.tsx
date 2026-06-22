import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WarningCircle, X } from "@phosphor-icons/react";
import { useStore } from "./lib/store";
import { StartScreen } from "./components/StartScreen";
import { Conversation } from "./components/Conversation";
import { SettingsPanel } from "./components/SettingsPanel";
import { VoiceMode } from "./components/VoiceMode";

export default function App() {
  const { phase, init, error, dismissError, seedDemo } = useStore();

  useEffect(() => {
    init();
    if (new URLSearchParams(window.location.search).has("demo")) seedDemo();
  }, [init, seedDemo]);

  return (
    <>
      {phase === "welcome" ? <StartScreen /> : <Conversation />}
      <SettingsPanel />
      <VoiceMode />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-cinnabar/30 bg-surface px-4 py-3 shadow-lg shadow-ink/10"
          >
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-cinnabar" />
            <p className="text-sm text-ink">{error}</p>
            <button onClick={dismissError} aria-label="dismiss" className="shrink-0 text-faint hover:text-ink">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

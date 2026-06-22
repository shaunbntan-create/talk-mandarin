import { motion, AnimatePresence } from "motion/react";
import { X } from "@phosphor-icons/react";
import clsx from "clsx";
import { useStore } from "../lib/store";

// The model connection is fixed on the backend (server/config.json) — there is
// deliberately NO model / provider / engine picker here. The user asked for one
// thing that just works, configured behind the scenes. This panel is only the
// handful of human preferences: the tutor's voice, its pace, and study display.
const RATES = ["-20%", "-10%", "-8%", "0%", "+10%"];

export function SettingsPanel() {
  const { settingsOpen, closeSettings, voices, prefs, setPrefs } = useStore();

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSettings}
          />
          <motion.aside
            className="glass-strong fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-md flex-col shadow-2xl shadow-ink/20"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Settings</h2>
              <button onClick={closeSettings} aria-label="close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-paper-deep">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
              {/* voice */}
              <section>
                <SectionHead>Voice (the tutor)</SectionHead>
                <Field label="Speaking voice">
                  <select value={prefs.voice} onChange={(e) => setPrefs({ voice: e.target.value })} className={inputCls}>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Speaking speed">
                  <select value={prefs.rate} onChange={(e) => setPrefs({ rate: e.target.value })} className={inputCls}>
                    {RATES.map((r) => (
                      <option key={r} value={r}>
                        {r === "0%" ? "Normal" : r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Toggle label="Auto-play each line" value={prefs.autoPlay} onChange={(v) => setPrefs({ autoPlay: v })} />
              </section>

              {/* study */}
              <section>
                <SectionHead>Study</SectionHead>
                <Toggle label="Always show pinyin + English" value={prefs.autoReveal} onChange={(v) => setPrefs({ autoReveal: v })} />
                <p className="mt-1 text-xs text-muted">Off = read the Hanzi first, tap to peek.</p>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const inputCls =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-cinnabar";

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between py-1.5 text-left"
    >
      <span className="text-sm font-medium text-ink/80">{label}</span>
      <span className={clsx("relative h-6 w-11 rounded-full transition", value ? "bg-cinnabar" : "bg-line-strong")}>
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow"
          animate={{ left: value ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

import { create } from "zustand";
import type { Entry, Prefs, ProviderConfig, Turn } from "../types";
import { chat, getConfig, getVoices, saveConfig, warm, type ChatMessage } from "./api";
import { startDirective, type StartScene } from "./prompt-client";

const PREFS_KEY = "huaban.prefs";
const USED_KEY = "huaban.usedScenarios";

const DEFAULT_PREFS: Prefs = {
  voice: "zh-CN-XiaoxiaoNeural",
  rate: "-8%",
  sttModel: "Xenova/whisper-base",
  sttLanguage: "auto",
  autoReveal: false,
  autoPlay: true,
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}
function loadUsed(): number[] {
  try {
    return JSON.parse(localStorage.getItem(USED_KEY) || "[]");
  } catch {
    return [];
  }
}

type State = {
  config: ProviderConfig | null;
  ready: boolean; // a model is configured
  voices: { id: string; label: string }[];
  prefs: Prefs;
  usedIds: number[];

  phase: "welcome" | "live";
  entries: Entry[];
  history: ChatMessage[];
  busy: boolean;
  holding: boolean;
  error: string | null;
  settingsOpen: boolean;
  voiceMode: boolean;

  init: () => Promise<void>;
  setPrefs: (p: Partial<Prefs>) => void;
  saveProvider: (cfg: Partial<ProviderConfig> & { apiKey?: string }) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;

  start: (scene?: StartScene) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  endSession: () => void;
  dismissError: () => void;
  seedDemo: () => void;
  enterVoiceMode: (scene?: StartScene) => Promise<void>;
  exitVoiceMode: () => void;
};

export const useStore = create<State>((set, get) => ({
  config: null,
  ready: false,
  voices: [],
  prefs: loadPrefs(),
  usedIds: loadUsed(),
  phase: "welcome",
  entries: [],
  history: [],
  busy: false,
  holding: false,
  error: null,
  settingsOpen: false,
  voiceMode: false,

  async init() {
    // The model is wired on the backend (server/config.json) — the user never
    // configures a connection. Always ready; if the backend ever has a problem,
    // it surfaces as a normal chat error, not a setup wall.
    try {
      const [config, voices] = await Promise.all([getConfig().catch(() => null), getVoices().catch(() => [])]);
      set({ config, ready: true, voices });
    } catch {
      set({ ready: true });
    }
    // warm the model now, while the user is reading the start screen
    warm();
  },

  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    set({ prefs });
  },

  async saveProvider(cfg) {
    const config = await saveConfig(cfg);
    set({ config, ready: Boolean(config.model && config.hasKey) });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  async start(scene = { kind: "random" } as StartScene) {
    if (!get().ready) {
      set({ settingsOpen: true });
      return;
    }
    const directive = startDirective(get().usedIds, scene);
    const history: ChatMessage[] = [{ role: "user", content: directive }];
    set({ phase: "live", entries: [], history, holding: false, error: null });
    await runTurn(set, get, history);
  },

  async sendText(text) {
    const clean = text.trim();
    if (!clean || get().busy) return;

    // "configure" opens the panel rather than talking to the model.
    if (/^(configure|settings|设置|配置)$/i.test(clean)) {
      set({ settingsOpen: true });
      return;
    }

    const userEntry: Entry = { id: crypto.randomUUID(), role: "user", text: clean };
    const history: ChatMessage[] = [...get().history, { role: "user", content: clean }];
    set({ entries: [...get().entries, userEntry], history });
    await runTurn(set, get, history);
  },

  endSession: () => set({ phase: "welcome", entries: [], history: [], holding: false, voiceMode: false }),
  dismissError: () => set({ error: null }),
  seedDemo: () => set({ phase: "live", entries: DEMO_ENTRIES, holding: false }),

  async enterVoiceMode(scene = { kind: "random" } as StartScene) {
    if (!get().ready) {
      set({ settingsOpen: true });
      return;
    }
    set({ voiceMode: true }); // show the overlay immediately
    // A specific/custom scene always begins a fresh session; otherwise only
    // start one if we're not already mid-conversation.
    if (scene.kind !== "random" || get().phase !== "live") get().start(scene);
  },
  exitVoiceMode: () => set({ voiceMode: false }),
}));

// A no-API preview of every card type. Visit /?demo=1 to see it.
const DEMO_ENTRIES: Entry[] = [
  {
    id: "d1",
    role: "agent",
    turn: {
      mode: "setup",
      hold: false,
      scenario: {
        id: 1,
        emoji: "☕",
        title_en: "At the cafe",
        role: "a warm, chatty barista",
        setup_en:
          "It's a slow afternoon. You step into a cozy neighbourhood cafe. I'm the barista behind the counter, and I look up with a smile as you walk over.",
      },
      speak: {
        hanzi: "你好！想喝点什么？",
        pinyin: "nǐ hǎo! xiǎng hē diǎn shén me?",
        english: "Hi! What would you like to drink?",
        breakdown: [
          { word: "你好", pinyin: "nǐ hǎo", english: "hello" },
          { word: "想", pinyin: "xiǎng", english: "want to" },
          { word: "喝", pinyin: "hē", english: "drink" },
          { word: "什么", pinyin: "shén me", english: "what" },
        ],
      },
    },
  },
  { id: "d2", role: "user", text: "我要 a latte" },
  {
    id: "d3",
    role: "agent",
    turn: {
      mode: "correction",
      hold: true,
      correction: {
        yours: {
          text: "我要 a latte",
          breakdown: [
            { word: "我", pinyin: "wǒ", english: "I" },
            { word: "要", pinyin: "yào", english: "want" },
            { word: "a latte", pinyin: "—", english: "(English)" },
          ],
        },
        structure_fix:
          "The frame is right, you just dropped in an English noun. Chinese needs a measure word: 一杯 (one cup) before the drink.",
        vocab_fill: [{ en: "a latte", zh: "一杯拿铁", pinyin: "yì bēi ná tiě", meaning: "a (cup of) latte" }],
        flags: ["拿铁 (ná tiě) is the standard word for latte, it borrows the English sound."],
        better: {
          hanzi: "我要一杯拿铁。",
          pinyin: "wǒ yào yì bēi ná tiě.",
          english: "I'd like a latte.",
          spaced: "我 要 一 杯 拿 铁。",
          breakdown: [
            { word: "我", pinyin: "wǒ", english: "I" },
            { word: "要", pinyin: "yào", english: "want" },
            { word: "一杯", pinyin: "yì bēi", english: "one cup" },
            { word: "拿铁", pinyin: "ná tiě", english: "latte" },
          ],
        },
      },
    },
  },
  { id: "d4", role: "user", text: "我要一杯拿铁。" },
  {
    id: "d5",
    role: "agent",
    turn: {
      mode: "question",
      hold: false,
      advance_note: "对啊 — clean and natural.",
      speak: {
        hanzi: "好的，热的还是冰的？",
        pinyin: "hǎo de, rè de hái shì bīng de?",
        english: "Sure, hot or iced?",
        breakdown: [
          { word: "好的", pinyin: "hǎo de", english: "okay" },
          { word: "热的", pinyin: "rè de", english: "hot" },
          { word: "还是", pinyin: "hái shì", english: "or" },
          { word: "冰的", pinyin: "bīng de", english: "iced" },
        ],
      },
    },
  },
  { id: "d6", role: "user", text: "hint" },
  {
    id: "d7",
    role: "agent",
    turn: {
      mode: "hint",
      hold: false,
      hint: {
        spaced: "好 的，热 的 还 是 冰 的？",
        english: "Okay, hot or iced?",
        breakdown: [
          { word: "好的", pinyin: "hǎo de", english: "okay" },
          { word: "热的", pinyin: "rè de", english: "hot" },
          { word: "还是", pinyin: "hái shì", english: "or" },
          { word: "冰的", pinyin: "bīng de", english: "iced" },
        ],
      },
    },
  },
];

async function runTurn(
  set: (p: Partial<State>) => void,
  get: () => State,
  history: ChatMessage[]
) {
  set({ busy: true, error: null });
  try {
    const { turn, raw } = await chat(history);
    const agentEntry: Entry = { id: crypto.randomUUID(), role: "agent", turn };
    const nextHistory: ChatMessage[] = [...history, { role: "assistant", content: raw }];

    // remember the scenario so we rotate without repeats
    let usedIds = get().usedIds;
    if (turn.mode === "setup" && turn.scenario) {
      if (!usedIds.includes(turn.scenario.id)) {
        usedIds = [...usedIds, turn.scenario.id].slice(-20);
        localStorage.setItem(USED_KEY, JSON.stringify(usedIds));
      }
    }

    set({
      entries: [...get().entries, agentEntry],
      history: nextHistory,
      busy: false,
      holding: Boolean(turn.hold),
      usedIds,
    });
  } catch (e: any) {
    set({ busy: false, error: e.message || "Something went wrong." });
  }
}

// helper exported for components that need the spoken Chinese line of a turn
export function spokenLine(turn: Turn): string | null {
  if (turn.mode === "correction") return turn.correction?.better.hanzi ?? null;
  if (turn.speak) return turn.speak.hanzi;
  return null;
}

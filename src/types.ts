export type Word = { word: string; pinyin: string; english: string };

export type Speak = {
  hanzi: string;
  pinyin: string;
  english: string;
  breakdown: Word[];
};

export type Scenario = {
  id: number;
  emoji: string;
  title_en: string;
  role: string;
  setup_en: string;
};

// The raw scenario-pool shape returned by GET /api/scenarios (server/scenarios.mjs).
// Distinct from Scenario above, which is the shape the model emits in a "setup" turn.
export type ScenePool = {
  id: number;
  emoji: string;
  zh: string;
  en: string;
  role: string;
  personality: string;
};

export type Hint = {
  spaced: string;
  english: string;
  breakdown: Word[];
};

export type VocabFill = { en: string; zh: string; pinyin: string; meaning: string };

export type Correction = {
  yours: { text: string; breakdown: Word[] };
  structure_fix: string;
  vocab_fill: VocabFill[];
  flags: string[];
  better: {
    hanzi: string;
    pinyin: string;
    english: string;
    spaced: string;
    breakdown: Word[];
  };
};

export type Turn = {
  mode: "setup" | "question" | "hint" | "correction" | "meta";
  scenario?: Scenario;
  speak?: Speak;
  hint?: Hint;
  correction?: Correction;
  say_en?: string;
  hold?: boolean;
  advance_note?: string;
};

// A rendered item in the transcript.
export type Entry =
  | { id: string; role: "agent"; turn: Turn }
  | { id: string; role: "user"; text: string };

export type ProviderConfig = {
  provider: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  temperature: number;
  hasKey: boolean;
};

export type Prefs = {
  voice: string;
  rate: string; // edge-tts rate, e.g. "-10%"
  sttModel: string;
  sttLanguage: string; // "auto" | "chinese" | "english"
  autoReveal: boolean; // show pinyin/english without tapping
  autoPlay: boolean; // auto-play TTS on new agent line
};

// The session-start directive (kept in sync with server/prompt.mjs). The full
// system prompt lives server-side; the client only needs to kick off a session.

// How the next session should choose its scene:
//  - random : pick a fresh one from the pool, no repeats (the default)
//  - pool   : use one specific scene the user tapped
//  - custom : the user wrote their own situation + who the tutor should be
export type StartScene =
  | { kind: "random" }
  | { kind: "pool"; id: number }
  | { kind: "custom"; situation: string; persona: string };

export function startDirective(usedIds: number[], scene: StartScene = { kind: "random" }): string {
  if (scene.kind === "custom") {
    const persona = scene.persona.trim() || "a friendly local who fits the setting";
    return [
      "START_SESSION.",
      "Do NOT pick from the scenario pool — the student wrote their own scene.",
      `Setting: ${scene.situation.trim()}.`,
      `You play: ${persona}.`,
      'Adopt that role and personality fully. Return mode "setup" with scenario.id = 0,',
      "a fitting emoji, a short English title_en for the setting, role = who you are,",
      "and setup_en describing the scene in English. Then ask your first question in Hanzi.",
    ].join(" ");
  }
  if (scene.kind === "pool") {
    return `START_SESSION. Use scenario id ${scene.id} from the pool this session (ignore the used list just this once). Adopt its role + personality, set the scene in English, then ask your first question in Hanzi. Return mode "setup".`;
  }
  const used = usedIds && usedIds.length ? usedIds.join(", ") : "none";
  return `START_SESSION. Used scenario ids (do not repeat): ${used}. Pick a fresh scenario, set the scene in English, then ask your first question in Hanzi. Return mode "setup".`;
}

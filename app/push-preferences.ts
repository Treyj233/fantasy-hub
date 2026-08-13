export const PUSH_ALERT_KEYS = [
  "kickoffSoon",
  "slateStarted",
  "bigPlays",
  "matchupResults",
  "closeGame",
  "pathToVictory",
  "weatherRisk",
  "lineupUrgency",
  "injuryStatus",
] as const;

export type PushAlertKey = (typeof PUSH_ALERT_KEYS)[number];
export type PushPreferences = Record<PushAlertKey, boolean>;

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  kickoffSoon: true,
  slateStarted: true,
  bigPlays: true,
  matchupResults: true,
  closeGame: true,
  pathToVictory: true,
  weatherRisk: true,
  lineupUrgency: true,
  injuryStatus: true,
};

export function parsePushPreferences(value: string | null | undefined): PushPreferences {
  let saved: Partial<PushPreferences> = {};
  try { saved = JSON.parse(value ?? "{}") as Partial<PushPreferences>; } catch { /* use defaults */ }
  return Object.fromEntries(PUSH_ALERT_KEYS.map((key) => [key, typeof saved[key] === "boolean" ? saved[key] : DEFAULT_PUSH_PREFERENCES[key]])) as PushPreferences;
}

export function sanitizePushPreferences(value: unknown): PushPreferences | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (PUSH_ALERT_KEYS.some((key) => typeof input[key] !== "boolean")) return null;
  return Object.fromEntries(PUSH_ALERT_KEYS.map((key) => [key, input[key]])) as PushPreferences;
}

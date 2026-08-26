import type { AccountEntitlement } from "./entitlements";

export const premiumTeamThemeIds = new Set(["CROWN", "NEONX", "HERITAGE"]);
export const premiumBadgeThemeIds = new Set(["crown-chrome", "neon-endzone", "heritage-gridiron"]);
export const proTeamThemeIds = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SF","SEA","TB","TEN","WSH"];
export const proBadgeThemeIds = ["arcade", "team", "neon", "minimal", "stadium", "broadcast", "playbook", "varsity", "championship", "gridiron", "neon-sunday", "retro", "glass", "carbon", "helmet", "trading-cards"];

function parsePermanentLibrary(value: string | null | undefined, defaultId: string, premiumIds: Set<string>) {
  try {
    const parsed = JSON.parse(value ?? "[]") as string[];
    return [...new Set([defaultId, ...parsed.filter((id) => premiumIds.has(id))])];
  } catch {
    return [defaultId];
  }
}

export function normalizeThemePreferences<T extends {
  teamTheme: string;
  badgeTheme: string;
  ownedTeamThemesJson: string | null;
  ownedBadgeThemesJson: string | null;
}>(preferences: T, entitlement: AccountEntitlement): T {
  const ownedTeamThemes = parsePermanentLibrary(preferences.ownedTeamThemesJson, "LAC", premiumTeamThemeIds);
  const ownedBadgeThemes = parsePermanentLibrary(preferences.ownedBadgeThemesJson, "arcade", premiumBadgeThemeIds);
  const canUseTeamTheme = ownedTeamThemes.includes(preferences.teamTheme) ||
    (entitlement.pro && proTeamThemeIds.includes(preferences.teamTheme)) ||
    (entitlement.owner && premiumTeamThemeIds.has(preferences.teamTheme));
  const canUseBadgeTheme = ownedBadgeThemes.includes(preferences.badgeTheme) ||
    (entitlement.pro && proBadgeThemeIds.includes(preferences.badgeTheme)) ||
    (entitlement.owner && premiumBadgeThemeIds.has(preferences.badgeTheme));
  return {
    ...preferences,
    teamTheme: canUseTeamTheme ? preferences.teamTheme : "LAC",
    badgeTheme: canUseBadgeTheme ? preferences.badgeTheme : "arcade",
    ownedTeamThemesJson: JSON.stringify(ownedTeamThemes),
    ownedBadgeThemesJson: JSON.stringify(ownedBadgeThemes),
  };
}

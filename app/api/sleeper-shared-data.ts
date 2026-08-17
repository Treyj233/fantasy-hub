import { fetchCachedUpstream } from "./upstream-cache";
import { normalizeSleeperPlayerDirectory, normalizeSleeperStatMap } from "../sleeper-shared-normalizers.mjs";

export type CompactSleeperPlayer = {
  name: string;
  position: string;
  team: string;
};

type Snapshot<T> = { value: T; refreshedAt: string; expiresAt: number };

const playerDirectoryTtlMs = 24 * 60 * 60 * 1000;
const weeklyStatsTtlMs = 30 * 1000;
const weeklyProjectionsTtlMs = 15 * 60 * 1000;

let playerDirectorySnapshot: Snapshot<Map<string, CompactSleeperPlayer>> | null = null;
let playerDirectoryRequest: Promise<Snapshot<Map<string, CompactSleeperPlayer>>> | null = null;
const weeklyStatsSnapshots = new Map<string, Snapshot<Map<string, Record<string, number>>>>();
const weeklyStatsRequests = new Map<string, Promise<Snapshot<Map<string, Record<string, number>>>>>();
const weeklyProjectionSnapshots = new Map<string, Snapshot<Map<string, Record<string, number>>>>();
const weeklyProjectionRequests = new Map<string, Promise<Snapshot<Map<string, Record<string, number>>>>>();

function boundedSet<T>(cache: Map<string, T>, key: string, value: T, maximum = 24) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maximum) cache.delete(cache.keys().next().value as string);
}

async function refreshPlayerDirectory() {
  const response = await fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl?active=true", 86400);
  if (!response.ok) throw new Error("Sleeper player directory unavailable");
  const value = normalizeSleeperPlayerDirectory(await response.json()) as Map<string, CompactSleeperPlayer>;
  if (!value.size) throw new Error("Sleeper player directory was empty");
  return { value, refreshedAt: new Date().toISOString(), expiresAt: Date.now() + playerDirectoryTtlMs };
}

export async function getSleeperPlayerDirectory() {
  if (playerDirectorySnapshot && playerDirectorySnapshot.expiresAt > Date.now()) return playerDirectorySnapshot;
  if (!playerDirectoryRequest) {
    playerDirectoryRequest = refreshPlayerDirectory()
      .then((snapshot) => (playerDirectorySnapshot = snapshot))
      .finally(() => { playerDirectoryRequest = null; });
  }
  try {
    return await playerDirectoryRequest;
  } catch (error) {
    if (playerDirectorySnapshot) return playerDirectorySnapshot;
    throw error;
  }
}

async function getWeeklySnapshot(
  kind: "stats" | "projections",
  season: string,
  week: number,
) {
  const key = `${season}:${week}`;
  const snapshots = kind === "stats" ? weeklyStatsSnapshots : weeklyProjectionSnapshots;
  const requests = kind === "stats" ? weeklyStatsRequests : weeklyProjectionRequests;
  const existing = snapshots.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing;
  const pending = requests.get(key);
  if (pending) return pending;
  const ttlSeconds = kind === "stats" ? 30 : 900;
  const ttlMs = kind === "stats" ? weeklyStatsTtlMs : weeklyProjectionsTtlMs;
  const url = kind === "stats"
    ? `https://api.sleeper.com/stats/nfl/regular/${season}/${week}`
    : `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`;
  const request = (async () => {
    const response = await fetchCachedUpstream(url, ttlSeconds);
    if (!response.ok) throw new Error(`Sleeper weekly ${kind} unavailable`);
    const value = normalizeSleeperStatMap(await response.json()) as Map<string, Record<string, number>>;
    if (!value.size) throw new Error(`Sleeper weekly ${kind} was empty`);
    const snapshot = { value, refreshedAt: new Date().toISOString(), expiresAt: Date.now() + ttlMs };
    boundedSet(snapshots, key, snapshot);
    return snapshot;
  })().finally(() => requests.delete(key));
  requests.set(key, request);
  try {
    return await request;
  } catch (error) {
    if (existing) return existing;
    throw error;
  }
}

export const getSleeperWeeklyStats = (season: string, week: number) =>
  getWeeklySnapshot("stats", season, week);

export const getSleeperWeeklyProjections = (season: string, week: number) =>
  getWeeklySnapshot("projections", season, week);

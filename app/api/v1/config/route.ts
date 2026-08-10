import { API_VERSION, apiJson } from "../_shared/http";

export async function GET() {
  return apiJson(
    {
      apiVersion: API_VERSION,
      minimumClientVersion: "0.1.0",
      supportedPlatforms: ["sleeper", "espn"],
      capabilities: {
        accountDeletion: true,
        universalLinks: false,
        pushNotifications: false,
        liveStreaming: false,
        backgroundSync: false,
      },
      refreshPolicy: {
        liveScoreSeconds: 30,
        leagueSnapshotSeconds: 300,
        playerDirectorySeconds: 86400,
      },
    },
    { cacheControl: "public, max-age=300, stale-while-revalidate=3600" },
  );
}


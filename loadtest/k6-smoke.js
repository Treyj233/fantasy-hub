import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    public_health: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 25 },
        { duration: "60s", target: 100 },
        { duration: "30s", target: 0 },
      ],
    },
    authenticated_game_day: {
      executor: "ramping-vus",
      exec: "gameDay",
      startTime: "2m10s",
      stages: [
        { duration: "1m", target: 25 },
        { duration: "2m", target: 100 },
        { duration: "2m", target: 250 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";

export default function smokePublicApi() {
  const health = http.get(`${baseUrl}/api/v1/health`);
  check(health, { "health responds": (response) => [200, 503].includes(response.status) });
  const config = http.get(`${baseUrl}/api/v1/config`);
  check(config, { "config responds": (response) => response.status === 200 });
  sleep(1);
}

const authCookie = __ENV.AUTH_COOKIE || "";
const leagueIds = (__ENV.LEAGUE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
const week = __ENV.WEEK || "1";

export function gameDay() {
  if (!authCookie || !leagueIds.length) {
    sleep(1);
    return;
  }
  const leagueId = leagueIds[__VU % leagueIds.length];
  const response = http.get(`${baseUrl}/api/scoreboard?leagueId=${leagueId}&week=${week}`, {
    headers: { Cookie: authCookie },
    tags: { endpoint: "scoreboard" },
  });
  check(response, {
    "scoreboard responds": (result) => result.status === 200,
    "scoreboard stays fast": (result) => result.timings.duration < 2000,
  });
  sleep(30);
}

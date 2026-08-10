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
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
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

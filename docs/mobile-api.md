# Fantasy Hub mobile API

All native endpoints live under `/api/v1`. Responses include `X-Fantasy-Hub-API-Version` and `X-Request-Id` headers. Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Public endpoints

- `GET /api/v1/health` — deployment and database health.
- `GET /api/v1/config` — client compatibility, capabilities, providers, and refresh policy.

## Authenticated endpoints

- `GET /api/v1/bootstrap` — account, preferences, platform connection, and saved leagues.
- `GET /api/v1/account` — account identity and deletion capability.
- `DELETE /api/v1/account` with `{ "confirmation": "DELETE" }` — permanently deletes Fantasy Hub account data.

The current web deployment resolves authenticated identity from its trusted hosting headers. Native bearer sessions are intentionally not accepted until Sign in with Apple token verification, token rotation, revocation, and Keychain storage are configured end to end.


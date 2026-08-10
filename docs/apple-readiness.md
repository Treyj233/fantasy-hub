# Fantasy Hub Apple readiness

## Architecture target

Fantasy Hub uses one versioned backend contract for web and native clients. The native client must never call Sleeper, ESPN, weather, projections, or statistics providers directly.

1. Client requests a user bootstrap from `/api/v1/bootstrap`.
2. Fantasy Hub resolves the authenticated account and its saved league connections.
3. Shared ingestion workers refresh provider records once per league, NFL game, player, or scoring period.
4. Clients read normalized cached records and receive live changes through a future streaming channel.
5. User-specific decisions, preferences, and private ESPN snapshots remain isolated by account.

## Delivery phases

### Foundation — implemented

- Versioned `/api/v1` response contract.
- Health endpoint with database verification.
- Mobile bootstrap endpoint.
- API capability/configuration endpoint.
- Structured errors and request IDs.
- Initial edge-local overload guard.
- Complete authenticated account-deletion endpoint.

### Scale foundation — next

- Shared Sleeper league snapshots keyed by provider league ID rather than user ID.
- Request coalescing for simultaneous refreshes.
- Background ingestion jobs and a durable work queue.
- Central distributed rate limiting.
- Live score fan-out using server-sent events or WebSockets.
- Provider circuit breakers and explicit stale-data responses.

### Native identity — requires Apple configuration

- Apple Developer team and bundle identifier.
- Sign in with Apple service identifier, key, and callback configuration.
- Server-side Apple identity-token verification and refresh-token revocation.
- Short-lived API access tokens and rotating refresh tokens stored in Keychain.
- Account linking between existing web users and Apple identities.

### Native client

- React Native/Expo app with native navigation, Dynamic Type, VoiceOver, Keychain, universal links, push notifications, background refresh, crash reporting, and analytics consent.
- First native surfaces: All Leagues, Fantasy Scoreboard, Matchups, My Team, Start/Sit, Waivers, and Trade Lab.
- Complex analytics can temporarily use authenticated responsive web routes, but the submitted app must provide substantial native utility.

### Store submission

- Privacy policy, terms, support URL, data-retention policy, and provider-license records.
- App Privacy responses and third-party SDK privacy manifests.
- In-app account deletion and subscription management.
- TestFlight beta, review account, screenshots, age rating, accessibility review, and App Review notes.

## Production launch gates

- Load tests at 100, 500, 1,000, and 5,000 concurrent Sunday users.
- P95 cached API response below 300 ms and P95 app bootstrap below 2 seconds.
- Shared live-data cache hit rate above 95%.
- No provider receives more than one equivalent refresh per cache window.
- Provider outage returns timestamped stale data rather than a blank experience.
- Alerting covers error rate, latency, queue depth, upstream failures, database health, and cost per active user.

## External blockers

Engineering cannot complete these without owner accounts or agreements: Apple Developer enrollment, App Store Connect access, push certificates, subscription products, a production authentication provider, and written permission for commercial use of provider data, logos, headshots, ADP, projections, and statistics.


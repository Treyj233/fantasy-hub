# Vegas Edge owner preview

Elite feature, owner-only navigation, rendering and API authorization. Do not remove the owner gate without an explicit rollout request.

## Connection

Store `SPORTSGAMEODDS_API_KEY` as a **secret server environment variable** in Sites. Never use a NEXT_PUBLIC variable or paste the key into source control. For local validation only, add it to the existing ignored `.dev.vars` file. Apply the generated `0019` migration through the normal Sites publish workflow.

No provider calls occur without the key. The page shows the real connected roster and honest missing-data states. Refresh the connected league to obtain scoringRules on older cached snapshots (payload version 25).

## Activation checks requiring the key

- Verify actual free-plan NFL prop coverage, team abbreviations and player names, paired main markets, provider timestamps, and usage response.
- Confirm commercial/derived-data use is permitted by the plan before customer release.
- Verify a known roster in both Sleeper and ESPN scoring, including half PPR and TE premium.
- Check account usage before and after a refresh. No automatic pagination is enabled: NFL discovery is bounded to 32 games over seven days; a nextCursor warning requires review.
- Owner preview refreshes on page open or manual Check markets. No unattended scheduler has been deployed. Attach a secured scheduler only after validating the key and feed; reuse the same shared sync service rather than fetching per user.

## Safety and calculations

## App-wide projection switch

Owner/Elite users can toggle Vegas Implied Projections from Vegas Edge. The preference is account-scoped **on this device**, not an account-wide server setting. It overlays current-week projections on raw platform data without rewriting provider snapshots. Turning it off restores the platform numbers. The Vegas comparison page always receives untouched platform baselines to prevent compounding the blend.

The shared adapter covers the active roster, league rosters, rankings, waivers, Mission Hub totals/actions, scoreboards, matchup views, player popouts, and Game Day impact projections. Scoreboards use each league's own scoring rules; other seasons/weeks and uncovered players fall back explicitly. Existing future-season/draft models and actual points are not replaced with a current-week prop estimate. Headers identify Vegas Implied Projections and the app-wide notice explains fallback coverage. Floor/ceiling ranges retain their platform ratios around the adjusted estimate; they are not sportsbook-derived confidence intervals.

While enabled, a visibility-aware shared consumer checks the cached feed every ten minutes without initiating paid market refreshes. The last fresh pregame estimate can be retained after kickoff; actual points and game progress remain untouched. No unattended provider scheduler is enabled by this switch.

Tests: `node --test tests/projection-source.test.mjs tests/vegas-edge.test.mjs`.

Persisted shared NFL snapshot with a database lease prevents overlapping syncs. Check provider account-wide monthly usage before each due event request. Stop at 2,000 objects (or lower provider allowance minus reserve), fail closed on unknown usage, enforce ten-minute minimum between attempts, and preserve cached lines on errors. Early events refresh at 12 hours; final day 2 hours; final 2 hours 10 minutes. Locked events do not refresh. Freshness and kickoff are also checked when rendering recommendations.

Only full-game, available main markets are normalized. Over/unders require paired bookmaker prices. Anytime TD markets may use an explicit available provider-fair Yes/No consensus pair when sportsbooks offer only Yes; raw one-sided book prices are never treated as fair probabilities. Identity matching requires normalized full name (or provider-supplied first/last-name alias) and matching team; ambiguity fails closed. Current-week schedule/date matching prevents next-week props being applied to this week's baseline. Quarter/alternate/unavailable markets are not used.

Projections are explicitly an experimental 60% prop-derived / 40% baseline blend. The baseline is not replaced anywhere else in the app. Lines are median-based approximations, not expected means; 0.5 touchdown props use vig-removed probability and a Poisson expected-count approximation. Missing core markets produce no blend/delta. QB requires passing yards/TD/INT; skill positions require receiving yards/receptions/TD and RB also rushing yards. Secondary stats and bonuses are not fully modeled. Unavailable, locked, stale and unknown-scoring players do not generate projections; questionable players do not generate suggestions. Waiver targets are individual alternatives, not drop recommendations or automatic transactions.

## Verification

`node --test tests/vegas-edge.test.mjs`

`npm run build`

2026-09-13: API key verified active on Amateur with a 2,500-object allowance, and stored as a Sites server secret (pending deployment). Three one-event requests validated Jets–Titans markets, game lines, player identity aliases, receiving_receptions and anytime TD provider-fair consensus. The sample included 929 odds entries and normalized props for 27 players; this does not imply complete projection coverage for all 27. No live customer release or unattended scheduler was enabled. Real-device review and full-slate checks remain activation steps.

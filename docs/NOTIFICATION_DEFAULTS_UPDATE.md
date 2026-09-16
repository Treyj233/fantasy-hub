# Notification defaults and delivery fixes

Implementation prepared September 16, 2026; not deployed by this change.

- The native app requests iOS notification permission after authenticated league setup/onboarding. Granted devices register automatically once per signed-in session. All nine category defaults remain on; saved category opt-outs are preserved.
- OS denial and the locally saved device opt-out are respected. Device status and disabling are token-scoped, not account-wide. Registration failures and timeouts surface errors and clean up listeners.
- The evaluator supports Sleeper and public ESPN. Private ESPN requires an extension snapshot no older than two minutes; stale snapshots are skipped.
- Current week follows the shared Tuesday rollover calendar. Kickoff does not depend on play-by-play. Final results require the whole weekly slate to finish; ties are identified and scores remain subject to stat corrections.
- Weather-risk and unavailable-starter/lineup alerts run near kickoff. Weather requires available forecast data. Scoring increases use generic wording, week/season-specific baselines, and no fabricated play descriptions. Scoring-gap alerts are limited to once per hour and require remaining starters.

Verification: production build passes; 12 notification-focused tests pass. The broader suite and project-wide typecheck are not clean (including missing Cloudflare runtime declarations and unrelated application assertions). No production notification or broadcast was sent. APNs credentials, deployed cron operation, and real-device receipt still require end-to-end verification after publishing.

No database migration or bulk reset of user preferences is required.

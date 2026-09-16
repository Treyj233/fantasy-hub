# iOS 1.02 (46): reviews, launch branding, and usage analytics

## Included
- Existing canonical FH PNG in native LaunchScreen and bundled opening screen; navy WKWebView background prevents the pale intermediate flash.
- Apple StoreKit review bridge. After 60 uninterrupted foreground seconds on a useful screen, requests are eligible only after 7 days, 3 launches, 120 days since the prior request, and once per marketing version. No sentiment screening. Apple decides whether to display; a request is not evidence of a rating.
- Account settings: explicit Write a review link.
- Page views, ranking subsection, foreground engagement seconds, app version/build, iPhone/iPad context.
- Purchase funnel by product/tier/option; verified transaction confirmation with actual optional StoreKit price/currency and sandbox/production distinction; manual restoration tracked separately.
- Native purchase confirmations deduplicate per transaction on the installation. Restores and routine entitlement checks do not create purchase confirmations.
- Updated privacy manifest: analytics purposes and app-local UserDefaults reason. Privacy policy describes new events.

## AppsFlyer events
| Event | Trigger / purpose |
| --- | --- |
| af_screen_view | Navigation to each main screen, plus weekly/season ranking subsection |
| fh_screen_engagement | Foreground seconds when leaving/backgrounding a screen |
| fh_store_view | Membership or theme store view |
| af_initiated_checkout | User begins a native purchase |
| fh_purchase_active / pending / cancelled / inactive / failed | Purchase-flow outcome, not a revenue event |
| fh_purchase_verified | Server accepted transaction and native StoreKit verification; product, order ID, actual price/currency when available |
| fh_restore_started / completed / failed | Explicit restore action only |
| fh_review_requested | Native review API invoked, not sheet display or rating submission |
| fh_review_store_opened | User opened Write a review |

No raw errors, email addresses, league/team names, player rosters, or receipts are included. The existing strict AppsFlyer SDK is retained. No IDFA/ATT or partner-postback configuration is added.

`fh_purchase_verified` uses `af_price`, not `af_revenue`, to avoid counting the same revenue again if ROI360/server reporting is configured. This build does not add automatic renewal/refund revenue reporting. Confirm the AppsFlyer revenue configuration before enabling a separate revenue stream. Automatic pending-purchase resolution can restore access without a new verified-confirmation event.

## Release requirements
- September 16: Xcode license accepted; Release archive and App Store Connect export succeeded for version 1.02 (46). Archive signature verification passed. IPA: `build/FantasyHub-Build46-Export/App.ipa`; archive: `build/FantasyHub-Build46.xcarchive`.
- Native archive must compile/sign before claiming the build is ready.
- Remote app changes in FantasyHub.tsx/native-runtime.ts/native-screen-analytics.ts/privacy must be published before the installed build can use all new capabilities. The iOS shell loads the live site; copying local shell assets does not publish that web code.
- Update App Store Connect App Privacy answers to match analytics purposes; do not change audience or publish to App Store automatically.
- Physical iPhone/iPad tests: cold launch, foreground/background time, checkout cancel/pending/success, restore without duplicate confirmation, and StoreKit review bridge. Apple does not display automatic review prompts in TestFlight.
- No upload or App Review submission has been authorized by this task.

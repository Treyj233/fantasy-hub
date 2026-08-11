# Fantasy Hub iOS launch checklist

## Identity

- Bundle ID: `com.fantasyhubapp.ios`
- App name: Fantasy Hub
- Website: `https://fantasyhubapp.com`
- Custom URL scheme: `fantasyhub://`
- Minimum iOS version: 15.0

## App Store Connect setup still required

1. Create the app record using the bundle ID above.
2. Add Sign in with Apple to the App ID and configure the Apple provider in Clerk.
3. Create one subscription group named `Fantasy Hub Pro`.
4. Create subscription products for monthly, six-month season, and annual access. Product IDs should be:
   - `com.fantasyhubapp.pro.monthly`
   - `com.fantasyhubapp.pro.season`
   - `com.fantasyhubapp.pro.annual`
5. Add the In-App Purchase capability in Xcode after the Apple team is selected.
6. Create an App Store Connect API key for server-side transaction verification. Store its issuer ID, key ID, and private key only in server environment variables.
7. Complete the App Privacy questionnaire, age rating, support URL, privacy-policy URL, screenshots, description, and review notes.

## Local commands

```bash
npm run ios:sync
npm run ios:build:sim
npm run ios:open
```

After an Apple team and valid signing certificates are installed:

```bash
npm run ios:archive
```

The archive is written to `build/FantasyHub.xcarchive` and can then be validated and uploaded from Xcode Organizer.

## Current verification status

- Xcode 26.6 and an iOS 26.5 simulator runtime are installed.
- The app builds successfully for the iPhone 17 Pro simulator.
- The production site loads inside the native web view without handing off to Safari.
- Native app icon, launch screen, safe areas, offline handling, privacy manifest, lifecycle hooks, and custom URL scheme are configured.
- This Mac currently has no valid Apple code-signing identity. Open Xcode → Settings → Accounts, add the Apple Developer account, select the Fantasy Hub team under Signing & Capabilities, and let Xcode create/download the development and distribution certificates before archiving.

## Release blockers

1. Install/select the Apple Developer signing team and register `com.fantasyhubapp.ios`.
2. Enable Sign in with Apple in the App ID and Clerk, then test the complete native sign-in flow.
3. Create the three App Store subscription products and connect StoreKit purchase, restore, and server-side entitlement verification.
4. Configure APNs and test notifications on a physical device if launch notifications are desired.
5. Archive, upload to TestFlight, complete App Store metadata, and run external beta review.

The current native shell loads the production application so authentication and saved league data remain unified with the web product. Before App Store submission, native StoreKit purchasing and Restore Purchases must replace the disabled Stripe purchase controls in the iOS shell.

Account deletion already exists under Manage Leagues → Account & Privacy and removes saved league data, preferences, decisions, narratives, and subscription records after safely canceling Stripe billing where applicable.

## StoreKit server environment

Configure these secrets in the production Cloudflare environment before testing purchases:

- `APPLE_APP_STORE_ISSUER_ID`
- `APPLE_APP_STORE_KEY_ID`
- `APPLE_APP_STORE_PRIVATE_KEY` — the complete `.p8` key, with line breaks preserved or encoded as `\\n`
- `APPLE_APP_STORE_BUNDLE_ID=com.fantasyhubapp.ios`

Create the key in App Store Connect under **Users and Access → Integrations → In-App Purchase**. The server verifies each transaction directly against Apple in production first and sandbox second. A verified original transaction can belong to only one Fantasy Hub account.

## Push notifications

The native app now includes:

- production and development `aps-environment` build settings (Xcode development archives are re-signed for production during App Store export);
- APNs registration callbacks through Capacitor;
- a contextual notification opt-in under Manage Leagues;
- authenticated per-device token storage and removal;
- account deletion cleanup for every registered device token;
- background remote-notification delivery support.

To send production notifications, create an APNs signing key in the Apple Developer portal and configure the delivery service with the key ID, team ID, `.p8` private key, and topic `com.fantasyhubapp.ios`. Notification permission must always be initiated by the user from the in-app control.

Cloudflare secrets for APNs delivery:

- `APPLE_APNS_KEY_ID`
- `APPLE_APNS_TEAM_ID=PSFU9Q2JRK`
- `APPLE_APNS_PRIVATE_KEY`
- `APPLE_APNS_TOPIC=com.fantasyhubapp.ios`
- `APPLE_APNS_ENVIRONMENT=production` (`sandbox` for local device-development testing)

After a user enables notifications, `POST /api/account/push/test` sends a private connection test only to that authenticated user’s enabled devices. Product alert jobs can call the same `sendApplePush` helper for lineup, injury, waiver, and game-day events.

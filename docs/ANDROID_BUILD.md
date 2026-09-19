# Android build — initial project

Created September 18, 2026. This is a development scaffold, not a tested or Play-ready release.

## Identity and isolation

- Android application ID: `com.fantasyhubapp.android` (confirm before Play registration).
- Initial version: 1.0, build 1.
- Capacitor Android: 8.5.0, matching the installed core.
- Android scripts set `FANTASY_HUB_NATIVE_PLATFORM=android`; default Capacitor configuration remains iOS. Use the npm Android scripts, not bare `cap sync android`.
- Existing `native-shell` opens the live `/native-app` route. It still has the existing iOS build query; separate platform/build versioning is a follow-up before distribution.
- No web deployment or iOS sync was performed.

## Build

Installed on this Mac: Android Studio Quail 4 Patch 1 (Apple Silicon), Temurin Java 21, Android SDK platform 36, Build Tools 35.0.0, platform tools, emulator, and Android 36 Google APIs ARM64 system image. Downloads were checksum-verified against Google/Adoptium metadata.

SDK: `/Users/jordan/Library/Android/sdk`. Java 21 is in the user Library's JavaVirtualMachines directory. The build script automatically discovers Java 21 and the standard macOS SDK path; explicit `JAVA_HOME` / `ANDROID_HOME` overrides are supported. Android Studio bundles Java 25, so select **Java 21** as the Gradle JDK when building from its UI.

Virtual phone: `Fantasy_Hub_Pixel` (Pixel 7 profile). Emulator boot and hardware acceleration have been verified. No physical Android device is required for emulator tests.

```sh
npm run android:open
npm run android:doctor
npm run android:build:debug
```

Expected APK after a successful build: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Verified so far

- Android platform generation and sync succeeded.
- Five standard Capacitor plugins were discovered.
- Debug compilation succeeded: 245 tasks, initial build approximately one minute.
- Debug APK produced at the path above; not a signed Play release artifact.
- Emulator boot completed successfully. APK installation succeeded; cold launch returned `Status: ok` in approximately 1.1 seconds, app process remained running, and crash buffer was empty. This is a launch smoke test only; full functional and visual testing remains pending.

## Required before testers / Google Play

- Replace template launcher and native splash assets with Fantasy Hub branding.
- Verify Android sign-in, redirects, session persistence and sign-out. Existing native auth integration is iOS-specific.
- Implement Android back navigation, app links, keyboard and system-bar/safe-area behavior; test phone and tablet emulator sizes.
- Configure Firebase and Android push registration/backend delivery; syncing the plugin alone does not enable notifications.
- Integrate Google Play Billing and server entitlement verification. Current Apple StoreKit integration cannot be used on Android; audit all purchase entry points before distribution.
- Add Android analytics/AppsFlyer and review prompt integrations. Existing custom native bridges are iOS-only.
- Test league sync/switching, live scores, Vegas Edge, overlays, offline/reconnect, and themes.
- Configure protected release signing, generate an AAB, complete Play listing/data safety requirements, and use internal testing before production.

Do not upload this initial scaffold to production or represent its native integrations as complete.

## Native Google sign-in (implemented; end-to-end verification pending)

Android uses Credential Manager's Google button flow, passing the resulting ID token to Clerk for verification. Native Apple sign-in remains iOS-only. Email sign-in and account creation retain the correct Android native handoff. Cancellation leaves the email form available.

The public Google Web client ID was obtained from Clerk's `/v1/environment` configuration and is set in `android/gradle.properties`. No Google client secret is stored in the app.

Google Cloud must also have an **Android OAuth client** in the same project, registered with:

- Package: `com.fantasyhubapp.android`
- Debug certificate SHA-1: `E0:11:07:BC:07:3A:A0:3A:F4:09:78:AA:4E:81:2A:4F:44:FE:6E:0C`
- For Google Play: register the Play App Signing certificate as well (not this debug certificate).

This registration has not been verified or modified. A Google-account sign-in has not been completed in the emulator. The updated APK alone does not replace the remotely hosted login UI; web changes must be published before the Android Google button appears in the app.

Verification: native Android compilation and web production build pass; seven targeted source-regression tests pass. Repository-wide TypeScript checking still reports errors in existing unrelated files, including the legacy native-auth-ticket route.

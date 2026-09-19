import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('native login renders Apple exclusively on iOS and Google on Android', async () => {
  const source = await read('app/native-sign-in/page.tsx');
  assert.match(source, /platform === "ios" \? <NativeAppleSignIn \/> : platform === "android" \? <NativeGoogleSignIn \/> : null/);
  assert.match(source, /<NativeEmailSignIn platform=/);
});

test('Android token is verified through Clerk before native session handoff', async () => {
  const source = await read('app/native-google-sign-in.tsx');
  assert.match(source, /if \(credential.cancelled\) return/);
  assert.match(source, /authenticateWithGoogleOneTap\(\{ token: credential.token \}\)/);
  assert.match(source, /result.status !== "complete" \|\| !result.createdSessionId/);
  assert.match(source, /setActive\(\{ session: result.createdSessionId \}\)/);
  assert.match(source, /window.location.replace\("\/native-auth-return"\)/);
  assert.doesNotMatch(source, /atob\(|console\.log/);
});

test('Android account creation preserves platform and suppresses web social redirects', async () => {
  const source = await read('app/sign-up/[[...sign-up]]/page.tsx');
  assert.match(source, /nativeIos \|\| params.native === "android"/);
  assert.match(source, /appearance=\{nativeApp \? nativeEmailOnlyClerkAppearance/);
  const email = await read('app/native-email-sign-in.tsx');
  assert.match(email, /sign-up\?native=\$\{platform\}/);
});

test('native Google bridge validates origin and handles cancellation without logging tokens', async () => {
  const source = await read('android/app/src/main/java/com/fantasyhubapp/android/FantasyHubGoogleAuth.java');
  assert.match(source, /"https".equals\(origin.getScheme\(\)\)/);
  assert.match(source, /"fantasyhubapp.com".equals\(origin.getHost\(\)\)/);
  assert.match(source, /GetCredentialCancellationException/);
  assert.match(source, /GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals\(type\)/);
  assert.doesNotMatch(source, /Log\.|System.out/);
});

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, FANTASY_HUB_NATIVE_PLATFORM: 'android' };
if (!env.JAVA_HOME && process.platform === 'darwin') {
  env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' }).trim();
}
if (!env.ANDROID_HOME && process.platform === 'darwin') {
  env.ANDROID_HOME = join(homedir(), 'Library/Android/sdk');
}
if (!env.ANDROID_HOME || !existsSync(env.ANDROID_HOME)) {
  throw new Error('Install the Android SDK and set ANDROID_HOME before building.');
}
for (const [command, args, cwd] of [
  [process.execPath, [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'], root],
  [process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], resolve(root, 'android')],
]) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

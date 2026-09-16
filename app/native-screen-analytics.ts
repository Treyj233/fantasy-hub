import { isNativeIosApp, nativeLogAppsFlyerEvent, nativeRequestReview } from './native-runtime';

// Track only screen identifiers and foreground time, never roster/account content.
export function trackNativeScreen(title: string, section = '') {
  if (!isNativeIosApp()) return () => {};
  const values = { screen_name: title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), screen_title: title, section };
  let since: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const eligible = ['Team Review', 'Start / Sit', 'My Team', 'All Leagues'].includes(title);
  const pause = () => {
    clearTimeout(timer);
    if (since !== null) {
      const seconds = Math.floor((performance.now() - since) / 1000);
      if (seconds > 0) void nativeLogAppsFlyerEvent('fh_screen_engagement', { ...values, foreground_seconds: seconds });
      since = null;
    }
  };
  const resume = () => {
    if (document.visibilityState !== 'visible' || document.documentElement.dataset.appState === 'background' || since !== null) return;
    since = performance.now();
    if (eligible) timer = setTimeout(() => {
      if (!document.querySelector('dialog[open], [aria-modal="true"]')) void nativeRequestReview();
    }, 60_000);
  };
  const change = () => { pause(); resume(); };
  void nativeLogAppsFlyerEvent('af_screen_view', values);
  if (title === 'Manage Plans' || title === 'Theme Locker') void nativeLogAppsFlyerEvent('fh_store_view', values);
  document.addEventListener('visibilitychange', change);
  window.addEventListener('fantasyhub:native-state', change);
  window.addEventListener('pagehide', pause);
  resume();
  return () => {
    pause();
    document.removeEventListener('visibilitychange', change);
    window.removeEventListener('fantasyhub:native-state', change);
    window.removeEventListener('pagehide', pause);
  };
}

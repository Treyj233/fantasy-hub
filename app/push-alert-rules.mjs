export function notificationGameState(game, now = Date.now()) {
  if (game.state === 'post' || /final|completed/i.test(game.status ?? '')) return 'post';
  if (/postponed|cancelled|canceled|suspended/i.test(game.status ?? '')) return 'pre';
  const start = Date.parse(game.date);
  if (game.state === 'in' || (Number.isFinite(start) && start <= now && now - start < 8 * 3600000)) return 'in';
  return 'pre';
}

export function unavailableStarter(status = '') {
  return /^(out|ir|injured reserve|doubtful|suspended|sus|dnr|inactive|pup)$/i.test(status.trim());
}

export function dangerousFantasyWeather(forecast) {
  if (!forecast || forecast.indoor) return false;
  return Number(forecast.windMph ?? 0) >= 20 || Number(forecast.windGustMph ?? 0) >= 30 ||
    /heavy rain|heavy snow|blizzard|thunderstorm/i.test(forecast.condition ?? '');
}

export function matchupFinished(weekGames, now = Date.now()) {
  // Require the whole slate, not just today's games: future starters can change.
  return weekGames.length > 0 && weekGames.every(game => notificationGameState(game, now) === 'post');
}

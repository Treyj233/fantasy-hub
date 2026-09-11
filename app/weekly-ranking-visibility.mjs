export function hideFinishedWeeklyGame(game, now = new Date()) {
  if (!game || !/^(final|completed|post)$/i.test(game.status ?? '')) return false;
  const date = new Date(game.date);
  if (!Number.isFinite(date.getTime())) return false;
  const cutoff = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return now >= cutoff;
}

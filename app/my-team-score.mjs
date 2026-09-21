export function myTeamScore(projection, live) {
  const player = live?.player;
  const final = player?.gameProgress >= 1 || live?.status?.toLowerCase() === "final";
  const started = final || player?.gameProgress > 0 || (Number.isFinite(player?.points) && player.points !== 0);
  return started
    ? { label: final ? "FINAL" : "LIVE", value: Number.isFinite(player?.points) ? player.points : null }
    : { label: "PROJ", value: Number.isFinite(projection) ? projection : null };
}

export function playerPanelScore(projection, live, game, locked = false, now = Date.now()) {
  const final = /final|finished/i.test(game?.status ?? '') || game?.state === 'post';
  const started = final || locked || Boolean(game && Date.parse(game.date) <= now && !/postpon|cancel|delay|suspend/i.test(game.status ?? ''));
  if (!started) return myTeamScore(projection, live);
  return myTeamScore(projection, {
    player: { ...live?.player, gameProgress: final ? 1 : Math.max(0.0001, live?.player?.gameProgress ?? 0) },
    status: final ? 'Final' : live?.status ?? 'Live',
  });
}

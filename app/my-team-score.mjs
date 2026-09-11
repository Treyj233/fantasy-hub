export function myTeamScore(projection, live) {
  const player = live?.player;
  const final = player?.gameProgress >= 1 || live?.status?.toLowerCase() === "final";
  const started = final || player?.gameProgress > 0 || (Number.isFinite(player?.points) && player.points !== 0);
  return started
    ? { label: final ? "FINAL" : "LIVE", value: Number.isFinite(player?.points) ? player.points : null }
    : { label: "PROJ", value: Number.isFinite(projection) ? projection : null };
}

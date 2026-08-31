export function teamPositionStrength(values: number[], starterCount: number) {
  const ordered = [...values].sort((a, b) => b - a);
  const requiredStarters = Math.max(1, starterCount);
  const starters = ordered.slice(0, requiredStarters);
  const starterScore = starters.reduce((sum, value) => sum + value, 0) / requiredStarters;

  if (requiredStarters === 1) {
    const platoonValue = ordered[1] ?? 0;
    return Number((starterScore * .92 + platoonValue * .08).toFixed(1));
  }

  const depth = ordered.slice(requiredStarters, requiredStarters + 2);
  const depthScore = depth.reduce((sum, value) => sum + value, 0) / Math.max(1, depth.length);
  return Number((starterScore * .82 + depthScore * .18).toFixed(1));
}

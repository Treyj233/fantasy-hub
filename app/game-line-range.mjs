const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Conservative scenario heuristics, not calibrated probability intervals.
// Positive favoredBy means this player's team is favored (not sportsbook spread).
export function gameLineRange(range, projection, position, lines) {
  if (!lines || !['QB', 'RB', 'FB', 'WR', 'TE'].includes(position)) return range;
  const environment = Number.isFinite(lines.total) ? clamp((lines.total - 44) / 100, -.08, .10) : 0;
  const script = Number.isFinite(lines.favoredBy) ? clamp(lines.favoredBy / 100, -.07, .07) : 0;
  const rushing = position === 'RB' || position === 'FB';
  const ceilingShift = clamp(environment + script * (rushing ? .7 : -.5), -.12, .15);
  // Underdog passing volume can lift upside, but does not guarantee efficiency.
  const floorShift = clamp(environment * .3 + (rushing ? script * .5 : -Math.max(0, script) * .25), -.06, .06);
  return { ...range,
    floor: Number(clamp(range.floor * (1 + floorShift), 0, projection).toFixed(1)),
    ceiling: Number(Math.max(projection, range.ceiling * (1 + ceilingShift)).toFixed(1)),
  };
}

export function gameLineSummary(lines, away, home) {
  if (!lines) return '';
  const price = value => value > 0 ? `+${value}` : String(value);
  return [
    Number.isFinite(lines.total) ? `O/U ${lines.total}` : null,
    Number.isFinite(lines.homeFavoredBy) ? lines.homeFavoredBy === 0 ? 'Pick’em' : `${lines.homeFavoredBy > 0 ? home : away} -${Math.abs(lines.homeFavoredBy)}` : null,
    Number.isFinite(lines.awayMoneyline) ? `${away} ML ${price(lines.awayMoneyline)}` : null,
    Number.isFinite(lines.homeMoneyline) ? `${home} ML ${price(lines.homeMoneyline)}` : null,
  ].filter(Boolean).join(' · ');
}

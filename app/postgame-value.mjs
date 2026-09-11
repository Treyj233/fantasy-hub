// A single final can move forward-looking value without replacing the season baseline.
export function postgameValueAdjustment(actual, projected, completed) {
  if (!completed || !Number.isFinite(actual) || !Number.isFinite(projected) || projected <= 0) return 0;
  return Math.round(Math.max(-8, Math.min(8, (actual - projected) / Math.max(8, projected) * 8)) * 100) / 100;
}

export function injuryTradePenalty(status, format) {
  const normalized = String(status ?? '').trim().toUpperCase();
  const penalty = ({ Q: 2, QUESTIONABLE: 2, D: 5, DOUBTFUL: 5, O: 8, OUT: 8, IR: 16, PUP: 12, NFI: 12, SUSPENDED: 12, SUS: 12 })[normalized] ?? 0;
  return penalty * (format === 'Dynasty' ? .3 : format === 'Keeper' ? .65 : 1);
}

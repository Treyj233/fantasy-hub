export function formatTeamRecord(record) {
  if (!record || !Number.isInteger(record.wins) || !Number.isInteger(record.losses) || record.wins < 0 || record.losses < 0) return null;
  const ties = Number.isInteger(record.ties) && record.ties > 0 ? `–${record.ties}` : '';
  return `${record.wins}–${record.losses}${ties}`;
}

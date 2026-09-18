// Input contains only enabled, undelivered alerts. Retain their individual keys.
export function consolidateAlerts(alerts) {
  const groups = new Map();
  for (const alert of alerts) {
    const group = groups.get(alert.category) ?? [];
    if (!group.some(item => item.key === alert.key)) group.push(alert);
    groups.set(alert.category, group);
  }
  return [...groups.values()].map(group => {
    const first = group[0];
    const leagues = [...new Set(group.map(item => item.leagueName).filter(Boolean))];
    const body = [...new Set(group.map(item => item.body))].join(' ');
    return {
      ...first, sourceKeys: group.map(item => item.key), urgent: group.some(item => item.urgent),
      title: group.length === 1 ? first.title : `${({KICKOFF_SOON:'Kickoff soon',SLATE_STARTED:'Your NFL window is live',WEATHER_RISK:'Weather watch',INJURY_STATUS:'Starter availability',LINEUP_URGENCY:'Check your lineups',BIG_PLAY:'Scoring updates',CLOSE_GAME:'Close matchups',PATH_TO_VICTORY:'Live scoring gaps',MATCHUP_RESULT:'Matchup results'})[first.category] ?? 'Fantasy Hub updates'} · ${leagues.length} ${leagues.length === 1 ? 'league' : 'leagues'}`,
      body: body.length <= 600 ? body : `${body.slice(0, 540).replace(/\s+\S*$/, '')}… Open Fantasy Hub for all ${group.length} updates.`,
    };
  });
}

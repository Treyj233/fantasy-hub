type NewsPlayer = {
  id?: string;
  relationship?: string;
};

type NewsItem = {
  headline?: string;
  summary?: string;
  whyItMatters?: string;
  impact?: string;
  relatedPlayers?: NewsPlayer[];
};

const seasonEndingPattern = /\b(?:season[- ]ending|out for (?:the )?(?:season|year)|will miss (?:the )?(?:entire )?(?:season|year)|done for (?:the )?(?:season|year))\b/i;

export function seasonEndingPlayerIds(items: NewsItem[]) {
  const playerIds = new Set<string>();
  for (const item of items) {
    const story = [item.headline, item.summary, item.whyItMatters, item.impact]
      .filter(Boolean)
      .join(" ");
    if (!seasonEndingPattern.test(story)) continue;
    for (const player of item.relatedPlayers ?? []) {
      if (player.id && (!player.relationship || player.relationship === "subject"))
        playerIds.add(player.id);
    }
  }
  return playerIds;
}

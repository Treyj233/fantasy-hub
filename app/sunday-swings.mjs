// A polling delta can cover multiple plays; never label it as one confirmed play.
export function sundaySwingsFromGroups(groups) {
  return [...groups].flatMap(events => {
    const qualifying = events.filter(event => Number.isFinite(event.delta) && event.delta > 6);
    if (!qualifying.length) return [];
    const update = qualifying.reduce((best, event) => event.delta > best.delta ? event : best);
    return [{
      id: update.dedupeKey,
      text: update.confirmedPlay || `Scoring update · ${update.description}`,
      delta: update.delta,
      at: update.at,
    }];
  });
}

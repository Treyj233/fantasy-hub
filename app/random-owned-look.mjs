// Select only from the caller's entitled library. Avoid repeating the active
// combination when another owned combination is available.
export function randomOwnedLook(themes, badges, currentTheme, currentBadge, random = Math.random) {
  const combinations = themes.flatMap(theme => badges.map(badge => ({ theme, badge })));
  const alternatives = combinations.filter(({ theme, badge }) => theme.id !== currentTheme || badge.id !== currentBadge);
  const choices = alternatives.length ? alternatives : combinations;
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}

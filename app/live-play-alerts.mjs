const counterDelta = (current, previous, key) =>
  Math.max(0, Number(current?.[key] ?? 0) - Number(previous?.[key] ?? 0));

export function classifyFantasyPlay(previous, current) {
  const fantasyPoints = Number((Number(current?.points ?? 0) - Number(previous?.points ?? 0)).toFixed(2));
  const defensiveTurnovers = counterDelta(current, previous, "defensiveTurnovers");
  const offensiveTurnovers = counterDelta(current, previous, "offensiveTurnovers");
  const returnTouchdowns = counterDelta(current, previous, "returnTouchdowns");
  const fieldGoals = counterDelta(current, previous, "fieldGoals");
  const touchdownDelta = counterDelta(current, previous, "touchdowns");
  const receptionDelta = counterDelta(current, previous, "receptions");
  const yardDelta = counterDelta(current, previous, "yards");

  const confirmation = { fantasyPoints, defensiveTurnovers, offensiveTurnovers, returnTouchdowns, fieldGoals, touchdownDelta, receptionDelta, yardDelta };
  if (defensiveTurnovers > 0)
    return { ...confirmation, qualifies: true, kind: "turnover", description: defensiveTurnovers > 1 ? `${defensiveTurnovers} takeaways` : "a defensive takeaway" };
  if (offensiveTurnovers > 0)
    return { ...confirmation, qualifies: true, kind: "turnover", description: offensiveTurnovers > 1 ? `${offensiveTurnovers} turnovers` : "a turnover" };
  if (fantasyPoints < 3) return { ...confirmation, qualifies: false, kind: "routine", description: "" };
  if (returnTouchdowns > 0)
    return { ...confirmation, qualifies: true, kind: "special-teams", description: returnTouchdowns > 1 ? `${returnTouchdowns} return touchdowns` : "a return touchdown" };
  if (fieldGoals > 0)
    return { ...confirmation, qualifies: true, kind: "special-teams", description: fieldGoals > 1 ? `${fieldGoals} field goals` : "a field goal" };
  if (touchdownDelta > 0)
    return { ...confirmation, qualifies: true, kind: "offense", description: touchdownDelta > 1 ? `${touchdownDelta} touchdowns` : "a touchdown" };
  if (receptionDelta > 0 && yardDelta > 0)
    return { ...confirmation, qualifies: true, kind: "offense", description: `${receptionDelta > 1 ? `${receptionDelta} catches` : "a catch"} for ${yardDelta} yards` };
  if (yardDelta > 0)
    return { ...confirmation, qualifies: true, kind: "offense", description: `${yardDelta} yards` };
  return { ...confirmation, qualifies: true, kind: "scoring", description: `${fantasyPoints.toFixed(1)} fantasy points` };
}

export function matchupImpactText({ isMine, yourPoints, opponentPoints, previousOdds, currentOdds }) {
  const margin = Number((yourPoints - opponentPoints).toFixed(1));
  const score = margin >= 0
    ? `You ${margin === 0 ? "are tied" : `lead by ${margin.toFixed(1)}`} (${yourPoints.toFixed(1)}–${opponentPoints.toFixed(1)}).`
    : `You trail by ${Math.abs(margin).toFixed(1)} (${yourPoints.toFixed(1)}–${opponentPoints.toFixed(1)}).`;
  const oddsDelta = previousOdds == null || currentOdds == null ? null : currentOdds - previousOdds;
  const odds = oddsDelta == null || Math.abs(oddsDelta) < 1
    ? currentOdds == null ? "" : ` Win outlook is ${currentOdds}%.`
    : ` Win outlook ${oddsDelta > 0 ? "rose" : "fell"} ${Math.abs(oddsDelta)} points to ${currentOdds}%.`;
  return `${isMine ? "Helps your lineup." : "Helps your opponent."} ${score}${odds}`;
}

const normalized = (value) => String(value ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "");

export function playerPlayToken(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return normalized(name);
  return normalized(`${parts[0][0]}.${parts.at(-1)}`);
}

export function findPlayContext(player, plays, kind) {
  const token = playerPlayToken(player?.name);
  const team = String(player?.nflTeam ?? "").toUpperCase();
  return plays.find((play) => {
    const offenseMatch = Boolean(team && play.offenseTeam === team);
    const defenseMatch = Boolean(team && play.defenseTeam === team);
    if (player?.position === "DEF" && kind === "turnover") return Boolean(play.isTurnover && defenseMatch);
    return Boolean(token && offenseMatch && normalized(play.text).includes(token));
  }) ?? null;
}

function playCompatibilityScore(player, play, confirmation) {
  const token = playerPlayToken(player?.name);
  const team = String(player?.nflTeam ?? "").toUpperCase();
  const text = String(play?.text ?? "");
  const normalizedText = normalized(text);
  const offenseMatch = Boolean(team && play?.offenseTeam === team);
  const defenseMatch = Boolean(team && play?.defenseTeam === team);
  const playerMatch = Boolean(token && normalizedText.includes(token));
  const kind = confirmation?.kind ?? "routine";

  if (player?.position === "DEF") {
    if (kind !== "turnover" || !play?.isTurnover || !defenseMatch) return -1;
    return 100 + (play?.scoringPlay ? 10 : 0);
  }
  if (!offenseMatch || !playerMatch) return -1;

  let score = 50;
  if (kind === "turnover") {
    if (!play?.isTurnover) return -1;
    score += 35;
  }
  if (kind === "special-teams") {
    const specialTeamsPlay = /field.?goal|extra.?point|kick|punt|return/i.test(`${play?.type ?? ""} ${text}`);
    if (!specialTeamsPlay) return -1;
    score += 30;
  }
  if (Number(confirmation?.touchdownDelta ?? 0) > 0) {
    if (!play?.scoringPlay || !/touchdown/i.test(text)) return -1;
    score += 40;
  } else if (/touchdown/i.test(text)) {
    return -1;
  } else if (kind === "offense" && play?.isTurnover) {
    return -1;
  }

  const confirmedYards = Number(confirmation?.yardDelta ?? 0);
  const playYards = Number(play?.yardage ?? 0);
  if (confirmedYards > 0 && playYards > 0) {
    const difference = Math.abs(confirmedYards - playYards);
    score += difference === 0 ? 25 : difference <= 3 ? 12 : difference <= 10 ? 3 : -10;
  }
  if (play?.scoringPlay) score += 5;
  return score;
}

// Sleeper's 30-second player-stat delta confirms the play shape. Highlightly's
// description is only attached when team, player, scoring type and yardage agree.
export function findConfirmedPlayContext(player, plays, confirmation) {
  const candidates = plays
    .map((play, index) => ({ play, index, score: playCompatibilityScore(player, play, confirmation) }))
    .filter((candidate) => candidate.score >= 50)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0]?.play ?? null;
}

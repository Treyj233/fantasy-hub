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

  if (defensiveTurnovers > 0)
    return { qualifies: true, kind: "turnover", fantasyPoints, description: defensiveTurnovers > 1 ? `${defensiveTurnovers} takeaways` : "a defensive takeaway" };
  if (offensiveTurnovers > 0)
    return { qualifies: true, kind: "turnover", fantasyPoints, description: offensiveTurnovers > 1 ? `${offensiveTurnovers} turnovers` : "a turnover" };
  if (fantasyPoints < 3) return { qualifies: false, kind: "routine", fantasyPoints, description: "" };
  if (returnTouchdowns > 0)
    return { qualifies: true, kind: "special-teams", fantasyPoints, description: returnTouchdowns > 1 ? `${returnTouchdowns} return touchdowns` : "a return touchdown" };
  if (fieldGoals > 0)
    return { qualifies: true, kind: "special-teams", fantasyPoints, description: fieldGoals > 1 ? `${fieldGoals} field goals` : "a field goal" };
  if (touchdownDelta > 0)
    return { qualifies: true, kind: "offense", fantasyPoints, description: touchdownDelta > 1 ? `${touchdownDelta} touchdowns` : "a touchdown" };
  if (receptionDelta > 0 && yardDelta > 0)
    return { qualifies: true, kind: "offense", fantasyPoints, description: `${receptionDelta > 1 ? `${receptionDelta} catches` : "a catch"} for ${yardDelta} yards` };
  if (yardDelta > 0)
    return { qualifies: true, kind: "offense", fantasyPoints, description: `${yardDelta} yards` };
  return { qualifies: true, kind: "scoring", fantasyPoints, description: `${fantasyPoints.toFixed(1)} fantasy points` };
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

export function espnPlayerToken(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return normalized(name);
  return normalized(`${parts[0][0]}.${parts.at(-1)}`);
}

export function findEspnPlayContext(player, plays, kind) {
  const token = espnPlayerToken(player?.name);
  const team = String(player?.nflTeam ?? "").toUpperCase();
  return plays.find((play) => {
    const offenseMatch = !play.offenseTeam || play.offenseTeam === team;
    const defenseMatch = !play.defenseTeam || play.defenseTeam === team;
    if (player?.position === "DEF" && kind === "turnover") return Boolean(play.isTurnover && defenseMatch);
    return Boolean(token && normalized(play.text).includes(token) && (offenseMatch || defenseMatch));
  }) ?? null;
}

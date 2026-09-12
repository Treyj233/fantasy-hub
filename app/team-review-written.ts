import type { ReviewContext, TeamReviewReport } from './team-review-model';

type Section = { heading: string; body: string };
const list = (names: string[]) => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
const name = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const names = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every(name);

/** Convert the same snapshot shown on Team Review into a factual written report. */
export function buildWrittenTeamReport(review: TeamReviewReport, context: ReviewContext, input: unknown): Section[] {
  const moves = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const trades = (Array.isArray(moves.trades) ? moves.trades : []).filter((t): t is { partner: string; send: string[]; receive: string[] } =>
    t && name(t.partner) && names(t.send) && names(t.receive)).slice(0, 3);
  const waivers = (Array.isArray(moves.waivers) ? moves.waivers : []).filter((w): w is { add: string; drop: string } =>
    w && name(w.add) && name(w.drop)).slice(0, 3);
  const weak = review.rooms.filter(r => r.score < r.leagueAverage * .9);
  const thin = review.rooms.filter(r => !r.backups.length);
  const strongest = review.strengths[0];
  const verdicts: Record<string, string> = {
    Powerhouse: 'Your starting quality and usable depth put you in a strong position. Protect that advantage rather than making a move just to stay active.',
    Contender: 'You have the foundation to compete. Target a clear starting upgrade without creating a new weakness elsewhere.',
    'Top-Heavy': 'Your starters carry the roster, but the bench leaves less room for injuries and bye weeks. Add dependable cover before sacrificing more depth.',
    Balanced: 'Your positional groups avoid a major relative weakness. Look for selective upgrades while keeping your lineup coverage intact.',
    'In the Hunt': 'There is a workable foundation, but closing the gap means improving your weakest starting spots before adding optional depth.',
    'Needs Reinforcements': review.vacancies ? 'Restore starting coverage first. A stronger headline player will not offset an unfilled required slot.' : 'Focus on the clearest positional shortfall and build from there.',
  };
  const sections: Section[] = [{ heading: review.verdict,
    body: `${review.teamName} ranks #${review.overallRank} of ${review.leagueSize} in roster readiness, with starter strength #${review.starterRank}, lineup balance #${review.balanceRank}, and usable depth #${review.depthRank}. ${verdicts[review.verdict] ?? 'Protect your starting coverage as you evaluate upgrades.'}` }];
  sections.push({ heading: 'Strengths & positional gaps', body:
    `${strongest.position} is your strongest relative room at #${strongest.rank}${strongest.starters.length ? ', led by ' + list(strongest.starters.slice(0, 3).map(p => p.name)) : ''}. ` +
    (weak.length ? `${list(weak.map(r => r.position))} ${weak.length === 1 ? 'sits' : 'sit'} materially below the league average and should be the focus of improvement. ` : 'No positional group sits materially below the league average. ') +
    (thin.length ? `${list(thin.map(r => r.position))} ${thin.length === 1 ? 'has' : 'have'} no available backup coverage.` : 'Each positional group has available backup coverage.') });
  sections.push({ heading: 'Fit for your league', body:
    `In this ${context.format} ${context.scoring} league, your offensive lineup requires ${review.structure.slots.length} starters${review.structure.flex ? ', including ' + review.structure.flex + ' skill-position flex slots' : ''}. ` +
    (review.structure.deep >= .5 ? 'That deeper lineup rewards balanced production across your flex spots. Do not consolidate several usable starters into one upgrade if it leaves another starting hole.' : 'With fewer skill-position slots to fill, prioritize difference-making starters and meaningful QB or TE advantages over extra bench depth.') +
    (review.structure.superflex ? ' Protect your second starting quarterback in superflex.' : '') +
    (context.tePremium > 0 ? ' TE-premium scoring adds importance to retaining a productive tight end.' : '') +
    (review.structure.unsupported.length ? ' This review covers offensive positions only.' : '') });
  sections.push({ heading: 'Availability & risk', body:
    (review.vacancies ? `${review.vacancies} required starting ${review.vacancies === 1 ? 'slot cannot' : 'slots cannot'} be filled by currently available players. ` : 'Your currently available players can cover every required offensive slot. ') +
    (review.injuries.length ? `Monitor ${list(review.injuries.map(p => `${p.name} (${p.status})`))}. Check each status before setting your lineup.` : 'The loaded roster has no current injury flags.') +
    (review.concentration.length ? ` You also have ${list(review.concentration.map(([team, count]) => `${count} starters from ${team}`))}; shared bye weeks and game outcomes can concentrate your risk.` : '') });
  sections.push({ heading: 'Trade & waiver options', body:
    (moves.tradeStatus === 'unavailable' ? 'Trade matching is unavailable in this snapshot.' : trades.length ? trades.map(t => `With ${t.partner}, consider sending ${list(t.send)} for ${list(t.receive)}.`).join(' ') + ' These are separate proposals, not accepted offers; choose one path and reassess afterward.' : 'No qualifying trade package is available in this snapshot. Keep your assets rather than forcing a deal.') + '\n\n' +
    (moves.waiverStatus !== 'available' ? 'Waiver availability has not loaded; check the wire before planning an add.' : waivers.length ? waivers.map(w => `Consider adding ${w.add}, with ${w.drop} as the drop candidate.`).join(' ') + ' Recheck availability before claiming; each is a separate option.' : 'No worthwhile waiver add/drop upgrade was found. Keep your current assets.') });
  if (context.format !== 'Redraft') sections.push({ heading: 'Future flexibility', body:
    (Number.isInteger(moves.draftPicks) && Number(moves.draftPicks) >= 0 ? `You have ${moves.draftPicks} tracked draft picks. ` : 'Draft-pick inventory is unavailable in this snapshot. ') +
    'Weigh any immediate upgrade against the younger players and future assets you would give up. Keep enough flexibility to address your next roster need without sacrificing required starting coverage.' });
  sections.push({ heading: 'Your next move', body: review.vacancies ? 'Fill your uncovered starting slots before considering a consolidation trade. Review availability and eligible replacements first.' :
    weak.length ? `Focus on ${list(weak.map(r => r.position))}. Compare the options above against the players they would replace, and protect coverage elsewhere.` :
    review.depthRank > Math.ceil(review.leagueSize / 2) || thin.length ? `Improve injury and bye-week cover${thin.length ? ' at ' + list(thin.map(r => r.position)) : ''} without weakening your best starters.` :
    'Keep your core intact. Act only on a clear starting upgrade, and recheck your lineup as player availability changes.' });
  return sections;
}

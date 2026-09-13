import { getChatGPTUser } from '../../chatgpt-auth';
import { entitlementFor } from '../../entitlements';
import { buildTeamReview, type ReviewTeam, type ReviewContext } from '../../team-review-model';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const entitlement = await entitlementFor(user.userId, user.email);
  if (!entitlement.pro) return Response.json({ error: 'Fantasy Hub Pro required', code: 'PRO_REQUIRED' }, { status: 402 });
  // Evaluate the connected snapshot supplied by the app. No accounts, rosters,
  // trades, or waivers are mutated, and no report is shared or persisted.
  const raw = await request.text();
  if (raw.length > 600_000) return Response.json({ error: 'Roster snapshot too large' }, { status: 413 });
  try {
    const data = JSON.parse(raw) as { teams: ReviewTeam[]; selectedTeamId: string; context: ReviewContext };
    if (!Array.isArray(data.teams) || data.teams.length < 2 || data.teams.length > 40 ||
      !Array.isArray(data.context?.rosterSlots) || data.context.rosterSlots.length > 80 ||
      !data.context.rosterSlots.every(s => typeof s === 'string') ||
      data.teams.some(t => typeof t.id !== 'string' || typeof t.teamName !== 'string' || !Array.isArray(t.roster) || t.roster.length > 100 || t.roster.some(p =>
        typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.position !== 'string' || typeof p.status !== 'string' || typeof p.team !== 'string' || !Number.isFinite(p.value) || p.value < 0 || p.value > 150))) {
      return Response.json({ error: 'Refresh your league before requesting a review.' }, { status: 400 });
    }
    return Response.json(buildTeamReview(data.teams, data.selectedTeamId, data.context), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'A complete league roster and starter settings are needed for this review.' }, { status: 400 });
  }
}

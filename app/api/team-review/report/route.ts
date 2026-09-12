import { POST as assessTeam } from '../route';
import { buildWrittenTeamReport } from '../../../team-review-written';

export async function POST(request: Request) {
  const assessment = await assessTeam(request.clone());
  if (!assessment.ok) return assessment;
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const data = await request.json();
    const review = await assessment.json();
    return Response.json({ sections: buildWrittenTeamReport(review, data.context, data.moves) }, { headers });
  } catch {
    return Response.json({ error: 'Refresh your league and try your report again.' }, { status: 400, headers });
  }
}

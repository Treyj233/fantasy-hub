export type StoryCategory = "injury" | "performance" | "contract" | "depth-chart" | "weather" | "news";

export type Story = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  category: StoryCategory;
  fantasyImpact?: string;
  reporter?: string;
  curator?: string;
  parentId?: string;
  sourceContext?: string[];
};

export type FantasyPlayerContext = {
  playerId?: string;
  player: string;
  position: string;
  team: string;
  backups: string[];
  affectedPlayers: string[];
  relatedPlayers?: Array<{ id: string; name: string; position: string; team: string; relationship: "subject" | "beneficiary" | "backup" }>;
};

export function splitAtomicUpdates(value: string) {
  const withoutLinks = value.replace(/https:\/\/t\.co\/\w+/g, "").replace(/^RT\s+@\w+:\s*/i, "").trim();
  const lines = withoutLinks.split(/\n+/).map((line) => line.replace(/^\s*[-•–—]+\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length < 2) return [withoutLinks.replace(/\s+/g, " ").trim()].filter(Boolean);
  return lines.filter((line) => line.length >= 18).slice(0, 12);
}

const decodeEntities = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const stripHtml = (value: string) => decodeEntities(value).replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const tag = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? stripHtml(match[1]) : "";
};

const atomLink = (xml: string) => {
  const match = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? decodeEntities(match[1]) : "";
};

export function categorizeStory(text: string): StoryCategory {
  const normalized = text.toLowerCase();
  if (/injur|out for|questionable|doubtful|\bir\b|concussion|surgery|torn|sprain|hamstring|ankle|knee/.test(normalized)) return "injury";
  if (/\b(?:signs|signed|signing|re-signs|re-signed)\b|extension|contract|released|waived|traded|trade\b|franchise tag/.test(normalized)) return "contract";
  if (/\bstarter\b|\bnamed (?:the )?starter\b|\b(?:will|expected to|set to) start\b|\bstarting (?:at )?(?:quarterback|running back|wide receiver|tight end|kicker|role|job|lineup|offense)\b|depth chart|promoted|demoted|backup|committee|workload/.test(normalized)) return "depth-chart";
  if (/\b(?:practice|training camp|camp practice|joint practice|walkthrough|seven-on-seven|7-on-7|team drills?|individual drills?|scrimmage)\b/.test(normalized)) return "news";
  if (/yards|touchdowns?|targets|receptions|carries|snaps|breakout|record/.test(normalized)) return "performance";
  return "news";
}

const fantasySignals = /quarterback|\bqb\b|running back|\brb\b|wide receiver|\bwr\b|tight end|\bte\b|kicker|defense|fantasy|injur|starter|depth chart|contract|signed|released|waived|traded|targets|receptions|carries|touchdowns?|yards|snaps|suspension|inactive|practice|draft/;
const unreliableSignals = /rumou?r|could potentially|may possibly|speculation|anonymous social|unconfirmed/;

export function isFantasyRelevant(story: Pick<Story, "title" | "summary">) {
  const text = `${story.title} ${story.summary}`.toLowerCase();
  return fantasySignals.test(text) && !unreliableSignals.test(text);
}

export function parseFeed(xml: string, feedUrl: string): Story[] {
  const blocks = [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.slice(0, 30).map((match) => {
    const block = match[1];
    const title = tag(block, "title");
    const summary = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    const url = tag(block, "link") || atomLink(block);
    const published = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const publishedAt = Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : new Date().toISOString();
    const source = new URL(feedUrl).hostname.replace(/^www\./, "");
    return {
      id: tag(block, "guid") || tag(block, "id") || url || title,
      title,
      summary,
      url,
      source,
      publishedAt,
      category: categorizeStory(`${title} ${summary}`),
    };
  }).filter((story) => story.title && story.url && /^https:\/\//.test(story.url));
}

const impacts: Record<StoryCategory, string> = {
  injury: "Recheck availability, the direct backup, and every affected start/sit decision.",
  contract: "This can reshape role security, target competition, and dynasty value.",
  "depth-chart": "Usage is changing—watch snaps, touches, and waiver availability.",
  performance: "Treat the usage behind the box score as the signal for lineups and trades.",
  weather: "Recheck the forecast and affected lineup decisions near kickoff.",
  news: "Verify the report against role, usage, and availability before changing rankings or lineups.",
};

const labels: Record<StoryCategory, string> = {
  injury: "🚨 INJURY PULSE",
  contract: "📝 ROSTER MOVE",
  "depth-chart": "📈 ROLE WATCH",
  performance: "🔥 PERFORMANCE PULSE",
  weather: "🌧️ WEATHER WATCH",
  news: "🏈 FANTASY PULSE",
};

const creditedReporters: Record<string, string> = {
  "@rapsheet": "@RapSheet",
  "@adamschefter": "@AdamSchefter",
  "@tompelissero": "@TomPelissero",
  "@mikegarafolo": "@MikeGarafolo",
  "@schultz_report": "@Schultz_Report",
};

const compact = (value: string, length: number) => value.length <= length
  ? value
  : `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;

const cleanEnding = (value: string) => value.replace(/[,:;\-–—\s]+$/g, "").replace(/[.!?]?$/, ".");

const injuryDetails = (value: string) => {
  const action = value.match(/\b(?:tweaked|strained|sprained|injured|hurt|aggravated)(?:\s+(?:his|her|their))?\s+(?:(?:left|right)\s+)?(?:hamstring|ankle|knee|groin|calf|quad|shoulder|foot|toe|back|hip|wrist|hand)\b/i)?.[0];
  const diagnosis = value.match(/torn ACL|ACL tear|torn Achilles|Achilles tear|groin injury|thigh injury|hamstring injury|ankle injury|knee injury|calf injury|quad injury|shoulder injury|foot injury|toe injury|back injury|hip injury|concussion|sprained MCL|sprained ACL|turf toe/i)?.[0];
  const reassuring = /not (?:considered )?(?:serious|long-term)|not believed to be (?:serious|long-term)|minor|day-to-day|precautionary/i.test(value);
  return { action, diagnosis, reassuring };
};

const injuryLead = (player: string, text: string) => {
  const details = injuryDetails(text);
  if (details.action) return `${player} ${details.action}`;
  if (details.diagnosis) {
    const severe = /torn|tear/i.test(details.diagnosis);
    return `${player} ${severe ? "suffered a" : "is dealing with a"} ${details.diagnosis}`;
  }
  return "";
};

const summarizeHeadline = (story: Story, context: FantasyPlayerContext | null, budget: number) => {
  const cleaned = story.title
    .replace(/^sources?:\s*/i, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstThought = cleaned.split(/(?<=[.!?])\s+|\s+[•|]\s+/)[0] || cleaned;
  if (firstThought.length <= budget) return cleanEnding(firstThought);

  if (context && story.category === "injury") {
    const details = injuryDetails(cleaned);
    const lead = injuryLead(context.player, cleaned);
    const summary = lead
      ? `${lead}${details.reassuring ? "; not considered serious" : ""}`
      : `${context.player} has a new injury update`;
    if (summary.length <= budget) return cleanEnding(summary);
    if (details.diagnosis) {
      const compactDiagnosis = `${context.player} has a ${details.diagnosis}`;
      if (compactDiagnosis.length <= budget) return cleanEnding(compactDiagnosis);
    }
  }
  if (context && story.category === "contract") {
    const move = cleaned.match(/(?:signed|signs|agreed|extended|traded|released|waived)[^.!;,]{0,80}/i)?.[0];
    const summary = move ? `${context.player} ${move}` : `${context.player}'s roster situation has changed`;
    if (summary.length <= budget) return cleanEnding(summary);
  }

  const words = firstThought.split(/\s+/);
  let summary = "";
  for (const word of words) {
    const candidate = summary ? `${summary} ${word}` : word;
    if (candidate.length > Math.max(24, budget - 1)) break;
    summary = candidate;
  }
  return cleanEnding(summary || firstThought.slice(0, Math.max(1, budget - 1)));
};

export function composePost(story: Story) {
  return composeFantasyPost(story, null);
}

const longTermInjury = /out for (?:the )?(?:season|year|\d+ weeks?|multiple weeks?)|torn|acl|achilles|season-ending|placed on injured reserve|lands on ir|surgery/i;
const confirmedAbsence = /ruled out|will not play|won't play|will miss (?:the )?game|inactive|not expected to play/i;
const highConcernWeeklyInjury = /doubtful|game-time decision|week-to-week|miss(?:ed|es|ing) (?:a |the )?(?:practice|walkthrough)|did not practice|dnp|concussion/i;
const mildInjury = /day-to-day|limited|soreness|tightness|bruise|contusion|precautionary|minor|managing|rest day/i;
const gameDayPlay = /\b(?:touchdown|td|scores?|two-point|[4-9]\d-yard|1\d{2}\s+yards|100-yard|150-yard|200-yard)\b/i;
const practiceSetting = /\b(?:practice|training camp|camp practice|joint practice|walkthrough|seven-on-seven|7-on-7|team drills?|individual drills?|scrimmage)\b/i;
const playerAdded = /\b(?:signs|signed|signing|re-signs|re-signed)\b|agreed|acquired|traded for|claimed/i;
const playerRemoved = /released|waived|cut|traded away|departed|not re-sign/i;
const availabilitySignal = /absen|practice|sideline|no helmet|returned|limited|held out|did not participate|dnp/i;
const positiveCampSignal = /impressive|excel|standout|strong camp|making plays|first-team|starter reps|breakout|\bhot\b/i;

const lateInGameWeek = (publishedAt: string) => {
  const day = new Date(publishedAt).getUTCDay();
  return day === 0 || day >= 4;
};

const isPreseasonPeriod = (publishedAt: string) => {
  const month = new Date(publishedAt).getUTCMonth();
  return month === 6 || month === 7;
};

export function isSixPointFantasyPlay(story: Pick<Story, "title" | "summary">) {
  const text = `${story.title} ${story.summary}`;
  if (practiceSetting.test(text)) return false;
  if (/\b(?:touchdown|td|pick-six|fumble return)\b/i.test(text)) return true;
  const yardage = [...text.matchAll(/\b(\d{2,3})[- ]yard/gi)].map((match) => Number(match[1]));
  return yardage.some((yards) => yards >= 60) && /rush|run|reception|receiv|catch|caught/i.test(text);
}

const specificImpact = (story: Story, context: FantasyPlayerContext | null) => {
  if (story.fantasyImpact) return story.fantasyImpact;
  if (story.category === "injury" && context) {
    const backupText = context.backups.length ? context.backups.join(" and ") : `the next ${context.position} on the ${context.team} depth chart`;
    const injuryUpdate = `${story.title} ${story.summary}`;
    const details = injuryDetails(injuryUpdate);
    const detailLead = injuryLead(context.player, injuryUpdate);
    if (longTermInjury.test(injuryUpdate)) {
      return `${context.player} managers: prioritize ${backupText} on waivers. Expect the remaining ${context.team} playmakers to absorb the vacated volume.`;
    }
    if (isPreseasonPeriod(story.publishedAt)) {
      const beneficiary = context.affectedPlayers[0] ?? context.backups[0] ?? `another ${context.team} playmaker`;
      const opportunity = context.position === "RB" ? "touch-share" : context.position === "QB" ? "passing-game" : "target-share";
      const depthWatch = context.backups[0] && context.backups[0] !== beneficiary ? ` ${context.backups[0]} is depth-chart insurance.` : "";
      return `Preseason: track ${context.player}'s recovery, not the waiver wire. If the absence lingers, ${beneficiary} is the ${opportunity} watch.${depthWatch}`;
    }
    if (confirmedAbsence.test(injuryUpdate)) {
      const verb = context.backups.length > 1 ? "get" : "gets";
      return `${context.player} is not expected to play, so ${backupText} ${verb} the immediate opportunity boost. Check availability and reassess affected lineup decisions.`;
    }
    if (highConcernWeeklyInjury.test(injuryUpdate) && lateInGameWeek(story.publishedAt)) {
      return `${context.player} carries late-week risk. Keep ${backupText} on the contingency list; act only after a downgrade or inactive ruling.`;
    }
    if (mildInjury.test(injuryUpdate) || !highConcernWeeklyInjury.test(injuryUpdate)) {
      const contextSentence = detailLead
        ? `${detailLead}${details.reassuring ? ", but it is not considered serious or long-term" : ""}. `
        : "";
      return `${contextSentence}No immediate waiver move. Monitor ${context.player}'s practice status; if ruled out, reassess ${backupText} and other ${context.team} playmakers.`;
    }
    return `Monitor ${context.player} through the next practice report. Keep ${backupText} on the watchlist, then act only if the injury worsens or an absence becomes likely.`;
  }
  if (story.category === "performance" && gameDayPlay.test(`${story.title} ${story.summary}`) && !practiceSetting.test(`${story.title} ${story.summary}`)) {
    return context
      ? `${context.player} just swung matchups. Keep the celebration going—but use snaps, routes and touches to decide whether it is sticky. 🚀`
      : "That play just flipped fantasy matchups everywhere. Points on the board, victory laps in the group chat. 🚀";
  }
  if (story.category === "depth-chart" && context) {
    return `${context.player}'s role is moving. Track first-team reps, routes and touches before waivers lock; opportunity beats name value.`;
  }
  if (story.category === "contract" && context) {
    const move = `${story.title} ${story.summary}`;
    const affected = context.affectedPlayers.length ? context.affectedPlayers.slice(0, 2).join(" and ") : `the other ${context.team} ${context.position}s`;
    if (playerRemoved.test(move)) {
      return `${context.player}'s departure opens opportunity for ${affected}. Recheck the depth chart, but wait for role evidence before making a major valuation change.`;
    }
    if (playerAdded.test(move)) {
      const opportunity = context.position === "QB" ? "passing-game outlook" : context.position === "K" ? "kicking role" : "touch and target competition";
      return `${context.player}'s arrival changes the ${opportunity} for ${affected}. Reassess roles and projections before waivers, trades or drafts.`;
    }
  }
  if (story.category === "news" && context) {
    const update = `${story.title} ${story.summary}`;
    const affected = context.affectedPlayers.length ? context.affectedPlayers.slice(0, 2).join(" and ") : `the other ${context.team} playmakers`;
    if (availabilitySignal.test(update)) {
      return `Check ${context.player}'s next practice participation before changing a lineup or projection. If the absence continues, reassess ${affected}.`;
    }
    if (positiveCampSignal.test(update)) {
      const evidence = context.position === "QB" ? "first-team reps and passing volume" : context.position === "RB" ? "carries, routes and targets" : "routes, targets and first-team snaps";
      return `Do not chase one camp highlight. Verify ${context.player}'s ${evidence}; move rankings only when the opportunity is repeatable.`;
    }
    const evidence = context.position === "QB" ? "first-team reps and passing volume" : context.position === "RB" ? "carries, routes and targets" : context.position === "K" ? "roster status and field-goal opportunities" : context.position === "DEF" ? "matchup personnel and injury availability" : "routes, targets and snaps";
    return `Compare this report with ${context.player}'s ${evidence}. Adjust projections only if it changes the expected role or availability.`;
  }
  return impacts[story.category];
};

export function composeFantasyPost(story: Story, context: FantasyPlayerContext | null) {
  const isGameDay = story.category === "performance" && gameDayPlay.test(`${story.title} ${story.summary}`) && !practiceSetting.test(`${story.title} ${story.summary}`);
  const label = isGameDay ? "🏈 SUNDAY PULSE" : labels[story.category];
  const impact = specificImpact(story, context);
  const reporter = story.reporter || creditedReporters[story.source.toLowerCase()];
  const attribution = reporter
    ? `\n\nReported by ${reporter}`
    : story.curator ? `\n\nCurated by ${story.curator}` : "";
  const fixed = `${label}\n\n\n\nFANTASY IMPACT: ${impact}${attribution}`;
  const headlineBudget = Math.max(42, 275 - fixed.length);
  return `${label}\n\n${summarizeHeadline(story, context, headlineBudget)}\n\nFANTASY IMPACT: ${impact}${attribution}`;
}

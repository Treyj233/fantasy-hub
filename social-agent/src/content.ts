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

const practiceSettingPattern = /\b(?:practice|training camp|camp practice|joint practice|walkthrough|seven-on-seven|7-on-7|team drills?|individual drills?|scrimmage)\b/i;

export function isPracticeSetting(value: string) {
  return practiceSettingPattern.test(value);
}

const liveContentPattern = /(?:^|\b)(?:live now|going live|we(?:'re| are) live|join (?:us|me) live|watch live|listen live|tune in live|live ?stream|x space|twitter space)(?:\b|:)/i;
const liveContentUrlPattern = /(?:x|twitter)\.com\/i\/(?:broadcasts|spaces)\/|pscp\.tv\//i;
const mediaDependentPattern = /\b(?:i|we) had to ask\b|\ba look at what(?:'s| is) ahead\b|\bfull (?:conversation|interview)\b|\bwatch(?: here| now)?\b|\blisten(?: here| now)?\b|^from @\w+:/i;

export function isLiveContentPost(text: string, urls: string[] = []) {
  return liveContentPattern.test(text) || mediaDependentPattern.test(text) || urls.some((url) => liveContentUrlPattern.test(url));
}

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
  if (/injur|out for|questionable|doubtful|\bir\b|concussion|surgery|torn|sprain|flare-up|hamstring|ankle|knee/.test(normalized)) return "injury";
  if (/\b(?:signs|signed|signing|re-signs|re-signed)\b|extension|contract|released|waived|traded|trade\b|franchise tag/.test(normalized)) return "contract";
  if (/\bstarter\b|\bnamed (?:the )?starter\b|\b(?:will|expected to|set to) start\b|\bstarting (?:at )?(?:quarterback|running back|wide receiver|tight end|kicker|role|job|lineup|offense)\b|depth chart|promoted|demoted|backup|committee|workload/.test(normalized)) return "depth-chart";
  if (isPracticeSetting(normalized)) return "news";
  if (/\b(?:will|expected to|set to|scheduled to|slated to) play\b/.test(normalized)) return "news";
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

const firstSentence = (value: string) => {
  const protectedAbbreviations = value.replace(/\b(vs|mr|mrs|ms|dr|st)\./gi, "$1<period>");
  return (protectedAbbreviations.split(/(?<=[.!?])\s+|\s+[•|]\s+/)[0] || protectedAbbreviations)
    .replace(/<period>/g, ".");
};

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
  const firstThought = firstSentence(cleaned);
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
const playerAdded = /\b(?:signs|signed|signing|re-signs|re-signed)\b|agreed|acquired|traded for|claimed/i;
const playerRemoved = /released|waived|cut|traded away|departed|not re-sign/i;
const availabilitySignal = /absen|sideline|no helmet|returned to practice|limited(?: in practice)?|held out|did not participate|\bdnp\b|miss(?:ed|es|ing) (?:a |the )?(?:practice|walkthrough)|not practicing|left practice|exited practice|did not finish practice/i;
const positiveCampSignal = /impressive|excel|standout|strong camp|making plays|first-team|starter reps|breakout|\bhot\b/i;
const practiceStatLine = /\b\d+\s*[-–]of[-–]\s*\d+\b|\b\d+\s*(?:tds?|touchdowns?|ints?|interceptions?|targets?|receptions?|carries|yards)\b/i;

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
  if (isPracticeSetting(text)) return false;
  if (/\b(?:touchdown|td|pick-six|fumble return)\b/i.test(text)) return true;
  const yardage = [...text.matchAll(/\b(\d{2,3})[- ]yard/gi)].map((match) => Number(match[1]));
  return yardage.some((yards) => yards >= 60) && /rush|run|reception|receiv|catch|caught/i.test(text);
}

const specificImpact = (story: Story, context: FantasyPlayerContext | null) => {
  if (story.fantasyImpact) return story.fantasyImpact;
  if (story.category === "injury" && context) {
    const opportunityPlayers = [...new Set([...context.affectedPlayers, ...context.backups])].slice(0, 3);
    const backupText = opportunityPlayers.length ? opportunityPlayers.join(" and ") : `the next ${context.position} on the ${context.team} depth chart`;
    const beneficiaryText = context.affectedPlayers.length ? [...new Set(context.affectedPlayers)].slice(0, 3).join(" and ") : `the remaining ${context.team} playmakers`;
    const depthText = context.backups.length ? [...new Set(context.backups)].slice(0, 2).join(" and ") : `the next ${context.position} on the ${context.team} depth chart`;
    const injuryUpdate = `${story.title} ${story.summary}`;
    const details = injuryDetails(injuryUpdate);
    const detailLead = injuryLead(context.player, injuryUpdate);
    if (longTermInjury.test(injuryUpdate)) {
      return `${context.player} managers should plan a replacement. ${beneficiaryText} gain the clearest opportunity; put ${depthText} on the watchlist until the vacated role is assigned.`;
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
  if (story.category === "performance" && gameDayPlay.test(`${story.title} ${story.summary}`) && !isPracticeSetting(`${story.title} ${story.summary}`)) {
    return context
      ? `${context.player} just swung matchups. Enjoy the points, but only chase them next week if the play came from a role the offense is likely to repeat. 🚀`
      : "That play just flipped fantasy matchups everywhere. Points on the board, victory laps in the group chat. 🚀";
  }
  if (story.category === "depth-chart" && context) {
    const beneficiary = context.affectedPlayers[0] ?? context.backups[0];
    return beneficiary
      ? `${context.player}'s role change puts ${beneficiary} on the actionable watchlist. Hold off on a move until the team confirms who inherits the first opportunity.`
      : `${context.player}'s role is unsettled. Hold for now; the next confirmed starter designation is the signal to act.`;
  }
  if (story.category === "contract" && context) {
    const move = `${story.title} ${story.summary}`;
    const affected = context.affectedPlayers.length ? context.affectedPlayers.slice(0, 2).join(" and ") : `the other ${context.team} ${context.position}s`;
    if (playerRemoved.test(move)) {
      return `${context.player}'s departure clears an opening for ${affected}. Add the likely replacement to your watchlist now, but wait for the team to assign the vacated role before spending meaningful FAAB.`;
    }
    if (playerAdded.test(move)) {
      const action = context.position === "QB" ? "Hold the surrounding pass catchers until the team confirms the pecking order" : context.position === "K" ? "Do not roster either kicker until the competition is settled" : `Treat ${affected} as the immediate value-pressure point`;
      return `${context.player}'s arrival adds real competition. ${action}; avoid buying at the old price until the role is clear.`;
    }
  }
  if (story.category === "news" && context) {
    const update = `${story.title} ${story.summary}`;
    const affected = context.affectedPlayers.length ? context.affectedPlayers.slice(0, 2).join(" and ") : `the other ${context.team} playmakers`;
    if (isPracticeSetting(update) && practiceStatLine.test(update)) {
      const confirmation = context.position === "QB" ? "another day running the first-team offense" : context.position === "RB" ? "repeat work with the starters or at the goal line" : "a repeated place with the starters and designed involvement";
      return `Keep ${context.player}'s price unchanged after one practice. ${confirmation[0].toUpperCase()}${confirmation.slice(1)} would make the report worth acting on.`;
    }
    if (availabilitySignal.test(update)) {
      return `Check ${context.player}'s next practice participation before changing a lineup or projection. If the absence continues, reassess ${affected}.`;
    }
    if (positiveCampSignal.test(update)) {
      const trigger = context.position === "QB" ? "the first-team job or a designed package" : context.position === "RB" ? "starter work or goal-line responsibility" : "a stable first-team role";
      return `Do not pay up for one camp highlight. Hold ${context.player}'s current value unless the team confirms ${trigger}.`;
    }
    if (context.position === "QB") return `Keep ${context.player}'s value steady. A confirmed change in starting status or designed usage would be actionable; this report alone is not.`;
    if (context.position === "RB") return `No move yet on ${context.player}. Act only if the next report changes who gets the opening drive or goal-line work.`;
    if (context.position === "K") return `Leave ${context.player} off draft and waiver priorities for now. A confirmed job win is the next actionable signal.`;
    if (context.position === "DEF") return `This does not change the streaming call by itself. Revisit only if it materially changes the unit's personnel for the upcoming opponent.`;
    return `Hold ${context.player} at the current price. A confirmed starting-role or target-order change—not another general update—is what should trigger a move.`;
  }
  return impacts[story.category];
};

export function composeFantasyPost(story: Story, context: FantasyPlayerContext | null) {
  const isGameDay = story.category === "performance" && gameDayPlay.test(`${story.title} ${story.summary}`) && !isPracticeSetting(`${story.title} ${story.summary}`);
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

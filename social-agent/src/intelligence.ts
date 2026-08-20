import { categorizeStory, type Story, type StoryCategory } from "./content";
import type { PlayerContext } from "./player-data";

export type Confidence = "high" | "medium" | "low";
export type LifecycleStage = "initial" | "practice-update" | "game-status" | "confirmed" | "return";

export type StoryFacts = {
  player: string | null;
  team: string | null;
  position: string | null;
  eventType: StoryCategory;
  diagnosis: string | null;
  severity: string | null;
  timetable: string | null;
  seasonPhase: "preseason" | "regular-season" | "postseason" | "offseason";
  lifecycleStage: LifecycleStage;
  sourceTier: "trusted-original" | "curated-original" | "other";
  confidence: Confidence;
};

export type ValidationResult = {
  approvedForX: boolean;
  reasons: string[];
};

const diagnosisPattern = /torn ACL|ACL tear|torn Achilles|Achilles tear|groin injury|hamstring injury|ankle injury|knee injury|calf injury|quad injury|shoulder injury|foot injury|toe injury|back injury|hip injury|concussion|turf toe|tweaked (?:his|her|their) (?:hamstring|ankle|knee|groin|calf|quad|shoulder|foot|toe|back|hip)/i;
const severityPattern = /not (?:considered )?(?:serious|long-term)|season-ending|minor|day-to-day|week-to-week|questionable|doubtful|ruled out/i;
const timetablePattern = /(?:out|miss) (?:for )?(?:the )?(?:season|year|\d+ weeks?|multiple weeks?)|return(?:ing)? (?:in|by) [^.;]{3,35}|(?:may|might|could|unlikely to|not expected to|uncertain|unclear|in doubt|no guarantee|doesn['’]t know)[^.;]{0,80}(?:week 1|start of (?:the )?season|season opener)/i;
const openingAvailabilityPattern = /(?:may|might|could|unlikely to|not expected to|uncertain|unclear|in doubt|no guarantee|doesn['’]t know)[^.;]{0,80}(?:week 1|start of (?:the )?season|season opener)|(?:week 1|start of (?:the )?season|season opener)[^.;]{0,80}(?:uncertain|unclear|in doubt|not guaranteed|questionable)/i;

const seasonPhase = (publishedAt: string): StoryFacts["seasonPhase"] => {
  const date = new Date(publishedAt);
  const month = date.getUTCMonth();
  if (month === 6 || month === 7) return "preseason";
  if (month >= 8 && month <= 11) return "regular-season";
  if (month === 0 || month === 1) return "postseason";
  return "offseason";
};

const lifecycleStage = (text: string): LifecycleStage => {
  if (/returned|cleared|full participant|back at practice/i.test(text)) return "return";
  if (/ruled out|inactive|questionable|doubtful|game-time decision/i.test(text) || openingAvailabilityPattern.test(text)) return "game-status";
  if (/did not practice|limited|practice|sideline|no helmet|held out/i.test(text)) return "practice-update";
  if (/confirmed|diagnosed|torn|surgery|placed on (?:ir|injured reserve)/i.test(text)) return "confirmed";
  return "initial";
};

export function extractStoryFacts(story: Story, context: PlayerContext | null): StoryFacts {
  const text = `${story.title} ${story.summary}`;
  const diagnosis = text.match(diagnosisPattern)?.[0] ?? null;
  const severity = text.match(severityPattern)?.[0] ?? null;
  const timetable = text.match(timetablePattern)?.[0] ?? null;
  const sourceTier = story.source.toLowerCase() === "@32beatwriters" ? "curated-original" : story.source.startsWith("@") ? "trusted-original" : "other";
  const classificationAgrees = categorizeStory(text) === story.category;
  const confidence: Confidence = (!context && story.category !== "weather") || !classificationAgrees
    ? "low"
    : story.category === "injury" && (diagnosis || severity || timetable)
      ? "high"
      : story.category === "contract" || story.category === "weather" || story.category === "performance"
        ? "high"
        : "medium";
  return {
    player: context?.player ?? null,
    team: context?.team ?? null,
    position: context?.position ?? null,
    eventType: story.category,
    diagnosis,
    severity,
    timetable,
    seasonPhase: seasonPhase(story.publishedAt),
    lifecycleStage: lifecycleStage(text),
    sourceTier,
    confidence,
  };
}

export function isMaterialStoryUpdate(previous: StoryFacts | null, next: StoryFacts, story: Pick<Story, "title" | "summary">) {
  if (!previous) return false;
  const changedFact = (["diagnosis", "severity", "timetable"] as const)
    .some((key) => Boolean(next[key]) && next[key]?.toLowerCase() !== previous[key]?.toLowerCase());
  if (changedFact) return true;
  if (next.lifecycleStage !== previous.lifecycleStage && ["game-status", "confirmed", "return"].includes(next.lifecycleStage)) return true;
  return openingAvailabilityPattern.test(`${story.title} ${story.summary}`);
}

export function validateStoryDraft(story: Story, context: PlayerContext | null, draft: string, facts: StoryFacts): ValidationResult {
  const reasons: string[] = [];
  if (!context && story.category !== "weather") reasons.push("No fantasy-relevant player resolved");
  if (facts.confidence === "low") reasons.push("Extracted facts are low confidence");
  if (draft.length > 280) reasons.push("Draft exceeds the X character limit");
  if (/told reporters\.$|according to (?:a )?source\.$|has a new (?:injury )?update\.$/im.test(draft)) reasons.push("Headline ends before the actionable fact");
  if (/\b(?:not|and|or|but|with|for|to|during)\.$/im.test(draft)) reasons.push("Headline ends with a dangling word");
  const headline = draft.split(/\n{2,}/)[1] ?? "";
  if (context && headline.toLowerCase().split(context.player.toLowerCase()).length - 1 > 1) reasons.push("Headline repeats the subject name");
  if (story.category === "injury" && facts.diagnosis && !draft.toLowerCase().includes(facts.diagnosis.toLowerCase().replace(/^(?:tweaked)\s+(?:his|her|their)\s+/, ""))) reasons.push("Draft omits the reported injury detail");
  if (!/FANTASY IMPACT:/i.test(draft)) reasons.push("Fantasy impact is missing");
  if (/adjust projections|monitor the depth chart|compare (?:this report )?(?:with )?(?:routes|targets|snaps)|routes, targets and snaps/i.test(draft)) reasons.push("Fantasy impact uses vague boilerplate");
  return { approvedForX: reasons.length === 0, reasons };
}

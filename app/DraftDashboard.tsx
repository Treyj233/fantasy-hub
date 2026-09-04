"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type DraftPlayer = { id: string; name: string; position: string; team: string; overallRank?: number; rankingValue?: number; age?: number | null; adpBySite?: Record<string, number | null>; fantasyPoints2025?: number | null; fantasyPpg2025?: number | null; gamesPlayed2025?: number | null; targets2025?: number | null; receptions2025?: number | null; receivingYards2025?: number | null; receivingTouchdowns2025?: number | null; rushingAttempts2025?: number | null; rushingYards2025?: number | null; rushingTouchdowns2025?: number | null; passingAttempts2025?: number | null; passingYards2025?: number | null; passingTouchdowns2025?: number | null; snapAverage?: number | null; statsSourceSeason?: number | null };
type RosterConfig = { QB: number; RB: number; WR: number; TE: number; FLEX: number; SUPERFLEX: number; BENCH: number };
type BoardOrder = "Fantasy Hub Rankings" | "Consensus ADP" | "Underdog ADP" | "Sleeper ADP" | "ESPN ADP";
type DraftSettings = { teams: number; slot: number; format: "Redraft" | "Keeper" | "Dynasty"; lineup: "1QB" | "Superflex"; scoring: "Standard" | "Half PPR" | "Full PPR" | "TE Premium"; cpu: "Balanced" | "Competitive" | "Chaotic"; boardOrder: BoardOrder; timer: number; roster: RosterConfig };
type LeagueDraftContext = { format: "Dynasty" | "Keeper" | "Redraft"; scoring: string; teams: number; rosterSlots: string[]; positionDemand: Record<string, number>; tePremium: number };
type Pick = DraftPlayer & { overall: number; round: number; draftTeam: number; user: boolean };
type RosterSlot = { id: string; label: "QB" | "RB" | "WR" | "TE" | "FLEX" | "SUPERFLEX" | "BENCH"; player?: Pick };
type AdpWeights = { underdog: number; sleeper: number; espn: number };
type CpuProfile = { name: string; summary: string; position: "RB" | "WR" | "QB" | "TE" | "BALANCED"; strategy: "volume" | "elite" | "zero-rb" | "hero-rb" | "balanced"; weights: AdpWeights; risk: number };

const cpuArchetypes: Omit<CpuProfile, "weights" | "risk">[] = [
  { name: "RB Collector", summary: "Builds through running-back volume", position: "RB", strategy: "volume" },
  { name: "WR Avalanche", summary: "Attacks receiver value and weekly ceiling", position: "WR", strategy: "volume" },
  { name: "Elite QB", summary: "Pays for a difference-maker, then waits", position: "QB", strategy: "elite" },
  { name: "Elite TE", summary: "Targets the scarce top tight-end tier", position: "TE", strategy: "elite" },
  { name: "Zero RB", summary: "Loads up elsewhere before chasing RB value", position: "WR", strategy: "zero-rb" },
  { name: "Hero RB", summary: "Anchors one early RB, then builds receivers", position: "RB", strategy: "hero-rb" },
  { name: "Market Reader", summary: "Lets blended market value lead the room", position: "BALANCED", strategy: "balanced" },
];
const adpBlends: { label: string; weights: AdpWeights }[] = [
  { label: "Underdog-led", weights: { underdog: .8, sleeper: .1, espn: .1 } },
  { label: "ESPN-led", weights: { underdog: .1, sleeper: .2, espn: .7 } },
  { label: "Sleeper-led", weights: { underdog: .15, sleeper: .7, espn: .15 } },
  { label: "Sharp blend", weights: { underdog: .55, sleeper: .3, espn: .15 } },
  { label: "Consensus", weights: { underdog: .34, sleeper: .33, espn: .33 } },
];

const demoPlayers: DraftPlayer[] = [
  ["Ja'Marr Chase","WR","CIN"],["Bijan Robinson","RB","ATL"],["Justin Jefferson","WR","MIN"],["Jahmyr Gibbs","RB","DET"],["CeeDee Lamb","WR","DAL"],["Puka Nacua","WR","LAR"],["Amon-Ra St. Brown","WR","DET"],["Saquon Barkley","RB","PHI"],["Malik Nabers","WR","NYG"],["Brian Thomas Jr.","WR","JAX"],["Josh Allen","QB","BUF"],["Lamar Jackson","QB","BAL"],["Brock Bowers","TE","LV"],["De'Von Achane","RB","MIA"],["Nico Collins","WR","HOU"],["Drake London","WR","ATL"],["Jonathan Taylor","RB","IND"],["Ashton Jeanty","RB","LV"],["Trey McBride","TE","ARI"],["A.J. Brown","WR","PHI"],["Kyren Williams","RB","LAR"],["Breece Hall","RB","NYJ"],["Jayden Daniels","QB","WAS"],["Jaxon Smith-Njigba","WR","SEA"],["Josh Jacobs","RB","GB"],["Tee Higgins","WR","CIN"],["Garrett Wilson","WR","NYJ"],["Ladd McConkey","WR","LAC"],["Chase Brown","RB","CIN"],["George Kittle","TE","SF"],["Joe Burrow","QB","CIN"],["James Cook","RB","BUF"],["Davante Adams","WR","LAR"],["Marvin Harrison Jr.","WR","ARI"],["Derrick Henry","RB","BAL"],["DK Metcalf","WR","PIT"],["Sam LaPorta","TE","DET"],["Rome Odunze","WR","CHI"],["TreVeyon Henderson","RB","NE"],["Bucky Irving","RB","TB"],["Terry McLaurin","WR","WAS"],["Patrick Mahomes","QB","KC"],["Xavier Worthy","WR","KC"],["DJ Moore","WR","CHI"],["Kenneth Walker III","RB","SEA"],["DeVonta Smith","WR","PHI"],["Zay Flowers","WR","BAL"],["Jameson Williams","WR","DET"],["David Montgomery","RB","DET"],["Calvin Ridley","WR","TEN"],["Isiah Pacheco","RB","KC"],["Jordan Addison","WR","MIN"],["Mark Andrews","TE","BAL"],["Kyler Murray","QB","ARI"],["Tony Pollard","RB","TEN"],["Chris Olave","WR","NO"],["Courtland Sutton","WR","DEN"],["George Pickens","WR","DAL"],["D'Andre Swift","RB","CHI"],["Jaylen Waddle","WR","MIA"],["Rashee Rice","WR","KC"],["Travis Kelce","TE","KC"],["Tetairoa McMillan","WR","CAR"],["RJ Harvey","RB","DEN"],["Stefon Diggs","WR","NE"],["T.J. Hockenson","TE","MIN"],["Dak Prescott","QB","DAL"],["Caleb Williams","QB","CHI"],["Baker Mayfield","QB","TB"],["Bo Nix","QB","DEN"],["Jordan Love","QB","GB"],["Justin Herbert","QB","LAC"],["Khalil Shakir","WR","BUF"],["DeMario Douglas","WR","NE"],["Dallas Goedert","TE","PHI"],["Jake Ferguson","TE","DAL"],["Tyjae Spears","RB","TEN"],["Rhamondre Stevenson","RB","NE"],["Jaylen Warren","RB","PIT"],["Rachaad White","RB","WAS"]
].map(([name, position, team], index) => ({ id: `demo-${index + 1}`, name, position, team, overallRank: index + 1, rankingValue: 100 - index * .7 }));

const defaultSettings: DraftSettings = { teams: 10, slot: 5, format: "Redraft", lineup: "1QB", scoring: "Half PPR", cpu: "Balanced", boardOrder: "Fantasy Hub Rankings", timer: 60, roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, BENCH: 4 } };
const settingsForLeague = (context: LeagueDraftContext | null, draftSlot?: string) => {
  if (!context) return defaultSettings;
  const counts = context.rosterSlots.reduce<Record<string, number>>((values, rawSlot) => {
    const slot = rawSlot.toUpperCase();
    values[slot] = (values[slot] ?? 0) + 1;
    return values;
  }, {});
  const count = (...slots: string[]) => slots.reduce((total, slot) => total + (counts[slot] ?? 0), 0);
  const superflexSlots = count("SUPER_FLEX", "SUPERFLEX", "QB_FLEX", "OP");
  const qbSlots = count("QB");
  const isSuperflex = superflexSlots > 0 || qbSlots > 1 || (context.positionDemand.QB ?? 0) > 1.4;
  const parsedSlot = Number(draftSlot);
  const teams = Math.max(2, context.teams || defaultSettings.teams);
  const scoring: DraftSettings["scoring"] = context.tePremium > 0
    ? "TE Premium"
    : /half/i.test(context.scoring) ? "Half PPR"
    : /ppr/i.test(context.scoring) ? "Full PPR"
    : "Standard";
  return {
    ...defaultSettings,
    teams,
    slot: Number.isInteger(parsedSlot) && parsedSlot >= 1 && parsedSlot <= teams ? parsedSlot : Math.ceil(teams / 2),
    format: context.format,
    lineup: isSuperflex ? "Superflex" as const : "1QB" as const,
    scoring,
    roster: {
      QB: Math.max(1, qbSlots),
      RB: Math.max(0, count("RB")),
      WR: Math.max(0, count("WR")),
      TE: Math.max(0, count("TE")),
      FLEX: Math.max(0, count("FLEX", "WR_RB_FLEX", "W_R_T", "REC_FLEX")),
      SUPERFLEX: Math.max(0, superflexSlots),
      BENCH: Math.max(0, count("BN", "BE", "BENCH")),
    },
  } satisfies DraftSettings;
};
const rosterRounds = (settings: DraftSettings) => Object.values(settings.roster).reduce((sum, count) => sum + count, 0);
const letterGrade = (score: number) => score >= 94 ? "A+" : score >= 90 ? "A" : score >= 87 ? "A−" : score >= 84 ? "B+" : score >= 80 ? "B" : score >= 77 ? "B−" : score >= 73 ? "C+" : score >= 69 ? "C" : score >= 65 ? "C−" : "D";
const rosterSlots = (settings: DraftSettings, picks: Pick[]) => {
  const slots: RosterSlot[] = [];
  for (const label of ["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX", "BENCH"] as const) {
    for (let index = 0; index < settings.roster[label]; index += 1) slots.push({ id: `${label}-${index}`, label });
  }
  for (const player of picks) {
    const exact = slots.find((slot) => !slot.player && slot.label === player.position);
    const flex = slots.find((slot) => !slot.player && slot.label === "FLEX" && ["RB", "WR", "TE"].includes(player.position));
    const superflex = slots.find((slot) => !slot.player && slot.label === "SUPERFLEX" && ["QB", "RB", "WR", "TE"].includes(player.position));
    const bench = slots.find((slot) => !slot.player && slot.label === "BENCH");
    const destination = exact ?? flex ?? superflex ?? bench;
    if (destination) destination.player = player;
  }
  return slots;
};
const canRosterPlayer = (settings: DraftSettings, picks: Pick[], position: string) => rosterSlots(settings, picks).some((slot) =>
  !slot.player && (slot.label === position || slot.label === "BENCH" || (slot.label === "FLEX" && ["RB", "WR", "TE"].includes(position)) || (slot.label === "SUPERFLEX" && ["QB", "RB", "WR", "TE"].includes(position))),
);
const teamForPick = (overall: number, teams: number) => { const round = Math.ceil(overall / teams); const within = (overall - 1) % teams; return round % 2 ? within + 1 : teams - within; };
const positionNeed = (picks: Pick[]) => { const counts: Record<string, number> = {}; for (const pick of picks) counts[pick.position] = (counts[pick.position] || 0) + 1; return ["RB","WR","QB","TE"].sort((a,b) => (counts[a] || 0) - (counts[b] || 0))[0]; };
const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5);
const createCpuProfiles = (teams: number, userSlot: number) => {
  const archetypes = shuffled(Array.from({ length: teams }, (_, index) => cpuArchetypes[index % cpuArchetypes.length]));
  const blends = shuffled(Array.from({ length: teams }, (_, index) => adpBlends[index % adpBlends.length]));
  return Object.fromEntries(Array.from({ length: teams }, (_, index) => {
    const team = index + 1;
    const archetype = archetypes[index];
    const blend = blends[index];
    return [team, { ...archetype, name: `${archetype.name} · ${blend.label}`, weights: blend.weights, risk: .7 + Math.random() * .7 } satisfies CpuProfile];
  }).filter(([team]) => team !== userSlot)) as Record<number, CpuProfile>;
};
const siteAdp = (player: DraftPlayer, source: keyof AdpWeights, settings: DraftSettings) => {
  const sites = player.adpBySite ?? {};
  if (source === "espn") return sites.ESPN;
  if (source === "sleeper") return sites[settings.lineup === "Superflex" ? "Sleeper Superflex" : "Sleeper Single-QB"] ?? sites.Sleeper;
  const scoring = settings.scoring === "Full PPR" || settings.scoring === "TE Premium" ? "Full PPR" : "Half PPR";
  return sites[`Underdog ${settings.lineup === "Superflex" ? "Superflex Half PPR" : `Single-QB ${scoring}`}`];
};
const dynastyAgeAdpAdjustment = (player: DraftPlayer) => {
  if (typeof player.age !== "number") return 0;
  const age = player.age;
  let adjustment = 0;
  if (player.position === "QB") adjustment = age <= 25 ? -4 - (25 - age) * 2 : age <= 31 ? -2 : age <= 32 ? 0 : 3 + (age - 33) * 3;
  else if (player.position === "RB") adjustment = age <= 23 ? -5 - (23 - age) * 3 : age <= 24 ? -3 : age <= 25 ? 0 : age <= 26 ? 5 : 8 + (age - 27) * 6;
  else if (player.position === "WR") adjustment = age <= 24 ? -4 - (24 - age) * 2 : age <= 27 ? -2 : age <= 28 ? 2 : 5 + (age - 29) * 4;
  else if (player.position === "TE") adjustment = age <= 25 ? -3 - (25 - age) * 1.5 : age <= 29 ? -1 : age <= 30 ? 3 : 5 + (age - 31) * 3.5;
  return Math.max(-14, Math.min(24, adjustment));
};
const blendedAdp = (player: DraftPlayer, profile: CpuProfile, settings: DraftSettings) => {
  const fallback = player.overallRank ?? 220;
  let total = 0;
  let weight = 0;
  for (const source of ["underdog", "sleeper", "espn"] as const) {
    // ESPN currently supplies a single-QB market. CPU profiles redistribute its
    // weight to format-specific sources in Superflex and 2-QB rooms.
    if (settings.lineup === "Superflex" && source === "espn") continue;
    const value = siteAdp(player, source, settings);
    if (typeof value === "number" && value > 0) { total += value * profile.weights[source]; weight += profile.weights[source]; }
  }
  const market = weight ? total / weight : fallback;
  return Math.max(1, market + (settings.format === "Dynasty" ? dynastyAgeAdpAdjustment(player) : 0));
};
const displayAdp = (player: DraftPlayer, settings: DraftSettings) => {
  const values = (["underdog", "sleeper", "espn"] as const)
    .map((source) => siteAdp(player, source, settings))
    .filter((value): value is number => typeof value === "number" && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : player.overallRank ?? null;
};
const fantasyHubAdp = (player: DraftPlayer, settings: DraftSettings) => {
  void settings;
  return player.overallRank ?? null;
};
const boardOrderValue = (player: DraftPlayer, settings: DraftSettings) => {
  if (settings.boardOrder === "Fantasy Hub Rankings") return player.overallRank ?? 999;
  const source = settings.boardOrder === "Underdog ADP" ? "underdog" : settings.boardOrder === "Sleeper ADP" ? "sleeper" : settings.boardOrder === "ESPN ADP" ? "espn" : null;
  return (source ? siteAdp(player, source, settings) : displayAdp(player, settings)) ?? player.overallRank ?? 999;
};
const historicalContext = (player: DraftPlayer) => {
  const value = (stat: number | null | undefined, digits = 0) => stat == null ? "—" : stat.toFixed(digits);
  const common = [
    { label: `${player.statsSourceSeason ?? 2025} FPTS`, value: value(player.fantasyPoints2025, 1) },
    { label: "SNAP SHARE", value: player.snapAverage == null ? "—" : `${Math.round(player.snapAverage)}%` },
    { label: "AGE", value: player.age == null ? "—" : String(player.age) },
  ];
  if (player.position === "QB") {
    return [
      common[0],
      { label: "PASS ATT", value: value(player.passingAttempts2025) },
      { label: "PASS YD", value: value(player.passingYards2025) },
      { label: "PASS TD", value: value(player.passingTouchdowns2025) },
      { label: "RUSH ATT", value: value(player.rushingAttempts2025) },
      { label: "RUSH YD", value: value(player.rushingYards2025) },
      common[1], common[2],
    ];
  }
  if (player.position === "RB") return [
    common[0],
    { label: "RUSH ATT", value: value(player.rushingAttempts2025) },
    { label: "RUSH YD", value: value(player.rushingYards2025) },
    { label: "RUSH TD", value: value(player.rushingTouchdowns2025) },
    { label: "REC", value: value(player.receptions2025) },
    { label: "REC YD", value: value(player.receivingYards2025) },
    common[1], common[2],
  ];
  return [
    common[0],
    { label: "TARGETS", value: value(player.targets2025) },
    { label: "REC", value: value(player.receptions2025) },
    { label: "REC YD", value: value(player.receivingYards2025) },
    { label: "REC TD", value: value(player.receivingTouchdowns2025) },
    common[1], common[2],
  ];
};
const nextPickForTeam = (overall: number, team: number, settings: DraftSettings) => {
  const finalPick = settings.teams * rosterRounds(settings);
  for (let pick = overall + 1; pick <= finalPick; pick += 1) if (teamForPick(pick, settings.teams) === team) return pick;
  return null;
};
const elitePickRecommendation = (player: DraftPlayer, settings: DraftSettings, userPicks: Pick[], available: DraftPlayer[], overall: number) => {
  const market = boardOrderValue(player, settings);
  const nextPick = nextPickForTeam(overall, settings.slot, settings);
  const counts = userPicks.reduce<Record<string, number>>((values, pick) => {
    values[pick.position] = (values[pick.position] ?? 0) + 1;
    return values;
  }, {});
  const targets: Record<string, number> = {
    QB: settings.roster.QB + settings.roster.SUPERFLEX,
    RB: settings.roster.RB + Math.ceil(settings.roster.FLEX * .4),
    WR: settings.roster.WR + Math.ceil(settings.roster.FLEX * .45),
    TE: settings.roster.TE,
  };
  const need = Math.max(0, (targets[player.position] ?? 0) - (counts[player.position] ?? 0));
  const value = Math.round((overall - market) * 10) / 10;
  const playersBeforeNextPick = nextPick == null ? 0 : Math.max(0, nextPick - overall - 1);
  const samePositionBeforeNextPick = available.filter((candidate) => candidate.position === player.position && boardOrderValue(candidate, settings) <= (nextPick ?? overall + settings.teams)).length;
  const scarcity = samePositionBeforeNextPick <= Math.max(2, Math.ceil(playersBeforeNextPick / settings.teams));
  const unlikelyToReturn = nextPick != null && market < nextPick - 2;
  let formatBoost = 0;
  if (settings.lineup === "Superflex" && player.position === "QB") formatBoost += 16;
  if (settings.scoring === "TE Premium" && player.position === "TE") formatBoost += 13;
  if (settings.scoring === "Full PPR" && player.position === "WR") formatBoost += 5;
  const score = 180 - market + Math.max(-12, value * 2.2) + need * 14 + (scarcity ? 8 : 0) + formatBoost;
  const reason = value >= 5 ? `${value.toFixed(1)} picks past market value` : need > 0 ? `Fills your remaining ${player.position} need` : scarcity ? `${player.position} tier is thinning before your next turn` : "Best blend of market value and roster fit";
  const signal = unlikelyToReturn ? "UNLIKELY TO RETURN" : scarcity ? "POSITION RUN RISK" : value > 0 ? `VALUE +${value.toFixed(1)}` : "BEST FIT";
  const rosterFit = Math.max(35, Math.min(98, 48 + need * 17 + formatBoost));
  const availabilityRisk = Math.max(20, Math.min(99, nextPick == null ? 45 : 100 - ((market - overall) / Math.max(1, nextPick - overall)) * 55));
  const consideration = Math.round(Math.max(38, Math.min(97,
    rosterFit * .44 + availabilityRisk * .34 + Math.max(30, Math.min(98, 58 + value * 3)) * .22 + (scarcity ? 6 : 0),
  )));
  return { player, score, reason, signal, rosterFit: Math.round(rosterFit), availabilityRisk: Math.round(availabilityRisk), consideration };
};
const cpuScore = (player: DraftPlayer, profile: CpuProfile, teamPicks: Pick[], overall: number, settings: DraftSettings) => {
  if (!canRosterPlayer(settings, teamPicks, player.position)) return -1_000;
  const round = Math.ceil(overall / settings.teams);
  const counts = teamPicks.reduce<Record<string, number>>((map, pick) => { map[pick.position] = (map[pick.position] || 0) + 1; return map; }, {});
  const quarterbackStarters = settings.roster.QB + settings.roster.SUPERFLEX;
  const multiQuarterback = quarterbackStarters >= 2 || settings.lineup === "Superflex";
  const market = blendedAdp(player, profile, settings);
  let score = 260 - market;
  const elite = market <= (player.position === "QB" ? (settings.lineup === "Superflex" ? 34 : 45) : player.position === "TE" ? 38 : 28);
  if (profile.strategy === "volume" && player.position === profile.position) score += round <= 6 ? 12 : 7;
  if (profile.strategy === "elite" && player.position === profile.position && elite && !counts[player.position]) score += 18;
  if (profile.strategy === "zero-rb" && player.position === "RB") score += round <= 5 ? -42 : 20;
  if (profile.strategy === "hero-rb") {
    if (player.position === "RB" && !counts.RB && round <= 3) score += 34;
    if (player.position === "RB" && counts.RB) score += round <= 7 ? -28 : 4;
    if (player.position === "WR" && counts.RB) score += 15;
  }
  if (multiQuarterback && player.position === "QB") score += counts.QB < quarterbackStarters ? 42 : round <= 5 ? -24 : 0;
  if (settings.lineup === "1QB" && player.position === "QB") {
    if (counts.QB >= 1 && round <= 9) score -= 105;
    else if (!elite && round <= 4) score -= 18;
  }
  if (player.position === "TE") {
    if (settings.scoring === "TE Premium") score += counts.TE < 2 ? 20 : -6;
    else if (counts.TE >= 1 && round <= 10) score -= 82;
    else if (!elite && round <= 5) score -= 30;
  }
  if ((player.position === "RB" || player.position === "WR") && counts[player.position] < 3) score += 5;
  const reach = market - overall;
  const reachAllowance = settings.cpu === "Competitive" ? 5 : settings.cpu === "Chaotic" ? 12 : 8;
  const reachPenalty = settings.cpu === "Competitive" ? 4 : settings.cpu === "Chaotic" ? 3 : 3.4;
  if (reach > reachAllowance) score -= (reach - reachAllowance) * reachPenalty;
  if (settings.cpu === "Competitive") {
    const marketScore = 260 - market;
    score = marketScore + (score - marketScore) * .3;
    if (settings.lineup === "1QB" && counts.QB >= 1 && round <= 10 && player.position === "QB") score -= 120;
    if (settings.scoring !== "TE Premium" && counts.TE >= 1 && round <= 10 && player.position === "TE") return -1_000;
    if (round >= 6 && (player.position === "RB" || player.position === "WR") && (counts[player.position] || 0) < 2) score += 14;
    if (multiQuarterback && round >= 5 && player.position === "QB" && (counts.QB || 0) < quarterbackStarters) score += 18;
  }
  // Preserve format urgency after Competitive mode tightens personality-based
  // adjustments. Starting quarterbacks should follow their Superflex market,
  // especially before a CPU has filled every QB-eligible starting slot.
  if (multiQuarterback && player.position === "QB" && (counts.QB || 0) < quarterbackStarters) {
    score += Math.max(20, 52 - round * 4);
  }
  const volatility = settings.cpu === "Competitive" ? 2 : settings.cpu === "Chaotic" ? 22 : 6;
  return score + (Math.random() - .5) * volatility * profile.risk;
};

export default function DraftDashboard({ players, leagueContext, draftSlot, isPro, isElite, onUpgrade }: { players: DraftPlayer[]; leagueContext: LeagueDraftContext | null; draftSlot?: string; isPro: boolean; isElite: boolean; onUpgrade: () => void }) {
  const [settings, setSettings] = useState(() => {
    const initialSettings = settingsForLeague(leagueContext, draftSlot);
    return isPro ? initialSettings : { ...initialSettings, roster: { ...initialSettings.roster, BENCH: 4 } };
  });
  const [started, setStarted] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [showSetup, setShowSetup] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<"players" | "roster" | "queue" | "intelligence">("players");
  const [queue, setQueue] = useState<string[]>([]);
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
  const [cpuProfiles, setCpuProfiles] = useState<Record<number, CpuProfile>>({});
  const [fallbackPlayers, setFallbackPlayers] = useState<DraftPlayer[]>([]);
  const draftBoardScrollRef = useRef<HTMLDivElement>(null);
  const sheetDragStart = useRef<{ y: number; snap: "peek" | "half" | "full" } | null>(null);
  const sheetWasDragged = useRef(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/draft-player-pool")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Draft player pool unavailable")))
      .then((data: { players?: DraftPlayer[] }) => { if (active) setFallbackPlayers(data.players ?? []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const pool = useMemo(() => {
    const merged = new Map<string, DraftPlayer>();
    for (const player of fallbackPlayers) merged.set(player.id, player);
    for (const player of players) merged.set(player.id, { ...merged.get(player.id), ...player });
    const source = merged.size ? [...merged.values()] : demoPlayers;
    return source.map((player, index) => ({ ...player, overallRank: player.overallRank ?? index + 1 })).sort((a,b) => boardOrderValue(a, settings) - boardOrderValue(b, settings));
  }, [fallbackPlayers, players, settings]);
  const drafted = useMemo(() => new Set(picks.map((pick) => pick.id)), [picks]);
  const available = useMemo(() => pool.filter((player) => !drafted.has(player.id)), [pool, drafted]);
  const overall = picks.length + 1;
  const currentTeam = teamForPick(overall, settings.teams);
  const userTurn = started && currentTeam === settings.slot;
  const rounds = rosterRounds(settings);
  const complete = started && (picks.length >= settings.teams * rounds || !available.length);
  const userPicks = picks.filter((pick) => pick.user);
  const userRosterSlots = rosterSlots(settings, userPicks);
  const recommendation = available
    .filter((player) => canRosterPlayer(settings, userPicks, player.position))
    .map((player) => elitePickRecommendation(player, settings, userPicks, available, overall))
    .sort((a,b) => b.score - a.score)
    .slice(0,3);

  useEffect(() => {
    if (!started) return;
    const frame = window.requestAnimationFrame(() => {
      const container = draftBoardScrollRef.current;
      const currentIndex = Math.min(picks.length, settings.teams * rounds - 1);
      const currentPick = container?.querySelector<HTMLElement>(`[data-draft-index="${currentIndex}"]`);
      if (!container || !currentPick) return;
      const containerRect = container.getBoundingClientRect();
      const pickRect = currentPick.getBoundingClientRect();
      const pickLeft = container.scrollLeft + pickRect.left - containerRect.left;
      const pickTop = container.scrollTop + pickRect.top - containerRect.top;
      const isMobile = window.matchMedia("(max-width: 560px)").matches;
      const verticalContext = currentPick.offsetHeight * (isMobile ? 0.45 : 1.1);
      const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTo({
        left: Math.min(maxLeft, Math.max(0, pickLeft - (container.clientWidth - currentPick.offsetWidth) / 2)),
        top: Math.min(maxTop, Math.max(0, pickTop - verticalContext)),
        // CPU picks arrive faster than a smooth-scroll animation can finish on
        // mobile WebViews. An immediate move reliably follows every pick.
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [picks.length, rounds, settings.teams, started]);

  const draft = (player: DraftPlayer) => {
    if (complete || drafted.has(player.id)) return;
    const nextOverall = picks.length + 1;
    const team = teamForPick(nextOverall, settings.teams);
    const teamPicks = picks.filter((pick) => pick.draftTeam === team);
    if (!canRosterPlayer(settings, teamPicks, player.position)) return;
    setPicks((current) => [...current, { ...player, overall: nextOverall, round: Math.ceil(nextOverall / settings.teams), draftTeam: team, user: team === settings.slot }]);
  };

  useEffect(() => {
    if (!started || complete || userTurn || !available.length) return;
    const delay = settings.cpu === "Chaotic" ? 420 : settings.cpu === "Competitive" ? 220 : 280;
    const timer = window.setTimeout(() => {
      const profile = cpuProfiles[currentTeam];
      const teamPicks = picks.filter((pick) => pick.draftTeam === currentTeam);
      const choice = profile
        ? available.map((player) => ({ player, score: cpuScore(player, profile, teamPicks, overall, settings) })).sort((a, b) => b.score - a.score)[0]?.player
        : available[0];
      if (choice) setPicks((current) => {
        const nextOverall = current.length + 1;
        const team = teamForPick(nextOverall, settings.teams);
        return [...current, { ...choice, overall: nextOverall, round: Math.ceil(nextOverall / settings.teams), draftTeam: team, user: team === settings.slot }];
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [available, complete, cpuProfiles, currentTeam, overall, picks, settings, started, userTurn]);

  const start = () => { setPicks([]); setQueue([]); setCpuProfiles(createCpuProfiles(settings.teams, settings.slot)); setStarted(true); setShowSetup(false); setWorkspaceTab("players"); setSheetSnap("half"); };
  const setRosterCount = (position: keyof RosterConfig, count: number) => setSettings((current) => ({ ...current, lineup: position === "SUPERFLEX" ? (count > 0 ? "Superflex" : "1QB") : current.lineup, roster: { ...current.roster, [position]: count } }));
  const filtered = available.filter((player) => (position === "ALL" || player.position === position) && player.name.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  const queuedPlayers = queue.map((id) => available.find((player) => player.id === id)).filter((player): player is DraftPlayer => Boolean(player));
  const toggleQueue = (player: DraftPlayer) => setQueue((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id]);
  const cycleSheet = () => setSheetSnap((current) => current === "peek" ? "half" : current === "half" ? "full" : "peek");
  const endSheetDrag = (clientY: number) => {
    const startPoint = sheetDragStart.current;
    if (!startPoint) return;
    const delta = clientY - startPoint.y;
    sheetWasDragged.current = Math.abs(delta) > 44;
    if (sheetWasDragged.current) setSheetSnap(delta < 0 ? "full" : startPoint.snap === "full" ? "half" : "peek");
    sheetDragStart.current = null;
  };
  const draftAnalysis = (() => {
    const pickValues = userPicks.map((pick) => ({ pick, value: pick.overall - (pick.overallRank ?? pick.overall) }));
    const averageValue = pickValues.reduce((sum, item) => sum + item.value, 0) / Math.max(1, pickValues.length);
    const reaches = pickValues.filter((item) => item.value <= -8).sort((a, b) => a.value - b.value);
    const values = pickValues.filter((item) => item.value >= 6).sort((a, b) => b.value - a.value);
    const requiredCore = settings.roster.QB + settings.roster.RB + settings.roster.WR + settings.roster.TE;
    const filledCore = (["QB", "RB", "WR", "TE"] as const).reduce((sum, rosterPosition) => sum + Math.min(settings.roster[rosterPosition], userPicks.filter((pick) => pick.position === rosterPosition).length), 0);
    const constructionScore = requiredCore ? filledCore / requiredCore : 1;
    const score = Math.max(55, Math.min(98, Math.round(82 + averageValue * .7 + (constructionScore - .8) * 20 - Math.max(0, reaches.length - 2) * 2)));
    const positionGrades = (["QB", "RB", "WR", "TE"] as const).map((rosterPosition) => {
      const positionPicks = pickValues.filter(({ pick }) => pick.position === rosterPosition);
      const starters = settings.roster[rosterPosition];
      const positionValue = positionPicks.reduce((sum, item) => sum + item.value, 0) / Math.max(1, positionPicks.length);
      const depthTarget = starters + (rosterPosition === "RB" || rosterPosition === "WR" ? 2 : 0);
      const depthAdjustment = Math.min(8, (positionPicks.length - depthTarget) * 3);
      const positionScore = starters > 0 && !positionPicks.length ? 52 : Math.max(55, Math.min(98, Math.round(81 + positionValue * .65 + depthAdjustment)));
      return { position: rosterPosition, count: positionPicks.length, starters, score: positionScore, grade: letterGrade(positionScore), best: positionPicks.sort((a, b) => b.value - a.value)[0] };
    });
    const strongestPosition = [...positionGrades].sort((a, b) => b.score - a.score)[0];
    const weakestPosition = [...positionGrades].filter((item) => item.starters > 0).sort((a, b) => a.score - b.score)[0];
    const firstThree = userPicks.slice(0, 3).map((pick) => pick.position);
    const identity = firstThree.filter((item) => item === "WR").length >= 2 ? "Receiver-led build"
      : firstThree.filter((item) => item === "RB").length >= 2 ? "Backfield-first build"
      : firstThree.some((item) => item === "QB") && settings.lineup === "Superflex" ? "Quarterback-anchored build"
      : "Balanced value build";
    const strengths = [
      values[0] ? `${values[0].pick.name} landed ${values[0].value} spots after the Fantasy Hub rank.` : `${strongestPosition.position} finished as your strongest positional room.`,
      strongestPosition.count > strongestPosition.starters ? `${strongestPosition.position} depth gives the roster flexibility beyond the starting lineup.` : `${strongestPosition.position} carries the best blend of value and starter quality.`,
    ];
    const concerns = [
      reaches[0] ? `${reaches[0].pick.name} was selected ${Math.abs(reaches[0].value)} spots ahead of rank.` : `${weakestPosition.position} has the thinnest margin for injury or role volatility.`,
      `${positionNeed(userPicks)} is the first position to attack differently in the next room.`,
    ];
    const nextPlan = [
      values[0] ? `Keep waiting on values like ${values[0].pick.name}; the board rewarded patience.` : "Create at least one value pocket by waiting through a flat tier.",
      reaches[0] ? `Set a firmer price on ${reaches[0].pick.name} and comparable players to avoid another early reach.` : `Preserve your discipline through the first ${Math.min(5, rounds)} rounds.`,
      `Give ${weakestPosition.position} one additional contingency pick before the final bench round.`,
    ];
    return { score, letter: letterGrade(score), averageValue, reaches, values, positionGrades, strongestPosition, weakestPosition, identity, strengths, concerns, nextPlan };
  })();
  const grade = draftAnalysis.score;

  return <div className="page-content draft-hq-page">
    <section className="draft-hq-hero"><div><span>FANTASY HUB DRAFT HQ</span><h2>Build the roster<br/><em>before Sunday.</em></h2><p>Configure the room, run a complete snake mock, and practice every turn against CPU managers with distinct draft identities.</p><nav><b>{settings.teams} TEAMS</b><b>{settings.lineup.toUpperCase()}</b><b>{settings.scoring.toUpperCase()}</b><b>{settings.format.toUpperCase()}</b></nav></div><div className="draft-clock"><small>{complete ? "DRAFT COMPLETE" : userTurn ? "YOU'RE ON THE CLOCK" : started ? `TEAM ${currentTeam} PICKING` : "ROOM READY"}</small><strong>{started ? `${Math.ceil(overall / settings.teams)}.${String(((overall - 1) % settings.teams) + 1).padStart(2,"0")}` : "--"}</strong></div></section>

    <section className="draft-hq-stats"><article><span>YOUR SLOT</span><strong>{settings.slot}</strong><small>Snake position</small></article><article><span>ROSTER</span><strong>{userPicks.length}</strong><small>of {rounds} picks</small></article><article><span>BEST NEED</span><strong>{positionNeed(userPicks)}</strong><small>Current build</small></article><article><span>DRAFT GRADE</span><strong>{complete ? `${grade}` : "—"}</strong><small>{complete ? `${draftAnalysis.letter} · Final team score` : "Available after the mock"}</small></article></section>

    {!isPro && <div className="draft-inline-gate draft-top-pro-notice"><b>PRO</b><span>Unlock custom roster size, formats, scoring, Superflex controls, and player boards.</span><button onClick={onUpgrade}>View plans</button></div>}

    {!started && <section className="draft-room-launch panel"><div><span>MOCK DRAFT ROOM</span><h3>Your board is ready.</h3><p>Set the room rules, choose your draft slot, and enter when you are ready.</p></div><button className="draft-primary" onClick={() => setShowSetup(true)}>Configure draft <b>⚙</b></button></section>}
    {showSetup && <div className="draft-settings-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&started)setShowSetup(false);}}><section className="draft-setup draft-settings-dialog panel" role="dialog" aria-modal="true" aria-label="Draft settings"><header><div><span>ROOM SETTINGS</span><h3>Make this mock yours.</h3></div><div className="draft-setup-actions">{started&&<button type="button" aria-label="Close draft settings" onClick={() => setShowSetup(false)}>Close</button>}<button className="draft-primary" onClick={start}>{started ? "Restart Mock Draft" : "Start Mock Draft"} <b>→</b></button></div></header><div className="draft-settings-grid">
      <label>Teams<select value={settings.teams} onChange={(event) => setSettings({...settings, teams:Number(event.target.value), slot:Math.min(settings.slot,Number(event.target.value))})}>{Array.from({length:15},(_,index)=>index+2).map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>Draft slot<select value={settings.slot} onChange={(event) => setSettings({...settings, slot:Number(event.target.value)})}>{Array.from({length:settings.teams},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>
      <label>Format<select disabled={!isPro} value={settings.format} onChange={(event) => setSettings({...settings, format:event.target.value as DraftSettings["format"]})}>{["Redraft","Keeper","Dynasty"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>QB format<select disabled={!isPro} value={settings.lineup} onChange={(event) => { const lineup = event.target.value as DraftSettings["lineup"]; setSettings({...settings, lineup, roster:{...settings.roster, SUPERFLEX:lineup === "Superflex" ? Math.max(1,settings.roster.SUPERFLEX) : 0}}); }}>{["1QB","Superflex"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>Scoring<select disabled={!isPro} value={settings.scoring} onChange={(event) => setSettings({...settings, scoring:event.target.value as DraftSettings["scoring"]})}>{["Standard","Half PPR","Full PPR","TE Premium"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>CPU behavior<select disabled={!isElite} value={settings.cpu} onChange={(event) => setSettings({...settings, cpu:event.target.value as DraftSettings["cpu"]})}>{["Balanced","Competitive","Chaotic"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>Player board<select disabled={!isPro} value={settings.boardOrder} onChange={(event) => setSettings({...settings, boardOrder:event.target.value as BoardOrder})}>{["Fantasy Hub Rankings","Consensus ADP","Underdog ADP","Sleeper ADP","ESPN ADP"].map((value)=><option key={value}>{value}</option>)}</select></label>
    </div><section className={`draft-roster-builder ${!isPro ? "gated" : ""}`}><header><div><span>ROSTER SIZE</span><h4>Build your lineup.</h4></div><div><b>{rounds} ROUNDS</b><small>{settings.roster.SUPERFLEX > 0 ? `Includes ${settings.roster.SUPERFLEX} Superflex spot${settings.roster.SUPERFLEX === 1 ? "" : "s"}` : settings.roster.QB > 1 ? `${settings.roster.QB}-QB roster` : "Single-QB roster"}</small></div></header><div>{(["QB","RB","WR","TE","FLEX","SUPERFLEX","BENCH"] as const).map((rosterPosition)=><label key={rosterPosition}><span><b>{rosterPosition === "BENCH" ? "Bench" : rosterPosition === "SUPERFLEX" ? "Superflex" : rosterPosition}</b><small>{rosterPosition === "FLEX" ? "RB / WR / TE" : rosterPosition === "SUPERFLEX" ? "QB / RB / WR / TE" : rosterPosition === "BENCH" ? "Any position" : `${rosterPosition} starters`}</small></span><select disabled={!isPro} value={settings.roster[rosterPosition]} onChange={(event)=>setRosterCount(rosterPosition,Number(event.target.value))}>{Array.from({length:rosterPosition==="QB"?2:rosterPosition==="BENCH"?13:5},(_,index)=>rosterPosition==="QB"?index+1:index).map((value)=><option key={value}>{value}</option>)}</select></label>)}</div></section><footer><small>{players.length ? "Using your league-adjusted rankings and historical player data" : fallbackPlayers.length ? "Using the Fantasy Hub player pool with prior-season production" : "Loading the Fantasy Hub player pool"}</small></footer></section></div>}

    {started && <div className="draft-room-layout draft-board-only">
      <section className="draft-board panel"><header><div><span>LIVE DRAFT BOARD</span><h3>{complete ? "Mock complete" : userTurn ? "Make your pick" : `Round ${Math.ceil(overall/settings.teams)} in progress`}</h3></div><div className="draft-board-actions"><button onClick={() => setShowSetup(true)}>⚙ Settings</button><button onClick={() => { setStarted(false); setShowSetup(true); }}>Exit</button></div></header><div className="draft-board-scroll" ref={draftBoardScrollRef}><div className="draft-board-grid" style={{"--draft-teams":settings.teams} as CSSProperties}>{Array.from({length:settings.teams * rounds},(_,index)=>{const pick=picks[index];const round=Math.ceil((index+1)/settings.teams);const team=teamForPick(index+1,settings.teams);return <article key={index} data-draft-index={index} style={{gridColumn:team,gridRow:round}} className={`${team===settings.slot?"user-team":""} ${pick?`pos-${pick.position.toLowerCase()}`:""}`}><small>{round}.{String(((index)%settings.teams)+1).padStart(2,"0")}</small>{pick?<><b>{pick.name}</b><span>{pick.position} · {pick.team}</span></>:<em>Team {team}</em>}</article>})}</div></div></section>
    </div>}

    {started && !complete && <section className={`draft-workspace-sheet snap-${sheetSnap}`}><button className="draft-sheet-handle" type="button" aria-label={`Draft drawer ${sheetSnap}; tap to resize`} onPointerDown={(event)=>{sheetWasDragged.current=false;sheetDragStart.current={y:event.clientY,snap:sheetSnap};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={(event)=>endSheetDrag(event.clientY)} onPointerCancel={()=>{sheetDragStart.current=null;}} onClick={()=>{if(!sheetWasDragged.current)cycleSheet();sheetWasDragged.current=false;}}><i/><span>{sheetSnap === "peek" ? "Swipe up to open draft tools" : "Swipe down to see more board"}</span></button><nav className="draft-workspace-tabs" role="tablist" aria-label="Draft workspace">{([{id:"players",label:"Players",count:available.length},{id:"queue",label:"Queue",count:queuedPlayers.length},{id:"roster",label:"Roster",count:userPicks.length},{id:"intelligence",label:"Pick Intel",count:recommendation.length}] as const).map((tab)=><button type="button" key={tab.id} role="tab" aria-selected={workspaceTab===tab.id} className={workspaceTab===tab.id?"active":""} onClick={()=>{setWorkspaceTab(tab.id);if(sheetSnap==="peek")setSheetSnap("half");}}><span>{tab.label}</span><b>{tab.count}</b></button>)}</nav><div className="draft-sheet-content">

    {workspaceTab === "roster" && <section className="draft-roster draft-roster-tab" role="tabpanel"><header><span>YOUR ROSTER</span><b>TEAM {settings.slot} · {userPicks.length}/{rounds}</b></header><div>{userRosterSlots.map((slot)=><article key={slot.id} className={slot.player?"filled":"empty"}><i>{slot.label === "SUPERFLEX" ? "SF" : slot.label === "BENCH" ? "BN" : slot.label}</i><span>{slot.player?<><b>{slot.player.name}</b><small>{slot.player.team} · Pick {slot.player.overall}</small></>:<><b>{slot.label}</b><small>Open roster spot</small></>}</span></article>)}</div></section>}

    {workspaceTab === "queue" && <section className="draft-queue" role="tabpanel"><header><div><span>YOUR QUEUE</span><h3>Players you do not want to lose.</h3></div><small>{queuedPlayers.length} queued</small></header>{queuedPlayers.length?<div>{queuedPlayers.map((player,index)=><article key={player.id}><b>{index+1}</b><span><strong>{player.name}</strong><small>{player.position} · {player.team}</small></span><button type="button" disabled={!userTurn} onClick={()=>draft(player)}>Draft</button><button type="button" aria-label={`Remove ${player.name} from queue`} onClick={()=>toggleQueue(player)}>×</button></article>)}</div>:<p>Add players from the Players tab. They will stay ordered here until drafted or removed.</p>}</section>}

    {workspaceTab === "intelligence" && <section className="draft-intelligence" role="tabpanel"><header><div><span>FANTASY HUB PICK INTELLIGENCE</span><h3>Who deserves your next pick?</h3></div><small>Roster construction + return risk</small></header>{isElite?<div className="draft-intelligence-list">{recommendation.map(({player,reason,signal,consideration,rosterFit,availabilityRisk},index)=><article key={player.id}><div className="intel-score" style={{"--intel-score":`${consideration}%`} as CSSProperties}><strong>{consideration}%</strong><small>CONSIDER</small></div><div><span>#{index+1} · {signal}</span><h4>{player.name}</h4><p>{player.position} · {player.team} — {reason}</p><footer><b>Roster fit {rosterFit}%</b><b>May not return {availabilityRisk}%</b></footer></div><button type="button" disabled={!userTurn} onClick={()=>draft(player)}>Draft</button></article>)}</div>:<div className="draft-elite-gate"><b>ELITE</b><span>Unlock live recommendation percentages based on roster construction, positional availability, format, and market value.</span><button onClick={onUpgrade}>Explore Elite</button></div>}</section>}

    {workspaceTab === "players" && <section className={`draft-player-pool ${mobileStatsOpen ? "mobile-stats-open" : ""}`} role="tabpanel"><header><div><span>AVAILABLE PLAYERS</span><h3>{userTurn ? "Your board is live." : "Scouting the next turn."}</h3><small>Ordered by {settings.boardOrder}</small></div><div><input aria-label="Search available players" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search players"/><div className="draft-position-sort" role="group" aria-label="Filter available players by position">{["ALL","QB","RB","WR","TE"].map((value)=><button type="button" key={value} className={position === value ? "active" : ""} aria-pressed={position === value} onClick={()=>setPosition(value)}>{value}</button>)}</div></div></header><button type="button" className="draft-mobile-stats-toggle" aria-expanded={mobileStatsOpen} onClick={()=>setMobileStatsOpen((open)=>!open)}>{mobileStatsOpen ? "Hide player stats" : "Show player stats"}<b>{mobileStatsOpen ? "−" : "+"}</b></button><div className="draft-player-list">{filtered.map((player,index)=>{const stats=historicalContext(player);const adp=settings.boardOrder === "Fantasy Hub Rankings" ? fantasyHubAdp(player,settings) : displayAdp(player,settings);const eligible=canRosterPlayer(settings,userPicks,player.position);const queued=queue.includes(player.id);return <article className="draft-player-row" key={player.id}><button className="draft-player-main" disabled={!userTurn||!eligible} onClick={()=>draft(player)}><i>#{index+1}</i><span className="draft-player-identity"><b>{player.name}</b><small>{player.team} · {player.position}</small></span><span className="draft-player-history">{stats.map((stat)=><span key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></span>)}</span><span className="draft-player-market"><small>{settings.boardOrder === "Fantasy Hub Rankings" ? "FANTASY HUB RANK" : "CONSENSUS ADP"}</small><b>{adp == null ? "—" : settings.boardOrder === "Fantasy Hub Rankings" ? `#${adp}` : adp.toFixed(1)}</b></span><strong>{!eligible?"FULL":userTurn?"DRAFT":"WATCH"}</strong></button><button className={`draft-queue-toggle ${queued?"queued":""}`} type="button" aria-label={`${queued?"Remove":"Add"} ${player.name} ${queued?"from":"to"} queue`} onClick={()=>toggleQueue(player)}>{queued?"✓":"+"}</button></article>})}</div></section>}
    </div></section>}
    {complete && <section className="draft-results panel"><div className="draft-grade-hero"><div><span>MOCK COMPLETE · FREE GRADE</span><h3>Your roster has an identity.</h3><p>{draftAnalysis.identity}, anchored by {userPicks[0]?.name ?? "your opening pick"}. The score measures draft-slot value and lineup construction.</p></div><div className="draft-grade-score"><strong>{grade}</strong><b>{draftAnalysis.letter}</b><small>OVERALL</small></div></div><div className="draft-results-actions"><button onClick={start}>Run it back</button></div>{isPro?<div className="draft-pro-analysis"><header><div><span>PRO TEAM ANALYSIS</span><h3>The full roster report.</h3></div><b>PRO</b></header><div className="draft-analysis-snapshot"><article><small>BUILD IDENTITY</small><strong>{draftAnalysis.identity}</strong><p>{draftAnalysis.averageValue >= 0 ? "You generally let value reach your slot." : "Your conviction picks came ahead of market value."}</p></article><article><small>BIGGEST EDGE</small><strong>{draftAnalysis.strongestPosition.position} · {draftAnalysis.strongestPosition.grade}</strong><p>{draftAnalysis.strongestPosition.count} players drafted at the position.</p></article><article><small>PRESSURE POINT</small><strong>{draftAnalysis.weakestPosition.position} · {draftAnalysis.weakestPosition.grade}</strong><p>Your first position to reinforce in the next mock.</p></article></div><section className="draft-position-report"><header><span>POSITION REPORT</span><small>Value, depth and starter coverage</small></header><div>{draftAnalysis.positionGrades.map((item)=><article key={item.position}><b>{item.position}</b><strong>{item.grade}</strong><span><i style={{width:`${item.score}%`}}/></span><small>{item.count} drafted · {item.starters} starter{item.starters===1?"":"s"}</small></article>)}</div></section><div className="draft-analysis-columns"><section><header><span>WHAT WORKED</span></header>{draftAnalysis.strengths.map((item,index)=><p key={item}><b>{index+1}</b>{item}</p>)}</section><section><header><span>WHAT TO CLEAN UP</span></header>{draftAnalysis.concerns.map((item,index)=><p key={item}><b>{index+1}</b>{item}</p>)}</section></div><section className="draft-value-board"><header><div><span>VALUE REPORT</span><h4>Where you won—and paid up.</h4></div></header><div><article><small>BEST VALUE</small><strong>{draftAnalysis.values[0]?.pick.name ?? "No major faller"}</strong><p>{draftAnalysis.values[0] ? `Selected ${draftAnalysis.values[0].value} spots after rank at pick ${draftAnalysis.values[0].pick.overall}.` : "Your picks stayed close to market throughout the room."}</p></article><article><small>BIGGEST REACH</small><strong>{draftAnalysis.reaches[0]?.pick.name ?? "No major reach"}</strong><p>{draftAnalysis.reaches[0] ? `Selected ${Math.abs(draftAnalysis.reaches[0].value)} spots before rank at pick ${draftAnalysis.reaches[0].pick.overall}.` : "No selection landed eight or more spots ahead of rank."}</p></article></div></section><section className="draft-next-plan"><header><span>NEXT MOCK PLAN</span><h4>Three adjustments to test.</h4></header><ol>{draftAnalysis.nextPlan.map((item)=><li key={item}>{item}</li>)}</ol></section></div>:<section className="draft-pro-analysis-gate"><div><b>PRO</b><span>FULL POST-DRAFT ANALYSIS</span><h3>See what the score is telling you.</h3><p>Unlock positional grades, roster-construction strengths, value wins, reaches, pressure points, and a personalized three-step plan for your next mock.</p><button onClick={onUpgrade}>Unlock Pro analysis</button></div><aside><span>POSITION REPORT</span>{["QB","RB","WR","TE"].map((item,index)=><i key={item}><b>{item}</b><em style={{width:`${82-index*9}%`}}/></i>)}</aside></section>}</section>}
  </div>;
}

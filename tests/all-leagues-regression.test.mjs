import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("All Leagues loading state only uses component inputs", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function AllLeagues(");
  const end = source.indexOf("function LeagueStories(", start);
  const component = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "AllLeagues component should be present");
  assert.doesNotMatch(component, /useState\(Boolean\(leagueId\)\)/);
  assert.match(
    component,
    /leagues\.length > 0 && cachedScans\.length === 0/,
  );
});

test("All Leagues is presented as Mission Hub", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "All Leagues", displayLabel: "Mission Hub"/);
  assert.match(source, /<span>MISSION HUB<\/span>/);
  assert.match(source, /<h1>\{viewTitle\}<\/h1>/);
  assert.match(source, /Personalize Your Hub/);
  assert.match(source, /!isPro && <b>PRO<\/b>/);
  assert.match(source, /id="hub-appearance"/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("Pro billing navigation lives in Utilities and replaces the simulator shortcut", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /displayLabel: "Manage Plans"[^\n]+group: "Utilities"/);
  assert.match(source, /"League Insights", "Utilities"/);
  assert.match(source, /pro-top-action[^\n]+setView\("Fantasy Hub Pro"\)/);
  assert.doesNotMatch(source, /season-roll" onClick=\{\(\) => setView\("Simulator"\)\}/);
});

test("Manage Leagues lives in Utilities and the mobile rail follows sidebar order", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "Manage Leagues"[^\n]+group: "Utilities"/);
  assert.doesNotMatch(source, /label: "Manage Leagues"[^\n]+group: "Portfolio"/);
  assert.match(source, /const orderedMobileNav = navGroupOrder\.flatMap\(\(group\) =>\s*visibleNav\.filter\(\(item\) => item\.group === group\),\s*\);/);
  assert.match(source, /\{orderedMobileNav\.map\(\(item\) => \(/);
});

test("League storytelling and reporting finish the Utilities section", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "League Stories"[^\n]+group: "Utilities"/);
  assert.match(source, /label: "Manager Report"[^\n]+group: "Utilities"/);
  assert.ok(source.indexOf('label: "League Stories"') < source.indexOf('label: "Manager Report"'));
});

test("Manager Report uses observed Sleeper weekly actions and theme-aware surfaces", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/decisions/route.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(route, /\/matchups\/\$\{week\}/);
  assert.match(route, /\/transactions\/\$\{week\}/);
  assert.match(route, /transaction\.status === "complete"/);
  assert.match(route, /transaction\.type === "waiver" \|\| transaction\.type === "free_agent"/);
  assert.match(route, /transaction\.type === "trade"/);
  assert.match(source, /Your actual week in review/);
  assert.match(source, /className="win-path-description"/);
  assert.match(source, /actualPoints\.toFixed\(1\)/);
  assert.match(styles, /--manager-surface:color-mix\(in srgb,rgb\(var\(--brand-primary-rgb/);
  assert.match(styles, /\.win-path-report>\.win-path-description\{display:block;width:100%/);
  assert.match(source, /className="manager-activity-scroll"/);
  assert.match(styles, /\.manager-activity-scroll\{max-height:213px;overflow-y:auto/);
  assert.match(styles, /\.manager-activity\.manager-trades[^}]+background:linear-gradient\([^}]+--brand-secondary-rgb/);
  assert.match(styles, /\.manager-trades \.manager-activity-scroll>article\{background:color-mix\(in srgb,rgb\(var\(--brand-secondary-rgb/);
  assert.doesNotMatch(source, /activityTime\(move\.timestamp\)/);
});

test("expanded What Do I Need supports six player targets", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /need\.targets\.slice\(0, 6\)/);
});

test("portfolio What Do I Need fills five unique active paths", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /selectedWinPaths\.length === 5/);
  assert.match(source, /selectedPlayerIds\.has\(candidate\.target\.id\)/);
  assert.match(source, /secondaryWinPaths = selectedWinPaths\.slice\(1, 5\)/);
  assert.match(source, /\{selectedWinPaths\.length\} ACTIVE PATH/);
});

test("portfolio Scoreboard exposes a sticky quick-score rail", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /className="portfolio-score-rail"/);
  assert.match(source, /portfolio-matchup-\$\{leagueId\}/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("League Analytics priorities are informational and do not imply broken navigation", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function RedraftAnalytics(");
  const end = source.indexOf("function eligibleForSlot(", start);
  const analytics = source.slice(start, end);

  assert.match(analytics, /className="analytics-route-card"/);
  assert.doesNotMatch(analytics, /onNavigate\("Start \/ Sit"\)/);
  assert.doesNotMatch(analytics, /onNavigate\("Waiver Wire"\)/);
  assert.doesNotMatch(analytics, /onNavigate\(priority\.view\)/);
  assert.doesNotMatch(analytics, /Open Start\/Sit →/);
  assert.doesNotMatch(analytics, /Open \{priority\.view\} →/);
  assert.match(analytics, /view: "Trade Lab" as View/);
  assert.match(analytics, /view: "Player Rankings" as View/);
});

test("Dynasty window score explains its 100-point scale and weighted inputs", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /DYNASTY WINDOW SCORE/);
  assert.match(source, /Math\.round\(baseStrength\).*<i>\/100<\/i>/);
  assert.match(source, /WHY YOUR SCORE IS \{Math\.round\(baseStrength\)\} \/ 100/);
  assert.match(source, /Starters<\/span><small>58% of score/);
  assert.match(source, /Depth<\/span><small>16% of score/);
  assert.match(source, /Core runway<\/span><small>18% of score/);
  assert.match(source, /Draft capital<\/span><small>8% of score/);
  assert.match(source, /Build &lt;58/);
  assert.match(source, /Title 78\+/);
});

test("Dynasty asset allocation expands into position-specific assets", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /expandedAssetPosition/);
  assert.match(source, /className="asset-allocation-toggle"/);
  assert.match(source, /aria-controls=\{`asset-room-\$\{position\.toLowerCase\(\)\}`\}/);
  assert.match(source, /className="asset-position-roster"/);
  assert.match(source, /player\.positionRank/);
  assert.match(source, /setSelectedPlayer\(player\)/);
});

test("Team Rankings calibrate roster strength without draft-hoard distortion", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function TeamRankings(");
  const end = source.indexOf("function PlayerRanks(", start);
  const rankings = source.slice(start, end);

  assert.match(rankings, /position === "QB" \? superflexSlots : 0/);
  assert.match(rankings, /balanceScore/);
  assert.match(rankings, /runwayScore/);
  assert.match(rankings, /medianDraftScore/);
  assert.match(source, /const leagueRelativeGrade/);
  assert.match(source, /72 \+ \(\(value - mean\) \/ deviation\) \* 12/);
  assert.match(source, /windowStarterScores/);
  assert.match(source, /leagueRelativeGrade\(team\.starterScore, windowStarterScores\)/);
  assert.match(source, /const score = year === 0 \? baseStrength/);
  assert.match(source, /currentProjectedStarterValue/);
  assert.match(rankings, /starterScore \* \.52/);
  assert.match(rankings, /depthScore \* \.14/);
  assert.match(rankings, /balanceScore \* \.16/);
  assert.match(rankings, /runwayScore \* \.10/);
  assert.match(rankings, /draftValue \* \.08/);
  assert.match(rankings, /className="team-rating-breakdown"/);
  assert.doesNotMatch(rankings, /draftScore \/ maxDraftScore/);
});

test("portfolio Scoreboard opens both Matchups and league scoreboards", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /onOpenMatchups=\{async \(league, matchupId\)/);
  assert.match(source, />Open Matchups<\/button>/);
  assert.match(source, />League scoreboard →<\/button>/);
});

test("mobile navigation provides a sticky badge rail and accessible menu drawer", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="nav-label"/);
  assert.match(source, /className="platform-open-copy"/);
  assert.match(source, /Open ESPN/);
  assert.match(source, /Open Sleeper/);
  assert.match(source, /className="mobile-menu-toggle"/);
  assert.match(source, /aria-controls="primary-sidebar"/);
  assert.match(source, /className="mobile-nav-strip"/);
  assert.match(source, /className="mobile-rail-theme"/);
  assert.match(source, /className="account-theme-customizer"/);
  assert.match(source, /className="account-theme-customizer"/);
  assert.match(source, /<strong>Theme Customizer<\/strong>/);
  assert.match(source, /className="mobile-drawer-backdrop"/);
  assert.match(styles, /\.mobile-header-stack\{position:sticky/);
  assert.match(styles, /\.mobile-nav-open \.sidebar\{transform:translateX\(0\)\}/);
  assert.match(styles, /\.sidebar \.sidebar-bottom[^}]*position:static/);
});

test("Start Sit separates position and matchup badges", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.start-sit-option \.compare-card>\.matchup-team\{margin-top:12px\}/);
});

test("Full Action Queue badges use stable priority colors", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /action-priority-\$\{priority\.toLowerCase\(\)\.replaceAll\(" ", "-"\)\}/);
  for (const priority of ["act-now", "before-kickoff", "tonight", "this-week", "monitor"]) {
    assert.match(styles, new RegExp(`action-priority-${priority}\\{--queue-accent:`));
  }
  assert.match(styles, /header b\{color:#fff!important;background:var\(--queue-accent/);
  assert.match(styles, /button>i\{color:var\(--queue-ink/);
  assert.match(styles, /button>em\{color:var\(--queue-ink/);
});

test("mobile platform actions use prompt-free verified web links", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /https:\/\/sleeper\.com\/leagues\/\$\{encodeURIComponent\(leagueId\)\}\/team/);
  assert.match(source, /https:\/\/fantasy\.espn\.com\/football\/league\?leagueId=/);
  assert.match(source, /openPlatformLeagueOnMobile\(event, selectedConnectedLeague/);
  assert.match(source, /openPlatformLeagueOnMobile\(event, scan\.league\)/);
  assert.doesNotMatch(source, /sleeper:\/\//);
  assert.doesNotMatch(source, /setTimeout\([\s\S]{0,300}fallbackUrl/);
});

test("mobile My Team roster fits without horizontal scrolling", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.roster-section \.table-panel\{overflow-x:hidden/);
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) 48px 44px;grid-template-areas:"player slot projection" "matchup matchup status"/);
  assert.match(styles, /grid-template-columns:32px minmax\(0,1fr\)/);
  assert.match(styles, /\.roster-section \.roster-temperature\{display:none\}/);
  assert.match(styles, /\.sidebar nav,\.sidebar-collapsed \.sidebar nav\{padding-right:0;padding-left:0\}/);
});

test("pre-kickoff visuals are centralized and removable", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const fixtures = await readFile(new URL("../app/pre-kickoff-visuals.ts", import.meta.url), "utf8");
  assert.match(fixtures, /PRE_KICKOFF_VISUALS_ENABLED = true/);
  assert.match(fixtures, /Set this one flag to false/);
  assert.match(source, /data-visual-source=/);
  assert.match(source, /PRE_KICKOFF_VISUALS\.performerLines/);
  assert.match(source, /players\s*\.filter\(\(player\) => gameTeamCodes\.includes/);
  assert.doesNotMatch(source, />TEST MODE</);
  assert.doesNotMatch(source, /· DEMO</);
  assert.doesNotMatch(source, /NO DEMO LEAGUE DATA/);
});

test("portfolio Scoreboard keeps matchup status in scope", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function AllLeagueScoreboard(");
  const end = source.indexOf("function Scoreboard(", start);
  const component = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "AllLeagueScoreboard component should be present");
  assert.doesNotMatch(
    component,
    /\.filter\(\(player\) => item\.status/,
  );
  assert.match(component, /matchup\.status === "final"/);
  assert.match(component, /affectedLeagues/);
  assert.match(component, /leagueName: item\.league\.name/);
  assert.match(component, /ROOT FOR/);
  assert.match(component, /ROOT AGAINST/);
  assert.match(component, /Projected swing paths/);
  assert.match(component, /Live plays replace these paths automatically/);
});

test("NFL game impact details open in an accessible popout", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /isExpanded \? "is-expanded"/);
  assert.match(source, /YOUR TEAM/);
  assert.match(source, /OPPONENT/);
  assert.match(source, /sidePlayers\.map/);
  assert.match(source, /"Open matchup details"/);
  assert.match(source, /impact-roster-expanded/);
  assert.match(source, /game-impact-popout/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});

test("NFL Game Hub prefers ESPN live scores and falls back to the imported schedule", async () => {
  const [source, route] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/nfl-games/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/);
  assert.match(route, /const fallbackSchedule = espnGames\.length === 0/);
  assert.match(route, /scoresAvailable: !fallbackSchedule/);
  const start = source.indexOf("function NflGames(");
  const end = source.indexOf("const dynastyCurves", start);
  const component = source.slice(start, end);
  assert.match(component, /startVisiblePolling\(refresh\)/);
  assert.match(component, /stopPolling\(\)/);
});

test("player popouts retain connected-platform projections across page models", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function PlayerPanel(");
  const component = source.slice(start);

  assert.ok(start >= 0, "PlayerPanel component should be present");
  assert.match(
    component,
    /typeof player\.leagueProjection === "number"[\s\S]*?Number\.isFinite\(player\.projection\)/,
  );
  assert.match(component, /platformProjection\.toFixed\(1\)/);
});

test("player game logs pin the Week column while stats scroll", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /<th className="game-log-week" scope="col">WK<\/th>/);
  assert.match(source, /<td className="game-log-week">/);
  assert.match(styles, /\.game-log-scroll \.game-log-week\{position:sticky;left:0/);
});

test("My Team player identities align as a badge and stacked copy block", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /<td className="roster-player-cell">/);
  assert.match(source, /<span className="roster-player-copy">/);
  assert.match(styles, /\.roster-section td\.roster-player-cell\{display:grid;grid-template-columns:35px minmax\(0,1fr\)/);
});

test("Rams matchup strength uses the shared LAR code", async () => {
  const dashboard = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const matchupModel = await readFile(new URL("../app/matchup-strength.ts", import.meta.url), "utf8");

  assert.match(dashboard, /JAC: "JAX", WSH: "WAS", LA: "LAR"/);
  assert.match(dashboard, /normalizeNflTeam\(opponent\.replace/);
  assert.match(matchupModel, /JAC: "JAX", WSH: "WAS", LA: "LAR"/);
  assert.match(matchupModel, /const team = normalizeTeam\(cells\[column\("opponent_team"\)\]\)/);
});

test("Command Center uses live league context instead of placeholder metrics", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function CommandCenter(");
  const end = source.indexOf("function MyTeam(", start);
  const component = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "CommandCenter component should be present");
  assert.doesNotMatch(component, /value="64%"|value="3rd"|value="72%"|value="86"/);
  assert.match(component, /opponentTeam/);
  assert.match(component, /winProbability/);
  assert.match(component, /healthScore/);
  assert.match(component, /command-action-queue/);
  assert.match(component, /command-position-edges/);
  assert.match(component, /command-availability/);
  assert.match(component, /command-bench-cost/);
  assert.match(component, /command-trends/);
  assert.match(component, /command-quick-actions/);
});

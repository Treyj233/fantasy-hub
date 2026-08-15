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
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /label: "All Leagues", displayLabel: "Mission Hub"/);
  assert.match(source, /<span>MISSION HUB<\/span>/);
  assert.match(source, /<h1>\{viewTitle\}<\/h1>/);
  assert.match(source, /Personalize Your Hub/);
  assert.match(source, /!isPro && <b>PRO<\/b>/);
  assert.match(source, /id="hub-appearance"/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source, /`\$\{biggestProjection\.league\.name\} · \$\{biggestProjection\.projection\.toFixed\(1\)\} projected points`/);
  assert.match(styles, /\.all-leagues-page :is\(\.health-list,\.portfolio-matchups,\.exposure-list,\.waiver-opportunity-list\)\{max-height:220px;[^}]*overflow-y:auto/);
  assert.match(styles, /\.all-leagues-page \.action-queue-groups>section\{max-height:350px;[^}]*overflow-y:auto/);
  assert.match(styles, /\.all-leagues-page \.action-queue-groups>section>header\{position:sticky/);
});

test("post-sign-in personalization stays inside the iPhone safe area", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.onboarding-shell\{box-sizing:border-box;min-height:100vh;min-height:100svh/);
  assert.match(styles, /\.onboarding-shell\{place-items:start center;padding:max\(54px,calc\(env\(safe-area-inset-top\) \+ 14px\)\)/);
  assert.match(styles, /html\[data-native-platform="ios"\] \.onboarding-shell\{padding-top:max\(64px,calc\(env\(safe-area-inset-top\) \+ 22px\)\)\}/);
});

test("new accounts start in light mode without changing saved account preferences", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(data\.preferences\) \{[\s\S]*?setTheme\(data\.preferences\.colorMode\)/);
  assert.match(source, /\} else \{\s*setTheme\("light"\);\s*window\.localStorage\.setItem\("fantasy-hub-theme", "light"\);\s*setNeedsOnboarding\(true\)/);
});

test("Pro billing navigation lives in Utilities and replaces the simulator shortcut", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /displayLabel: "Manage Plans"[^\n]+group: "Utilities"/);
  assert.match(source, /"Analyze League", "Utilities"/);
  assert.match(source, /pro-top-action[^\n]+setView\("Fantasy Hub Pro"\)/);
  assert.doesNotMatch(source, /season-roll" onClick=\{\(\) => setView\("Simulator"\)\}/);
});

test("Manage Leagues lives in Utilities and the mobile tray uses five categories", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /label: "Manage Leagues"[^\n]+group: "Utilities"/);
  assert.doesNotMatch(source, /label: "Manage Leagues"[^\n]+group: "Portfolio"/);
  assert.match(source, /const mobileCategoryNav:[\s\S]*?"Home"[\s\S]*?"Game Day"[\s\S]*?"Manage Team"[\s\S]*?"Analyze League"[\s\S]*?"Utilities"/);
  assert.match(source, /\{mobileCategoryNav\.map\(\(item\) => \{/);
  assert.match(source, /closeCategoryOnOutsidePress[\s\S]*?closest\("\.mobile-category-menu, \.mobile-category-tray"\)[\s\S]*?setMobileCategoryOpen\(null\)/);
  assert.match(source, /closeCategoryOnOutsidePress[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?setMobileCategoryOpen\(null\)/);
  assert.match(source, /addEventListener\("pointerdown", closeCategoryOnOutsidePress, true\)/);
  assert.match(source, /removeEventListener\("pointerdown", closeCategoryOnOutsidePress, true\)/);
  assert.match(styles, /\.mobile-category-tray>button \.nav-badge\{[^}]*width:29px;height:29px[^}]*border-radius:9px/);
  assert.match(styles, /data-badge-theme="minimal"[^}]*\.mobile-category-tray \.nav-badge[^}]*border-radius:50%/);
});

test("normal tool intros use a condensed label-only card", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.equal((source.match(/<SectionIntro\s+compact\s+/g) ?? []).length, 9);
  assert.match(source, /className=\{`section-intro \$\{compact \? "compact" : ""\}`\}/);
  assert.match(source, /\{!compact && <h2>\{title\}<\/h2>\}/);
  assert.match(source, /\{!compact && <p>\{text\}<\/p>\}/);
  assert.match(styles, /\.section-intro\.compact\{[^}]*padding:11px 16px[^}]*border-radius:11px/);
});

test("mobile tool context stays inside the viewport without horizontal overscroll", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.tool-context-bar,\.tool-context-bar\.home-context\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[^}]*overflow:hidden;overscroll-behavior:contain;touch-action:pan-y/);
  assert.match(styles, /\.tool-context-bar>span,\.context-league-button\{min-width:0;padding:7px 5px;scroll-snap-align:none\}/);
  assert.doesNotMatch(styles, /\.tool-context-bar\{[^}]*overflow-x:auto;scroll-snap-type:x mandatory/);
});

test("sidebar FH logo is an accessible Home button", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /<button[\s\S]*?className="brand-logo"[\s\S]*?aria-label="Go to Fantasy Hub home"[\s\S]*?setView\("All Leagues"\)[\s\S]*?setMobileNavOpen\(false\)[\s\S]*?<FHLogo \/>[\s\S]*?<\/button>/);
  assert.match(styles, /\.brand-logo:focus-visible\{outline:3px solid var\(--gold-light\);outline-offset:3px\}/);
});

test("open mobile category menu shields the page behind it", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /mobileCategoryOpen && createPortal\([\s\S]*?className="mobile-category-scrim"[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?setMobileCategoryOpen\(null\)[\s\S]*?document\.body/);
  assert.match(styles, /\.mobile-category-scrim\{position:fixed;z-index:64;inset:0;display:block;[^}]*pointer-events:auto;touch-action:none;overscroll-behavior:contain\}/);
  assert.match(styles, /\.mobile-category-menu\{position:absolute;z-index:3/);
  assert.match(styles, /\.mobile-category-tray\{position:relative;z-index:3/);
});

test("Glossary mirrors the five-category header layout", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const categories = mobileCategoryNav\.map/);
  assert.match(source, /pages: nav\.filter\(\(item\) => item\.group === category\.group\)/);
  assert.match(source, /category\.leadPage\.tone/);
  assert.match(source, /category\.pages\.map\(\(item\) =>/);
  assert.doesNotMatch(source, /const groups: NavGroup\[\] = \["Portfolio", "Team Management", "League Insights", "Live", "Utilities"\]/);
  assert.match(styles, /\.glossary-jump\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test("League Stories uses its own native badge color", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /label: "League Stories", mark: "✎", tone: "story"/);
  assert.match(styles, /\.nav-badge\.story\{background:linear-gradient\(145deg,#f97316,#9333ea\)\}/);
});

test("League Analytics uses the shared dashboard typography", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.dynasty-page :is\(\.dynasty-hero h2,\.panel-header h3,\.window-score strong,\.dynasty-metrics \.metric strong\)\{font-family:var\(--font-geist-sans\),Arial,sans-serif;font-style:normal;font-weight:850\}/);
  assert.match(styles, /\.dynasty-page \.panel-header h3\{[^}]*font-size:16px;letter-spacing:-\.03em;line-height:1\.15/);
  assert.match(styles, /\.dynasty-page \.window-score strong\{font-variant-numeric:tabular-nums;letter-spacing:-\.045em/);
  assert.doesNotMatch(styles, /\.dynasty-page[^\n]*font-family:Impact/);
});

test("extreme Fire and Ice statuses affect their player cards", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /<tr className=\{temperature\.state === "fire" \? "temperature-card-fire" : temperature\.state === "ice" \? "temperature-card-ice"/);
  assert.match(source, /className=\{`head-to-head-player \$\{temperature\.state === "fire" \? "temperature-card-fire" : temperature\.state === "ice" \? "temperature-card-ice"/);
  assert.match(styles, /\.temperature-card-fire\{[^}]*box-shadow:inset 3px 0 #ef493f[^}]*animation:temperature-card-fire/);
  assert.match(styles, /\.temperature-card-ice\{[^}]*box-shadow:inset 3px 0 #49b8ef[^}]*animation:temperature-card-ice/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.temperature-card-fire,\.temperature-card-ice\{animation:none!important\}/);
});

test("Mission Hub is shorter and weekly league boxes start collapsed", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const topActions = prioritizedInbox\.slice\(0, 3\);[\s\S]*?const remainingActions = prioritizedInbox\.slice\(3\)/);
  assert.match(source, /<details[\s\S]*?className=\{`league-scan-card \$\{scan\.status\}`\}[\s\S]*?<summary className="league-scan-summary">/);
  assert.doesNotMatch(source, /<details[^>]*className=\{`league-scan-card[^>]*\sopen[=>]/);
  assert.match(styles, /\.priority-inbox \.portfolio-action-list article\{[^}]*padding:11px 15px/);
  assert.match(styles, /\.league-scan-card\[open\]>summary>i\{transform:rotate\(180deg\)\}/);
});

test("My Leagues exposes live matchup status and opens the Fantasy Scoreboard", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const \[liveMatchupCount, setLiveMatchupCount\] = useState<number \| null>\(null\)/);
  assert.match(source, /\/api\/scoreboard\?leagueId=.*?matchup\?\.status === "Live"/s);
  assert.match(source, /className=\{`league-live-link[\s\S]*?setScoreboardScope\("all"\)[\s\S]*?setView\("Scoreboard"\)/);
  assert.match(source, /liveMatchupCount > 0 \? `\$\{liveMatchupCount\} LIVE` : "NOT LIVE"/);
  assert.match(styles, /\.league-live-link\.live\{[^}]*background:#fff3f2/);
});

test("scoreboard only reports live matchups while ESPN has an NFL game in progress", async () => {
  const source = await readFile(new URL("../app/api/scoreboard/route.ts", import.meta.url), "utf8");
  assert.match(source, /event\.status\?\.type\?\.state === "in"/);
  assert.match(source, /week === currentWeek && nflGameInProgress[\s\S]*?\? "Live"[\s\S]*?: "Scheduled"/);
  assert.match(source, /A missing live scoreboard must never create a false LIVE indicator/);
  assert.doesNotMatch(source, /week === \(league\.leg \?\? week\) \? "Live"/);
});

test("hottest performers explains league help and harm in plain language", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /Helps in \$\{helps === 1 \? "one" : helps\} league/);
  assert.match(source, /Hurts in \$\{hurts === 1 \? "one" : hurts\} league/);
  assert.doesNotMatch(source, /`\$\{helps\} help`/);
  assert.doesNotMatch(source, /`\$\{hurts\} hurt`/);
});

test("mobile Game Day can jump directly to league matchups", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="mobile-matchup-jump"[\s\S]*?onClick=\{scrollToLeagueMatchups\}/);
  assert.match(source, /const scrollToLeagueMatchups = \(\) => \{[\s\S]*?\[150, 450, 900, 1500\][\s\S]*?scrollToTarget\("auto"\)/);
  assert.match(source, /className="portfolio-scoreboard-grid" id="league-matchups"/);
  assert.match(styles, /\.mobile-matchup-jump\{display:none\}/);
  assert.match(styles, /@media\(max-width:700px\)\{[\s\S]*?\.mobile-matchup-jump\{display:flex/);
});

test("League Stories leads Analyze League and Manager Report finishes Manage Team", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "League Stories"[^\n]+group: "Analyze League"/);
  assert.match(source, /label: "Manager Report"[^\n]+group: "Manage Team"/);
  assert.ok(source.indexOf('label: "Manager Report"') > source.indexOf('label: "Simulator"'));
  assert.ok(source.indexOf('label: "League Stories"') < source.indexOf('label: "League Analytics"'));
});

test("League Stories matchup preview is compact and omits the redundant ownership label", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const preview = source.match(/<section className="panel matchup-preview">.*?<\/section>/s)?.[0] ?? "";
  assert.doesNotMatch(preview, /YOUR MATCHUP/);
  assert.match(styles, /\.league-stories-page \.matchup-preview\{padding:14px\}/);
  assert.match(styles, /\.league-stories-page \.matchup-preview article\{gap:8px;padding:9px 0\}/);
});

test("League Stories Trade Wire separates the two teams and their received players", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /<h3>Completed deals<\/h3>/);
  assert.match(source, /className="trade-wire-top"/);
  assert.match(source, /const tradeTeams = trade\.teams\.slice\(0, 2\)/);
  assert.match(source, /className="trade-wire-columns"/);
  assert.match(source, /trade\.adds\.filter\(\(item\) => item\.team === team\)/);
  assert.match(styles, /\.trade-wire-columns\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.league-stories-page \.narrative-timeline article\.win>i\{background:var\(--green\)\}/);
});

test("Draft-Day Expectations opens every draft selection in a safe-area dialog", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/league-story/route.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const \[draftOpen, setDraftOpen\] = useState\(false\)/);
  assert.match(source, /aria-label="All draft selections"/);
  assert.match(source, /\.draftDay\.picks\]\.sort/);
  assert.match(source, /Overall pick \$\{pick\.pick\}/);
  assert.match(route, /picks: myDraftPicks\.map\(/);
  assert.doesNotMatch(route, /picks: myDraftPicks\.slice\(0, 5\)/);
  assert.match(styles, /\.draft-history-backdrop\{position:fixed;inset:0;z-index:120/);
  assert.match(styles, /\.draft-history-backdrop\{place-items:start center;padding:max\(54px,calc\(env\(safe-area-inset-top\) \+ 10px\)\)/);
});

test("Fantasy Scoreboard uses a neutral importance marker instead of a Cowboys-like star", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const primaryPath = source.match(/<div className="primary-win-path">.*?<div className="league-win-paths">/s)?.[0] ?? "";
  assert.match(primaryPath, /<i aria-hidden="true">!<\/i>/);
  assert.doesNotMatch(primaryPath, />★<\/i>/);
});

test("Trade Lab uses a compact page-intro heading", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /title="Evaluate any deal, then let Pro find the best ones"/);
  assert.match(styles, /\.trade-lab-page>\.section-intro h2\{margin:5px 0;font-size:28px/);
  assert.match(styles, /\.trade-lab-page>\.section-intro h2\{font-size:17px/);
});

test("Trade Calculator Clear All leaves both asset packages empty", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/trade-calculator.css", import.meta.url), "utf8");
  assert.match(source, /useState<string\[\] \| null>\(null\)/);
  assert.match(source, /const effectiveSendIds = calculatorSendIds \?\?/);
  assert.match(source, /const clearCalculator = \(\) => \{\s*setCalculatorSendIds\(\[\]\);\s*setCalculatorReceiveIds\(\[\]\);/);
  assert.match(source, />Clear all<\/button>/);
  assert.match(styles, /\.trade-calculator-header-actions>button/);
});

test("Start Sit scoring settings use one compact scrollable row", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.start-sit-page \.start-sit-scoring\{display:flex;flex-wrap:nowrap;gap:4px;[^}]*overflow-x:auto/);
  assert.match(styles, /\.start-sit-page \.start-sit-scoring span\{min-height:24px;padding:3px 7px;font-size:7px/);
  assert.match(styles, /\.start-sit-page \.start-sit-scoring span\{min-height:21px;padding:3px 6px;font-size:6px/);
});

test("Start Sit uses a compact outcome heading", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /title="Choose the outcome your matchup requires"/);
  assert.match(styles, /\.start-sit-page>\.section-intro h2\{margin:4px 0;font-size:27px/);
  assert.match(styles, /\.start-sit-page>\.section-intro h2\{font-size:17px/);
});

test("Start Sit aggressiveness remains sticky during vertical scrolling", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.start-sit-page>\.aggression-panel\{position:-webkit-sticky!important;position:sticky!important;z-index:34;top:12px/);
  assert.match(styles, /\.start-sit-page>\.aggression-panel\{top:100px\}/);
  assert.match(styles, /html\[data-native-platform="ios"\] \.start-sit-page>\.aggression-panel\{top:calc\(100px \+ max\(54px,env\(safe-area-inset-top\)\)\)\}/);
});

test("Full Action Queue previews additional horizontal cards", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="action-queue-scroll-preview"[^>]*><span>Swipe for more<\/span><i>→<\/i>/);
  assert.match(styles, /\.all-leagues-page \.action-queue-groups>section\{flex:0 0 calc\(100% - 24px\);min-width:calc\(100% - 24px\)\}/);
  assert.match(styles, /@keyframes queue-scroll-nudge/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
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
  assert.match(source, /className="completed-trades-card panel"/);
  assert.match(source, /className="completed-trades-list"/);
  assert.match(styles, /\.completed-trades-card\{grid-column:1\/-1[^}]+background-color:var\(--chalk\)!important;background-image:none!important/);
  assert.match(styles, /\.completed-trades-list>article\{[^}]+background-color:var\(--cream\)!important;background-image:none!important/);
  assert.doesNotMatch(source, /activityTime\(move\.timestamp\)/);
  assert.match(styles, /html\[data-theme="dark"\] \.manager-report-page \.completed-trades-card\{background-color:#191c23!important;background-image:none!important/);
  assert.doesNotMatch(source, /ACTIONS OBSERVED/);
  assert.match(styles, /\.manager-report-hero>div\{width:100%;min-width:0\}/);
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

test("mobile navigation preserves the sidebar and opens category pages from the top", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="nav-label"/);
  assert.match(source, /className="platform-open-copy"/);
  assert.match(source, /Open ESPN/);
  assert.match(source, /Open Sleeper/);
  assert.match(source, /className="mobile-menu-toggle"/);
  assert.match(source, /aria-controls="primary-sidebar"/);
  assert.match(source, /className="mobile-category-tray"/);
  assert.match(source, /className="mobile-category-menu"/);
  assert.match(source, /aria-label="Close category menu"/);
  assert.match(source, /lead: "Scoreboard"/);
  assert.match(source, /lead: "Command Center"/);
  assert.match(source, /className=\{`nav-badge \$\{leadPage\.tone\}`\}/);
  assert.match(source, /className=\{`nav-badge \$\{item\.tone\}`\}/);
  assert.match(source, /className="account-theme-customizer"/);
  assert.match(source, /className="account-theme-customizer"/);
  assert.match(source, /<strong>Theme Customizer<\/strong>/);
  assert.match(source, /className="mobile-drawer-backdrop"/);
  assert.match(styles, /\.mobile-header-stack\{position:sticky/);
  assert.match(styles, /\.mobile-category-menu\{position:absolute[^}]*top:100%/);
  assert.doesNotMatch(styles, /\.sidebar,.mobile-drawer-backdrop[^}]*display:none!important/);
  assert.match(styles, /\.mobile-nav-open \.sidebar\{z-index:150!important\}/);
  assert.match(styles, /\.mobile-nav-open \.sidebar\{transform:translateX\(0\)\}/);
  assert.match(styles, /\.sidebar \.sidebar-bottom[^}]*position:static/);
  assert.match(styles, /html\[data-theme="dark"\] \.sidebar \.sidebar-bottom\{background:transparent\}/);
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
  assert.match(source, /Live stats available after kickoff/);
  assert.match(source, /item\.player\.projection \?\? 0/);
  assert.doesNotMatch(fixtures, /yards:|touchdowns:|receptions:|targets:/);
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

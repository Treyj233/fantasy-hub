const hubOrigin = "https://fantasy-hub.treyj233.chatgpt.site";
const extensionApi = globalThis.chrome?.runtime?.id
  ? globalThis.chrome
  : globalThis.browser?.runtime?.id
    ? globalThis.browser
    : null;
const codeInput = document.querySelector("#pairing-code");
const leagueInput = document.querySelector("#league-id");
const seasonInput = document.querySelector("#season");
const teamWrap = document.querySelector("#team-wrap");
const teamSelect = document.querySelector("#team");
const loadButton = document.querySelector("#load");
const syncButton = document.querySelector("#sync");
const statusText = document.querySelector("#status");
let leaguePayload = null;

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = type;
}

function teamName(team) {
  return String(team.name || `${team.location || ""} ${team.nickname || ""}`.trim() || team.abbrev || `Team ${team.id}`);
}

function compactPlayer(player) {
  if (!player) return null;
  return {
    id: player.id,
    fullName: player.fullName,
    defaultPositionId: player.defaultPositionId,
    proTeamId: player.proTeamId,
    injured: player.injured,
    injuryStatus: player.injuryStatus,
    ownership: { percentOwned: player.ownership?.percentOwned },
    stats: (player.stats || []).map((row) => ({ scoringPeriodId: row.scoringPeriodId, statSourceId: row.statSourceId, appliedTotal: row.appliedTotal })),
  };
}

function compactLeaguePayload(payload) {
  return {
    id: payload.id,
    seasonId: payload.seasonId,
    scoringPeriodId: payload.scoringPeriodId,
    status: payload.status,
    settings: payload.settings,
    members: (payload.members || []).map(({ id, displayName, firstName, lastName }) => ({ id, displayName, firstName, lastName })),
    teams: (payload.teams || []).map((team) => ({
      id: team.id,
      abbrev: team.abbrev,
      name: team.name,
      location: team.location,
      nickname: team.nickname,
      primaryOwner: team.primaryOwner,
      owners: team.owners,
      record: team.record,
      roster: { entries: (team.roster?.entries || []).map((entry) => ({ lineupSlotId: entry.lineupSlotId, playerPoolEntry: { player: compactPlayer(entry.playerPoolEntry?.player) } })) },
    })),
    players: (payload.players || []).slice(0, 600).map((entry) => ({ onTeamId: entry.onTeamId, player: compactPlayer(entry.player) })),
    schedule: (payload.schedule || []).map((row) => ({
      matchupPeriodId: row.matchupPeriodId,
      home: row.home && { teamId: row.home.teamId, totalPoints: row.home.totalPoints },
      away: row.away && { teamId: row.away.teamId, totalPoints: row.away.totalPoints },
    })),
  };
}

async function queryTabs(queryInfo) {
  if (!extensionApi?.tabs?.query) throw new Error("Open Fantasy Hub ESPN Sync from Chrome’s Extensions toolbar—not by opening popup.html directly.");
  return new Promise((resolve, reject) => {
    if (extensionApi === globalThis.chrome) {
      extensionApi.tabs.query(queryInfo, (result) => {
        const message = extensionApi.runtime.lastError?.message;
        if (message) reject(new Error(message));
        else resolve(result ?? []);
      });
      return;
    }
    extensionApi.tabs.query(queryInfo).then(resolve, reject);
  });
}

async function activeEspnTab() {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  const [tab] = tabs;
  if (!tab?.id || !/^https:\/\/[^/]*espn\.com\//.test(tab.url || "")) throw new Error("Open your ESPN league in this tab first.");
  return tab;
}

async function readLeagueFromEspn(tabId, leagueId, season) {
  if (!extensionApi?.scripting?.executeScript) throw new Error("This browser does not support the required extension scripting permission.");
  const [{ result }] = await extensionApi.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [leagueId, season],
    func: async (selectedLeagueId, selectedSeason) => {
      const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${selectedSeason}/segments/0/leagues/${encodeURIComponent(selectedLeagueId)}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=kona_player_info`;
      const fantasyFilter = JSON.stringify({ players: { limit: 2000, sortPercOwned: { sortPriority: 1, sortAsc: false } } });
      const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json", "x-fantasy-filter": fantasyFilter } });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, payload: await response.json() };
    },
  });
  if (!result?.ok) throw new Error(result?.status === 401 || result?.status === 403 ? "ESPN did not authorize this league. Confirm you are signed in." : "ESPN could not load this league.");
  return result.payload;
}

async function syncThroughFantasyHub(pairingCode, rosterId, payload) {
  const [hubTab] = await queryTabs({ url: `${hubOrigin}/*` });
  if (!hubTab?.id) {
    await extensionApi.tabs.create({ url: hubOrigin });
    throw new Error("Fantasy Hub was opened in a new tab. Sign in there, then return to ESPN and retry the sync.");
  }
  const [{ result }] = await extensionApi.scripting.executeScript({
    target: { tabId: hubTab.id },
    world: "MAIN",
    args: [pairingCode, rosterId, payload],
    func: async (code, selectedRosterId, league) => {
      const response = await fetch("/api/espn-extension/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: code, rosterId: selectedRosterId, payload: league }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) return { ok: false, error: "Fantasy Hub needs you to sign in again before syncing." };
      const data = await response.json();
      return response.ok ? { ok: true, data } : { ok: false, error: data.error || "Fantasy Hub rejected the sync." };
    },
  });
  if (!result?.ok) throw new Error(result?.error || "Fantasy Hub could not complete the sync.");
  return result.data;
}

async function initialize() {
  seasonInput.value = String(new Date().getFullYear());
  const saved = await extensionApi.storage.local.get(["pairingCode"]);
  if (saved.pairingCode) codeInput.value = saved.pairingCode;
  try {
    const tab = await activeEspnTab();
    const url = new URL(tab.url);
    const match = `${url.pathname}${url.search}${url.hash}`.match(/(?:leagueId[=/]|leagues\/)(\d{4,24})/i);
    if (match) leagueInput.value = match[1];
    const season = url.searchParams.get("seasonId") || `${url.pathname}${url.hash}`.match(/seasons\/(20\d{2})/)?.[1];
    if (season) seasonInput.value = season;
  } catch {
    setStatus("Open the ESPN league you want to sync, then reopen this extension.");
  }
}

loadButton.addEventListener("click", async () => {
  const leagueId = leagueInput.value.trim();
  const season = seasonInput.value.trim();
  if (!/^\d{4,24}$/.test(leagueId) || !/^20\d{2}$/.test(season)) return setStatus("Enter a valid ESPN league ID and season.", "error");
  loadButton.disabled = true;
  teamWrap.hidden = true;
  syncButton.hidden = true;
  setStatus("Loading your private league from ESPN…");
  try {
    const tab = await activeEspnTab();
    leaguePayload = compactLeaguePayload(await readLeagueFromEspn(tab.id, leagueId, season));
    const teams = Array.isArray(leaguePayload?.teams) ? leaguePayload.teams : [];
    if (!teams.length) throw new Error("No teams were returned for this league.");
    teamSelect.replaceChildren(...teams.map((team) => {
      const option = document.createElement("option");
      option.value = String(team.id || "");
      option.textContent = teamName(team);
      return option;
    }));
    teamWrap.hidden = false;
    syncButton.hidden = false;
    setStatus(`${leaguePayload.settings?.name || "ESPN league"} loaded. Choose the team you manage.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load ESPN league.", "error");
  } finally {
    loadButton.disabled = false;
  }
});

syncButton.addEventListener("click", async () => {
  const pairingCode = codeInput.value.trim();
  if (!leaguePayload || !pairingCode) return setStatus("Load the league and enter your Fantasy Hub pairing code.", "error");
  syncButton.disabled = true;
  setStatus("Securely sending league data to Fantasy Hub…");
  try {
    await extensionApi.storage.local.set({ pairingCode });
    const data = await syncThroughFantasyHub(pairingCode, teamSelect.value, leaguePayload);
    await extensionApi.storage.local.remove("pairingCode");
    setStatus(`${data.league.name} is synced. Return to Fantasy Hub and refresh leagues.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to sync league.", "error");
  } finally {
    syncButton.disabled = false;
  }
});

void initialize();

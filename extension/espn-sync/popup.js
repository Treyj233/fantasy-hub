const hubOrigin = "https://fantasy-hub.treyj233.chatgpt.site";
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

async function activeEspnTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/[^/]*espn\.com\//.test(tab.url || "")) throw new Error("Open your ESPN league in this tab first.");
  return tab;
}

async function readLeagueFromEspn(tabId, leagueId, season) {
  const [{ result }] = await chrome.scripting.executeScript({
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

async function initialize() {
  seasonInput.value = String(new Date().getFullYear());
  const saved = await chrome.storage.local.get(["pairingCode"]);
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
    leaguePayload = await readLeagueFromEspn(tab.id, leagueId, season);
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
    await chrome.storage.local.set({ pairingCode });
    const response = await fetch(`${hubOrigin}/api/espn-extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode, rosterId: teamSelect.value, payload: leaguePayload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Fantasy Hub rejected the sync.");
    await chrome.storage.local.remove("pairingCode");
    setStatus(`${data.league.name} is synced. Return to Fantasy Hub and refresh leagues.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to sync league.", "error");
  } finally {
    syncButton.disabled = false;
  }
});

void initialize();

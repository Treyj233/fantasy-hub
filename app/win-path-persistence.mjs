export function winPathRecordId(userId, leagueId, week, playerId, season, rosterId) {
  return JSON.stringify(['win-path-v2', userId, leagueId, String(season), week, String(rosterId), playerId]);
}

// Only acknowledge a payload after the server confirms persistence. Serialize
// each league independently, retaining players that finish while a save retries.
export function createWinPathSaver(send, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const states = new Map();
  return async function save(payload) {
    const key = JSON.stringify([payload.leagueId, payload.week, payload.information.season, payload.information.rosterId]);
    let state = states.get(key);
    if (!state) { state = { pending: null, saved: '', running: false }; states.set(key, state); }
    const prior = state.pending?.alternatives ?? [];
    const targets = new Map(prior.map(target => [target.id, target]));
    for (const target of payload.alternatives) targets.set(target.id, { ...target, capturedAt: payload.information.capturedAt });
    state.pending = { ...payload, alternatives: [...targets.values()] };
    if (state.running) return;
    state.running = true;
    try {
      while (state.pending) {
        const pending = state.pending;
        const hash = JSON.stringify(pending.alternatives.map(({ capturedAt, ...target }) => target));
        if (hash === state.saved) { state.pending = null; break; }
        let saved = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await send(pending); saved = true; break; }
          catch { if (attempt < 2) await pause(1000 * (attempt + 1)); }
        }
        if (!saved) break; // Retained for retry on the next scoreboard update.
        state.saved = hash;
        if (state.pending === pending) state.pending = null;
      }
    } finally { state.running = false; }
  };
}

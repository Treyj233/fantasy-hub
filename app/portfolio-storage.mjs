// Portfolio snapshots are too large for localStorage and must not compete with
// active-league payloads. Only serializable data lives here, scoped by account.
export function portfolioKey(identity) {
  return `portfolio:${String(identity ?? '').trim().toLowerCase()}`;
}

export function portfolioStorage(identity, value, factory = globalThis.indexedDB) {
  if (!identity || !factory) return Promise.resolve(null);
  return new Promise(resolve => {
    let db, settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db?.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 2000);
    try {
      const open = factory.open('fantasy-hub-portfolio', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
      open.onerror = open.onblocked = () => finish(null);
      open.onsuccess = () => {
        db = open.result;
        if (settled) { db.close(); return; }
        try {
          const transaction = db.transaction('snapshots', value === undefined ? 'readonly' : 'readwrite');
          const store = transaction.objectStore('snapshots');
          const request = value === undefined ? store.get(portfolioKey(identity)) : store.put(value, portfolioKey(identity));
          transaction.oncomplete = () => finish(value === undefined ? request.result ?? null : true);
          transaction.onerror = transaction.onabort = () => finish(null);
        } catch { finish(null); }
      };
    } catch { finish(null); }
  });
}

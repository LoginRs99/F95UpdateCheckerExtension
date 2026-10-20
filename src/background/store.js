// src/background/store.js
// Storage management layer for f95-update-tracker using chrome.storage.local

export const DEFAULT_SETTINGS = Object.freeze({
  domain: 'f95zone.to',
  pollMinutes: 30,
  pageDepthCap: 3,
  dailyRequestCap: 200,
  lastPollTimestamp: 0,
  requestCountToday: 0,
  requestDayTimestamp: 0,
  circuitBreakerUntil: 0,
  consecutiveFailures: 0
});

// In-memory mock storage for tests or environments where chrome.storage is not available
let mockStorage = null;

export function _setMockStorage(storageMap) {
  mockStorage = storageMap;
}

export function _clearMockStorage() {
  mockStorage = null;
}

async function getStorageArea() {
  if (mockStorage) {
    return {
      get: async (keys) => {
        if (!keys) return { ...mockStorage };
        if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
        if (Array.isArray(keys)) {
          const res = {};
          for (const k of keys) res[k] = mockStorage[k];
          return res;
        }
        const res = {};
        for (const [k, defVal] of Object.entries(keys)) {
          res[k] = mockStorage[k] !== undefined ? mockStorage[k] : defVal;
        }
        return res;
      },
      set: async (items) => {
        Object.assign(mockStorage, items);
      },
      remove: async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorage[k];
      }
    };
  }

  const api = (typeof globalThis.browser !== 'undefined' && globalThis.browser.storage)
    ? globalThis.browser
    : (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.storage ? globalThis.chrome : null);

  if (api && api.storage && api.storage.local) {
    return api.storage.local;
  }

  // Fallback in-memory
  mockStorage = {};
  return getStorageArea();
}

export function createGameRecord(data = {}) {
  const now = Date.now();
  const id = String(data.id || '').trim();
  const installed = String(data.installedVersion ?? '').trim();
  const latest = String(data.latestVersion ?? installed).trim();
  const status = (installed && latest && installed !== latest) ? 'update' : (data.status || 'current');

  return {
    id,
    url: data.url || `https://${DEFAULT_SETTINGS.domain}/threads/${id}/`,
    title: String(data.title || '').trim(),
    prevTitle: String(data.prevTitle || '').trim(),
    installedVersion: installed,
    latestVersion: latest,
    status: status === 'update' ? 'update' : 'current',
    prefixes: Array.isArray(data.prefixes) ? data.prefixes.map(p => typeof p === 'string' ? p.trim() : p) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(t => String(t).trim()).filter(Boolean) : [],
    notes: String(data.notes || ''),
    archived: Boolean(data.archived),
    changelogSnippet: String(data.changelogSnippet || ''),
    addedAt: Number(data.addedAt) || now,
    latestSeenAt: Number(data.latestSeenAt) || now
  };
}

export async function getSettings() {
  const storage = await getStorageArea();
  const data = await storage.get({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...data.settings };
}

export async function updateSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  const storage = await getStorageArea();
  await storage.set({ settings: updated });
  return updated;
}

export async function getGames() {
  const storage = await getStorageArea();
  const data = await storage.get({ games: {} });
  return data.games || {};
}

export async function getGame(id) {
  const games = await getGames();
  return games[String(id)] || null;
}

export async function saveGame(gameRecord) {
  const games = await getGames();
  const record = createGameRecord(gameRecord);
  games[record.id] = record;
  const storage = await getStorageArea();
  await storage.set({ games });
  return record;
}

export async function updateGame(id, partial) {
  const games = await getGames();
  const key = String(id);
  if (!games[key]) return null;

  const updated = createGameRecord({
    ...games[key],
    ...partial,
    id: key
  });
  games[key] = updated;
  const storage = await getStorageArea();
  await storage.set({ games });
  return updated;
}

export async function removeGame(id) {
  const games = await getGames();
  const key = String(id);
  if (!games[key]) return false;
  delete games[key];
  const storage = await getStorageArea();
  await storage.set({ games });
  return true;
}

export async function getPendingUpdatesCount() {
  const games = await getGames();
  return Object.values(games).filter(g => !g.archived && g.status === 'update').length;
}

export async function exportData() {
  const settings = await getSettings();
  const games = await getGames();
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings,
    games
  };
}

export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Import payload must be a JSON object.' };
  }
  if (!payload.games || typeof payload.games !== 'object') {
    return { valid: false, error: 'Import payload missing valid "games" dictionary.' };
  }

  const validGames = {};
  for (const [id, game] of Object.entries(payload.games)) {
    if (!id || !game || typeof game !== 'object') continue;
    const cleanId = String(game.id || id).trim();
    if (!cleanId) continue;
    validGames[cleanId] = createGameRecord({ ...game, id: cleanId });
  }

  if (Object.keys(validGames).length === 0) {
    return { valid: false, error: 'No valid games found in import payload.' };
  }

  return {
    valid: true,
    data: {
      settings: payload.settings ? { ...DEFAULT_SETTINGS, ...payload.settings } : null,
      games: validGames
    }
  };
}

export async function importData(payload, { merge = true } = {}) {
  const validation = validateImportPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storage = await getStorageArea();
  let gamesToStore = validation.data.games;

  if (merge) {
    const existing = await getGames();
    gamesToStore = { ...existing, ...validation.data.games };
  }

  const toSet = { games: gamesToStore };
  if (validation.data.settings) {
    const existingSettings = await getSettings();
    toSet.settings = { ...existingSettings, ...validation.data.settings };
  }

  await storage.set(toSet);
  return {
    importedCount: Object.keys(validation.data.games).length,
    totalCount: Object.keys(gamesToStore).length
  };
}

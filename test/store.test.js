import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _setMockStorage,
  _clearMockStorage,
  createGameRecord,
  validateImportPayload,
  getSettings,
  updateSettings,
  getGames,
  saveGame,
  updateGame,
  removeGame,
  getPendingUpdatesCount,
  exportData,
  importData
} from '../src/background/store.js';

test.beforeEach(() => {
  _setMockStorage({});
});

test.afterEach(() => {
  _clearMockStorage();
});

test('createGameRecord normalizes default values and opaque versions', () => {
  const g = createGameRecord({
    id: '305500',
    title: ' TunnelBound ',
    installedVersion: 'v0.9.0',
    latestVersion: 'v0.10.0'
  });

  assert.equal(g.id, '305500');
  assert.equal(g.title, 'TunnelBound');
  assert.equal(g.installedVersion, 'v0.9.0');
  assert.equal(g.latestVersion, 'v0.10.0');
  assert.equal(g.status, 'update');
  assert.equal(g.archived, false);
  assert.deepEqual(g.tags, []);
  assert.ok(g.addedAt > 0);
});

test('store CRUD and update count functions work properly', async () => {
  const g1 = await saveGame({
    id: '100',
    title: 'Game A',
    installedVersion: '1.0',
    latestVersion: '1.0'
  });
  assert.equal(g1.status, 'current');

  const g2 = await saveGame({
    id: '200',
    title: 'Game B',
    installedVersion: '1.0',
    latestVersion: '2.0'
  });
  assert.equal(g2.status, 'update');

  const games = await getGames();
  assert.equal(Object.keys(games).length, 2);

  const pending = await getPendingUpdatesCount();
  assert.equal(pending, 1);

  // Mark g2 as installed
  await updateGame('200', { installedVersion: '2.0', status: 'current' });
  const pendingAfter = await getPendingUpdatesCount();
  assert.equal(pendingAfter, 0);

  // Remove g1
  await removeGame('100');
  const gamesAfter = await getGames();
  assert.equal(gamesAfter['100'], undefined);
  assert.equal(Object.keys(gamesAfter).length, 1);
});

test('validateImportPayload validates schemas rigorously', () => {
  // Invalid non-objects
  assert.equal(validateImportPayload(null).valid, false);
  assert.equal(validateImportPayload('string').valid, false);
  assert.equal(validateImportPayload({}).valid, false);
  assert.equal(validateImportPayload({ games: {} }).valid, false);

  // Valid payload
  const validPayload = {
    schemaVersion: 1,
    games: {
      '305500': {
        id: '305500',
        title: 'TunnelBound',
        installedVersion: 'v0.10.0'
      }
    }
  };
  const res = validateImportPayload(validPayload);
  assert.equal(res.valid, true);
  assert.ok(res.data.games['305500']);
  assert.equal(res.data.games['305500'].title, 'TunnelBound');
});

test('exportData and importData roundtrip smoothly', async () => {
  await saveGame({
    id: '1',
    title: 'Alpha Game',
    installedVersion: '0.1'
  });
  await saveGame({
    id: '2',
    title: 'Beta Game',
    installedVersion: '0.2'
  });

  const exported = await exportData();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(Object.keys(exported.games).length, 2);

  // Clear mock storage
  _setMockStorage({});
  assert.equal(Object.keys(await getGames()).length, 0);

  // Re-import
  const importedResult = await importData(exported);
  assert.equal(importedResult.importedCount, 2);
  const reloaded = await getGames();
  assert.equal(Object.keys(reloaded).length, 2);
  assert.equal(reloaded['1'].title, 'Alpha Game');
});

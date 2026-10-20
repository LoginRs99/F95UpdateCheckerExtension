import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseThreadIdFromUrl,
  parseThreadHeading,
  detectChanges,
  parseChangelogFromHtml
} from '../src/background/detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('parseThreadIdFromUrl extracts thread IDs accurately', () => {
  assert.equal(parseThreadIdFromUrl('https://f95zone.to/threads/tunnelbound.305500/'), '305500');
  assert.equal(parseThreadIdFromUrl('https://f95zone.to/threads/305500/'), '305500');
  assert.equal(parseThreadIdFromUrl('/threads/game-name.12345/page-2?order=date#post-99'), '12345');
  assert.equal(parseThreadIdFromUrl('https://f95zone.to/threads/simple-title.999999'), '999999');
  assert.equal(parseThreadIdFromUrl('https://f95zone.to/latest/'), null);
  assert.equal(parseThreadIdFromUrl(''), null);
  assert.equal(parseThreadIdFromUrl(null), null);
});

test('parseThreadHeading parses titles, opaque versions, and prefixes', () => {
  // Case 1: Standard XenForo heading with prefixes, title, version, dev
  const h1 = '[Completed] [VN] TunnelBound [v0.10.0] [VeryWeirdDev]';
  const r1 = parseThreadHeading(h1);
  assert.equal(r1.title, 'TunnelBound');
  assert.equal(r1.version, 'v0.10.0');
  assert.deepEqual(r1.prefixes, ['Completed', 'VN']);

  // Case 2: Non-standard episodic versioning
  const h2 = '[On Hold] Space Explorer [Ch.3 Part 2] [GalaxyStudios]';
  const r2 = parseThreadHeading(h2);
  assert.equal(r2.title, 'Space Explorer');
  assert.equal(r2.version, 'Ch.3 Part 2');
  assert.deepEqual(r2.prefixes, ['On Hold']);

  // Case 3: Title without version
  const h3 = 'Uncharted Lands [DevTeam]';
  const r3 = parseThreadHeading(h3);
  assert.equal(r3.title, 'Uncharted Lands');
  assert.equal(r3.version, '');

  // Case 4: Title with underscore / patch notation
  const h4 = 'CyberCity [0.85_Fix2]';
  const r4 = parseThreadHeading(h4);
  assert.equal(r4.title, 'CyberCity');
  assert.equal(r4.version, '0.85_Fix2');
});

test('detectChanges detects opaque version changes and triggers updates', () => {
  const stored = {
    id: '305500',
    title: 'TunnelBound',
    prevTitle: '',
    installedVersion: 'v0.9.0',
    latestVersion: 'v0.9.0',
    status: 'current',
    prefixes: [116]
  };

  const incoming = {
    title: 'TunnelBound',
    version: 'v0.10.0', // New version string
    prefixes: [116],
    ts: 1792528740
  };

  const { hasChanges, updatedGame, events } = detectChanges(stored, incoming);
  assert.equal(hasChanges, true);
  assert.equal(updatedGame.status, 'update');
  assert.equal(updatedGame.latestVersion, 'v0.10.0');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'version_change');
  assert.equal(events[0].oldVersion, 'v0.9.0');
  assert.equal(events[0].newVersion, 'v0.10.0');
});

test('detectChanges handles game rename and preserves prevTitle', () => {
  const stored = {
    id: '12345',
    title: 'Old Game Name',
    prevTitle: '',
    installedVersion: '1.0',
    latestVersion: '1.0',
    status: 'current',
    prefixes: []
  };

  const incoming = {
    title: 'New Game Name: Rebirth',
    version: '1.0',
    prefixes: []
  };

  const { hasChanges, updatedGame, events } = detectChanges(stored, incoming);
  assert.equal(hasChanges, true);
  assert.equal(updatedGame.title, 'New Game Name: Rebirth');
  assert.equal(updatedGame.prevTitle, 'Old Game Name');
  assert.equal(events.some(e => e.type === 'title_change'), true);
});

test('detectChanges detects prefix modifications', () => {
  const stored = {
    id: '555',
    title: 'Some Novel',
    prefixes: ['In Progress']
  };

  const incoming = {
    title: 'Some Novel',
    prefixes: ['Completed']
  };

  const { hasChanges, updatedGame, events } = detectChanges(stored, incoming);
  assert.equal(hasChanges, true);
  assert.deepEqual(updatedGame.prefixes, ['Completed']);
  assert.equal(events.some(e => e.type === 'prefix_change'), true);
});

test('parseChangelogFromHtml extracts text from thread sample fixture', () => {
  const fixturePath = path.join(rootDir, 'fixtures', 'thread_sample.html');
  const html = fs.readFileSync(fixturePath, 'utf8');

  const changelog = parseChangelogFromHtml(html, 'v0.9.0', 'v0.10.0');
  assert.ok(changelog.includes('v0.10.0'), 'Must contain version text');
  assert.ok(changelog.includes('Added Chapter 4'), 'Must extract spoiler changelog text');

  // Fallback test
  const fallback = parseChangelogFromHtml('<div>No changelog here</div>', '1.0', '2.0');
  assert.equal(fallback, 'Updated: 1.0 -> 2.0');
});

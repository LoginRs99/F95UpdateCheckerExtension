import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseThreadIdFromUrl,
  parseThreadHeading,
  parseThreadSlug,
  detectChanges,
  parseChangelogFromHtml,
  extractVersionsFromHtml
} from '../src/background/detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('parseThreadIdFromUrl extracts thread IDs accurately', () => {
  assert.equal(parseThreadIdFromUrl('305500'), '305500');
  assert.equal(parseThreadIdFromUrl('  12345  '), '12345');
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

  // Case 5: Full document title with trailing | F95zone
  const h5 = 'Littleman Remake [v0.68] [Mr. Rabbit Team] | F95zone';
  const r5 = parseThreadHeading(h5);
  assert.equal(r5.title, 'Littleman Remake');
  assert.equal(r5.version, 'v0.68');

  // Case 6: Document title with dash prefixes
  const h6 = 'Completed - VN - Photo Hunt [v0.21.1 Extra] [Moochie] | F95zone';
  const r6 = parseThreadHeading(h6);
  assert.equal(r6.title, 'Photo Hunt');
  assert.equal(r6.version, 'v0.21.1 Extra');
  assert.deepEqual(r6.prefixes, ['Completed', 'VN']);

  // Case 7: Real saved HTML titles with underscore F95zone suffix and Ren'Py
  const h7 = "VN - Ren'Py - Grandpa's Lesson [Ch.8 RE v5.0] [NOHope] _ F95zone _ Adult Games _ Comics _ Mods _ Cheats";
  const r7 = parseThreadHeading(h7);
  assert.equal(r7.title, "Grandpa's Lesson");
  assert.equal(r7.version, 'Ch.8 RE v5.0');
  assert.deepEqual(r7.prefixes, ['VN', "Ren'Py"]);

  const h8 = "Ren'Py - Photo Hunt [v0.21.1 Extra] [Moochie] _ F95zone _ Adult Games _ Comics _ Mods _ Cheats";
  const r8 = parseThreadHeading(h8);
  assert.equal(r8.title, 'Photo Hunt');
  assert.equal(r8.version, 'v0.21.1 Extra');
  assert.deepEqual(r8.prefixes, ["Ren'Py"]);

  // Case 9: XenForo logged-in alert/unread notification counter prefix "(14) "
  const h9 = "(14) VN - Ren'Py - Strong Desire [Ep.7d] [TheBlueInk] | F95zone | Adult Games | Comics | Mods | Cheats";
  const r9 = parseThreadHeading(h9);
  assert.equal(r9.title, 'Strong Desire');
  assert.equal(r9.version, 'Ep.7d');
  assert.deepEqual(r9.prefixes, ['VN', "Ren'Py"]);

  const h10 = "(14) VN - Ren'Py - The Rehabilitation Project [v0.11] [Next-Gen Entertainment] | F95zone | Adult Games | Comics | Mods _ Cheats";
  const r10 = parseThreadHeading(h10);
  assert.equal(r10.title, 'The Rehabilitation Project');
  assert.equal(r10.version, 'v0.11');
  assert.deepEqual(r10.prefixes, ['VN', "Ren'Py"]);

  // Case 11: Raw H1 text with &nbsp; entities
  const h11 = "VN &nbsp; Ren'Py &nbsp; Strong Desire [Ep.7d] [TheBlueInk]";
  const r11 = parseThreadHeading(h11);
  assert.equal(r11.title, 'Strong Desire');
  assert.equal(r11.version, 'Ep.7d');
  assert.deepEqual(r11.prefixes, ['VN', "Ren'Py"]);
});

test('parseThreadSlug extracts clean title, version, and ID from slugs', () => {
  // Exact user bug reproduction URL:
  const r1 = parseThreadSlug('https://f95zone.to/threads/littleman-remake-v0-68-mr-rabbit-team.46791/');
  assert.equal(r1.id, '46791');
  assert.equal(r1.title, 'Littleman Remake');
  assert.equal(r1.version, 'v0.68');

  // Multi-segment version with extra tag
  const r2 = parseThreadSlug('https://f95zone.to/threads/photo-hunt-v0-21-1-extra-moochie.54321/');
  assert.equal(r2.id, '54321');
  assert.equal(r2.title, 'Photo Hunt');
  assert.equal(r2.version, 'v0.21.1 Extra');

  // Episodic / Chapter versioning with pagination
  const r3 = parseThreadSlug('https://f95zone.to/threads/grandpas-lesson-ch-8-re-v5-0-nohope.285411/page-2');
  assert.equal(r3.id, '285411');
  assert.equal(r3.title, 'Grandpas Lesson');
  assert.equal(r3.version, 'Ch.8 RE v5.0');

  // Slug without version
  const r4 = parseThreadSlug('https://f95zone.to/threads/uncharted-lands.999/');
  assert.equal(r4.id, '999');
  assert.equal(r4.title, 'Uncharted Lands');
  assert.equal(r4.version, '');

  // Raw numeric string without slug
  const r5 = parseThreadSlug('46791');
  assert.equal(r5.id, '46791');
  assert.equal(r5.title, 'Thread #46791');
  assert.equal(r5.version, '');
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

test('extractVersionsFromHtml detects current and previous versions accurately', () => {
  const sampleChangelog = `
    <article class="message message--post">
      <div class="bbWrapper">
        <b>Changelog:</b><br>
        v0.21.1 Extra:<br>
        - Fixed audio bugs<br>
        v0.21.0:<br>
        - Added Chapter 4<br>
        v0.20:<br>
        - Graphics overhaul<br>
        v0.19.2:<br>
        - Balance changes<br>
        <b>Old Downloads:</b><br>
        [v0.18] Mega link<br>
      </div>
    </article>
  `;

  const versions = extractVersionsFromHtml(sampleChangelog, 'v0.21.1 Extra');
  assert.ok(versions.includes('v0.21.1 Extra'), 'Must include current version at top');
  assert.equal(versions[0], 'v0.21.1 Extra', 'Current version must be first');
  assert.ok(versions.includes('v0.21.0'), 'Must include previous version v0.21.0');
  assert.ok(versions.includes('v0.20'), 'Must include previous version v0.20');
  assert.ok(versions.includes('v0.19.2'), 'Must include previous version v0.19.2');
  assert.ok(versions.includes('v0.18'), 'Must include bracketed version v0.18');

  // Verify graceful handling when no versions are present
  const emptyVersions = extractVersionsFromHtml('<div>Just text</div>', '1.0.0');
  assert.deepEqual(emptyVersions, ['1.0.0']);

  // Verify handling with null/empty inputs
  assert.deepEqual(extractVersionsFromHtml(null, ''), []);
});

test('extracts changelog and versions accurately from xenforo_new_thread_sample fixture', () => {
  const p = path.join(rootDir, 'fixtures', 'xenforo_new_thread_sample.html');
  const html = fs.readFileSync(p, 'utf8');

  const cl = parseChangelogFromHtml(html, 'Ep.7c', 'Ep.7d');
  assert.ok(cl.includes('Episode 7D'), 'Must extract Episode 7D from spoiler');
  assert.ok(cl.includes('static renders'), 'Must include render stats');

  const versions = extractVersionsFromHtml(html, 'Ep.7d');
  assert.equal(versions[0], 'Ep.7d');
  assert.ok(versions.includes('Episode 7D'));
  assert.ok(versions.includes('Episode 7C'));
  assert.ok(versions.includes('Episode 7B'));
});

test('Parses Website/3 target markup accurately when available', () => {
  const dir = path.join(rootDir, 'Website', '3');
  if (!fs.existsSync(dir)) return;

  const f1 = path.join(dir, "(14) VN - Ren'Py - Strong Desire [Ep.7d] [TheBlueInk] _ F95zone _ Adult Games _ Comics _ Mods _ Cheats.htm");
  if (fs.existsSync(f1)) {
    const html1 = fs.readFileSync(f1, 'utf8');
    const changelog1 = parseChangelogFromHtml(html1, 'Ep.7c', 'Ep.7d');
    assert.ok(changelog1.includes('Episode 7D') || changelog1.includes('renders'), 'Must extract Episode 7D changelog');
    const versions1 = extractVersionsFromHtml(html1, 'Ep.7d');
    assert.ok(versions1.length > 1, 'Must extract versions from Strong Desire first post');
    assert.equal(versions1[0], 'Ep.7d');
    assert.ok(versions1.some(v => v.includes('Episode 7D') || v.includes('Episode 7C') || v.includes('6D')));
  }

  const f2 = path.join(dir, "(14) VN - Ren'Py - The Rehabilitation Project [v0.11] [Next-Gen Entertainment] _ F95zone _ Adult Games _ Comics _ Mods _ Cheats.htm");
  if (fs.existsSync(f2)) {
    const html2 = fs.readFileSync(f2, 'utf8');
    const changelog2 = parseChangelogFromHtml(html2, 'v0.10', 'v0.11');
    assert.ok(changelog2.includes('v0.11') || changelog2.includes('weekly content update'), 'Must extract v0.11 changelog without false-matching overview');
    const versions2 = extractVersionsFromHtml(html2, 'v0.11');
    assert.ok(versions2.length >= 1, 'Must extract versions from The Rehabilitation Project');
    assert.equal(versions2[0], 'v0.11');
  }
});

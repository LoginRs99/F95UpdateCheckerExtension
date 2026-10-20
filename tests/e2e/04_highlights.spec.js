import { test, expect } from './fixtures.js';

test.describe('Highlights Content Script', () => {
  test('marks tracked tiles with correct status and handles dynamic DOM additions', async ({ extension }) => {
    const { context, serviceWorker } = extension;

    // Seed games: one with update (305500) and one current (12345)
    await serviceWorker.evaluate(async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            installedVersion: 'v0.9.0',
            latestVersion: 'v0.10.0',
            status: 'update',
            addedAt: now,
            latestSeenAt: now
          },
          '12345': {
            id: '12345',
            url: 'https://f95zone.to/threads/second-game.12345/',
            title: 'Second Tracked Game',
            installedVersion: '1.0.0',
            latestVersion: '1.0.0',
            status: 'current',
            addedAt: now,
            latestSeenAt: now
          }
        }
      });
    });

    const page = await context.newPage();
    await page.goto('https://f95zone.to/latest/');

    // Assert tracked game 305500 has UPDATE badge
    const badge305500 = page.locator('.f95-ut-badge[data-thread-id="305500"]');
    await expect(badge305500).toBeVisible({ timeout: 5000 });
    await expect(badge305500).toHaveText('UPDATE v0.10.0');

    // Assert untracked game 999999 has NO badge
    const badge999999 = page.locator('.f95-ut-badge[data-thread-id="999999"]');
    await expect(badge999999).toHaveCount(0);

    // Dynamically insert game tile for 12345 after initial load
    await page.evaluate(() => {
      const grid = document.getElementById('latest-updates-grid');
      const div = document.createElement('div');
      div.className = 'game-tile';
      div.setAttribute('data-thread-id', '12345');

      const a = document.createElement('a');
      a.href = '/threads/second-game.12345/';
      a.className = 'tile-title';
      a.textContent = 'Second Tracked Game';
      div.appendChild(a);

      grid.appendChild(div);
    });

    // Assert MutationObserver detects addition and renders TRACKED badge
    const badge12345 = page.locator('.f95-ut-badge[data-thread-id="12345"]');
    await expect(badge12345).toBeVisible({ timeout: 5000 });
    await expect(badge12345).toHaveText('TRACKED');
  });
});

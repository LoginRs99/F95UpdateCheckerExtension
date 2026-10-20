import { test, expect } from './fixtures.js';

test.describe('Popup and Library UI', () => {
  test('Popup: renders updates first, supports Mark Installed and Archive', async ({ extension }) => {
    const { context, serviceWorker, extensionId } = extension;

    // Seed games
    await serviceWorker.evaluate(async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        games: {
          '1': {
            id: '1',
            url: 'https://f95zone.to/threads/alpha.1/',
            title: 'Alpha Game',
            installedVersion: '0.9',
            latestVersion: '1.0',
            status: 'update',
            addedAt: now,
            latestSeenAt: now
          },
          '2': {
            id: '2',
            url: 'https://f95zone.to/threads/beta.2/',
            title: 'Beta Game',
            installedVersion: '2.0',
            latestVersion: '2.0',
            status: 'current',
            addedAt: now,
            latestSeenAt: now
          }
        }
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/popup/popup.html`);

    // Verify header badge displays 1 update
    const badge = page.locator('#badge-count');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Verify sections: Alpha under Updates Available, Beta under Up to Date
    const updateCard = page.locator('.game-card.has-update');
    await expect(updateCard).toContainText('Alpha Game');

    // Click 'Mark Installed' on Alpha Game
    const markBtn = updateCard.locator('button', { hasText: 'Mark Installed' });
    await markBtn.click();

    // Verify badge clears and Alpha Game is now marked current
    await expect(badge).not.toBeVisible();
    const storedAlpha = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['1'];
    });
    expect(storedAlpha.status).toBe('current');
    expect(storedAlpha.installedVersion).toBe('1.0');

    // Archive Beta Game
    const betaCard = page.locator('.game-card', { hasText: 'Beta Game' });
    const archiveBtn = betaCard.locator('button', { hasText: 'Archive' });
    await archiveBtn.click();

    const storedBeta = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['2'];
    });
    expect(storedBeta.archived).toBe(true);
  });

  test('Library: search, filter, export, and import validation', async ({ extension }) => {
    const { context, serviceWorker, extensionId } = extension;

    // Seed games with tags
    await serviceWorker.evaluate(async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        games: {
          '10': {
            id: '10',
            url: 'https://f95zone.to/threads/10/',
            title: 'Cyberpunk Quest',
            installedVersion: '1.0',
            latestVersion: '1.2',
            status: 'update',
            tags: ['rpg', 'scifi'],
            notes: 'Main play',
            archived: false,
            addedAt: now,
            latestSeenAt: now
          },
          '20': {
            id: '20',
            url: 'https://f95zone.to/threads/20/',
            title: 'Medieval Tale',
            installedVersion: '2.0',
            latestVersion: '2.0',
            status: 'current',
            tags: ['fantasy'],
            notes: 'Finished',
            archived: false,
            addedAt: now - 1000,
            latestSeenAt: now - 1000
          }
        }
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);

    // Verify both rows appear initially
    const rows = page.locator('#games-tbody tr');
    await expect(rows).toHaveCount(2);

    // Test Search filter
    const searchInput = page.locator('#filter-search');
    await searchInput.fill('Cyberpunk');
    await expect(page.locator('#games-tbody tr')).toHaveCount(1);
    await expect(page.locator('#games-tbody')).toContainText('Cyberpunk Quest');

    await searchInput.fill('');
    await expect(page.locator('#games-tbody tr')).toHaveCount(2);

    // Test Status filter
    const statusSelect = page.locator('#filter-status');
    await statusSelect.selectOption('update');
    await expect(page.locator('#games-tbody tr')).toHaveCount(1);
    await expect(page.locator('#games-tbody')).toContainText('Cyberpunk Quest');

    await statusSelect.selectOption('all');

    // Test JSON Export
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-json').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('f95-tracker-backup');

    // Test rejection of malformed import file
    const malformedPayload = JSON.stringify({ invalid: 'schema' });
    await page.locator('#import-file-input').setInputFiles({
      name: 'malformed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(malformedPayload)
    });

    const statusBanner = page.locator('#status-banner');
    await expect(statusBanner).toBeVisible({ timeout: 5000 });
    await expect(statusBanner).toContainText('Import Error');

    // Test valid import file
    const validBackup = JSON.stringify({
      schemaVersion: 1,
      games: {
        '30': {
          id: '30',
          title: 'Imported Adventure',
          installedVersion: '1.0',
          latestVersion: '1.0',
          status: 'current',
          tags: ['imported'],
          notes: 'Restored from test'
        }
      }
    });

    await page.locator('#import-file-input').setInputFiles({
      name: 'valid_backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(validBackup)
    });

    await expect(statusBanner).toContainText('Successfully imported');
    await expect(page.locator('#games-tbody')).toContainText('Imported Adventure');
  });
});

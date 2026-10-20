import { test, expect } from './fixtures.js';

test.describe('Track Button Content Script Flow', () => {
  test('injects track button, prefills version, respects edits, and saves game', async ({ extension }) => {
    const { context, serviceWorker } = extension;
    const page = await context.newPage();

    // Navigate to mocked thread page
    await page.goto('https://f95zone.to/threads/tunnelbound.305500/');

    // Assert button is injected
    const trackBtn = page.locator('#f95-ut-track-btn');
    await expect(trackBtn).toBeVisible({ timeout: 5000 });
    await expect(trackBtn).toHaveText('+ Track Game');

    // Click track button to open modal
    await trackBtn.click();

    const modal = page.locator('#f95-ut-modal-overlay');
    await expect(modal).toBeVisible();

    // Verify prefilled version from heading
    const verInput = modal.locator('input[placeholder*="v1.0.0"]');
    await expect(verInput).toHaveValue('v0.10.0');

    // Edit installed version to v0.9.5
    await verInput.fill('v0.9.5');

    // Add tags and notes
    const tagsInput = modal.locator('input[placeholder*="playing"]');
    await tagsInput.fill('favorite, renpy');

    const notesInput = modal.locator('textarea');
    await notesInput.fill('Installed via zip');

    // Click Save
    const saveBtn = modal.locator('button', { hasText: 'Track Game' });
    await saveBtn.click();

    // Verify modal closes
    await expect(modal).not.toBeVisible();

    // Verify button text updates
    await expect(trackBtn).toHaveText('✓ Tracked (v0.9.5)');

    // Verify stored data in chrome.storage.local
    const storedGame = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['305500'];
    });

    expect(storedGame).toBeTruthy();
    expect(storedGame.id).toBe('305500');
    expect(storedGame.title).toBe('TunnelBound');
    expect(storedGame.installedVersion).toBe('v0.9.5');
    expect(storedGame.latestVersion).toBe('v0.10.0');
    expect(storedGame.status).toBe('update');
    expect(storedGame.tags).toEqual(['favorite', 'renpy']);
    expect(storedGame.notes).toBe('Installed via zip');
  });
});

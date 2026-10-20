import { test, expect } from './fixtures.js';

test.describe('Extension Popup Track Flow & Version Detection', () => {
  test('does not inject track button on forum page, detects thread in popup, respects version dropdown, and saves game', async ({ extension }) => {
    const { context, serviceWorker, extensionId } = extension;

    // 1. Open mocked F95zone thread page
    const threadPage = await context.newPage();
    await threadPage.goto('https://f95zone.to/threads/tunnelbound.305500/');

    // Assert that NO track button or modal container is injected into the forum DOM
    const injectedBtn = threadPage.locator('#f95-ut-track-btn');
    await expect(injectedBtn).toHaveCount(0);
    const injectedContainer = threadPage.locator('#f95-ut-track-container');
    await expect(injectedContainer).toHaveCount(0);

    // 2. Open extension popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/ui/popup/popup.html`);

    // Assert popup detected the active F95zone thread tab
    const activeBanner = popupPage.locator('#active-tab-banner');
    await expect(activeBanner).toBeVisible({ timeout: 5000 });
    await expect(activeBanner).toContainText('TunnelBound');

    // Assert version dropdown is populated with detected versions
    const versionSelect = popupPage.locator('#active-tab-version-select');
    await expect(versionSelect).toBeVisible();

    // Select custom version option and set installed version to v0.9.5
    await versionSelect.selectOption('__custom__');
    const customInput = popupPage.locator('#active-tab-custom-version');
    await expect(customInput).toBeVisible();
    await customInput.fill('v0.9.5');

    // Click '+ Track Game'
    const trackBtn = popupPage.locator('#btn-active-tab-track');
    await trackBtn.click();

    // Verify game was saved into chrome.storage.local
    await expect.poll(async () => {
      return await serviceWorker.evaluate(async () => {
        const data = await chrome.storage.local.get('games');
        return data.games ? data.games['305500'] : null;
      });
    }, { timeout: 5000 }).toBeTruthy();

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

    // Verify popup reflects update badge and game card with update
    const badge = popupPage.locator('#badge-count');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    const updateCard = popupPage.locator('.game-card.has-update');
    await expect(updateCard).toBeVisible();
    await expect(updateCard).toContainText('TunnelBound');

    // 3. Test Quick Add '+' button in popup header
    const toggleAddBtn = popupPage.locator('#btn-toggle-add');
    await toggleAddBtn.click();

    const quickAddPanel = popupPage.locator('#quick-add-panel');
    await expect(quickAddPanel).toBeVisible();

    const quickAddInput = popupPage.locator('#quick-add-input');
    await quickAddInput.fill('https://f95zone.to/threads/tunnelbound.305500/');

    const resolveBtn = popupPage.locator('#btn-quick-add-resolve');
    await resolveBtn.click();

    const preview = popupPage.locator('#quick-add-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('TunnelBound');

    // 4. Test Manual Quick Add for user bug reproduction thread:
    // https://f95zone.to/threads/littleman-remake-v0-68-mr-rabbit-team.46791/
    await quickAddInput.fill('https://f95zone.to/threads/littleman-remake-v0-68-mr-rabbit-team.46791/');
    await resolveBtn.click();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Littleman Remake');

    // Confirm that detected version dropdown has v0.68, NOT v1.0.0
    const previewSelect = popupPage.locator('#preview-version-select');
    await expect(previewSelect).toBeVisible();
    await expect(previewSelect).toContainText('v0.68');

    const confirmBtn = popupPage.locator('#btn-confirm-add');
    await confirmBtn.click();

    // Verify saved game record in storage has v0.68
    await expect.poll(async () => {
      return await serviceWorker.evaluate(async () => {
        const data = await chrome.storage.local.get('games');
        return data.games ? data.games['46791'] : null;
      });
    }, { timeout: 5000 }).toBeTruthy();

    const littlemanGame = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['46791'];
    });

    expect(littlemanGame).toBeTruthy();
    expect(littlemanGame.title).toBe('Littleman Remake');
    expect(littlemanGame.installedVersion).toBe('v0.68');
    expect(littlemanGame.latestVersion).toBe('v0.68');
  });
});

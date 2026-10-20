import { test, expect } from './fixtures.js';

test.describe('Poll Flow & Alert Notifications', () => {
  test('detects version update, updates badge, and records notification', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute, getRecordedNotifications } = extension;

    // Seed tracked game with older installed version
    await serviceWorker.evaluate(async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            prevTitle: '',
            installedVersion: 'v0.9.0',
            latestVersion: 'v0.9.0',
            status: 'current',
            prefixes: [116],
            tags: [],
            notes: '',
            archived: false,
            changelogSnippet: '',
            addedAt: now,
            latestSeenAt: now
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 150,
          lastPollTimestamp: 0,
          requestCountToday: 0,
          requestDayTimestamp: now,
          circuitBreakerUntil: 0,
          consecutiveFailures: 0
        }
      });
    });

    // Mock latest_data.php returning newer version v0.10.0
    setMockRoute('latest_data.php', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          msg: {
            count: 1,
            pagination: { page: 1, total: 1 },
            data: [
              {
                thread_id: 305500,
                title: 'TunnelBound',
                creator: 'VeryWeirdDev',
                version: 'v0.10.0',
                prefixes: [116],
                ts: Math.floor(Date.now() / 1000)
              }
            ]
          }
        })
      });
    });

    // Open Library page and trigger the UI "Check for Updates" button (uses normal message handler)
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);

    const refreshBtn = page.locator('#btn-refresh');
    await refreshBtn.click();
    await expect(page.locator('#status-banner')).toContainText('Check completed', { timeout: 10000 });

    // Assert stored game status flipped to update
    const updatedGame = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['305500'];
    });
    expect(updatedGame.status).toBe('update');
    expect(updatedGame.latestVersion).toBe('v0.10.0');
    expect(updatedGame.installedVersion).toBe('v0.9.0');

    // Assert badge count text is '1'
    const badgeText = await serviceWorker.evaluate(async () => {
      return await chrome.action.getBadgeText({});
    });
    expect(badgeText).toBe('1');

    // Assert notification recorded
    const notifications = await getRecordedNotifications();
    expect(notifications.length).toBeGreaterThan(0);
    const updateNotif = notifications.find(n => n[1].title.includes('Update'));
    expect(updateNotif).toBeTruthy();
    expect(updateNotif[1].message).toContain('v0.10.0');
  });

  test('triggers rename alert and prefix-change alert', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute, getRecordedNotifications, clearRecordedNotifications } = extension;
    await clearRecordedNotifications();

    const now = Date.now();
    await serviceWorker.evaluate(async (timestamp) => {
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            prevTitle: '',
            installedVersion: 'v0.10.0',
            latestVersion: 'v0.10.0',
            status: 'current',
            prefixes: [116],
            tags: [],
            notes: '',
            archived: false,
            changelogSnippet: '',
            addedAt: timestamp,
            latestSeenAt: timestamp
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 150,
          lastPollTimestamp: 0,
          requestCountToday: 0,
          requestDayTimestamp: timestamp,
          circuitBreakerUntil: 0,
          consecutiveFailures: 0
        }
      });
    }, now);

    // Mock latest_data.php returning renamed title and modified prefix
    setMockRoute('latest_data.php', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          msg: {
            count: 1,
            pagination: { page: 1, total: 1 },
            data: [
              {
                thread_id: 305500,
                title: 'TunnelBound: Enhanced Edition',
                creator: 'VeryWeirdDev',
                version: 'v0.10.0',
                prefixes: [2], // Changed to Completed (2)
                ts: Math.floor(Date.now() / 1000)
              }
            ]
          }
        })
      });
    });

    // Trigger poll via normal UI action
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);
    await page.locator('#btn-refresh').click();
    await expect(page.locator('#status-banner')).toContainText('Check completed', { timeout: 10000 });

    const updatedGame = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['305500'];
    });

    expect(updatedGame.title).toBe('TunnelBound: Enhanced Edition');
    expect(updatedGame.prevTitle).toBe('TunnelBound');
    expect(updatedGame.prefixes).toEqual([2]);

    // Check notifications
    const notifications = await getRecordedNotifications();
    const renameNotif = notifications.find(n => n[1].title.includes('Renamed'));
    expect(renameNotif).toBeTruthy();
    expect(renameNotif[1].message).toContain('TunnelBound');

    const prefixNotif = notifications.find(n => n[1].title.includes('Status Change'));
    expect(prefixNotif).toBeTruthy();
  });
});

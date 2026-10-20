import { test, expect } from './fixtures.js';

test.describe('Resilience and Request Budgeting', () => {
  test('HTTP 429/403 trips circuit breaker, blocks further requests, and shows paused banner', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute, clearMockRoutes } = extension;

    // Seed tracked game
    await serviceWorker.evaluate(async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            installedVersion: 'v0.9.0',
            latestVersion: 'v0.9.0',
            status: 'current'
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 200,
          lastPollTimestamp: 0,
          requestCountToday: 0,
          requestDayTimestamp: now,
          circuitBreakerUntil: 0,
          consecutiveFailures: 0
        }
      });
    });

    // Mock HTTP 429 rate limit
    let requestsSent = 0;
    setMockRoute('latest_data.php', (route) => {
      requestsSent++;
      return route.fulfill({
        status: 429,
        contentType: 'text/plain',
        body: 'Too Many Requests'
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);

    await page.locator('#btn-refresh').click();

    // Assert circuit breaker banner is visible in UI
    const pausedBanner = page.locator('#paused-state-banner');
    await expect(pausedBanner).toBeVisible({ timeout: 5000 });
    await expect(pausedBanner).toContainText('Circuit breaker active');

    // Verify circuit breaker timestamp is saved in storage
    const settings = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('settings');
      return data.settings;
    });
    expect(settings.circuitBreakerUntil).toBeGreaterThan(Date.now());
    expect(settings.consecutiveFailures).toBe(1);

    // Now try clicking refresh again: NO further network requests should be sent
    const requestsBefore = requestsSent;
    await page.locator('#btn-refresh').click();
    await page.waitForTimeout(500);

    expect(requestsSent).toBe(requestsBefore); // 0 additional requests
  });

  test('Cloudflare challenge body trips circuit breaker', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute } = extension;

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/305500/',
            title: 'Game',
            installedVersion: '1.0',
            latestVersion: '1.0'
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 200,
          circuitBreakerUntil: 0,
          consecutiveFailures: 0
        }
      });
    });

    // Mock HTML challenge response
    setMockRoute('latest_data.php', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><title>Just a moment...</title><body>challenges.cloudflare.com</body></html>'
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);
    await page.locator('#btn-refresh').click();

    const pausedBanner = page.locator('#paused-state-banner');
    await expect(pausedBanner).toBeVisible({ timeout: 5000 });
    await expect(pausedBanner).toContainText('Circuit breaker active');
  });

  test('Changelog fetch failure falls back gracefully without blocking notification', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute, getRecordedNotifications } = extension;

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            installedVersion: 'v0.9.0',
            latestVersion: 'v0.9.0',
            status: 'current'
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 200,
          lastPollTimestamp: 0,
          circuitBreakerUntil: 0
        }
      });
    });

    // Mock latest_data.php with version update
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
                version: 'v0.10.0',
                ts: Math.floor(Date.now() / 1000)
              }
            ]
          }
        })
      });
    });

    // Mock thread page to FAIL with HTTP 500
    setMockRoute('/threads/tunnelbound.305500/', (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error'
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);
    await page.locator('#btn-refresh').click();
    await expect(page.locator('#status-banner')).toContainText('Check completed', { timeout: 10000 });

    // Verify stored game has fallback changelog snippet
    const updatedGame = await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('games');
      return data.games['305500'];
    });
    expect(updatedGame.status).toBe('update');
    expect(updatedGame.changelogSnippet).toContain('Updated: v0.9.0 -> v0.10.0');

    // Verify notification was STILL dispatched!
    const notifs = await getRecordedNotifications();
    const updateNotif = notifs.find(n => n[1].title.includes('Update'));
    expect(updateNotif).toBeTruthy();
  });

  test('Request budget: 1 request when nothing is new, caps paging at depthCap, and halts at dailyCap', async ({ extension }) => {
    const { context, serviceWorker, extensionId, setMockRoute } = extension;

    const baseTs = 1700000000;
    let requestCount = 0;

    // Track request count
    setMockRoute('latest_data.php', (route, request) => {
      requestCount++;
      const url = new URL(request.url());
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);

      // Return items with timestamp older than lastPollTimestamp
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          msg: {
            count: 30,
            pagination: { page: pageNum, total: 10 },
            data: [
              {
                thread_id: 305500,
                title: 'TunnelBound',
                version: 'v0.9.0',
                ts: baseTs - 100 // Older than lastPollTimestamp
              }
            ]
          }
        })
      });
    });

    await serviceWorker.evaluate(async (ts) => {
      await chrome.storage.local.set({
        games: {
          '305500': {
            id: '305500',
            url: 'https://f95zone.to/threads/tunnelbound.305500/',
            title: 'TunnelBound',
            installedVersion: 'v0.9.0',
            latestVersion: 'v0.9.0',
            status: 'current'
          }
        },
        settings: {
          domain: 'f95zone.to',
          pollMinutes: 30,
          pageDepthCap: 3,
          dailyRequestCap: 200,
          lastPollTimestamp: ts * 1000,
          requestCountToday: 0,
          requestDayTimestamp: Date.now(),
          circuitBreakerUntil: 0
        }
      });
    }, baseTs);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/ui/library/library.html`);

    // 1. When nothing is new, exactly 1 request is sent!
    requestCount = 0;
    await page.locator('#btn-refresh').click();
    await page.waitForTimeout(500);
    expect(requestCount).toBe(1);

    // 2. Paging depth test: When items are newer, pages up to pageDepthCap (3), but NEVER 4
    setMockRoute('latest_data.php', (route, request) => {
      requestCount++;
      const url = new URL(request.url());
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          msg: {
            count: 30,
            pagination: { page: pageNum, total: 10 },
            data: [
              {
                thread_id: 305500 + pageNum,
                title: `Game ${pageNum}`,
                version: '1.0',
                ts: baseTs + 5000 // All newer than lastPollTimestamp
              }
            ]
          }
        })
      });
    });

    requestCount = 0;
    await page.locator('#btn-refresh').click();
    await page.waitForTimeout(800);
    // Depth cap is 3, so exactly 3 pages requested, never 4
    expect(requestCount).toBe(3);

    // 3. Daily Cap test: Set requestCountToday >= dailyRequestCap
    await serviceWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('settings');
      data.settings.requestCountToday = 200;
      data.settings.dailyRequestCap = 200;
      await chrome.storage.local.set({ settings: data.settings });
    });

    requestCount = 0;
    await page.locator('#btn-refresh').click();
    await page.waitForTimeout(500);

    // Polling stops immediately with 0 requests sent
    expect(requestCount).toBe(0);

    // UI shows daily cap reached
    const pausedBanner = page.locator('#paused-state-banner');
    await expect(pausedBanner).toBeVisible();
    await expect(pausedBanner).toContainText('Daily request cap reached');
  });
});

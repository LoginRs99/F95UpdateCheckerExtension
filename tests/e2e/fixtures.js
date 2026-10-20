// tests/e2e/fixtures.js
// Custom Playwright test fixture loading the MV3 extension in an isolated profile
// with strict network mocking and abort of any real network calls.

import { test as base, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '../../');
const fixturesDir = path.resolve(__dirname, '../../fixtures');

export const test = base.extend({
  context: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f95-e2e-profile-'));

    const context = await chromium.launchPersistentContext(tmpDir, {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox'
      ]
    });

    await use(context);

    await context.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore profile cleanup errors on Windows
    }
  },

  extension: async ({ context }, use) => {
    // Collect forbidden / unmocked network requests
    const forbiddenRequests = [];
    const customRoutes = new Map();

    // Strict route interceptor: NO LIVE HOST CALLS ALLOWED
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();

      if (url.startsWith('chrome-extension://')) {
        return route.continue();
      }

      // Check custom routes registered by the test
      for (const [pattern, handler] of customRoutes.entries()) {
        const matches = typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url);
        if (matches) {
          return handler(route, request);
        }
      }

      // Default mock responses for f95zone.to
      if (url.startsWith('https://f95zone.to/')) {
        if (url.includes('/sam/latest_alpha/latest_data.php')) {
          const sampleJson = fs.readFileSync(path.join(fixturesDir, 'latest_data_sample.json'), 'utf8');
          return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: sampleJson
          });
        }

        if (url.includes('/threads/')) {
          const threadHtml = fs.readFileSync(path.join(fixturesDir, 'SYNTHETIC_thread_page.html'), 'utf8');
          return route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: threadHtml
          });
        }

        if (url.includes('/latest') || url === 'https://f95zone.to/') {
          const latestHtml = fs.readFileSync(path.join(fixturesDir, 'SYNTHETIC_latest_updates.html'), 'utf8');
          return route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: latestHtml
          });
        }
      }

      // Any other request is forbidden and immediately aborted
      forbiddenRequests.push(url);
      console.warn(`[E2E] FORBIDDEN REQUEST BLOCKED: ${url}`);
      return route.abort('blockedbyclient');
    });

    // Wait for the Manifest V3 background service worker
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }

    const extensionId = serviceWorker.url().split('/')[2];

    // Spy on chrome.notifications.create inside the service worker
    await serviceWorker.evaluate(() => {
      globalThis.__recordedNotifications = [];
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        const originalCreate = chrome.notifications.create.bind(chrome.notifications);
        chrome.notifications.create = async (...args) => {
          globalThis.__recordedNotifications.push(args);
          return originalCreate(...args);
        };
      }
    });

    const extensionHandle = {
      context,
      serviceWorker,
      extensionId,
      forbiddenRequests,
      setMockRoute: (pattern, handler) => {
        customRoutes.set(pattern, handler);
      },
      clearMockRoutes: () => {
        customRoutes.clear();
      },
      getRecordedNotifications: async () => {
        return await serviceWorker.evaluate(() => globalThis.__recordedNotifications || []);
      },
      clearRecordedNotifications: async () => {
        await serviceWorker.evaluate(() => {
          globalThis.__recordedNotifications = [];
        });
      }
    };

    await use(extensionHandle);

    // Fail if any unrouted / real-host network requests were attempted
    if (forbiddenRequests.length > 0) {
      throw new Error(`Test attempted forbidden external network requests: ${forbiddenRequests.join(', ')}`);
    }
  }
});

export { expect } from '@playwright/test';

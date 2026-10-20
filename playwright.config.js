// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Sequential execution for isolated Chromium user-data profiles
  reporter: [['list']],
  use: {
    trace: 'off'
  }
});

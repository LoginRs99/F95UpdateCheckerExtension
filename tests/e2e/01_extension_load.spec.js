import { test, expect } from './fixtures.js';

test.describe('Extension Loading & Permissions', () => {
  test('extension loads, service worker is alive, and manifest matches whitelist', async ({ extension }) => {
    const { serviceWorker, extensionId } = extension;

    expect(extensionId).toBeTruthy();
    expect(extensionId.length).toBeGreaterThan(10);
    expect(serviceWorker).toBeTruthy();

    // Verify manifest loaded in Chromium
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.name).toBe('f95-update-tracker');
    expect(manifest.manifest_version).toBe(3);

    // Assert exact permissions whitelist
    const expectedPermissions = ['alarms', 'storage', 'notifications'].sort();
    expect([...manifest.permissions].sort()).toEqual(expectedPermissions);

    // Assert host_permissions contains only f95zone.to
    expect(manifest.host_permissions).toEqual(['https://f95zone.to/*']);
  });
});

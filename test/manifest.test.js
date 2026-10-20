import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Ensure dist targets are built before testing
test.before(() => {
  execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'build.js')], { stdio: 'inherit' });
});

function assertCommonConstraints(manifest, targetName, dir) {
  assert.equal(manifest.manifest_version, 3, `[${targetName}] manifest_version must be 3`);
  assert.equal(manifest.name, 'f95-update-tracker', `[${targetName}] name mismatch`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, `[${targetName}] valid semver format required`);

  // Permissions whitelist: alarms, storage, notifications ONLY
  const allowedPermissions = ['alarms', 'storage', 'notifications'];
  assert.deepEqual(
    [...(manifest.permissions || [])].sort(),
    [...allowedPermissions].sort(),
    `[${targetName}] permissions must strictly contain alarms, storage, notifications only`
  );

  // Host permissions whitelist: https://f95zone.to/* ONLY
  const allowedHostPermissions = ['https://f95zone.to/*'];
  assert.deepEqual(
    manifest.host_permissions,
    allowedHostPermissions,
    `[${targetName}] host_permissions must strictly be ["https://f95zone.to/*"]`
  );

  // Action and options
  assert.equal(manifest.action.default_popup, 'src/ui/popup/popup.html');
  assert.equal(manifest.options_ui.page, 'src/ui/library/library.html');

  // Verify icon files exist in target directory
  for (const size of ['16', '48', '128']) {
    const iconRel = manifest.icons[size];
    const iconAbs = path.join(dir, iconRel);
    assert.ok(fs.existsSync(iconAbs), `[${targetName}] Icon ${size} must exist at ${iconRel}`);
  }
}

test('Chromium manifest compliance (dist/chromium)', () => {
  const distDir = path.join(rootDir, 'dist', 'chromium');
  const manifestPath = path.join(distDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'dist/chromium/manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assertCommonConstraints(manifest, 'Chromium', distDir);

  // Chromium background: service_worker
  assert.equal(manifest.background.service_worker, 'src/background/poller.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.background.scripts, undefined);
  assert.equal(manifest.browser_specific_settings, undefined);
});

test('Firefox manifest compliance (dist/firefox)', () => {
  const distDir = path.join(rootDir, 'dist', 'firefox');
  const manifestPath = path.join(distDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'dist/firefox/manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assertCommonConstraints(manifest, 'Firefox', distDir);

  // Firefox background: scripts array with module type
  assert.deepEqual(manifest.background.scripts, ['src/background/poller.js']);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.background.service_worker, undefined);

  // Firefox gecko settings
  assert.ok(manifest.browser_specific_settings?.gecko, 'browser_specific_settings.gecko must exist');
  assert.equal(manifest.browser_specific_settings.gecko.id, 'f95-update-tracker@loginrs99.github.io');
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '121.0');
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions?.required,
    ['none']
  );
});

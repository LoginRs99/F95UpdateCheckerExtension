import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Manifest V3 compliance and strict security constraints', () => {
  const manifestPath = path.join(rootDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  // Manifest Version 3
  assert.equal(manifest.manifest_version, 3, 'manifest_version must be 3');

  // Name and version
  assert.equal(manifest.name, 'f95-update-tracker');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

  // Exact permissions whitelist: alarms, storage, notifications ONLY
  const allowedPermissions = ['alarms', 'storage', 'notifications'];
  assert.deepEqual(
    [...(manifest.permissions || [])].sort(),
    [...allowedPermissions].sort(),
    'permissions must strictly contain alarms, storage, notifications and nothing else'
  );

  // Exact host_permissions: https://f95zone.to/* ONLY
  const allowedHostPermissions = ['https://f95zone.to/*'];
  assert.deepEqual(
    manifest.host_permissions,
    allowedHostPermissions,
    'host_permissions must strictly be ["https://f95zone.to/*"]'
  );

  // No remote code / unsafe CSP
  if (manifest.content_security_policy) {
    const csp = JSON.stringify(manifest.content_security_policy);
    assert.ok(!csp.includes('unsafe-eval'), 'CSP must not contain unsafe-eval');
    assert.ok(!csp.includes('http://'), 'CSP must not allow unencrypted endpoints');
  }

  // Service worker background
  assert.equal(manifest.background.service_worker, 'src/background/poller.js');
  assert.equal(manifest.background.type, 'module');

  // Action and options
  assert.equal(manifest.action.default_popup, 'src/ui/popup/popup.html');
  assert.equal(manifest.options_ui.page, 'src/ui/library/library.html');

  // Verify icon files exist
  for (const size of ['16', '48', '128']) {
    const iconRel = manifest.icons[size];
    const iconAbs = path.join(rootDir, iconRel);
    assert.ok(fs.existsSync(iconAbs), `Icon ${size} must exist at ${iconRel}`);
  }
});

// scripts/build.js
// Builds distribution packages for Chromium and Firefox targets from shared source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const version = '0.4.1';

const baseManifest = {
  manifest_version: 3,
  name: 'f95-update-tracker',
  version: version,
  description: 'Tracks installed versions of F95zone games and notifies you of new updates.',
  permissions: [
    'alarms',
    'storage',
    'notifications'
  ],
  host_permissions: [
    'https://f95zone.to/*'
  ],
  content_scripts: [
    {
      matches: [
        'https://f95zone.to/*'
      ],
      js: [
        'src/compat.js',
        'src/content/highlight.js'
      ],
      run_at: 'document_idle'
    }
  ],
  action: {
    default_popup: 'src/ui/popup/popup.html',
    default_icon: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    },
    default_title: 'F95 Update Tracker'
  },
  options_ui: {
    page: 'src/ui/library/library.html',
    open_in_tab: true
  },
  icons: {
    '16': 'icons/icon-16.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png'
  }
};

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildTarget(target) {
  const targetDir = path.join(rootDir, 'dist', target);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy shared code
  copyDirRecursive(path.join(rootDir, 'icons'), path.join(targetDir, 'icons'));
  copyDirRecursive(path.join(rootDir, 'src'), path.join(targetDir, 'src'));

  // Target-specific manifest adjustments
  const manifest = JSON.parse(JSON.stringify(baseManifest));

  if (target === 'chromium') {
    manifest.background = {
      service_worker: 'src/background/poller.js',
      type: 'module'
    };
  } else if (target === 'firefox') {
    manifest.background = {
      scripts: ['src/background/poller.js'],
      type: 'module'
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'f95-update-tracker@loginrs99.github.io',
        strict_min_version: '121.0',
        data_collection_permissions: {
          required: ['none']
        }
      }
    };
  }

  const manifestPath = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Also update root manifest.json to mirror chromium target for local dev / backward compat
  if (target === 'chromium') {
    fs.writeFileSync(path.join(rootDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  console.log(`Built ${target} target -> ${targetDir}`);
}

console.log(`Building f95-update-tracker v${version}...`);
buildTarget('chromium');
buildTarget('firefox');
console.log('Build complete.');

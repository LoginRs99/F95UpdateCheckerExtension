// scripts/check-syntax.js
// Runs node --check across all javascript files in the repository
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const scanDirs = ['src', 'test', 'scripts'];
let fileCount = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', full], { stdio: 'inherit' });
      fileCount++;
    }
  }
}

for (const dir of scanDirs) {
  walk(path.join(rootDir, dir));
}

console.log(`Syntax check passed for all ${fileCount} JavaScript files.`);

// scripts/scan-secrets.js
// Scans repository for accidentally committed cookies, tokens, or session artifacts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const forbiddenPatterns = [
  { name: 'XenForo session/token', regex: /xf_[a-zA-Z0-9_\-]{6,}/i },
  { name: 'Cloudflare clearance cookie', regex: /cf_clearance=[a-zA-Z0-9_\.\-]{10,}/i },
  { name: 'GitHub Personal Token', regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: 'Hardcoded Bearer Auth', regex: /Authorization:\s*Bearer\s+[A-Za-z0-9_\.\-]{10,}/i }
];

const hits = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.png') || entry.name.endsWith('.zip')) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const p of forbiddenPatterns) {
        if (p.regex.test(content)) {
          hits.push({ file: path.relative(rootDir, full), violation: p.name });
        }
      }
    }
  }
}

scanDir(rootDir);

if (hits.length > 0) {
  console.error('SECRET SCAN FAILED! Potential secrets found:');
  for (const h of hits) {
    console.error(`- ${h.file}: ${h.violation}`);
  }
  process.exit(1);
} else {
  console.log('Secret scan passed: zero secrets, session tokens, or credentials found.');
}

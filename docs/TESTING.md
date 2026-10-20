# Testing Guide (docs/TESTING.md)

This document describes the automated test suites, fixture classifications (VERIFIED vs SYNTHETIC), and the manual smoke testing checklist.

---

## 1. Automated Test Suites

### Unit Tests
Unit tests run purely on Node.js built-ins (`node --test`), testing pure detection logic, opaque version diffing, thread URL/heading parsing, storage schema validation, backoff mathematics, and manifest security constraints.

```bash
# Run syntax checks
npm run check          # or: node scripts/check-syntax.js

# Run unit tests
npm test               # or: node --test test/*.test.js
```

### Automated Playwright E2E Tests
Automated browser E2E tests run against Chromium using Playwright in isolated browser contexts with custom persistent profiles.

**Strict Network Isolation**:
- `context.route('**/*')` intercepts all network traffic.
- Requests matching `https://f95zone.to/*` are fulfilled strictly from local fixtures.
- **Any** request to an unmocked endpoint or real external host is immediately blocked (`route.abort()`) and recorded, triggering immediate test failure.
- Zero live network traffic is ever generated.

```bash
# Run all Playwright E2E tests
npm run test:e2e       # or: npx playwright test
```

---

## 2. Fixture Classifications (VERIFIED vs SYNTHETIC)

| Fixture File | Classification | Description & Provenance |
| :--- | :--- | :--- |
| `fixtures/latest_data_sample.json` | **VERIFIED (REAL)** | Captured and sanitized directly from the live `https://f95zone.to/sam/latest_alpha/latest_data.php` endpoint during Phase 0 Recon. Proves the real JSON schema and field structure. |
| `fixtures/thread_sample.html` | **SYNTHETIC** | Synthetic XenForo thread markup constructed based on Recon observations. Used for unit testing HTML changelog extraction. *Does not prove live-site selectors.* |
| `fixtures/SYNTHETIC_thread_page.html` | **SYNTHETIC** | Minimal synthetic DOM matching XenForo title and spoiler selectors for E2E track button injection and version prefilling. *Does not prove live-site selectors.* |
| `fixtures/SYNTHETIC_latest_updates.html` | **SYNTHETIC** | Minimal synthetic DOM representing F95zone game cards and dynamic tile grids for highlight injection. *Does not prove live-site selectors.* |

> [!NOTE]
> Synthetic fixtures validate that the extension's DOM manipulation, event listeners, and selector logic work correctly against expected markup. They do not guarantee that F95zone has not altered its server-side templates. A manual smoke test against the live site is recommended before each major release.

---

## 3. Manual Real-Site Smoke Checklist

When smoke-testing the unpacked extension against the live `https://f95zone.to` forum:

1. **Installation**:
   - Open `chrome://extensions/`, toggle **Developer mode**, click **Load unpacked**, and select the extension folder.
   - Verify 0 warnings or errors appear on the extension card.

2. **Track Game**:
   - Visit any live game thread (e.g. `https://f95zone.to/threads/...`).
   - Confirm the `+ Track Game` button injects cleanly next to the title.
   - Click `+ Track Game`. Confirm the dialog pre-fills the version and title.
   - Click **Track Game**; verify button switches to `✓ Tracked (v...)`.

3. **Listing Highlights**:
   - Visit `https://f95zone.to/latest/` or `/forums/games.2/`.
   - Confirm your tracked game displays a green `[TRACKED]` tag.
   - Scroll down to load more cards; confirm newly loaded cards are marked seamlessly.

4. **Update Simulation & Desktop Alert**:
   - Open the Library page (click the extension action icon -> gear icon).
   - Click the **Installed** version for the game and type an older version (e.g. `v0.0.1`).
   - Click **Check for Updates**.
   - Verify:
     - Badge on extension icon displays `1`.
     - System desktop notification appears: `Update: <Title>`.
     - In forum listings, the tag turns red: `[UPDATE <newVersion>]`.

5. **Popup Quick Actions**:
   - Click the extension icon.
   - Click **Mark Installed** on the update card.
   - Verify badge clears and game moves to "Up to Date".

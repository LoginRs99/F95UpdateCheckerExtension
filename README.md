# f95-update-tracker

A lightweight, zero-dependency browser extension for tracking your installed versions of [F95zone](https://f95zone.to) games, detecting new updates, and delivering instant notifications. Supports **Chromium browsers** (Chrome, Brave, Edge, Vivaldi, Opera) and **Mozilla Firefox & Zen Browser** under Manifest V3.

---

## Features

- **Cross-Browser Support**: Native Manifest V3 packages for Chromium (service worker) and Firefox / Zen (ES module event page), sharing a clean, zero-dependency codebase.
- **One-Click Extension Tracking**: Clean forum browsing with zero injected buttons on page content. Automatically detects the active F95zone thread directly inside the extension popup, or via the `+` Quick Add button for any URL or thread ID.
- **Automatic Version Detection & Dropdown**: Intelligently scans thread headings, changelogs, and spoiler blocks to detect current (latest) and historical/previous versions. Populates a version dropdown so you can pick which version you have installed on your machine with one click.
- **High-Density Compact Layout**: Linear & Raycast obsidian dark-mode interface built to effortlessly navigate 20–50+ games. Features instant search filtering, status pills (`All`, `Updates`, `Installed`, `Archived`), and smooth click-to-expand details drawers.
- **Smart Update Detection**: Treats game versions as opaque strings (handling arbitrary formats like `v1.0.0`, `Ch.3 Part 2`, `Ep. 1`, `0.85_Fix2`). Triggers updates whenever the forum's latest version differs from your installed version.
- **Visual Highlights**: Marks tracked games directly on forum index pages, listing views, and Latest Updates tiles (`[TRACKED]` in green, `[UPDATE <ver>]` in red). Seamlessly updates dynamically loaded cards using a `MutationObserver`.
- **Gentle Forum Footprint**:
  - Incremental polling via alarms every 2 hours with randomized jitter.
  - Page depth cap and daily request budget cap.
  - Automatic Circuit Breaker with exponential backoff on HTTP 403, 429, or Cloudflare challenge responses.
  - Never runs tight retry loops or hammers the forum.
- **Changelog Snippets**: When an update is detected, fetches the thread changelog snippet once and displays it in the popup.
- **Quick-Action Popup**:
  - Displays games with pending updates at the top.
  - Compare `Installed → Latest`.
  - One-click actions: **Open Thread**, **Mark Installed**, **Archive**.
  - Dropdown to switch or adjust installed version anytime.
- **Management Library & Options**:
  - Full table view with instant search, filtering by status (Updates / Current / Archived) and tags.
  - Quick Add Game by URL or thread ID.
  - Inline editing of installed versions and notes.
  - Bulk archive and delete operations.
  - Configurable polling intervals and request caps.
  - JSON Backup Export and Restore with strict schema validation.
- **Strict Security & Privacy**: Zero analytics, zero external CDNs or endpoints, no cookies or tokens stored. Uses standard browser sessions via `credentials: 'include'`. All forum-derived content is strictly rendered using `textContent` (zero `innerHTML`).

---

## Installation

### Chromium Browsers (Google Chrome, Brave, Microsoft Edge, Vivaldi, Opera)

1. Go to the [Releases](https://github.com/LoginRs99/F95UpdateCheckerExtension/releases) page and download `f95-update-tracker-chromium-v0.4.0.zip`.
2. Extract the ZIP archive to a folder on your computer.
3. Open your browser and navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle switch in the upper-right corner.
5. Click **Load unpacked** in the upper-left.
6. Select the extracted folder containing `manifest.json`.

---

### Mozilla Firefox & Zen Browser

Firefox and Zen support Manifest V3 with ES module event pages (Firefox 121.0+).

#### Option A: Temporary Add-on (Testing / Development)
1. Download `f95-update-tracker-firefox-v0.4.0.zip` from [Releases](https://github.com/LoginRs99/F95UpdateCheckerExtension/releases) and extract it (or run `node scripts/build.js` locally to generate `dist/firefox/`).
2. In Firefox or Zen Browser, navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click **Load Temporary Add-on...**
4. Select `manifest.json` inside the extracted Firefox directory (or `dist/firefox/manifest.json`).
5. The extension is active immediately.

#### Option B: Permanent Installation (Self-Signed via AMO Unlisted)
Release artifacts are unsigned (open-source policy: no private developer signing keys in repository). To install permanently:
1. Download `f95-update-tracker-firefox-v0.4.0.zip`.
2. Visit the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/addon/submit/upload-unlisted).
3. Choose **On your own (unlisted)** distribution.
4. Upload `f95-update-tracker-firefox-v0.4.0.zip`.
5. Download your signed `.xpi` file once automated checks complete.
6. Drag and drop the `.xpi` into Firefox/Zen or install via `about:addons` -> Gear icon -> **Install Add-on From File...**.

For full compatibility documentation and the manual testing smoke checklist, see [docs/FIREFOX.md](docs/FIREFOX.md).

---

## Permissions & Security

`f95-update-tracker` is built according to the principle of least privilege:

| Permission | Purpose |
| :--- | :--- |
| `alarms` | Schedules background polling cycles at configured intervals. |
| `storage` | Stores your tracked games list, installed versions, notes, and preferences locally in extension storage. |
| `notifications` | Displays desktop notifications when updates or title changes are detected. |
| `host_permissions: https://f95zone.to/*` | Connects exclusively to the F95zone API and thread pages to check for updates. |

### Security Guarantees
- **No Third-Party Traffic**: Does not communicate with any external server or telemetry service.
- **No Credential Access**: Never requests, logs, or stores forum credentials, passwords, or session cookies.
- **XSS Immunity**: Forum data is rendered solely through DOM `textContent` and `createElement`, preventing script injection.

---

## Known Limitations

- **Browser-Dependent Polling**: As a client-side extension, update polling executes only while your browser is running. If closed for extended periods, the extension automatically catches up upon browser launch up to your configured page depth cap.
- **Markup Changes**: Changelog snippet extraction relies on forum spoiler selectors; if F95zone radically restructures thread markup, snippets may fall back to `Installed -> Latest` while version detection continues uninterrupted via the JSON API.

---

## Development & Testing

Built with pure Vanilla JavaScript ES Modules. Zero bundlers, zero runtime dependencies.

```bash
# Build both distribution targets (dist/chromium and dist/firefox)
node scripts/build.js

# Run syntax check across all JavaScript files
node scripts/check-syntax.js

# Run unit tests (built-in Node test runner)
npm test

# Run Chromium E2E tests (Playwright)
npm run test:e2e

# Lint Firefox target using Mozilla web-ext
npm run lint:firefox

# Regenerate PNG icons
node scripts/generate-icons.js
```

---

## License

MIT License. Open-source for personal use.

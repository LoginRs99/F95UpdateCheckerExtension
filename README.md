# f95-update-tracker

A lightweight, zero-dependency Chromium Manifest V3 browser extension for tracking your installed versions of [F95zone](https://f95zone.to) games, detecting new updates, and delivering instant notifications.

---

## Features

- **One-Click Tracking**: Inject a seamless `+ Track Game` button directly onto F95zone thread pages. Automatically pre-fills the current version and title, allowing you to record your installed version, custom tags, and personal notes.
- **Smart Update Detection**: Treats game versions as opaque strings (handling arbitrary formats like `v1.0.0`, `Ch.3 Part 2`, `Ep. 1`, `0.85_Fix2`). Triggers updates whenever the forum's latest version differs from your installed version.
- **Visual Highlights**: Marks tracked games directly on forum index pages, listing views, and Latest Updates tiles (`[TRACKED]` in green, `[UPDATE <ver>]` in red). Seamlessly updates dynamically loaded cards using a `MutationObserver`.
- **Gentle Forum Footprint**:
  - Incremental polling via `chrome.alarms` every 30 minutes with randomized jitter.
  - Page depth cap and daily request budget cap.
  - Automatic Circuit Breaker with exponential backoff on HTTP 403, 429, or Cloudflare challenge responses.
  - Never runs tight retry loops or hammers the forum.
- **Changelog Snippets**: When an update is detected, fetches the thread changelog snippet once and displays it in the popup.
- **Quick-Action Popup**:
  - Displays games with pending updates at the top.
  - Compare `Installed → Latest`.
  - One-click actions: **Open Thread**, **Mark Installed**, **Archive**.
- **Management Library & Options**:
  - Full table view with instant search, filtering by status (Updates / Current / Archived) and tags.
  - Inline editing of installed versions and notes.
  - Bulk archive and delete operations.
  - Configurable polling intervals and request caps.
  - JSON Backup Export and Restore with strict schema validation.
- **Theme Support**: Dynamic dark and light mode automatically following `prefers-color-scheme`.
- **Strict Security & Privacy**: Zero analytics, zero external CDNs or endpoints, no cookies or tokens stored. Uses standard browser sessions via `credentials: 'include'`. All forum-derived content is strictly rendered using `textContent` (zero `innerHTML`).

---

## Installation

1. Go to the [Releases](https://github.com/LoginRs99/F95UpdateCheckerExtension/releases) page and download `f95-update-tracker-v0.1.0.zip`.
2. Extract the ZIP archive to a folder on your computer.
3. Open a Chromium-based browser (Google Chrome, Brave, Microsoft Edge, Vivaldi, Opera).
4. Navigate to `chrome://extensions/`.
5. Enable **Developer mode** using the toggle switch in the upper-right corner.
6. Click the **Load unpacked** button in the upper-left.
7. Select the unzipped extension directory containing `manifest.json`.

---

## Permissions & Security

`f95-update-tracker` is built according to the principle of least privilege:

| Permission | Purpose |
| :--- | :--- |
| `alarms` | Schedules background polling cycles at configured intervals. |
| `storage` | Stores your tracked games list, installed versions, notes, and preferences locally in `chrome.storage.local`. |
| `notifications` | Displays desktop notifications when updates or title changes are detected. |
| `host_permissions: https://f95zone.to/*` | Connects exclusively to the F95zone API and thread pages to check for updates. |

### Security Guarantees
- **No Third-Party Traffic**: Does not communicate with any external server or telemetry service.
- **No Credential Access**: Never requests, logs, or stores forum credentials, passwords, or session cookies.
- **XSS Immunity**: Forum data is rendered solely through DOM `textContent` and `createElement`, preventing script injection.

---

## Known Limitations

- **Browser-Dependent Polling**: As a client-side extension, update polling executes only while your Chromium browser is running. If closed for extended periods, the extension automatically catches up upon browser launch up to your configured page depth cap.
- **Markup Changes**: Changelog snippet extraction relies on forum spoiler selectors; if F95zone radically restructures thread markup, snippets may fall back to `Installed -> Latest` while version detection continues uninterrupted via the JSON API.

---

## Development & Testing

Built with pure Vanilla JavaScript ES Modules. Zero bundlers, zero runtime dependencies.

```bash
# Run syntax validation across all files
node scripts/check-syntax.js

# Run test suite
node --test test/*.test.js

# Regenerate PNG icons (built-in zlib)
node scripts/generate-icons.js
```

---

## License

MIT License. Open-source for personal use.

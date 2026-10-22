# Firefox & Zen Browser Compatibility Report (docs/FIREFOX.md)

This document details the architectural research, verified constraints, installation procedures, and testing checklist for running `f95-update-tracker` on Mozilla Firefox and Zen Browser (Firefox fork) under Manifest V3.

---

## 1. Research & Technical Findings

### A. Background Scripts vs Service Worker & Module Support
- **Status**: **VERIFIED**
- **MDN Sources**:
  - [MDN: Manifest V3 Migration - Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
  - [Mozilla Add-ons Community: Event Pages in MV3](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- **Details**:
  - Chromium enforces background service workers via `background.service_worker`.
  - Firefox MV3 does **not** support background service workers. Instead, Firefox implements non-persistent **Event Pages** declared via `background.scripts`:
    ```json
    "background": {
      "scripts": ["src/background/poller.js"],
      "type": "module"
    }
    ```
  - Firefox added support for `"type": "module"` in background event pages in **Firefox 121.0**.

---

### B. Minimum Firefox Version (`strict_min_version`)
- **Status**: **VERIFIED**
- **MDN & Mozilla Sources**:
  - [MDN: Firefox 121 Release Notes for WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/121)
  - [Mozilla Extension Workshop: Data Collection Permissions](https://extensionworkshop.com/documentation/publish/data-disclosure/)
- **Details**:
  - MV3 was enabled by default in Firefox 109.0.
  - ES module loading (`"type": "module"`) in `background.scripts` was implemented in Firefox 121.0.
  - `data_collection_permissions` was introduced in **Firefox 140.0** (Desktop) and **Firefox for Android 142.0**.
  - Setting `browser_specific_settings.gecko.strict_min_version = "140.0"` and `browser_specific_settings.gecko_android.strict_min_version = "142.0"` ensures zero AMO validation warnings (`0 errors, 0 warnings`) on addons.mozilla.org upload.

---

### C. Promises & API Namespaces (`browser.*` vs `chrome.*`)
- **Status**: **VERIFIED**
- **MDN Source**: [MDN: JavaScript APIs - Promise-based APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- **Details**:
  - In Firefox, `browser.*` is the native namespace and returns standard ECMAScript Promises for all asynchronous operations (`storage`, `alarms`, `notifications`, `runtime`, `permissions`).
  - While Firefox supports `chrome.*` as a legacy callback-oriented alias, calling `await chrome.storage.local.get()` in some Firefox contexts can fail or return undefined because it expects callbacks.
  - **Cross-Browser Shim**: All extension modules use:
    ```javascript
    const extAPI = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
      ? globalThis.browser
      : globalThis.chrome;
    ```
    This seamlessly uses native `browser.*` Promises on Firefox / Zen and native `chrome.*` Promises on Chromium.

---

### D. Host Permissions & Runtime Grant Model
- **Status**: **VERIFIED**
- **MDN Sources**:
  - [MDN: host_permissions in Manifest V3](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions)
  - [MDN: permissions.contains](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/contains)
- **Details**:
  - In Firefox 127+, `host_permissions` declared in `manifest.json` (`https://f95zone.to/*`) are surfaced to the user at installation.
  - However, in Firefox MV3, users can toggle or revoke host permissions at any time via `about:addons` or the extension panel.
  - **Graceful Detection**: The UI checks `extAPI.permissions.contains({ origins: ['https://f95zone.to/*'] })`. If revoked, the Library and Popup display a warning prompting the user to grant access via `permissions.request()`.

---

### E. Data Collection Permissions (`data_collection_permissions`)
- **Status**: **VERIFIED**
- **Mozilla Source**: [Mozilla Extension Workshop: Declaring data collection](https://extensionworkshop.com/documentation/publish/data-disclosure/)
- **Details**:
  - Starting late 2025, Mozilla requires extensions to declare data collection disclosures in `browser_specific_settings.gecko.data_collection_permissions`.
  - Because `f95-update-tracker` collects and transmits zero personal or telemetry data, it declares:
    ```json
    "data_collection_permissions": {
      "required": ["none"]
    }
    ```

---

### F. Alarm Persistence & Event Page Wake-up
- **Status**: **VERIFIED**
- **MDN Source**: [MDN: alarms API in Event Pages](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms)
- **Details**:
  - Unlike in-memory timers (`setTimeout`), `browser.alarms` schedules are managed directly by the browser core process outside the background script's memory.
  - When an event page goes idle and unloads, the alarm schedule remains intact. When the alarm triggers, Firefox automatically wakes up the event page and dispatches `alarms.onAlarm`.
  - All state is persisted strictly in `storage.local` before idle unload.

---

### G. Notification & Badge Text Limits in Firefox
- **Status**: **VERIFIED**
- **MDN Sources**:
  - [MDN: notifications.create](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/create)
  - [MDN: action.setBadgeText](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action/setBadgeText)
- **Details**:
  - **Rapid Notifications**: If `notifications.create()` is called multiple times in rapid succession, Firefox may suppress subsequent notification banners. Our event dispatch loops serialize or batch notifications.
  - **Badge Text**: About 4 characters fit comfortably (`"99+"` or small numbers). Firefox dynamically adjusts text contrast (black or white) automatically based on badge background color.

---

## 2. Installing on Firefox & Zen Browser

### Option A: Temporary Add-on (For Development & Testing)
1. Build the Firefox target:
   ```bash
   node scripts/build.js
   ```
2. Open Firefox or Zen Browser.
3. In the URL bar, go to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
4. Click **Load Temporary Add-on...**
5. Navigate to `dist/firefox/` and select `manifest.json`.
6. The extension is loaded and active until the browser restarts.

---

### Option B: Permanent Installation (Manual Unlisted AMO Signing)
Because release artifacts are unsigned (open-source policy: no API keys in repository), you can permanently self-sign your build via Mozilla Add-ons:

1. Download `f95-update-tracker-firefox-v0.2.0.zip` from the GitHub Release.
2. Go to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/addon/submit/upload-unlisted).
3. Select **On your own (unlisted)** distribution.
4. Upload `f95-update-tracker-firefox-v0.2.0.zip`.
5. Once automated review passes (usually within minutes), download the generated signed `.xpi` file.
6. In Firefox or Zen, drag and drop the `.xpi` file into any open browser window, or open `about:addons` -> gear icon -> **Install Add-on From File...**.

---

## 3. Manual Firefox & Zen Smoke Checklist

Run this quick test in Firefox or Zen:

- [ ] **Load**: Load temporary add-on from `dist/firefox/manifest.json` in `about:debugging#/runtime/this-firefox`. Verify zero load errors.
- [ ] **Track Game**: Open an F95zone thread (e.g. `https://f95zone.to/threads/...`). Click `+ Track Game`. Confirm modal opens, pre-fills version, and saves.
- [ ] **Highlight**: Visit `https://f95zone.to/latest/`. Confirm green `[TRACKED]` tag is rendered on the game's tile.
- [ ] **Manual Poll**: Open the popup (toolbar icon) or Library (`about:addons` -> Options). Click **Check Now**. Verify check completes and badge count displays properly.
- [ ] **Update Trigger**: In the Library, edit the installed version to `v0.0.1`. Click **Check Now**. Verify update notification fires and tag turns into red `[UPDATE <newVersion>]`.
- [ ] **Popup Actions**: Click **Mark Installed**; verify version updates and badge clears.
- [ ] **Export / Import**: Click **Export JSON**; verify download succeeds. Import file and confirm restoration.

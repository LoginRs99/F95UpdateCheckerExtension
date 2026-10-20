# Manual Testing Guide (docs/TESTING.md)

This checklist verifies all end-to-end functionality of `f95-update-tracker` inside a Chromium browser (Chrome, Brave, Edge).

## Pre-requisites
1. Build or download the extension folder (containing `manifest.json`, `icons/`, and `src/`).
2. Open Chromium browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in upper right).
4. Click **Load unpacked** and select the extension folder.
5. Verify the extension loads without warnings or errors.

---

## Testing Checklist

### 1. Track a Game on F95zone
- [ ] Visit any game thread on `https://f95zone.to/threads/<slug>.<id>/`.
- [ ] Notice the `+ Track Game` button injected into the thread header.
- [ ] Click `+ Track Game`.
- [ ] Verify the modal dialog opens, prefilled with the game's title and parsed version.
- [ ] (Optional) Add custom tags (e.g. `rpg, favorite`) or personal notes.
- [ ] Click **Track Game**.
- [ ] Verify the button immediately turns green and displays `✓ Tracked (<version>)`.

### 2. Verify Highlights on Listing Pages
- [ ] Navigate to `https://f95zone.to/latest/` or any forum game listing (`/forums/games.2/`).
- [ ] Look for the game you just tracked.
- [ ] Confirm a green `[TRACKED]` badge is rendered next to the game title.
- [ ] Scroll down to trigger dynamic loading of tiles. Confirm that newly added items are highlighted without page stutter (via `MutationObserver`).

### 3. Force an Update & Verify Alerts
- [ ] Click the extension icon in the toolbar to open the Popup, or open the Library page (`chrome://extensions` -> Extension Options).
- [ ] In the Library table, click the **Installed** version cell for your tracked game and change it to an older version (e.g. `v0.1.0`).
- [ ] Click the **Check Now** button in the popup or **Check for Updates** in the Library.
- [ ] Verify:
  1. The game status flips to `UPDATE` (red badge).
  2. The extension action badge displays a red badge count (`1`).
  3. A desktop notification pops up announcing the update.
  4. On the forum page, the game's badge switches to `[UPDATE <newVersion>]`.

### 4. Popup Quick Actions
- [ ] Open the popup.
- [ ] Verify the updated game appears in the "Updates Available" section at the top.
- [ ] Click **Open Thread**; verify it opens the thread in a new browser tab.
- [ ] Click **Mark Installed**; verify the installed version updates to match latest, the badge count clears, and status switches to "Up to Date".
- [ ] Click **Archive**; verify the game moves to the "Archived" section.

### 5. Library Page Operations
- [ ] Open the Library page (via popup gear icon or extension options).
- [ ] Test the **Search** filter: type partial game title or tag.
- [ ] Test the **Status** filter: filter by "Updates Available", "Up to Date", "Archived".
- [ ] Test the **Tag** filter: select a specific tag from the dropdown.
- [ ] Test **Bulk Archive**: check multiple games and click "Bulk Archive".
- [ ] Edit **Notes** by clicking on the notes table cell.

### 6. Backup & Restore (Export / Import)
- [ ] Click **Export JSON**.
- [ ] Verify a clean JSON file named `f95-tracker-backup-YYYY-MM-DD.json` is downloaded.
- [ ] Inspect the file to confirm it contains `schemaVersion: 1`, `settings`, and `games`.
- [ ] Delete a tracked game from the library table (click `✕`).
- [ ] Click **Import JSON** and select your backup file.
- [ ] Confirm success banner and verify the deleted game was restored.

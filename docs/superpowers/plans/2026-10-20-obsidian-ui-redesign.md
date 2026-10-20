# Obsidian Dark-Mode UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the entire extension UI/UX (Popup, Library Dashboard, Thread Page Track Button/Modal, and Forum Highlights) to match the ultra-modern, pure obsidian dark-mode aesthetic of Linear and Raycast.

**Architecture:** Replace existing basic stylesheets with a unified Obsidian design token system (`#07080a` canvas, `#0c0d10` surface, `#14161b` card, `#1c1f26` elevated, 1px hairline borders `rgba(255, 255, 255, 0.08)`, frosted glass `backdrop-filter: blur(12px)`). Upgrade all UI components with inline vector SVGs, interactive Bento metric cards, smooth micro-interactions, monospace version pills, and accessible keyboard shortcuts.

**Tech Stack:** Vanilla HTML5, CSS3 (CSS Variables, Flexbox/Grid, Backdrop Filter, Keyframe Animations), Vanilla ES Modules, Playwright for E2E verification.

**Spec:** Pure obsidian dark-mode palette modeled after Linear & Raycast tokens inspected via Playwright, preserving zero-dependency runtime and strict security constraints (rendering forum data via `textContent` only).

## Global Constraints
- Zero runtime dependencies; Vanilla JS ES modules only.
- Render all forum-derived text using `textContent` only; never `innerHTML`.
- Both distribution builds (`dist/chromium` and `dist/firefox`) must be updated and kept in sync via `scripts/build.js`.
- All 14 unit tests and 11 Playwright E2E browser tests must pass without regressions.
- `web-ext lint --source-dir dist/firefox` must report 0 errors.

## Review Focus
- **Contrast & Legibility:** Micro-typography (11-13px) and status badges must maintain high contrast against deep obsidian cards.
- **Responsive Layout:** Popup must fit comfortably within standard Chromium/Firefox extension popup limits (380px–420px width, max 580px height) without awkward scrollbars.
- **Interactive State Feedback:** Buttons, search inputs, and table rows must provide instant, subtle hover and active feedback (150ms ease).
- **Metric Cards Filtering:** Clicking Bento stats cards in the Library must dynamically apply the corresponding filter.
- **Keyboard Usability:** Search inputs must support instant focusing (`Ctrl+F` or `/`), and modals must support `Escape` to close and `Enter` to submit.

---

### Task 1: Unified SVG Icon Library and Popup Redesign
**Files:**
- Modify: `src/ui/popup/popup.html`
- Modify: `src/ui/popup/popup.css`
- Modify: `src/ui/popup/popup.js`

**Steps:**
- [ ] Add inline modern SVG icons (logo mark, refresh, gear, search, external-link, check, archive, chevron) replacing raw emojis and unicode characters.
- [ ] Implement obsidian dark token variables and glassmorphism styling in `popup.css`: `#07080a` background, frosted glass sticky header, `#14161b` card styling with 1px hairline borders.
- [ ] Style game cards with thumbnail preview / gradient placeholder, glowing update indicator dot, monospace version diff pills (`v1.0.0 → v1.2.0`), and action pill buttons.
- [ ] Implement smooth collapsible changelog drawer with monospace formatting and subtle quote border.
- [ ] Add live spin animation to refresh button when checking for updates.
- [ ] Test popup locally via syntax check and unit tests.

---

### Task 2: Library Dashboard Redesign with Bento Grid Stats
**Files:**
- Modify: `src/ui/library/library.html`
- Modify: `src/ui/library/library.css`
- Modify: `src/ui/library/library.js`

**Steps:**
- [ ] Replace header and controls with modern Linear-style frosted topbar and vector icons.
- [ ] Build 4 interactive Bento Metric Cards in a grid:
  - Total Tracked (with database/game icon)
  - Updates Available (with pulsing crimson dot)
  - Up to Date (with emerald check icon)
  - Archived (with folder/archive icon)
- [ ] Bind click events on metric cards to immediately filter the table (e.g. clicking "Updates Available" sets filter to `update`).
- [ ] Redesign search input with Raycast command-palette style (search icon, shortcut badge, clear button).
- [ ] Redesign games table: high-density rows, subtle hover highlights, monospace version badges, tag pills, inline editable cells with sleek focus rings, and action icon buttons.
- [ ] Redesign Settings and Backup/Restore sections into clean Bento cards.
- [ ] Verify functionality and syntax.

---

### Task 3: Thread Page Track Button & Modal Modernization
**Files:**
- Modify: `src/content/track-button.js`

**Steps:**
- [ ] Modernize the injected `+ Track Game` button into a sleek obsidian pill with SVG plus icon, glowing hover state, and font matching modern forum design.
- [ ] Redesign track modal with dark frosted glass overlay (`rgba(0, 0, 0, 0.7)` with `backdrop-filter: blur(8px)`), obsidian card (`#0c0d10`), hairline borders, and polished inputs.
- [ ] Add keyboard handling: `Enter` saves, `Escape` closes the modal.
- [ ] Ensure all text rendering strictly uses `textContent` / `replaceChildren()` (zero `innerHTML`).

---

### Task 4: Forum Highlight Badges Refinement
**Files:**
- Modify: `src/content/highlight.js`

**Steps:**
- [ ] Update highlight badges on forum listing cards to sleek micro-pills with pulsing indicator dots (`[UPDATE <ver>]` in vibrant rose/crimson with glow, `[TRACKED]` in emerald).
- [ ] Ensure non-intrusive layout integration so badges never distort forum grid tiles.

---

### Task 5: Build, Automated Verification & Linting
**Files:**
- Run: `node scripts/build.js`
- Test: `node scripts/check-syntax.js`
- Test: `node --test test/*.test.js`
- Test: `npx web-ext lint --source-dir dist/firefox`
- Test: `npx playwright test`

**Steps:**
- [ ] Run `node scripts/build.js` to propagate all redesign changes to `dist/chromium/` and `dist/firefox/`.
- [ ] Run syntax check across all 17 JS files.
- [ ] Run all 14 unit tests.
- [ ] Run `web-ext lint` on `dist/firefox/` (confirm 0 errors).
- [ ] Run all 11 Playwright E2E browser tests against `dist/chromium/` and ensure 100% green.
- [ ] Commit changes with clear message.

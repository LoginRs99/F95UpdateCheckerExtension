// src/ui/library/library.js
// Options & Management Library page.
// Safe textContent rendering throughout.

import { validateImportPayload } from '../../background/store.js';

let gamesMap = {};
let selectedIds = new Set();
let allTags = new Set();

const tbody = document.getElementById('games-tbody');
const selectAllCheckbox = document.getElementById('select-all');
const filterSearch = document.getElementById('filter-search');
const filterStatus = document.getElementById('filter-status');
const filterTag = document.getElementById('filter-tag');
const sortBy = document.getElementById('sort-by');

const btnRefresh = document.getElementById('btn-refresh');
const btnBulkArchive = document.getElementById('btn-bulk-archive');
const btnBulkDelete = document.getElementById('btn-bulk-delete');

const btnSaveSettings = document.getElementById('btn-save-settings');
const settingPollMinutes = document.getElementById('setting-poll-minutes');
const settingPageDepth = document.getElementById('setting-page-depth');
const settingDailyCap = document.getElementById('setting-daily-cap');

const btnExportJson = document.getElementById('btn-export-json');
const importFileInput = document.getElementById('import-file-input');
const importStatus = document.getElementById('import-status');
const statusBanner = document.getElementById('status-banner');

async function loadData() {
  try {
    const [games, status] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_GAMES' }),
      chrome.runtime.sendMessage({ type: 'GET_STATUS' })
    ]);

    gamesMap = games || {};
    populateSettings(status ? status.settings : null);
    extractTags();
    renderTable();
  } catch (err) {
    console.error('Failed to load library data:', err);
    showBanner('Error loading data: ' + err.message, 'error');
  }
}

function showBanner(message, type = 'success') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
  statusBanner.style.display = 'block';
  setTimeout(() => {
    statusBanner.style.display = 'none';
  }, 4000);
}

function populateSettings(settings) {
  if (!settings) return;
  settingPollMinutes.value = settings.pollMinutes || 30;
  settingPageDepth.value = settings.pageDepthCap || 3;
  settingDailyCap.value = settings.dailyRequestCap || 200;
  updatePausedStateBanner(settings);
}

function updatePausedStateBanner(settings) {
  const banner = document.getElementById('paused-state-banner');
  if (!banner) return;
  if (!settings) {
    banner.style.display = 'none';
    return;
  }

  const now = Date.now();
  if (settings.circuitBreakerUntil && now < settings.circuitBreakerUntil) {
    const mins = Math.max(1, Math.round((settings.circuitBreakerUntil - now) / 60000));
    banner.textContent = `⚠️ Polling paused: Circuit breaker active (anti-hammer protection) for ${mins} more minute(s).`;
    banner.style.display = 'block';
  } else if (settings.requestCountToday >= settings.dailyRequestCap) {
    banner.textContent = `⚠️ Polling paused: Daily request cap reached (${settings.requestCountToday}/${settings.dailyRequestCap}). Resets tomorrow.`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function extractTags() {
  allTags.clear();
  for (const g of Object.values(gamesMap)) {
    if (Array.isArray(g.tags)) {
      for (const t of g.tags) {
        if (t) allTags.add(t);
      }
    }
  }

  // Populate tag filter select
  const currentTag = filterTag.value;
  filterTag.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'Tag: All';
  filterTag.appendChild(allOpt);

  for (const tag of [...allTags].sort()) {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    filterTag.appendChild(opt);
  }

  if (allTags.has(currentTag)) {
    filterTag.value = currentTag;
  }
}

function getFilteredAndSortedGames() {
  const query = filterSearch.value.toLowerCase().trim();
  const status = filterStatus.value;
  const tag = filterTag.value;
  const sort = sortBy.value;

  let list = Object.values(gamesMap).filter(g => {
    // Search
    if (query) {
      const matchTitle = g.title && g.title.toLowerCase().includes(query);
      const matchNotes = g.notes && g.notes.toLowerCase().includes(query);
      const matchTag = g.tags && g.tags.some(t => t.toLowerCase().includes(query));
      if (!matchTitle && !matchNotes && !matchTag) return false;
    }

    // Status filter
    if (status === 'update' && (g.archived || g.status !== 'update')) return false;
    if (status === 'current' && (g.archived || g.status !== 'current')) return false;
    if (status === 'archived' && !g.archived) return false;

    // Tag filter
    if (tag !== 'all' && (!g.tags || !g.tags.includes(tag))) return false;

    return true;
  });

  // Sorting
  list.sort((a, b) => {
    if (sort === 'title_asc') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sort === 'latest_seen') {
      return (b.latestSeenAt || 0) - (a.latestSeenAt || 0);
    }
    if (sort === 'added_desc') {
      return (b.addedAt || 0) - (a.addedAt || 0);
    }
    return 0;
  });

  return list;
}

function renderTable() {
  tbody.replaceChildren();
  const games = getFilteredAndSortedGames();

  if (games.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'text-center py-6';
    td.textContent = 'No games match your filters.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    updateBulkButtons();
    return;
  }

  for (const game of games) {
    const tr = document.createElement('tr');

    // 1. Checkbox
    const tdCheck = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = selectedIds.has(game.id);
    chk.addEventListener('change', () => {
      if (chk.checked) {
        selectedIds.add(game.id);
      } else {
        selectedIds.delete(game.id);
      }
      updateBulkButtons();
    });
    tdCheck.appendChild(chk);
    tr.appendChild(tdCheck);

    // 2. Title & Link
    const tdTitle = document.createElement('td');
    const a = document.createElement('a');
    a.href = game.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'game-link';
    a.textContent = game.title || 'Untitled';
    tdTitle.appendChild(a);
    tr.appendChild(tdTitle);

    // 3. Installed Version (editable inline on click)
    const tdInst = document.createElement('td');
    const instSpan = document.createElement('span');
    instSpan.textContent = game.installedVersion || 'none';
    instSpan.style.cursor = 'pointer';
    instSpan.title = 'Click to edit installed version';
    instSpan.addEventListener('click', () => {
      const newVer = prompt('Edit Installed Version:', game.installedVersion || '');
      if (newVer !== null && newVer.trim() !== game.installedVersion) {
        chrome.runtime.sendMessage({
          type: 'UPDATE_GAME',
          id: game.id,
          payload: { installedVersion: newVer.trim() }
        }, loadData);
      }
    });
    tdInst.appendChild(instSpan);
    tr.appendChild(tdInst);

    // 4. Latest Version
    const tdLatest = document.createElement('td');
    tdLatest.textContent = game.latestVersion || 'unknown';
    tr.appendChild(tdLatest);

    // 5. Status
    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    if (game.archived) {
      badge.className = 'badge badge-archived';
      badge.textContent = 'Archived';
    } else if (game.status === 'update') {
      badge.className = 'badge badge-update';
      badge.textContent = 'UPDATE';
    } else {
      badge.className = 'badge badge-current';
      badge.textContent = 'Current';
    }
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // 6. Tags
    const tdTags = document.createElement('td');
    if (Array.isArray(game.tags)) {
      for (const t of game.tags) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = t;
        tdTags.appendChild(chip);
      }
    }
    tr.appendChild(tdTags);

    // 7. Notes
    const tdNotes = document.createElement('td');
    tdNotes.textContent = game.notes || '';
    tdNotes.style.cursor = 'pointer';
    tdNotes.title = 'Click to edit notes';
    tdNotes.addEventListener('click', () => {
      const newNotes = prompt('Edit Notes:', game.notes || '');
      if (newNotes !== null && newNotes !== game.notes) {
        chrome.runtime.sendMessage({
          type: 'UPDATE_GAME',
          id: game.id,
          payload: { notes: newNotes }
        }, loadData);
      }
    });
    tr.appendChild(tdNotes);

    // 8. Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'text-right';

    if (game.status === 'update' && !game.archived) {
      const btnMark = document.createElement('button');
      btnMark.className = 'btn btn-primary btn-sm';
      btnMark.textContent = 'Installed';
      btnMark.style.marginRight = '4px';
      btnMark.title = 'Mark latest version as installed';
      btnMark.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_GAME',
          id: game.id,
          payload: { installedVersion: game.latestVersion, status: 'current' }
        });
        await loadData();
      });
      tdActions.appendChild(btnMark);
    }

    const btnArchive = document.createElement('button');
    btnArchive.className = 'btn btn-secondary btn-sm';
    btnArchive.textContent = game.archived ? 'Restore' : 'Archive';
    btnArchive.style.marginRight = '4px';
    btnArchive.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_GAME',
        id: game.id,
        payload: { archived: !game.archived }
      });
      await loadData();
    });
    tdActions.appendChild(btnArchive);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-danger btn-sm';
    btnDel.textContent = '✕';
    btnDel.title = 'Untrack and delete game';
    btnDel.addEventListener('click', async () => {
      if (confirm(`Untrack "${game.title}"?`)) {
        await chrome.runtime.sendMessage({ type: 'REMOVE_GAME', id: game.id });
        selectedIds.delete(game.id);
        await loadData();
      }
    });
    tdActions.appendChild(btnDel);

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }

  updateBulkButtons();
}

function updateBulkButtons() {
  const count = selectedIds.size;
  btnBulkArchive.disabled = count === 0;
  btnBulkDelete.disabled = count === 0;
  btnBulkArchive.textContent = count > 0 ? `Bulk Archive (${count})` : 'Bulk Archive';
  btnBulkDelete.textContent = count > 0 ? `Bulk Delete (${count})` : 'Bulk Delete';
}

// Select All
selectAllCheckbox.addEventListener('change', () => {
  const games = getFilteredAndSortedGames();
  if (selectAllCheckbox.checked) {
    for (const g of games) selectedIds.add(g.id);
  } else {
    for (const g of games) selectedIds.delete(g.id);
  }
  renderTable();
});

// Bulk Archive
btnBulkArchive.addEventListener('click', async () => {
  for (const id of selectedIds) {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_GAME',
      id,
      payload: { archived: true }
    });
  }
  selectedIds.clear();
  showBanner('Selected games archived.');
  await loadData();
});

// Bulk Delete
btnBulkDelete.addEventListener('click', async () => {
  if (!confirm(`Delete ${selectedIds.size} tracked games?`)) return;
  for (const id of selectedIds) {
    await chrome.runtime.sendMessage({ type: 'REMOVE_GAME', id });
  }
  selectedIds.clear();
  showBanner('Selected games removed.');
  await loadData();
});

// Filter & Sort event listeners
filterSearch.addEventListener('input', renderTable);
filterStatus.addEventListener('change', renderTable);
filterTag.addEventListener('change', renderTable);
sortBy.addEventListener('change', renderTable);

// Refresh / Poll Now
btnRefresh.addEventListener('click', async () => {
  btnRefresh.disabled = true;
  btnRefresh.textContent = 'Checking...';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'POLL_NOW' });
    if (res && res.trippedCircuitBreaker) {
      showBanner('⚠️ Check failed: Circuit breaker tripped due to forum challenge/rate limit.', 'error');
    } else if (res && res.skipped && res.reason === 'circuit_breaker') {
      showBanner('⚠️ Polling paused: Circuit breaker active.', 'error');
    } else if (res && res.skipped && res.reason === 'daily_cap') {
      showBanner('⚠️ Polling paused: Daily request cap reached.', 'error');
    } else if (res && res.error) {
      showBanner(`Check error: ${res.error}`, 'error');
    } else {
      showBanner('Check completed.');
    }
    await loadData();
  } catch (err) {
    showBanner('Check failed: ' + err.message, 'error');
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = 'Check for Updates';
  }
});

// Save Settings
btnSaveSettings.addEventListener('click', async () => {
  const pollMins = parseInt(settingPollMinutes.value, 10);
  const pageDepth = parseInt(settingPageDepth.value, 10);
  const dailyCap = parseInt(settingDailyCap.value, 10);

  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: {
      pollMinutes: Math.max(15, pollMins || 30),
      pageDepthCap: Math.max(1, Math.min(10, pageDepth || 3)),
      dailyRequestCap: Math.max(10, dailyCap || 150)
    }
  });

  showBanner('Settings saved successfully.');
});

// Export JSON
btnExportJson.addEventListener('click', async () => {
  const data = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `f95-tracker-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Import JSON with Schema Validation
importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    // Validate schema
    const validation = validateImportPayload(json);
    if (!validation.valid) {
      showBanner(`Import Error: ${validation.error}`, 'error');
      return;
    }

    const res = await chrome.runtime.sendMessage({
      type: 'IMPORT_DATA',
      payload: json,
      options: { merge: true }
    });

    if (res.error) {
      showBanner(`Import failed: ${res.error}`, 'error');
    } else {
      showBanner(`Successfully imported ${res.importedCount} games (Total: ${res.totalCount}).`);
      await loadData();
    }
  } catch (err) {
    showBanner(`Invalid JSON file: ${err.message}`, 'error');
  } finally {
    importFileInput.value = '';
  }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', loadData);

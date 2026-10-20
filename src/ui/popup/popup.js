// src/ui/popup/popup.js
// Handles popup UI logic, high-density compact layout, active tab detection,
// version dropdowns, and instant search/filters.
// Strict textContent rendering only.

import { extAPI } from '../../compat.js';

let allGames = {};
let searchQuery = '';
let activeFilter = 'all'; // 'all' | 'updates' | 'current' | 'archived'
let activeTabInfo = null;

const gameListEl = document.getElementById('game-list');
const badgeCountEl = document.getElementById('badge-count');
const footerStatsEl = document.getElementById('footer-stats');
const searchInput = document.getElementById('popup-search');
const btnCheckNow = document.getElementById('btn-check-now');
const btnOpenLibrary = document.getElementById('btn-open-library');
const pausedAlertEl = document.getElementById('popup-paused-alert');
const activeTabBannerEl = document.getElementById('active-tab-banner');
const btnToggleAdd = document.getElementById('btn-toggle-add');
const quickAddPanel = document.getElementById('quick-add-panel');
const quickAddInput = document.getElementById('quick-add-input');
const btnQuickAddResolve = document.getElementById('btn-quick-add-resolve');
const quickAddPreview = document.getElementById('quick-add-preview');
const previewTitle = document.getElementById('preview-title');
const previewVersionSelect = document.getElementById('preview-version-select');
const previewVersionCustom = document.getElementById('preview-version-custom');
const btnConfirmAdd = document.getElementById('btn-confirm-add');
const btnCancelAdd = document.getElementById('btn-cancel-add');

// Filter count elements
const countAllEl = document.getElementById('count-all');
const countUpdatesEl = document.getElementById('count-updates');
const countCurrentEl = document.getElementById('count-current');
const countArchivedEl = document.getElementById('count-archived');

let pendingQuickAddData = null;

async function loadData() {
  try {
    const [games, status] = await Promise.all([
      extAPI.runtime.sendMessage({ type: 'GET_GAMES' }),
      extAPI.runtime.sendMessage({ type: 'GET_STATUS' })
    ]);
    allGames = games || {};
    updatePausedBanner(status ? status.settings : null);
    await checkHostPermission();
    await checkActiveTab();
    renderList();
  } catch (err) {
    console.error('Failed to load games:', err);
    renderError('Could not load tracked games.');
  }
}

async function checkHostPermission() {
  if (extAPI && extAPI.permissions && extAPI.permissions.contains) {
    try {
      const hasPerm = await extAPI.permissions.contains({ origins: ['https://f95zone.to/*'] });
      if (!hasPerm) {
        pausedAlertEl.textContent = 'Missing permission for f95zone.to. Click here to grant.';
        pausedAlertEl.style.display = 'block';
        pausedAlertEl.style.cursor = 'pointer';
        pausedAlertEl.onclick = async () => {
          await extAPI.permissions.request({ origins: ['https://f95zone.to/*'] });
          loadData();
        };
      }
    } catch {}
  }
}

function updatePausedBanner(settings) {
  if (!pausedAlertEl) return;
  if (!settings) {
    pausedAlertEl.style.display = 'none';
    return;
  }

  const now = Date.now();
  if (settings.circuitBreakerUntil && now < settings.circuitBreakerUntil) {
    const mins = Math.max(1, Math.round((settings.circuitBreakerUntil - now) / 60000));
    pausedAlertEl.textContent = `Paused: Circuit breaker active (${mins}m remaining).`;
    pausedAlertEl.style.display = 'block';
  } else if (settings.requestCountToday >= settings.dailyRequestCap) {
    pausedAlertEl.textContent = `Paused: Daily request cap reached (${settings.requestCountToday}/${settings.dailyRequestCap}).`;
    pausedAlertEl.style.display = 'block';
  } else {
    pausedAlertEl.style.display = 'none';
  }
}

/**
 * Checks if user is currently on an F95zone thread tab.
 * If yes, offers 1-click tracking with version dropdown right in the popup!
 */
async function checkActiveTab() {
  if (!activeTabBannerEl || !extAPI.tabs || !extAPI.tabs.query) return;

  try {
    let targetTab = null;
    const tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('f95zone.to/threads/')) {
      targetTab = tabs[0];
    } else {
      // Fallback: check other open tabs for an f95zone thread
      const f95Tabs = await extAPI.tabs.query({ url: '*://*.f95zone.to/threads/*' });
      if (f95Tabs && f95Tabs.length > 0) {
        targetTab = f95Tabs[f95Tabs.length - 1];
      }
    }

    if (!targetTab || !targetTab.url) {
      activeTabBannerEl.style.display = 'none';
      activeTabInfo = null;
      return;
    }

    const match = targetTab.url.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
    if (!match) {
      activeTabBannerEl.style.display = 'none';
      activeTabInfo = null;
      return;
    }

    const threadId = match[1];

    // Try messaging content script for instant DOM-based info
    let info = null;
    try {
      info = await extAPI.tabs.sendMessage(targetTab.id, { type: 'GET_PAGE_THREAD_INFO' });
    } catch {}

    // Fallback: resolve via background service worker
    if (!info) {
      info = await extAPI.runtime.sendMessage({ type: 'RESOLVE_THREAD', input: targetTab.url });
      if (info) {
        info.threadId = info.id;
        info.currentVersion = info.latestVersion;
        info.url = targetTab.url;
      }
    }

    if (!info) {
      activeTabBannerEl.style.display = 'none';
      return;
    }

    activeTabInfo = info;
    renderActiveTabBanner(threadId, info);
  } catch (err) {
    console.warn('Could not inspect active tab:', err);
    activeTabBannerEl.style.display = 'none';
  }
}

function renderActiveTabBanner(threadId, info) {
  activeTabBannerEl.replaceChildren();

  const isAlreadyTracked = Boolean(allGames[threadId]);

  if (isAlreadyTracked) {
    const trackedGame = allGames[threadId];
    activeTabBannerEl.style.display = 'flex';
    activeTabBannerEl.className = 'active-tab-banner';

    const topRow = document.createElement('div');
    topRow.className = 'active-tab-top';

    const indicator = document.createElement('span');
    indicator.className = 'active-tab-indicator';
    const dot = document.createElement('span');
    dot.className = 'active-tab-dot';
    dot.style.backgroundColor = '#10b981';
    dot.style.boxShadow = '0 0 6px #10b981';
    indicator.appendChild(dot);
    const indText = document.createTextNode(' Active Tab (Tracked)');
    indicator.appendChild(indText);

    topRow.appendChild(indicator);
    activeTabBannerEl.appendChild(topRow);

    const titleEl = document.createElement('div');
    titleEl.className = 'active-tab-game-title';
    titleEl.textContent = trackedGame.title || info.title;
    activeTabBannerEl.appendChild(titleEl);

    const controls = document.createElement('div');
    controls.className = 'active-tab-controls';

    const verInfo = document.createElement('span');
    verInfo.className = 'active-tab-label';
    verInfo.textContent = `Installed: ${trackedGame.installedVersion} | Latest: ${trackedGame.latestVersion}`;
    controls.appendChild(verInfo);

    if (trackedGame.status === 'update') {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn btn-primary btn-xs';
      updateBtn.textContent = 'Mark Updated';
      updateBtn.addEventListener('click', async () => {
        await extAPI.runtime.sendMessage({
          type: 'UPDATE_GAME',
          id: threadId,
          payload: { installedVersion: trackedGame.latestVersion, status: 'current' }
        });
        await loadData();
      });
      controls.appendChild(updateBtn);
    }

    activeTabBannerEl.appendChild(controls);
    return;
  }

  // Untracked tab -> show 1-click track card with version dropdown
  activeTabBannerEl.style.display = 'flex';
  activeTabBannerEl.className = 'active-tab-banner';

  const topRow = document.createElement('div');
  topRow.className = 'active-tab-top';

  const indicator = document.createElement('span');
  indicator.className = 'active-tab-indicator';
  const dot = document.createElement('span');
  dot.className = 'active-tab-dot';
  indicator.appendChild(dot);
  const indText = document.createTextNode(' F95zone Tab Detected');
  indicator.appendChild(indText);
  topRow.appendChild(indicator);
  activeTabBannerEl.appendChild(topRow);

  const titleEl = document.createElement('div');
  titleEl.className = 'active-tab-game-title';
  titleEl.textContent = info.title;
  titleEl.title = info.title;
  activeTabBannerEl.appendChild(titleEl);

  const controls = document.createElement('div');
  controls.className = 'active-tab-controls';

  const versionGroup = document.createElement('div');
  versionGroup.className = 'active-tab-version-group';

  const label = document.createElement('span');
  label.className = 'active-tab-label';
  label.textContent = 'Installed:';
  versionGroup.appendChild(label);

  const select = document.createElement('select');
  select.id = 'active-tab-version-select';
  select.className = 'form-select';

  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.id = 'active-tab-custom-version';
  customInput.className = 'form-input';
  customInput.placeholder = 'e.g. v0.9.5';
  customInput.style.display = 'none';

  const availableVersions = (info.versions && info.versions.length > 0)
    ? info.versions
    : [info.currentVersion || 'v1.0.0'];

  for (let i = 0; i < availableVersions.length; i++) {
    const v = availableVersions[i];
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = (i === 0) ? `${v} (Latest)` : v;
    select.appendChild(opt);
  }

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Custom / Other...';
  select.appendChild(customOpt);

  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      select.style.display = 'none';
      customInput.style.display = 'inline-block';
      customInput.focus();
    }
  });

  versionGroup.appendChild(select);
  versionGroup.appendChild(customInput);
  controls.appendChild(versionGroup);

  const trackBtn = document.createElement('button');
  trackBtn.type = 'button';
  trackBtn.id = 'btn-active-tab-track';
  trackBtn.className = 'btn btn-primary btn-sm';
  trackBtn.textContent = '+ Track Game';

  trackBtn.addEventListener('click', async () => {
    trackBtn.disabled = true;
    trackBtn.textContent = 'Saving...';
    try {
      const selectedVersion = (select.value === '__custom__')
        ? (customInput.value.trim() || info.currentVersion || 'v1.0.0')
        : select.value;

      await extAPI.runtime.sendMessage({
        type: 'QUICK_ADD_GAME',
        input: info.url || `https://f95zone.to/threads/${threadId}/`,
        title: info.title,
        latestVersion: info.currentVersion || 'v1.0.0',
        installedVersion: selectedVersion,
        prefixes: info.prefixes || []
      });

      await loadData();
    } catch (err) {
      console.error('Failed to track tab game:', err);
      trackBtn.disabled = false;
      trackBtn.textContent = '+ Track Game';
    }
  });

  controls.appendChild(trackBtn);
  activeTabBannerEl.appendChild(controls);
}

function renderError(msg) {
  gameListEl.replaceChildren();
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = msg;
  gameListEl.appendChild(div);
}

function renderList() {
  gameListEl.replaceChildren();

  const games = Object.values(allGames);
  const totalCount = games.length;
  const updateCount = games.filter(g => !g.archived && g.status === 'update').length;
  const currentCount = games.filter(g => !g.archived && g.status !== 'update').length;
  const archivedCount = games.filter(g => g.archived).length;

  // Header badge
  if (updateCount > 0) {
    badgeCountEl.textContent = String(updateCount);
    badgeCountEl.style.display = 'inline-flex';
  } else {
    badgeCountEl.style.display = 'none';
  }

  // Update filter pill counts
  if (countAllEl) countAllEl.textContent = String(totalCount);
  if (countUpdatesEl) countUpdatesEl.textContent = String(updateCount);
  if (countCurrentEl) countCurrentEl.textContent = String(currentCount);
  if (countArchivedEl) countArchivedEl.textContent = String(archivedCount);

  // Footer stats
  footerStatsEl.textContent = `Tracking ${totalCount} game${totalCount === 1 ? '' : 's'} (${updateCount} update${updateCount === 1 ? '' : 's'})`;

  if (totalCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No games tracked yet. Browse F95zone or click "+" to add a game!';
    gameListEl.appendChild(empty);
    return;
  }

  // Filter games based on active filter pill and search query
  const query = searchQuery.toLowerCase().trim();
  const filtered = games.filter(g => {
    // 1. Tab filter
    if (activeFilter === 'updates' && (g.archived || g.status !== 'update')) return false;
    if (activeFilter === 'current' && (g.archived || g.status === 'update')) return false;
    if (activeFilter === 'archived' && !g.archived) return false;

    // 2. Search query filter
    if (!query) return true;
    return (g.title && g.title.toLowerCase().includes(query)) ||
           (g.tags && g.tags.some(t => t.toLowerCase().includes(query)));
  });

  if (filtered.length === 0) {
    const noMatch = document.createElement('div');
    noMatch.className = 'empty-state';
    noMatch.textContent = 'No matching games found.';
    gameListEl.appendChild(noMatch);
    return;
  }

  // Group: updates first (non-archived with status == 'update'), then current, then archived
  const updates = filtered.filter(g => !g.archived && g.status === 'update');
  const current = filtered.filter(g => !g.archived && g.status !== 'update');
  const archived = filtered.filter(g => g.archived);

  if (updates.length > 0) {
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = `Updates Available (${updates.length})`;
    gameListEl.appendChild(title);

    for (const game of updates) {
      gameListEl.appendChild(createGameCard(game));
    }
  }

  if (current.length > 0) {
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = `Up to Date (${current.length})`;
    gameListEl.appendChild(title);

    for (const game of current) {
      gameListEl.appendChild(createGameCard(game));
    }
  }

  if (archived.length > 0) {
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = `Archived (${archived.length})`;
    gameListEl.appendChild(title);

    for (const game of archived) {
      gameListEl.appendChild(createGameCard(game));
    }
  }
}

/**
 * Creates high-density compact obsidian game item.
 * Clicking row toggles expanded drawer.
 */
function createGameCard(game) {
  const isUpdate = game.status === 'update' && !game.archived;
  const card = document.createElement('div');
  card.className = `game-card ${isUpdate ? 'has-update' : ''}`;

  // Card Header / Compact Row
  const header = document.createElement('div');
  header.className = 'game-card-header';

  // Left side: Status dot + Title
  const left = document.createElement('div');
  left.className = 'game-card-left';

  const dot = document.createElement('span');
  dot.className = `status-dot ${isUpdate ? 'status-dot-update' : (game.archived ? 'status-dot-archived' : 'status-dot-current')}`;
  left.appendChild(dot);

  const titleLink = document.createElement('a');
  titleLink.className = 'game-title';
  titleLink.href = game.url;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = game.title || 'Untitled Game';
  titleLink.title = game.title || '';
  titleLink.addEventListener('click', (e) => {
    e.stopPropagation();
    extAPI.tabs.create({ url: game.url });
  });
  left.appendChild(titleLink);
  header.appendChild(left);

  // Right side: Version chip + Action buttons + Chevron
  const right = document.createElement('div');
  right.className = 'game-card-right';

  const verChip = document.createElement('span');
  verChip.className = `version-chip ${isUpdate ? 'version-chip-update' : ''}`;
  if (isUpdate) {
    verChip.textContent = `${game.installedVersion || 'none'} → ${game.latestVersion}`;
  } else {
    verChip.textContent = game.installedVersion || game.latestVersion || '';
  }
  right.appendChild(verChip);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // If update is available, provide 1-click Mark Installed button
  if (isUpdate) {
    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'btn btn-primary btn-xs';
    markBtn.textContent = 'Mark Installed';
    markBtn.title = 'Set installed version to latest version';
    markBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      markBtn.disabled = true;
      await extAPI.runtime.sendMessage({
        type: 'UPDATE_GAME',
        id: game.id,
        payload: {
          installedVersion: game.latestVersion,
          status: 'current'
        }
      });
      await loadData();
    });
    actions.appendChild(markBtn);
  }

  // Archive button
  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.className = 'btn btn-secondary btn-xs';
  archiveBtn.textContent = game.archived ? 'Unarchive' : 'Archive';
  archiveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await extAPI.runtime.sendMessage({
      type: 'UPDATE_GAME',
      id: game.id,
      payload: { archived: !game.archived }
    });
    await loadData();
  });
  actions.appendChild(archiveBtn);

  // Chevron toggle
  const chevron = document.createElement('span');
  chevron.className = 'chevron-icon';
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  actions.appendChild(chevron);

  right.appendChild(actions);
  header.appendChild(right);
  card.appendChild(header);

  // Expanded Details Drawer
  const details = document.createElement('div');
  details.className = 'game-card-details';

  // Version Picker Row (lets user change installed version easily)
  const verPicker = document.createElement('div');
  verPicker.className = 'card-version-picker';

  const vLabel = document.createElement('label');
  vLabel.textContent = 'Installed:';
  verPicker.appendChild(vLabel);

  const vSelect = document.createElement('select');
  vSelect.className = 'form-select';

  // Populate with game's known versions or current/latest
  const versions = [game.installedVersion, game.latestVersion].filter(Boolean);
  const uniqueVers = [...new Set(versions)];
  for (const v of uniqueVers) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = (v === game.latestVersion) ? `${v} (Latest)` : v;
    if (v === game.installedVersion) opt.selected = true;
    vSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Edit custom...';
  vSelect.appendChild(customOpt);

  vSelect.addEventListener('change', async (e) => {
    e.stopPropagation();
    let newVer = vSelect.value;
    if (newVer === '__custom__') {
      const customVal = window.prompt('Enter installed version:', game.installedVersion || '');
      if (customVal !== null && customVal.trim()) {
        newVer = customVal.trim();
      } else {
        vSelect.value = game.installedVersion;
        return;
      }
    }
    const newStatus = (newVer !== game.latestVersion) ? 'update' : 'current';
    await extAPI.runtime.sendMessage({
      type: 'UPDATE_GAME',
      id: game.id,
      payload: { installedVersion: newVer, status: newStatus }
    });
    await loadData();
  });
  verPicker.appendChild(vSelect);
  details.appendChild(verPicker);

  // Changelog Snippet (if available)
  if (game.changelogSnippet) {
    const clBox = document.createElement('div');
    clBox.className = 'changelog-box';
    clBox.textContent = game.changelogSnippet;
    details.appendChild(clBox);
  }

  // Tags (if available)
  if (Array.isArray(game.tags) && game.tags.length > 0) {
    const tagList = document.createElement('div');
    tagList.className = 'tag-list';
    for (const tag of game.tags) {
      const tagBadge = document.createElement('span');
      tagBadge.className = 'tag-badge';
      tagBadge.textContent = `#${tag}`;
      tagList.appendChild(tagBadge);
    }
    details.appendChild(tagList);
  }

  // Expanded Actions
  const expActions = document.createElement('div');
  expActions.className = 'card-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-secondary btn-xs';
  openBtn.textContent = 'Open Thread';
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    extAPI.tabs.create({ url: game.url });
  });
  expActions.appendChild(openBtn);

  details.appendChild(expActions);
  card.appendChild(details);

  // Click row to toggle expand
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

// Search filter listener
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderList();
});

// Filter pills listener
const filterPillsContainer = document.getElementById('filter-pills');
if (filterPillsContainer) {
  filterPillsContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    const filter = pill.getAttribute('data-filter');
    if (!filter) return;

    activeFilter = filter;
    for (const p of filterPillsContainer.querySelectorAll('.filter-pill')) {
      p.classList.remove('active');
    }
    pill.classList.add('active');
    renderList();
  });
}

// Toggle Quick Add panel
btnToggleAdd.addEventListener('click', () => {
  const isHidden = quickAddPanel.style.display === 'none';
  quickAddPanel.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) {
    quickAddInput.focus();
  } else {
    quickAddPreview.style.display = 'none';
  }
});

// Resolve thread for quick add
btnQuickAddResolve.addEventListener('click', async () => {
  const rawInput = quickAddInput.value.trim();
  if (!rawInput) return;

  btnQuickAddResolve.disabled = true;
  btnQuickAddResolve.textContent = '...';

  try {
    const res = await extAPI.runtime.sendMessage({
      type: 'RESOLVE_THREAD',
      input: rawInput
    });

    if (!res || res.error) {
      alert(res ? res.error : 'Could not fetch thread details.');
      return;
    }

    pendingQuickAddData = res;
    previewTitle.textContent = res.title;

    previewVersionSelect.replaceChildren();
    for (let i = 0; i < res.versions.length; i++) {
      const v = res.versions[i];
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = (i === 0) ? `${v} (Latest)` : v;
      previewVersionSelect.appendChild(opt);
    }
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Custom / Other...';
    previewVersionSelect.appendChild(customOpt);

    previewVersionSelect.onchange = () => {
      if (previewVersionSelect.value === '__custom__') {
        previewVersionSelect.style.display = 'none';
        previewVersionCustom.style.display = 'inline-block';
        previewVersionCustom.focus();
      }
    };

    quickAddPreview.style.display = 'flex';
  } catch (err) {
    console.error('Resolve error:', err);
    alert('Failed to resolve thread: ' + err.message);
  } finally {
    btnQuickAddResolve.disabled = false;
    btnQuickAddResolve.textContent = 'Find';
  }
});

// Confirm Quick Add
btnConfirmAdd.addEventListener('click', async () => {
  if (!pendingQuickAddData) return;

  btnConfirmAdd.disabled = true;
  btnConfirmAdd.textContent = 'Saving...';

  try {
    const selectedVersion = (previewVersionSelect.value === '__custom__')
      ? (previewVersionCustom.value.trim() || pendingQuickAddData.latestVersion || 'v1.0.0')
      : previewVersionSelect.value;

    await extAPI.runtime.sendMessage({
      type: 'QUICK_ADD_GAME',
      input: pendingQuickAddData.id,
      title: pendingQuickAddData.title,
      latestVersion: pendingQuickAddData.latestVersion,
      installedVersion: selectedVersion,
      prefixes: pendingQuickAddData.prefixes || []
    });

    quickAddPanel.style.display = 'none';
    quickAddPreview.style.display = 'none';
    quickAddInput.value = '';
    pendingQuickAddData = null;

    await loadData();
  } catch (err) {
    console.error('Save error:', err);
    alert('Failed to save game: ' + err.message);
  } finally {
    btnConfirmAdd.disabled = false;
    btnConfirmAdd.textContent = '+ Track Game';
  }
});

btnCancelAdd.addEventListener('click', () => {
  quickAddPreview.style.display = 'none';
  pendingQuickAddData = null;
});

// Check now button listener
btnCheckNow.addEventListener('click', async () => {
  btnCheckNow.disabled = true;
  const labelEl = btnCheckNow.querySelector('.btn-label') || btnCheckNow;
  const svgEl = btnCheckNow.querySelector('.btn-icon-svg');
  if (svgEl) svgEl.classList.add('spin');
  labelEl.textContent = 'Checking...';
  try {
    await extAPI.runtime.sendMessage({ type: 'POLL_NOW' });
    await loadData();
  } finally {
    btnCheckNow.disabled = false;
    if (svgEl) svgEl.classList.remove('spin');
    labelEl.textContent = 'Check Now';
  }
});

// Open Library listener
btnOpenLibrary.addEventListener('click', () => {
  if (extAPI.runtime.openOptionsPage) {
    extAPI.runtime.openOptionsPage();
  } else {
    extAPI.tabs.create({ url: extAPI.runtime.getURL('src/ui/library/library.html') });
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', loadData);

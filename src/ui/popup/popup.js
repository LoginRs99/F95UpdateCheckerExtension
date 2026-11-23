// src/ui/popup/popup.js
// Modern Web Guidance (MWG) Compliant Popup Controller
// High-density layout, active tab detection, last-checked timestamp,
// quick settings, and safe DOM manipulation.

import { extAPI } from '../../compat.js';
import { parseThreadHeading, parseThreadSlug, parseThreadIdFromUrl } from '../../background/detector.js';

let allGames = {};
let currentSettings = null;
let searchQuery = '';
let activeFilter = 'all'; // 'all' | 'updates' | 'current' | 'archived'
let activeTabInfo = null;

// DOM Element references
const gameListEl = document.getElementById('game-list');
const badgeCountEl = document.getElementById('badge-count');
const lastCheckedLabelEl = document.getElementById('last-checked-label');
const footerStatsEl = document.getElementById('footer-stats');
const searchInput = document.getElementById('popup-search');
const btnClearSearch = document.getElementById('btn-clear-search');
const btnCheckNow = document.getElementById('btn-check-now');
const btnToggleAdd = document.getElementById('btn-toggle-add');
const btnToggleSettings = document.getElementById('btn-toggle-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnCloseQuickAdd = document.getElementById('btn-close-quick-add');
const btnOpenFullLibrary = document.getElementById('btn-open-full-library');
const pausedAlertEl = document.getElementById('popup-paused-alert');
const activeTabBannerEl = document.getElementById('active-tab-banner');

// Quick Add Panel elements
const quickAddPanel = document.getElementById('quick-add-panel');
const quickAddInput = document.getElementById('quick-add-input');
const quickAddFeedback = document.getElementById('quick-add-feedback');
const btnQuickAddResolve = document.getElementById('btn-quick-add-resolve');
const quickAddPreview = document.getElementById('quick-add-preview');
const previewTitle = document.getElementById('preview-title');
const previewVersionSelect = document.getElementById('preview-version-select');
const previewVersionCustom = document.getElementById('preview-version-custom');
const btnConfirmAdd = document.getElementById('btn-confirm-add');
const btnCancelAdd = document.getElementById('btn-cancel-add');

// Quick Settings elements
const quickSettingsPanel = document.getElementById('quick-settings-panel');
const settingPollInterval = document.getElementById('popup-setting-poll');
const settingThemeMode = document.getElementById('popup-setting-theme');

// Filter count elements
const countAllEl = document.getElementById('count-all');
const countUpdatesEl = document.getElementById('count-updates');
const countCurrentEl = document.getElementById('count-current');
const countArchivedEl = document.getElementById('count-archived');

let pendingQuickAddData = null;

/**
 * Formats a timestamp into a friendly relative or short time string.
 */
function formatLastChecked(timestamp) {
  if (!timestamp || timestamp <= 0) return 'Last checked: Never';
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'Last checked: Just now';
  if (diffMin < 60) return `Last checked: ${diffMin}m ago`;
  if (diffHour < 24) return `Last checked: ${diffHour}h ago`;
  const date = new Date(timestamp);
  return `Last checked: ${date.toLocaleDateString()}`;
}

/**
 * Initializes and syncs theme mode based on saved preference or system.
 */
function initThemeMode(savedTheme = 'system') {
  if (settingThemeMode) settingThemeMode.value = savedTheme;
  applyThemeMode(savedTheme);
}

function applyThemeMode(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Loads data from background service worker.
 */
async function loadData() {
  try {
    const [games, status] = await Promise.all([
      extAPI.runtime.sendMessage({ type: 'GET_GAMES' }),
      extAPI.runtime.sendMessage({ type: 'GET_STATUS' })
    ]);
    allGames = games || {};
    currentSettings = status ? status.settings : null;

    if (currentSettings) {
      if (lastCheckedLabelEl) {
        lastCheckedLabelEl.textContent = formatLastChecked(currentSettings.lastPollTimestamp);
        if (currentSettings.lastPollTimestamp > 0) {
          lastCheckedLabelEl.title = new Date(currentSettings.lastPollTimestamp).toLocaleString();
        }
      }
      if (settingPollInterval && currentSettings.pollMinutes) {
        settingPollInterval.value = String(currentSettings.pollMinutes);
      }
      if (currentSettings.themeMode) {
        initThemeMode(currentSettings.themeMode);
      }
    }

    updatePausedBanner(currentSettings);
    await checkHostPermission();
    await checkActiveTab();
    renderList();
  } catch (err) {
    console.error('Failed to load games:', err);
    renderError('Could not connect to background service worker.');
  }
}

async function checkHostPermission() {
  if (extAPI && extAPI.permissions && extAPI.permissions.contains) {
    try {
      const hasPerm = await extAPI.permissions.contains({ origins: ['https://f95zone.to/*'] });
      if (!hasPerm) {
        pausedAlertEl.textContent = 'Host permission needed for f95zone.to. Click here to grant.';
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
    pausedAlertEl.textContent = `Paused: Rate limit circuit breaker active (${mins}m remaining).`;
    pausedAlertEl.style.display = 'block';
  } else if (settings.requestCountToday >= settings.dailyRequestCap) {
    pausedAlertEl.textContent = `Paused: Daily request cap reached (${settings.requestCountToday}/${settings.dailyRequestCap}).`;
    pausedAlertEl.style.display = 'block';
  } else {
    pausedAlertEl.style.display = 'none';
  }
}

function isF95ThreadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return Boolean(parseThreadIdFromUrl(url));
}

async function findF95Tab() {
  try {
    const activeTabs = await extAPI.tabs.query({ active: true });
    if (Array.isArray(activeTabs)) {
      const activeMatch = activeTabs.find(t => isF95ThreadUrl(t.url));
      if (activeMatch) return activeMatch;
    }

    const [focusedActive] = await extAPI.tabs.query({ active: true, lastFocusedWindow: true });
    if (focusedActive && isF95ThreadUrl(focusedActive.url)) return focusedActive;

    const focusedTabs = await extAPI.tabs.query({ lastFocusedWindow: true });
    if (Array.isArray(focusedTabs)) {
      const match = focusedTabs.find(t => isF95ThreadUrl(t.url));
      if (match) return match;
    }

    const allTabs = await extAPI.tabs.query({});
    if (Array.isArray(allTabs)) {
      const match = allTabs.find(t => isF95ThreadUrl(t.url));
      if (match) return match;
    }
  } catch (err) {
    console.warn('Tab discovery error:', err);
  }
  return null;
}

/**
 * Checks if user is currently on an F95zone thread tab.
 */
async function checkActiveTab() {
  if (!activeTabBannerEl || !extAPI.tabs || !extAPI.tabs.query) return;

  try {
    const targetTab = await findF95Tab();
    if (!targetTab || !targetTab.url) {
      activeTabBannerEl.style.display = 'none';
      activeTabInfo = null;
      return;
    }

    const threadId = parseThreadIdFromUrl(targetTab.url);
    if (!threadId) {
      activeTabBannerEl.style.display = 'none';
      activeTabInfo = null;
      return;
    }

    const headingData = parseThreadHeading(targetTab.title || '');
    const slugData = parseThreadSlug(targetTab.url || '');

    let title = (headingData && headingData.title && !headingData.title.startsWith('Thread #'))
      ? headingData.title
      : (slugData && slugData.title ? slugData.title : `Thread #${threadId}`);
    let currentVersion = (headingData && headingData.version)
      ? headingData.version
      : (slugData && slugData.version ? slugData.version : '');
    let prefixes = (headingData && headingData.prefixes) ? headingData.prefixes : [];
    let versions = currentVersion ? [currentVersion] : [];

    try {
      const domInfo = await extAPI.tabs.sendMessage(targetTab.id, { type: 'GET_PAGE_THREAD_INFO' });
      if (domInfo) {
        if (domInfo.title) title = domInfo.title;
        if (domInfo.currentVersion) currentVersion = domInfo.currentVersion;
        if (Array.isArray(domInfo.prefixes) && domInfo.prefixes.length > 0) prefixes = domInfo.prefixes;
        if (Array.isArray(domInfo.versions) && domInfo.versions.length > 0) versions = domInfo.versions;
      }
    } catch {}

    if (!currentVersion || versions.length <= 1) {
      try {
        const meta = await extAPI.runtime.sendMessage({ type: 'RESOLVE_THREAD', input: targetTab.url });
        if (meta && !meta.error) {
          if (meta.title && (!title || title.startsWith('Thread #'))) title = meta.title;
          if (meta.latestVersion && !currentVersion) currentVersion = meta.latestVersion;
          if (Array.isArray(meta.versions) && meta.versions.length > versions.length) versions = meta.versions;
          if (Array.isArray(meta.prefixes) && meta.prefixes.length > 0) prefixes = meta.prefixes;
        }
      } catch {}
    }

    if (currentVersion && !versions.includes(currentVersion)) {
      versions.unshift(currentVersion);
    }

    const info = {
      threadId,
      title,
      currentVersion,
      versions: versions.length > 0 ? versions : (currentVersion ? [currentVersion] : []),
      prefixes,
      url: targetTab.url
    };

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

    const topRow = document.createElement('div');
    topRow.className = 'active-tab-top';

    const indicator = document.createElement('span');
    indicator.className = 'active-tab-indicator';
    const dot = document.createElement('span');
    dot.className = 'active-tab-dot';
    dot.style.backgroundColor = 'var(--status-current-dot)';
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
    verInfo.textContent = `Installed: ${trackedGame.installedVersion || 'none'} | Latest: ${trackedGame.latestVersion}`;
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

  // Untracked tab -> offer 1-click tracking
  activeTabBannerEl.style.display = 'flex';

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
  select.className = 'form-select form-select-sm';

  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.className = 'form-input form-select-sm';
  customInput.placeholder = 'e.g. v0.9.5';
  customInput.style.display = 'none';

  const availableVersions = (info.versions && info.versions.length > 0)
    ? info.versions
    : (info.currentVersion ? [info.currentVersion] : []);

  if (availableVersions.length > 0) {
    select.style.display = 'inline-block';
    customInput.style.display = 'none';
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
  } else {
    select.style.display = 'none';
    customInput.style.display = 'inline-block';
    customInput.value = '';
    customInput.placeholder = 'Enter version';
  }

  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      select.style.display = 'none';
      customInput.style.display = 'inline-block';
      customInput.value = '';
      customInput.focus();
    }
  });

  versionGroup.appendChild(select);
  versionGroup.appendChild(customInput);
  controls.appendChild(versionGroup);

  const trackBtn = document.createElement('button');
  trackBtn.type = 'button';
  trackBtn.className = 'btn btn-primary btn-sm';
  trackBtn.textContent = '+ Track Game';

  trackBtn.addEventListener('click', async () => {
    trackBtn.disabled = true;
    trackBtn.textContent = 'Saving...';
    try {
      const selectedVersion = (select.style.display === 'none' || select.value === '__custom__')
        ? (customInput.value.trim() || info.currentVersion || '')
        : select.value;

      await extAPI.runtime.sendMessage({
        type: 'QUICK_ADD_GAME',
        input: info.url || `https://f95zone.to/threads/${threadId}/`,
        title: info.title,
        latestVersion: info.currentVersion || selectedVersion,
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

  // Filter counts
  if (countAllEl) countAllEl.textContent = String(totalCount);
  if (countUpdatesEl) countUpdatesEl.textContent = String(updateCount);
  if (countCurrentEl) countCurrentEl.textContent = String(currentCount);
  if (countArchivedEl) countArchivedEl.textContent = String(archivedCount);

  // Footer stats
  footerStatsEl.textContent = `Tracking ${totalCount} item${totalCount === 1 ? '' : 's'} (${updateCount} update${updateCount === 1 ? '' : 's'})`;

  // Empty state when no games are tracked
  if (totalCount === 0) {
    const emptyContainer = document.createElement('div');
    emptyContainer.className = 'empty-state';

    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('class', 'empty-state-icon');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '1.6');
    iconSvg.setAttribute('stroke-linecap', 'round');
    iconSvg.setAttribute('stroke-linejoin', 'round');
    iconSvg.innerHTML = `
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    `;
    emptyContainer.appendChild(iconSvg);

    const titleEl = document.createElement('h2');
    titleEl.className = 'empty-state-title';
    titleEl.textContent = 'No software tracked yet';
    emptyContainer.appendChild(titleEl);

    const subtextEl = document.createElement('p');
    subtextEl.className = 'empty-state-subtext';
    subtextEl.textContent = 'Track F95zone threads to automatically monitor new version releases, changelogs, and desktop updates.';
    emptyContainer.appendChild(subtextEl);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.textContent = '+ Add Your First Game';
    addBtn.addEventListener('click', () => {
      quickAddPanel.style.display = 'flex';
      quickAddInput.focus();
    });
    emptyContainer.appendChild(addBtn);

    gameListEl.appendChild(emptyContainer);
    return;
  }

  // Filter games based on search and active pill
  const query = searchQuery.toLowerCase().trim();
  const filtered = games.filter(g => {
    if (activeFilter === 'updates' && (g.archived || g.status !== 'update')) return false;
    if (activeFilter === 'current' && (g.archived || g.status === 'update')) return false;
    if (activeFilter === 'archived' && !g.archived) return false;

    if (!query) return true;
    return (g.title && g.title.toLowerCase().includes(query)) ||
           (g.tags && g.tags.some(t => t.toLowerCase().includes(query))) ||
           (g.prefixes && g.prefixes.some(p => String(p).toLowerCase().includes(query)));
  });

  if (filtered.length === 0) {
    const noMatch = document.createElement('div');
    noMatch.className = 'empty-state';
    noMatch.textContent = 'No matching tracked software found.';
    gameListEl.appendChild(noMatch);
    return;
  }

  // Group: updates first, then up to date, then archived
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
 * Creates an interactive card row for a tracked item.
 */
function createGameCard(game) {
  const isUpdate = game.status === 'update' && !game.archived;
  const card = document.createElement('article');
  card.className = `game-card ${isUpdate ? 'has-update' : ''}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', game.title || 'Tracked item');

  // Compact Row Header
  const header = document.createElement('div');
  header.className = 'game-card-header';

  // Left: Status dot + Title + Prefixes
  const left = document.createElement('div');
  left.className = 'game-card-left';

  const dot = document.createElement('span');
  dot.className = `status-dot ${isUpdate ? 'status-dot-update' : (game.archived ? 'status-dot-archived' : 'status-dot-current')}`;
  dot.setAttribute('aria-hidden', 'true');
  left.appendChild(dot);

  const titleGroup = document.createElement('div');
  titleGroup.className = 'game-title-group';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '6px';

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
  titleRow.appendChild(titleLink);
  titleGroup.appendChild(titleRow);

  // Prefix tags
  if (Array.isArray(game.prefixes) && game.prefixes.length > 0) {
    const prefixList = document.createElement('div');
    prefixList.className = 'game-prefix-list';
    for (const p of game.prefixes.slice(0, 3)) {
      const tag = document.createElement('span');
      tag.className = 'game-prefix-tag';
      tag.textContent = String(p);
      prefixList.appendChild(tag);
    }
    titleGroup.appendChild(prefixList);
  }

  left.appendChild(titleGroup);
  header.appendChild(left);

  // Right: Status Pill + Actions + Chevron
  const right = document.createElement('div');
  right.className = 'game-card-right';

  // Status pill
  const statusPill = document.createElement('span');
  if (isUpdate) {
    statusPill.className = 'status-pill pill-update';
    statusPill.textContent = 'Update';
  } else if (game.archived) {
    statusPill.className = 'status-pill pill-archived';
    statusPill.textContent = 'Archived';
  } else {
    statusPill.className = 'status-pill pill-current';
    statusPill.textContent = 'Current';
  }
  right.appendChild(statusPill);

  // Version chip
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

  // Quick 1-click "Mark Installed" button for updates
  if (isUpdate) {
    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'btn btn-primary btn-xs';
    markBtn.textContent = 'Mark Installed';
    markBtn.title = 'Set installed version to latest detected version';
    markBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      markBtn.disabled = true;
      await extAPI.runtime.sendMessage({
        type: 'UPDATE_GAME',
        id: game.id,
        payload: { installedVersion: game.latestVersion, status: 'current' }
      });
      await loadData();
    });
    actions.appendChild(markBtn);
  }

  // Chevron indicator
  const chevron = document.createElement('span');
  chevron.className = 'chevron-icon';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  actions.appendChild(chevron);

  right.appendChild(actions);
  header.appendChild(right);
  card.appendChild(header);

  // Expanded Drawer
  const details = document.createElement('div');
  details.className = 'game-card-details';

  const detailRow = document.createElement('div');
  detailRow.className = 'card-detail-row';

  // Installed Version Selector
  const verPicker = document.createElement('div');
  verPicker.className = 'card-version-picker';
  const vLabel = document.createElement('label');
  vLabel.textContent = 'Installed Version:';
  verPicker.appendChild(vLabel);

  const vSelect = document.createElement('select');
  vSelect.className = 'form-select form-select-sm';

  const knownVersions = [game.installedVersion, game.latestVersion].filter(Boolean);
  const uniqueVers = [...new Set(knownVersions)];
  for (const v of uniqueVers) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = (v === game.latestVersion) ? `${v} (Latest)` : v;
    if (v === game.installedVersion) opt.selected = true;
    vSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Edit Custom...';
  vSelect.appendChild(customOpt);

  vSelect.addEventListener('click', (e) => e.stopPropagation());
  vSelect.addEventListener('change', async (e) => {
    e.stopPropagation();
    let newVer = vSelect.value;
    if (newVer === '__custom__') {
      const customVal = window.prompt('Enter your installed version:', game.installedVersion || '');
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
  detailRow.appendChild(verPicker);

  // Action buttons: Open Thread, Archive/Unarchive, Untrack
  const actionGroup = document.createElement('div');
  actionGroup.className = 'card-actions';

  const openThreadBtn = document.createElement('button');
  openThreadBtn.type = 'button';
  openThreadBtn.className = 'btn btn-secondary btn-xs';
  openThreadBtn.textContent = 'Open Thread';
  openThreadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    extAPI.tabs.create({ url: game.url });
  });
  actionGroup.appendChild(openThreadBtn);

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
  actionGroup.appendChild(archiveBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-secondary btn-xs';
  removeBtn.textContent = 'Untrack';
  removeBtn.title = 'Remove from update tracker';
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.confirm(`Stop tracking "${game.title}"?`)) {
      await extAPI.runtime.sendMessage({ type: 'REMOVE_GAME', id: game.id });
      await loadData();
    }
  });
  actionGroup.appendChild(removeBtn);

  detailRow.appendChild(actionGroup);
  details.appendChild(detailRow);

  // Changelog Box
  if (game.changelogSnippet) {
    const clBox = document.createElement('div');
    clBox.className = 'changelog-box';
    clBox.textContent = game.changelogSnippet;
    details.appendChild(clBox);
  }

  // Tags
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

  card.appendChild(details);

  // Row expand toggle (keyboard & click)
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target === card) {
        e.preventDefault();
        card.classList.toggle('expanded');
      }
    }
  });

  return card;
}

// Search input & clear button
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  btnClearSearch.style.display = searchQuery ? 'block' : 'none';
  renderList();
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  btnClearSearch.style.display = 'none';
  searchInput.focus();
  renderList();
});

// Filter pills
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

// Quick Add Panel
btnToggleAdd.addEventListener('click', () => {
  const isHidden = quickAddPanel.style.display === 'none';
  quickAddPanel.style.display = isHidden ? 'flex' : 'none';
  quickSettingsPanel.style.display = 'none';
  if (isHidden) {
    quickAddInput.focus();
  } else {
    quickAddPreview.style.display = 'none';
    quickAddFeedback.style.display = 'none';
  }
});

btnCloseQuickAdd.addEventListener('click', () => {
  quickAddPanel.style.display = 'none';
  quickAddPreview.style.display = 'none';
  quickAddFeedback.style.display = 'none';
});

btnQuickAddResolve.addEventListener('click', async () => {
  const rawInput = quickAddInput.value.trim();
  if (!rawInput) {
    quickAddFeedback.textContent = 'Please enter a thread URL or thread ID.';
    quickAddFeedback.style.display = 'block';
    return;
  }

  quickAddFeedback.style.display = 'none';
  btnQuickAddResolve.disabled = true;
  btnQuickAddResolve.textContent = '...';

  try {
    const res = await extAPI.runtime.sendMessage({
      type: 'RESOLVE_THREAD',
      input: rawInput
    });

    if (!res || res.error) {
      quickAddFeedback.textContent = res ? res.error : 'Could not resolve thread.';
      quickAddFeedback.style.display = 'block';
      return;
    }

    pendingQuickAddData = res;
    previewTitle.textContent = res.title;

    previewVersionSelect.replaceChildren();
    const available = (res.versions && res.versions.length > 0)
      ? res.versions
      : (res.latestVersion ? [res.latestVersion] : []);

    if (available.length > 0) {
      previewVersionSelect.style.display = 'inline-block';
      previewVersionCustom.style.display = 'none';
      for (let i = 0; i < available.length; i++) {
        const v = available[i];
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = (i === 0) ? `${v} (Latest)` : v;
        previewVersionSelect.appendChild(opt);
      }
      const customOpt = document.createElement('option');
      customOpt.value = '__custom__';
      customOpt.textContent = 'Custom / Other...';
      previewVersionSelect.appendChild(customOpt);
    } else {
      previewVersionSelect.style.display = 'none';
      previewVersionCustom.style.display = 'inline-block';
      previewVersionCustom.value = res.latestVersion || '';
      previewVersionCustom.placeholder = 'Enter version (e.g. v1.0)';
    }

    previewVersionSelect.onchange = () => {
      if (previewVersionSelect.value === '__custom__') {
        previewVersionSelect.style.display = 'none';
        previewVersionCustom.style.display = 'inline-block';
        previewVersionCustom.value = '';
        previewVersionCustom.focus();
      }
    };

    quickAddPreview.style.display = 'flex';
  } catch (err) {
    console.error('Resolve error:', err);
    quickAddFeedback.textContent = 'Error: ' + err.message;
    quickAddFeedback.style.display = 'block';
  } finally {
    btnQuickAddResolve.disabled = false;
    btnQuickAddResolve.textContent = 'Find';
  }
});

btnConfirmAdd.addEventListener('click', async () => {
  if (!pendingQuickAddData) return;

  btnConfirmAdd.disabled = true;
  btnConfirmAdd.textContent = 'Saving...';

  try {
    const selectedVersion = (previewVersionSelect.style.display === 'none' || previewVersionSelect.value === '__custom__')
      ? (previewVersionCustom.value.trim() || pendingQuickAddData.latestVersion || '')
      : previewVersionSelect.value;

    await extAPI.runtime.sendMessage({
      type: 'QUICK_ADD_GAME',
      input: pendingQuickAddData.id,
      title: pendingQuickAddData.title,
      latestVersion: pendingQuickAddData.latestVersion || selectedVersion,
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

// Quick Settings Panel
btnToggleSettings.addEventListener('click', () => {
  const isHidden = quickSettingsPanel.style.display === 'none';
  quickSettingsPanel.style.display = isHidden ? 'flex' : 'none';
  quickAddPanel.style.display = 'none';
});

btnCloseSettings.addEventListener('click', () => {
  quickSettingsPanel.style.display = 'none';
});

settingPollInterval.addEventListener('change', async () => {
  const pollMinutes = Number(settingPollInterval.value);
  if (pollMinutes >= 5) {
    await extAPI.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: { pollMinutes }
    });
  }
});

settingThemeMode.addEventListener('change', async () => {
  const themeMode = settingThemeMode.value;
  applyThemeMode(themeMode);
  await extAPI.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { themeMode }
  });
});

btnOpenFullLibrary.addEventListener('click', () => {
  if (extAPI.runtime.openOptionsPage) {
    extAPI.runtime.openOptionsPage();
  } else {
    extAPI.tabs.create({ url: extAPI.runtime.getURL('src/ui/library/library.html') });
  }
});

// Check Now action
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

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', loadData);

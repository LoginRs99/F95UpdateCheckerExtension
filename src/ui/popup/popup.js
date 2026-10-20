// src/ui/popup/popup.js
// Handles popup UI logic, rendering updates first, then remaining games.
// Strict textContent rendering only.

let allGames = {};
let searchQuery = '';

const gameListEl = document.getElementById('game-list');
const badgeCountEl = document.getElementById('badge-count');
const footerStatsEl = document.getElementById('footer-stats');
const searchInput = document.getElementById('popup-search');
const btnCheckNow = document.getElementById('btn-check-now');
const btnOpenLibrary = document.getElementById('btn-open-library');

const pausedAlertEl = document.getElementById('popup-paused-alert');

async function loadData() {
  try {
    const [games, status] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_GAMES' }),
      chrome.runtime.sendMessage({ type: 'GET_STATUS' })
    ]);
    allGames = games || {};
    updatePausedBanner(status ? status.settings : null);
    renderList();
  } catch (err) {
    console.error('Failed to load games:', err);
    renderError('Could not load tracked games.');
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
    pausedAlertEl.textContent = `⚠️ Paused: Circuit breaker active (${mins}m remaining).`;
    pausedAlertEl.style.display = 'block';
  } else if (settings.requestCountToday >= settings.dailyRequestCap) {
    pausedAlertEl.textContent = `⚠️ Paused: Daily request cap reached (${settings.requestCountToday}/${settings.dailyRequestCap}).`;
    pausedAlertEl.style.display = 'block';
  } else {
    pausedAlertEl.style.display = 'none';
  }
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

  // Header badge
  if (updateCount > 0) {
    badgeCountEl.textContent = String(updateCount);
    badgeCountEl.style.display = 'inline-block';
  } else {
    badgeCountEl.style.display = 'none';
  }

  // Footer stats
  footerStatsEl.textContent = `Tracking ${totalCount} game${totalCount === 1 ? '' : 's'} (${updateCount} update${updateCount === 1 ? '' : 's'})`;

  if (totalCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No games tracked yet. Browse F95zone and click "+ Track Game" on any game thread!';
    gameListEl.appendChild(empty);
    return;
  }

  // Filter games based on search query
  const query = searchQuery.toLowerCase().trim();
  const filtered = games.filter(g => {
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

function createGameCard(game) {
  const card = document.createElement('div');
  card.className = `game-card ${game.status === 'update' && !game.archived ? 'has-update' : ''}`;

  // Card Header: Title and Status Badge
  const header = document.createElement('div');
  header.className = 'game-card-header';

  const titleLink = document.createElement('a');
  titleLink.className = 'game-title';
  titleLink.href = game.url;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = game.title || 'Untitled Game';
  titleLink.title = game.title || '';

  const badge = document.createElement('span');
  badge.className = `game-badge ${game.status === 'update' ? 'badge-update' : 'badge-current'}`;
  badge.textContent = game.status === 'update' ? 'UPDATE' : 'CURRENT';

  header.appendChild(titleLink);
  header.appendChild(badge);
  card.appendChild(header);

  // Version Row: Installed -> Latest
  const verRow = document.createElement('div');
  verRow.className = 'version-row';

  const instSpan = document.createElement('span');
  instSpan.className = 'version-installed';
  instSpan.textContent = `Installed: ${game.installedVersion || 'none'}`;

  const arrow = document.createElement('span');
  arrow.className = 'version-arrow';
  arrow.textContent = '→';

  const latestSpan = document.createElement('span');
  latestSpan.className = `version-latest ${game.status === 'update' ? 'highlight-update' : ''}`;
  latestSpan.textContent = `Latest: ${game.latestVersion || 'unknown'}`;

  verRow.appendChild(instSpan);
  verRow.appendChild(arrow);
  verRow.appendChild(latestSpan);
  card.appendChild(verRow);

  // Changelog Snippet (if available)
  if (game.changelogSnippet) {
    const clBox = document.createElement('div');
    clBox.className = 'changelog-box';
    clBox.textContent = game.changelogSnippet;
    card.appendChild(clBox);
  }

  // Card Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-secondary';
  openBtn.textContent = 'Open Thread';
  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: game.url });
  });
  actions.appendChild(openBtn);

  if (game.status === 'update') {
    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'btn btn-primary';
    markBtn.textContent = 'Mark Installed';
    markBtn.title = 'Set installed version to latest version';
    markBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
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

  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.className = 'btn btn-secondary';
  archiveBtn.textContent = game.archived ? 'Unarchive' : 'Archive';
  archiveBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_GAME',
      id: game.id,
      payload: { archived: !game.archived }
    });
    await loadData();
  });
  actions.appendChild(archiveBtn);

  card.appendChild(actions);
  return card;
}

// Search filter listener
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderList();
});

// Check now button listener
btnCheckNow.addEventListener('click', async () => {
  btnCheckNow.disabled = true;
  btnCheckNow.textContent = 'Checking...';
  try {
    await chrome.runtime.sendMessage({ type: 'POLL_NOW' });
    await loadData();
  } finally {
    btnCheckNow.disabled = false;
    btnCheckNow.textContent = 'Check Now';
  }
});

// Open Library listener
btnOpenLibrary.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/library/library.html') });
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', loadData);

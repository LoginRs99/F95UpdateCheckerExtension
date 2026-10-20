// src/content/highlight.js
// Highlights tracked games and available updates on F95zone listing and tile pages.
// Safe, textContent-only rendering with debounced MutationObserver.

(function initHighlights() {
  const extAPI = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
    ? globalThis.browser
    : (typeof globalThis.chrome !== 'undefined' ? globalThis.chrome : null);
  if (!extAPI || !extAPI.runtime || !extAPI.runtime.sendMessage) return;

  let trackedMap = null;
  let debounceTimer = null;

  function fetchAndHighlight() {
    extAPI.runtime.sendMessage({ type: 'GET_GAMES' }, (games) => {
      if (extAPI.runtime.lastError || !games) return;
      trackedMap = games;
      applyHighlights();
    });
  }

  function applyHighlights() {
    if (!trackedMap) return;

    const links = document.querySelectorAll('a[href*="/threads/"]');
    for (const link of links) {
      // Avoid decorating inside our own track button container
      if (link.closest('#f95-ut-track-container') || link.closest('#f95-ut-modal-overlay')) continue;

      const href = link.getAttribute('href');
      if (!href) continue;

      const match = href.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
      if (!match) continue;

      const threadId = match[1];
      const game = trackedMap[threadId];

      const existingBadge = link.parentElement ? link.parentElement.querySelector(`.f95-ut-badge[data-thread-id="${threadId}"]`) : null;

      if (!game) {
        if (existingBadge) existingBadge.remove();
        continue;
      }

      if (existingBadge) {
        // Update badge text if status changed
        updateBadgeElement(existingBadge, game);
        continue;
      }

      // Check if this link is a primary title or card link (not a pagination/small button link)
      if (link.textContent.trim().length === 0) continue;

      const badge = document.createElement('span');
      badge.className = 'f95-ut-badge';
      badge.setAttribute('data-thread-id', threadId);
      badge.style.display = 'inline-block';
      badge.style.marginRight = '6px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '700';
      badge.style.letterSpacing = '0.5px';
      badge.style.verticalAlign = 'middle';
      badge.style.userSelect = 'none';

      updateBadgeElement(badge, game);

      // Insert cleanly before the link text or right next to it
      link.insertAdjacentElement('beforebegin', badge);
    }
  }

  function updateBadgeElement(badge, game) {
    if (game.status === 'update') {
      badge.textContent = `UPDATE ${game.latestVersion || ''}`.trim();
      badge.style.backgroundColor = '#dc2626';
      badge.style.color = '#ffffff';
    } else {
      badge.textContent = 'TRACKED';
      badge.style.backgroundColor = '#059669';
      badge.style.color = '#ffffff';
    }
  }

  function scheduleScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyHighlights();
    }, 150);
  }

  // Observe dynamically loaded tiles (SAM Latest Updates, infinity scroll)
  const observer = new MutationObserver((mutations) => {
    let hasAddedNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasAddedNodes = true;
        break;
      }
    }
    if (hasAddedNodes) {
      scheduleScan();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndHighlight);
  } else {
    fetchAndHighlight();
  }
})();

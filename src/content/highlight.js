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
      // Avoid decorating inside our own track button container or modal
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
      badge.style.padding = '2px 7px';
      badge.style.borderRadius = '12px';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '700';
      badge.style.letterSpacing = '0.04em';
      badge.style.verticalAlign = 'middle';
      badge.style.userSelect = 'none';
      badge.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';

      updateBadgeElement(badge, game);

      // Insert cleanly before the link text or right next to it
      link.insertAdjacentElement('beforebegin', badge);
    }
  }

  function updateBadgeElement(badge, game) {
    if (game.status === 'update') {
      badge.textContent = `UPDATE ${game.latestVersion || ''}`.trim();
      badge.style.backgroundColor = 'rgba(244, 63, 94, 0.15)';
      badge.style.color = '#fda4af';
      badge.style.border = '1px solid rgba(244, 63, 94, 0.4)';
      badge.style.boxShadow = '0 0 8px rgba(244, 63, 94, 0.25)';
    } else {
      badge.textContent = 'TRACKED';
      badge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#a7f3d0';
      badge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      badge.style.boxShadow = 'none';
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

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Listen for active tab thread info requests from popup
  extAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'GET_PAGE_THREAD_INFO') {
      const info = extractCurrentThreadInfo();
      sendResponse(info);
      return false;
    }
  });

  function extractCurrentThreadInfo() {
    const urlMatch = window.location.pathname.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
    if (!urlMatch) return null;
    const threadId = urlMatch[1];

    const headingEl = document.querySelector('h1.p-title-value') || document.querySelector('h1');
    let title = document.title ? document.title.replace(/\s*\|\s*F95zone.*$/i, '').trim() : `Thread #${threadId}`;
    let currentVersion = '';
    const prefixes = [];

    if (headingEl) {
      const labelElements = headingEl.querySelectorAll('span.label');
      for (const lbl of labelElements) {
        const lblText = (lbl.textContent || '').trim();
        if (lblText) prefixes.push(lblText);
      }

      const clone = headingEl.cloneNode(true);
      for (const l of clone.querySelectorAll('span.label')) l.remove();
      let text = (clone.textContent || '').replace(/\s+/g, ' ').trim();

      const vMatch = text.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
      if (vMatch) currentVersion = vMatch[1].trim();

      text = text.replace(/^(?:\[[^\]]+\]\s*)+/g, '').trim();
      const devMatch = text.match(/\s*\[([^\]]+)\]\s*$/);
      if (devMatch && devMatch[1] !== currentVersion) {
        text = text.slice(0, devMatch.index).trim();
      }
      if (vMatch) {
        text = text.replace(vMatch[0], '').replace(/\s+/g, ' ').trim();
      }
      if (text) title = text;
    }

    // Extract historical / previous versions
    const versions = [];
    const seen = new Set();
    if (currentVersion) {
      versions.push(currentVersion);
      seen.add(currentVersion.toLowerCase());
    }

    const targets = document.querySelectorAll('.message-body, .bbCodeBlock--spoiler, .bbCodeSpoiler-content, .bbWrapper');
    const lineHeadingRegex = /^(?:#+\s*)?(?:(?:v(?:er(?:sion)?)?\.?\s*|ch(?:apter)?\.?\s*|ep(?:isode)?\.?\s*|part\s*))?([0-9]+(?:\.[0-9a-zA-Z_\-]+)*(?:\s*(?:Extra|Final|Hotfix|RE|Patch|v[0-9\.]+))*)\s*(?:[:\-\–\—]|\s*$)/i;
    const explicitTokenRegex = /\b((?:v|ver\.|ch\.|ep\.|part\s*)[0-9]+(?:\.[0-9a-zA-Z_\-]+)*(?:\s*(?:Extra|Final|Hotfix|RE|Patch|v[0-9\.]+))*)\b/gi;
    const bracketRegex = /\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/gi;

    function tryAdd(cand) {
      if (!cand) return;
      cand = cand.replace(/^[\[\(\s]+|[\]\)\:\-\–\—\s]+$/g, '').trim();
      if (!cand || cand.length < 2 || cand.length > 30) return;
      if (/^(?:19\d\d|20\d\d)$/.test(cand)) return;
      if (/^(?:1080|720|480|4k)$/i.test(cand)) return;
      if (/^(?:megaupload|pixeldrain|mediafire|google|mega|download|link|changelog)$/i.test(cand)) return;
      if (!/\d/.test(cand)) return;

      const lower = cand.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        versions.push(cand);
      }
    }

    for (const t of targets) {
      const text = t.innerText || t.textContent || '';
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.length <= 80) {
          const m = line.match(lineHeadingRegex);
          if (m && m[1]) tryAdd(m[0].replace(/[:\-\–\—]$/, ''));
        }
        for (const m of line.matchAll(explicitTokenRegex)) tryAdd(m[1]);
        for (const m of line.matchAll(bracketRegex)) tryAdd(m[1]);
      }
    }

    return {
      threadId,
      title,
      currentVersion,
      versions: versions.length > 0 ? versions : (currentVersion ? [currentVersion] : []),
      prefixes,
      url: window.location.href
    };
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndHighlight);
  } else {
    fetchAndHighlight();
  }
})();

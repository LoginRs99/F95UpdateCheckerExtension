// src/content/track-button.js
// Injects a modern Obsidian-styled Track button into F95zone thread pages.
// Uses textContent exclusively for safe DOM rendering.

(function initTrackButton() {
  const extAPI = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
    ? globalThis.browser
    : (typeof globalThis.chrome !== 'undefined' ? globalThis.chrome : null);
  if (!extAPI || !extAPI.runtime || !extAPI.runtime.sendMessage) return;

  const urlMatch = window.location.pathname.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
  if (!urlMatch) return;
  const threadId = urlMatch[1];

  // Prevent duplicate injections
  if (document.getElementById('f95-ut-track-container')) return;

  function parseHeadingData() {
    const headingEl = document.querySelector('h1.p-title-value') || document.querySelector('h1');
    if (!headingEl) return { title: 'Unknown Title', version: '', prefixes: [] };

    // Collect labels from live DOM
    const prefixes = [];
    const labelElements = headingEl.querySelectorAll('span.label');
    for (const lbl of labelElements) {
      const lblText = (lbl.textContent || '').trim();
      if (lblText) prefixes.push(lblText);
    }

    // Clone heading to remove label elements without altering live DOM
    const clone = headingEl.cloneNode(true);
    const labelsInClone = clone.querySelectorAll('span.label');
    for (const l of labelsInClone) l.remove();

    let text = (clone.textContent || '').replace(/\s+/g, ' ').trim();

    // Version pattern
    let version = '';
    const vMatch = text.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
    if (vMatch) version = vMatch[1].trim();

    // Strip any remaining bracketed prefixes from title
    text = text.replace(/^(?:\[[^\]]+\]\s*)+/g, '').trim();

    // Strip creator / dev brackets from end
    const devMatch = text.match(/\s*\[([^\]]+)\]\s*$/);
    let title = text;
    if (devMatch && devMatch[1] !== version) {
      title = title.slice(0, devMatch.index).trim();
    }
    if (vMatch) {
      title = title.replace(vMatch[0], '').replace(/\s+/g, ' ').trim();
    }

    return {
      title: title || 'F95 Game',
      version,
      prefixes
    };
  }

  function injectUI() {
    const target = document.querySelector('.p-title') || document.querySelector('h1');
    if (!target) return;

    extAPI.runtime.sendMessage({ type: 'GET_GAME', id: threadId }, (trackedGame) => {
      if (extAPI.runtime.lastError) return;

      const headingData = parseHeadingData();
      renderButton(target, threadId, headingData, trackedGame);
    });
  }

  function renderButton(target, id, headingData, trackedGame) {
    let container = document.getElementById('f95-ut-track-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'f95-ut-track-container';
      container.style.display = 'inline-flex';
      container.style.alignItems = 'center';
      container.style.marginLeft = '12px';
      container.style.verticalAlign = 'middle';
      container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';
      target.appendChild(container);
    }

    container.replaceChildren(); // Safe clear

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'f95-ut-track-btn';
    btn.style.cursor = 'pointer';
    btn.style.padding = '6px 14px';
    btn.style.borderRadius = '20px';
    btn.style.fontSize = '12.5px';
    btn.style.fontWeight = '600';
    btn.style.letterSpacing = '-0.01em';
    btn.style.transition = 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)';
    btn.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.3)';

    if (trackedGame) {
      btn.textContent = `✓ Tracked (${trackedGame.installedVersion || 'v?'})`;
      btn.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      btn.style.color = '#a7f3d0';
      btn.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    } else {
      btn.textContent = '+ Track Game';
      btn.style.background = 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)';
      btn.style.color = '#ffffff';
      btn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    }

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
    });

    btn.addEventListener('click', () => {
      showModal(id, headingData, trackedGame, (updatedGame) => {
        renderButton(target, id, headingData, updatedGame);
      });
    });

    container.appendChild(btn);
  }

  function showModal(id, headingData, trackedGame, onSaved) {
    const existingModal = document.getElementById('f95-ut-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'f95-ut-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.webkitBackdropFilter = 'blur(10px)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.backgroundColor = '#0c0d10';
    card.style.color = '#f4f4f5';
    card.style.padding = '24px';
    card.style.borderRadius = '14px';
    card.style.width = '380px';
    card.style.border = '1px solid rgba(255, 255, 255, 0.09)';
    card.style.boxShadow = '0 20px 45px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08)';
    card.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';

    const titleEl = document.createElement('h3');
    titleEl.textContent = trackedGame ? 'Edit Tracked Game' : 'Track This Game';
    titleEl.style.margin = '0 0 6px 0';
    titleEl.style.fontSize = '16px';
    titleEl.style.fontWeight = '700';
    titleEl.style.letterSpacing = '-0.02em';
    titleEl.style.color = '#818cf8';

    const gameName = document.createElement('div');
    gameName.textContent = headingData.title;
    gameName.style.fontSize = '12.5px';
    gameName.style.color = '#a1a1aa';
    gameName.style.marginBottom = '16px';

    // Installed version field
    const verLabel = document.createElement('label');
    verLabel.textContent = 'Your Installed Version:';
    verLabel.style.display = 'block';
    verLabel.style.fontSize = '11.5px';
    verLabel.style.fontWeight = '600';
    verLabel.style.color = '#d4d4d8';
    verLabel.style.marginBottom = '5px';

    const verInput = document.createElement('input');
    verInput.type = 'text';
    verInput.value = trackedGame ? trackedGame.installedVersion : headingData.version;
    verInput.placeholder = 'e.g. v1.0.0';
    verInput.style.width = '100%';
    verInput.style.boxSizing = 'border-box';
    verInput.style.padding = '8px 10px';
    verInput.style.borderRadius = '7px';
    verInput.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    verInput.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
    verInput.style.color = '#ffffff';
    verInput.style.fontSize = '13px';
    verInput.style.fontFamily = 'ui-monospace, monospace';
    verInput.style.marginBottom = '14px';
    verInput.style.outline = 'none';

    // Tags field
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = 'Tags (comma-separated):';
    tagsLabel.style.display = 'block';
    tagsLabel.style.fontSize = '11.5px';
    tagsLabel.style.fontWeight = '600';
    tagsLabel.style.color = '#d4d4d8';
    tagsLabel.style.marginBottom = '5px';

    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.value = trackedGame && trackedGame.tags ? trackedGame.tags.join(', ') : '';
    tagsInput.placeholder = 'e.g. favorite, playing, renpy';
    tagsInput.style.width = '100%';
    tagsInput.style.boxSizing = 'border-box';
    tagsInput.style.padding = '8px 10px';
    tagsInput.style.borderRadius = '7px';
    tagsInput.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    tagsInput.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
    tagsInput.style.color = '#ffffff';
    tagsInput.style.fontSize = '13px';
    tagsInput.style.marginBottom = '14px';
    tagsInput.style.outline = 'none';

    // Notes field
    const notesLabel = document.createElement('label');
    notesLabel.textContent = 'Personal Notes:';
    notesLabel.style.display = 'block';
    notesLabel.style.fontSize = '11.5px';
    notesLabel.style.fontWeight = '600';
    notesLabel.style.color = '#d4d4d8';
    notesLabel.style.marginBottom = '5px';

    const notesInput = document.createElement('textarea');
    notesInput.rows = 2;
    notesInput.value = trackedGame ? trackedGame.notes : '';
    notesInput.placeholder = 'Notes (e.g. save file location)';
    notesInput.style.width = '100%';
    notesInput.style.boxSizing = 'border-box';
    notesInput.style.padding = '8px 10px';
    notesInput.style.borderRadius = '7px';
    notesInput.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    notesInput.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
    notesInput.style.color = '#ffffff';
    notesInput.style.fontSize = '13px';
    notesInput.style.marginBottom = '18px';
    notesInput.style.outline = 'none';

    // Focus glow effects
    [verInput, tagsInput, notesInput].forEach(inp => {
      inp.addEventListener('focus', () => {
        inp.style.borderColor = 'rgba(99, 102, 241, 0.5)';
        inp.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.2)';
      });
      inp.addEventListener('blur', () => {
        inp.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        inp.style.boxShadow = 'none';
      });
    });

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '7px 14px';
    cancelBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    cancelBtn.style.color = '#a1a1aa';
    cancelBtn.style.border = '1px solid rgba(255, 255, 255, 0.09)';
    cancelBtn.style.borderRadius = '7px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontSize = '12px';
    cancelBtn.style.fontWeight = '500';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = trackedGame ? 'Save Changes' : 'Track Game';
    saveBtn.style.padding = '7px 16px';
    saveBtn.style.background = 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)';
    saveBtn.style.color = '#ffffff';
    saveBtn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    saveBtn.style.borderRadius = '7px';
    saveBtn.style.fontWeight = '600';
    saveBtn.style.fontSize = '12px';
    saveBtn.style.cursor = 'pointer';

    function handleSave() {
      const installedVer = verInput.value.trim();
      const rawTags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      const notes = notesInput.value.trim();

      const payload = {
        id,
        url: window.location.href.split('?')[0],
        title: headingData.title,
        installedVersion: installedVer,
        latestVersion: headingData.version || installedVer,
        prefixes: headingData.prefixes,
        tags: rawTags,
        notes: notes,
        archived: false,
        addedAt: trackedGame ? trackedGame.addedAt : Date.now(),
        latestSeenAt: Date.now()
      };

      extAPI.runtime.sendMessage({
        type: 'TRACK_GAME',
        payload
      }, (saved) => {
        overlay.remove();
        if (onSaved) {
          onSaved(saved);
        }
      });
    }

    saveBtn.addEventListener('click', handleSave);

    btnRow.appendChild(cancelBtn);

    if (trackedGame) {
      const untrackBtn = document.createElement('button');
      untrackBtn.type = 'button';
      untrackBtn.textContent = 'Untrack';
      untrackBtn.style.padding = '7px 14px';
      untrackBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      untrackBtn.style.color = '#fca5a5';
      untrackBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      untrackBtn.style.borderRadius = '7px';
      untrackBtn.style.cursor = 'pointer';
      untrackBtn.style.fontSize = '12px';
      untrackBtn.style.fontWeight = '500';
      untrackBtn.addEventListener('click', () => {
        extAPI.runtime.sendMessage({ type: 'REMOVE_GAME', id }, () => {
          overlay.remove();
          onSaved(null);
        });
      });
      btnRow.appendChild(untrackBtn);
    }

    btnRow.appendChild(saveBtn);

    card.appendChild(titleEl);
    card.appendChild(gameName);
    card.appendChild(verLabel);
    card.appendChild(verInput);
    card.appendChild(tagsLabel);
    card.appendChild(tagsInput);
    card.appendChild(notesLabel);
    card.appendChild(notesInput);
    card.appendChild(btnRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close on click outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Keyboard support: Escape closes, Enter submits (if not multiline textarea)
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
      } else if (e.key === 'Enter' && e.target !== notesInput) {
        e.preventDefault();
        handleSave();
      }
    });

    verInput.focus();
  }

  // Observe page ready or dynamic navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();

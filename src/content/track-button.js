// src/content/track-button.js
// Injects a non-intrusive Track button into F95zone thread pages.
// Uses textContent exclusively for safe DOM rendering.

(function initTrackButton() {
  const urlMatch = window.location.pathname.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
  if (!urlMatch) return;
  const threadId = urlMatch[1];

  // Prevent duplicate injections
  if (document.getElementById('f95-ut-track-container')) return;

  function parseHeadingData() {
    const headingEl = document.querySelector('h1.p-title-value') || document.querySelector('h1');
    if (!headingEl) return { title: 'Unknown Title', version: '', prefixes: [] };

    const raw = headingEl.textContent || '';
    let text = raw.replace(/\s+/g, ' ').trim();

    // Collect labels
    const prefixes = [];
    const labelElements = headingEl.querySelectorAll('span.label');
    for (const lbl of labelElements) {
      const lblText = (lbl.textContent || '').trim();
      if (lblText) prefixes.push(lblText);
    }

    // Version pattern
    let version = '';
    const vMatch = text.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
    if (vMatch) version = vMatch[1].trim();

    // Strip prefix brackets from title
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

    // Check stored state
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

    chrome.runtime.sendMessage({ type: 'GET_GAME', id: threadId }, (trackedGame) => {
      if (chrome.runtime.lastError) return;

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
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      target.appendChild(container);
    }

    container.replaceChildren(); // Safe clear

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'f95-ut-track-btn';
    btn.style.cursor = 'pointer';
    btn.style.padding = '6px 14px';
    btn.style.borderRadius = '4px';
    btn.style.fontSize = '13px';
    btn.style.fontWeight = '600';
    btn.style.border = '1px solid transparent';
    btn.style.transition = 'all 0.15s ease-in-out';

    if (trackedGame) {
      btn.textContent = `✓ Tracked (${trackedGame.installedVersion || 'v?'})`;
      btn.style.backgroundColor = '#10b981';
      btn.style.color = '#ffffff';
    } else {
      btn.textContent = '+ Track Game';
      btn.style.backgroundColor = '#3b82f6';
      btn.style.color = '#ffffff';
    }

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
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.backgroundColor = '#1f2937';
    card.style.color = '#f9fafb';
    card.style.padding = '20px';
    card.style.borderRadius = '8px';
    card.style.width = '360px';
    card.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    card.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    const titleEl = document.createElement('h3');
    titleEl.textContent = trackedGame ? 'Edit Tracked Game' : 'Track This Game';
    titleEl.style.margin = '0 0 8px 0';
    titleEl.style.fontSize = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.color = '#60a5fa';

    const gameName = document.createElement('div');
    gameName.textContent = headingData.title;
    gameName.style.fontSize = '13px';
    gameName.style.color = '#9ca3af';
    gameName.style.marginBottom = '14px';

    // Installed version field
    const verLabel = document.createElement('label');
    verLabel.textContent = 'Your Installed Version:';
    verLabel.style.display = 'block';
    verLabel.style.fontSize = '12px';
    verLabel.style.marginBottom = '4px';

    const verInput = document.createElement('input');
    verInput.type = 'text';
    verInput.value = trackedGame ? trackedGame.installedVersion : headingData.version;
    verInput.placeholder = 'e.g. v1.0.0';
    verInput.style.width = '100%';
    verInput.style.boxSizing = 'border-box';
    verInput.style.padding = '8px';
    verInput.style.borderRadius = '4px';
    verInput.style.border = '1px solid #4b5563';
    verInput.style.backgroundColor = '#111827';
    verInput.style.color = '#ffffff';
    verInput.style.fontSize = '13px';
    verInput.style.marginBottom = '12px';

    // Tags field
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = 'Tags (comma-separated):';
    tagsLabel.style.display = 'block';
    tagsLabel.style.fontSize = '12px';
    tagsLabel.style.marginBottom = '4px';

    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.value = trackedGame && trackedGame.tags ? trackedGame.tags.join(', ') : '';
    tagsInput.placeholder = 'e.g. playing, renpy, favorite';
    tagsInput.style.width = '100%';
    tagsInput.style.boxSizing = 'border-box';
    tagsInput.style.padding = '8px';
    tagsInput.style.borderRadius = '4px';
    tagsInput.style.border = '1px solid #4b5563';
    tagsInput.style.backgroundColor = '#111827';
    tagsInput.style.color = '#ffffff';
    tagsInput.style.fontSize = '13px';
    tagsInput.style.marginBottom = '12px';

    // Notes field
    const notesLabel = document.createElement('label');
    notesLabel.textContent = 'Personal Notes:';
    notesLabel.style.display = 'block';
    notesLabel.style.fontSize = '12px';
    notesLabel.style.marginBottom = '4px';

    const notesInput = document.createElement('textarea');
    notesInput.rows = 2;
    notesInput.value = trackedGame ? trackedGame.notes : '';
    notesInput.placeholder = 'Notes (e.g. save file location)';
    notesInput.style.width = '100%';
    notesInput.style.boxSizing = 'border-box';
    notesInput.style.padding = '8px';
    notesInput.style.borderRadius = '4px';
    notesInput.style.border = '1px solid #4b5563';
    notesInput.style.backgroundColor = '#111827';
    notesInput.style.color = '#ffffff';
    notesInput.style.fontSize = '13px';
    notesInput.style.marginBottom = '16px';

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.backgroundColor = '#4b5563';
    cancelBtn.style.color = '#ffffff';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = trackedGame ? 'Save Changes' : 'Track Game';
    saveBtn.style.padding = '6px 14px';
    saveBtn.style.backgroundColor = '#2563eb';
    saveBtn.style.color = '#ffffff';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.fontWeight = '600';
    saveBtn.style.cursor = 'pointer';

    saveBtn.addEventListener('click', () => {
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
        notes
      };

      chrome.runtime.sendMessage({ type: 'TRACK_GAME', payload }, (saved) => {
        overlay.remove();
        onSaved(saved);
      });
    });

    btnRow.appendChild(cancelBtn);

    if (trackedGame) {
      const untrackBtn = document.createElement('button');
      untrackBtn.type = 'button';
      untrackBtn.textContent = 'Untrack';
      untrackBtn.style.padding = '6px 12px';
      untrackBtn.style.backgroundColor = '#dc2626';
      untrackBtn.style.color = '#ffffff';
      untrackBtn.style.border = 'none';
      untrackBtn.style.borderRadius = '4px';
      untrackBtn.style.cursor = 'pointer';
      untrackBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'REMOVE_GAME', id }, () => {
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
  }

  // Inject when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();

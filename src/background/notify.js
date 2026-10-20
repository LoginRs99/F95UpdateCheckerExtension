// src/background/notify.js
// Dispatches browser notifications and manages extension icon badge count.

import { extAPI } from '../compat.js';

export async function updateBadge(count) {
  if (!extAPI || !extAPI.action) return;

  try {
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    await extAPI.action.setBadgeText({ text });
    await extAPI.action.setBadgeBackgroundColor({ color: '#e53935' });
  } catch (err) {
    console.warn('[Notify] Failed to update badge:', err);
  }
}

export async function sendNotification(event) {
  if (!extAPI || !extAPI.notifications) return;

  try {
    let title = 'F95 Update Tracker';
    let message = '';
    const id = `f95_event_${event.threadId}_${Date.now()}`;

    switch (event.type) {
      case 'version_change':
        title = `Update: ${event.title}`;
        message = `New version detected: ${event.newVersion} (installed: ${event.oldVersion || 'none'})`;
        break;
      case 'title_change':
        title = `Game Renamed: ${event.newTitle}`;
        message = `Formerly titled: ${event.oldTitle}`;
        break;
      case 'prefix_change':
        title = `Status Change: ${event.title}`;
        message = `Game tags/prefixes were updated.`;
        break;
      default:
        title = `F95 Update Tracker`;
        message = event.message || 'Game event detected.';
    }

    await extAPI.notifications.create(id, {
      type: 'basic',
      iconUrl: extAPI.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 2
    });
  } catch (err) {
    console.warn('[Notify] Failed to send notification:', err);
  }
}

// Register click handler if supported
if (extAPI && extAPI.notifications && extAPI.notifications.onClicked) {
  extAPI.notifications.onClicked.addListener((notificationId) => {
    const match = notificationId.match(/^f95_event_(\d+)_/);
    if (match && extAPI.tabs) {
      extAPI.tabs.create({ url: `https://f95zone.to/threads/${match[1]}/` });
    }
  });
}

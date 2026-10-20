// src/background/notify.js
// Dispatches browser notifications and manages extension icon badge count.

export async function updateBadge(count) {
  if (typeof chrome === 'undefined' || !chrome.action) return;

  try {
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
  } catch (err) {
    console.warn('[Notify] Failed to update badge:', err);
  }
}

export async function sendNotification(event) {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;

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

    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 2
    });
  } catch (err) {
    console.warn('[Notify] Failed to send notification:', err);
  }
}

// Register click handler if supported
if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const match = notificationId.match(/^f95_event_(\d+)_/);
    if (match && chrome.tabs) {
      chrome.tabs.create({ url: `https://f95zone.to/threads/${match[1]}/` });
    }
  });
}

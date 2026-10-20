// src/background/poller.js
// Background service worker: scheduling, incremental polling, rate limiting, and message dispatcher.

import {
  getSettings,
  updateSettings,
  getGames,
  getGame,
  saveGame,
  updateGame,
  removeGame,
  getPendingUpdatesCount,
  exportData,
  importData
} from './store.js';

import {
  detectChanges,
  parseChangelogFromHtml,
  extractVersionsFromHtml,
  parseThreadIdFromUrl
} from './detector.js';

import {
  sendNotification,
  updateBadge
} from './notify.js';

import { extAPI } from '../compat.js';

export const ALARM_NAME = 'f95_poll_alarm';

/**
 * Calculates next alarm delay in minutes with randomized jitter (e.g. 30m +/- 5m).
 */
export function calculateJitterDelay(baseMinutes = 30) {
  // Add jitter between -5 and +5 minutes, minimum 5 minutes
  const jitter = (Math.random() * 10) - 5;
  return Math.max(5, Math.round(baseMinutes + jitter));
}

/**
 * Calculates exponential backoff duration in milliseconds on circuit breaker trips.
 */
export function calculateBackoffMs(consecutiveFailures = 0) {
  // Failures: 0 -> 30m, 1 -> 60m, 2 -> 120m, 3 -> 240m ... max 24h
  const baseMinutes = 30;
  const multiplier = Math.pow(2, Math.min(consecutiveFailures, 6));
  const minutes = Math.min(1440, baseMinutes * multiplier);
  return minutes * 60 * 1000;
}

/**
 * Ensures alarms are set up with appropriate jitter.
 */
export async function scheduleNextPoll() {
  if (!extAPI || !extAPI.alarms) return;
  const settings = await getSettings();
  const delayMinutes = calculateJitterDelay(settings.pollMinutes);
  await extAPI.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
  console.log(`[Poller] Next poll scheduled in ${delayMinutes} minutes.`);
}

/**
 * Core poller execution function.
 */
export async function runPoll({ manual = false } = {}) {
  const settings = await getSettings();
  const now = Date.now();

  // 1. Check Circuit Breaker
  if (settings.circuitBreakerUntil && now < settings.circuitBreakerUntil) {
    const remainingMins = Math.max(1, Math.round((settings.circuitBreakerUntil - now) / 60000));
    console.warn(`[Poller] Circuit breaker active. Skipping poll. Reset in ${remainingMins}m.`);
    return { skipped: true, reason: 'circuit_breaker', remainingMins };
  }

  // 2. Check Daily Request Cap
  let { requestCountToday, requestDayTimestamp } = settings;
  if (!requestDayTimestamp || now - requestDayTimestamp > 86400000) {
    requestCountToday = 0;
    requestDayTimestamp = now;
  }
  if (requestCountToday >= settings.dailyRequestCap) {
    console.warn(`[Poller] Daily request cap reached (${requestCountToday}/${settings.dailyRequestCap}). Skipping.`);
    return { skipped: true, reason: 'daily_cap' };
  }

  const trackedGames = await getGames();
  const trackedCount = Object.keys(trackedGames).length;
  if (trackedCount === 0) {
    console.log('[Poller] No games tracked yet. Skipping feed scan.');
    await scheduleNextPoll();
    return { skipped: true, reason: 'no_games' };
  }

  console.log(`[Poller] Starting poll cycle for ${trackedCount} tracked games...`);

  let newestTimestampSeen = settings.lastPollTimestamp || 0;
  let page = 1;
  let stopPaging = false;
  let totalRequestsThisRun = 0;
  const updatedEvents = [];

  try {
    while (page <= settings.pageDepthCap && !stopPaging) {
      if (requestCountToday + totalRequestsThisRun >= settings.dailyRequestCap) {
        console.warn('[Poller] Reached daily request cap during paging.');
        break;
      }

      const url = `https://${settings.domain}/sam/latest_alpha/latest_data.php?cmd=list&cat=games&page=${page}&rows=60`;
      totalRequestsThisRun++;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          const failures = (settings.consecutiveFailures || 0) + 1;
          const backoff = calculateBackoffMs(failures);
          await updateSettings({
            consecutiveFailures: failures,
            circuitBreakerUntil: now + backoff,
            requestCountToday: requestCountToday + totalRequestsThisRun,
            requestDayTimestamp
          });
          console.warn(`[Poller] Tripped circuit breaker on HTTP ${res.status}. Backing off for ${backoff / 60000}m.`);
          return { error: `HTTP ${res.status}`, trippedCircuitBreaker: true };
        }
        throw new Error(`Forum returned status ${res.status}`);
      }

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // Possible HTML challenge
        if (text.includes('Just a moment...') || text.includes('challenges.cloudflare.com')) {
          const failures = (settings.consecutiveFailures || 0) + 1;
          const backoff = calculateBackoffMs(failures);
          await updateSettings({
            consecutiveFailures: failures,
            circuitBreakerUntil: now + backoff,
            requestCountToday: requestCountToday + totalRequestsThisRun,
            requestDayTimestamp
          });
          return { error: 'Cloudflare challenge', trippedCircuitBreaker: true };
        }
        throw new Error('Unusable response payload');
      }

      if (json.status !== 'ok' || !json.msg || !Array.isArray(json.msg.data)) {
        console.warn('[Poller] Unexpected payload format from latest updates API.');
        break;
      }

      const items = json.msg.data;
      if (items.length === 0) break;

      for (const item of items) {
        const itemTs = (Number(item.ts) || 0) * 1000;
        if (itemTs > newestTimestampSeen) {
          newestTimestampSeen = itemTs;
        }

        const threadId = String(item.thread_id);
        const stored = trackedGames[threadId];

        if (stored) {
          const { hasChanges, updatedGame, events } = detectChanges(stored, {
            title: item.title,
            version: item.version,
            prefixes: item.prefixes,
            ts: item.ts
          });

          if (hasChanges) {
            // Check for version update event
            const isVersionChange = events.some(e => e.type === 'version_change');

            if (isVersionChange) {
              // Fetch thread changelog snippet (one single throttled call)
              try {
                const threadRes = await fetch(stored.url, { credentials: 'include' });
                if (threadRes.ok) {
                  const threadHtml = await threadRes.text();
                  updatedGame.changelogSnippet = parseChangelogFromHtml(
                    threadHtml,
                    stored.installedVersion,
                    item.version
                  );
                } else {
                  updatedGame.changelogSnippet = `Updated: ${stored.installedVersion} -> ${item.version}`;
                }
              } catch (err) {
                console.warn('[Poller] Non-fatal thread changelog fetch error:', err);
                updatedGame.changelogSnippet = `Updated: ${stored.installedVersion} -> ${item.version}`;
              }
            }

            await saveGame(updatedGame);
            trackedGames[threadId] = updatedGame;

            for (const ev of events) {
              await sendNotification(ev);
              updatedEvents.push(ev);
            }
          }
        }

        // Paging stop condition: items older than previous poll
        if (settings.lastPollTimestamp && itemTs <= settings.lastPollTimestamp) {
          stopPaging = true;
        }
      }

      page++;
    }

    // Success update
    await updateSettings({
      lastPollTimestamp: newestTimestampSeen || now,
      consecutiveFailures: 0,
      circuitBreakerUntil: 0,
      requestCountToday: requestCountToday + totalRequestsThisRun,
      requestDayTimestamp
    });

    const pendingCount = await getPendingUpdatesCount();
    await updateBadge(pendingCount);

    console.log(`[Poller] Finished poll cycle. Detected ${updatedEvents.length} events. Pending updates: ${pendingCount}.`);
    return { success: true, updatedEvents, pendingCount };
  } catch (err) {
    console.error('[Poller] Error during poll execution:', err);
    await updateSettings({
      requestCountToday: requestCountToday + totalRequestsThisRun,
      requestDayTimestamp
    });
    return { error: err.message };
  } finally {
    await scheduleNextPoll();
  }
}

// Background listeners (service worker in Chromium, event page in Firefox)
if (extAPI) {
  if (extAPI.runtime && extAPI.runtime.onInstalled) {
    extAPI.runtime.onInstalled.addListener(() => {
      console.log('[Extension] Installed / Updated.');
      scheduleNextPoll();
      getPendingUpdatesCount().then(updateBadge);
    });
  }

  if (extAPI.runtime && extAPI.runtime.onStartup) {
    extAPI.runtime.onStartup.addListener(async () => {
      console.log('[Extension] Browser started.');
      // Re-register alarm on startup if missing (persists across event page sleep)
      if (extAPI.alarms) {
        const existing = await extAPI.alarms.get(ALARM_NAME);
        if (!existing) {
          await scheduleNextPoll();
        }
      }
      runPoll();
    });
  }

  if (extAPI.alarms && extAPI.alarms.onAlarm) {
    extAPI.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        runPoll();
      }
    });
  }

  if (extAPI.runtime && extAPI.runtime.onMessage) {
    extAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const handle = async () => {
        switch (message.type) {
          case 'GET_STATUS': {
            const settings = await getSettings();
            const count = await getPendingUpdatesCount();
            return { settings, pendingCount: count };
          }
          case 'GET_GAMES': {
            const games = await getGames();
            return games;
          }
          case 'GET_GAME': {
            const game = await getGame(message.id);
            return game;
          }
          case 'TRACK_GAME': {
            const game = await saveGame(message.payload);
            const count = await getPendingUpdatesCount();
            await updateBadge(count);
            return game;
          }
          case 'RESOLVE_THREAD': {
            const id = parseThreadIdFromUrl(String(message.input || ''));
            if (!id) return { error: 'Please enter a valid F95zone thread URL or ID.' };

            const existing = await getGame(id);
            const settings = await getSettings();
            let title = `Thread #${id}`;
            let version = '';
            let prefixes = [];
            let versions = [];

            try {
              const res = await fetch(`https://${settings.domain}/threads/${id}/`, {
                headers: { 'Accept': 'text/html' }
              });
              if (res.ok) {
                const html = await res.text();
                const titleMatch = html.match(/<h1[^>]*class="[^"]*p-title-value[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                                   html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                if (titleMatch) {
                  const cleanHeading = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                  const vMatch = cleanHeading.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
                  if (vMatch) version = vMatch[1].trim();
                  title = cleanHeading.replace(/^(?:\[[^\]]+\]\s*)+/g, '').replace(/\s*\[[^\]]+\]\s*$/g, '').trim() || title;
                }
                versions = extractVersionsFromHtml(html, version);
              }
            } catch (err) {
              console.warn('[Poller] Resolve thread fetch error:', err.message);
            }

            return {
              id,
              title,
              latestVersion: version || 'v1.0.0',
              versions: versions.length > 0 ? versions : [version || 'v1.0.0'],
              existingGame: existing || null,
              prefixes
            };
          }
          case 'QUICK_ADD_GAME': {
            const id = parseThreadIdFromUrl(String(message.input || ''));
            if (!id) return { error: 'Please enter a valid F95zone thread URL or ID.' };

            const existing = await getGame(id);
            if (existing) {
              return { game: existing, alreadyTracked: true };
            }

            const settings = await getSettings();
            let title = message.title || `Thread #${id}`;
            let version = message.latestVersion || 'v1.0.0';
            let prefixes = message.prefixes || [];
            let versions = [];

            if (!message.title || !message.latestVersion) {
              try {
                const res = await fetch(`https://${settings.domain}/threads/${id}/`, {
                  headers: { 'Accept': 'text/html' }
                });
                if (res.ok) {
                  const html = await res.text();
                  const titleMatch = html.match(/<h1[^>]*class="[^"]*p-title-value[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                                     html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                  if (titleMatch) {
                    const cleanHeading = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                    const vMatch = cleanHeading.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
                    if (vMatch) version = vMatch[1].trim();
                    title = cleanHeading.replace(/^(?:\[[^\]]+\]\s*)+/g, '').replace(/\s*\[[^\]]+\]\s*$/g, '').trim() || title;
                  }
                  versions = extractVersionsFromHtml(html, version);
                }
              } catch (err) {
                console.warn('[Poller] Quick add thread fetch error:', err.message);
              }
            }

            const installedVersion = (message.installedVersion !== undefined && message.installedVersion !== '')
              ? message.installedVersion
              : version;
            const status = (installedVersion !== version) ? 'update' : 'current';

            const game = await saveGame({
              id,
              url: `https://${settings.domain}/threads/${id}/`,
              title,
              installedVersion,
              latestVersion: version,
              prefixes,
              tags: Array.isArray(message.tags) ? message.tags : [],
              notes: message.notes || '',
              status,
              archived: false,
              addedAt: Date.now(),
              latestSeenAt: Date.now()
            });

            const count = await getPendingUpdatesCount();
            await updateBadge(count);
            return { game, versions };
          }
          case 'UPDATE_GAME': {
            const game = await updateGame(message.id, message.payload);
            const count = await getPendingUpdatesCount();
            await updateBadge(count);
            return game;
          }
          case 'REMOVE_GAME': {
            const res = await removeGame(message.id);
            const count = await getPendingUpdatesCount();
            await updateBadge(count);
            return res;
          }
          case 'POLL_NOW': {
            return await runPoll({ manual: true });
          }
          case 'UPDATE_SETTINGS': {
            const settings = await updateSettings(message.payload);
            return settings;
          }
          case 'EXPORT_DATA': {
            return await exportData();
          }
          case 'IMPORT_DATA': {
            const res = await importData(message.payload, message.options);
            const count = await getPendingUpdatesCount();
            await updateBadge(count);
            return res;
          }
          default:
            return { error: `Unknown message type: ${message.type}` };
        }
      };

      handle()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // Keep message port open for async response
    });
  }
}

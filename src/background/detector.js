// src/background/detector.js
// Pure detection and parsing functions for updates, titles, versions, prefixes, and changelogs.

// Known XenForo prefix ID or label mappings (if numeric IDs are used by latest_data.php)
export const KNOWN_PREFIX_LABELS = {
  2: 'Completed',
  3: 'Abandoned',
  4: 'On Hold',
  116: 'VN',
  117: 'RPGM'
};

/**
 * Extracts thread ID from an F95zone URL or path.
 * Supports /threads/<slug>.<id>/, /threads/<id>/, and full URLs.
 */
export function parseThreadIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/threads\/(?:[^\/?#]+\.)?(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Parses thread heading text to extract clean title, version, and prefixes.
 * Example: "[Completed] [VN] My Game [v1.0.5] [StudioName]"
 */
export function parseThreadHeading(rawHeading) {
  if (!rawHeading || typeof rawHeading !== 'string') {
    return { title: '', version: '', prefixes: [] };
  }

  let text = rawHeading.replace(/\s+/g, ' ').trim();
  const prefixes = [];

  // Match leading bracketed tags or label spans, e.g. [Completed] [VN]
  const leadingBracketsRegex = /^(?:\[([^\]]+)\]\s*)+/;
  const leadingMatch = text.match(leadingBracketsRegex);
  if (leadingMatch) {
    const bracketBlocks = [...text.matchAll(/\[([^\]]+)\]/g)];
    // Check if these appear at the beginning of the string
    let currentIdx = 0;
    for (const b of bracketBlocks) {
      if (b.index === currentIdx) {
        prefixes.push(b[1].trim());
        currentIdx += b[0].length;
        while (text[currentIdx] === ' ') currentIdx++;
      } else {
        break;
      }
    }
    text = text.slice(currentIdx).trim();
  }

  // Look for version pattern inside brackets anywhere in the remainder:
  // e.g. [v0.12.3], [0.5], [Ch.2], [Ep. 1-3], [Part 1]
  let version = '';
  const versionMatch = text.match(/\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/i);
  if (versionMatch) {
    version = versionMatch[1].trim();
  }

  // Look for developer/creator brackets at the end: e.g. [DevName]
  const trailingDevMatch = text.match(/\s*\[([^\]]+)\]\s*$/);
  let cleanTitle = text;
  if (trailingDevMatch && trailingDevMatch[1] !== version) {
    cleanTitle = cleanTitle.slice(0, trailingDevMatch.index).trim();
  }
  if (versionMatch) {
    cleanTitle = cleanTitle.replace(versionMatch[0], '').replace(/\s+/g, ' ').trim();
  }

  return {
    title: cleanTitle || text,
    version,
    prefixes
  };
}

/**
 * Pure function: compares existing stored GameRecord with incoming data from forum poller or scrape.
 * Versions are opaque strings: any difference from installedVersion = update.
 */
export function detectChanges(storedGame, incoming) {
  if (!storedGame) return { hasChanges: false, updatedGame: null, events: [] };

  const events = [];
  const updatedGame = { ...storedGame };
  let hasChanges = false;

  // 1. Title Change
  const incomingTitle = (incoming.title || '').trim();
  if (incomingTitle && incomingTitle !== storedGame.title) {
    events.push({
      type: 'title_change',
      threadId: storedGame.id,
      oldTitle: storedGame.title,
      newTitle: incomingTitle
    });
    updatedGame.prevTitle = storedGame.title;
    updatedGame.title = incomingTitle;
    hasChanges = true;
  }

  // 2. Version Change (opaque string comparison)
  const incomingVersion = (incoming.version || '').trim();
  if (incomingVersion && incomingVersion !== storedGame.latestVersion) {
    updatedGame.latestVersion = incomingVersion;
    hasChanges = true;

    // Check if new latestVersion differs from installedVersion
    if (incomingVersion !== storedGame.installedVersion) {
      updatedGame.status = 'update';
      events.push({
        type: 'version_change',
        threadId: storedGame.id,
        title: updatedGame.title,
        oldVersion: storedGame.installedVersion,
        newVersion: incomingVersion
      });
    } else {
      updatedGame.status = 'current';
    }
  }

  // 3. Prefix / Status Change
  if (Array.isArray(incoming.prefixes) && incoming.prefixes.length > 0) {
    const oldP = (storedGame.prefixes || []).map(String).sort().join(',');
    const newP = incoming.prefixes.map(String).sort().join(',');
    if (oldP !== newP) {
      events.push({
        type: 'prefix_change',
        threadId: storedGame.id,
        title: updatedGame.title,
        oldPrefixes: storedGame.prefixes || [],
        newPrefixes: incoming.prefixes
      });
      updatedGame.prefixes = incoming.prefixes;
      hasChanges = true;
    }
  }

  if (incoming.ts) {
    updatedGame.latestSeenAt = Number(incoming.ts) * 1000;
    hasChanges = true;
  }

  return {
    hasChanges,
    updatedGame,
    events
  };
}

/**
 * Extracts changelog snippet from thread HTML.
 * Never throws. Falls back gracefully.
 */
export function parseChangelogFromHtml(html, oldVersion = '', newVersion = '') {
  const fallback = `Updated: ${oldVersion || 'unknown'} -> ${newVersion || 'new'}`;
  if (!html || typeof html !== 'string') return fallback;

  try {
    // 1. Look for spoiler with Changelog in the spoiler button or header
    const spoilerRegex = /<div[^>]*class="[^"]*bbCodeSpoiler[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const spoilers = [...html.matchAll(spoilerRegex)];
    for (const sp of spoilers) {
      const spContent = sp[0];
      if (/changelog|change-log|changes|updates/i.test(spContent)) {
        // Strip HTML tags safely to plain text
        const text = spContent
          .replace(/<button[\s\S]*?<\/button>/gi, '') // remove button label
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 10) {
          return text.slice(0, 300) + (text.length > 300 ? '...' : '');
        }
      }
    }

    // 2. Look for bbCodeBlock or bold Changelog label
    const headingMatch = html.match(/(?:<b>|<strong>|\b)(?:Changelog|Change Log|Updates)(?:<\/b>|<\/strong>|:)([\s\S]{10,400})/i);
    if (headingMatch && headingMatch[1]) {
      const text = headingMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 10) {
        return text.slice(0, 300) + (text.length > 300 ? '...' : '');
      }
    }
  } catch {
    // Return fallback on any unexpected issue
  }

  return fallback;
}

/**
 * Extracts available versions (current and previous/historical) from thread HTML or message markup.
 * Looks into changelog spoilers, download blocks, and version headers.
 * Returns array of clean version strings, with currentVersion at the top.
 */
export function extractVersionsFromHtml(html, currentVersion = '') {
  const versions = [];
  const seen = new Set();

  if (currentVersion && currentVersion.trim()) {
    const cv = currentVersion.trim();
    versions.push(cv);
    seen.add(cv.toLowerCase());
  }

  if (!html || typeof html !== 'string') return versions;

  // Prioritize first post or spoiler/changelog sections if available
  let targetText = '';
  const postMatch = html.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                    html.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (postMatch) {
    targetText = postMatch[1];
  } else {
    targetText = html;
  }

  // Convert HTML line breaks and blocks to newlines
  const plainText = targetText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  const lines = plainText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Pattern 1: Lines starting with a version heading, e.g. "v0.21.1:", "Ch.8 RE v5.0:", "v1.0.0 -", "0.20:", "Version 1.2"
  const lineHeadingRegex = /^(?:#+\s*)?(?:(?:v(?:er(?:sion)?)?\.?\s*|ch(?:apter)?\.?\s*|ep(?:isode)?\.?\s*|part\s*))?([0-9]+(?:\.[0-9a-zA-Z_\-]+)*(?:\s*(?:Extra|Final|Hotfix|RE|Patch|v[0-9\.]+))*)\s*(?:[:\-\–\—]|\s*$)/i;

  // Pattern 2: Explicit version tokens like v0.21.1 or Ch.8 in the line
  const explicitTokenRegex = /\b((?:v|ver\.|ch\.|ep\.|part\s*)[0-9]+(?:\.[0-9a-zA-Z_\-]+)*(?:\s*(?:Extra|Final|Hotfix|RE|Patch|v[0-9\.]+))*)\b/gi;

  // Pattern 3: Bracketed versions like [v0.20], [Ch.7]
  const bracketRegex = /\[(v?[\d][^\]]*|Ch\.[^\]]*|Ep\.[^\]]*|Part\s*[\d][^\]]*)\]/gi;

  function tryAdd(cand) {
    if (!cand) return;
    cand = cand.replace(/^[\[\(\s]+|[\]\)\:\-\–\—\s]+$/g, '').trim();
    if (!cand || cand.length < 2 || cand.length > 30) return;
    if (/^(?:19\d\d|20\d\d)$/.test(cand)) return;
    if (/^(?:1080|720|480|4k)$/i.test(cand)) return;
    if (/^(?:megaupload|pixeldrain|mediafire|google|mega|download|link|changelog)$/i.test(cand)) return;
    if (!/\d/.test(cand)) return; // Must contain at least one digit

    const lower = cand.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      versions.push(cand);
    }
  }

  for (const line of lines) {
    if (line.length <= 80) {
      const headingMatch = line.match(lineHeadingRegex);
      if (headingMatch && headingMatch[1]) {
        tryAdd(headingMatch[0].replace(/[:\-\–\—]$/, ''));
      }
    }

    const explicitMatches = [...line.matchAll(explicitTokenRegex)];
    for (const m of explicitMatches) {
      tryAdd(m[1]);
    }

    const bracketMatches = [...line.matchAll(bracketRegex)];
    for (const m of bracketMatches) {
      tryAdd(m[1]);
    }
  }

  return versions;
}

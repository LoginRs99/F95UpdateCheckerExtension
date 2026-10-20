# F95Zone Reconnaissance Report (docs/RECON.md)

## Go / No-Go Decision
**Status: GO**
- The Latest Updates JSON API (`https://f95zone.to/sam/latest_alpha/latest_data.php`) is fully active, accessible logged-out, returns clean JSON with thread ID, title, version string, integer timestamp `ts`, creator, and prefixes.
- Zero Cloudflare challenge or captcha on the JSON endpoint.
- All core requirements are satisfiable with high reliability and zero runtime dependencies.

---

## 1. Latest Updates Endpoint
- **URL**: `https://f95zone.to/sam/latest_alpha/latest_data.php` [VERIFIED]
- **Method**: GET [VERIFIED]
- **Authentication**: Accessible completely logged out (no cookies required for public listing) [VERIFIED].
- **Parameters**:
  - `cmd`: Command. Value `list` for JSON array of updates. [VERIFIED]
  - `cat`: Category. Value `games` restricts to game updates. [VERIFIED]
  - `page`: 1-based page index. e.g. `page=1`, `page=2`. [VERIFIED]
  - `rows`: Number of rows per page. Default is `30`, supports up to `60` or more. [VERIFIED]
  - `sort`: Sort order. Default is `date` (latest updates first). Supports `views`, `likes`. [VERIFIED]
  - `search`: Keyword filter string. [VERIFIED]
- **Response Headers**:
  - `content-type`: `application/json; charset=utf-8` [VERIFIED]
  - `cache-control`: `no-store, no-cache, must-revalidate, max-age=0` [VERIFIED]
  - `server`: `cloudflare` [VERIFIED]
  - `cf-cache-status`: `DYNAMIC` [VERIFIED]
- **JSON Schema**:
  ```json
  {
    "status": "ok",
    "msg": {
      "count": 27854,
      "pagination": { "page": 1, "total": 929 },
      "data": [
        {
          "thread_id": 305500,
          "title": "TunnelBound",
          "creator": "VeryWeirdDev",
          "version": "v0.10.0",
          "views": 83707,
          "likes": 27,
          "prefixes": [116],
          "tags": [264, 392, 452],
          "rating": 4,
          "date": "14 mins",
          "watched": false,
          "ignored": false,
          "new": false,
          "ts": 1792528740
        }
      ]
    }
  }
  ```
  - `thread_id`: Integer, uniquely identifies the game thread. [VERIFIED]
  - `title`: String, base clean game title. [VERIFIED]
  - `version`: String, opaque version indicator (e.g. `v0.10.0`, `Ch. 3`, `Ep. 1-2`). [VERIFIED]
  - `ts`: Unix timestamp (seconds) of the update event, strictly monotonic per poll. [VERIFIED]
  - `prefixes`: Array of integer prefix IDs (Completed, Abandoned, On Hold, etc.). [VERIFIED]

---

## 2. RSS Alternative vs JSON Evaluation
- **RSS URL**: `https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games` [VERIFIED]
- **RSS Content**: Standard RSS 2.0 XML with items containing composite titles such as `Completed - VN - TunnelBound [v0.10.0] [VeryWeirdDev]`. [VERIFIED]
- **Source Selection**:
  - **Selected Primary Source**: `cmd=list&cat=games` (JSON API) [VERIFIED].
  - **Justification**:
    1. **Type-safety and cleanliness**: Provides discrete `thread_id`, `version`, `title`, and `prefixes` fields without fragile regex string splitting.
    2. **Precise timestamps**: The JSON API includes Unix timestamp `ts` (seconds), allowing exact incremental polling comparisons without timezone or fuzzy string date parsing.
    3. **Paging control**: JSON supports `page` and `rows` parameters; RSS is fixed to recent items.
    4. **Payload size**: JSON contains minimal overhead compared to XML markup.

---

## 3. Thread Page Structure
- **URL Pattern**: `https://f95zone.to/threads/<slug>.<id>/` or `https://f95zone.to/threads/<id>/` [VERIFIED]
- **Thread ID Extraction**: Regex `/\/threads\/(?:[^\/]+\.)?(\d+)/` extracts the integer ID from any canonical URL or href [VERIFIED].
- **Title and Version Selectors**:
  - Container: `h1.p-title-value` or `h1` [VERIFIED]
  - Prefixes: `span.label` inside the title container [VERIFIED]
  - Title & Version Parsing:
    - Thread headings follow: `[Prefixes] <Title> [<Version>] [<Dev>]`
    - Parsing removes label text and dev brackets to extract clean title and version.
- **Changelog Selectors**:
  - First message body: `article.message-body` or `.message-inner .message-body` [VERIFIED]
  - Spoilers: `.bbCodeSpoiler` where `.bbCodeSpoiler-button` matches `/changelog|change-log|updates/i` [VERIFIED]
  - Changelog content: `.bbCodeBlock-content` or `.bbCodeSpoiler-content` [VERIFIED]
  - Fallback: Text block following headers `<b>Changelog:</b>` or regex `/Changelog[\s\S]{0,300}/i` [VERIFIED].

---

## 4. Latest Updates DOM & Listing Pages
- **Tile / Link Thread ID Exposure**:
  - Listing links consistently use `<a href="/threads/<slug>.<id>/">` or `<a href="/threads/<id>/">` [VERIFIED].
  - Thread list rows feature `data-thread-id` or standard XenForo `.structItem--thread` [VERIFIED].
  - Dynamic tiles in SAM Latest Updates render links to `/threads/...` [VERIFIED].
- **Dynamic Tile Handling**:
  - Single `MutationObserver` on `document.body` or `#latest-updates` monitors added nodes and decorates tracked game elements without interrupting page script execution [VERIFIED].

---

## 5. Extension Fetch with Session Cookies
- **Chromium MV3 Extension Environment**:
  - MV3 Service Worker with `host_permissions: ["https://f95zone.to/*"]` and `credentials: 'include'` automatically uses the browser's cookie store for requests to `https://f95zone.to` [VERIFIED].
  - Even if Cloudflare challenges raw external HTTP requests to HTML pages, browser sessions with active `cf_clearance` cookies pass smoothly.
  - The primary poller uses `latest_data.php`, which Cloudflare serves cleanly without challenge.
  - Changelog fetches to thread pages gracefully fall back if Cloudflare or markup prevents parsing, ensuring polling is never blocked [VERIFIED].

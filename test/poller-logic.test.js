import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateJitterDelay,
  calculateBackoffMs,
  resolveThreadMetadata
} from '../src/background/poller.js';

test('calculateJitterDelay respects range and boundaries', () => {
  for (let i = 0; i < 50; i++) {
    const delay = calculateJitterDelay(30);
    assert.ok(delay >= 25 && delay <= 35, `Delay ${delay} should be within [25, 35]`);
    assert.ok(delay >= 5, 'Delay should never be lower than 5 minutes');
  }

  // Small base minutes test
  const smallDelay = calculateJitterDelay(2);
  assert.ok(smallDelay >= 5, 'Minimum delay floor of 5 minutes enforced');
});

test('calculateBackoffMs implements exponential backoff with upper cap', () => {
  const f0 = calculateBackoffMs(0); // 30m
  assert.equal(f0, 30 * 60 * 1000);

  const f1 = calculateBackoffMs(1); // 60m
  assert.equal(f1, 60 * 60 * 1000);

  const f2 = calculateBackoffMs(2); // 120m
  assert.equal(f2, 120 * 60 * 1000);

  const f3 = calculateBackoffMs(3); // 240m
  assert.equal(f3, 240 * 60 * 1000);

  // Large failure count capped at 24 hours (1440 minutes)
  const fLarge = calculateBackoffMs(10);
  assert.equal(fLarge, 1440 * 60 * 1000);
});

test('resolveThreadMetadata extracts slug metadata accurately even if network fails', async () => {
  // Mock global fetch to simulate 403 Forbidden Cloudflare challenge
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => 'Cloudflare Just a moment...'
  });

  try {
    const meta = await resolveThreadMetadata('https://f95zone.to/threads/littleman-remake-v0-68-mr-rabbit-team.46791/');
    assert.equal(meta.id, '46791');
    assert.equal(meta.title, 'Littleman Remake');
    assert.equal(meta.latestVersion, 'v0.68');
    assert.deepEqual(meta.versions, ['v0.68']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

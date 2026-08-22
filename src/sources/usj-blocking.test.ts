/**
 * Story 1.4, I/O matrix row: catalog sampling must not swallow a persistent
 * block as if it were one blind sample's bad luck.
 *
 * `listProducts` samples the catalogue over several dates through `mapLimit`,
 * and its per-date catch block already tolerates ordinary failures (one sample
 * missing a product costs nothing another sample didn't also see).
 * `BlockedError` is different: it means the store itself has stopped answering,
 * so every other sample is chasing the same wall. This locks that the catch
 * block special-cases it and lets it propagate instead of logging and moving on
 * to the next date.
 *
 * `fetch` and the timers are mocked (see `test-support.ts`), so the real
 * `limitedFetch` retry loop inside `fetchCatalogPage` still runs — this is an
 * integration check across the real call chain, not a stub of
 * `fetchCatalogPage` — without costing real wall-clock time.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError } from '../limiter';
import { settle } from '../test-support';
import { usjSource } from './usj';

test('a persistent block during catalog sampling propagates out of listProducts instead of being logged and skipped', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 4_000_000 });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  t.mock.method(console, 'error', () => undefined);

  // A single-day range yields exactly one catalog sample, so there is only one
  // place the block can come from — no ambiguity about which sample rejected.
  const outcome = await settle(t, usjSource.listProducts({ start: '2026-09-01', end: '2026-09-01' }, []));

  assert.equal(outcome.status, 'rejected', 'a blocked sample must not be logged and skipped');
  assert.ok(outcome.reason instanceof BlockedError, `expected a BlockedError, got ${outcome.reason}`);
});

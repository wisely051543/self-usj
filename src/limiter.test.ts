/**
 * Story 1.4: the retry/backoff behaviour `limitedFetch` (src/limiter.ts) owes
 * the rest of the fetcher.
 *
 * Two invariants are locked here. First, the widening retry delay itself —
 * `RETRY_DELAYS_MS` is private, so this asserts the literal sequence
 * [1000, 2000, 4000] rather than importing it, which is the point: a future
 * edit that quietly flattens it to a fixed delay fails this test instead of
 * only showing up as a subtler change in production request timing.
 * Second, that retries exhausted while still 429/5xx throw `BlockedError`
 * rather than handing the blocked `Response` back to the caller, which is the
 * signal `usj.ts` and `fetcher.ts` rely on to stop a round instead of
 * grinding through it (AD-16 #1).
 *
 * `fetch` and the timer/Date pair are both mocked so a full exhausted-retry
 * run (1000 + 2000 + 4000 ms of real delay) costs nothing. `Date` is mocked
 * alongside `setTimeout` — `tick()` advances both together — so the rate gate
 * inside `limitedFetch` (which reads `Date.now()` directly, independent of
 * the mocked backoff `sleep()`) does not itself inject an unaccounted-for
 * wait between attempts. Each test picks a `now` far past any previous
 * test's ending point, since `nextSlotAt` is module-level state that
 * survives between tests in this file.
 *
 * What the delay test measures is the gap between request *starts*, which is
 * `max(backoff, rate-gate slot)` rather than the backoff alone. At the current
 * ceilings the gate's 1000ms floor is under every delay in the sequence, so the
 * gaps are the delays; a flattened sequence still fails the assertion, since a
 * flat delay reads as flat gaps whichever of the two dominates.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError, limitedFetch } from './limiter';
import { flush, track } from './test-support';

/** Not named `URL`: that shadows the global constructor for the whole file. */
const TEST_URL = 'https://example.test/resource';

const response = (status: number): Response => new Response('', { status });

/** Let pending microtasks run, then fire whatever mocked timer is now due. */
async function advance(t: TestContext, ms: number): Promise<void> {
  await flush();
  t.mock.timers.tick(ms);
}

test('a 429 followed by a 200 succeeds after the first retry delay', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response(calls === 1 ? 429 : 200);
  });

  const promise = limitedFetch(TEST_URL);
  await advance(t, 1000);
  const res = await promise;

  assert.equal(res.status, 200);
  assert.equal(calls, 2, 'expected exactly one retry (2 fetch calls)');
});

test('retries exhausted while still 429/5xx reject with BlockedError, delays widening 1000/2000/4000', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });
  const callTimes: number[] = [];
  t.mock.method(globalThis, 'fetch', async () => {
    callTimes.push(Date.now());
    return response(500); // 5xx, per the I/O matrix's "429（或 5xx）"
  });

  // Tracked at creation rather than awaited at the end: the ticks below span
  // several macrotasks, and a rejection left unwatched across them is reported
  // as an unhandledRejection before the assertion ever runs.
  const settlement = track(limitedFetch(TEST_URL));
  await advance(t, 1000);
  await advance(t, 2000);
  await advance(t, 4000);
  await flush();

  const outcome = settlement.outcome;
  assert.equal(outcome?.status, 'rejected', 'a persistent block must reject, not hand back the response');
  const err = outcome?.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(err instanceof BlockedError, `expected a BlockedError, got ${err}`);
  assert.equal(err.url, TEST_URL);
  assert.equal(err.status, 500);

  assert.equal(callTimes.length, 4, 'expected 1 original request + 3 retries');
  const delays = [1, 2, 3].map(i => callTimes[i] - callTimes[i - 1]);
  assert.deepEqual(
    delays,
    [1000, 2000, 4000],
    'retry delays must widen in the fixed RETRY_DELAYS_MS sequence, not a flat delay',
  );
});

test('a non-retryable status (404) is returned immediately, untouched', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 3_000_000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response(404);
  });

  const res = await limitedFetch(TEST_URL);

  assert.equal(res.status, 404);
  assert.equal(calls, 1, '404 must not be retried');
});

test('BlockedError carries the url and status that caused it, and is instanceof Error', () => {
  const err = new BlockedError(TEST_URL, 503);
  assert.ok(err instanceof BlockedError);
  assert.ok(err instanceof Error);
  assert.equal(err.url, TEST_URL);
  assert.equal(err.status, 503);
});

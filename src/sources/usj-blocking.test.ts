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
import { everyNthDay } from '../dates';
import { flush, settle } from '../test-support';
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

/**
 * DW-9: propagating the block stops the round, but it does not by itself stop
 * the sampling that is still running underneath it.
 *
 * `mapLimit` gives a throwing callback no special standing: the worker that
 * threw ends its own loop and the other three keep pulling dates off the
 * shared cursor. Every one of those requests is aimed at a store that has
 * already been established as blocking, so they buy nothing and cost the
 * round more time under a block it is trying to back away from.
 *
 * The drain at the end is the whole test. `Promise.all` settles on the first
 * rejection, at which point the other workers are merely parked on a mocked
 * timer with their next date not yet requested — so asserting right there
 * passes whether or not the flag exists. Only by ticking on afterwards does
 * "no further dates were requested" become a claim that fails when the flag
 * is removed.
 */
test('once a block surfaces, catalog sampling stops opening new dates instead of walking the rest of the samples', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);

  // A year of samples, far more than `CONCURRENCY`, so the dates left unopened
  // when the block surfaces are a wide margin rather than a coincidence of
  // timing. The step mirrors `CATALOG_SAMPLE_DAYS`, which usj.ts keeps private;
  // the subset assertion below fails loudly if the two ever drift apart.
  const range = { start: '2026-09-01', end: '2027-09-01' };
  const samples = everyNthDay(range.start, range.end, 7);
  assert.ok(samples.length > 20, `this test needs many more samples than workers, got ${samples.length}`);

  // The first sample blocks, so the block surfaces while the other workers are
  // still healthy and still pulling — which is the situation the flag exists for.
  const blockedDate = samples[0];
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const date = /WTS-(\d{4}-\d{2}-\d{2})/.exec(String(input))?.[1] ?? '';
    requested.push(date);
    if (date === blockedDate) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ products: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const outcome = await settle(t, usjSource.listProducts(range, []));

  assert.equal(outcome.status, 'rejected', 'the block must still stop the round');
  assert.ok(outcome.reason instanceof BlockedError, `expected a BlockedError, got ${outcome.reason}`);

  const opened = new Set(requested);
  for (const date of opened) {
    assert.ok(samples.includes(date), `requested ${date}, which is not one of the sampled dates`);
  }
  // Measured at 13 of 53 on this setup. Half is the loose end of that: it still
  // fails outright without the flag (all 53 are opened) and states what the flag
  // buys — most of the sampling abandoned — without pinning a number that moves
  // whenever the rate gate or the backoff sequence is retuned.
  assert.ok(
    opened.size <= samples.length / 2,
    `the block must abandon most of the sampling, but ${opened.size} of ${samples.length} dates were opened`,
  );

  // Keep ticking past the rejection: any worker still walking the sample list
  // gets its chance to issue the next request here.
  const openedAtAbort = new Set(opened);
  for (let i = 0; i < 20; i++) {
    await flush();
    t.mock.timers.tick(10_000);
  }
  await flush();

  const openedAfterDrain = new Set(requested);
  assert.deepEqual(
    [...openedAfterDrain].sort(),
    [...openedAtAbort].sort(),
    'no new date may be requested after the block has surfaced',
  );
});

/**
 * The other half of the flag's contract: an ordinary failure is still just one
 * blind sample.
 *
 * The block flag added above sits in the same catch as the tolerated-failure
 * path, so the cheapest way to get it wrong is to set it on every error rather
 * than on `BlockedError` alone — which would silently turn one 404 into a
 * truncated catalogue, with no exception to notice and a product list that is
 * merely short. This locks that a non-block failure leaves every remaining
 * sample to run and the catalogue to come back whole.
 */
test('an ordinary catalog failure is logged and skipped, leaving the remaining samples to run', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 7_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  // The same wide sample list the block test uses, and for the same reason: a
  // range small enough for `mapLimit` to claim every date up front never
  // consults the flag again after the failure, so the test would pass with the
  // flag set unconditionally — exactly the regression it exists to catch.
  const range = { start: '2026-09-01', end: '2027-09-01' };
  const samples = everyNthDay(range.start, range.end, 7);
  assert.ok(samples.length > 20, `this test needs many more samples than workers, got ${samples.length}`);

  // Mid-list, so most of the sampling is still unclaimed when the failure lands
  // and there is something left for a wrongly-set flag to swallow.
  // 404 is not retryable, so `limitedFetch` hands it straight back and
  // `fetchCatalogPage` turns it into an ordinary Error — not a BlockedError.
  const failedDate = samples[Math.floor(samples.length / 2)];
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const date = /WTS-(\d{4}-\d{2}-\d{2})/.exec(String(input))?.[1] ?? '';
    requested.push(date);
    if (date === failedDate) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify({ products: [{ code: `P-${date}`, name: `Pass ${date}` }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const outcome = await settle(t, usjSource.listProducts(range, []));

  assert.equal(outcome.status, 'fulfilled', `one bad sample must not fail the catalogue, got ${
    outcome.status === 'rejected' ? outcome.reason : ''}`);
  const codes = outcome.status === 'fulfilled' ? outcome.value.map(e => e.code).sort() : [];
  assert.deepEqual(
    codes,
    samples.filter(date => date !== failedDate).map(date => `P-${date}`).sort(),
    'every sample but the failing one must still contribute its products',
  );
  assert.deepEqual(
    [...new Set(requested)].sort(),
    [...samples].sort(),
    'an ordinary failure must not stop the remaining dates from being opened',
  );
  assert.ok(
    errors.some(line => line.includes(failedDate)),
    `the skipped sample must be logged, got: ${JSON.stringify(errors)}`,
  );
});

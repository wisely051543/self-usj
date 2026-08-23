/**
 * DW-35: `fetchSlotStock`'s `mapLimit` walk over stock batches had the same
 * unbounded-continue-after-block gap `listProducts` used to have — fixed there
 * by DW-8/9/10 (see `usj-blocking.test.ts`) and deliberately left open here at
 * the time, tracked as this story. Its catch block only special-cased
 * `BlockedError` enough to rethrow it; nothing stopped the other `mapLimit`
 * workers from opening new batches aimed at a store already known to be
 * blocking.
 *
 * This locks the same two behaviours `usj-blocking.test.ts` locks for
 * `listProducts`, at the stock-batch level instead of the catalog-sample
 * level: batches opened after a block surfaces stay bounded even after
 * several more ticks, and an ordinary (non-block) batch failure still leaves
 * every other batch to complete normally.
 *
 * Both tests drive the real `usjSource.fetchProduct(...)`, so the whole chain
 * from `fetchProductInfo` through `fetchTimeSlots` and `fetchSlotStock` runs
 * against a mocked `fetch` and mocked timers (see `test-support.ts`) — an
 * integration check across the real call chain, not a stub of
 * `fetchInventory`. `usj-fetchproduct-blocking.test.ts` already covers "the
 * first stock batch blocks -> fetchProduct rejects with BlockedError"; this
 * file only adds the two behaviours that guard was never meant to cover.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError, CONCURRENCY } from '../limiter';
import { flush, settle } from '../test-support';
import { usjSource } from './usj';
import type { CatalogEntry, DateRange } from '../types';

const entry: CatalogEntry = {
  code: 'TEST0035',
  name: 'Test Pass',
  eyebrow: '',
  imageUrl: '',
  legalDesc: '',
  fromPrice: null,
};

const range: DateRange = { start: '2026-09-01', end: '2027-03-01' };

const DATE = '2026-09-01';

const CALENDAR = {
  eventAvailability: [
    {
      partNumber: entry.code,
      calendarDates: [
        {
          date: DATE,
          canBeVisited: true,
          forceSoldOut: false,
          inventoryEvents: [{ availableUnits: '5', maxAvailable: '5', totalCapacity: '10' }],
          pricing: [{ amount: 10000, formattedAmount: '¥10,000' }],
        },
      ],
    },
  ],
};

/** One timed attraction is all it takes for the pass to count as slotted. */
const PRODUCT_INFO = {
  attractions: {
    events: [
      {
        eventCode: 'EXP_TEST_182000185000',
        eventName: 'テストアトラクション',
        maingroup: 'TIMED',
        selectionFromTime: '10:00',
        selectionToTime: '11:00',
      },
    ],
  },
};

/**
 * Mirrors usj.ts's private STOCK_BATCH_SIZE (100), the same way
 * usj-blocking.test.ts mirrors CATALOG_SAMPLE_DAYS: kept as a literal, with
 * the assertion below that batching produces far more batches than
 * `CONCURRENCY` failing loudly if the two ever drift apart.
 */
const STOCK_BATCH_SIZE = 100;

/**
 * Far more variants (time slots) than STOCK_BATCH_SIZE * CONCURRENCY, so the
 * batches left unopened when a block surfaces are a wide margin rather than a
 * coincidence of timing.
 */
const VARIANT_COUNT = STOCK_BATCH_SIZE * CONCURRENCY * 20;

interface VariantProduct {
  code: string;
  attractions: { events: Array<Record<string, unknown>> };
}

/** One TIMED variant per index, all on the same date, so each becomes one stock pair. */
function makeVariants(count: number): VariantProduct[] {
  return Array.from({ length: count }, (_, i) => {
    const idx = String(i).padStart(6, '0');
    return {
      code: `VAR${idx}`,
      attractions: {
        events: [
          {
            eventCode: `EXP_TEST_${idx}`,
            eventName: 'テストアトラクション',
            maingroup: 'TIMED',
            selectionFromTime: '10:00',
            selectionToTime: '11:00',
          },
        ],
      },
    };
  });
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A persistent block: the same 503 to every attempt, retries included. */
const blocked = () => new Response('', { status: 503 });

/** 404 is not retryable, so limitedFetch hands it straight back as an ordinary failure. */
const notFound = () => new Response('', { status: 404 });

/** The stock endpoint's request body carries the batch's part numbers; the first one identifies the batch. */
function firstPartNumber(init: RequestInit | undefined): string | undefined {
  const body = JSON.parse(String(init?.body ?? '{}')) as { events?: Array<{ partNumber: string }> };
  return body.events?.[0]?.partNumber;
}

/**
 * Each test enables the mocked clock at its own starting point, comfortably
 * past where the previous one could have left it: the limiter's `nextSlotAt`
 * is module-level state that outlives a single test's timer mock.
 */
test('once a stock batch blocks, fetchSlotStock stops opening new batches instead of walking the rest', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000_000 });
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);

  const variants = makeVariants(VARIANT_COUNT);
  const totalBatches = Math.ceil(VARIANT_COUNT / STOCK_BATCH_SIZE);
  assert.ok(
    totalBatches > CONCURRENCY * 2,
    `this test needs many more batches than workers, got ${totalBatches}`,
  );

  // The first batch's first variant blocks, so the block surfaces while the
  // other workers are still healthy and still pulling — the situation the
  // flag exists for (same setup as usj-blocking.test.ts's DW-9 test).
  const blockedPartNumber = variants[0].code;
  const requestedBatches: string[] = [];

  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      const pn = firstPartNumber(init);
      // The product's own calendar lookup, not a stock batch.
      if (pn === entry.code) return json(CALENDAR);
      requestedBatches.push(pn ?? '');
      if (pn === blockedPartNumber) return blocked();
      return json({ eventAvailability: [] });
    }
    if (url.includes('getExpressPassVariantDetails')) return json({ products: variants });
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'rejected', 'the block must still stop fetchProduct');
  assert.ok(outcome.reason instanceof BlockedError, `expected a BlockedError, got ${outcome.reason}`);

  const openedAtAbort = new Set(requestedBatches);
  assert.ok(
    openedAtAbort.size <= totalBatches / 2,
    `the block must abandon most of the batches, but ${openedAtAbort.size} of ${totalBatches} were opened`,
  );

  // Keep ticking past the rejection: any worker still walking the batch list
  // gets its chance to issue the next request here. `Promise.all` settles on
  // the first rejection, at which point the other workers are merely parked
  // on a mocked timer with their next batch not yet requested — asserting
  // right there would pass whether or not the flag exists. Only by ticking on
  // afterwards does "no further batch was requested" become a claim that
  // fails when the flag is removed.
  for (let i = 0; i < 20; i++) {
    await flush();
    t.mock.timers.tick(10_000);
  }
  await flush();

  assert.deepEqual(
    [...new Set(requestedBatches)].sort(),
    [...openedAtAbort].sort(),
    'no new batch may be requested after the block has surfaced',
  );
});

test('an ordinary stock batch failure is logged and skipped, leaving the remaining batches to complete', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 110_000_000 });
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  t.mock.method(console, 'log', () => undefined);

  const variants = makeVariants(VARIANT_COUNT);
  const totalBatches = Math.ceil(VARIANT_COUNT / STOCK_BATCH_SIZE);

  // Mid-list, so most of the batching is still unclaimed when the failure
  // lands and there is something left for a wrongly-set flag to swallow.
  const failedBatchIndex = Math.floor(totalBatches / 2);
  const failedPartNumber = variants[failedBatchIndex * STOCK_BATCH_SIZE].code;
  // A different batch (the very first one), to prove the rest still complete.
  const otherPartNumber = variants[0].code;

  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      const pn = firstPartNumber(init);
      if (pn === entry.code) return json(CALENDAR);
      if (pn === failedPartNumber) return notFound();

      const body = JSON.parse(String(init?.body ?? '{}')) as { events: Array<{ partNumber: string }> };
      return json({
        eventAvailability: body.events.map(e => ({
          partNumber: e.partNumber,
          calendarDates: [{ date: DATE, inventoryEvents: [{ availableUnits: '3' }] }],
        })),
      });
    }
    if (url.includes('getExpressPassVariantDetails')) return json({ products: variants });
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(
    outcome.status,
    'fulfilled',
    `one bad batch must not fail the product, got ${outcome.status === 'rejected' ? outcome.reason : ''}`,
  );

  const result = outcome.status === 'fulfilled' ? outcome.value : undefined;
  const dateSlot = result?.dates.find(d => d.date === DATE);
  assert.ok(dateSlot?.timeSlots, 'the date must still carry its slot list');
  const slots = dateSlot!.timeSlots!;
  assert.equal(slots.length, VARIANT_COUNT, 'every variant must still produce a slot');

  const failedSlot = slots.find(s => s.variantCode === failedPartNumber);
  assert.equal(failedSlot?.availableUnits, null, "the failed batch's slots must keep availableUnits null");

  const otherSlot = slots.find(s => s.variantCode === otherPartNumber);
  assert.equal(otherSlot?.availableUnits, 3, 'a slot outside the failed batch must still get its count');

  const nullCount = slots.filter(s => s.availableUnits === null).length;
  assert.equal(
    nullCount,
    STOCK_BATCH_SIZE,
    `only the one failed batch's slots should be null, got ${nullCount} null of ${slots.length}`,
  );

  assert.ok(
    errors.some(line => line.includes('stock batch')),
    `the skipped batch must be logged, got: ${JSON.stringify(errors)}`,
  );
});

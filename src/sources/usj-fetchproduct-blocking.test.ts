/**
 * Story 1.4 patch: `fetchProduct` makes its requests through four internal
 * try/catch blocks — the primary-language product-info lookup, the per-language
 * name lookups, the per-date slot lookup, and the per-batch stock lookup — each
 * of which used to swallow every error, `BlockedError` included, as an ordinary
 * non-fatal failure for that one call. A persistent block landing on any of
 * them would therefore never propagate out of `fetchProduct`, the per-product
 * loop in `fetcher.ts` would never see it, and the round would keep walking the
 * catalogue instead of stopping (violating AD-16 #1 / NFR8).
 *
 * All four now special-case `BlockedError` the same way the catalog-sampling
 * and per-product-loop catches do: rethrow instead of logging and continuing.
 * Each of the four is locked here separately, because only the first is reached
 * on a store that blocks from its very first response — and a block that starts
 * partway into a round is the common shape, not the exception, so the three
 * later sites are the ones a regression would actually hide behind.
 *
 * Every test drives the real `usjSource.fetchProduct(...)` against a mocked
 * `fetch`, so the whole chain down through `limitedFetch`'s retry loop runs; the
 * timers are mocked (see `test-support.ts`) so the retries cost no wall-clock
 * time, and `settle` fails loudly rather than hanging if a rethrow goes missing.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError, snippet } from '../limiter';
import { settle } from '../test-support';
import { usjSource } from './usj';
import type { CatalogEntry, DateRange } from '../types';

const entry: CatalogEntry = {
  code: 'TEST0001',
  name: 'Test Pass',
  eyebrow: '',
  imageUrl: '',
  legalDesc: '',
  fromPrice: null,
};

const range: DateRange = { start: '2026-09-01', end: '2027-03-01' };

/**
 * Where in a product's request sequence the store starts blocking. `info` is
 * the first request `fetchProduct` makes; the rest only happen once the ones
 * before them have answered normally.
 */
type BlockSite = 'info' | 'names' | 'slots' | 'stock';

const TIMED_EVENT = {
  eventCode: 'EXP_TEST_182000185000',
  eventName: 'テストアトラクション',
  maingroup: 'TIMED',
  selectionFromTime: '10:00',
  selectionToTime: '11:00',
};

/** One timed attraction is all it takes for the pass to count as slotted. */
const PRODUCT_INFO = { attractions: { events: [TIMED_EVENT] } };

const calendarDate = (date: string) => ({
  date,
  canBeVisited: true,
  forceSoldOut: false,
  inventoryEvents: [{ availableUnits: '5', maxAvailable: '5', totalCapacity: '10' }],
  pricing: [{ amount: 10000, formattedAmount: '¥10,000' }],
});

/**
 * Two available dates a day apart: the later one is the latest released date
 * and the earlier one falls inside the slot window behind it, so both get a
 * slot lookup and both contribute slots to the single stock batch that follows.
 */
const CALENDAR = {
  eventAvailability: [
    { partNumber: entry.code, calendarDates: [calendarDate('2026-09-01'), calendarDate('2026-09-02')] },
  ],
};

const VARIANT_DETAILS = { products: [{ code: 'VAR1', attractions: { events: [TIMED_EVENT] } }] };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** A persistent block: the same 503 to every attempt, retries included. */
const blocked = () => new Response('', { status: 503 });

/**
 * An ordinary failure at the same site: 404 is not retryable, so `limitedFetch`
 * hands it straight back and the caller's own `!res.ok` check turns it into a
 * plain `Error` — the exact shape the four catches must still absorb.
 */
const notFound = () => new Response('', { status: 404 });

/**
 * Answer the store's four endpoints normally, except the one named by
 * `failAt`, which answers `failWith` to everything.
 */
function mockStore(t: TestContext, failAt: BlockSite, failWith: () => Response): void {
  let inventoryCalls = 0;

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);

    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      // The first inventory call is the product's own calendar; every later one
      // is a stock batch for the slots that calendar led to.
      inventoryCalls++;
      return failAt === 'stock' && inventoryCalls > 1 ? failWith() : json(CALENDAR);
    }
    if (url.includes('getExpressPassVariantDetails')) {
      return failAt === 'slots' ? failWith() : json(VARIANT_DETAILS);
    }
    if (url.includes('lang=en')) {
      return failAt === 'names' ? failWith() : json(PRODUCT_INFO);
    }
    return failAt === 'info' ? failWith() : json(PRODUCT_INFO);
  });
}

/**
 * Each test enables the mocked clock at its own starting point, comfortably
 * past where the previous one could have left it: the limiter's `nextSlotAt` is
 * module-level state that outlives a single test's timer mock.
 */
const CLOCK_START: Record<BlockSite, number> = {
  info: 10_000_000,
  names: 20_000_000,
  slots: 30_000_000,
  stock: 40_000_000,
};

/** The ordinary-failure tests below run after the blocking ones, so they start later still. */
const ORDINARY_CLOCK_START: Record<BlockSite, number> = {
  info: 50_000_000,
  names: 60_000_000,
  slots: 70_000_000,
  stock: 80_000_000,
};

const CASES: Array<{ site: BlockSite; what: string }> = [
  { site: 'info', what: 'the primary-language product-info lookup' },
  { site: 'names', what: 'a translated-name lookup, after product info answered' },
  { site: 'slots', what: "a date's slot lookup, after the calendar answered" },
  { site: 'stock', what: 'a stock batch, after the slot lists were in' },
];

for (const { site, what } of CASES) {
  test(`a persistent block on ${what} rejects fetchProduct with BlockedError instead of degrading it`, async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: CLOCK_START[site] });
    mockStore(t, site, blocked);
    t.mock.method(console, 'error', () => undefined);

    const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

    assert.equal(
      outcome.status,
      'rejected',
      'a blocked call must not resolve into a degraded ProductResult the round would keep walking past',
    );
    assert.ok(
      outcome.reason instanceof BlockedError,
      `expected a BlockedError, got ${outcome.reason}`,
    );
  });
}

/**
 * The other half of each of those four guards, and the one a regression would
 * actually break: `if (err instanceof BlockedError) throw err;` sits in front of
 * a log-and-degrade path that ordinary failures must still reach. Widening any
 * of the four into an unconditional rethrow would pass every test above while
 * turning one product's 404 into a stopped round — the outcome AD-16's
 * "單一產品失敗仍不紅" exists to prevent.
 */
for (const { site, what } of CASES) {
  test(`an ordinary failure on ${what} still degrades that one call and resolves fetchProduct`, async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: ORDINARY_CLOCK_START[site] });
    mockStore(t, site, notFound);
    t.mock.method(console, 'error', () => undefined);
    // Unlike the blocking cases, these reach the end-of-product summary line.
    t.mock.method(console, 'log', () => undefined);

    const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

    assert.equal(
      outcome.status,
      'fulfilled',
      `a non-block failure must not abort the round, got ${outcome.status === 'rejected' ? outcome.reason : ''}`,
    );
    assert.equal(
      outcome.status === 'fulfilled' ? outcome.value.code : undefined,
      entry.code,
      'the degraded result must still be this product',
    );
  });
}

/**
 * DW-36 patch: the four `!res.ok` throw sites in usj.ts each build their
 * message as `` `...${snip ? `: ${snip}` : ''}` `` around `snippet()`'s
 * output. Nothing above inspects a thrown Error's message, so an inverted or
 * dropped ternary at any of the four sites would pass every test above while
 * silently discarding the diagnostic body — or, for Calendar, no longer
 * bounding it at all, which is the exact regression the ledger flagged.
 *
 * The product's own calendar lookup (the "Calendar API" call, straight after
 * the product-info and name lookups both answer normally) is not wrapped in a
 * try/catch, so its rejection reaches `fetchProduct`'s caller unchanged — the
 * cleanest of the four sites to assert a message against directly, with no
 * console.error interception needed.
 */
test(
  "a non-ok, non-retryable Calendar API response's body reaches fetchProduct's rejection " +
    'as a normalized, capped snippet',
  async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 90_000_000 });
    t.mock.method(console, 'error', () => undefined);

    // Multi-line, tab-indented, carrying an ANSI escape sequence, and well past
    // the cap once collapsed — the same shape limiter.test.ts uses to exercise
    // snippet()'s normalization, aimed here at proving usj.ts's throw site
    // actually calls it rather than reimplementing (or skipping) the cap.
    const rawBody = '  Service\tUnavailable\n<html>\x1b[31mERROR\x1b[0m ' + 'x'.repeat(250) + '  ';

    t.mock.method(globalThis, 'fetch', async (input: unknown) => {
      const url = String(input);
      // 404 is not retryable, so limitedFetch hands it straight back instead
      // of exhausting retries into a BlockedError — the plain-Error path all
      // four throw sites share.
      if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
        return new Response(rawBody, { status: 404 });
      }
      return json(PRODUCT_INFO);
    });

    const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

    assert.equal(outcome.status, 'rejected', 'a non-ok calendar response must reject fetchProduct');
    const reason = outcome.status === 'rejected' ? outcome.reason : undefined;
    assert.ok(reason instanceof Error, `expected an Error, got ${reason}`);

    const expectedSnippet = snippet(rawBody);
    assert.ok(expectedSnippet, 'this raw body must normalize to a non-empty snippet');
    assert.equal(
      (reason as Error).message,
      `Calendar API returned 404: ${expectedSnippet}`,
      'the message must carry the same normalized, capped snippet that snippet() itself would produce',
    );
    assert.ok(
      !(reason as Error).message.includes('\x1b'),
      'the ANSI escape in the raw body must not survive into the message',
    );
  },
);

/**
 * The other half of the same ternary: an empty body must not leave a dangling
 * `: ` on the message, matching the convention `BlockedError`'s constructor
 * already follows.
 */
test("an empty Calendar API body leaves fetchProduct's rejection message without a dangling colon", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 95_000_000 });
  t.mock.method(console, 'error', () => undefined);

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      return new Response('', { status: 404 });
    }
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'rejected', 'a non-ok calendar response must reject fetchProduct');
  const reason = outcome.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(reason instanceof Error, `expected an Error, got ${reason}`);
  assert.equal(
    (reason as Error).message,
    'Calendar API returned 404',
    'an empty body must leave no dangling ": " suffix on the message',
  );
});

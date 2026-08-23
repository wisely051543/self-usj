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
 *
 * This file also carries one DW-30 test, unrelated to the blocking/degradation
 * concern above: it reuses the same mocked-`fetch` harness to observe the real
 * `init.headers` a normal (non-blocked) `fetchProduct` run actually sends,
 * rather than exercising the try/catch rethrow sites.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError, snippet } from '../limiter';
import { settle } from '../test-support';
import { HEADERS, usjSource } from './usj';
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
      `Calendar API returned 404 for ${entry.code} (${range.start}..${range.end}): ${expectedSnippet}`,
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
    `Calendar API returned 404 for ${entry.code} (${range.start}..${range.end})`,
    'an empty body must leave no dangling ": " suffix on the message',
  );
});

/**
 * DW-50: a body that fails to *read* (a dropped connection mid-response, the
 * same shape `limiter.test.ts` exercises against `BlockedError`'s own read)
 * must not let the raw stream rejection replace the status message. Without
 * `res.text().catch(() => undefined)` at the Calendar throw site, this test's
 * `fetchProduct` call would reject with the mocked 'stream reset' Error
 * instead of the well-formed "Calendar API returned ..." message.
 */
test("a Calendar API response whose body fails to read still rejects with the plain status message", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 96_000_000 });
  t.mock.method(console, 'error', () => undefined);

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      return {
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error('stream reset')),
      } as unknown as Response;
    }
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'rejected', 'a non-ok calendar response must still reject fetchProduct');
  const reason = outcome.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(reason instanceof Error, `expected an Error, got ${reason}`);
  assert.equal(
    (reason as Error).message,
    `Calendar API returned 404 for ${entry.code} (${range.start}..${range.end})`,
    'a body read failure must fall back to the bodyless message shape, not the raw stream rejection',
  );
});

/**
 * DW-51, the other three sites: `fetchProductInfo` and `fetchTimeSlots` never
 * reject `fetchProduct` on an ordinary failure -- they are caught and logged,
 * so the identifying context has to be checked in the logged line rather than
 * a rejection message the way the Calendar tests above do it.
 */
test("an ordinary product-info failure's logged message names the product and language", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 97_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  mockStore(t, 'info', notFound);

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'an ordinary product-info failure must degrade, not reject');
  assert.ok(
    errors.some(line => line.includes(`Product API returned 404 for ${entry.code} (ja)`)),
    `expected the logged failure to carry the product code and language, got: ${JSON.stringify(errors)}`,
  );
});

test("an ordinary translated-name failure's logged message names the product and language", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 98_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  mockStore(t, 'names', notFound);

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'an ordinary translated-name failure must degrade, not reject');
  assert.ok(
    errors.some(line => line.includes(`Product API returned 404 for ${entry.code} (en)`)),
    `expected the logged failure to carry the product code and language, got: ${JSON.stringify(errors)}`,
  );
});

test("an ordinary slot-lookup failure's logged message names the product and date", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 99_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  mockStore(t, 'slots', notFound);

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'an ordinary slot-lookup failure must degrade, not reject');
  assert.ok(
    errors.some(line => new RegExp(`Variant API returned 404 for ${entry.code} on \\d{4}-\\d{2}-\\d{2}`).test(line)),
    `expected the logged failure to carry the product code and date, got: ${JSON.stringify(errors)}`,
  );
});

/**
 * DW-50 at a second site, to confirm the `.catch(() => undefined)` guard is
 * the same protection at every throw site rather than something special-cased
 * for Calendar alone.
 */
test("a slot-lookup response whose body fails to read still logs the plain status message", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 101_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('getExpressPassVariantDetails')) {
      return {
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error('stream reset')),
      } as unknown as Response;
    }
    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) return json(CALENDAR);
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'an ordinary slot-lookup failure must degrade, not reject');
  assert.ok(
    errors.some(line => new RegExp(`Variant API returned 404 for ${entry.code} on \\d{4}-\\d{2}-\\d{2}`).test(line)),
    `expected a body read failure to fall back to the bodyless message shape, got: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    !errors.some(line => line.includes('stream reset')),
    'the raw stream rejection must never leak into the logged message',
  );
});

/**
 * DW-50 at the remaining two sites (Product and Search APIs), so the guard is
 * confirmed at all four throw sites rather than just the two above.
 */
test("a product-info response whose body fails to read still logs the plain status message", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 102_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  mockStore(
    t,
    'info',
    () =>
      ({
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error('stream reset')),
      }) as unknown as Response,
  );

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'an ordinary product-info failure must degrade, not reject');
  assert.ok(
    errors.some(line => line.includes(`Product API returned 404 for ${entry.code} (ja)`)),
    `expected a body read failure to fall back to the bodyless message shape, got: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    !errors.some(line => line.includes('stream reset')),
    'the raw stream rejection must never leak into the logged message',
  );
});

/**
 * DW-51: `fetchInventory`'s new part-count formatting has three branches
 * (no parts, up to three named directly, more than three collapsed to a
 * count) but every other test in this file drives it with a single query, so
 * only the one-part branch has ever been exercised. This drives a stock
 * batch with more than three variant codes -- the shape `fetchSlotStock`
 * sends in production -- straight through `usjSource.fetchProduct` and reads
 * the count-fallback branch off the logged batch failure.
 */
test('a stock batch failure with more than three variant codes logs a part count, not a joined list', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 103_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  const FOUR_SLOT_EVENTS = [0, 1, 2, 3].map(i => ({ ...TIMED_EVENT, eventCode: `EXP_TEST_${i}` }));
  const FOUR_VARIANT_DETAILS = {
    products: FOUR_SLOT_EVENTS.map((event, i) => ({ code: `VAR${i}`, attractions: { events: [event] } })),
  };
  let inventoryCalls = 0;

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      inventoryCalls++;
      // The product's own calendar lookup answers normally; the stock batch
      // that follows (the only later inventory call) is the one that fails.
      if (inventoryCalls > 1) {
        return {
          ok: false,
          status: 404,
          text: () => Promise.resolve(''),
        } as unknown as Response;
      }
      return json(CALENDAR);
    }
    if (url.includes('getExpressPassVariantDetails')) return json(FOUR_VARIANT_DETAILS);
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'a stock batch failure must degrade, not reject');
  assert.ok(
    errors.some(line => line.includes('Calendar API returned 404 for 4 parts (2026-09-01..2026-09-02)')),
    `expected the batch failure to name a 4-part count with the dates in ascending order (not the query-arrival ` +
      `order, which puts the latest date first), got: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    !errors.some(line => line.includes('VAR0') || line.includes('VAR1')),
    `a batch over the naming threshold must not list individual variant codes, got: ${JSON.stringify(errors)}`,
  );
});

/**
 * DW-51: the other branch of `fetchInventory`'s part-count formatting -- two
 * or three unique part numbers named directly rather than collapsed to a
 * count -- is not exercised by any existing test (the single-query tests
 * above only ever produce one part, and the batch test above produces four).
 * This drives a two-variant-code stock batch through the same path to lock
 * down the comma-joined-list shape of that branch.
 */
test('a stock batch failure with two variant codes names both, not a count', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 104_000_000 });
  t.mock.method(console, 'log', () => undefined);
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  const TWO_SLOT_EVENTS = [0, 1].map(i => ({ ...TIMED_EVENT, eventCode: `EXP_TEST_${i}` }));
  const TWO_VARIANT_DETAILS = {
    products: TWO_SLOT_EVENTS.map((event, i) => ({ code: `VAR${i}`, attractions: { events: [event] } })),
  };
  let inventoryCalls = 0;

  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) {
      inventoryCalls++;
      // The product's own calendar lookup answers normally; the stock batch
      // that follows (the only later inventory call) is the one that fails.
      if (inventoryCalls > 1) {
        return {
          ok: false,
          status: 404,
          text: () => Promise.resolve(''),
        } as unknown as Response;
      }
      return json(CALENDAR);
    }
    if (url.includes('getExpressPassVariantDetails')) return json(TWO_VARIANT_DETAILS);
    return json(PRODUCT_INFO);
  });

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(outcome.status, 'fulfilled', 'a stock batch failure must degrade, not reject');
  assert.ok(
    errors.some(line => line.includes('Calendar API returned 404 for VAR0, VAR1 (2026-09-01..2026-09-02)')),
    `expected the batch failure to name both variant codes directly rather than a count, got: ${JSON.stringify(errors)}`,
  );
});

/**
 * DW-30: `usj.test.ts`'s wiring check reads `usj.ts`'s source text and asserts
 * each `limitedFetch` call site *mentions* `headers: HEADERS` verbatim, but
 * that is a claim about the code, not about what a real request carries. This
 * test drives the real `fetchProduct` against a mocked global `fetch` and
 * inspects what actually lands in `init.headers` on every call — the one place
 * that can tell "the same frozen HEADERS object reached fetch()" apart from "a
 * same-shaped copy did", since only reference equality (not deepEqual) can make
 * that distinction.
 */
test('fetchProduct sends the real, same-reference HEADERS object to every request it makes', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000_000 });
  const capturedHeaders: Array<{ url: string; headers: unknown }> = [];

  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    capturedHeaders.push({ url, headers: init?.headers });

    if (url.includes('fetchCalendarDatesWithPriceAndInventory')) return json(CALENDAR);
    if (url.includes('getExpressPassVariantDetails')) return json(VARIANT_DETAILS);
    return json(PRODUCT_INFO);
  });
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);

  const outcome = await settle(t, usjSource.fetchProduct(entry, range, null));

  assert.equal(
    outcome.status,
    'fulfilled',
    `fetchProduct must resolve on an all-success mock, got ${
      outcome.status === 'rejected' ? outcome.reason : ''
    }`,
  );
  assert.ok(capturedHeaders.length > 0, 'no fetch call was captured; the mock never ran');

  for (const { url, headers } of capturedHeaders) {
    assert.equal(
      headers,
      HEADERS,
      `a captured init.headers for ${url} was not the same HEADERS reference imported from ` +
        "'./usj' — that call site is spreading, overriding, or omitting it rather than passing " +
        'the shared constant through verbatim',
    );
  }
});

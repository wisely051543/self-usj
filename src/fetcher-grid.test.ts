/**
 * Story 1.5: the snapshot is a full (date × pass) grid and every cell carries an
 * explicit status.
 *
 * What these tests hold down is the thing absence used to hide. Before, a cell
 * was either present and buyable or missing, and "missing" meant sold out, not
 * open yet, no evidence, or a file that would not read — four different answers
 * collapsed into one, with "sold out" the pessimistic guess a reader was most
 * likely to make. So each row of the I/O matrix gets its own assertion, and the
 * grid-completeness invariants (a row per date, a cell per pass, a total order)
 * are asserted separately from them: a status rule can be right while the grid
 * around it has quietly gone back to dropping things.
 *
 * `buildDays` is a synchronous pure-ish function over the product files, so
 * these drive it directly rather than through `main()` — the only thing to fake
 * is the files it reads. `fs` is mocked via a plain `require('node:fs')` for the
 * reason `fetcher.test.ts` documents: a TypeScript namespace import compiles to
 * a getter-only property `t.mock.method` cannot replace, while both modules'
 * getters read through to this same module object at call time.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { buildDays, writeDays } from './fetcher';
import { DAYS_SCHEMA_VERSION } from './schema';
import type { DateRange, DateSlot, DayProduct, Days, ProductResult, ProductSummary } from './types';

/** Typed so the mocks below are checked against the real signatures. */
const fs = require('node:fs') as typeof import('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_DIR = path.join(DATA_DIR, 'products');
const DAYS_PATH = path.join(DATA_DIR, 'days.json');

/** Short enough to assert cell-by-cell, long enough to have a before/after `latestDate`. */
const RANGE: DateRange = { start: '2026-09-01', end: '2026-09-05' };

/**
 * The dates of `RANGE`, written out rather than computed — same reason as
 * `WEEKDAYS` below.
 *
 * `everyNthDay` is now the sole author of the snapshot's value domain, so
 * asserting the grid's keys against `everyNthDay` would only prove the grid
 * calls it: a version that repeated or skipped an interior date would sit on
 * both sides of the comparison and the "one row per date, no gaps" invariant
 * this story is built on would go unchecked.
 */
const DATES = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

/**
 * The real weekdays of `RANGE`, written out rather than computed.
 *
 * Comparing the grid's labels to `dayOfWeek()` would only prove the grid calls
 * it, not that the labels are right — the same off-by-one would sit on both
 * sides of the assertion. `src/dates.test.ts` pins the function itself; this
 * pins the grid to the actual calendar.
 */
const WEEKDAYS: Record<string, number> = {
  '2026-09-01': 2,  // Tuesday
  '2026-09-02': 3,  // Wednesday
  '2026-09-03': 4,  // Thursday
  '2026-09-04': 5,  // Friday
  '2026-09-05': 6,  // Saturday
};

function row(date: string, over: Partial<DateSlot> = {}): DateSlot {
  return {
    date,
    dayOfWeek: WEEKDAYS[date],
    available: true,
    availableUnits: 10,
    maxAvailable: 8,
    totalCapacity: 100,
    pricePerPerson: 8000,
    formattedPrice: '¥8,000',
    timeSlots: null,
    slotsFetchedAt: null,
    ...over,
  };
}

function product(code: string, over: Partial<ProductResult> = {}): ProductResult {
  return {
    code,
    name: code,
    eyebrow: '',
    imageUrl: '',
    legalDesc: '',
    url: '',
    currency: 'JPY',
    people: 1,
    deep: true,
    fetchedAt: new Date(0).toISOString(),
    calendarStart: RANGE.start,
    calendarEnd: RANGE.end,
    latestDate: RANGE.end,
    dates: [],
    attractionNames: {},
    nonTimedAttractions: [],
    ...over,
  };
}

const summary = (code: string): ProductSummary => ({
  code,
  name: code,
  eyebrow: '',
  imageUrl: '',
  url: '',
  fromPrice: null,
  currency: 'JPY',
  deep: true,
  latestDate: '',
  availableDateCount: 0,
  slotDateCount: 0,
  fetchedAt: new Date(0).toISOString(),
  lastSeenAt: new Date(0).toISOString(),
});

/**
 * Stand in for `data/products/`. A `null` entry is a file that will not read —
 * the case that used to make a pass disappear from the calendar entirely.
 * Reads outside the data directory (the runner's own source lookups) go
 * through to the real fs.
 */
function mockProductFiles(t: TestContext, files: Record<string, ProductResult | null>): void {
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    if (typeof file === 'string' && file.startsWith(PRODUCTS_DIR)) {
      const result = files[path.basename(file, '.json')];
      if (!result) throw new Error('ENOENT (mocked — unreadable product file)');
      return JSON.stringify(result);
    }
    return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync);
}

/** Build the grid over `RANGE` from a synthetic products directory. */
function grid(t: TestContext, files: Record<string, ProductResult | null>): Days {
  mockProductFiles(t, files);
  return buildDays(Object.keys(files).sort().map(summary), RANGE);
}

function cell(days: Days, date: string, code: string): DayProduct {
  const found = days.days[date]?.products.find(p => p.code === code);
  assert.ok(found, `expected a cell for ${code} on ${date}`);
  return found;
}

const statusesOf = (days: Days, code: string): string[] =>
  DATES.map(date => cell(days, date, code).status);

test('the grid has a row for every date in the range and a cell for every pass in the index', (t: TestContext) => {
  const days = grid(t, {
    P_ONE: product('P_ONE', { dates: [row('2026-09-02')] }),
    P_TWO: product('P_TWO', { dates: [] }),
  });

  assert.deepEqual(
    Object.keys(days.days),
    DATES,
    'the value domain is this round\'s range: one row per date, in date order, no gaps',
  );
  for (const date of DATES) {
    assert.equal(
      days.days[date].products.length,
      2,
      `${date} must carry a cell for every pass in the index, not only the ones on sale`,
    );
  }
  assert.deepEqual(
    DATES.map(date => days.days[date].dayOfWeek),
    [2, 3, 4, 5, 6],
    '2026-09-01 through 05 are Tue–Sat: every row is labelled from its own date, including the rows no product returned',
  );
  assert.equal(
    days.schemaVersion,
    DAYS_SCHEMA_VERSION,
    'the grid the writer produces is stamped with the version the readers guard on',
  );
});

test('a row the store returned as available becomes an available cell carrying price, units and slots', (t: TestContext) => {
  const days = grid(t, {
    P_ONE: product('P_ONE', {
      dates: [row('2026-09-02', { pricePerPerson: 7200, availableUnits: 4, timeSlots: [] })],
    }),
  });

  assert.deepEqual(cell(days, '2026-09-02', 'P_ONE'), {
    code: 'P_ONE',
    status: 'available',
    price: 7200,
    units: 4,
    slots: 0,
  });
});

test('a row the store returned as unavailable is kept as a sold-out cell rather than dropped', (t: TestContext) => {
  const days = grid(t, {
    P_ONE: product('P_ONE', { dates: [row('2026-09-02', { available: false })] }),
  });

  assert.deepEqual(
    cell(days, '2026-09-02', 'P_ONE'),
    { code: 'P_ONE', status: 'sold-out' },
    'the store saying "not available" is direct evidence and must survive into the snapshot',
  );
});

test('a missing row on or before latestDate is sold out, and after it is not yet released', (t: TestContext) => {
  const days = grid(t, {
    // The store lists only what it still has; latestDate is the on-sale edge.
    P_ONE: product('P_ONE', { latestDate: '2026-09-03', dates: [row('2026-09-03')] }),
  });

  assert.deepEqual(statusesOf(days, 'P_ONE'), [
    'sold-out',          // 2026-09-01 — inside the window, no row left
    'sold-out',          // 2026-09-02
    'available',         // 2026-09-03 — the row itself
    'not-yet-released',  // 2026-09-04 — past the on-sale edge
    'not-yet-released',  // 2026-09-05
  ]);
});

test('an empty latestDate makes every cell of that pass unknown, never sold out', (t: TestContext) => {
  const days = grid(t, {
    // Measured on real data: 10 of 31 products carry an empty latestDate.
    P_BLANK: product('P_BLANK', { latestDate: '', dates: [row('2026-09-02')] }),
  });

  assert.deepEqual(
    statusesOf(days, 'P_BLANK'),
    DATES.map(() => 'unknown'),
    'with no on-sale edge the pass has no evidence at all, including on the dates it returned rows for',
  );
  const anyGuess = DATES.flatMap(d => days.days[d].products)
    .filter(p => p.status === 'sold-out' || p.status === 'not-yet-released');
  assert.deepEqual(anyGuess, [], 'missing evidence must never be resolved into a sold-out or not-yet-released guess');
});

test('a field that is absent rather than empty still lands on unknown', (t: TestContext) => {
  // These files are JSON some past version of the fetcher wrote, so "not stated"
  // arrives in more than one spelling. A gate that tested `=== ''` would let
  // every shape below through and decide the cells from a file that never
  // declared the window they are being judged against — and `date < undefined`
  // is false, so the range gate would wave them past in silence.
  const missingLatest = { ...product('P_NO_LATEST'), dates: [row('2026-09-02')] } as ProductResult;
  delete (missingLatest as Partial<ProductResult>).latestDate;

  const missingWindow = { ...product('P_NO_WINDOW'), dates: [row('2026-09-02')] } as ProductResult;
  delete (missingWindow as Partial<ProductResult>).calendarStart;
  delete (missingWindow as Partial<ProductResult>).calendarEnd;

  const days = grid(t, {
    P_NULL_LATEST: product('P_NULL_LATEST', {
      latestDate: null as unknown as string,
      dates: [row('2026-09-02')],
    }),
    P_NO_LATEST: missingLatest,
    P_NO_WINDOW: missingWindow,
    P_NO_START: product('P_NO_START', {
      calendarStart: '' as unknown as string,
      dates: [row('2026-09-02')],
    }),
    P_NO_END: product('P_NO_END', {
      calendarEnd: null as unknown as string,
      dates: [row('2026-09-02')],
    }),
  });

  for (const code of ['P_NULL_LATEST', 'P_NO_LATEST', 'P_NO_WINDOW', 'P_NO_START', 'P_NO_END']) {
    assert.deepEqual(
      statusesOf(days, code),
      DATES.map(() => 'unknown'),
      `${code} states no window or no on-sale edge, so none of its cells can be decided`,
    );
  }
});

test('a product file that will not read leaves the pass in the grid with every cell unknown', (t: TestContext) => {
  const days = grid(t, {
    P_GONE: null,
    P_OK: product('P_OK', { dates: [row('2026-09-02')] }),
  });

  assert.deepEqual(
    statusesOf(days, 'P_GONE'),
    DATES.map(() => 'unknown'),
    'an unreadable file is a gap in the evidence, not the absence of a pass (it used to vanish outright)',
  );
  assert.equal(
    cell(days, '2026-09-02', 'P_OK').status,
    'available',
    'and it must not stop the round: the other passes are still decided',
  );
});

test('dates after a product\'s own calendarEnd are unknown, not inferred from its latestDate', (t: TestContext) => {
  const days = grid(t, {
    // A stale carry-over: its file only covers the first two days of the range.
    P_STALE: product('P_STALE', {
      calendarStart: '2026-09-01',
      calendarEnd: '2026-09-02',
      latestDate: '2026-09-02',
      dates: [row('2026-09-01'), row('2026-09-02', { available: false })],
    }),
  });

  assert.deepEqual(statusesOf(days, 'P_STALE'), [
    'available',
    'sold-out',
    'unknown',  // past this product's own calendarEnd — its latestDate says nothing here
    'unknown',
    'unknown',
  ]);
});

test('dates before a product\'s own calendarStart are unknown, not read as sold out', (t: TestContext) => {
  const days = grid(t, {
    // A pass added mid-round, or one whose file was fetched over a later window:
    // it has no evidence about the range's opening days. `latestDate` sits after
    // them, so without the lower half of the range gate they would read sold out
    // — the guess this story exists to stop.
    P_LATE: product('P_LATE', {
      calendarStart: '2026-09-03',
      calendarEnd: '2026-09-05',
      latestDate: '2026-09-04',
      dates: [row('2026-09-04')],
    }),
  });

  assert.deepEqual(statusesOf(days, 'P_LATE'), [
    'unknown',           // 2026-09-01 — before this product's calendarStart
    'unknown',           // 2026-09-02
    'sold-out',          // 2026-09-03 — inside the window, no row, on or before latestDate
    'available',         // 2026-09-04
    'not-yet-released',  // 2026-09-05 — inside the window, past latestDate
  ]);
});

test('a date with nothing on sale still gets its row, carrying every pass', (t: TestContext) => {
  const days = grid(t, {
    P_ONE: product('P_ONE', { dates: [row('2026-09-02', { available: false })] }),
    P_TWO: product('P_TWO', { latestDate: '', dates: [] }),
  });

  const entry = days.days['2026-09-02'];
  assert.ok(entry, 'a day nothing is buyable on is still a day the user can ask about');
  assert.equal(entry.dayOfWeek, 3, '2026-09-02 is a Wednesday whether or not anything is on sale');
  assert.deepEqual(
    entry.products.map(p => [p.code, p.status]),
    [['P_ONE', 'sold-out'], ['P_TWO', 'unknown']],
    'and it carries the reason for each pass rather than an empty list',
  );
  assert.equal(
    entry.products.filter(p => p.status === 'available').length,
    0,
  );
});

test('cells are ordered on-sale-first by price, then everything else by code', (t: TestContext) => {
  const days = grid(t, {
    P_HIGH: product('P_HIGH', { dates: [row('2026-09-02', { pricePerPerson: 9000 })] }),
    P_LOW: product('P_LOW', { dates: [row('2026-09-02', { pricePerPerson: 3000 })] }),
    P_LOWB: product('P_LOWB', { dates: [row('2026-09-02', { pricePerPerson: 3000 })] }),
    P_ZED: product('P_ZED', { dates: [row('2026-09-02', { available: false })] }),
    P_ABC: product('P_ABC', { latestDate: '', dates: [] }),
  });

  assert.deepEqual(
    days.days['2026-09-02'].products.map(p => p.code),
    ['P_LOW', 'P_LOWB', 'P_HIGH', 'P_ABC', 'P_ZED'],
    'the UI\'s "cheapest first" contract must not be broken by off-sale cells jumping the queue, ' +
      'and equal prices fall back to code so the order is total',
  );
});

test('the same product files build the identical grid twice, so an unchanged round writes nothing', (t: TestContext) => {
  const files = {
    P_ONE: product('P_ONE', { dates: [row('2026-09-02'), row('2026-09-03', { available: false })] }),
    P_TWO: product('P_TWO', { latestDate: '', dates: [] }),
    P_GONE: null,
  };

  // The rule that keeps this file out of a commit a day rides on the grid being
  // fully determined by its inputs, so both halves are asserted together: build
  // twice, then let the first write's own output stand in as the file on disk
  // and watch the second decline — and decline by not writing, not merely by
  // returning false.
  let onDisk: string | null = null;
  let writes = 0;
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    if (file === DAYS_PATH) {
      if (onDisk === null) throw new Error('ENOENT (mocked — no snapshot yet)');
      return onDisk;
    }
    if (typeof file === 'string' && file.startsWith(PRODUCTS_DIR)) {
      const result = files[path.basename(file, '.json') as keyof typeof files];
      if (!result) throw new Error('ENOENT (mocked — unreadable product file)');
      return JSON.stringify(result);
    }
    return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync);
  t.mock.method(fs, 'writeFileSync', ((file: unknown, data: unknown) => {
    if (file !== DAYS_PATH) return;
    writes++;
    onDisk = String(data);
  }) as typeof fs.writeFileSync);

  const summaries = Object.keys(files).sort().map(summary);
  const first = buildDays(summaries, RANGE);
  const second = buildDays(summaries, RANGE);
  assert.deepEqual(second, first, 'the grid must be fully determined by its inputs — no set or map iteration leaking in');

  assert.equal(writeDays(first), true, 'the first round has no file to compare against and must write');
  assert.equal(writes, 1, 'and that first round must actually put the file on disk');

  assert.equal(writeDays(second), false, 'an unchanged grid must not be rewritten, so it stays out of git');
  assert.equal(
    writes,
    1,
    'the return value is not the point — an unchanged round must reach writeFileSync zero times, ' +
      'or git sees a touched file however honest the boolean was',
  );

  const written = onDisk as unknown as string;

  // `serializeDays` is hand-rolled string concatenation, and the union gave it a
  // second cell shape to emit. Parsing it back is the only thing that says the
  // commas, braces and quoting still land where JSON needs them.
  assert.deepEqual(
    JSON.parse(written),
    first,
    'the hand-rolled serializer must still emit valid JSON that round-trips to the grid it was given',
  );

  const cells = DATES.length * summaries.length;
  assert.equal(
    written.split('\n').filter(l => l.trimStart().startsWith('{"code"')).length,
    cells,
    'every cell is serialized on its own line — that is what keeps a changed count to a one-line diff',
  );
});

/**
 * Story 1.4, I/O matrix rows 5 and 6: a persistent block on one product must
 * stop the round outright, while an ordinary failure on one product must still
 * be recorded and walked past.
 *
 * `main()` is exported specifically so this test can `await` it directly (its
 * real invocation at the bottom of `fetcher.ts` is fire-and-forget and guarded
 * by `require.main === module`, so importing this module for testing does not
 * also auto-run it). The path under test ends in a real `process.exit(1)`,
 * which would kill the test runner if left unmocked, so it is mocked to throw
 * instead — safe here because we `await main()` directly rather than relying on
 * its fire-and-forget production call.
 *
 * `fs` is mocked via a plain `require('node:fs')` rather than the compiled
 * `import * as fs from 'fs'` binding: TypeScript emits a namespace import as a
 * getter-only, non-configurable property, which `t.mock.method` cannot replace.
 * `fetcher.ts`'s own namespace-import getters read through to this same
 * underlying module object at call time, so mocking it here still reaches every
 * `fs.*` call `fetcher.ts` makes.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { BlockedError } from './limiter';
import * as limiter from './limiter';
import { usjSource } from './sources/usj';
import { handleFatalMainError, main } from './fetcher';
import { everyNthDay, shiftMonths, todayJST } from './dates';
import type { CatalogEntry, ProductResult } from './types';

/** Typed so the mocks below are checked against the real signatures. */
const fs = require('node:fs') as typeof import('node:fs');

/** The directory `fetcher.ts` derives its own paths from — nothing under it is real here. */
const DATA_DIR = path.join(__dirname, '..', 'data');

class ExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const catalogEntry: CatalogEntry = {
  code: 'TEST0001',
  name: 'Test Pass',
  eyebrow: '',
  imageUrl: '',
  legalDesc: '',
  fromPrice: null,
};

const productResult = (code: string): ProductResult => ({
  code, name: 'Test Pass', eyebrow: '', imageUrl: '', legalDesc: '',
  url: '', currency: 'JPY', people: 1, deep: true,
  fetchedAt: new Date(0).toISOString(), calendarStart: '2026-09-01', calendarEnd: '2026-09-01',
  latestDate: '2026-09-01', dates: [], attractionNames: {}, nonTimedAttractions: [],
});

interface FsMocks {
  /** Every path `writeFileSync` was called with, in order. */
  written: string[];
}

/**
 * Mock the fs calls a round makes so nothing touches the real data/ directory.
 * Reads under it fail as if the directory were empty (a cold first run); reads
 * anywhere else — the runner's own source lookups, say — still go through.
 */
function mockFs(t: TestContext): FsMocks {
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    if (typeof file === 'string' && file.startsWith(DATA_DIR)) {
      throw new Error('ENOENT (mocked — no prior snapshot for this test run)');
    }
    return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync);

  t.mock.method(fs, 'mkdirSync', () => undefined);
  t.mock.method(fs, 'rmSync', () => undefined);

  const written: string[] = [];
  t.mock.method(fs, 'writeFileSync', ((file: unknown) => {
    written.push(String(file));
  }) as typeof fs.writeFileSync);

  return { written };
}

const snapshotWrites = (written: string[]) =>
  written.filter(p => p.endsWith('index.json') || p.endsWith('days.json'));

const productWrites = (written: string[]) => written.filter(p => p.includes('products'));

/**
 * Silence `console.error` for the test run and hand back everything it was
 * asked to print. The non-zero exit is only half of AD-16 #1's alert — the
 * other half is the line that says which product was blocked and why, which is
 * all an operator reading a red run has to work from.
 */
function captureErrors(t: TestContext): string[] {
  const lines: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return lines;
}

/**
 * The body a blocking store serves instead of the catalogue. Multi-line on
 * purpose: what reaches the log has to be the single-line snippet, not this.
 */
const BLOCK_PAGE = 'Access Denied\n  Request blocked by WAF\n';

/** The shape `logAbortSummary` prints, asserted rather than keyword-matched. */
const ABORT_SUMMARY = /^\[fetch\] aborted after \d+ requests in \d+\.\d+s$/;

/**
 * The summary has to be printed on the way to `process.exit`, and after the
 * alert that says why the round is ending — the two lines are read together,
 * and "how far did it get" only means something once you know it was a block.
 */
function assertAbortSummaryFollows(errors: string[], alertIndex: number): void {
  const summaryIndex = errors.findIndex(line => ABORT_SUMMARY.test(line));
  assert.notEqual(
    summaryIndex,
    -1,
    `the abort must say how far the round got, in the shape ${ABORT_SUMMARY}, got: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    summaryIndex > alertIndex,
    `the summary must follow the alert it explains, got: ${JSON.stringify(errors)}`,
  );
}

test('a BlockedError from fetchProduct stops the round with a non-zero exit, leaving the snapshot files untouched', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  t.mock.method(usjSource, 'fetchProduct', async () => {
    // A body, because the status alone is what DW-8 found insufficient: this is
    // the round trip from a WAF page to the one line an operator actually reads.
    throw new BlockedError('https://example.test/product', 503, BLOCK_PAGE);
  });

  const { written } = mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a persistent block must exit non-zero (AD-16 #1)');
    return true;
  });

  assert.deepEqual(
    snapshotWrites(written),
    [],
    'index.json/days.json must not be rewritten when the round is aborted by a block (NFR11)',
  );

  const alertIndex = errors.findIndex(line => line.includes('blocked'));
  assert.notEqual(alertIndex, -1, `the abort must say it was a block, got: ${JSON.stringify(errors)}`);
  const alert = errors[alertIndex];
  assert.ok(
    alert.includes(catalogEntry.code) && alert.includes('503'),
    `the block alert must name the product and the status, got: ${alert}`,
  );
  assert.ok(
    alert.includes('Access Denied Request blocked by WAF'),
    `the block alert must carry the body snippet, collapsed to one line, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(!alert.includes('\n'), `the alert must stay a single log line, got: ${JSON.stringify(alert)}`);

  // Read after `assert.rejects` resolved — i.e. after `process.exit` was
  // reached — so seeing the line at all proves it was printed ahead of the
  // exit rather than stranded behind it with the closing summary.
  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * The block that lands *before* the per-product loop, on catalog sampling.
 * `listProducts` rethrows it (see `sources/usj-blocking.test.ts`), but that only
 * gets it as far as `main()`; what the I/O matrix actually asks for is the round
 * ending non-zero, which happens in `main()`'s own pre-existing catalog catch —
 * a different code path from the per-product one above, and the one a store that
 * is already blocking when the round starts hits first.
 */
test('a BlockedError from catalog sampling ends the round non-zero before any product is fetched', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => {
    throw new BlockedError('https://example.test/catalog', 429);
  });
  const fetchProduct = t.mock.method(usjSource, 'fetchProduct', async () => productResult(catalogEntry.code));

  const { written } = mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a block during catalog sampling must exit non-zero (AD-16 #1)');
    return true;
  });

  assert.equal(fetchProduct.mock.callCount(), 0, 'the round must stop before fetching any product');
  assert.deepEqual(
    snapshotWrites(written),
    [],
    'index.json/days.json must be left at the last successful round (NFR11)',
  );
  const alertIndex = errors.findIndex(line => line.includes('catalog') && line.includes('429'));
  assert.notEqual(
    alertIndex,
    -1,
    `the abort must be reported with the blocking status, got: ${JSON.stringify(errors)}`,
  );
  // As above: the summary has to land before the exit, not with the closing log
  // the abort jumps over. The count here is whatever this test's mocks issued —
  // zero, since `listProducts` never reaches the network. In production the same
  // exit is reached only after a request and three retries, so the number is the
  // point; the assertion pins the line's shape rather than its value.
  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * The block lands on the *second* product, so the first has already written its
 * own file. That is the case the previous test cannot show: what the abort
 * protects is `index.json`/`days.json`, not the per-product files a round writes
 * as it goes. Asserting the per-product write happened states that boundary
 * outright rather than leaving it to be discovered — the deferred ledger tracks
 * the commit-side consequence.
 */
test('a block on a later product still leaves the snapshot files at their previous round', async (t: TestContext) => {
  const blockedEntry: CatalogEntry = { ...catalogEntry, code: 'TEST0002' };

  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry, blockedEntry]);
  t.mock.method(usjSource, 'fetchProduct', async (entry: CatalogEntry) => {
    if (entry.code === blockedEntry.code) {
      throw new BlockedError('https://example.test/product', 503);
    }
    return productResult(entry.code);
  });

  const { written } = mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a persistent block must exit non-zero however far into the round it lands');
    return true;
  });

  assert.equal(
    productWrites(written).length,
    1,
    'the product fetched before the block is written as the round goes, and is not rolled back',
  );
  assert.deepEqual(
    snapshotWrites(written),
    [],
    'index.json/days.json must still be left at the last successful round (NFR11)',
  );
});

test('an ordinary (non-BlockedError) failure on one product is recorded and the round continues to the next product', async (t: TestContext) => {
  const okEntry: CatalogEntry = { ...catalogEntry, code: 'TEST0002' };

  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry, okEntry]);
  t.mock.method(usjSource, 'fetchProduct', async (entry: CatalogEntry) => {
    if (entry.code === catalogEntry.code) throw new Error('some ordinary parse failure');
    return productResult(okEntry.code);
  });

  const contents = new Map<string, string>();
  const { written } = mockFs(t);
  t.mock.method(fs, 'writeFileSync', ((file: unknown, data: unknown) => {
    written.push(String(file));
    contents.set(String(file), String(data));
  }) as typeof fs.writeFileSync);

  const exit = t.mock.method(process, 'exit', (() => undefined) as (code?: number) => never);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);

  await main();

  assert.equal(exit.mock.callCount(), 0, 'a non-BlockedError failure must not abort the round');
  const indexPath = snapshotWrites(written).find(p => p.endsWith('index.json'));
  assert.ok(indexPath, 'the round must still write index.json after an ordinary single-product failure');

  const index = JSON.parse(contents.get(indexPath) as string);
  assert.equal(index.products.length, 2, 'both the failed and the succeeding product must appear in the index');
  const failedSummary = index.products.find((p: { code: string }) => p.code === catalogEntry.code);
  assert.ok(failedSummary?.error, 'the failed product must carry an error field (existing behavior, unchanged)');
});

/**
 * Story 1.5: the snapshot's date domain is this round's range.
 *
 * `buildDays` takes the range as an argument now, and nothing below `main()`
 * can tell whether it was handed the right one — a call site wired to some
 * narrower window (a single product's calendar, say) would quietly shrink the
 * grid to a fraction of the days it should cover, with every grid-level test
 * still green because they all pass their own range in. So this asserts the
 * wiring from the outside: whatever `main()` asked the store for is what the
 * written snapshot spans.
 */
test('the days.json a round writes spans that round\'s whole fetch range', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  t.mock.method(usjSource, 'fetchProduct', async () => productResult(catalogEntry.code));

  const contents = new Map<string, string>();
  const { written } = mockFs(t);
  t.mock.method(fs, 'writeFileSync', ((file: unknown, data: unknown) => {
    written.push(String(file));
    contents.set(String(file), String(data));
  }) as typeof fs.writeFileSync);
  t.mock.method(process, 'exit', (() => undefined) as (code?: number) => never);
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(console, 'log', () => undefined);

  // JST midnight could roll over mid-run, which would make a hard-coded
  // expectation flake once a day. Bracket the run instead and require the
  // snapshot to start on the day it actually saw.
  const before = todayJST();
  await main();
  const after = todayJST();

  const daysPath = snapshotWrites(written).find(p => p.endsWith('days.json'));
  assert.ok(daysPath, 'a completed round must write days.json');
  const dates = Object.keys(JSON.parse(contents.get(daysPath) as string).days);

  const first = dates[0];
  const last = dates[dates.length - 1];
  assert.ok(
    first === before || first === after,
    `the grid must start on the round's own start date, got ${first} (round ran ${before}..${after})`,
  );
  assert.equal(
    last,
    shiftMonths(first, 6),
    'and run to the end of the range the round asked the store for, six months out',
  );
  assert.deepEqual(
    dates,
    everyNthDay(first, last, 1),
    'with every day in between present exactly once and in order — no gaps, no truncated domain',
  );
});

/**
 * DW-38: `--product=` naming a code the catalog does not have is its own early
 * exit, separate from the BlockedError paths above — it must still leave the
 * same "how far did we get" summary behind rather than exiting silently.
 */
test('a --product= filter that matches nothing in the catalog aborts with a summary before exit(2)', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  const fetchProduct = t.mock.method(usjSource, 'fetchProduct', async () => productResult(catalogEntry.code));

  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--product=NOPE0001'];
  t.after(() => {
    process.argv = originalArgv;
  });

  const { written } = mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 2, 'an unmatched --product= filter must exit 2 (existing behavior, unchanged)');
    return true;
  });

  assert.equal(fetchProduct.mock.callCount(), 0, 'the round must stop before fetching any product');
  assert.deepEqual(
    snapshotWrites(written),
    [],
    'index.json/days.json must not be rewritten when no product matched the filter',
  );

  const alertIndex = errors.findIndex(line => line.includes('No product matched'));
  assert.notEqual(alertIndex, -1, `the abort must say no product matched, got: ${JSON.stringify(errors)}`);
  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * DW-39: an unmodeled exception from `main()` must not fall out the bottom of
 * this module's fire-and-forget invocation as an unhandled rejection. Calling
 * `handleFatalMainError` directly exercises that handler without having to
 * engineer a real throw through `main()`'s full body.
 */
test('handleFatalMainError prints the fatal alert then the abort summary and exits 1', (t: TestContext) => {
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  assert.throws(() => handleFatalMainError(new Error('boom')), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'an unmodeled exception must exit 1 rather than surface as an unhandled rejection (DW-39)');
    return true;
  });

  const alertIndex = errors.findIndex(line => line.includes('[fetch] fatal:') && line.includes('boom'));
  assert.notEqual(alertIndex, -1, `the fatal alert must name the error, got: ${JSON.stringify(errors)}`);
  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * DW-39 follow-up: not every rejection is an `Error` — a thrown plain object
 * (e.g. a hand-rolled `{ code, path }` failure shape rather than a real
 * `Error`) is a realistic case. Stringifying such a
 * value via implicit `toString()` would print the useless `[object Object]`;
 * this asserts the fallback carries the value's actual content instead, and
 * that the handler still exits 1 the same as it does for a real `Error`.
 */
test('handleFatalMainError still reports useful detail and exits 1 for a non-Error rejection', (t: TestContext) => {
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  assert.throws(() => handleFatalMainError({ code: 'EACCES', path: '/data/index.json' }), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a non-Error rejection must still exit 1 rather than surface as an unhandled rejection');
    return true;
  });

  const alertIndex = errors.findIndex(line => line.includes('[fetch] fatal:'));
  assert.notEqual(alertIndex, -1, `the fatal alert must be printed, got: ${JSON.stringify(errors)}`);
  const alert = errors[alertIndex];
  assert.ok(
    !alert.includes('[object Object]'),
    `a non-Error value must not collapse to [object Object], got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('EACCES') && alert.includes('/data/index.json'),
    `the fatal alert must carry the non-Error value's actual content, got: ${JSON.stringify(alert)}`,
  );
  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * DW-39 hardening check: `handleFatalMainError`'s own reporting steps
 * (`console.error`, `logAbortSummary`) are wrapped in `try`/`finally`
 * specifically so a throw from either of them still reaches
 * `process.exit(1)` instead of escaping uncaught — the exact
 * unhandled-rejection failure mode this function exists to eliminate, one
 * level deeper. This forces `console.error`'s first call to throw and
 * asserts the `finally` still runs.
 */
test('handleFatalMainError still exits 1 even when reporting the fatal alert itself throws', (t: TestContext) => {
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  t.mock.method(console, 'error', () => {
    throw new Error('stderr is closed (mocked)');
  });

  assert.throws(() => handleFatalMainError(new Error('boom')), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a throw while reporting the fatal alert must still exit 1 via finally');
    return true;
  });
});

/**
 * DW-39 hardening check, other half: the same `try`/`finally` guard must also
 * cover `logAbortSummary` throwing, not just `console.error` — the JSDoc names
 * `logAbortSummary` (e.g. its `requestCount()` call) as an equally motivating
 * case, so it needs its own test rather than relying on the console.error test
 * above to stand in for it.
 */
test('handleFatalMainError still exits 1 even when logAbortSummary itself throws', (t: TestContext) => {
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  t.mock.method(limiter, 'requestCount', () => {
    throw new Error('request counter unavailable (mocked)');
  });

  assert.throws(() => handleFatalMainError(new Error('boom')), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'a throw while summarizing the abort must still exit 1 via finally');
    return true;
  });
});

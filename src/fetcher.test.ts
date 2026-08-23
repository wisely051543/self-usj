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
import { handleFatalMainError, main, readIndex } from './fetcher';
import { everyNthDay, shiftMonths, todayJST } from './dates';
import { INDEX_SCHEMA_VERSION } from './schema';
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

/** Mocks `fs.readFileSync` by basename; anything else falls through to the real fs. Mirrors i18n-check.test.ts's `withFiles()`. */
function withFiles(t: TestContext, files: Record<string, string | Error>): void {
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    const content = typeof file === 'string' ? files[path.basename(file)] : undefined;
    if (content === undefined) return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
    if (content instanceof Error) throw content;
    return content;
  }) as typeof fs.readFileSync);
}

/**
 * DW-21: `readIndex()` used to cast `data/index.json` straight to `Index` with
 * no version check — any failure, a schema mismatch included, was swallowed the
 * same way as a cold first run. It now calls `assertIndexSchemaVersion()`
 * itself, logs the mismatch, and returns `null` the same way a missing file
 * does, rather than throwing the way the page and CI gate do — this file is
 * the writer, so treating a rejected snapshot as "no previous snapshot" is
 * the correct in-band fallback, not a swallowed error.
 */
test('readIndex() returns null and logs a clear error when data/index.json is at a version this build does not recognize', (t: TestContext) => {
  withFiles(t, {
    'index.json': JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION + 1, products: [] }),
  });
  const errors = captureErrors(t);

  assert.equal(readIndex(), null, 'a version-mismatched index.json must be treated as no previous snapshot');
  assert.ok(
    errors.some(line =>
      line.includes('index.json schemaVersion is')
      && line.includes(String(INDEX_SCHEMA_VERSION + 1))
      && line.includes(String(INDEX_SCHEMA_VERSION)),
    ),
    `expected a schema-version mismatch naming both the actual and expected version to be logged, got: ${JSON.stringify(errors)}`,
  );
});

test('readIndex() returns the parsed index unchanged when the version is current', (t: TestContext) => {
  const index = { schemaVersion: INDEX_SCHEMA_VERSION, products: [{ code: 'TEST0001' }] };
  withFiles(t, { 'index.json': JSON.stringify(index) });
  const errors = captureErrors(t);

  assert.deepEqual(readIndex(), index);
  assert.equal(errors.length, 0, 'a version-correct read must not log anything');
});

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
  // Two entries, not one: the `Known:` assertion below is only worth making if
  // a catalog with more than a single code has to be listed in full.
  const catalog: CatalogEntry[] = [catalogEntry, { ...catalogEntry, code: 'TEST0002' }];
  t.mock.method(usjSource, 'listProducts', async () => catalog);
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

  /**
   * DW-59: "no product matched" on its own leaves the operator who mistyped a
   * code with nowhere to go. The alert has to name the code that missed *and*
   * list what the catalog actually holds, so the fix is readable off the same
   * line that reported the failure — the half of the message that was going
   * entirely unasserted.
   */
  const alert = errors[alertIndex];
  assert.ok(
    alert.includes('No product matched NOPE0001'),
    `the alert must name the code that matched nothing, got: ${alert}`,
  );
  const knownIndex = alert.indexOf('Known: ');
  assert.notEqual(knownIndex, -1, `the alert must list the codes the catalog does have, got: ${alert}`);
  for (const entry of catalog) {
    assert.notEqual(
      alert.indexOf(entry.code, knownIndex),
      -1,
      `every catalog code must be listed after "Known: ", but ${entry.code} is missing from: ${alert}`,
    );
  }

  assertAbortSummaryFollows(errors, alertIndex);
});

/**
 * DW-61: the unmatched-filter abort reports before it exits, and those
 * reporting steps can themselves throw — `logAbortSummary` reads
 * `requestCount()`, which is not this branch's to vouch for. Without the
 * `try`/`finally` guard the throw would skip `process.exit(2)` and surface at
 * `main().catch(handleFatalMainError)` instead, ending the round at exit code
 * 1: "you asked for a code that does not exist" silently reclassified as
 * "something blew up". The exit code is the whole contract of this branch, so
 * it has to survive its own reporting failing.
 */
test('an unmatched --product= filter still exits 2 even when logAbortSummary itself throws', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  const fetchProduct = t.mock.method(usjSource, 'fetchProduct', async () => productResult(catalogEntry.code));

  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--product=NOPE0001'];
  t.after(() => {
    process.argv = originalArgv;
  });

  mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  captureErrors(t);
  const requestCount = t.mock.method(limiter, 'requestCount', () => {
    throw new Error('request counter unavailable (mocked)');
  });

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 2, 'a throw while reporting the unmatched filter must still exit 2 via finally');
    return true;
  });

  // Without this the test goes quietly vacuous the day `logAbortSummary` stops
  // reading `requestCount()`: the exit-2 assertion above would keep passing on
  // a branch where nothing ever threw, and the `finally` it exists to guard
  // would be back to untested.
  assert.ok(
    requestCount.mock.callCount() > 0,
    'the mocked thrower must actually have been reached, or this test asserts nothing about finally',
  );
  assert.equal(fetchProduct.mock.callCount(), 0, 'the round must still stop before fetching any product');
});

/**
 * DW-61, other half: the guard wraps `console.error` as well as
 * `logAbortSummary`, and the alert line is the step that runs *first* — a
 * closed or replaced stderr takes the round down before the summary is ever
 * reached. Pinning only the `logAbortSummary` case above leaves the alert free
 * to be moved back outside the `try` with every test still green, so it needs
 * its own test rather than borrowing that one's coverage. Mirrors the pair
 * guarding `handleFatalMainError` below.
 */
test('an unmatched --product= filter still exits 2 even when printing the alert itself throws', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  const fetchProduct = t.mock.method(usjSource, 'fetchProduct', async () => productResult(catalogEntry.code));

  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--product=NOPE0001'];
  t.after(() => {
    process.argv = originalArgv;
  });

  mockFs(t);
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  // Not `captureErrors`: this test needs `console.error` to fail, not to be
  // recorded, and the alert is the very first thing it is asked to print.
  t.mock.method(console, 'error', () => {
    throw new Error('stderr is closed (mocked)');
  });

  await assert.rejects(main(), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 2, 'a throw while printing the unmatched-filter alert must still exit 2 via finally');
    return true;
  });

  assert.equal(fetchProduct.mock.callCount(), 0, 'the round must still stop before fetching any product');
});

/**
 * DW-58, first half: several `--product=` flags are an OR, not an AND. Only a
 * filter that matches *nothing* is an abort — one good code alongside a typo'd
 * one must still run the round for the good code, because the alternative (any
 * miss aborts) would make the flag unusable for the batch invocations it
 * exists for.
 */
test('several --product= flags where only some match run the round for the matching codes and do not abort', async (t: TestContext) => {
  // Two entries, one of them unrequested: with a single-entry catalog
  // "only TEST0001 was fetched" is equally satisfied by "the filter was
  // ignored and everything was fetched", which is the regression this is for.
  const catalog: CatalogEntry[] = [catalogEntry, { ...catalogEntry, code: 'TEST0002' }];
  t.mock.method(usjSource, 'listProducts', async () => catalog);
  const fetchProduct = t.mock.method(
    usjSource,
    'fetchProduct',
    async (entry: CatalogEntry) => productResult(entry.code),
  );

  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--product=TEST0001', '--product=NOPE0001'];
  t.after(() => {
    process.argv = originalArgv;
  });

  mockFs(t);
  const exit = t.mock.method(process, 'exit', (() => undefined) as (code?: number) => never);
  const errors = captureErrors(t);
  t.mock.method(console, 'log', () => undefined);

  await main();

  assert.equal(exit.mock.callCount(), 0, 'a partially matching filter must not abort the round');
  assert.ok(
    !errors.some(line => line.includes('No product matched')),
    `a partially matching filter must not report an unmatched filter, got: ${JSON.stringify(errors)}`,
  );
  assert.deepEqual(
    fetchProduct.mock.calls.map(call => (call.arguments[0] as CatalogEntry).code),
    ['TEST0001'],
    'only the requested code that matched the catalog may be fetched — not the unmatched one, and not the catalog entry nobody asked for',
  );
});

/**
 * DW-58, second half: `--product=` with nothing after the `=` is dropped by
 * `.filter(Boolean)`, leaving `wanted` empty, which means "no filter" and so
 * fetches the whole catalog. That is deliberately silent rather than an error,
 * and nothing was pinning it: drop the `filter(Boolean)` and the empty string
 * becomes a filter matching no code, turning a harmless empty flag into an
 * exit-2 abort. This test is the tripwire on that fork.
 */
test('an empty --product= value is dropped rather than treated as a filter, so the whole catalog is fetched', async (t: TestContext) => {
  const catalog: CatalogEntry[] = [catalogEntry, { ...catalogEntry, code: 'TEST0002' }];
  t.mock.method(usjSource, 'listProducts', async () => catalog);
  const fetchProduct = t.mock.method(
    usjSource,
    'fetchProduct',
    async (entry: CatalogEntry) => productResult(entry.code),
  );

  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--product='];
  t.after(() => {
    process.argv = originalArgv;
  });

  mockFs(t);
  const exit = t.mock.method(process, 'exit', (() => undefined) as (code?: number) => never);
  const errors = captureErrors(t);
  t.mock.method(console, 'log', () => undefined);

  await main();

  assert.equal(exit.mock.callCount(), 0, 'an empty --product= value must not abort the round');
  assert.ok(
    !errors.some(line => line.includes('No product matched')),
    `an empty --product= value must not be reported as an unmatched filter, got: ${JSON.stringify(errors)}`,
  );
  assert.deepEqual(
    fetchProduct.mock.calls.map(call => (call.arguments[0] as CatalogEntry).code).sort(),
    ['TEST0001', 'TEST0002'],
    'an empty value leaves no filter at all, so every catalog entry is fetched',
  );
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


/**
 * A real stack frame, not merely the word "at": `new Error('blocked at
 * checkout')` would satisfy a bare `includes(' at ')` with no stack at all,
 * which is exactly the DW-57 regression these assertions are meant to catch.
 */
const STACK_FRAME = /\n\s+at /;

/**
 * Mirrors `FATAL_DETAIL_MAX_CHARS` in `src/fetcher.ts`, which stays unexported
 * because nothing in production needs it. Kept here so the truncation
 * assertions bound the line at the real cap rather than at some far looser
 * number a regression could widen the cap into unnoticed.
 */
const FATAL_DETAIL_CAP = 4000;

/**
 * DW-56/57/60/62: the tests below all drive `handleFatalMainError` the same
 * way — mock `process.exit` to throw, capture `console.error`, assert the exit
 * code — and differ only in the shape of the thrown value, so the scaffolding
 * lives here rather than being copied once per shape. The four assertions it
 * always makes are the ones that hold for *every* shape: the round still exits
 * 1, the fatal line carries something (never a bare `[fetch] fatal: `, DW-60),
 * it never collapses to `[object Object]` (DW-56), and the abort summary still
 * follows it. Each caller then adds what is specific to its own shape.
 */
function reportFatal(t: TestContext, thrown: unknown): string {
  t.mock.method(process, 'exit', ((code?: number) => {
    throw new ExitSignal(code);
  }) as (code?: number) => never);
  const errors = captureErrors(t);

  assert.throws(() => handleFatalMainError(thrown), (err: unknown) => {
    assert.ok(err instanceof ExitSignal, `expected process.exit to have been called, got ${err}`);
    assert.equal(err.code, 1, 'every thrown value shape must still exit 1');
    return true;
  });

  const alertIndex = errors.findIndex(line => line.startsWith('[fetch] fatal:'));
  assert.notEqual(alertIndex, -1, `the fatal alert must be printed, got: ${JSON.stringify(errors)}`);
  const alert = errors[alertIndex];
  assert.notEqual(
    alert.trim(),
    '[fetch] fatal:',
    `the fatal alert must carry non-empty detail, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    !alert.includes('[object Object]'),
    `no thrown value may collapse to [object Object], got: ${JSON.stringify(alert)}`,
  );
  assertAbortSummaryFollows(errors, alertIndex);
  return alert;
}

/**
 * DW-57: the handler used to print only `err.message`, throwing away the call
 * stack — the one part of an unmodeled exception that says *where* the bug is,
 * and the only thing a CI log leaves behind to work from.
 */
test('handleFatalMainError prints the call stack, not just the message, for a thrown Error (DW-57)', (t: TestContext) => {
  const alert = reportFatal(t, new Error('boom'));

  assert.ok(alert.includes('boom'), `the fatal alert must still name the error, got: ${JSON.stringify(alert)}`);
  assert.match(
    alert,
    STACK_FRAME,
    `the fatal alert must carry the call stack, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * DW-60: an `Error` with an empty message printed the diagnostically worthless
 * `[fetch] fatal: ` and nothing else. Its stack still names the error type and
 * the throw site, so preferring the stack covers this case too.
 */
test('handleFatalMainError still reports something diagnostic for an Error with an empty message (DW-60)', (t: TestContext) => {
  const alert = reportFatal(t, new Error());

  assert.ok(alert.includes('Error'), `the fatal alert must name the error type, got: ${JSON.stringify(alert)}`);
  assert.match(
    alert,
    STACK_FRAME,
    `the fatal alert must carry the call stack when the message is empty, got: ${JSON.stringify(alert)}`,
  );
});

/** An `Error` built without a stack (hand-rolled, or one deliberately stripped) must fall back to its message. */
test('handleFatalMainError falls back to the message when a thrown Error carries no stack', (t: TestContext) => {
  const err = new Error('boom');
  err.stack = undefined;

  const alert = reportFatal(t, err);

  assert.ok(alert.includes('boom'), `the fatal alert must fall back to the message, got: ${JSON.stringify(alert)}`);
});

/** With neither stack nor message there is still the error's name, plus an explicit note that nothing else was available. */
test('handleFatalMainError falls back to the error name when a thrown Error has neither stack nor message', (t: TestContext) => {
  const err = new Error();
  err.stack = '';

  const alert = reportFatal(t, err);

  assert.ok(alert.includes('Error'), `the fatal alert must at least name the error type, got: ${JSON.stringify(alert)}`);
  assert.ok(
    alert.includes('no message and no stack'),
    `the fatal alert must say why there is nothing else to show, got: ${JSON.stringify(alert)}`,
  );
});

/** A thrown string is already the diagnostic; it must be passed through as-is. */
test('handleFatalMainError reports a thrown string verbatim', (t: TestContext) => {
  const alert = reportFatal(t, 'boom');

  assert.ok(alert.includes('boom'), `the fatal alert must carry the thrown string, got: ${JSON.stringify(alert)}`);
});

/** An empty thrown string has no content of its own, so the handler has to supply the description. */
test('handleFatalMainError describes an empty thrown string rather than printing nothing', (t: TestContext) => {
  const alert = reportFatal(t, '');

  assert.ok(
    alert.includes('empty string'),
    `an empty thrown string must be described, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * DW-56: a self-referencing object made `JSON.stringify` throw, and the
 * `catch { return String(err) }` fallback then printed `[object Object]` — the
 * exact useless output that fallback exists to avoid. The seen-set replacer
 * keeps the rest of the object readable and marks only the cycle.
 */
test('handleFatalMainError serializes a circular non-Error object instead of collapsing to [object Object] (DW-56)', (t: TestContext) => {
  const circular: Record<string, unknown> = { code: 'ELOOP' };
  circular.self = circular;

  const alert = reportFatal(t, circular);

  assert.ok(
    alert.includes('ELOOP'),
    `the fatal alert must carry the object's real content, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('[circular]'),
    `the cycle must be marked rather than making serialization throw, got: ${JSON.stringify(alert)}`,
  );
});

/** `bigint` makes `JSON.stringify` throw the same way a cycle does, and used to degrade the same way. */
test('handleFatalMainError serializes a non-Error object carrying a bigint', (t: TestContext) => {
  const alert = reportFatal(t, { code: 'EBIG', size: 9007199254740993n });

  assert.ok(
    alert.includes('EBIG') && alert.includes('9007199254740993'),
    `the fatal alert must carry a bigint-bearing object's content, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * DW-62: `throw null` was entirely untested. The old code printed the bare
 * token `null` (`JSON.stringify(null)` is the string `"null"`), which is
 * indistinguishable from a thrown value that merely *serializes* to null, so
 * asserting only `includes('null')` would pass against the very code this
 * change replaced. The line has to say null was *thrown*.
 */
test('handleFatalMainError says that null was thrown (DW-62)', (t: TestContext) => {
  const alert = reportFatal(t, null);

  assert.ok(alert.includes('null'), `the fatal alert must say null was thrown, got: ${JSON.stringify(alert)}`);
  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: null',
    `a bare "null" does not say null was thrown, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('thrown'),
    `the fatal alert must describe null as the thrown value, got: ${JSON.stringify(alert)}`,
  );
});

/** DW-62, other half: a bare `undefined` in the log says nothing about what happened; the description has to. */
test('handleFatalMainError says that undefined was thrown (DW-62)', (t: TestContext) => {
  const alert = reportFatal(t, undefined);

  assert.ok(alert.includes('undefined'), `the fatal alert must say undefined was thrown, got: ${JSON.stringify(alert)}`);
  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: undefined',
    `a bare "undefined" says nothing about what was thrown, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Duck-typed error shapes: a cross-realm error (from `vm`, a worker, or a
 * duplicated bundled copy of a library) fails `instanceof Error` while being
 * one in every other respect. `message`/`stack` are non-enumerable on real
 * errors — which is both why they must be duck-typed (the JSON branch would
 * serialize such a value to a contentless `{}`, a different route to the same
 * DW-56 dead end) and what distinguishes them from an ordinary payload that
 * merely happens to carry a field of that name. The fixture below therefore
 * defines them the way a real error does, not as plain literal fields.
 */
test('handleFatalMainError reports an Error-like value that fails instanceof Error', (t: TestContext) => {
  const crossRealm = { name: 'CrossRealmError' };
  Object.defineProperties(crossRealm, {
    message: { value: 'boom', enumerable: false },
    stack: {
      value: 'CrossRealmError: boom\n    at somewhereElse (other-realm.js:1:1)',
      enumerable: false,
    },
  });

  const alert = reportFatal(t, crossRealm);

  assert.ok(alert.includes('boom'), `the fatal alert must carry the message, got: ${JSON.stringify(alert)}`);
  assert.match(alert, STACK_FRAME, `the fatal alert must carry the stack, got: ${JSON.stringify(alert)}`);
  assert.ok(
    !alert.includes('{}'),
    `an Error-like value must not serialize to a contentless object, got: ${JSON.stringify(alert)}`,
  );
});

/** An `Error` subclass renames itself; the stack V8 formats on first read carries that name, and the log must show it. */
test('handleFatalMainError reports the custom name of an Error subclass', (t: TestContext) => {
  class CalendarBlockedError extends Error {
    name = 'CalendarBlockedError';
  }

  const alert = reportFatal(t, new CalendarBlockedError('boom'));

  assert.ok(
    alert.includes('CalendarBlockedError'),
    `the fatal alert must name the error subclass, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * `JSON.stringify` turns `NaN` and `Infinity` into `null`, which in the log is
 * indistinguishable from the DW-62 `throw null` line — so non-object
 * primitives are described before the serializer ever sees them.
 */
test('handleFatalMainError distinguishes a thrown NaN from a thrown null', (t: TestContext) => {
  const alert = reportFatal(t, NaN);

  // Asserting the positive contract rather than the absence of the substring
  // "null": any future wording containing it (a path, "non-null") would fail a
  // negative assertion without the line having regressed at all.
  assert.match(
    alert,
    /number thrown: NaN/,
    `a thrown NaN must be named as a thrown number, not read as a thrown null, got: ${JSON.stringify(alert)}`,
  );
});

/** The other half of the same branch: `JSON.stringify` collapses `Infinity` to `null` too. */
test('handleFatalMainError distinguishes a thrown Infinity from a thrown null', (t: TestContext) => {
  const alert = reportFatal(t, Infinity);

  assert.match(
    alert,
    /number thrown: Infinity/,
    `a thrown Infinity must be named as a thrown number, got: ${JSON.stringify(alert)}`,
  );
});

/** `JSON.stringify` returns `undefined` for a symbol, so this shape needs its own branch too. */
test('handleFatalMainError reports a thrown symbol', (t: TestContext) => {
  const alert = reportFatal(t, Symbol('boom'));

  assert.ok(alert.includes('boom'), `the fatal alert must carry the symbol's description, got: ${JSON.stringify(alert)}`);
});

/** Same for a function — `JSON.stringify` drops it entirely, but its name says which step threw. */
test('handleFatalMainError reports a thrown function', (t: TestContext) => {
  const alert = reportFatal(t, function failingStep() { /* never called */ });

  assert.ok(
    alert.includes('failingStep'),
    `the fatal alert must name the thrown function, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Tail layer 2: `JSON.stringify` throws for a reason other than a cycle (here
 * a throwing `toJSON`), so serialization cannot carry the detail — but the
 * value's own `toString` can, and must be preferred over the structural
 * description below it.
 */
test('handleFatalMainError falls back to toString when serialization throws', (t: TestContext) => {
  const alert = reportFatal(t, {
    toJSON() { throw new Error('toJSON is broken'); },
    toString() { return 'CustomFailure: disk full'; },
  });

  assert.ok(
    alert.includes('CustomFailure: disk full'),
    `the fatal alert must use the value's own toString, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Tail layer 3: a throwing `toJSON` with no useful `toString` leaves
 * `String(err)` returning the very `[object Object]` DW-56 is about, so the
 * structural description has to take over and say what was thrown.
 */
test('handleFatalMainError describes the shape of a value whose serialization throws and whose toString is useless', (t: TestContext) => {
  const alert = reportFatal(t, {
    failedPath: '/data/index.json',
    toJSON() { throw new Error('toJSON is broken'); },
  });

  assert.ok(
    alert.includes('failedPath'),
    `the fatal alert must name what the value was carrying, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Tail layer 3, hardest case: a null-prototype object serializes to a
 * contentless `{}` and makes `String(err)` throw outright, so both earlier
 * layers miss. The fatal line must still say something, and specifically not
 * the `[object Object]` that `Object.prototype.toString.call()` alone returns.
 */
test('handleFatalMainError still prints a fatal line for a value that cannot be converted to a string', (t: TestContext) => {
  const alert = reportFatal(t, Object.create(null));

  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: {}',
    `a contentless serialization must not be the final answer, got: ${JSON.stringify(alert)}`,
  );
  // The full structural shape, not merely `includes('Object')` — that substring
  // is also present in the `[object Object]` this test exists to rule out.
  assert.equal(
    alert.trim(),
    '[fetch] fatal: Object (no own keys)',
    `the fatal alert must say what kind of value was thrown, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Reading `err.stack` is itself a property access, and on a Proxy (or any
 * object with a throwing getter) it throws. If that escaped `describeThrownValue`
 * it would cost the fatal line *and* the abort summary — only the `finally`'s
 * exit 1 would survive, which is a worse version of the unhandled rejection
 * this whole path exists to prevent. `reportFatal` asserts both lines.
 */
test('handleFatalMainError still reports both lines when reading the thrown value itself throws', (t: TestContext) => {
  const hostile = new Proxy({}, {
    get() { throw new Error('every property access is a trap'); },
    ownKeys() { throw new Error('so is every key listing'); },
  });

  const alert = reportFatal(t, hostile);

  // Pins the outer guard's own wording: without this the placeholder could be
  // replaced with any non-empty string and only `reportFatal`'s generic checks
  // would be left, which every string passes.
  assert.equal(
    alert.trim(),
    '[fetch] fatal: (thrown value could not be described)',
    `the fatal alert must say the value defeated every description attempt, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * The proxy above throws on the very first property read, so the outer guard
 * answers and the structural description is never entered. These two reach the
 * guards *inside* it: a value that survives the ladder as far as the
 * description, but whose key listing (`ownKeys`) or whose class tag
 * (`Symbol.toStringTag`) throws once it gets there. Without them either guard
 * could be deleted with the suite still green.
 */
test('handleFatalMainError still prints a fatal line when listing the thrown value\'s keys throws', (t: TestContext) => {
  const alert = reportFatal(t, new Proxy({}, {
    ownKeys() { throw new Error('key listing is a trap'); },
  }));

  assert.equal(
    alert.trim(),
    '[fetch] fatal: Object (no own keys)',
    `the fatal alert must still say what kind of value was thrown, got: ${JSON.stringify(alert)}`,
  );
});

test('handleFatalMainError still prints a fatal line when reading the thrown value\'s class tag throws', (t: TestContext) => {
  const alert = reportFatal(t, {
    failedPath: '/data/index.json',
    toJSON() { throw new Error('toJSON is broken'); },
    get [Symbol.toStringTag]() { throw new Error('the class tag is a trap'); },
  });

  assert.match(
    alert,
    /^\[fetch\] fatal: Object \(own keys: failedPath, toJSON/,
    `the fatal alert must fall back to the default tag and still name the fields, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * The seen set bounds cycles, not volume. Without a cap, a thrown value
 * holding a large graph dumps unbounded text into one `console.error`, which
 * on a pipe can push the abort summary that follows past the buffer — losing
 * the "how far did it get" half of the report. `reportFatal` asserts the
 * summary still lands.
 */
test('handleFatalMainError caps an oversized detail rather than flooding the log', (t: TestContext) => {
  const alert = reportFatal(t, { blob: 'x'.repeat(50_000) });

  // Exactly the cap plus the `[fetch] fatal: ` prefix: the truncation marker is
  // counted against the cap rather than appended past it, so no slack is needed
  // and a regression that stopped counting it would show up here.
  assert.ok(
    alert.length <= FATAL_DETAIL_CAP + '[fetch] fatal: '.length,
    `an oversized thrown value must be capped at ${FATAL_DETAIL_CAP}, got a ${alert.length}-char line`,
  );
  assert.ok(
    alert.includes('truncated'),
    `the cap must be marked so nobody reads the line as complete, got: ${JSON.stringify(alert.slice(-120))}`,
  );
});

/**
 * The other side of the cap: a stack is what DW-57 asked to preserve, so an
 * ordinary error must come through whole.
 *
 * An `Error` raised inside a test callback carries only a handful of short
 * frames, which pins the cap from above but not from below — the cap could be
 * cut to a few hundred characters and such a test would stay green while real
 * fatals, raised deep inside `main()`'s async chain with absolute `ts-node`
 * paths, were being clipped mid-stack. The stack below is sized like one of
 * those instead, so tightening the cap past a realistic stack turns this red.
 */
test('handleFatalMainError does not truncate a realistically deep stack', (t: TestContext) => {
  const err = new Error('boom');
  const frames = Array.from(
    { length: 55 },
    (_unused, index) => `    at deepFrame${index} (/Users/ci/builds/usj/src/fetcher.ts:${index + 1}:17)`,
  );
  err.stack = `Error: boom\n${frames.join('\n')}`;
  assert.ok(err.stack.length > 3000, `the fixture must be a realistically long stack, got ${err.stack.length} chars`);

  const alert = reportFatal(t, err);

  assert.ok(
    !alert.includes('truncated'),
    `a realistic stack must not be clipped, got: ${JSON.stringify(alert.slice(-160))}`,
  );
  assert.ok(
    alert.includes('deepFrame54'),
    `the last frame must survive, got: ${JSON.stringify(alert.slice(-160))}`,
  );
});

/**
 * A failure payload that merely carries a `message` is not an error: the
 * duck-typed error branch would print the message alone and silently drop the
 * `code` and `path` that say what actually failed — the DW-56 kind of loss in
 * a new place, and a regression against what the old `JSON.stringify` printed.
 * Real errors keep `message` non-enumerable, which is what separates them.
 */
test('handleFatalMainError keeps the sibling fields of a payload that happens to carry a message', (t: TestContext) => {
  const alert = reportFatal(t, { code: 'EACCES', message: 'permission denied', path: '/data/index.json' });

  assert.ok(
    alert.includes('EACCES') && alert.includes('/data/index.json'),
    `a message-bearing payload must still be serialized whole, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * `Object.keys` reports nothing for a value whose fields are all
 * non-enumerable — which is one of the two ways a value reaches the structural
 * description in the first place, since the serializer returned `{}` for
 * exactly that reason.
 */
test('handleFatalMainError names the fields of a value whose properties are all non-enumerable', (t: TestContext) => {
  const err = {};
  Object.defineProperty(err, 'failedPath', { value: '/data/index.json', enumerable: false });

  const alert = reportFatal(t, err);

  assert.ok(
    alert.includes('failedPath'),
    `non-enumerable fields must still be named, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * A `Map` (or `Set`, or `Response`) serializes to a contentless `{}` and
 * stringifies to `[object Map]` — a bracket tag as uninformative as the
 * `[object Object]` DW-56 is about, so it has to be rejected the same way.
 */
test('handleFatalMainError does not settle for a bracket tag from String()', (t: TestContext) => {
  const alert = reportFatal(t, new Map([['catalog', 'missing']]));

  assert.ok(
    !alert.includes('[object Map]'),
    `a bracket tag says nothing more than [object Object] does, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('Map'),
    `the fatal alert must still say what kind of value was thrown, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * A `toJSON` returning null serializes to the bare token `null`, which in the
 * log reads as the DW-62 `throw null` case and hides what was really thrown.
 */
test('handleFatalMainError does not report a value that serializes to null as a thrown null', (t: TestContext) => {
  const alert = reportFatal(t, {
    failedPath: '/data/index.json',
    toJSON() { return null; },
  });

  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: null',
    `a value that serializes to null must not read as a thrown null, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('failedPath'),
    `the fatal alert must name what the value was carrying, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * The `stack` half of the duck test, matching the `message` half above. A
 * payload that happens to carry a `stack` field is no more an error than one
 * carrying a `message`: taking the error branch would print that one field and
 * drop the `code` and `path` that say what actually failed. Real errors keep
 * `stack` non-enumerable, which is what separates them.
 */
test('handleFatalMainError keeps the sibling fields of a payload that happens to carry a stack', (t: TestContext) => {
  const alert = reportFatal(t, {
    code: 'EACCES',
    stack: 'not-a-real-stack',
    path: '/data/index.json',
  });

  assert.ok(
    alert.includes('EACCES') && alert.includes('/data/index.json'),
    `a stack-bearing payload must still be serialized whole, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * A `toJSON` returning an empty string serializes to `""` — a result that
 * passes a bare "is it a string" check while carrying nothing at all, the same
 * dead end as the `{}` and `null` results rejected beside it.
 */
test('handleFatalMainError does not settle for a serialization that carries nothing', (t: TestContext) => {
  const alert = reportFatal(t, {
    failedPath: '/data/index.json',
    toJSON() { return ''; },
  });

  assert.ok(
    alert.includes('failedPath'),
    `an empty serialization must give way to the structural description, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * The same for a `toJSON` returning a bare primitive: `[fetch] fatal: 0` says
 * nothing, and since a thrown primitive is already handled far earlier, any
 * bare token reaching here came from a `toJSON` whose value is better described
 * structurally.
 */
test('handleFatalMainError does not report a value that serializes to a bare number', (t: TestContext) => {
  const alert = reportFatal(t, {
    failedPath: '/data/index.json',
    toJSON() { return 0; },
  });

  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: 0',
    `a bare token must not be the fatal line, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('failedPath'),
    `the fatal alert must name what the value was carrying, got: ${JSON.stringify(alert)}`,
  );
});

/** An empty array serializes to `[]`, which is as contentless as `{}` and is rejected the same way. */
test('handleFatalMainError describes a thrown empty array rather than printing []', (t: TestContext) => {
  const alert = reportFatal(t, []);

  assert.notEqual(
    alert.trim(),
    '[fetch] fatal: []',
    `a contentless array must not be the fatal line, got: ${JSON.stringify(alert)}`,
  );
  assert.ok(
    alert.includes('Array'),
    `the fatal alert must say what kind of value was thrown, got: ${JSON.stringify(alert)}`,
  );
});

/**
 * Symbol-keyed fields are invisible to both `JSON.stringify` and
 * `Object.getOwnPropertyNames`, so a value carrying nothing else would reach
 * the structural description and be reported as empty — for precisely the
 * reason that sent it there.
 */
test('handleFatalMainError names the symbol-keyed fields of a value that has no others', (t: TestContext) => {
  const alert = reportFatal(t, { [Symbol('failedPath')]: '/data/index.json' });

  assert.ok(
    alert.includes('failedPath'),
    `symbol-keyed fields must still be named, got: ${JSON.stringify(alert)}`,
  );
});

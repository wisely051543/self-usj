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
import { usjSource } from './sources/usj';
import { main } from './fetcher';
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

test('a BlockedError from fetchProduct stops the round with a non-zero exit, leaving the snapshot files untouched', async (t: TestContext) => {
  t.mock.method(usjSource, 'listProducts', async () => [catalogEntry]);
  t.mock.method(usjSource, 'fetchProduct', async () => {
    throw new BlockedError('https://example.test/product', 503);
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

  const alert = errors.find(line => line.includes('blocked'));
  assert.ok(alert, `the abort must say it was a block, got: ${JSON.stringify(errors)}`);
  assert.ok(
    alert.includes(catalogEntry.code) && alert.includes('503'),
    `the block alert must name the product and the status, got: ${alert}`,
  );
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
  assert.ok(
    errors.some(line => line.includes('catalog') && line.includes('429')),
    `the abort must be reported with the blocking status, got: ${JSON.stringify(errors)}`,
  );
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

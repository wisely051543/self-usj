/**
 * DW-25: main() used to cast data/index.json straight to `Index` and walk
 * `.products` without ever calling assertIndexSchemaVersion() — the check
 * every other consumer of this file already has (index.html's boot(),
 * schema-check.ts's checkSnapshots()). A version mismatch would surface as a
 * missing-translation report or an ENOENT on some product file, not as "wrong
 * schema version". readIndex() is the fix: it is now the only place this file
 * reads data/index.json, and it validates the version before returning.
 *
 * `fs` is mocked via a plain `require('node:fs')` for the reason
 * schema.test.ts's withFiles() documents: a TypeScript namespace import
 * compiles to a getter-only property `t.mock.method` cannot replace, while
 * both modules' getters read through to this same module object at call time.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { INDEX_SCHEMA_VERSION } from './schema';
import { readIndex, main } from './i18n-check';

const fs = require('node:fs') as typeof import('node:fs');

/** Mirrors schema.test.ts's withFiles(): mock readFileSync by basename, fall through otherwise. */
function withFiles(t: TestContext, files: Record<string, string | Error>): void {
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    const content = typeof file === 'string' ? files[path.basename(file)] : undefined;
    if (content === undefined) return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
    if (content instanceof Error) throw content;
    return content;
  }) as typeof fs.readFileSync);
}

const goodIndex = JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION, products: [] });

test('readIndex() returns the parsed index unchanged when the version is current', (t: TestContext) => {
  withFiles(t, { 'index.json': goodIndex });
  const index = readIndex();
  assert.deepEqual(index, { schemaVersion: INDEX_SCHEMA_VERSION, products: [] });
});

test('readIndex() throws on a schemaVersion that does not match', (t: TestContext) => {
  withFiles(t, {
    'index.json': JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION + 1, products: [] }),
  });
  assert.throws(
    () => readIndex(),
    /index\.json schemaVersion is/,
    'a version-mismatched index.json must be refused, not silently walked',
  );
});

test('readIndex() throws when schemaVersion is missing entirely', (t: TestContext) => {
  withFiles(t, { 'index.json': JSON.stringify({ products: [] }) });
  assert.throws(
    () => readIndex(),
    /index\.json schemaVersion is/,
    'a missing schemaVersion must be refused the same way a wrong one is',
  );
});

test('main() aborts on a version mismatch before it ever walks .products', (t: TestContext) => {
  // A fake product code with no file on disk: if main() ever got as far as
  // `index.products.map(...)`, reading this code's product file would throw
  // ENOENT instead. The version guard in readIndex() must fire first.
  withFiles(t, {
    'index.json': JSON.stringify({
      schemaVersion: INDEX_SCHEMA_VERSION + 1,
      products: [{ code: 'DOES_NOT_EXIST_ON_DISK' }],
    }),
  });
  assert.throws(
    () => main(),
    /index\.json schemaVersion is/,
    'main() must fail with the version error, not an ENOENT from walking a fake product code',
  );
});

/*
 * DW-44 / DW-45: both reads used to be a bare
 * `JSON.parse(fs.readFileSync(...))`, so a missing or corrupt file escaped as
 * a raw ENOENT/SyntaxError that named neither the file nor which of the two
 * had happened. These four lock the named messages in — one per cell of the
 * spec's error matrix — so nobody quietly reverts to the unwrapped read.
 */

test('readIndex() names data/index.json when it cannot be read', (t: TestContext) => {
  withFiles(t, { 'index.json': new Error("ENOENT: no such file or directory, open 'index.json'") });
  assert.throws(
    () => readIndex(),
    /^Error: data\/index\.json could not be read: ENOENT/,
    'a missing index must say which file is missing, not just ENOENT',
  );
});

test('readIndex() names data/index.json when it does not parse', (t: TestContext) => {
  withFiles(t, { 'index.json': '{ "schemaVersion": ' });
  assert.throws(
    () => readIndex(),
    /^Error: data\/index\.json is not valid JSON: \S/,
    'a corrupt index must read as a parse failure, distinct from a read failure',
  );
});

test('main() names the product code when its file cannot be read', (t: TestContext) => {
  withFiles(t, {
    'index.json': JSON.stringify({
      schemaVersion: INDEX_SCHEMA_VERSION,
      products: [{ code: 'MISSING' }],
    }),
    'MISSING.json': new Error("ENOENT: no such file or directory, open 'MISSING.json'"),
  });
  assert.throws(
    () => main(),
    /^Error: product MISSING \(data\/products\/MISSING\.json\) could not be read: ENOENT/,
    'a product file the index lists but disk lacks must name the code and the path',
  );
});

test('main() names the product code when its file does not parse', (t: TestContext) => {
  withFiles(t, {
    'index.json': JSON.stringify({
      schemaVersion: INDEX_SCHEMA_VERSION,
      products: [{ code: 'BROKEN' }],
    }),
    'BROKEN.json': '{ "code": ',
  });
  assert.throws(
    () => main(),
    /^Error: product BROKEN \(data\/products\/BROKEN\.json\) is not valid JSON: \S/,
    'a corrupt product file must name the code too, not just fail to parse',
  );
});

/*
 * The four above only ever drive products.map into a throw. This one is the
 * other half: a product file that reads and parses must still arrive in
 * `products` intact. The `[en]` report is the cheapest observable proof —
 * it reads straight off the parsed object and owes nothing to the term
 * tables, so it cannot go green for an unrelated reason.
 *
 * It is also the only test here that runs main() to completion, so it is the
 * only one that reaches readTerms(). Both term tables are stubbed for that
 * reason: withFiles() falls through to the real fs for anything it does not
 * name, and an unstubbed run would read i18n/terms.*.json off disk — making a
 * unit test about product plumbing fail whenever those files move.
 */
test('main() still threads a readable product file through to the report', (t: TestContext) => {
  withFiles(t, {
    'index.json': JSON.stringify({
      schemaVersion: INDEX_SCHEMA_VERSION,
      products: [{ code: 'HAPPY' }],
    }),
    'HAPPY.json': JSON.stringify({
      code: 'HAPPY',
      attractionNames: { ATTR1: { ja: 'ぬるぽアトラクション' } },
    }),
    'terms.zh-TW.json': JSON.stringify({ terms: {} }),
    'terms.en.json': JSON.stringify({ terms: {} }),
  });
  const lines: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });

  main();

  // The ja value is part of the assertion: the code alone only proves the
  // attractionNames keys survived, while the value proves the nested object
  // arrived intact rather than as an empty shell.
  assert.ok(
    lines.some(l => l.includes('[en] attraction ATTR1 has no English name from the API: ぬるぽアトラクション')),
    'a product file that parses must reach the report, not just fail to throw',
  );
});

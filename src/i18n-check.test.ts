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

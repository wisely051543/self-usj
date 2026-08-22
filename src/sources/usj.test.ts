/**
 * NFR7 as a regression: the outbound request headers must not leak this
 * site's own identity back to the store. `HEADERS` (src/sources/usj.ts) is
 * the single object shared by all four `limitedFetch` call sites, so locking
 * it here locks every call site at once.
 *
 * The forbidden string is read out of package.json's `name` rather than
 * hard-coded, so this test cannot quietly drift from what the identifier
 * actually is.
 *
 * Deliberately absent: any assertion about a neutral bot identifier or a
 * contact email. NFR7 marks a neutral bot UA as deferred item O5, and a
 * contact email belongs to Story 1.9 — neither is this story's concern, and
 * asserting for them here would wrongly imply they are missing defects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEADERS } from './usj';

const REPO_ROOT = join(__dirname, '..', '..');

test('HEADERS does not contain this site\'s own identifying name', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    typeof pkg.name === 'string' && pkg.name.length > 0,
    "package.json's name must be a non-empty string for this regression check to be meaningful",
  );
  const forbidden = String(pkg.name).toLowerCase();
  const serialized = JSON.stringify(HEADERS).toLowerCase();
  assert.ok(
    !serialized.includes(forbidden),
    `HEADERS contains '${forbidden}' (from package.json's name), which would ` +
      `identify this site to the store (NFR7)`,
  );
});

test('HEADERS does not set a custom User-Agent', () => {
  const keys = Object.keys(HEADERS).map(k => k.toLowerCase());
  assert.ok(
    !keys.includes('user-agent'),
    'HEADERS sets a custom User-Agent; NFR7 keeps requests on the runtime\'s ' +
      'generic default instead — a neutral bot identifier is deferred item O5, ' +
      'not something to add here',
  );
});

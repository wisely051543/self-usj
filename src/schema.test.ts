/**
 * Story 1.6: an unrecognised snapshot version stops the build and stops the
 * page — it never renders.
 *
 * The bug this closes left no trace: Story 1.5 rewrote `days.json` into a full
 * grid, `schemaVersion` stayed at 1, and nothing anywhere compared the two
 * numbers. So the interesting assertions here are all about the *failure*
 * path — a guard that only gets exercised on the happy path is a comment. Each
 * row of the story's I/O matrix gets a case: too old, too new, missing,
 * present-but-a-string, on both files, in all three places a version is now
 * read (the registry, the CI gate, the page).
 *
 * "Too new must fail too" is the case worth naming. A `>=` guard reads as the
 * safe direction, but the dangerous direction is backwards: a fetcher rolled
 * back to v1 writes cells with no `status`, and `>=` waves them through into a
 * page that shows every day as sold out.
 *
 * index.html has no module boundary, so its two guards are lifted out by source
 * and run in a `node:vm` against the same cases as the TypeScript ones — the
 * shipped code, not a transcription of it.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import {
  DAYS_SCHEMA_VERSION,
  INDEX_SCHEMA_VERSION,
  assertDaysSchemaVersion,
  assertIndexSchemaVersion,
} from './schema';
import { checkSnapshots } from './schema-check';

/** Typed so the mock below is checked against the real signature. */
const fs = require('node:fs') as typeof import('node:fs');

const REPO_ROOT = path.join(__dirname, '..');
const HTML = readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

/**
 * Every version a reader must refuse, named by why it is wrong.
 *
 * Written as offsets from the real number rather than as literals so the table
 * stays meaningful after a bump: whatever the current version is, the one
 * before and the one after it must both be rejected.
 */
function rejectedVersions(current: number): Array<[string, unknown]> {
  return [
    ['a version older than this build', current - 1],
    ['a version newer than this build', current + 1],
    ['no version at all', undefined],
    ['a null version', null],
    ['the right number as a string', String(current)],
  ];
}

// ---------------------------------------------------------------------------
// The registry itself.
// ---------------------------------------------------------------------------

test('the two versions are the numbers this story shipped', () => {
  // The only literals in this file, and deliberately so. Every other assertion
  // here compares the registry against something derived from the registry, so
  // a careless bump — or a bump of the wrong constant — would sit on both sides
  // of the comparison and pass. This is the assertion that has to be edited by
  // hand, on purpose, when a snapshot's shape really changes. Changing a number
  // here without changing the file's shape is the mistake it exists to catch.
  assert.equal(
    DAYS_SCHEMA_VERSION,
    2,
    'days.json is at v2 — the full (date × pass) grid, every cell with a status. Edit this literal only alongside a real change to that shape.',
  );
  assert.equal(
    INDEX_SCHEMA_VERSION,
    5,
    'index.json is at v5 and Story 1.6 did not touch it — bumping days.json must leave this number alone.',
  );
});

test('the two versions are independent constants, not one number used twice', () => {
  const src = readFileSync(path.join(__dirname, 'schema.ts'), 'utf8');
  assert.match(
    src,
    /export const DAYS_SCHEMA_VERSION = \d+;/,
    'DAYS_SCHEMA_VERSION must be its own literal — deriving it from the other file\'s version couples two schedules that are not coupled',
  );
  assert.match(
    src,
    /export const INDEX_SCHEMA_VERSION = \d+;/,
    'INDEX_SCHEMA_VERSION must be its own literal',
  );
  // Each guard names one constant and one file: a shared generic comparator is
  // what turns "the numbers happen to match today" into a reason to pass.
  const daysGuard = /function assertDaysSchemaVersion[\s\S]*?\n}/.exec(src);
  assert.ok(daysGuard, 'src/schema.ts must define assertDaysSchemaVersion as its own function');
  const indexGuard = /function assertIndexSchemaVersion[\s\S]*?\n}/.exec(src);
  assert.ok(indexGuard, 'src/schema.ts must define assertIndexSchemaVersion as its own function');
  assert.ok(
    !daysGuard[0].includes('INDEX_SCHEMA_VERSION'),
    'the days guard must not read the index version',
  );
  assert.ok(
    !indexGuard[0].includes('DAYS_SCHEMA_VERSION'),
    'the index guard must not read the days version',
  );
});

test('assertDaysSchemaVersion accepts only the exact version', () => {
  assert.doesNotThrow(() => assertDaysSchemaVersion(DAYS_SCHEMA_VERSION));
  for (const [why, value] of rejectedVersions(DAYS_SCHEMA_VERSION)) {
    assert.throws(
      () => assertDaysSchemaVersion(value),
      (err: Error) =>
        err.message.includes('days.json') && err.message.includes(String(DAYS_SCHEMA_VERSION)),
      `days.json must be rejected with ${why}, naming the file and the expected version`,
    );
  }
});

test('assertIndexSchemaVersion accepts only the exact version', () => {
  assert.doesNotThrow(() => assertIndexSchemaVersion(INDEX_SCHEMA_VERSION));
  for (const [why, value] of rejectedVersions(INDEX_SCHEMA_VERSION)) {
    assert.throws(
      () => assertIndexSchemaVersion(value),
      (err: Error) =>
        err.message.includes('index.json') && err.message.includes(String(INDEX_SCHEMA_VERSION)),
      `index.json must be rejected with ${why}, naming the file and the expected version`,
    );
  }
});

test('bumping one file\'s version says nothing about the other', () => {
  // The live pairing: whatever the numbers are, each guard answers about its
  // own file only. Feeding each guard the *other* file's number is the check
  // that would quietly pass the day the two numbers coincide.
  // Widened, because the compiler knows today's literals and would reject the
  // comparison outright — this test has to survive the numbers converging.
  const days: number = DAYS_SCHEMA_VERSION;
  const index: number = INDEX_SCHEMA_VERSION;
  if (days !== index) {
    assert.throws(
      () => assertDaysSchemaVersion(INDEX_SCHEMA_VERSION),
      /days\.json/,
      'the index version must not satisfy the days guard',
    );
    assert.throws(
      () => assertIndexSchemaVersion(DAYS_SCHEMA_VERSION),
      /index\.json/,
      'the days version must not satisfy the index guard',
    );
  }
  assert.doesNotThrow(() => assertIndexSchemaVersion(INDEX_SCHEMA_VERSION));
});

// ---------------------------------------------------------------------------
// The CI gate.
// ---------------------------------------------------------------------------

/**
 * Serve `checkSnapshots` synthetic files instead of the repo's.
 *
 * `fs` is mocked via a plain `require('node:fs')` for the reason
 * `fetcher.test.ts` documents: a TypeScript namespace import compiles to a
 * getter-only property `t.mock.method` cannot replace, while both modules'
 * getters read through to this same module object at call time.
 */
function withFiles(t: TestContext, files: Record<string, string | Error>): void {
  const realReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', ((file: unknown, ...rest: unknown[]) => {
    const content = typeof file === 'string' ? files[path.basename(file)] : undefined;
    if (content === undefined) return (realReadFileSync as (...args: unknown[]) => unknown)(file, ...rest);
    if (content instanceof Error) throw content;
    return content;
  }) as typeof fs.readFileSync);
}

const DATA_DIR = path.join(REPO_ROOT, 'data');
const goodDays = JSON.stringify({ schemaVersion: DAYS_SCHEMA_VERSION, days: {} });
const goodIndex = JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION, products: [] });

test('checkSnapshots passes when both snapshots are the expected versions', (t: TestContext) => {
  withFiles(t, { 'days.json': goodDays, 'index.json': goodIndex });
  assert.doesNotThrow(() => checkSnapshots(DATA_DIR));
});

test('checkSnapshots fails on a days.json of any other version', (t: TestContext) => {
  for (const [why, value] of rejectedVersions(DAYS_SCHEMA_VERSION)) {
    withFiles(t, {
      'days.json': JSON.stringify({ schemaVersion: value, days: {} }),
      'index.json': goodIndex,
    });
    assert.throws(
      () => checkSnapshots(DATA_DIR),
      /days\.json/,
      `the gate must fail on a snapshot with ${why}`,
    );
    t.mock.restoreAll();
  }
});

test('checkSnapshots fails on an index.json of any other version', (t: TestContext) => {
  for (const [why, value] of rejectedVersions(INDEX_SCHEMA_VERSION)) {
    withFiles(t, {
      'days.json': goodDays,
      'index.json': JSON.stringify({ schemaVersion: value, products: [] }),
    });
    assert.throws(
      () => checkSnapshots(DATA_DIR),
      /index\.json/,
      `the gate must fail on an index with ${why}`,
    );
    t.mock.restoreAll();
  }
});

test('a snapshot that will not read or will not parse fails the gate too', (t: TestContext) => {
  withFiles(t, { 'days.json': new Error('ENOENT'), 'index.json': goodIndex });
  assert.throws(() => checkSnapshots(DATA_DIR), /days\.json/, 'an unreadable snapshot is not a pass');
  t.mock.restoreAll();

  withFiles(t, { 'days.json': '{ truncated', 'index.json': goodIndex });
  assert.throws(() => checkSnapshots(DATA_DIR), /days\.json/, 'an unparseable snapshot is not a pass');
});

test('the committed snapshots are the versions this code reads', () => {
  // The gate as CI runs it, against the real files. This is the assertion that
  // would have caught Story 1.5's grid still stamped `1`.
  assert.doesNotThrow(() => checkSnapshots(DATA_DIR));
});

test('the committed days.json really has the shape its version claims', () => {
  // Story 1.6 bumped this file's number by hand and changed nothing else in
  // it. Every other assertion here would pass just as happily on the opposite
  // mistake — a snapshot still in v1's shape with v1's number edited away —
  // and that is the mistake with no other alarm: the gate goes green, the page
  // accepts the file, and every day draws as sold out. So the one thing the
  // number stands for is checked against the file itself.
  //
  // Not the field-by-field runtime validator AD-14a proposes: this never runs
  // outside the test suite, and it reads exactly the property v2 is named for.
  const snapshot = JSON.parse(readFileSync(path.join(DATA_DIR, 'days.json'), 'utf8')) as {
    days: Record<string, { products?: Array<Record<string, unknown>> }>;
  };
  const dates = Object.keys(snapshot.days);
  assert.ok(dates.length > 0, 'the committed days.json holds no days at all');
  for (const date of dates) {
    const cells = snapshot.days[date].products ?? [];
    assert.ok(
      cells.length > 0,
      `${date} carries no cells — v2 is the full (date x pass) grid, not v1's buyable rows`,
    );
    for (const cell of cells) {
      assert.ok(
        'status' in cell,
        `${date} carries a cell with no status — that is v1's shape wearing v2's number`,
      );
    }
  }
});

/** A throwaway `data/` holding the two snapshots, at whatever versions are asked for. */
function fixtureDir(t: TestContext, days: unknown, index: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usj-schema-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'days.json'), JSON.stringify({ schemaVersion: days, days: {} }));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ schemaVersion: index, products: [] }));
  return dir;
}

/**
 * The gate the way CI invokes it: a process, an exit status, a stderr.
 *
 * `dataDir` omitted means no argv entry at all, which is exactly how the
 * `schema:check` script runs — the branch that resolves `data/` from ROOT.
 */
function runGate(dataDir?: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      'ts-node/register',
      path.join(__dirname, 'schema-check.ts'),
      ...(dataDir === undefined ? [] : [dataDir]),
    ],
    // `node:test` has no default timeout, so a gate that hangs would hang the
    // whole suite with no output rather than failing.
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 },
  );
  assert.equal(result.error, undefined, `could not run the gate: ${result.error?.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('the gate exits non-zero and names the file on stderr when a snapshot is stale', (t: TestContext) => {
  // Run as a real process, because the thing the CI step depends on is the
  // exit status, and no in-process call of `checkSnapshots` can observe it:
  // deleting `process.exitCode = 1` from main() leaves every other test here
  // green while turning the gate into a no-op that prints and passes.
  const gate = runGate(fixtureDir(t, DAYS_SCHEMA_VERSION - 1, INDEX_SCHEMA_VERSION));
  // `status === 1`, not merely non-zero: a crashed or uncompilable gate also
  // exits non-zero, so "not 0" would keep this test green on a gate that never
  // ran its check at all.
  assert.equal(gate.status, 1, `the gate did not fail the way main() fails. stderr: ${gate.stderr}`);
  // The whole message, not a loose pattern: the file that is wrong, the version
  // found and the version expected are each what a reader needs, and a pattern
  // like /1.*2/ is satisfied by almost any stack trace.
  assert.equal(
    gate.stderr.trim(),
    `days.json schemaVersion is ${DAYS_SCHEMA_VERSION - 1}, expected ${DAYS_SCHEMA_VERSION}`,
    'stderr must name the file, the version found and the version expected — "wrong version" alone does not say what to do',
  );
});

test('the gate exits non-zero when index.json is the file that is wrong', (t: TestContext) => {
  const gate = runGate(fixtureDir(t, DAYS_SCHEMA_VERSION, INDEX_SCHEMA_VERSION + 1));
  assert.equal(gate.status, 1, `the gate did not fail the way main() fails. stderr: ${gate.stderr}`);
  assert.equal(
    gate.stderr.trim(),
    `index.json schemaVersion is ${INDEX_SCHEMA_VERSION + 1}, expected ${INDEX_SCHEMA_VERSION}`,
    'stderr must name index.json, not days.json',
  );
});

test('the gate exits 0 and stays quiet when both snapshots are current', (t: TestContext) => {
  const gate = runGate(fixtureDir(t, DAYS_SCHEMA_VERSION, INDEX_SCHEMA_VERSION));
  assert.equal(gate.status, 0, `the gate failed on good snapshots. stderr: ${gate.stderr}`);
  assert.equal(gate.stderr, '', 'a gate that prints when nothing is wrong trains people to skim past it');
  assert.equal(gate.stdout, '', 'likewise on stdout');
});

test('the gate checks this repo\'s own data/ when run with no argument', () => {
  // The invocation the acceptance criterion names is `npm run schema:check`,
  // which passes nothing: the directory comes from `argv[0] || ROOT/data`.
  // Every other test here hands the gate an explicit fixture, so that default
  // — the only path CI ever takes — was the one line no test executed.
  const gate = runGate();
  assert.equal(
    gate.status,
    0,
    `npm run schema:check does not pass on the committed snapshots. stderr: ${gate.stderr}`,
  );
  assert.equal(gate.stderr, '', 'the CI invocation must stay quiet when nothing is wrong');
  assert.equal(gate.stdout, '', 'likewise on stdout');
});

// ---------------------------------------------------------------------------
// The page.
// ---------------------------------------------------------------------------

/**
 * Lift one `function name(...) {...}` out of index.html by brace matching —
 * the same technique, and the same caveat, as `day-view.test.ts`: brace
 * counting would be fooled by a brace inside a string, so the guards are
 * written without one and the assertions below run what comes back.
 */
function sliceFunction(name: string): string {
  const at = HTML.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `index.html no longer defines function ${name}() — the schema guard was removed`);
  // `async` is part of the declaration: slicing from `function` alone yields a
  // body full of `await` that will not parse when the tests below run it.
  const start = HTML.slice(at - 6, at) === 'async ' ? at - 6 : at;
  const open = HTML.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces while extracting ${name}() from index.html`);
}

/**
 * The same, for a function whose body is about to be *run*: the `return` check
 * is the cheap proof that brace matching found the real end rather than an
 * early one, and it only applies to the guards, which all return their input.
 */
function extractFunction(name: string): string {
  const src = sliceFunction(name);
  assert.ok(src.includes('return'), `extracted ${name}() has no return — extraction went wrong`);
  return src;
}

/** The page's own `const NAME = <number>;`, as source and as a value. */
function extractConst(name: string): { src: string; value: number } {
  const decl = new RegExp(`const ${name}\\s*=\\s*(\\d+);`).exec(HTML);
  assert.ok(
    decl,
    `index.html must declare ${name} as its own numeric literal — a value copied from elsewhere, or derived from the other version, is what drifts`,
  );
  return { src: decl[0], value: Number(decl[1]) };
}

const pageDays = extractConst('DAYS_SCHEMA_VERSION');
const pageIndex = extractConst('INDEX_SCHEMA_VERSION');

const page = vm.runInNewContext(
  [
    pageDays.src,
    pageIndex.src,
    extractFunction('assertCalendarSchema'),
    extractFunction('assertIndexSchema'),
    '({ assertCalendarSchema, assertIndexSchema })',
  ].join('\n'),
) as {
  assertCalendarSchema: (doc: unknown) => unknown;
  assertIndexSchema: (doc: unknown) => unknown;
};

test('index.html carries the same two versions as src/schema.ts', () => {
  // index.html has no build step, so it cannot import the registry; this is
  // what keeps the copy honest until Epic 2's SSG can bake it in.
  assert.equal(
    pageDays.value,
    DAYS_SCHEMA_VERSION,
    'index.html reads a different days.json version than src/schema.ts writes — update both',
  );
  assert.equal(
    pageIndex.value,
    INDEX_SCHEMA_VERSION,
    'index.html reads a different index.json version than src/schema.ts writes — update both',
  );
});

test('the page refuses any days.json but its own version', () => {
  assert.doesNotThrow(() => page.assertCalendarSchema({ schemaVersion: DAYS_SCHEMA_VERSION, days: {} }));
  for (const [why, value] of rejectedVersions(DAYS_SCHEMA_VERSION)) {
    assert.throws(
      () => page.assertCalendarSchema({ schemaVersion: value, days: {} }),
      /days\.json/,
      `the page must refuse to render a calendar with ${why}`,
    );
  }
  assert.throws(() => page.assertCalendarSchema(null), /days\.json/, 'a null document is not a version');
});

test('the page refuses any index.json but its own version', () => {
  assert.doesNotThrow(() => page.assertIndexSchema({ schemaVersion: INDEX_SCHEMA_VERSION, products: [] }));
  for (const [why, value] of rejectedVersions(INDEX_SCHEMA_VERSION)) {
    assert.throws(
      () => page.assertIndexSchema({ schemaVersion: value, products: [] }),
      /index\.json/,
      `the page must refuse to render a catalog with ${why}`,
    );
  }
  assert.throws(() => page.assertIndexSchema(null), /index\.json/, 'a null document is not a version');
});

test('the page\'s two guards say nothing about each other\'s file', () => {
  // The registry has this check; the page needs it more. Its two numbers are
  // hand-copied literals sitting four lines apart, so crossing them — or
  // pointing both guards at one constant — is the drift this catches, and the
  // version-equality test above cannot: it passes whenever both numbers are
  // right, however they are wired.
  const days: number = pageDays.value;
  const index: number = pageIndex.value;
  if (days !== index) {
    assert.throws(
      () => page.assertCalendarSchema({ schemaVersion: index, days: {} }),
      /days\.json/,
      'the page accepted a days.json carrying the index version',
    );
    assert.throws(
      () => page.assertIndexSchema({ schemaVersion: days, products: [] }),
      /index\.json/,
      'the page accepted an index.json carrying the days version',
    );
  }
});

/**
 * Run the page's real call sites, not just look at them.
 *
 * The ordering test below reads source text, which is enough to catch a guard
 * that moves but not one that is neutered: wrapping `assertCalendarSchema(doc)`
 * in a swallowing try/catch leaves the call where it is, keeps every text
 * assertion green, and puts the un-checked snapshot straight back into
 * `calendar`. So `loadCalendar` and `boot` are lifted out whole and executed
 * against a stub `fetch`, and what gets asserted is the consequence: nothing
 * cached, nothing rendered.
 *
 * The stubs are the page's own collaborators — `catalog`, `render`, `document`,
 * the locale helpers — supplied as context globals so the sliced source runs
 * unmodified.
 */
function runPage(
  daysDoc: unknown,
  indexDoc: unknown,
  // Lets a caller simulate the index.json request itself failing (a 404, a
  // 500) rather than resolving with a document the schema guard rejects.
  // days.json keeps its always-ok default — nothing here needed it yet.
  indexResponse: { ok?: boolean; status?: number } = {},
) {
  let renderCalls = 0;
  let dayRenders = 0;
  // Keyed by id, not one shared object: boot()'s catch writes #root while
  // setView() and showProductError() write #product-root. Sharing one element
  // lets a message land in the wrong host and still satisfy the assertions
  // below — including the two that check an error box stayed empty.
  const els: Record<string, { innerHTML: string; hidden?: boolean }> = {};
  const el = (id: string) => (els[id] ??= { innerHTML: '' });
  const ctx: Record<string, unknown> = {
    calendar: null,
    catalog: { updatedAt: '2026-08-22T00:00:00.000Z' },
    fetch: async (url: unknown) => {
      const isDays = String(url).includes('days.json');
      return {
        ok: isDays ? true : (indexResponse.ok ?? true),
        status: isDays ? 200 : (indexResponse.status ?? 200),
        json: async () => (isDays ? daysDoc : indexDoc),
      };
    },
    render: () => { renderCalls++; },
    // The day-first view's own painter, stubbed: what this file asks about is
    // whether setView() reaches it at all on a snapshot the page refused.
    renderDay: () => { dayRenders++; },
    selectProduct: async () => {},
    view: 'product',
    writePref: () => {},
    applyLocaleChrome: () => {},
    loadTerms: async () => {},
    esc: (s: unknown) => String(s),
    t: (key: unknown, message: unknown) => `${String(key)}: ${String(message)}`,
    document: {
      getElementById: (id: string) => el(id),
      querySelectorAll: () => [] as unknown[],
    },
  };
  vm.createContext(ctx);
  const api = vm.runInContext(
    [
      pageDays.src,
      pageIndex.src,
      extractFunction('assertCalendarSchema'),
      extractFunction('assertIndexSchema'),
      sliceFunction('loadCalendar'),
      sliceFunction('boot'),
      sliceFunction('showProductError'),
      sliceFunction('setView'),
      '({ loadCalendar, boot, setView })',
    ].join('\n'),
    ctx,
  ) as {
    loadCalendar: () => Promise<unknown>;
    boot: () => Promise<void>;
    setView: (next: string, code?: string) => Promise<void>;
  };

  return {
    loadCalendar: api.loadCalendar,
    boot: api.boot,
    setView: api.setView,
    cached: () => ctx.calendar,
    renderCalls: () => renderCalls,
    dayRenders: () => dayRenders,
    /** What the page put in one named host — '' if it never touched it. */
    html: (id: string) => els[id]?.innerHTML ?? '',
  };
}

test('loadCalendar() rejects a stale snapshot instead of caching it', async () => {
  const page = runPage({ schemaVersion: DAYS_SCHEMA_VERSION - 1, days: {} }, null);
  await assert.rejects(
    () => page.loadCalendar(),
    /days\.json/,
    'loadCalendar() accepted a snapshot from the previous schema',
  );
  assert.equal(
    page.cached(),
    null,
    'the rejected snapshot was still cached in `calendar` — the next view renders it with no fetch and no second chance to check',
  );
});

test('loadCalendar() caches and returns a snapshot of the current version, unchanged', async () => {
  // The no-visible-change half of the story: on a good snapshot the guard is
  // invisible and the function behaves exactly as it did before.
  const doc = { schemaVersion: DAYS_SCHEMA_VERSION, days: { '2026-09-01': { dayOfWeek: 2, products: [] } } };
  const page = runPage(doc, null);
  const returned = await page.loadCalendar();
  assert.deepEqual(returned, doc, 'loadCalendar() must return the snapshot it fetched');
  assert.deepEqual(page.cached(), doc, 'a good snapshot must still be cached');
});

test('the day view draws nothing and shows the error box on a stale days.json', async () => {
  // loadCalendar() rejecting is the mechanism; this is the outcome the story
  // actually promises — an error box, and not one cell drawn. That outcome
  // belongs to setView(), which loadCalendar()'s own tests never reach: a
  // caller that swallowed the rejection, or painted the day before awaiting,
  // would leave every other test in this file green while putting the page
  // back where Story 1.5 left it.
  const page = runPage({ schemaVersion: DAYS_SCHEMA_VERSION - 1, days: {} }, null);
  await page.setView('date');
  assert.equal(
    page.dayRenders(),
    0,
    'the day view was drawn from a snapshot the page had already refused',
  );
  assert.match(
    page.html('product-root'),
    /days\.json/,
    'the failure must surface in the day view\'s own host, naming the file',
  );
});

test('the day view draws normally on a days.json of the current version', async () => {
  const page = runPage(
    { schemaVersion: DAYS_SCHEMA_VERSION, days: { '2026-09-01': { dayOfWeek: 2, products: [] } } },
    null,
  );
  await page.setView('date');
  assert.equal(page.dayRenders(), 1, 'a good snapshot must still reach the day view exactly once');
  // Not `doesNotMatch(/days\.json/)`: on the good path this host holds the
  // loading placeholder, which satisfies that pattern no matter what went
  // wrong. The error box either rendered or it did not.
  assert.doesNotMatch(page.html('product-root'), /error-box/, 'a good snapshot must not raise the error box');
});

test('boot() renders nothing when index.json is a version this page does not read', async () => {
  const page = runPage(null, { schemaVersion: INDEX_SCHEMA_VERSION + 1, products: [] });
  await page.boot();
  assert.equal(
    page.renderCalls(),
    0,
    'boot() rendered a catalog it could not vouch for — the error box would appear over a page already drawn from bad data',
  );
  assert.match(page.html('root'), /index\.json/, 'the failure must surface in boot()\'s own host, naming the file');
});

test('boot() renders normally when index.json is the version this page reads', async () => {
  const page = runPage(null, { schemaVersion: INDEX_SCHEMA_VERSION, products: [] });
  await page.boot();
  assert.equal(page.renderCalls(), 1, 'a good index must still render exactly once');
  assert.equal(page.html('root'), '', 'a good index must not put anything in the error box');
});

test('boot() renders nothing when the index.json fetch itself fails', async () => {
  // The schema guard is only reached once a response comes back at all — this
  // is the `if (!res.ok) throw ...` guard in front of it, for a 404/500 with
  // no body worth parsing as a snapshot.
  const page = runPage(null, null, { ok: false, status: 404 });
  await page.boot();
  assert.equal(
    page.renderCalls(),
    0,
    'boot() rendered even though the index.json request itself failed',
  );
  assert.match(page.html('root'), /HTTP 404/, "the failure must surface in boot()'s own host, naming the HTTP status");
});

test('the guards run before the page keeps or draws anything', () => {
  // Order is the whole point: a rejected snapshot must not be cached in
  // `calendar` or handed to `render()`, or the error box appears over a page
  // that already drew the bad data.
  const loadCalendar = sliceFunction('loadCalendar');
  const guard = loadCalendar.indexOf('assertCalendarSchema(');
  const assign = loadCalendar.indexOf('calendar = ');
  assert.notEqual(guard, -1, 'loadCalendar() no longer checks the snapshot version');
  assert.ok(guard < assign, 'loadCalendar() caches the snapshot before checking its version');

  const boot = sliceFunction('boot');
  const indexGuard = boot.indexOf('assertIndexSchema(');
  const render = boot.indexOf('render(');
  assert.notEqual(indexGuard, -1, 'boot() no longer checks the index version');
  assert.ok(indexGuard < render, 'boot() renders the catalog before checking its version');
});

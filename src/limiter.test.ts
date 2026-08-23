/**
 * Story 1.4: the retry/backoff behaviour `limitedFetch` (src/limiter.ts) owes
 * the rest of the fetcher.
 *
 * Three invariants are locked here. First, the widening retry delay itself —
 * `RETRY_DELAYS_MS` is private, so this asserts the literal sequence
 * [1000, 2000, 4000] rather than importing it, which is the point: a future
 * edit that quietly flattens it to a fixed delay fails this test instead of
 * only showing up as a subtler change in production request timing.
 * Second, that retries exhausted while still 429/5xx throw `BlockedError`
 * rather than handing the blocked `Response` back to the caller, which is the
 * signal `usj.ts` and `fetcher.ts` rely on to stop a round instead of
 * grinding through it (AD-16 #1). Third, that the blocked response's body
 * survives as a bounded single-line snippet on that error — see the block of
 * tests at the bottom for why a status code alone is not enough to act on.
 *
 * `fetch` and the timer/Date pair are both mocked so a full exhausted-retry
 * run (1000 + 2000 + 4000 ms of real delay) costs nothing. `Date` is mocked
 * alongside `setTimeout` — `tick()` advances both together — so the rate gate
 * inside `limitedFetch` (which reads `Date.now()` directly, independent of
 * the mocked backoff `sleep()`) does not itself inject an unaccounted-for
 * wait between attempts. Each test picks a `now` far past any previous
 * test's ending point, since `nextSlotAt` is module-level state that
 * survives between tests in this file.
 *
 * What the delay test measures is the gap between request *starts*, which is
 * `max(backoff, rate-gate slot)` rather than the backoff alone. At the current
 * ceilings the gate's 1000ms floor is under every delay in the sequence, so the
 * gaps are the delays; a flattened sequence still fails the assertion, since a
 * flat delay reads as flat gaps whichever of the two dominates.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BLOCKED_BODY_SNIPPET_MAX, BlockedError, limitedFetch } from './limiter';
import { flush, settle, track } from './test-support';

/** Not named `URL`: that shadows the global constructor for the whole file. */
const TEST_URL = 'https://example.test/resource';

const response = (status: number, body = ''): Response => new Response(body, { status });

/** Let pending microtasks run, then fire whatever mocked timer is now due. */
async function advance(t: TestContext, ms: number): Promise<void> {
  await flush();
  t.mock.timers.tick(ms);
}

test('a 429 followed by a 200 succeeds after the first retry delay', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response(calls === 1 ? 429 : 200);
  });

  const promise = limitedFetch(TEST_URL);
  await advance(t, 1000);
  const res = await promise;

  assert.equal(res.status, 200);
  assert.equal(calls, 2, 'expected exactly one retry (2 fetch calls)');
});

test('retries exhausted while still 429/5xx reject with BlockedError, delays widening 1000/2000/4000', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });
  const callTimes: number[] = [];
  t.mock.method(globalThis, 'fetch', async () => {
    callTimes.push(Date.now());
    return response(500); // 5xx, per the I/O matrix's "429（或 5xx）"
  });

  // Tracked at creation rather than awaited at the end: the ticks below span
  // several macrotasks, and a rejection left unwatched across them is reported
  // as an unhandledRejection before the assertion ever runs.
  const settlement = track(limitedFetch(TEST_URL));
  await advance(t, 1000);
  await advance(t, 2000);
  await advance(t, 4000);
  await flush();

  const outcome = settlement.outcome;
  assert.equal(outcome?.status, 'rejected', 'a persistent block must reject, not hand back the response');
  const err = outcome?.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(err instanceof BlockedError, `expected a BlockedError, got ${err}`);
  assert.equal(err.url, TEST_URL);
  assert.equal(err.status, 500);

  assert.equal(callTimes.length, 4, 'expected 1 original request + 3 retries');
  const delays = [1, 2, 3].map(i => callTimes[i] - callTimes[i - 1]);
  assert.deepEqual(
    delays,
    [1000, 2000, 4000],
    'retry delays must widen in the fixed RETRY_DELAYS_MS sequence, not a flat delay',
  );
});

test('a non-retryable status (404) is returned immediately, untouched', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 3_000_000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response(404);
  });

  const res = await limitedFetch(TEST_URL);

  assert.equal(res.status, 404);
  assert.equal(calls, 1, '404 must not be retried');
});

test('BlockedError carries the url and status that caused it, and is instanceof Error', () => {
  const err = new BlockedError(TEST_URL, 503);
  assert.ok(err instanceof BlockedError);
  assert.ok(err instanceof Error);
  assert.equal(err.url, TEST_URL);
  assert.equal(err.status, 503);
});

/**
 * The diagnostic snippet. A blocked round's log used to carry the status and
 * nothing else, which cannot tell "the store is briefly unwell" apart from "a
 * WAF is serving us a captcha page" — and the body that would have said so was
 * already being read to drain the socket, then dropped.
 *
 * The snippet is store-controlled text on its way to a public CI log, so the
 * normalization is a containment boundary as much as a formatting one: single
 * line, printable, and bounded. The first case
 * runs the real exhausted-retry path, since what it locks is the wiring — that
 * the body read at the throw site actually reaches the error. The rest
 * construct the error directly, because normalization is an invariant of the
 * constructor rather than of the retry loop, and a unit call states that
 * without paying for four mocked round trips to assert a `slice()`.
 */
test('an exhausted retry carries the blocked response body through to the error', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
  t.mock.method(globalThis, 'fetch', async () => response(503, 'blocked by WAF'));

  const outcome = await settle(t, limitedFetch(TEST_URL));

  const err = outcome.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(err instanceof BlockedError, `expected a BlockedError, got ${err}`);
  assert.equal(err.body, 'blocked by WAF', 'the body read at the throw site must not be dropped');
  assert.ok(
    err.message.includes('blocked by WAF'),
    `the snippet must reach the message an operator reads, got: ${err.message}`,
  );
  assert.equal(err.status, 503, 'carrying a body must not disturb the fields already there');
  assert.equal(err.url, TEST_URL);
});

test('a body longer than the cap is truncated to exactly BLOCKED_BODY_SNIPPET_MAX', () => {
  const err = new BlockedError(TEST_URL, 503, 'x'.repeat(500));

  assert.equal(err.body?.length, BLOCKED_BODY_SNIPPET_MAX);
  assert.equal(err.body, 'x'.repeat(BLOCKED_BODY_SNIPPET_MAX), 'the snippet is a prefix, not a sample');
});

/**
 * The scan window is a memory bound, not part of the retained-content contract:
 * a multi-megabyte error page must not be normalized in full to keep 200
 * characters. What it costs is content that only appears past the window, which
 * this pins by putting the second word out of reach.
 */
test('only a bounded prefix of the raw body is examined, however long the body is', () => {
  const err = new BlockedError(TEST_URL, 503, `denied${' '.repeat(50_000)}tail`);

  assert.equal(err.body, 'denied');
});

test('a multi-line body is collapsed to a single line so the log stays one line', () => {
  const err = new BlockedError(TEST_URL, 429, '  <html>\n  <body>\n\tAccess denied  \n</body>\n');

  assert.equal(err.body, '<html> <body> Access denied </body>');
  assert.ok(!err.message.includes('\n'), `the message must stay on one line, got: ${JSON.stringify(err.message)}`);
});

/**
 * The store chooses this text and this code prints it into a public Actions
 * log. `\s` does not cover ESC, so a body left merely whitespace-collapsed
 * could repaint or reposition an operator's terminal.
 */
test('control characters are stripped rather than merely collapsed, so no escape sequence survives', () => {
  const err = new BlockedError(TEST_URL, 503, 'be\x1b[31mfore\x00mid\x07dle\x7fafter\x0bend');

  assert.equal(err.body, 'be [31mfore mid dle after end');
  assert.ok(
    !/[\x00-\x1f\x7f]/.test(err.message),
    `no control character may reach the message, got: ${JSON.stringify(err.message)}`,
  );
});

/**
 * `slice()` counts UTF-16 code units, so a cut one unit into an astral
 * character leaves a lone high surrogate — which renders as a replacement
 * character and does not survive the `JSON.stringify` these very tests use to
 * report failures.
 */
test('a cut landing inside a surrogate pair drops the stranded half instead of emitting it', () => {
  // One code unit of padding puts the boundary between the two halves of the
  // emoji, which is the only place the bug can show.
  const err = new BlockedError(TEST_URL, 503, 'z'.repeat(BLOCKED_BODY_SNIPPET_MAX - 1) + '🚫'.repeat(20));

  const snippet = err.body ?? '';
  assert.equal(snippet, 'z'.repeat(BLOCKED_BODY_SNIPPET_MAX - 1), 'the split character is dropped whole');
  assert.ok(
    ![...snippet].some(ch => {
      const code = ch.charCodeAt(0);
      return code >= 0xd800 && code <= 0xdfff;
    }),
    `no lone surrogate may survive, got: ${JSON.stringify(snippet)}`,
  );
});

test('an absent or empty body leaves the error at its bodyless message, with no dangling suffix', () => {
  const bodyless = new BlockedError(TEST_URL, 503).message;

  for (const [label, err] of [
    ['omitted', new BlockedError(TEST_URL, 503)],
    ['undefined', new BlockedError(TEST_URL, 503, undefined)],
    ['empty', new BlockedError(TEST_URL, 503, '')],
    ['whitespace only', new BlockedError(TEST_URL, 503, ' \n\t ')],
    ['control characters only', new BlockedError(TEST_URL, 503, '\x00\x1b\x7f')],
  ] as const) {
    assert.equal(err.body, undefined, `a ${label} body must read as no body at all`);
    assert.equal(err.message, bodyless, `a ${label} body must not append a dangling ": " to the message`);
    assert.ok(!err.message.endsWith(':'), `a ${label} body must not leave a trailing colon`);
  }
});

test('a body that cannot be read leaves the BlockedError otherwise unchanged', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 6_000_000 });
  t.mock.method(globalThis, 'fetch', async () => {
    const res = response(500);
    // A body that rejects on read — a connection dropped mid-response. The
    // snippet is a nicety; losing it must not cost the block signal itself.
    Object.defineProperty(res, 'text', {
      value: async () => { throw new Error('body stream broke'); },
    });
    return res;
  });

  const outcome = await settle(t, limitedFetch(TEST_URL));

  const err = outcome.status === 'rejected' ? outcome.reason : undefined;
  assert.ok(err instanceof BlockedError, `an unreadable body must not change what is thrown, got ${err}`);
  assert.equal(err.body, undefined);
  assert.equal(err.message, new BlockedError(TEST_URL, 500).message);
});

/**
 * DW-32: the architecture decision is "every outbound request goes through
 * `limitedFetch`, no bare `fetch(` anywhere else" — `limitedFetch` itself
 * (`src/limiter.ts:189`) is the one exception, since it *is* the gate.
 * Nothing enforced that until now: a bare `fetch(url)` added to any other
 * file would pass every existing test in this repo.
 *
 * This is deliberately a coarser scan than `usj.test.ts`'s comment/string-
 * stripping wiring check — it does not distinguish code from comments or
 * string literals. That is an accepted trade-off (see the spec's Design
 * Notes): a `fetch(` mentioned in a comment would false-positive here. The
 * scan only recognizes `fetch(` written as a direct identifier call (or as
 * `<alias>.fetch(` for the four known global aliases below) — it is not
 * proof against deliberate indirection such as `const f = fetch; f(url)`,
 * which the "no bare fetch(" architecture rule does not otherwise guard
 * against either. In particular, a `.` immediately before `fetch(` is only
 * excluded when the identifier before that `.` is *not* one of
 * `globalThis`/`global`/`self`/`window` — those four all resolve to the same
 * global `fetch` the architecture forbids calling directly, so
 * `globalThis.fetch(` etc. are still flagged as offenders; a real method call
 * like `client.fetch(` keeps being excluded.
 */
const REPO_ROOT_FOR_SCAN = join(__dirname, '..');
const SRC_DIR_FOR_SCAN = join(REPO_ROOT_FOR_SCAN, 'src');

/** Every `.ts` file under `dir`, recursively, as absolute paths. */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

/**
 * `src/**\/*.ts`, repo-relative, minus `*.test.ts`, `test-support.ts`, and
 * `limiter.ts` itself — the files DW-32's bare-fetch scan does not cover.
 */
function filesToScanForBareFetch(): string[] {
  return collectTsFiles(SRC_DIR_FOR_SCAN)
    .map(f => relative(REPO_ROOT_FOR_SCAN, f).split('\\').join('/'))
    .filter(rel => {
      const base = rel.split('/').pop() ?? rel;
      if (base.endsWith('.test.ts')) return false;
      if (base === 'test-support.ts') return false;
      if (rel === 'src/limiter.ts') return false;
      return true;
    });
}

/**
 * Identifiers that all resolve to the same global `fetch` the architecture
 * forbids calling directly — so `<one of these>.fetch(` is just as much a
 * bare call as `fetch(` on its own, and must not be excluded the way a real
 * method call like `client.fetch(` is.
 */
const GLOBAL_FETCH_ALIASES = new Set(['globalThis', 'global', 'self', 'window']);

test('no source file outside limiter.ts calls the global fetch( directly', () => {
  const offenders: string[] = [];

  for (const rel of filesToScanForBareFetch()) {
    const source = readFileSync(join(REPO_ROOT_FOR_SCAN, rel), 'utf8');
    const lines = source.split('\n');

    lines.forEach((line, idx) => {
      let at = line.indexOf('fetch(');
      while (at !== -1) {
        const prevChar = at > 0 ? line[at - 1] : '';
        if (prevChar === '.') {
          // `x.fetch(` — ordinarily not a bare call (e.g. `client.fetch(`),
          // *unless* `x` is itself an alias for the global object, in which
          // case `x.fetch(` is exactly the forbidden global fetch in disguise.
          const before = line.slice(0, at - 1);
          const identifierMatch = before.match(/[A-Za-z0-9_$]+$/);
          const identifier = identifierMatch ? identifierMatch[0] : '';
          if (GLOBAL_FETCH_ALIASES.has(identifier)) {
            offenders.push(`${rel}:${idx + 1}`);
          }
        } else if (!/[A-Za-z0-9_$]/.test(prevChar)) {
          // A hit whose preceding character is an identifier character is
          // `limitedFetch(` or `myFetch(` — not a bare call.
          offenders.push(`${rel}:${idx + 1}`);
        }
        at = line.indexOf('fetch(', at + 1);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'found a bare fetch( outside limiter.ts\'s single allowed call site: ' +
      `${offenders.join(', ')} -- every outbound request must go through limitedFetch, the ` +
      'single gate the architecture requires',
  );
});

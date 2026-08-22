/**
 * NFR7 as a regression: the outbound request headers must not leak this
 * site's own identity back to the store. `HEADERS` (src/sources/usj.ts) is
 * the single object shared by all four `limitedFetch` call sites, so locking
 * it here locks every call site at once.
 *
 * That last sentence is a claim about two separate things, and this file now
 * holds both ends of it:
 *
 *   1. *What the headers contain* — the forbidden-name and User-Agent checks
 *      below, plus the immutability check that keeps the shared object from
 *      being edited in place by any one call site.
 *   2. *That the four call sites are actually wired to it* — the source-text
 *      check below reads src/sources/usj.ts back and asserts there are exactly
 *      four call sites and each passes `HEADERS` through verbatim. Without it
 *      the "locks every call site at once" claim was a comment, verified by
 *      eye, and a fifth call site or a `{ ...HEADERS }` would slip past.
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
import { existsSync, readFileSync } from 'node:fs';
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

test('HEADERS is frozen, so no call site can mutate the set the others share', () => {
  assert.ok(
    Object.isFrozen(HEADERS),
    'HEADERS is not frozen; the four limitedFetch call sites share one ' +
      'reference, so an in-place edit at any one of them would silently ' +
      'change the headers the other three send (NFR7)',
  );

  // The readonly types make a direct write through the imported binding a
  // compile error already, and the casts are what let the test reach past that
  // to the *runtime* guarantee underneath. That guarantee is the load-bearing
  // one: TypeScript ignores `readonly` when checking assignability, so
  // `const h: Record<string, string> = HEADERS` typechecks and so does every
  // write through `h`. Only the freeze survives that, and only here is it
  // checked.
  //
  // That a write *throws* rather than silently no-ops is a strict-mode
  // property, and each `'use strict'` below states that mode locally instead of
  // borrowing it from whatever compiled the file. Without the directive these
  // assertions would only hold as long as every runner emits strict modules —
  // and under one that did not, a perfectly frozen HEADERS would report as an
  // absent freeze, which is the wrong diagnosis of a real property. The
  // directive costs a line and makes the throw the test's own guarantee.
  const mutable = HEADERS as unknown as Record<string, string>;
  const before = JSON.stringify(HEADERS);

  assert.throws(
    () => {
      'use strict';
      mutable['Accept-Language'] = 'en-US';
    },
    TypeError,
    'overwriting an existing HEADERS key did not throw; the freeze is not in effect',
  );
  assert.throws(
    () => {
      'use strict';
      mutable['User-Agent'] = 'usj-availability-bot';
    },
    TypeError,
    'adding a new HEADERS key did not throw; the freeze is not in effect',
  );
  assert.throws(
    () => {
      'use strict';
      delete mutable['Accept-Language'];
    },
    TypeError,
    'deleting a HEADERS key did not throw; the freeze is not in effect — and a ' +
      'header dropped at one call site is the likeliest in-place edit of all',
  );

  assert.equal(
    JSON.stringify(HEADERS),
    before,
    'HEADERS changed despite the writes throwing',
  );
});

/**
 * The file the wiring check reads, repo-relative — one literal, because the
 * path is used to open the file *and* to name it in every failure message, and
 * those must not be able to drift apart.
 */
const SOURCE_PATH = 'src/sources/usj.ts';

/**
 * How many `limitedFetch` call sites `SOURCE_PATH` has. Asserted as an equality
 * rather than a ceiling: a fifth call site and a deleted fourth both change
 * what leaves this process, and both deserve a look before they land.
 */
const EXPECTED_CALL_SITES = 4;

/**
 * `source` with the *contents* of every comment, string literal and template
 * literal replaced by spaces — same length, same newlines, every other
 * character still at its original index.
 *
 * Both properties this scan needs come from that rule. Indices into the result
 * address the same characters in the original, so the line numbers reported
 * below stay true; and nothing written inside a comment or a string can be read
 * as code. That second half is not cosmetic: a `)` inside a string literal
 * (`body: JSON.stringify({ q: 'a)b' })`) would otherwise close a call early and
 * hand back *truncated* arguments — a confidently wrong answer rather than a
 * loud one — and a `limitedFetch(` or a `headers: HEADERS` written in a doc
 * comment would be counted as the real thing.
 *
 * Interpolations inside template literals are treated as code again, so a call
 * written inside `${...}` is still seen.
 *
 * Regex literals are not modelled. `SOURCE_PATH` has one today
 * (`/_\d{6,}(_\d{6,})*$/`); its parens and braces are balanced and it holds no
 * quote or comment marker, so reading it as ordinary code changes nothing. A
 * regex carrying an unbalanced paren, a stray quote, or an escaped `//` (as in
 * `/https:\/\//`, where the trailing pair reads as the start of a line comment)
 * would confuse the scan. Every such shape fails loudly rather than quietly:
 * unbalanced constructs trip one of the assertions here or the missing-paren
 * assertion below, and a blanked-out region loses a call site, which the count
 * assertion reports. None of them can turn an unwired call site green — but if
 * this file ever fails for a reason that is not about headers, a new regex
 * literal in `SOURCE_PATH` is the first place to look.
 */
function blankNonCode(source: string): string {
  const out = source.split('');
  const blank = (i: number) => {
    if (i < out.length && out[i] !== '\n') out[i] = ' ';
  };
  // What we are currently inside. `code` frames count their own `{` nesting so
  // a `}` can tell "end of an object literal" from "end of a `${`".
  const stack: Array<{ kind: 'code'; braces: number } | { kind: 'template' }> = [
    { kind: 'code', braces: 0 },
  ];

  let i = 0;
  while (i < source.length) {
    const top = stack[stack.length - 1];
    const c = source[i];

    if (top.kind === 'template') {
      if (c === '\\') {
        blank(i);
        blank(i + 1);
        i += 2;
      } else if (c === '`') {
        stack.pop();
        i++;
      } else if (c === '$' && source[i + 1] === '{') {
        stack.push({ kind: 'code', braces: 0 });
        i += 2;
      } else {
        blank(i);
        i++;
      }
      continue;
    }

    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        blank(i);
        i++;
      }
      continue;
    }

    if (c === '/' && source[i + 1] === '*') {
      const start = i;
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        blank(i);
        i++;
      }
      assert.ok(
        i < source.length,
        `${SOURCE_PATH} has a block comment opening at offset ${start} that is ` +
          `never closed, so this scan cannot tell comment from code`,
      );
      blank(i);
      blank(i + 1);
      i += 2;
      continue;
    }

    if (c === "'" || c === '"') {
      const start = i;
      i++; // the opening quote itself stays put
      // A quoted string cannot cross a newline unless the newline is escaped,
      // and the escape branch below steps over that pair before this condition
      // sees it. Stopping at the line end is what keeps a *stray* quote —
      // an apostrophe someone left in code rather than in prose — from pairing
      // with the next quote several lines down and blanking everything between,
      // call sites included.
      while (i < source.length && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') {
          blank(i);
          blank(i + 1);
          i += 2;
          continue;
        }
        blank(i);
        i++;
      }
      assert.ok(
        i < source.length && source[i] === c,
        `${SOURCE_PATH} has a ${c} string opening at offset ${start} that is ` +
          `never closed before the end of its line, so this scan cannot tell ` +
          `string from code`,
      );
      i++; // step past the closing quote
      continue;
    }

    if (c === '`') {
      stack.push({ kind: 'template' });
      i++;
      continue;
    }

    if (c === '{') {
      top.braces++;
      i++;
      continue;
    }

    if (c === '}') {
      if (top.braces === 0 && stack.length > 1) stack.pop();
      else top.braces--;
      i++;
      continue;
    }

    i++;
  }

  assert.equal(
    stack.length,
    1,
    `${SOURCE_PATH} ends while this scan still believes it is inside a template ` +
      `literal or an interpolation. The NFR7 wiring check below only means ` +
      `something if the file was read the way TypeScript reads it, so treat ` +
      `this as the scan needing a fix — not as a file that passed`,
  );
  return out.join('');
}

/** Index of the `)` closing the `(` at `openIndex`, or -1 if it never closes. */
function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Every `limitedFetch` call in `source`, as its 1-based line plus its argument
 * text twice over: `args` from the comment- and string-blanked copy, which is
 * what the assertions match against, and `rawArgs` from the file as written,
 * which is what a failure quotes back to whoever has to fix it.
 *
 * Paren-matched rather than pattern-matched on purpose: the four call sites are
 * not written alike (one lays its init object out over four lines, three are
 * single-line), and a regex that happens to cover today's formatting would
 * quietly stop covering a reformatted one. A global count of `headers: HEADERS`
 * would be worse still — it cannot tell four wired call sites from three wired
 * ones plus a duplicate mention.
 */
function limitedFetchCallSites(
  source: string,
): Array<{ line: number; args: string; rawArgs: string }> {
  const scannable = blankNonCode(source);
  const marker = 'limitedFetch(';
  const sites: Array<{ line: number; args: string; rawArgs: string }> = [];

  for (let at = scannable.indexOf(marker); at !== -1; at = scannable.indexOf(marker, at + 1)) {
    // `unlimitedFetch(` and `myLimitedFetch(` both end in the marker without
    // being it, and `client.limitedFetch(` / `client?.limitedFetch(` are calls
    // to somebody else's method that happens to share the name. Only a hit that
    // starts a free-standing identifier is a call to the imported function.
    if (at > 0 && /[A-Za-z0-9_$.]/.test(scannable[at - 1])) continue;

    const open = at + marker.length - 1;
    const close = matchingParen(scannable, open);
    const line = source.slice(0, at).split('\n').length;
    assert.ok(
      close !== -1,
      `the limitedFetch call at ${SOURCE_PATH}:${line} has no matching closing ` +
        `paren this scan could find; the NFR7 wiring check cannot read it, so ` +
        `fix the scan rather than leave the call site unchecked`,
    );
    sites.push({
      line,
      args: scannable.slice(open + 1, close),
      rawArgs: source.slice(open + 1, close),
    });
  }
  return sites;
}

/**
 * The one shape of `headers` entry that counts as wired: the key, then the bare
 * exported identifier, nothing built around it. Matched against `initLevelText`
 * rather than the raw arguments, so both halves of "verbatim" are checked — the
 * value is the constant itself, *and* the key sits in the init object rather
 * than somewhere nested.
 */
const VERBATIM_HEADERS = /\bheaders:\s*HEADERS\s*[,}]/;

/**
 * The characters of `args` — one call's argument text, comment- and
 * string-blanked — that sit directly inside the init object literal, with the
 * contents of everything nested inside it replaced by a space.
 *
 * Depth is the whole point, in both directions.
 *
 * Reading too deep says yes to a call that sends nothing:
 * `limitedFetch(url, { body: JSON.stringify({ headers: HEADERS }) })` contains
 * the literal text `headers: HEADERS` and has no init-level `headers` key at
 * all. Matching the raw argument text would call that wired.
 *
 * Reading too wide says no to a call that is fine: a spread *at* the init level
 * is the override this test exists to catch — `{ headers: HEADERS, ...override }`
 * reads as verbatim and still loses, because a `headers` key inside the spread
 * replaces the earlier one — but a spread nested deeper cannot reach the header
 * set. `body: JSON.stringify({ ...payload })` and `tags: [...list]` are ordinary
 * ways to build an argument, and failing them would accuse a correctly wired
 * call site of breaking NFR7 over a change that never touched a header.
 *
 * So nesting is tracked by opener, not by a single counter, and all three of
 * `{`, `[` and `(` nest: `args` starts just inside `limitedFetch(`, the init
 * object is the first `{` opened at the top of it, and the level this returns
 * is what that brace directly contains.
 */
function initLevelText(args: string): string {
  let out = '';
  const open: string[] = [];
  for (const c of args) {
    const atInitLevel = open.length === 1 && open[0] === '{';
    if (c === '{' || c === '[' || c === '(') {
      if (atInitLevel) out += ' '; // nested value: contents elided
      open.push(c);
      if (open.length === 1 && c === '{') out += c;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      open.pop();
      if (open.length === 1 && open[0] === '{') out += ' ';
      else if (open.length === 0 && c === '}') out += c;
      continue;
    }
    if (atInitLevel) out += c;
  }
  return out;
}

/**
 * What is wrong with one call site's wiring, or `null` when nothing is.
 *
 * One function rather than two inline conditions because the check below and
 * the scanner's own test further down both need this verdict, and a verdict
 * computed twice is a verdict that can drift: the meta-test would keep passing
 * while the real check quietly asked something else.
 */
function wiringProblem(args: string): 'missing' | 'spread' | null {
  const init = initLevelText(args);
  if (init.includes('...')) return 'spread';
  if (!VERBATIM_HEADERS.test(init)) return 'missing';
  return null;
}

test('every limitedFetch call site passes HEADERS through verbatim', () => {
  const sourceFile = join(REPO_ROOT, ...SOURCE_PATH.split('/'));
  assert.ok(
    existsSync(sourceFile),
    `${SOURCE_PATH} is not there to read, so nothing checked that the outbound ` +
      `requests still send the one shared HEADERS constant. NFR7 rests on that ` +
      `wiring; a moved or renamed file wants SOURCE_PATH updated, not this ` +
      `check quietly skipped`,
  );
  const sites = limitedFetchCallSites(readFileSync(sourceFile, 'utf8'));

  assert.equal(
    sites.length,
    EXPECTED_CALL_SITES,
    `${SOURCE_PATH} has ${sites.length} limitedFetch call sites, expected ` +
      `${EXPECTED_CALL_SITES}. NFR7 holds only because every outbound request ` +
      `sends the one shared HEADERS constant; a new call site has to be wired ` +
      `to it and counted here, and a removed one has to be dropped from this ` +
      `count deliberately`,
  );

  for (const site of sites) {
    const problem = wiringProblem(site.args);
    assert.notEqual(
      problem,
      'missing',
      `the limitedFetch call at ${SOURCE_PATH}:${site.line} does not pass ` +
        `\`headers: HEADERS\` verbatim in its init object — it was called with ` +
        `\`${site.rawArgs.trim()}\`. Building the value up, omitting it, or ` +
        `burying a \`headers\` key inside a nested object breaks NFR7's one ` +
        `guarantee: that locking HEADERS locks what every request actually sends`,
    );
    assert.notEqual(
      problem,
      'spread',
      `the limitedFetch call at ${SOURCE_PATH}:${site.line} spreads something ` +
        `into the init object alongside \`headers\` — it was called with ` +
        `\`${site.rawArgs.trim()}\`. A spread at that level can carry its own ` +
        `\`headers\` key and, sitting after \`headers: HEADERS\`, silently ` +
        `replace the shared constant — the override this check exists to see. ` +
        `A spread nested deeper, building a request body or an array say, is ` +
        `fine and is not what this reports`,
    );
  }
});

/**
 * The wiring check above is only worth its line count if it can actually fail,
 * and everything it is built from — the comment/string blanking, the paren
 * matching, the two assertions — only ever runs against one file that passes
 * today. That makes "the call sites are wired" and "the scanner is asleep"
 * indistinguishable from a green suite.
 *
 * So this test points the same scanner at source text written here, where the
 * answer is known in advance, and covers both directions: the shapes NFR7 needs
 * caught, and the shapes it must not cry wolf over. It is the negative case for
 * the check above — the acceptance criterion "change a call site and the suite
 * goes red" is a claim about the scanner, and this is where that claim is
 * tested rather than assumed.
 */
test('the call-site scan can tell a wired source from an unwired one', () => {
  const src = (...lines: string[]) => lines.join('\n');

  /**
   * The scanner's verdict per call site. `wiringProblem` is the same function
   * the check above asserts on, not a restatement of it, so a change there
   * cannot leave this test agreeing with a rule nobody applies any more.
   */
  const scan = (source: string) =>
    limitedFetchCallSites(source).map(site => ({
      line: site.line,
      wired: wiringProblem(site.args) === null,
    }));

  assert.deepEqual(
    scan('const res = await limitedFetch(url, { headers: HEADERS });'),
    [{ line: 1, wired: true }],
    'the single-line call shape used by three of the four real call sites was not read as wired',
  );

  assert.deepEqual(
    scan(
      src(
        'const res = await limitedFetch(url, {',
        '  method: "POST",',
        '  headers: HEADERS,',
        '  body: JSON.stringify({ ...payload, quantity: 1 }),',
        '});',
      ),
    ),
    [{ line: 1, wired: true }],
    'the multi-line POST shape was misread — note the spread here builds a body ' +
      'and cannot touch the header set, so flagging it would fail a correct call site',
  );

  assert.deepEqual(
    scan('await limitedFetch(url, { headers: HEADERS, ...override });'),
    [{ line: 1, wired: false }],
    'a spread beside `headers: HEADERS` can carry its own `headers` key and win, ' +
      'and went uncaught',
  );

  assert.deepEqual(
    scan("await limitedFetch(url, { headers: { ...HEADERS, 'User-Agent': 'x' } });"),
    [{ line: 1, wired: false }],
    'a spread-and-override of HEADERS itself went uncaught',
  );

  assert.deepEqual(
    scan('await limitedFetch(url);'),
    [{ line: 1, wired: false }],
    'a call site with no init object at all went uncaught',
  );

  assert.deepEqual(
    scan(
      src(
        '// limitedFetch(url, { headers: HEADERS });',
        '/* limitedFetch(url, { headers: HEADERS }); */',
        "const doc = 'limitedFetch(url, { headers: HEADERS })';",
      ),
    ),
    [],
    'a call site written in a comment or a string was counted as a real one, so ' +
      'the count assertion could be satisfied by prose',
  );

  assert.deepEqual(
    scan('await limitedFetch(url, { headers: HEADERS, tags: [...list] });'),
    [{ line: 1, wired: true }],
    'a spread inside an array value was read as a spread over the init object, ' +
      'which would fail a correctly wired call site over a change that never ' +
      'touched a header',
  );

  assert.deepEqual(
    scan('await limitedFetch(url, { body: JSON.stringify({ headers: HEADERS }) });'),
    [{ line: 1, wired: false }],
    'a `headers` key buried inside the body was accepted as the init object\'s ' +
      'own — this call site sends no headers at all and must not read as wired',
  );

  assert.deepEqual(
    scan('await unlimitedFetch(url, { headers: HEADERS });'),
    [],
    'an identifier merely ending in `limitedFetch` was counted as a call to it',
  );

  assert.deepEqual(
    scan('await client.limitedFetch(url, { headers: HEADERS });'),
    [],
    "somebody else's method that happens to share the name was counted as a " +
      'call to the imported function, inflating the call-site count',
  );

  assert.deepEqual(
    scan('const doc = `limitedFetch(url, { headers: HEADERS })`;'),
    [],
    'a call site written inside a template literal was counted as a real one',
  );

  assert.deepEqual(
    scan('const s = `x${await limitedFetch(url, { headers: HEADERS })}y`;'),
    [{ line: 1, wired: true }],
    'a real call site inside a `${...}` interpolation was blanked away as if it ' +
      'were literal text, so a genuine request would go unchecked',
  );

  assert.deepEqual(
    scan("await limitedFetch(url, { headers: HEADERS, body: 'a)b' });"),
    [{ line: 1, wired: true }],
    'a `)` inside a string literal closed the call early, which is how this scan ' +
      'would hand back truncated arguments and a confidently wrong verdict',
  );

  assert.deepEqual(
    scan(
      src(
        '/*',
        ' * limitedFetch(decoy)',
        ' */',
        'await limitedFetch(a, { headers: HEADERS });',
        'await limitedFetch(b, { headers: OTHER });',
      ),
    ),
    [
      { line: 4, wired: true },
      { line: 5, wired: false },
    ],
    'call sites are reported per-site with true line numbers — a wrong line here ' +
      'means every failure message above points at the wrong code',
  );

  assert.equal(
    limitedFetchCallSites(
      src(...Array.from({ length: 5 }, () => 'await limitedFetch(u, { headers: HEADERS });')),
    ).length,
    5,
    'a fifth call site did not change the count, so the count assertion above ' +
      'could never notice one being added',
  );
});

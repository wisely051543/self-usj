/**
 * The day-first view's side of the grid change, executed rather than eyeballed.
 *
 * `days.json` went from ~935 buyable cells to ~5,700 cells of which most are
 * sold out, not yet released, or unknown. `onSale`, `fitsParty` and the date
 * strip's filter are the entire barrier between those ~4,800 off-sale cells and
 * a page that offers them to the user as if they were purchasable — and none of
 * it was covered by anything.
 *
 * The trap worth spelling out: an off-sale cell has no `units` key at all, so
 * `p.units == null` is `true` for every one of them. `fitsParty`'s party-size
 * guard therefore admits the whole grid on its own. Only the
 * `status === 'available'` predicate keeps them out, which is exactly the line
 * a future edit is most likely to "simplify" away.
 *
 * index.html is a single self-contained file with no module boundary, so these
 * functions are lifted out of it by source and run in a `node:vm` context. That
 * is not a grep: the assertions below call the real shipped code. What cannot
 * be run that way is called out where it appears.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vm from 'node:vm';

const HTML = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

/**
 * Lift one `function name(...) {...}` out of the page by brace matching.
 *
 * Brace counting would be fooled by a brace inside a string or template
 * literal; the functions extracted here contain neither, and the caller
 * asserts on what comes back, so a future rewrite that adds one shows up as a
 * failure to extract rather than as a silently truncated body.
 */
function extractFunction(name: string): string {
  const start = HTML.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `index.html no longer defines function ${name}() — the day view was rewired`);

  const open = HTML.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) {
      const src = HTML.slice(start, i + 1);
      assert.ok(src.includes('return'), `extracted ${name}() has no return — extraction went wrong`);
      return src;
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}() from index.html`);
}

interface Cell {
  code: string;
  status: string;
  price?: number | null;
  units?: number | null;
  slots?: number | null;
}

const page = vm.runInNewContext(
  `${extractFunction('onSale')}\n${extractFunction('fitsParty')}\n({ onSale, fitsParty })`,
) as {
  onSale: (entry: unknown) => Cell[];
  fitsParty: (entry: unknown, people: number) => Cell[];
};

/**
 * Copy a result out of the vm realm before asserting on it.
 *
 * An array built inside the context has that context's `Array.prototype`, and
 * `assert.deepStrictEqual` reads two arrays with different prototypes as
 * different values however identical their contents — "same structure but not
 * reference-equal". `Array.from` rebuilds it with this realm's prototype, so
 * the assertions below fail for real reasons only.
 */
const codes = (cells: Cell[]): string[] => Array.from(cells, c => c.code);

/** One day of the real grid shape: three buyable cells and one of each off-sale reason. */
const entry = {
  dayOfWeek: 3,
  products: [
    { code: 'A_ROOMY', status: 'available', price: 7000, units: 10, slots: null },
    { code: 'B_TIGHT', status: 'available', price: 8000, units: 2, slots: null },
    { code: 'C_UNCOUNTED', status: 'available', price: 9000, units: null, slots: null },
    { code: 'D_SOLD_OUT', status: 'sold-out' },
    { code: 'E_NOT_YET', status: 'not-yet-released' },
    { code: 'F_UNKNOWN', status: 'unknown' },
  ] as Cell[],
};

const OFF_SALE = ['D_SOLD_OUT', 'E_NOT_YET', 'F_UNKNOWN'];

test('onSale keeps only the cells the fetcher marked available', () => {
  assert.deepEqual(
    codes(page.onSale(entry)),
    ['A_ROOMY', 'B_TIGHT', 'C_UNCOUNTED'],
    'sold-out, not-yet-released and unknown cells must never reach the pass list',
  );
});

test('onSale survives a day with no row and a row with no products', () => {
  // `paintDay` reads a pill's day straight out of the calendar, and `renderDay`
  // filters over every key in it — neither wants to throw on a shape it did not
  // expect, since the whole page is one script.
  assert.deepEqual(codes(page.onSale(undefined)), []);
  assert.deepEqual(codes(page.onSale(null)), []);
  assert.deepEqual(codes(page.onSale({ dayOfWeek: 0 })), []);
  assert.deepEqual(codes(page.onSale({ dayOfWeek: 0, products: [] })), []);
});

test('an off-sale cell has no units at all, so the party-size guard alone would admit every one of them', () => {
  // Stated as an assertion rather than a comment: this is the reason the
  // status predicate cannot be dropped from fitsParty.
  for (const cell of entry.products.filter(c => OFF_SALE.includes(c.code))) {
    assert.equal(cell.units, undefined, `${cell.code} carries no units — the union gives it no such field`);
    assert.ok(cell.units == null, `and \`units == null\` is true for ${cell.code}, so that guard passes it`);
  }
});

test('fitsParty drops off-sale cells at every party size, not just the ones that fit', () => {
  for (const people of [1, 2, 3, 4, 10, 20]) {
    const fitting = codes(page.fitsParty(entry, people));
    for (const code of OFF_SALE) {
      assert.ok(
        !fitting.includes(code),
        `${code} is not purchasable and must not be counted as fitting a party of ${people}, got ${JSON.stringify(fitting)}`,
      );
    }
  }
});

test('fitsParty still filters the available cells by the day-level ticket count', () => {
  assert.deepEqual(
    codes(page.fitsParty(entry, 1)),
    ['A_ROOMY', 'B_TIGHT', 'C_UNCOUNTED'],
    'a party of one fits everything on sale',
  );
  assert.deepEqual(
    codes(page.fitsParty(entry, 4)),
    ['A_ROOMY', 'C_UNCOUNTED'],
    'B_TIGHT has 2 tickets left; C_UNCOUNTED exposes no count and is kept rather than guessed away',
  );
  assert.deepEqual(
    codes(page.fitsParty(entry, 20)),
    ['C_UNCOUNTED'],
    'only the pass with no exposed count survives a party larger than any known stock',
  );
});

/**
 * `renderDay` itself cannot run here: it reaches for `document`, writes
 * `innerHTML`, and calls a dozen page-level collaborators (`t`, `esc`,
 * `fmtShort`, `dowWordClass`, `dayState`, `readPref`, `syncQuery`, `paintDay`,
 * `scrollIntoView`). Stubbing all of that would test the stubs. So the one line
 * that matters — the date-strip filter, which is what stops the strip growing
 * from ~62 days with stock to the full ~185-day domain — is lifted out on its
 * own and executed against a real grid.
 */
test('the date strip lists only the days something is actually on sale', () => {
  const body = /function renderDay\(\)\s*\{[\s\S]*?\n\s*(const dates = [^\n]*)/.exec(HTML);
  assert.ok(body, 'renderDay() no longer opens by computing `const dates = ...`');
  const stmt = body[1];
  assert.ok(
    stmt.includes('onSale(') || stmt.includes("status === 'available'"),
    `the date strip must filter on the coordinator's explicit status, got: ${stmt}`,
  );

  const calendar = {
    days: {
      '2026-09-01': { dayOfWeek: 2, products: [{ code: 'A', status: 'available', price: 1, units: null, slots: null }] },
      // Every reason a day can have nothing to buy — none of them belongs on the strip.
      '2026-09-02': { dayOfWeek: 3, products: [{ code: 'A', status: 'sold-out' }] },
      '2026-09-03': { dayOfWeek: 4, products: [{ code: 'A', status: 'not-yet-released' }] },
      '2026-09-04': { dayOfWeek: 5, products: [{ code: 'A', status: 'unknown' }] },
      '2026-09-05': { dayOfWeek: 6, products: [{ code: 'A', status: 'available', price: 1, units: 4, slots: null }] },
    },
  };

  const dates = vm.runInNewContext(
    `${extractFunction('onSale')}\n${stmt}\ndates`,
    { calendar },
  ) as string[];

  assert.deepEqual(
    Array.from(dates),
    ['2026-09-01', '2026-09-05'],
    'the grid now carries a row for every date in the range; the strip stays at the days with stock',
  );
});

/**
 * The arithmetic behind paintDay's counts, executed.
 *
 * `hidden` is the only figure the source-level test below cannot hold: every
 * regex there still matches if the subtraction is written backwards, and a
 * backwards `hidden` is never positive, so the "N passes hidden for a party of
 * N" note silently stops appearing and the detail line loses its fitting count.
 * The three statements are pure, so they are lifted and run against a real grid
 * row the same way the date strip's filter is.
 */
test('paintDay counts what is on sale and how much of it the party size hides', () => {
  const stmts = /(const selling = [^\n]*\n\s*const fitting = [^\n]*\n\s*const hidden = [^\n]*)/.exec(HTML);
  assert.ok(stmts, 'paintDay no longer computes selling/fitting/hidden as three consecutive statements');

  // Rebuilt in this realm for the reason `codes()` above documents: an object
  // literal made inside the context carries that context's `Object.prototype`,
  // which `deepStrictEqual` reads as a different value however equal the fields.
  const counts = (people: number) => {
    const r = vm.runInNewContext(
      `${extractFunction('onSale')}\n${extractFunction('fitsParty')}\n${stmts[1]}\n` +
        '({ selling: selling.length, fitting: fitting.length, hidden })',
      { entry, dayState: { people } },
    ) as { selling: number; fitting: number; hidden: number };
    return { selling: r.selling, fitting: r.fitting, hidden: r.hidden };
  };

  assert.deepEqual(
    counts(1),
    { selling: 3, fitting: 3, hidden: 0 },
    'a party of one fits every on-sale cell, so nothing is hidden and the plain note is shown',
  );
  assert.deepEqual(
    counts(4),
    { selling: 3, fitting: 2, hidden: 1 },
    'B_TIGHT has 2 tickets left, so exactly one on-sale pass is hidden from a party of four',
  );
  assert.deepEqual(
    counts(20),
    { selling: 3, fitting: 1, hidden: 2 },
    'only the pass with no exposed count survives a party of twenty — the other two are hidden',
  );
  assert.equal(
    counts(1).selling,
    3,
    'and `hidden` is counted against the on-sale cells, never against the whole grid row: ' +
      'measuring it from entry.products would report the three off-sale cells as hidden by party size',
  );
});

/**
 * Source-level, and deliberately so: `paintDay` needs a live DOM card to run
 * against. What it can still be held to is that its three counts and its list
 * are computed from `selling` (the `onSale(entry)` it takes at the top) rather
 * than from `entry.products`, which is now the whole grid row.
 */
/**
 * `paintDay`'s own source, sliced out with the guards every caller needs.
 *
 * Without both guards the slice can silently come back short — and a short
 * body makes the `entry.products` count below read zero for the wrong reason,
 * which is the one way that assertion could pass while the page reads the
 * whole row.
 */
function paintDaySource(): string {
  const start = HTML.indexOf('function paintDay(');
  assert.notEqual(start, -1, 'index.html no longer defines paintDay()');
  const end = HTML.indexOf('\n    }', start);
  assert.notEqual(end, -1, 'paintDay() is no longer closed by a brace at its own indentation');
  const body = HTML.slice(start, end);
  assert.ok(
    body.includes("setView('product', row.dataset.code)"),
    'the extracted paintDay() body stops before its last statement — the slice ended early',
  );
  return body;
}

test('paintDay counts and lists from the on-sale cells, not from the whole grid row', () => {
  const body = paintDaySource();

  assert.ok(
    /const selling = onSale\(entry\)/.test(body),
    'paintDay must take the on-sale cells once at the top',
  );
  assert.equal(
    (body.match(/entry\.products/g) || []).length,
    0,
    'no count or list in paintDay may read entry.products directly — that is now every pass, on sale or not',
  );
  assert.ok(
    /t\('dayDetail', selling\.length\)/.test(body) && /t\('dayTitle', selling\.length\)/.test(body),
    'the "N passes" figures must count on-sale cells',
  );
  assert.ok(
    /selling\.map\(dayRowHtml\)/.test(body),
    'the pass list must be rendered from the on-sale cells',
  );
});

/**
 * Which branch of the day card's body actually runs, executed.
 *
 * The source-level test above pins every fragment of that statement except the
 * one thing that decides between them. Rewrite the condition as
 * `fitting.length` and all four of its regexes still match — `selling` is still
 * taken at the top, `entry.products` still appears zero times, and both
 * `t('dayTitle', selling.length)` and `selling.map(dayRowHtml)` are still
 * there — while a day with passes on sale, none of them roomy enough for the
 * party, would render the "nothing on sale" box instead of the dimmed rows the
 * comment directly above the statement promises to keep visible.
 *
 * So the assignment is lifted out on its own and run, the same way the date
 * strip's filter and the three counts are. Its collaborators are stubbed to
 * echo what they were handed: the assertions are about which branch was taken
 * and what it was given, not about the page's wording.
 */
test('paintDay lists the on-sale passes whenever there are any, however few fit the party', () => {
  const stmts = /(const selling = [^\n]*\n\s*const fitting = [^\n]*\n\s*const hidden = [^\n]*)/.exec(
    paintDaySource(),
  );
  assert.ok(stmts, 'paintDay no longer computes selling/fitting/hidden as three consecutive statements');

  // Anchored inside paintDay's own source: the page assigns `body.innerHTML`
  // in the pass-first view too, and that one must not be the statement tested.
  const assign = /body\.innerHTML = ([\s\S]*?);\n/.exec(paintDaySource());
  assert.ok(assign, 'paintDay no longer fills the day card body from a single assignment');

  const render = (row: { dayOfWeek: number; products: Cell[] }, people: number) =>
    vm.runInNewContext(
      `${extractFunction('onSale')}\n${extractFunction('fitsParty')}\n${stmts[1]}\n(${assign[1]})`,
      {
        entry: row,
        dayState: { people },
        esc: (s: unknown) => String(s),
        t: (key: string, n: unknown) => `${key}(${n})`,
        dayRowHtml: (cell: Cell) => `<row:${cell.code}>`,
      },
    ) as string;

  // Every on-sale cell here exposes a finite ticket count, so a large party
  // empties `fitting` while `selling` still holds two passes — the one input
  // that tells the two conditions apart.
  const soldDown = { dayOfWeek: 3, products: entry.products.filter(c => c.code !== 'C_UNCOUNTED') };

  const tight = render(soldDown, 20);
  assert.ok(
    tight.includes('<row:A_ROOMY>') && tight.includes('<row:B_TIGHT>'),
    `a sold-down pass is still an answer to "what is on sale that day" and must stay in the list, got: ${tight}`,
  );
  assert.ok(
    !tight.includes('dayEmpty'),
    `the day has two passes on sale, so the "nothing on sale" box must not be rendered, got: ${tight}`,
  );
  assert.ok(
    tight.includes('dayTitle(2)'),
    `and the section heading counts the on-sale passes, not the fitting ones, got: ${tight}`,
  );

  // The off-sale cells must not keep the empty state away either: they are in
  // `entry.products` but not in `selling`.
  const nothing = { dayOfWeek: 4, products: entry.products.filter(c => OFF_SALE.includes(c.code)) };
  const empty = render(nothing, 1);
  assert.ok(
    empty.includes('dayEmpty'),
    `a day whose every cell is sold out, unreleased or unknown has nothing to list, got: ${empty}`,
  );
  assert.ok(
    !empty.includes('<row:'),
    `and must not render a row for any of them, got: ${empty}`,
  );
});

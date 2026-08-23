import * as fs from 'fs';
import * as path from 'path';
import { CatalogEntry, DateRange, DateSlot, DayEntry, DayProduct, Days, Index, ProductResult, ProductSummary } from './types';
import { dayOfWeek, everyNthDay, shiftMonths, todayJST } from './dates';
import { assertIndexSchemaVersion, DAYS_SCHEMA_VERSION, INDEX_SCHEMA_VERSION } from './schema';
import { usjSource } from './sources/usj';
import { BlockedError, budgetExhausted, requestCount } from './limiter';

const source = usjSource;
const MONTHS_AHEAD = 6;
const DATA_DIR = path.join(__dirname, '..', 'data');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const DAYS_PATH = path.join(DATA_DIR, 'days.json');
const PRODUCTS_DIR = path.join(DATA_DIR, 'products');

/**
 * How long a product missing from the catalogue is kept before its file is
 * deleted. Long enough that a sampling gap or a store-side blip cannot throw
 * away a pass that is still on sale; short enough that last season's passes do
 * not accumulate forever.
 */
const DELIST_AFTER_DAYS = 14;

/**
 * Exported so tests can drive the version-mismatch path directly rather than
 * through a full `main()` round.
 *
 * A version mismatch here is not fatal the way it is for the page or the CI
 * gate: this file is itself the writer, so it treats a rejected snapshot the
 * same as no snapshot — the round proceeds as a cold first run. That is safe
 * because every code's `lastSeenAt` gets stamped with this round's time
 * regardless (see `main()`), so `sweepDelisted()` never mistakes a version
 * bump for a pass going off sale; the only cost is losing this round's
 * `carriedOver` backfill.
 */
export function readIndex(): Index | null {
  let raw: Index;
  try {
    raw = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as Index;
  } catch {
    return null;
  }

  // A parsed JSON value that is not a plain object (`null`, an array, a bare
  // number) has no `.schemaVersion` to read — that is the same "not a usable
  // snapshot" case as a parse failure above, not a version mismatch, so it
  // falls through to the same silent `null` rather than reaching the version
  // check and logging a confusing message. `typeof [] === 'object'`, so an
  // array top-level value needs its own check alongside the `typeof` guard.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  try {
    assertIndexSchemaVersion(raw.schemaVersion);
  } catch (err) {
    console.error(`[fetch] ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  return Array.isArray(raw.products) ? raw : null;
}

function productPath(code: string): string {
  return path.join(PRODUCTS_DIR, `${code}.json`);
}

function readProduct(code: string): ProductResult | null {
  try {
    return JSON.parse(fs.readFileSync(productPath(code), 'utf-8')) as ProductResult;
  } catch {
    return null;
  }
}

/**
 * Dates that have already happened are dead weight: nothing can be booked for
 * them and they only grow the file and its diff. The store keeps returning
 * them, so they are dropped here rather than upstream.
 */
function dropPastDates(result: ProductResult, today: string): ProductResult {
  return { ...result, dates: result.dates.filter(d => d.date >= today) };
}

/**
 * The comparison key for "did anything actually change" — everything except
 * when it was fetched. Timestamps move on every run, so leaving them in would
 * make every product look changed and put a full rewrite into git every time.
 */
function contentKey(result: ProductResult): string {
  const { fetchedAt, dates, ...rest } = result;
  return JSON.stringify({
    ...rest,
    dates: dates.map(({ slotsFetchedAt, ...d }) => d),
  });
}

/** Write only when the content differs, so unchanged products stay out of git. */
function writeProduct(result: ProductResult): boolean {
  const existing = readProduct(result.code);
  if (existing && contentKey(existing) === contentKey(result)) return false;

  fs.writeFileSync(productPath(result.code), JSON.stringify(result, null, 2), 'utf-8');
  return true;
}

function summarize(result: ProductResult, lastSeenAt: string): ProductSummary {
  const available = result.dates.filter(d => d.available);
  return {
    code: result.code,
    name: result.name,
    eyebrow: result.eyebrow,
    imageUrl: result.imageUrl,
    url: result.url,
    // The listing price is a "from" price; the calendar carries the per-date truth.
    fromPrice: available.map(d => d.pricePerPerson).filter((p): p is number => p != null).sort((a, b) => a - b)[0] ?? null,
    currency: result.currency,
    deep: result.deep,
    latestDate: result.latestDate,
    availableDateCount: available.length,
    slotDateCount: result.dates.filter(d => d.timeSlots).length,
    fetchedAt: result.fetchedAt,
    lastSeenAt,
    ...(result.error ? { error: result.error } : {}),
  };
}

/**
 * Drop the products that have been absent from the catalogue long enough to
 * call gone, and delete their files with them.
 *
 * The clock is lastSeenAt, which only advances when the listing actually
 * returned the product — carrying one forward is what keeps it fetchable, not
 * evidence that it is still on sale.
 */
function sweepDelisted(products: ProductSummary[], now: Date): ProductSummary[] {
  const cutoff = new Date(now.getTime() - DELIST_AFTER_DAYS * 24 * 60 * 60 * 1000);

  return products.filter(summary => {
    if (new Date(summary.lastSeenAt || 0) >= cutoff) return true;

    console.log(`[fetch] delisting ${summary.code}, last seen ${summary.lastSeenAt}`);
    fs.rmSync(productPath(summary.code), { force: true });
    return false;
  });
}

/**
 * What one (date × pass) cell is, decided once, here.
 *
 * The order below is the whole rule and it short-circuits. All three
 * missing-evidence gates come first, so "we do not know" is a single gate
 * nothing routes around rather than a fallback something else reaches first.
 * An unreadable file says nothing; an empty `latestDate` means the pass's
 * on-sale boundary is unknown, so even the rows it did return cannot be told
 * apart from a partial view; and a date outside the product's own fetched
 * range (a stale carry-over, say) is a window this file has no evidence about.
 * None of the three is grounds for calling a cell sold out — that is the
 * guess that makes a user give up on a pass they could still buy.
 *
 * The gates test for absence, not for one exact spelling of it. These files are
 * JSON that a past version of this code wrote, so a field can be missing as
 * easily as it can be empty — and a `date < undefined` comparison is false,
 * which would let a file with no declared window through the range gate and
 * have its cells decided from evidence it never carried. Anything falsy is
 * treated as "not stated".
 */
function cellStatus(code: string, result: ProductResult | null, date: string, slot: DateSlot | undefined): DayProduct {
  if (!result) return { code, status: 'unknown' };
  if (!result.latestDate) return { code, status: 'unknown' };
  if (!result.calendarStart || !result.calendarEnd) return { code, status: 'unknown' };
  if (date < result.calendarStart || date > result.calendarEnd) return { code, status: 'unknown' };

  if (slot) {
    if (!slot.available) return { code, status: 'sold-out' };
    return {
      code,
      status: 'available',
      price: slot.pricePerPerson,
      units: slot.availableUnits,
      slots: slot.timeSlots ? slot.timeSlots.length : null,
    };
  }

  // No row at all: within the on-sale window the store simply stops listing
  // what it has sold out of, past it the date has not opened yet.
  return date <= result.latestDate ? { code, status: 'sold-out' } : { code, status: 'not-yet-released' };
}

/**
 * Transpose the product files into the full date × pass grid for this round.
 *
 * The line-up changes day to day, and answering "what can I buy on the 20th"
 * from the product files alone would mean downloading all of them. Every
 * combination gets a cell, including the days nothing is on sale: a missing
 * cell would mean "sold out", "not open yet", "no evidence" and "we could not
 * read the file" all at once, and readers were left to guess between them.
 *
 * The value domain is this round's `range` rather than the union of the
 * product files' own ranges — `range` is the one definition of what was asked
 * of the store, so the grid's edges stay put instead of drifting with some
 * stale product's old `calendarEnd`. Cells outside a product's own evidence
 * are marked unknown rather than trimmed away.
 *
 * Built from disk rather than from this run's results so a partial run
 * (--product=) still emits the full calendar.
 */
export function buildDays(products: ProductSummary[], range: DateRange): Days {
  const dates = everyNthDay(range.start, range.end, 1);
  const days: Record<string, DayEntry> = {};
  for (const date of dates) days[date] = { dayOfWeek: dayOfWeek(date), products: [] };

  for (const summary of products) {
    // A file that will not read is a gap in the evidence, not the absence of a
    // pass: it stays in the grid with every cell unknown rather than vanishing.
    const result = readProduct(summary.code);
    const rows = new Map<string, DateSlot>();
    for (const row of result?.dates ?? []) rows.set(row.date, row);

    for (const date of dates) {
      days[date].products.push(cellStatus(summary.code, result, date, rows.get(date)));
    }
  }

  // On sale first and cheapest first among those, so the UI's "cheapest first"
  // contract survives the off-sale cells; the rest by code, so the ordering is
  // total and the file's line-by-line diff stays quiet. `dates` is already in
  // date order and a plain object preserves insertion order for these keys.
  for (const date of dates) {
    days[date].products.sort((a, b) => {
      if (a.status === 'available' && b.status === 'available') {
        return (a.price ?? Infinity) - (b.price ?? Infinity) || a.code.localeCompare(b.code);
      }
      if (a.status === 'available') return -1;
      if (b.status === 'available') return 1;
      return a.code.localeCompare(b.code);
    });
  }

  return { schemaVersion: DAYS_SCHEMA_VERSION, days };
}

/**
 * One line per pass-on-a-day, rather than the six that JSON.stringify's indent
 * would spend on it. This file is rewritten whenever any ticket count moves —
 * roughly every run — so keeping a changed count to a one-line diff is what
 * stops it dominating the repo's growth.
 */
function serializeDays(days: Days): string {
  const dates = Object.keys(days.days);
  const out = ['{', `  "schemaVersion": ${days.schemaVersion},`, '  "days": {'];

  dates.forEach((date, i) => {
    const entry = days.days[date];
    out.push(`    ${JSON.stringify(date)}: {`);
    out.push(`      "dayOfWeek": ${entry.dayOfWeek},`);
    out.push('      "products": [');
    entry.products.forEach((product, j) => {
      out.push(`        ${JSON.stringify(product)}${j < entry.products.length - 1 ? ',' : ''}`);
    });
    out.push('      ]');
    out.push(`    }${i < dates.length - 1 ? ',' : ''}`);
  });

  out.push('  }', '}');
  return out.join('\n') + '\n';
}

/**
 * Same "content unchanged, stay out of git" rule as the product files.
 *
 * Exported for the same reason `buildDays` is: the grid is every date in the
 * range times every pass in the catalogue, and it is rewritten whenever any
 * ticket count moves, so the rule that an unchanged round writes nothing is
 * the one thing standing between this file and a commit a day. A test drives
 * it directly rather than inferring it from a whole round.
 */
export function writeDays(days: Days): boolean {
  const next = serializeDays(days);
  try {
    if (fs.readFileSync(DAYS_PATH, 'utf-8') === next) return false;
  } catch { /* no file yet */ }

  fs.writeFileSync(DAYS_PATH, next, 'utf-8');
  return true;
}

/**
 * The round-level tally an aborted round would otherwise take to the grave.
 *
 * `main()`'s closing summary sits past every early exit — a block's
 * `process.exit(1)`, the unmatched-filter `process.exit(2)`, and the fatal
 * `process.exit(1)` from `handleFatalMainError` alike — so without this, an
 * early-exiting round used to leave only "why it stopped" with no sense of how
 * far it got or how long it spent getting there — the two numbers that
 * separate a store that blocked on request three from one that blocked after
 * twenty minutes of grinding. Kept as its own message rather than sharing the
 * closing summary's format string, so neither line can be reworded by an edit
 * aimed at the other. `console.error` to land in the same stream as the alert
 * it follows.
 */
function logAbortSummary(startedAt: number): void {
  const seconds = Math.max(0, Date.now() - startedAt) / 1000;
  console.error(`[fetch] aborted after ${requestCount()} requests in ${seconds.toFixed(1)}s`);
}

/**
 * Module-level so `handleFatalMainError` — attached to `main()`'s promise from
 * outside it — can reach the same clock `main()` started, rather than the two
 * drifting apart as two separate timers. Seeded at load time so that even
 * before `main()` reassigns it, `Date.now() - startedAt` is always a real
 * number rather than `Date.now() - undefined` producing `NaN`.
 */
let startedAt = Date.now();

/**
 * The catch-all for whatever `main()` throws that none of its own try/catch
 * blocks were written for — a bug, not a modeled failure mode. Without this,
 * such an exception fell out of the fire-and-forget call below as an
 * unhandled rejection: no abort summary, and an exit code Node chooses rather
 * than the one this project uses for "the round did not finish". AD-16's rule
 * is that the danger is silence, not noise, so this exits 1 rather than 0 or
 * hanging as an unhandled rejection.
 * Exported so a test can call it directly rather than engineering a real
 * unmodeled throw through `main()`'s full body.
 *
 * The reporting steps themselves are wrapped in `try`/`finally` rather than a
 * bare sequence: if `console.error` or `logAbortSummary` (e.g. its
 * `requestCount()` call) throws, that would otherwise fall out of this
 * handler uncaught — the exact unhandled-rejection failure mode this function
 * exists to eliminate, one level deeper. `finally` guarantees `process.exit(1)`
 * is still reached either way.
 */
export function handleFatalMainError(err: unknown): never {
  try {
    const detail = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
    console.error(`[fetch] fatal: ${detail}`);
    logAbortSummary(startedAt);
  } finally {
    process.exit(1);
  }
}

/** Exported so tests can await it directly instead of racing its fire-and-forget invocation below. */
export async function main() {
  const wanted = process.argv
    .filter(a => a.startsWith('--product='))
    .map(a => a.split('=')[1])
    .filter(Boolean);

  const start = todayJST();
  const range: DateRange = { start, end: shiftMonths(start, MONTHS_AHEAD) };
  startedAt = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();

  const previousIndex = readIndex();
  const previousSummaries = previousIndex?.products ?? [];
  const known = previousSummaries.map(p => p.code);

  let catalog: CatalogEntry[];
  try {
    catalog = await source.listProducts(range, known);
  } catch (err) {
    console.error(`[fetch] catalog failed: ${err instanceof Error ? err.message : err}`);
    logAbortSummary(startedAt);
    process.exit(1);
  }

  const targets = wanted.length ? catalog.filter(e => wanted.includes(e.code)) : catalog;
  if (targets.length === 0) {
    console.error(`No product matched ${wanted.join(', ')}. Known: ${catalog.map(e => e.code).join(', ')}`);
    logAbortSummary(startedAt);
    process.exit(2);
  }

  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  // Products are fetched one after another: each one already fans its own slot
  // lookups out to the shared rate gate, so racing products against each other
  // would only lengthen the queue, not the throughput.
  const summaries: ProductSummary[] = [];
  // Walk-up passes, kept aside so the merge below does not resurrect them from
  // the previous index as stale entries.
  const dropped = new Set<string>();
  let written = 0;
  let failed = 0;

  for (const entry of targets) {
    const previous = previousSummaries.find(p => p.code === entry.code);
    const lastSeenAt = entry.carriedOver ? previous?.lastSeenAt ?? nowIso : nowIso;

    try {
      const result = await source.fetchProduct(entry, range, readProduct(entry.code));

      // A pass with no timed attraction admits at any hour: there are no slots
      // to compare, so it carries nothing this site can answer a question with.
      // Dropping it here rather than hiding it in the UI keeps its file out of
      // the repo instead of rewriting it every run.
      if (!result.deep) {
        dropped.add(entry.code);
        fs.rmSync(productPath(entry.code), { force: true });
        continue;
      }

      const trimmed = dropPastDates(result, start);
      if (writeProduct(trimmed)) written++;
      summaries.push(summarize(trimmed, lastSeenAt));
    } catch (err) {
      if (err instanceof BlockedError) {
        // The store is still blocking us after exhausting retries — stop the
        // round outright rather than recording it as one product's failure.
        // Nothing after this point runs, so index.json/days.json keep the last
        // successful round and the site keeps serving it (NFR8, NFR11). The
        // per-product files written earlier in this round do stay on disk:
        // writes are incremental by design, and index.json is what decides
        // which of them the site reads.
        console.error(`[fetch] ${entry.code} blocked: ${err.message}`);
        logAbortSummary(startedAt);
        process.exit(1);
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fetch] ${entry.code} failed: ${message}`);
      failed++;

      // Keep the product visible with its last known data rather than dropping
      // it off the page because one call went wrong.
      summaries.push(
        previous
          ? { ...previous, lastSeenAt, stale: true, error: message }
          : {
              code: entry.code, name: entry.name, eyebrow: entry.eyebrow, imageUrl: entry.imageUrl,
              url: '', fromPrice: entry.fromPrice, currency: '', deep: false,
              latestDate: '', availableDateCount: 0, slotDateCount: 0,
              fetchedAt: nowIso, lastSeenAt, error: message,
            },
      );
    }
  }

  // A partial run (--product=) must not touch the products it skipped, delist
  // sweep included: their absence from this run says nothing about the store.
  const touched = new Set(summaries.map(s => s.code));
  const untouched = previousSummaries
    .filter(p => !touched.has(p.code) && !dropped.has(p.code))
    .map(p => ({ ...p, stale: true }));
  const merged = [...summaries, ...untouched].sort((a, b) => a.code.localeCompare(b.code));
  const products = wanted.length ? merged : sweepDelisted(merged, now);

  const index: Index = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: nowIso,
    ...(budgetExhausted() ? { budgetExhausted: true } : {}),
    products,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');

  const days = buildDays(products, range);
  const daysWritten = writeDays(days);

  // Every date now has a row, so a day count says nothing about whether the
  // round found anything. Count the cells by status instead: an all-unknown or
  // nothing-available grid is what a silent failure looks like from here, and
  // the sanity check has to have something to read.
  const cells = Object.values(days.days).flatMap(entry => entry.products);
  const tally = (status: string) => cells.filter(c => c.status === status).length;
  console.log(
    `[fetch] calendar: ${Object.keys(days.days).length} days × ${products.length} passes = ${cells.length} cells ` +
    `(${tally('available')} available, ${tally('sold-out')} sold out, ` +
    `${tally('not-yet-released')} not yet released, ${tally('unknown')} unknown)` +
    `${daysWritten ? '' : ' (unchanged)'}`,
  );

  if (dropped.size) {
    console.log(`[fetch] skipped ${dropped.size} walk-up passes: ${[...dropped].sort().join(', ')}`);
  }

  const seconds = (Date.now() - startedAt) / 1000;
  console.log(
    `[fetch] ${products.length} products, ${written} files rewritten, ${failed} failed — ` +
    `${requestCount()} requests in ${seconds.toFixed(1)}s (${(requestCount() / seconds).toFixed(1)} req/s)`,
  );
  if (budgetExhausted()) {
    console.error('[fetch] request budget exhausted; some slot data was carried over.');
  }

  // Only a total outage should redden the CI run; one blocked product is expected.
  if (failed > 0 && failed === targets.length) {
    console.error('All products failed.');
    process.exit(1);
  }
}

// Guarded so importing this module (e.g. from a test) does not also run it —
// `require.main === module` still holds when it is invoked as the CLI entry
// point, so this is a no-op behavior change for the real `node`/`ts-node` run.
if (require.main === module) {
  main().catch(handleFatalMainError);
}

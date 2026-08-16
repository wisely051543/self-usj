import * as fs from 'fs';
import * as path from 'path';
import { CatalogEntry, DateRange, DayEntry, Days, Index, ProductResult, ProductSummary } from './types';
import { shiftMonths, todayJST } from './dates';
import { usjSource } from './sources/usj';
import { budgetExhausted, requestCount } from './limiter';

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

function readIndex(): Index | null {
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as Index;
    return Array.isArray(raw.products) ? raw : null;
  } catch {
    return null;
  }
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
 * Transpose the product files into a date -> passes map.
 *
 * The line-up changes day to day, and answering "what can I buy on the 20th"
 * from the product files alone would mean downloading all of them. Built from
 * disk rather than from this run's results so a partial run (--product=) still
 * emits the full calendar.
 */
function buildDays(products: ProductSummary[]): Days {
  const days: Record<string, DayEntry> = {};

  for (const summary of products) {
    const result = readProduct(summary.code);
    if (!result) continue;

    for (const date of result.dates) {
      if (!date.available) continue;

      const entry = days[date.date] ?? (days[date.date] = { dayOfWeek: date.dayOfWeek, products: [] });
      entry.products.push({
        code: result.code,
        price: date.pricePerPerson,
        units: date.availableUnits,
        slots: date.timeSlots ? date.timeSlots.length : null,
      });
    }
  }

  // Cheapest first within a day, and the days themselves in date order — a
  // plain object preserves insertion order for these string keys, and the UI
  // should not have to re-sort what the fetcher already knows.
  const ordered: Record<string, DayEntry> = {};
  for (const date of Object.keys(days).sort()) {
    days[date].products.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.code.localeCompare(b.code));
    ordered[date] = days[date];
  }

  return { schemaVersion: 1, days: ordered };
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

/** Same "content unchanged, stay out of git" rule as the product files. */
function writeDays(days: Days): boolean {
  const next = serializeDays(days);
  try {
    if (fs.readFileSync(DAYS_PATH, 'utf-8') === next) return false;
  } catch { /* no file yet */ }

  fs.writeFileSync(DAYS_PATH, next, 'utf-8');
  return true;
}

async function main() {
  const wanted = process.argv
    .filter(a => a.startsWith('--product='))
    .map(a => a.split('=')[1])
    .filter(Boolean);

  const start = todayJST();
  const range: DateRange = { start, end: shiftMonths(start, MONTHS_AHEAD) };
  const startedAt = Date.now();
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
    process.exit(1);
  }

  const targets = wanted.length ? catalog.filter(e => wanted.includes(e.code)) : catalog;
  if (targets.length === 0) {
    console.error(`No product matched ${wanted.join(', ')}. Known: ${catalog.map(e => e.code).join(', ')}`);
    process.exit(2);
  }

  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  // Products are fetched one after another: each one already fans its own slot
  // lookups out to the shared rate gate, so racing products against each other
  // would only lengthen the queue, not the throughput.
  const summaries: ProductSummary[] = [];
  let written = 0;
  let failed = 0;

  for (const entry of targets) {
    const previous = previousSummaries.find(p => p.code === entry.code);
    const lastSeenAt = entry.carriedOver ? previous?.lastSeenAt ?? nowIso : nowIso;

    try {
      const result = await source.fetchProduct(entry, range, readProduct(entry.code));
      const trimmed = dropPastDates(result, start);
      if (writeProduct(trimmed)) written++;
      summaries.push(summarize(trimmed, lastSeenAt));
    } catch (err) {
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
  const untouched = previousSummaries.filter(p => !touched.has(p.code)).map(p => ({ ...p, stale: true }));
  const merged = [...summaries, ...untouched].sort((a, b) => a.code.localeCompare(b.code));
  const products = wanted.length ? merged : sweepDelisted(merged, now);

  const index: Index = {
    schemaVersion: 4,
    updatedAt: nowIso,
    ...(budgetExhausted() ? { budgetExhausted: true } : {}),
    products,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');

  const days = buildDays(products);
  const daysWritten = writeDays(days);
  console.log(
    `[fetch] calendar: ${Object.keys(days.days).length} days with stock` +
    `${daysWritten ? '' : ' (unchanged)'}`,
  );

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

main();

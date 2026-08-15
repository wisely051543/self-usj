import * as fs from 'fs';
import * as path from 'path';
import { DateRange, Results, Source, SourceResult } from './types';
import { shiftMonths, todayJST } from './dates';
import { usjSource } from './sources/usj';

const SOURCES: Source[] = [usjSource];
const MONTHS_AHEAD = 6;
const RESULTS_PATH = path.join(__dirname, '..', 'data', 'results.json');

function readPrevious(): SourceResult[] {
  try {
    const raw = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
    return Array.isArray(raw.sources) ? (raw.sources as SourceResult[]) : [];
  } catch {
    return [];
  }
}

/** Placeholder result so a failing source still occupies its slot with a visible error. */
function errorResult(source: Source, range: DateRange, err: unknown): SourceResult {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${source.id}] failed: ${message}`);
  return {
    id: source.id,
    label: source.label,
    url: '',
    productName: '',
    productCode: '',
    currency: '',
    people: 0,
    fetchedAt: new Date().toISOString(),
    calendarStart: range.start,
    calendarEnd: range.end,
    latestDate: '',
    dates: [],
    attractionNames: {},
    nonTimedAttractions: [],
    error: message,
  };
}

/**
 * Overlay freshly fetched sources onto the previous file, keyed by id, so a
 * partial run (--only=x) never wipes the source it did not fetch. Sources no
 * longer in the registry are dropped rather than lingering forever.
 */
function mergeSources(previous: SourceResult[], fresh: SourceResult[]): SourceResult[] {
  const byId = new Map(previous.map(s => [s.id, s]));
  for (const s of fresh) byId.set(s.id, s);
  // Keep the declared source order stable for the UI.
  return SOURCES.map(s => byId.get(s.id)).filter((s): s is SourceResult => !!s);
}

async function main() {
  const only = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
  const targets = only ? SOURCES.filter(s => s.id === only) : SOURCES;

  if (targets.length === 0) {
    console.error(`Unknown source "${only}". Known: ${SOURCES.map(s => s.id).join(', ')}`);
    process.exit(2);
  }

  const start = todayJST();
  const range: DateRange = { start, end: shiftMonths(start, MONTHS_AHEAD) };

  const fresh = await Promise.all(
    targets.map(s => s.run(range).catch(err => errorResult(s, range, err)))
  );

  const results: Results = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    sources: mergeSources(readPrevious(), fresh),
  };

  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Written to ${RESULTS_PATH}`);

  // Only a total outage should redden the CI run; one blocked source is expected.
  if (fresh.every(r => r.error)) {
    console.error('All sources failed.');
    process.exit(1);
  }
}

main();

/**
 * Sagano fetch step (`npm run fetch:sagano`).
 *
 * calendar (current + next month) -> sale window -> one search-inventory per
 * non-SUSPENDED window day -> one daily-services per service pattern present
 * in the window (its earliest day) -> data/sagano/days.json, written atomically.
 * Any failure keeps the previous file and only flips `stale`/`updatedAt`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { todayJST } from '../dates';
import { createClient, RequestCapError, FetchFailedError, SaganoClient } from './client';
import {
  buildDays,
  buildTimetable,
  CalendarResponse,
  DailyServicesResponse,
  InventoryResponse,
  inventoryDates,
  mergeCalendars,
  monthsToFetch,
  representativeDates,
  saleWindowEnd,
  SaganoDays,
} from './core';

export const DAYS_PATH = path.join(__dirname, '..', '..', 'data', 'sagano', 'days.json');

function assertCalendar(body: unknown, where: string): CalendarResponse {
  const r = body as CalendarResponse;
  if (!r || !Array.isArray(r.service_days)) throw new FetchFailedError(`${where}: unexpected shape`);
  return r;
}

function assertInventory(body: unknown, where: string): InventoryResponse {
  const r = body as InventoryResponse;
  if (!r || !Array.isArray(r.down_services) || !Array.isArray(r.up_services)) {
    throw new FetchFailedError(`${where}: unexpected shape`);
  }
  return r;
}

function assertDailyServices(body: unknown, where: string): DailyServicesResponse {
  const r = body as DailyServicesResponse;
  if (!r || !Array.isArray(r.service_summaries) ||
      !r.service_summaries.every(s => s && Array.isArray(s.diagram_items))) {
    throw new FetchFailedError(`${where}: unexpected shape`);
  }
  return r;
}

export async function run(opts: { client: SaganoClient; today: string; now: Date }): Promise<SaganoDays> {
  const { client, today, now } = opts;

  const calendars: CalendarResponse[] = [];
  for (const month of monthsToFetch(today)) {
    const p = `services-pattern-calendar/${month}`;
    let body: unknown;
    try {
      body = await client.get(p);
    } catch (err) {
      // Months past the published season answer 404 (2027-01 did on
      // 2026-09-27), so every December run asks for an unpublished January.
      // That month simply has no calendar days; its dates get `null`.
      if (err instanceof FetchFailedError && err.status === 404) {
        console.log(`Sagano: ${p} not published (404); its dates get servicePattern null`);
        continue;
      }
      throw err;
    }
    calendars.push(assertCalendar(body, p));
  }
  const calendar = mergeCalendars(calendars);

  const windowEnd = saleWindowEnd(today);
  const dates = inventoryDates(calendar, today, windowEnd);
  const repDates = representativeDates(calendar, dates);
  if (client.requestCount() + dates.length + repDates.length > client.maxRequests) {
    throw new RequestCapError(
      `window needs ${dates.length} inventory + ${repDates.length} daily-services calls; ` +
        `would exceed cap of ${client.maxRequests}`,
    );
  }

  const inventory = new Map<string, InventoryResponse>();
  for (const date of dates) {
    const p = `search-inventory/${date}/2,3`;
    inventory.set(date, assertInventory(await client.get(p), p));
  }

  const daily: DailyServicesResponse[] = [];
  for (const date of repDates) {
    const p = `daily-services/${date}`;
    daily.push(assertDailyServices(await client.get(p), p));
  }
  const { timetable, conflicts } = buildTimetable(daily);
  for (const id of conflicts) {
    console.log(`::warning title=Sagano timetable conflict::train ${id} has different stops across service patterns; kept the first`);
  }

  const iso = now.toISOString();
  return {
    updatedAt: iso,
    fetchedAt: iso,
    saleWindowEnd: windowEnd,
    stale: false,
    timetable,
    days: buildDays(calendar, inventory, today, windowEnd),
  };
}

/** One line per day (and per timetable train), so a moved seat count is a one-line diff. */
export function serialize(data: SaganoDays): string {
  const out = [
    '{',
    `  "updatedAt": ${JSON.stringify(data.updatedAt)},`,
    `  "fetchedAt": ${JSON.stringify(data.fetchedAt)},`,
    `  "saleWindowEnd": ${JSON.stringify(data.saleWindowEnd)},`,
    `  "stale": ${JSON.stringify(data.stale)},`,
  ];
  if (data.timetable) {
    const ids = Object.keys(data.timetable);
    if (ids.length === 0) out.push('  "timetable": {},');
    else {
      out.push('  "timetable": {');
      ids.forEach((id, i) => {
        out.push(`    ${JSON.stringify(id)}: ${JSON.stringify(data.timetable![id])}${i < ids.length - 1 ? ',' : ''}`);
      });
      out.push('  },');
    }
  }
  out.push('  "days": [');
  data.days.forEach((day, i) => {
    out.push(`    ${JSON.stringify(day)}${i < data.days.length - 1 ? ',' : ''}`);
  });
  out.push('  ]', '}');
  return out.join('\n') + '\n';
}

function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

/** Mark the previous file stale. Returns false when there is no usable previous file. */
function markStale(file: string, now: Date): boolean {
  let prev: SaganoDays;
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf-8')) as SaganoDays;
  } catch {
    return false;
  }
  writeAtomic(file, serialize({ ...prev, stale: true, updatedAt: now.toISOString() }));
  return true;
}

/** Fetch and write; returns the process exit code. */
export async function fetchAndWrite(opts: {
  client: SaganoClient;
  today: string;
  now: Date;
  outPath: string;
}): Promise<number> {
  const { client, today, now, outPath } = opts;
  try {
    const data = await run({ client, today, now });
    writeAtomic(outPath, serialize(data));
    console.log(
      `Sagano: ${data.days.length} days, window ends ${data.saleWindowEnd}, ` +
        `${Object.keys(data.timetable ?? {}).length} timetable trains, ` +
        `${client.requestCount()}/${client.maxRequests} requests`,
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const kept = markStale(outPath, now);
    console.log(
      `::warning title=Sagano fetch failed::${msg} (${client.requestCount()} requests; ` +
        `${kept ? 'previous days.json kept and marked stale' : 'no previous days.json, nothing written'})`,
    );
    return 1;
  }
}

async function main() {
  const code = await fetchAndWrite({
    client: createClient(),
    today: todayJST(),
    now: new Date(),
    outPath: DAYS_PATH,
  });
  process.exit(code);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

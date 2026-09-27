/**
 * Pure Sagano logic: sale window, which months/dates to fetch, and how an API
 * service becomes a train row. No I/O here, so everything is fixture-testable.
 */

import { addDays } from '../dates';

export type ServicePattern = 'ORDINARY' | 'SPECIAL' | 'SUSPENDED';

/** One entry of `services-pattern-calendar/{yyyy-mm}`. */
export interface CalendarDay {
  date: string;
  service_pattern: ServicePattern;
}

export interface CalendarResponse {
  service_days: CalendarDay[];
}

/** One service of `search-inventory/{date}/2,3` (only the fields we read). */
export interface ApiService {
  id: string;
  available: boolean;
  name: { short_name: string; labels?: Array<{ language_id: string; text: string }> };
  departure_hhmm: string;
  arrival_hhmm: string;
  state: string;
  inventories: Array<{ num: number; total_num: number }>;
}

export interface InventoryResponse {
  down_services: ApiService[];
  up_services: ApiService[];
}

export interface Train {
  id: string;
  name: string;
  departure: string;
  arrival: string;
  available: boolean;
  state: string;
  remaining: number;
  total: number;
}

export interface Day {
  date: string;
  /** `null` = the date is not in the calendar (off-season). */
  servicePattern: ServicePattern | null;
  down?: Train[];
  up?: Train[];
}

export interface SaganoDays {
  updatedAt: string;
  fetchedAt: string;
  saleWindowEnd: string;
  stale: boolean;
  days: Day[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Last day-of-month for a 1-based month. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** [year, month] of the month after `date` (1-based month). */
function nextMonthOf(date: string): [number, number] {
  const [y, m] = date.split('-').map(Number);
  return m === 12 ? [y + 1, 1] : [y, m + 1];
}

/**
 * A date goes on sale on the same day of the previous month, so the window
 * ends on the same day next month — or that month's last day when it has no
 * such day (01-31 -> 02-28).
 */
export function saleWindowEnd(today: string): string {
  const d = Number(today.slice(8, 10));
  const [ny, nm] = nextMonthOf(today);
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDayOfMonth(ny, nm)))}`;
}

/** Current and next month as `YYYY-MM`. */
export function monthsToFetch(today: string): string[] {
  const [ny, nm] = nextMonthOf(today);
  return [today.slice(0, 7), `${ny}-${pad(nm)}`];
}

/** Every date from the 1st of the current month to the last of the next. */
export function coveredDates(today: string): string[] {
  const [ny, nm] = nextMonthOf(today);
  const end = `${ny}-${pad(nm)}-${pad(lastDayOfMonth(ny, nm))}`;
  const out: string[] = [];
  for (let d = `${today.slice(0, 7)}-01`; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Merge calendar responses into date -> pattern (later responses win). */
export function mergeCalendars(responses: CalendarResponse[]): Map<string, ServicePattern> {
  const map = new Map<string, ServicePattern>();
  for (const r of responses) for (const d of r.service_days) map.set(d.date, d.service_pattern);
  return map;
}

/** Dates inside [today, windowEnd] that need a `search-inventory` call. */
export function inventoryDates(
  calendar: Map<string, ServicePattern>,
  today: string,
  windowEnd: string,
): string[] {
  const out: string[] = [];
  for (let d = today; d <= windowEnd; d = addDays(d, 1)) {
    const p = calendar.get(d);
    if (p && p !== 'SUSPENDED') out.push(d);
  }
  return out;
}

export function toTrain(s: ApiService): Train {
  const zh = s.name.labels?.find(l => l.language_id === 'zh-hant')?.text;
  let remaining = 0;
  let total = 0;
  for (const car of s.inventories) {
    remaining += car.num;
    total += car.total_num;
  }
  return {
    id: s.id,
    name: zh ?? s.name.short_name,
    departure: s.departure_hhmm,
    arrival: s.arrival_hhmm,
    available: s.available,
    state: s.state,
    remaining,
    total,
  };
}

/**
 * Every date of the current and next month. Only non-SUSPENDED calendar days
 * within [today, windowEnd] carry `down`/`up`; each of those must be present
 * in `inventoryByDate`, otherwise this throws rather than emit a partial file.
 */
export function buildDays(
  calendar: Map<string, ServicePattern>,
  inventoryByDate: Map<string, InventoryResponse>,
  today: string,
  windowEnd: string,
): Day[] {
  const wanted = new Set(inventoryDates(calendar, today, windowEnd));
  return coveredDates(today).map(date => {
    const day: Day = { date, servicePattern: calendar.get(date) ?? null };
    if (wanted.has(date)) {
      const inv = inventoryByDate.get(date);
      if (!inv) throw new Error(`missing inventory for ${date}`);
      day.down = inv.down_services.map(toTrain);
      day.up = inv.up_services.map(toTrain);
    }
    return day;
  });
}

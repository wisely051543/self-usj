/** Date helpers shared by the fetcher and the sources. All dates are YYYY-MM-DD. */

/** Today in JST, independent of the runner's local timezone. */
export function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/** Shift a date by whole days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Which day of the week a date falls on — 0=Sun … 6=Sat, locale-neutral.
 *
 * Computed in UTC so the runner's timezone cannot shift it. It lives here
 * rather than beside the source parser because the snapshot now labels dates
 * the store never returned a row for, and a second copy of the formula is a
 * second thing to keep in step.
 */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The day after `date` — the calendar API's end bound is exclusive-ish. */
export function nextDay(date: string): string {
  return addDays(date, 1);
}

/** Every `step`-th day from `start` up to and including `end`. */
export function everyNthDay(start: string, end: string, step: number): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, step)) out.push(d);
  return out;
}

/**
 * Shift a date by whole months. Overflowing days roll into the next month the
 * way Date does (2026-03-31 minus 1 month -> 2026-03-03), which is fine here:
 * the result is only ever used as a range bound.
 */
export function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + months, d));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

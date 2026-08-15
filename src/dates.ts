/** Date helpers shared by the fetcher and the sources. All dates are YYYY-MM-DD. */

/** Today in JST, independent of the runner's local timezone. */
export function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/** The day after `date` — the calendar API's end bound is exclusive-ish. */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
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

/**
 * `dayOfWeek` pinned against known calendar dates.
 *
 * Every one of these expectations is a literal, deliberately. `dayOfWeek` is
 * the sole labeller of every row in the snapshot grid and of every `DateSlot`
 * the source parses, and the site colours its weekends from the number it
 * returns — so an off-by-one here mislabels the whole calendar. A test that
 * fed the function's own output back to it (or compared it to a second copy of
 * the same arithmetic) would pass through exactly that mutation, which is the
 * one class of bug worth spending a test on here.
 *
 * The anchors below are chosen so the arithmetic cannot be right by accident:
 * two dates everyone can check from memory, both weekend ends, both sides of a
 * leap day, both sides of a leap day that does *not* happen (1900-style century
 * rule, next occurring in 2100), and both sides of a year boundary.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOfWeek } from './dates';

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

const KNOWN: Array<[string, number, string]> = [
  ['1970-01-01', THU, 'the Unix epoch was a Thursday'],
  ['2000-01-01', SAT, 'Y2K was a Saturday'],

  // Both weekend ends, so a shift in either direction is caught.
  ['2026-08-22', SAT, 'a Saturday'],
  ['2026-08-23', SUN, 'the Sunday after it'],

  // A leap day and its neighbours: 2024-02-29 exists.
  ['2024-02-28', WED, 'the day before a leap day'],
  ['2024-02-29', THU, 'the leap day itself'],
  ['2024-03-01', FRI, 'the day after a leap day'],

  // The same month boundary in a common year, one day shorter.
  ['2023-02-28', TUE, 'the last day of a common-year February'],
  ['2023-03-01', WED, 'the day after it'],

  // 2100 is divisible by 4 but not a leap year — the century rule. A hand-rolled
  // date routine that missed it would land a day out from here onwards.
  ['2100-02-28', SUN, 'the last day of February in a skipped leap year'],
  ['2100-03-01', MON, 'the day after it — there is no 2100-02-29'],

  // A year boundary.
  ['2026-12-31', THU, 'the last day of the year'],
  ['2027-01-01', FRI, 'the first day of the next'],
];

test('dayOfWeek returns the real weekday for known dates, 0=Sun … 6=Sat', () => {
  for (const [date, expected, why] of KNOWN) {
    assert.equal(dayOfWeek(date), expected, `${date} is ${why} (expected ${expected})`);
  }
});

test('dayOfWeek advances by exactly one per day and wraps at 7', () => {
  // Walks a full week from a pinned Saturday, so a formula that is internally
  // consistent but rotated cannot satisfy both this and the anchors above.
  const week = ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  assert.deepEqual(week.map(dayOfWeek), [SAT, SUN, MON, TUE, WED, THU, FRI]);
});

test('dayOfWeek does not depend on the process timezone', () => {
  // The runner's TZ is not the store's. Reading a date as local time would slide
  // the answer by a day for anyone west of UTC, which CI would never show.
  //
  // Asserting invariance is only worth something if the timezone is actually
  // moving. `dayOfWeek` reads UTC by construction, so if the runtime ignored
  // `process.env.TZ` this loop would pass while proving nothing — it would be
  // four copies of the same assertion. The canary is a plain local-time read of
  // one instant: across a UTC+14 and a UTC-7 zone that instant falls on
  // different local days, so a runtime that does not honour the change fails
  // here rather than quietly reporting a green tautology.
  const before = process.env.TZ;
  const localWeekdays = new Set<number>();
  try {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      localWeekdays.add(new Date('2026-08-22T13:00:00Z').getDay());
      assert.equal(dayOfWeek('2026-08-22'), SAT, `2026-08-22 is a Saturday regardless of TZ=${tz}`);
      assert.equal(dayOfWeek('2026-08-23'), SUN, `2026-08-23 is a Sunday regardless of TZ=${tz}`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }

  assert.ok(
    localWeekdays.size > 1,
    'the timezone never actually changed, so the invariance assertions above proved nothing — ' +
      `2026-08-22T13:00Z read as local time gave the same weekday in every zone (${[...localWeekdays]})`,
  );
});

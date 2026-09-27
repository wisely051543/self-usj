import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildDays, CalendarResponse, InventoryResponse, mergeCalendars } from './core';

// The page script is a classic browser script at repo root; it exports its
// pure helpers when `module` exists, so it can be required here without a build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const page = require('../../sagano.js');

const t = (id: string, departure: string, remaining: number, name = `車${id}`) => ({
  id, name, departure, arrival: '', available: remaining > 0, state: 'ORDINARY', remaining, total: 240,
});

const ORDINARY_DOWN = [
  t('46', '11:02', 26), t('44', '09:02', 70, '嵯峨野1號'), t('45', '10:02', 0),
];
const SPECIAL_DOWN = [...ORDINARY_DOWN, t('52', '17:10', 249, '嵯峨野81號')];

const DAYS = [
  { date: '2026-09-26', servicePattern: 'SPECIAL', down: SPECIAL_DOWN, up: [t('54', '09:30', 5)] }, // past
  { date: '2026-09-28', servicePattern: 'ORDINARY', down: ORDINARY_DOWN, up: [t('55', '10:30', 58), t('54', '09:30', 116)] },
  { date: '2026-09-27', servicePattern: 'SPECIAL', down: SPECIAL_DOWN, up: [t('62', '17:43', 268), t('54', '09:30', 7)] },
  { date: '2026-09-29', servicePattern: 'SUSPENDED' },
  { date: '2026-09-30', servicePattern: 'ORDINARY', up: [t('54', '09:30', 1)] }, // no down array
  { date: '2026-10-14', servicePattern: 'ORDINARY', down: [], up: [] }, // no trains
  { date: '2026-11-30', servicePattern: null }, // beyond window
];

const TODAY = '2026-09-27';

test('down: rows are dates >= today with a down array, ascending; columns union sorted by departure', () => {
  const m = page.buildMatrix(DAYS, 'down', TODAY);
  assert.deepEqual(m.rows.map((r: { date: string }) => r.date), ['2026-09-27', '2026-09-28']);
  assert.deepEqual(m.columns.map((c: { departure: string }) => c.departure), ['09:02', '10:02', '11:02', '17:10']);
  assert.deepEqual(m.columns[0], { id: '44', departure: '09:02', name: '嵯峨野1號' });
  assert.deepEqual(m.columns[3], { id: '52', departure: '17:10', name: '嵯峨野81號' });
});

test('down: cell is remaining, 0 stays 0, missing train is null', () => {
  const m = page.buildMatrix(DAYS, 'down', TODAY);
  assert.deepEqual(m.rows[0].cells, [70, 0, 26, 249]);
  assert.deepEqual(m.rows[1].cells, [70, 0, 26, null]);
});

test('up: uses up[] and its own columns; days without up array are skipped', () => {
  const m = page.buildMatrix(DAYS, 'up', TODAY);
  assert.deepEqual(m.rows.map((r: { date: string }) => r.date), ['2026-09-27', '2026-09-28', '2026-09-30']);
  assert.deepEqual(m.columns.map((c: { departure: string }) => c.departure), ['09:30', '10:30', '17:43']);
  assert.deepEqual(m.rows.map((r: { cells: unknown[] }) => r.cells), [
    [7, null, 268],
    [116, 58, null],
    [1, null, null],
  ]);
});

test('column count comes from data: real days.json shape gives 9 down / 9 up on SPECIAL window', () => {
  const special = { date: '2026-10-10', servicePattern: 'SPECIAL',
    down: ['09:02', '10:02', '11:02', '12:02', '13:02', '14:02', '15:02', '16:02', '17:10'].map((d, i) => t(String(44 + i), d, i)),
  };
  const ordinary = { date: '2026-10-09', servicePattern: 'ORDINARY', down: special.down.slice(0, 8) };
  const m = page.buildMatrix([special, ordinary], 'down', TODAY);
  assert.equal(m.columns.length, 9);
  assert.equal(m.rows[0].date, '2026-10-09');
  assert.equal(m.rows[0].cells[8], null);
  assert.equal(page.buildMatrix([ordinary], 'down', TODAY).columns.length, 8);
});

test('bad input yields an empty matrix, not a throw', () => {
  assert.deepEqual(page.buildMatrix(undefined, 'down', TODAY), { columns: [], rows: [] });
  assert.deepEqual(page.buildMatrix([null, {}], 'down', TODAY), { columns: [], rows: [] });
});

test('todayJST rolls over at 15:00 UTC', () => {
  assert.equal(page.todayJST(Date.parse('2026-09-27T14:59:59Z')), '2026-09-27');
  assert.equal(page.todayJST(Date.parse('2026-09-27T15:00:00Z')), '2026-09-28');
});

test('isStale: stale flag, age over 90 min, boundary, bad timestamp', () => {
  const fetchedAt = '2026-09-27T03:00:00.000Z';
  const base = Date.parse(fetchedAt);
  assert.equal(page.STALE_MS, 90 * 60 * 1000);
  assert.equal(page.isStale({ fetchedAt, stale: false }, base + 10 * 60 * 1000), false);
  assert.equal(page.isStale({ fetchedAt, stale: true }, base), true);
  assert.equal(page.isStale({ fetchedAt, stale: false }, base + page.STALE_MS), false);
  assert.equal(page.isStale({ fetchedAt, stale: false }, base + page.STALE_MS + 1), true);
  assert.equal(page.isStale({ fetchedAt, stale: false }, base + 91 * 60 * 1000), true);
  assert.equal(page.isStale({ fetchedAt: 'nope', stale: false }, base), true);
});

test('fmtJST shows Japan time with JST suffix', () => {
  const s = page.fmtJST('2026-09-27T03:23:31.528Z');
  assert.match(s, /2026/);
  assert.match(s, /12:23/);
  assert.match(s, /JST$/);
  assert.equal(page.fmtJST(undefined), '—');
});

test('checkDays rejects bodies that are not days.json', () => {
  assert.throws(() => page.checkDays(null), /資料格式不符/);
  assert.throws(() => page.checkDays({ days: 'x' }), /資料格式不符/);
  const ok = { days: [] };
  assert.equal(page.checkDays(ok), ok);
});

test('real producer output: buildDays/toTrain over 2026-10 fixtures feeds buildMatrix', () => {
  const fx = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8'));
  const calendar: CalendarResponse = fx('calendar-2026-10.json');
  const inv1010: InventoryResponse = fx('search-inventory-2026-10-10.json');
  const days = buildDays(mergeCalendars([calendar]), new Map([['2026-10-10', inv1010]]), '2026-10-10', '2026-10-10');
  const day = days.find(d => d.date === '2026-10-10')!;
  const expected = [...day.down!]
    .sort((a, b) => (a.departure < b.departure ? -1 : a.departure > b.departure ? 1 : 0))
    .map(tr => tr.remaining);
  const m = page.buildMatrix(days, 'down', '2026-10-10');
  assert.equal(m.columns.length, 9);
  const row = m.rows.find((r: { date: string }) => r.date === '2026-10-10');
  assert.ok(row);
  assert.deepEqual(row.cells, expected);
});

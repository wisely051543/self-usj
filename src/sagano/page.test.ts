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
const WINDOW_END = '2026-10-27';

type Cell = { remaining: number; state: string } | null;
type Row = { date: string; status: string; cells: Cell[] };
const statuses = (m: { rows: Row[] }) => m.rows.map(r => `${r.date} ${r.status}`);
const cellText = (r: Row) => r.cells.map(c => (c ? `${c.remaining}:${c.state}` : null));

test('down: every date >= today is a row with its status; columns come from open rows, sorted by departure', () => {
  const m = page.buildMatrix(DAYS, 'down', TODAY, WINDOW_END);
  assert.deepEqual(statuses(m), [
    '2026-09-27 open',
    '2026-09-28 open',
    '2026-09-29 suspended',
    '2026-09-30 suspended', // runs up only
    '2026-10-14 suspended', // no trains at all
    '2026-11-30 notOnSale',
  ]);
  assert.deepEqual(m.columns.map((c: { departure: string }) => c.departure), ['09:02', '10:02', '11:02', '17:10']);
  assert.deepEqual(m.columns[0], { id: '44', departure: '09:02', name: '嵯峨野1號' });
  assert.deepEqual(m.columns[3], { id: '52', departure: '17:10', name: '嵯峨野81號' });
});

test('down: open cells carry remaining and state; remaining 0 is soldout; missing train is null; other rows have no cells', () => {
  const m = page.buildMatrix(DAYS, 'down', TODAY, WINDOW_END);
  assert.deepEqual(cellText(m.rows[0]), ['70:ok', '0:soldout', '26:ok', '249:ok']);
  assert.deepEqual(cellText(m.rows[1]), ['70:ok', '0:soldout', '26:ok', null]);
  for (const r of m.rows.slice(2)) assert.deepEqual(r.cells, []);
});

test('up: uses up[] and its own columns; scarce below threshold', () => {
  const m = page.buildMatrix(DAYS, 'up', TODAY, WINDOW_END);
  assert.deepEqual(statuses(m), [
    '2026-09-27 open', '2026-09-28 open', '2026-09-29 suspended',
    '2026-09-30 open', '2026-10-14 suspended', '2026-11-30 notOnSale',
  ]);
  assert.deepEqual(m.columns.map((c: { departure: string }) => c.departure), ['09:30', '10:30', '17:43']);
  assert.deepEqual(m.rows.filter((r: Row) => r.status === 'open').map(cellText), [
    ['7:scarce', null, '268:ok'],
    ['116:ok', '58:ok', null],
    ['1:scarce', null, null],
  ]);
});

test('scarcity threshold is 20: 19 scarce, 20 ok, 1 scarce; available:false is soldout whatever remaining says', () => {
  assert.equal(page.SCARCE_THRESHOLD, 20);
  const day = { date: '2026-10-01', servicePattern: 'ORDINARY', down: [
    t('44', '09:02', 19), t('45', '10:02', 20), t('46', '11:02', 1),
    { ...t('47', '12:02', 12), available: false },
  ] };
  const m = page.buildMatrix([day], 'down', TODAY, WINDOW_END);
  assert.deepEqual(cellText(m.rows[0]), ['19:scarce', '20:ok', '1:scarce', '12:soldout']);
});

test('not on sale is decided by saleWindowEnd only: trains beyond it and SUSPENDED beyond it both read notOnSale', () => {
  const days = [
    { date: '2026-10-27', servicePattern: 'ORDINARY', down: ORDINARY_DOWN },
    { date: '2026-10-28', servicePattern: 'ORDINARY', down: ORDINARY_DOWN }, // stock the API reports anyway
    { date: '2026-10-29', servicePattern: 'SUSPENDED' },
  ];
  const m = page.buildMatrix(days, 'down', TODAY, WINDOW_END);
  assert.deepEqual(statuses(m), ['2026-10-27 open', '2026-10-28 notOnSale', '2026-10-29 notOnSale']);
});

test('column count comes from data: real days.json shape gives 9 down / 9 up on SPECIAL window', () => {
  const special = { date: '2026-10-10', servicePattern: 'SPECIAL',
    down: ['09:02', '10:02', '11:02', '12:02', '13:02', '14:02', '15:02', '16:02', '17:10'].map((d, i) => t(String(44 + i), d, i + 30)),
  };
  const ordinary = { date: '2026-10-09', servicePattern: 'ORDINARY', down: special.down.slice(0, 8) };
  const m = page.buildMatrix([special, ordinary], 'down', TODAY, WINDOW_END);
  assert.equal(m.columns.length, 9);
  assert.equal(m.rows[0].date, '2026-10-09');
  assert.equal(m.rows[0].cells[8], null);
  assert.equal(page.buildMatrix([ordinary], 'down', TODAY, WINDOW_END).columns.length, 8);
});

test('bad input yields an empty matrix, not a throw', () => {
  assert.deepEqual(page.buildMatrix(undefined, 'down', TODAY, WINDOW_END), { columns: [], rows: [] });
  assert.deepEqual(page.buildMatrix([null, {}], 'down', TODAY, WINDOW_END), { columns: [], rows: [] });
});

test('daily total: open rows sum remaining over the direction (sold-out as 0); suspended / notOnSale rows have none', () => {
  const down = page.buildMatrix(DAYS, 'down', TODAY, WINDOW_END);
  const totals = (m: { rows: Array<Row & { total?: number }> }) => m.rows.map(r => `${r.date} ${r.total}`);
  assert.deepEqual(totals(down), [
    '2026-09-27 345', // 70 + 0 + 26 + 249
    '2026-09-28 96', // 70 + 0 (sold out) + 26
    '2026-09-29 undefined',
    '2026-09-30 undefined',
    '2026-10-14 undefined',
    '2026-11-30 undefined',
  ]);
  const up = page.buildMatrix(DAYS, 'up', TODAY, WINDOW_END);
  assert.deepEqual(totals(up).slice(0, 4), ['2026-09-27 275', '2026-09-28 174', '2026-09-29 undefined', '2026-09-30 1']);

  // available:false counts as 0 whatever remaining says.
  const day = { date: '2026-10-01', servicePattern: 'ORDINARY', down: [
    t('44', '09:02', 70), { ...t('45', '10:02', 12), available: false }, t('46', '11:02', 26),
  ] };
  assert.equal(page.buildMatrix([day], 'down', TODAY, WINDOW_END).rows[0].total, 96);
  // A date past saleWindowEnd is notOnSale, and non-open rows never carry a total.
  assert.equal(page.buildMatrix([{ ...day, date: '2026-10-28' }], 'down', TODAY, WINDOW_END).rows[0].total, undefined);
});

test('stopsFor: returns the train stops, null when absent or when days.json predates the timetable', () => {
  const stops = [
    { station: '小火車嵯峨', arrival: '', departure: '09:02' },
    { station: '小火車嵐山', arrival: '09:05', departure: '09:05' },
  ];
  const data = { days: [], saleWindowEnd: 'x', timetable: { '44': stops } };
  assert.equal(page.stopsFor(data, '44'), stops);
  assert.equal(page.stopsFor(data, 44), stops);
  assert.equal(page.stopsFor(data, '45'), null);
  assert.equal(page.stopsFor(data, 'toString'), null);
  assert.equal(page.stopsFor({ days: [], saleWindowEnd: 'x' }, '44'), null);
  assert.equal(page.stopsFor(null, '44'), null);
  assert.equal(page.stopsFor({ timetable: { '44': [] } }, '44'), null);
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
  assert.throws(() => page.checkDays({ days: [] }), /資料格式不符/); // no saleWindowEnd
  const ok = { days: [], saleWindowEnd: '2026-10-27' };
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
  const m = page.buildMatrix(days, 'down', '2026-10-10', '2026-10-10');
  assert.equal(m.columns.length, 9);
  const row = m.rows.find((r: Row) => r.date === '2026-10-10');
  assert.ok(row);
  assert.deepEqual(row.cells.map((c: Cell) => c && c.remaining), expected);
});

test('real producer output: 10/14 SUSPENDED and an empty-inventory day read 運休, dates past the window 尚未開賣', () => {
  const fx = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8'));
  const calendar: CalendarResponse = fx('calendar-2026-10.json');
  const inv1010: InventoryResponse = fx('search-inventory-2026-10-10.json');
  const inv1014: InventoryResponse = fx('search-inventory-2026-10-14.json');
  const merged = mergeCalendars([calendar]);
  assert.equal(merged.get('2026-10-14'), 'SUSPENDED');
  const windowEnd = '2026-10-15';
  // 10/13 as the "calendar says ORDINARY but search-inventory is empty" case.
  merged.set('2026-10-13', 'ORDINARY');
  const inv = new Map<string, InventoryResponse>();
  for (const d of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-15']) inv.set(d, inv1010);
  inv.set('2026-10-13', inv1014);
  const days = buildDays(merged, inv, '2026-10-10', windowEnd);
  const byDate = new Map(page.buildMatrix(days, 'down', '2026-10-10', windowEnd).rows.map((r: Row) => [r.date, r]));
  assert.equal((byDate.get('2026-10-13') as Row).status, 'suspended');
  assert.equal((byDate.get('2026-10-14') as Row).status, 'suspended');
  assert.equal((byDate.get('2026-10-15') as Row).status, 'open');
  assert.equal((byDate.get('2026-10-16') as Row).status, 'notOnSale');
  assert.equal((byDate.get('2026-11-30') as Row).status, 'notOnSale');
  assert.deepEqual((byDate.get('2026-10-16') as Row).cells, []);
});

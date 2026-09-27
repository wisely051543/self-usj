import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildDays,
  CalendarResponse,
  InventoryResponse,
  mergeCalendars,
  monthsToFetch,
  saleWindowEnd,
  toTrain,
} from './core';
import { createClient, FetchFailedError, RequestCapError } from './client';
import { fetchAndWrite, run, serialize } from './fetch';

const fx = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8'));
const CALENDAR: CalendarResponse = fx('calendar-2026-10.json');
const INV_1010: InventoryResponse = fx('search-inventory-2026-10-10.json');
const INV_1014: InventoryResponse = fx('search-inventory-2026-10-14.json');

const noSleep = () => Promise.resolve();
const fast = { minGapMs: 0, retryDelaysMs: [0, 0, 0], sleep: noSleep };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Fake fetch serving fixtures; records every URL it was asked for. */
function fixtureFetch() {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    assert.equal(init?.method ?? 'GET', 'GET');
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    if (url.includes('/services-pattern-calendar/')) return json(CALENDAR);
    if (url.includes('/search-inventory/2026-10-14/')) return json(INV_1014);
    if (url.includes('/search-inventory/')) return json(INV_1010);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { impl, urls };
}

test('sale window: normal, month-end clamp, year rollover', () => {
  assert.equal(saleWindowEnd('2026-09-27'), '2026-10-27');
  assert.equal(saleWindowEnd('2026-01-31'), '2026-02-28');
  assert.equal(saleWindowEnd('2028-01-31'), '2028-02-29');
  assert.equal(saleWindowEnd('2026-03-31'), '2026-04-30');
  assert.equal(saleWindowEnd('2026-12-15'), '2027-01-15');
  assert.deepEqual(monthsToFetch('2026-12-15'), ['2026-12', '2027-01']);
  assert.deepEqual(monthsToFetch('2026-09-27'), ['2026-09', '2026-10']);
});

test('toTrain sums num/total_num across all cars of the 2,3 arrangement-type inventory and uses zh-hant label', () => {
  const t = toTrain(INV_1010.down_services[0]);
  assert.deepEqual(t, {
    id: '44', name: '嵯峨野1號', departure: '09:02', arrival: '09:25',
    available: true, state: 'ORDINARY', remaining: 71, total: 240,
  });
  const noZh = { ...INV_1010.down_services[0], name: { short_name: 'X1号', labels: [] } };
  assert.equal(toTrain(noZh).name, 'X1号');
});

test('buildDays: SPECIAL has 9 trains each way incl. 81/82號; empty inventory; absent date', () => {
  const cal = mergeCalendars([
    { service_days: [
      { date: '2026-10-10', service_pattern: 'SPECIAL' },
      { date: '2026-10-11', service_pattern: 'ORDINARY' },
      { date: '2026-10-12', service_pattern: 'SUSPENDED' },
    ] },
  ]);
  const inv = new Map([['2026-10-10', INV_1010], ['2026-10-11', INV_1014]]);
  const days = buildDays(cal, inv, '2026-10-10', '2026-10-12');
  assert.equal(days[0].date, '2026-10-01');
  assert.equal(days.at(-1)!.date, '2026-11-30');
  const byDate = new Map(days.map(d => [d.date, d]));

  const special = byDate.get('2026-10-10')!;
  assert.equal(special.servicePattern, 'SPECIAL');
  assert.equal(special.down!.length, 9);
  assert.equal(special.up!.length, 9);
  assert.ok(special.down!.some(t => t.name === '嵯峨野81號'));
  assert.ok(special.up!.some(t => t.name === '嵯峨野82號'));

  assert.deepEqual(byDate.get('2026-10-11'), { date: '2026-10-11', servicePattern: 'ORDINARY', down: [], up: [] });
  assert.deepEqual(byDate.get('2026-10-12'), { date: '2026-10-12', servicePattern: 'SUSPENDED' });
  assert.deepEqual(byDate.get('2026-10-13'), { date: '2026-10-13', servicePattern: null });
  assert.deepEqual(byDate.get('2026-10-09'), { date: '2026-10-09', servicePattern: null });
});

test('run: happy path fetches only non-SUSPENDED window days', async () => {
  const { impl, urls } = fixtureFetch();
  const client = createClient(impl, fast);
  const data = await run({ client, today: '2026-09-27', now: new Date('2026-09-27T01:00:00Z') });

  assert.equal(data.saleWindowEnd, '2026-10-27');
  assert.equal(data.stale, false);
  assert.equal(data.fetchedAt, '2026-09-27T01:00:00.000Z');
  assert.equal(data.days.length, 30 + 31);

  const cal = mergeCalendars([CALENDAR]);
  const expected: string[] = [];
  for (const [date, p] of cal) {
    if (date >= '2026-09-27' && date <= '2026-10-27' && p !== 'SUSPENDED') expected.push(date);
  }
  const invUrls = urls.filter(u => u.includes('/search-inventory/'));
  assert.equal(urls.length, 2 + expected.length);
  assert.ok(urls.length <= 60);
  assert.deepEqual(invUrls.map(u => u.split('/').at(-2)), expected);
  assert.ok(invUrls.every(u => u.endsWith('/2,3')));
  assert.equal(expected.at(-1), '2026-10-27');
  assert.ok(!invUrls.some(u => u.includes('2026-10-14')), 'no request for SUSPENDED 10-14');

  const d1014 = data.days.find(d => d.date === '2026-10-14')!;
  assert.deepEqual(d1014, { date: '2026-10-14', servicePattern: 'SUSPENDED' });
  const d1028 = data.days.find(d => d.date === '2026-10-28')!;
  assert.equal(d1028.down, undefined, 'outside the sale window carries no trains');
  const d0926 = data.days.find(d => d.date === '2026-09-26')!;
  assert.equal(d0926.down, undefined, 'past days carry no trains');
  assert.equal(data.days.find(d => d.date === '2026-10-10')!.down!.length, 9);
});

test('run: aborts before any inventory call when the window exceeds the cap', async () => {
  const { impl, urls } = fixtureFetch();
  const client = createClient(impl, { ...fast, maxRequests: 10 });
  await assert.rejects(
    run({ client, today: '2026-09-27', now: new Date() }),
    RequestCapError,
  );
  assert.equal(urls.length, 2);
  assert.ok(urls.every(u => u.includes('/services-pattern-calendar/')));
});

test('client: never issues a request past the cap', async () => {
  let calls = 0;
  const impl = (async () => { calls++; return json({}); }) as unknown as typeof fetch;
  const client = createClient(impl, { ...fast, maxRequests: 3 });
  for (let i = 0; i < 3; i++) await client.get('x');
  await assert.rejects(client.get('x'), RequestCapError);
  assert.equal(calls, 3);
  assert.equal(client.requestCount(), 3);
});

test('client: retries 5xx then fails; bad JSON and 4xx fail without retry', async () => {
  let calls = 0;
  const c5 = createClient((async () => { calls++; return new Response('', { status: 503 }); }) as unknown as typeof fetch, fast);
  await assert.rejects(c5.get('x'), FetchFailedError);
  assert.equal(calls, 4);

  calls = 0;
  const cBad = createClient((async () => { calls++; return new Response('<html>', { status: 200 }); }) as unknown as typeof fetch, fast);
  await assert.rejects(cBad.get('x'), FetchFailedError);
  assert.equal(calls, 1);

  calls = 0;
  const c404 = createClient((async () => { calls++; return new Response('', { status: 404 }); }) as unknown as typeof fetch, fast);
  await assert.rejects(c404.get('x'), FetchFailedError);
  assert.equal(calls, 1);

  calls = 0;
  let n = 0;
  const cFlaky = createClient((async () => {
    calls++;
    if (n++ === 0) throw new TypeError('network down');
    return json({ ok: 1 });
  }) as unknown as typeof fetch, fast);
  assert.deepEqual(await cFlaky.get('x'), { ok: 1 });
  assert.equal(calls, 2);
});

test('fetchAndWrite: 5xx exhaustion keeps previous file, only stale/updatedAt change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sagano-'));
  const out = path.join(dir, 'sagano', 'days.json');
  const failing = (async () => new Response('', { status: 502 })) as unknown as typeof fetch;
  const log = console.log;
  console.log = () => undefined;
  try {
    // No previous file -> nothing written, non-zero exit.
    const code0 = await fetchAndWrite({ client: createClient(failing, fast), today: '2026-09-27', now: new Date(), outPath: out });
    assert.notEqual(code0, 0);
    assert.equal(fs.existsSync(out), false);

    // Successful run writes the file.
    const { impl } = fixtureFetch();
    const ok = await fetchAndWrite({ client: createClient(impl, fast), today: '2026-09-27', now: new Date('2026-09-27T01:00:00Z'), outPath: out });
    assert.equal(ok, 0);
    const prev = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(prev.stale, false);

    const now = new Date('2026-09-27T01:30:00Z');
    const code = await fetchAndWrite({ client: createClient(failing, fast), today: '2026-09-27', now, outPath: out });
    assert.notEqual(code, 0);
    const after = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.deepEqual(after, { ...prev, stale: true, updatedAt: now.toISOString() });
    assert.equal(after.fetchedAt, '2026-09-27T01:00:00.000Z');
    assert.deepEqual(fs.readdirSync(path.dirname(out)), ['days.json'], 'no temp files left behind');

    // Hitting the request cap takes the same stale path.
    const capNow = new Date('2026-09-27T02:00:00Z');
    const capped = await fetchAndWrite({ client: createClient(impl, { ...fast, maxRequests: 10 }), today: '2026-09-27', now: capNow, outPath: out });
    assert.notEqual(capped, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf-8')), { ...prev, stale: true, updatedAt: capNow.toISOString() });
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('serialize round-trips', () => {
  const data = { updatedAt: 'a', fetchedAt: 'b', saleWindowEnd: 'c', stale: false, days: [{ date: 'd', servicePattern: null }] };
  assert.deepEqual(JSON.parse(serialize(data)), data);
});

test('run: next-month calendar 404 is "no days", other calendar errors stay fatal', async () => {
  const dec: CalendarResponse = { service_days: [] };
  for (let d = 1; d <= 29; d++) {
    dec.service_days.push({ date: `2026-12-${String(d).padStart(2, '0')}`, service_pattern: 'ORDINARY' });
  }
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/services-pattern-calendar/2026-12')) return json(dec);
    if (url.endsWith('/services-pattern-calendar/2027-01')) return new Response('', { status: 404 });
    if (url.includes('/search-inventory/')) return json(INV_1014);
    return new Response('', { status: 500 });
  }) as typeof fetch;
  const log = console.log;
  console.log = () => undefined;
  try {
    const data = await run({ client: createClient(impl, fast), today: '2026-12-15', now: new Date() });
    assert.equal(data.saleWindowEnd, '2027-01-15');
    assert.equal(data.days.length, 31 + 31);
    const invDates = urls.filter(u => u.includes('/search-inventory/')).map(u => u.split('/').at(-2));
    assert.equal(invDates.length, 15);
    assert.equal(invDates[0], '2026-12-15');
    assert.equal(invDates.at(-1), '2026-12-29');
    const byDate = new Map(data.days.map(d => [d.date, d]));
    assert.deepEqual(byDate.get('2026-12-30'), { date: '2026-12-30', servicePattern: null });
    assert.deepEqual(byDate.get('2027-01-10'), { date: '2027-01-10', servicePattern: null });
    assert.ok(data.days.filter(d => d.date >= '2027-01-01').every(d => d.servicePattern === null));

    // A non-404 calendar failure is still fatal.
    const forbidden = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(
      run({ client: createClient(forbidden, fast), today: '2026-12-15', now: new Date() }),
      (err: unknown) => err instanceof FetchFailedError && err.status === 403,
    );
  } finally {
    console.log = log;
  }
});

test('client: 429 then 200 recovers with 2 calls', async () => {
  let calls = 0;
  const impl = (async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 429 }) : json({ ok: 1 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await createClient(impl, fast).get('x'), { ok: 1 });
  assert.equal(calls, 2);
});

/**
 * Virtual clock: patches Date.now and hands out a `sleep` that records the
 * requested delay and advances time by it instead of waiting.
 */
async function withVirtualClock(
  fn: (clock: { sleep: (ms: number) => Promise<void>; sleeps: number[]; now: () => number }) => Promise<void>,
): Promise<void> {
  const realNow = Date.now;
  let t = 1_000_000;
  const sleeps: number[] = [];
  Date.now = () => t;
  try {
    await fn({ sleep: async ms => { sleeps.push(ms); t += ms; }, sleeps, now: () => t });
  } finally {
    Date.now = realNow;
  }
}

test('client: default spacing keeps >=1000 ms between request starts', async () => {
  await withVirtualClock(async ({ sleep, sleeps, now }) => {
    const starts: number[] = [];
    const impl = (async () => { starts.push(now()); return json({}); }) as unknown as typeof fetch;
    const client = createClient(impl, { sleep });
    for (let i = 0; i < 4; i++) await client.get('x');
    assert.equal(starts.length, 4);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1000, `gap ${i}`);
    assert.deepEqual(sleeps, [1000, 1000, 1000]);
  });
});

test('client: default backoff is 2s, 4s, 8s then fails', async () => {
  await withVirtualClock(async ({ sleep, sleeps }) => {
    let calls = 0;
    const impl = (async () => { calls++; return new Response('', { status: 503 }); }) as unknown as typeof fetch;
    await assert.rejects(
      createClient(impl, { sleep }).get('x'),
      (err: unknown) => err instanceof FetchFailedError && err.status === 503,
    );
    assert.equal(calls, 4);
    // Each backoff already exceeds the 1 s spacing, so no spacing sleeps appear.
    assert.deepEqual(sleeps, [2000, 4000, 8000]);
  });
});

test('client: overlapping un-awaited gets never have >1 request in flight', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const impl = (async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, 5));
    inFlight--;
    return json({});
  }) as unknown as typeof fetch;
  const client = createClient(impl, fast);
  await Promise.all(Array.from({ length: 5 }, () => client.get('x')));
  assert.equal(maxInFlight, 1);
  assert.equal(client.requestCount(), 5);
});

test('client: every request carries an AbortSignal and only Accept', async () => {
  const inits: Array<RequestInit | undefined> = [];
  const impl = (async (_: unknown, init?: RequestInit) => { inits.push(init); return json({}); }) as unknown as typeof fetch;
  const client = createClient(impl, fast);
  await client.get('a');
  await client.get('b');
  assert.equal(inits.length, 2);
  for (const init of inits) {
    assert.ok(init?.signal instanceof AbortSignal);
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
  }
});

test('client: a timed-out request is retried like a network error', async () => {
  let calls = 0;
  const impl = (async () => {
    calls++;
    if (calls === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return json({ ok: 1 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await createClient(impl, fast).get('x'), { ok: 1 });
  assert.equal(calls, 2);
});

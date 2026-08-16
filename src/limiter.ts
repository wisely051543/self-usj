/**
 * One gate every outbound request goes through.
 *
 * Fanning out over the whole express-pass catalogue turns a run from a few
 * hundred requests into a few thousand, so the store must never see a burst.
 * Concurrency alone does not bound a rate — it bounds how many requests are in
 * flight, and fast replies then arrive as fast as the network allows. This
 * spaces requests apart in time as well, which is the part that keeps the load
 * predictable no matter how quickly the store answers.
 */

/** Sustained ceiling. Raising this is the one change that can turn the fetcher abusive. */
const RATE_LIMIT_PER_SEC = 5;

/** In-flight ceiling, so a slow reply cannot pile a queue up behind it. */
const CONCURRENCY = 4;

/** Minimum gap between two request starts. */
const MIN_GAP_MS = 1000 / RATE_LIMIT_PER_SEC;

/**
 * Backstop for a run that would otherwise grow without bound (a catalogue that
 * suddenly doubles, a slot window that fills up). Callers check `budgetLeft()`
 * and give up the optional work rather than being cut off mid-request.
 */
const MAX_REQUESTS_PER_RUN = 6000;

const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let inFlight = 0;
let nextSlotAt = 0;
let issued = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < CONCURRENCY) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise(resolve => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

/** Requests made so far this run. */
export function requestCount(): number {
  return issued;
}

/** How many more requests the run may make before the backstop trips. */
export function budgetLeft(): number {
  return Math.max(0, MAX_REQUESTS_PER_RUN - issued);
}

export function budgetExhausted(): boolean {
  return budgetLeft() === 0;
}

/**
 * fetch(), rate-limited and retried.
 *
 * 429 and 5xx are retried with a widening delay because they mean "not now"
 * rather than "no" — and the gate is held for the whole wait, so a struggling
 * store is not handed a second request while it is still recovering from the
 * first. Every other response, including 4xx, is handed back untouched for the
 * caller to interpret.
 */
export async function limitedFetch(url: string, init?: RequestInit): Promise<Response> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      const wait = nextSlotAt - Date.now();
      if (wait > 0) await sleep(wait);
      nextSlotAt = Math.max(Date.now(), nextSlotAt) + MIN_GAP_MS;
      issued++;

      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        // A dropped connection is as retryable as a 5xx.
        if (attempt >= RETRY_DELAYS_MS.length) throw err;
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) return res;

      // Drain the body so the socket can be reused for the retry.
      await res.text().catch(() => undefined);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  } finally {
    release();
  }
}

/** Run tasks concurrently, capped by the same ceiling the gate uses. */
export async function mapLimit<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
      }
    }),
  );
}

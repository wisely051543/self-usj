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
export const RATE_LIMIT_PER_SEC = 1;

/** In-flight ceiling, so a slow reply cannot pile a queue up behind it. */
export const CONCURRENCY = 4;

/** Minimum gap between two request starts. */
const MIN_GAP_MS = 1000 / RATE_LIMIT_PER_SEC;

/**
 * Backstop for a run that would otherwise grow without bound (a catalogue that
 * suddenly doubles, a slot window that fills up). Callers check `budgetLeft()`
 * and give up the optional work rather than being cut off mid-request.
 *
 * Sized against the rate, not picked: at RATE_LIMIT_PER_SEC the gate spaces
 * starts one second apart, so this ceiling is also a wall-clock ceiling of
 * ~15 min — NFR5's "half the schedule interval". The size is what makes the
 * carry-forward path above reachable at all. Set high enough to outlast the
 * job's `timeout-minutes`, the run is killed mid-flight instead, and a killed
 * job skips the commit step and discards the whole round (NFR11).
 * A cold round is ~750 requests today, so this trips only on real growth —
 * and it trips as a warning plus carried-over slot data, not as data loss.
 */
export const MAX_REQUESTS_PER_RUN = 900;

const RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * Thrown when the retry loop above has run out of widening delays and the
 * store is still answering 429/5xx — "not now" has become "not for as long as
 * we're willing to wait". Distinct from a connection-level failure (a dropped
 * `fetch()`), which is retried the same way but rethrown as-is: this class
 * exists so `usj.ts` and `fetcher.ts` can tell "the store is blocking us" from
 * "this one request failed" and stop the round instead of grinding on (AD-16 #1).
 */
export class BlockedError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super(`Blocked: ${status} from ${url} after exhausting retries`);
    this.name = 'BlockedError';
    this.url = url;
    this.status = status;
  }
}

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
      if (!retryable) return res;
      if (attempt >= RETRY_DELAYS_MS.length) {
        await res.text().catch(() => undefined);
        throw new BlockedError(url, res.status);
      }

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

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
 * How much of a blocked response's body is kept as a diagnostic snippet.
 *
 * A status code alone does not distinguish "the store is briefly unwell" from
 * "a WAF is serving us a captcha page", and the second is the one worth acting
 * on. A prefix is enough to tell them apart; the whole body is an HTML page
 * nobody wants in a CI log.
 */
export const BLOCKED_BODY_SNIPPET_MAX = 200;

/**
 * How much of the raw body is looked at before it is normalized.
 *
 * Every step below allocates another string the size of what it was handed, so
 * collapsing first and slicing afterwards would build a second copy of what can
 * be a multi-megabyte error page in order to keep 200 characters. Slicing first
 * bounds that. The multiplier is headroom for markup and whitespace that
 * collapse away — a body whose first 200 useful characters sit past 1600 raw
 * ones is not one a prefix was ever going to characterise.
 */
const BLOCKED_BODY_SCAN_MAX = BLOCKED_BODY_SNIPPET_MAX * 8;

/**
 * `slice()` counts UTF-16 code units, so a cut can land between a surrogate
 * pair and leave the high half stranded — a lone surrogate that renders as a
 * replacement character and does not survive a round trip through JSON. Drop it.
 */
const clipLoneSurrogate = (s: string): string => {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
};

/**
 * Collapse a body down to one loggable, printable line, or to nothing at all.
 *
 * The body is store-controlled text that ends up verbatim in a public CI log,
 * so C0/C1 controls and DEL are stripped rather than merely collapsed: `\s`
 * does not cover ESC, and an escape sequence left in would let the store write
 * colours — or reposition the cursor — in someone else's terminal.
 *
 * Empty and absent bodies are deliberately the same answer: "no snippet". That
 * is what lets the message below append the snippet only when there is one,
 * instead of trailing a dangling colon on every blocked request that had an
 * empty body.
 */
const snippet = (body: string | undefined): string | undefined => {
  if (!body) return undefined;

  const scanned = clipLoneSurrogate(body.slice(0, BLOCKED_BODY_SCAN_MAX));
  const collapsed = scanned
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return undefined;

  return clipLoneSurrogate(collapsed.slice(0, BLOCKED_BODY_SNIPPET_MAX));
};

/**
 * Thrown when the retry loop above has run out of widening delays and the
 * store is still answering 429/5xx — "not now" has become "not for as long as
 * we're willing to wait". Distinct from a connection-level failure (a dropped
 * `fetch()`), which is retried the same way but rethrown as-is: this class
 * exists so `usj.ts` and `fetcher.ts` can tell "the store is blocking us" from
 * "this one request failed" and stop the round instead of grinding on (AD-16 #1).
 *
 * `body` is optional and normalized here rather than at the throw site, so
 * "the snippet is single-line, printable and within the cap" is an invariant of
 * the class that holds for every construction — including the two-argument one,
 * which stays valid.
 */
export class BlockedError extends Error {
  readonly url: string;
  readonly status: number;
  /**
   * The blocked response's body as a snippet: normalized and capped by
   * `snippet` above rather than kept whole. Absent when the response had no
   * body, or none that survived normalization.
   */
  readonly body?: string;

  constructor(url: string, status: number, body?: string) {
    const snip = snippet(body);
    super(`Blocked: ${status} from ${url} after exhausting retries${snip ? `: ${snip}` : ''}`);
    this.name = 'BlockedError';
    this.url = url;
    this.status = status;
    this.body = snip;
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
        // The body was already being read to drain the socket; carrying it into
        // the error is what turns "503 again" into "a WAF is asking for a
        // captcha", which is the only difference an operator can act on.
        const body = await res.text().catch(() => undefined);
        throw new BlockedError(url, res.status, body);
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

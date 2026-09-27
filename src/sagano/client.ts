/**
 * The single gate for all Sagano traffic: GET only, one request at a time,
 * at most one request start per second, and a hard cap per run. Kept separate
 * from src/limiter.ts so the USJ fetcher stays untouched.
 */

export const BASE_URL = 'https://common-api.sagano.linktivity.io/v1';

/** Sustained ceiling (req/s). Raising this is the change that can turn the fetcher abusive. */
export const RATE_LIMIT_PER_SEC = 1;

/** Hard cap on HTTP requests (retries included) per run. */
export const MAX_REQUESTS_PER_RUN = 60;

const RETRY_DELAYS_MS = [2000, 4000, 8000];

/**
 * Per-request ceiling (headers and body). A hung upstream would otherwise sit
 * on undici's ~300s defaults for every attempt and could eat the whole job
 * timeout. A timeout is retried like any network error.
 */
export const REQUEST_TIMEOUT_MS = 15000;

export class RequestCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestCapError';
  }
}

export class FetchFailedError extends Error {
  /** HTTP status of the last response, when there was one. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FetchFailedError';
    this.status = status;
  }
}

export interface SaganoClient {
  /** GET `${BASE_URL}/${path}` and parse the JSON body. */
  get<T>(path: string): Promise<T>;
  /** HTTP requests issued so far this run. */
  requestCount(): number;
  /** The per-run request cap this client enforces. */
  readonly maxRequests: number;
}

export interface ClientOptions {
  minGapMs?: number;
  retryDelaysMs?: number[];
  maxRequests?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createClient(
  fetchImpl: typeof fetch = fetch,
  opts: ClientOptions = {},
): SaganoClient {
  const minGapMs = opts.minGapMs ?? 1000 / RATE_LIMIT_PER_SEC;
  const retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const maxRequests = opts.maxRequests ?? MAX_REQUESTS_PER_RUN;
  const sleep = opts.sleep ?? realSleep;

  let issued = 0;
  let nextSlotAt = 0;
  // Serialises callers so concurrency is 1 even if someone forgets to await.
  let queue: Promise<unknown> = Promise.resolve();

  async function once(url: string): Promise<Response> {
    if (issued >= maxRequests) {
      throw new RequestCapError(`request cap of ${maxRequests} reached`);
    }
    const wait = nextSlotAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextSlotAt = Math.max(Date.now(), nextSlotAt) + minGapMs;
    issued++;
    return fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async function get<T>(path: string): Promise<T> {
    const url = `${BASE_URL}/${path}`;
    for (let attempt = 0; ; attempt++) {
      let failure: string;
      let status: number | undefined;
      try {
        const res = await once(url);
        if (res.ok) {
          const text = await res.text();
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new FetchFailedError(`${path}: response is not valid JSON`, res.status);
          }
        }
        await res.text().catch(() => undefined);
        if (res.status !== 429 && res.status < 500) {
          throw new FetchFailedError(`${path}: HTTP ${res.status}`, res.status);
        }
        status = res.status;
        failure = `HTTP ${res.status}`;
      } catch (err) {
        if (err instanceof RequestCapError || err instanceof FetchFailedError) throw err;
        failure = err instanceof Error ? err.message : String(err);
      }
      if (attempt >= retryDelays.length) {
        throw new FetchFailedError(`${path}: retries exhausted (${failure})`, status);
      }
      await sleep(retryDelays[attempt]);
    }
  }

  return {
    get<T>(path: string): Promise<T> {
      const p = queue.then(() => get<T>(path));
      queue = p.catch(() => undefined);
      return p;
    },
    requestCount: () => issued,
    maxRequests,
  };
}

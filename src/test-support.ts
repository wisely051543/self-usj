/**
 * Shared plumbing for the tests that drive real fetch paths under `node:test`'s
 * mocked timers.
 *
 * Mocking the timers is what makes an exhausted-retry run (1000 + 2000 + 4000ms
 * of backoff, on top of the rate gate's one-second spacing per request) cost
 * nothing in wall-clock time. The cost is that nothing moves unless the test
 * ticks it: a promise waiting on a `sleep()` nobody ticks simply never settles,
 * and `node:test` applies no per-test timeout to cut that short. A test written
 * as "tick a fixed number of times, then assert it rejected" therefore *hangs*
 * rather than fails on the day the branch it was written to lock disappears —
 * the one moment it exists for, reported as a CI timeout instead of a failed
 * assertion. `settle` ticks until the promise actually settles and gives up
 * with an explicit error, so that regression reads as a test failure.
 */

import type { TestContext } from 'node:test';

/** Let the microtask queue drain through a real (unmocked) macrotask. */
export const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

export interface Settlement<T> {
  /** Undefined until the tracked promise settles. */
  outcome?: PromiseSettledResult<T>;
}

/**
 * Watch a promise without awaiting it.
 *
 * The handlers attach now rather than after the ticks that drive the promise
 * forward, which is what keeps a rejection from sitting unhandled across
 * several macrotasks — long enough for Node to report an unhandledRejection and
 * fail the run for a reason the test never meant to exercise.
 */
export function track<T>(promise: Promise<T>): Settlement<T> {
  const settlement: Settlement<T> = {};
  promise.then(
    value => {
      settlement.outcome = { status: 'fulfilled', value };
    },
    reason => {
      settlement.outcome = { status: 'rejected', reason };
    },
  );
  return settlement;
}

/**
 * Coarse enough to clear any single wait the limiter takes (a 4000ms final
 * backoff, a 1000ms rate-gate slot) in one tick, so the loop below advances a
 * multi-request path quickly instead of inching through it.
 */
const TICK_MS = 10_000;

/** Generous for the paths under test, finite so a stall fails instead of hanging. */
const MAX_TICKS = 500;

/**
 * Drive a promise to settlement under mocked timers and hand back how it
 * settled, so the caller asserts on the outcome rather than on the timing.
 */
export async function settle<T>(t: TestContext, promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  const settlement = track(promise);

  for (let ticks = 0; ticks < MAX_TICKS && !settlement.outcome; ticks++) {
    await flush();
    if (settlement.outcome) break;
    t.mock.timers.tick(TICK_MS);
  }
  await flush();

  if (!settlement.outcome) {
    throw new Error(
      `promise did not settle within ${MAX_TICKS} mocked-timer ticks of ${TICK_MS}ms — ` +
        'it is most likely waiting on a request the code under test no longer aborts',
    );
  }
  return settlement.outcome;
}

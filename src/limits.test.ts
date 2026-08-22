/**
 * The throttle ceilings, and the interlock that makes them survivable (AD-4).
 *
 * Two static ceilings are asserted outright. The rest of this file exists
 * because the interesting failure is not a raised constant — it is a raised
 * constant that still looks fine on its own and quietly breaks the schedule.
 * `CONCURRENCY`, the cron interval, `timeout-minutes` and `STALE_MS` only mean
 * anything as a set, so the values are read back out of the files that own them
 * rather than restated here. Change any one of them and the arithmetic below
 * re-runs against the others; that is the whole point. AD-4 puts it plainly:
 * the warning comment in limiter.ts has already been proven not to hold.
 *
 * Deliberately absent: a static assertion pinning `CONCURRENCY`. AD-4 forbids
 * one, because dropping concurrency is a legitimate move whenever the rest of
 * the group is recomputed to match. `CONCURRENCY` is bound here through the
 * cold-start estimate instead, which is the constraint that actually matters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONCURRENCY, MAX_REQUESTS_PER_RUN, RATE_LIMIT_PER_SEC } from './limiter';

const REPO_ROOT = join(__dirname, '..');

/** AD-4's two hard ceilings. Raising either needs an architecture change, not a PR. */
const RATE_CEILING_PER_SEC = 1;
const BUDGET_CEILING = 6000;

/**
 * Requests in a cold round, counted against the committed `data/` at 31
 * products: 27 catalogue + 62 product-info (ja + en) + 31 calendar + 551 slot
 * lists + 79 stock batches. Replaying the same arithmetic over the 2026-08-16
 * snapshot gives 722 against the PRD's measured 720, so the model tracks.
 *
 * Cold is the number to size against even though CI restores `data/` and
 * usually runs warm (~275): `MAX_SLOT_AGE_MS` is 6h and every date shares one
 * `slotsFetchedAt`, so roughly one run in twelve pays close to full price.
 */
const COLD_START_REQUESTS = 750;

/**
 * Mean round-trip to the store, from PRD §7.2 (720 requests in 632.9s).
 * ARCHITECTURE-SPINE.md flags this as measured from a local network and still
 * owed a re-measurement on the runner, so treat it as the optimistic end.
 */
const AVG_LATENCY_SEC = 3.5;

/**
 * A round is squeezed by two independent limits and finishes no sooner than the
 * slower of them: the gate spaces request *starts* `1/rate` apart, while
 * concurrency and latency cap how many can be resolving at once. Whichever
 * binds is the one to watch — and which one binds flips depending on the
 * values, which is exactly why neither constant can be reviewed alone.
 */
function coldStartSeconds(
  requests: number,
  ratePerSec: number,
  concurrency: number,
  avgLatencySec: number,
): number {
  const rateFloor = requests / ratePerSec;
  const concurrencyFloor = (requests * avgLatencySec) / concurrency;
  return Math.max(rateFloor, concurrencyFloor);
}

const minutes = (seconds: number) => `${(seconds / 60).toFixed(1)} min`;

/** The cron interval, in minutes, read off the workflow that owns it. */
function scheduleIntervalMin(): number {
  const yml = readFileSync(join(REPO_ROOT, '.github/workflows/fetch.yml'), 'utf8');
  const cron = /^\s*-\s*cron:\s*['"]([^'"]+)['"]/m.exec(yml);
  assert.ok(cron, 'no cron schedule found in .github/workflows/fetch.yml');
  const everyNMinutes = /^\*\/(\d+)$/.exec(cron[1].trim().split(/\s+/)[0]);
  // A fixed-minute cron would need a different reading of "interval"; fail
  // loudly rather than guess one and assert against a number nobody meant.
  assert.ok(everyNMinutes, `cron '${cron[1]}' is not the '*/N * * * *' form this check understands`);
  return Number(everyNMinutes[1]);
}

/** The job's own kill switch, in minutes. */
function jobTimeoutMin(): number {
  const yml = readFileSync(join(REPO_ROOT, '.github/workflows/fetch.yml'), 'utf8');
  const timeout = /^\s*timeout-minutes:\s*(\d+)/m.exec(yml);
  assert.ok(timeout, 'no timeout-minutes found in .github/workflows/fetch.yml');
  return Number(timeout[1]);
}

/** The workflow-level overlap guard: group binding and cancel-in-progress flag. */
function concurrencyBlock(): { group: string; cancelInProgress: string } {
  const yml = readFileSync(join(REPO_ROOT, '.github/workflows/fetch.yml'), 'utf8');
  const block = /^concurrency:\n((?:^ {2}.*\n?)+)/m.exec(yml);
  assert.ok(block, 'no workflow-level concurrency block found in .github/workflows/fetch.yml');
  const group = /^\s*group:\s*(.+?)\s*$/m.exec(block[1]);
  const cancelInProgress = /^\s*cancel-in-progress:\s*(\S+)/m.exec(block[1]);
  assert.ok(group, 'no group found in the concurrency block');
  assert.ok(cancelInProgress, 'no cancel-in-progress found in the concurrency block');
  return { group: group[1], cancelInProgress: cancelInProgress[1] };
}

/** How old the site lets data get before it calls it stale, in minutes. */
function staleThresholdMin(): number {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  const stale = /const STALE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/.exec(html);
  assert.ok(stale, 'no STALE_MS found in index.html');
  return Number(stale[1]);
}

test('RATE_LIMIT_PER_SEC stays at or below the safe ceiling', () => {
  assert.ok(
    RATE_LIMIT_PER_SEC <= RATE_CEILING_PER_SEC,
    `RATE_LIMIT_PER_SEC=${RATE_LIMIT_PER_SEC} exceeds ${RATE_CEILING_PER_SEC} req/s`,
  );
});

test('MAX_REQUESTS_PER_RUN stays within the run backstop', () => {
  assert.ok(
    MAX_REQUESTS_PER_RUN <= BUDGET_CEILING,
    `MAX_REQUESTS_PER_RUN=${MAX_REQUESTS_PER_RUN} exceeds ${BUDGET_CEILING}`,
  );
});

/**
 * Checks the estimator against the two runs anyone actually measured, so a
 * later "simplification" of the formula cannot quietly make every assertion
 * below it meaningless. Both PRD §7.2 figures were taken when the rate limit
 * was still 5/s and therefore inert — concurrency and latency set both.
 */
test('the cold-start estimator reproduces the measured runs', () => {
  const measured = coldStartSeconds(720, 5, 4, AVG_LATENCY_SEC);
  assert.ok(
    Math.abs(measured - 632.9) / 632.9 < 0.05,
    `estimator says ${minutes(measured)} for the run measured at 10.5 min`,
  );

  // Same run at concurrency 2 — the PRD's stated reason not to drop it.
  const halved = coldStartSeconds(720, 5, 2, AVG_LATENCY_SEC);
  assert.ok(
    Math.abs(halved / 60 - 21) < 2,
    `estimator says ${minutes(halved)} where the PRD measured ~21 min at concurrency 2`,
  );
});

/**
 * AD-4's interlock assertion. A round has to finish well inside its own
 * schedule or runs start treading on each other, and `concurrency` in the
 * workflow turns that overlap into a queue rather than a collision — which
 * only helps if the backlog drains.
 */
test('a cold round finishes inside half the schedule interval', () => {
  const intervalMin = scheduleIntervalMin();
  const estimateSec = coldStartSeconds(
    COLD_START_REQUESTS,
    RATE_LIMIT_PER_SEC,
    CONCURRENCY,
    AVG_LATENCY_SEC,
  );
  assert.ok(
    estimateSec < (intervalMin * 60) / 2,
    `cold round is ~${minutes(estimateSec)} at rate=${RATE_LIMIT_PER_SEC}/s ` +
      `concurrency=${CONCURRENCY}; the '*/${intervalMin}' schedule allows ` +
      `${intervalMin / 2} min. Recompute the interlock group (AD-4).`,
  );
});

/**
 * Overlapping rounds double the request rate against the store and can race
 * on the commit step (NFR5.1 / NFR11). This is what actually enforces the
 * overlap guard: the workflow's `concurrency` block must queue a new run
 * behind an in-progress one rather than racing or cancelling it -- catches a
 * future edit that drops the group binding or flips cancel-in-progress to
 * true while leaving everything else in this file looking untouched.
 */
test('the workflow concurrency block queues runs instead of cancelling them', () => {
  const { group, cancelInProgress } = concurrencyBlock();
  assert.equal(
    cancelInProgress,
    'false',
    `cancel-in-progress is '${cancelInProgress}'; it must be 'false' or an in-progress ` +
      `round can be killed mid-write (NFR11)`,
  );
  assert.ok(
    group.includes('github.workflow'),
    `group is '${group}'; it must bind to the workflow name (e.g. ` +
      "\${{ github.workflow }}) rather than a per-run dynamic value, or overlapping rounds " +
      'would no longer share a queue (NFR5.1)',
  );
});

/**
 * The backstop has to be reachable to be a backstop. Hitting the request cap
 * makes the fetcher carry yesterday's slot data forward and finish cleanly;
 * hitting the job timeout kills it mid-write, and a killed job never reaches
 * the commit step, so the entire round is thrown away (NFR11). The cap must
 * therefore bite first, with enough runway left to write and push.
 */
test('the request budget runs out before the job times out', () => {
  const budgetSec = MAX_REQUESTS_PER_RUN / RATE_LIMIT_PER_SEC;
  const timeoutSec = jobTimeoutMin() * 60;
  assert.ok(
    budgetSec < timeoutSec,
    `MAX_REQUESTS_PER_RUN=${MAX_REQUESTS_PER_RUN} at ${RATE_LIMIT_PER_SEC}/s needs ` +
      `${minutes(budgetSec)}, past the ${jobTimeoutMin()} min timeout — the run is ` +
      `killed instead of degrading, and the round is discarded.`,
  );
});

/** The budget is a ceiling on growth, so it has to sit above a normal round. */
test('the request budget leaves a cold round room to complete', () => {
  assert.ok(
    MAX_REQUESTS_PER_RUN > COLD_START_REQUESTS,
    `MAX_REQUESTS_PER_RUN=${MAX_REQUESTS_PER_RUN} is below the ~${COLD_START_REQUESTS} ` +
      `a cold round needs; every cold run would degrade.`,
  );
});

/**
 * The fourth interlock member. `STALE_MS` is what the page believes about data
 * it is shown, so it has to tolerate a round that runs long plus a schedule
 * GitHub delays or drops — two intervals is the floor, and the shipped 90 min
 * against a 30 min cron gives three.
 */
test('the stale threshold outlasts more than one schedule interval', () => {
  const intervalMin = scheduleIntervalMin();
  const staleMin = staleThresholdMin();
  assert.ok(
    staleMin >= intervalMin * 2,
    `STALE_MS is ${staleMin} min against a '*/${intervalMin}' schedule; one late ` +
      `or dropped run would mark healthy data stale.`,
  );
});

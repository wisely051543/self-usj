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
 *
 * The file has since taken on the rest of what those two workflows are trusted
 * to do, because it is the same failure every time — a rule that still reads
 * as present in the file while enforcing nothing. It now also pins the ci.yml
 * steps that make "enforced by test" true at all (DW-24), the fetch.yml smoke
 * check that proves the fetcher's entry point fired (DW-52), and the `if:`
 * binding on "Flag failed products" (DW-49); the structured workflow reader
 * below (DW-48) is the shared machinery all of those read through.
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

const FETCH_WORKFLOW = '.github/workflows/fetch.yml';
const CI_WORKFLOW = '.github/workflows/ci.yml';

const workflowText = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

/*
 * Reading the workflows (DW-48).
 *
 * Every field below is read out of a block that was sliced first — one job's
 * own keys, one named step's own keys — rather than by a regex spanning lines,
 * which silently depends on which field happens to sit next to which. Putting
 * an `id:` between a step's `- name:` and its `if:` is a legal edit that must
 * not turn into "no such step". Splitting "find the block" from "read a field
 * out of it" is also what lets a missing field say so, instead of being
 * reported as a missing step and sending the reader to the wrong place.
 *
 * The repo carries no YAML parser and this file is not the place to take on a
 * dependency for one, so blocks are cut by indentation — enough for the two
 * workflows here, all of which is spelled out rather than assumed.
 */

const indentOf = (line: string): number => line.length - line.trimStart().length;

const escapeRe = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A YAML scalar written bare, single-quoted or double-quoted. Formatters
 * routinely add quotes on their own — most famously around `on:`, which YAML
 * 1.1 would otherwise read as the boolean true — so a reader that only knows
 * the bare form reports a key missing from a file that plainly has it.
 */
const quotable = (literal: string): string => {
  const key = escapeRe(literal);
  return `(?:${key}|'${key}'|"${key}")`;
};

/** The block-scalar indicators (`|`, `>`, and their chomping variants). */
const BLOCK_SCALAR = /^[|>][-+]?$/;

/**
 * A field value with any trailing inline comment removed. `#` only opens a
 * comment when it follows whitespace outside quotes, so `timeout-minutes: 25
 * # kill switch` reads as 25 while a `#` inside a quoted value is left alone.
 */
function scalarValue(raw: string): string {
  const quoted = /^(['"])(.*?)\1/.exec(raw);
  if (quoted) return quoted[2];
  return raw.replace(/\s+#.*$/, '').trimEnd();
}

/** Everything indented past `lines[start]`, i.e. the block that line opens. */
function blockBody(lines: string[], start: number, indent: number): string {
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push(line);
      continue;
    }
    // The first line no deeper than the key ends the block — which is also
    // what keeps a comment written at the parent's indentation outside it.
    if (indentOf(line) <= indent) break;
    body.push(line);
  }
  return body.join('\n');
}

/**
 * The block nested under `key:`, with its lines' original indentation kept so
 * that it can be sliced again. `atIndent` pins the key to one nesting depth,
 * for keys like `concurrency:` that mean different things at different ones.
 */
function blockUnder(text: string, key: string, atIndent?: number): string | null {
  const lines = text.split('\n');
  // A block scalar indicator (`run: |`) belongs to the key line; what follows
  // it is still the block, so treat that line as opening one either way.
  const header = new RegExp(`^\\s*${quotable(key)}:[ \\t]*(?:[|>][-+]?)?[ \\t]*(?:#.*)?$`);
  const start = lines.findIndex(
    (line) => header.test(line) && (atIndent === undefined || indentOf(line) === atIndent),
  );
  if (start === -1) return null;
  return blockBody(lines, start, indentOf(lines[start]));
}

/**
 * Only the block's own keys — the lines at its shallowest indentation. Nested
 * structures carry their own copies of a key (a step may set its own
 * `timeout-minutes:`), and a field read off a job has to be the job's.
 */
function ownFields(block: string): string {
  const lines = block
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  if (lines.length === 0) return '';
  const base = Math.min(...lines.map(indentOf));
  return lines.filter((line) => indentOf(line) === base).join('\n');
}

/** The value of one of `block`'s own fields, or null when the block has no such key. */
function fieldIn(block: string, key: string): string | null {
  const field = new RegExp(`^\\s*${quotable(key)}:[ \\t]*(.*?)\\s*$`, 'm').exec(ownFields(block));
  return field ? scalarValue(field[1]) : null;
}

/**
 * One named step, from its `- name:` line to the next entry at or above the
 * dash's own indentation. The `- ` marker is rewritten to plain spaces so that
 * `name:` reads as one of the step's fields alongside `if:` and `run:`.
 */
function stepBlock(yml: string, name: string): string | null {
  const lines = yml.split('\n');
  const header = new RegExp(`^\\s*-\\s+name:[ \\t]*${quotable(name)}[ \\t]*(?:#.*)?$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return null;
  const opener = lines[start].replace(/^(\s*)-(\s)/, '$1 $2');
  const body = blockBody(lines, start, indentOf(lines[start]));
  return body === '' ? opener : `${opener}\n${body}`;
}

/** A named step's block, or a failure that says the step itself is missing. */
function requireStep(yml: string, file: string, name: string): string {
  const step = stepBlock(yml, name);
  assert.ok(step, `no "${name}" step found in ${file}`);
  return step;
}

/** The value of one field on a named step. Missing step and missing field read differently. */
function stepField(yml: string, file: string, name: string, key: string): string {
  const value = fieldIn(requireStep(yml, file, name), key);
  assert.ok(
    value !== null,
    `the "${name}" step in ${file} has no '${key}:' field — the step is there, the field is not`,
  );
  return value;
}

/**
 * A named step's shell script, as written — the body of a `run: |` block, or
 * the value of a one-line `run:`. Either spelling is a script; only a step
 * with no `run:` at all is missing one.
 */
function stepRunScript(yml: string, file: string, name: string): string {
  const step = requireStep(yml, file, name);
  const block = blockUnder(step, 'run');
  if (block !== null && block.trim() !== '') return block;
  const inline = fieldIn(step, 'run');
  assert.ok(
    inline,
    `the "${name}" step in ${file} has no 'run:' script — the step is there, the script is not`,
  );
  assert.ok(
    !BLOCK_SCALAR.test(inline),
    `the "${name}" step in ${file} opens a 'run: ${inline}' block that has no body`,
  );
  return inline;
}

/**
 * Every shell command a `steps:` block runs, in order, whether written as a
 * one-line `run:` or folded into a `run: |` body. Both spellings run the same
 * commands, so a reader that saw only one would report a gate as gone the
 * moment somebody reformatted the step that still runs it.
 */
function runCommandsIn(steps: string): string[] {
  const lines = steps.split('\n');
  const commands: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const run = /^\s*(?:-\s+)?run:[ \t]*(.*?)\s*$/.exec(lines[i]);
    if (!run) continue;
    const value = scalarValue(run[1]);
    if (!BLOCK_SCALAR.test(value)) {
      if (value !== '') commands.push(value);
      continue;
    }
    for (const scriptLine of blockBody(lines, i, indentOf(lines[i])).split('\n')) {
      const command = scriptLine.trim();
      if (command !== '' && !command.startsWith('#')) commands.push(command);
    }
  }
  return commands;
}

/** The cron interval, in minutes, read off the workflow that owns it. */
function scheduleIntervalMin(): number {
  const triggers = blockUnder(workflowText(FETCH_WORKFLOW), 'on', 0);
  assert.ok(triggers, `no top-level 'on:' block found in ${FETCH_WORKFLOW}`);
  const schedule = blockUnder(triggers, 'schedule');
  assert.ok(schedule, `no 'on.schedule' block found in ${FETCH_WORKFLOW}`);
  const cron = /^\s*-\s*cron:\s*['"]([^'"]+)['"]/m.exec(schedule);
  assert.ok(cron, `no cron schedule found in ${FETCH_WORKFLOW}`);
  const everyNMinutes = /^\*\/(\d+)$/.exec(cron[1].trim().split(/\s+/)[0]);
  // A fixed-minute cron would need a different reading of "interval"; fail
  // loudly rather than guess one and assert against a number nobody meant.
  assert.ok(everyNMinutes, `cron '${cron[1]}' is not the '*/N * * * *' form this check understands`);
  return Number(everyNMinutes[1]);
}

/** The `fetch` job's own kill switch, in minutes. */
function jobTimeoutMin(): number {
  const jobs = blockUnder(workflowText(FETCH_WORKFLOW), 'jobs', 0);
  assert.ok(jobs, `no top-level 'jobs:' block found in ${FETCH_WORKFLOW}`);
  const fetchJob = blockUnder(jobs, 'fetch');
  assert.ok(fetchJob, `no 'jobs.fetch' job found in ${FETCH_WORKFLOW}`);
  const timeout = fieldIn(fetchJob, 'timeout-minutes');
  assert.ok(timeout, `the 'fetch' job in ${FETCH_WORKFLOW} sets no timeout-minutes of its own`);
  // An expression (`${{ env.T }}`) is a number only at run time, and guessing
  // one here would put a NaN into the interlock arithmetic and report the
  // failure as if the minutes themselves were wrong. Say what was found.
  assert.match(
    timeout,
    /^\d+$/,
    `timeout-minutes on the 'fetch' job is '${timeout}', not a plain number of minutes ` +
      `this check can hold the request budget against`,
  );
  return Number(timeout);
}

/** The workflow-level overlap guard: group binding and cancel-in-progress flag. */
function concurrencyBlock(): { group: string; cancelInProgress: string } {
  const block = blockUnder(workflowText(FETCH_WORKFLOW), 'concurrency', 0);
  assert.ok(block, `no workflow-level concurrency block found in ${FETCH_WORKFLOW}`);
  const group = fieldIn(block, 'group');
  const cancelInProgress = fieldIn(block, 'cancel-in-progress');
  assert.ok(group, 'no group found in the concurrency block');
  assert.ok(cancelInProgress, 'no cancel-in-progress found in the concurrency block');
  return { group, cancelInProgress };
}

/** Every command the CI `check` job runs, in the order the job runs them. */
function ciCheckCommands(): string[] {
  const jobs = blockUnder(workflowText(CI_WORKFLOW), 'jobs', 0);
  assert.ok(jobs, `no top-level 'jobs:' block found in ${CI_WORKFLOW}`);
  const check = blockUnder(jobs, 'check');
  assert.ok(check, `no 'jobs.check' job found in ${CI_WORKFLOW}`);
  const steps = blockUnder(check, 'steps');
  assert.ok(steps, `no steps found on the 'check' job in ${CI_WORKFLOW}`);
  return runCommandsIn(steps);
}

/** How old the site lets data get before it calls it stale, in minutes. */
function staleThresholdMin(): number {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  const stale = /const STALE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/.exec(html);
  assert.ok(stale, 'no STALE_MS found in index.html');
  return Number(stale[1]);
}

/** The `if:` condition on the "Flag failed products" step. */
function flagFailedProductsCondition(): string {
  return stepField(workflowText(FETCH_WORKFLOW), FETCH_WORKFLOW, 'Flag failed products', 'if');
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
 * DW-13: an aborted `npm run fetch` (BlockedError, catalog failure, or an
 * unmatched --product=) exits before index.json is rewritten this round, so
 * this step must not run on failure -- it would re-warn about the previous
 * round's already-known failures. Catches a future edit reverting to
 * `always()`.
 *
 * DW-49: and the condition has to name the step it depends on. A bare
 * `success()` says only that nothing has failed *so far*, which happens to
 * mean "fetch succeeded" solely because fetch is the last step that can fail
 * before this one -- an arrangement a later inserted step would change with
 * nothing here noticing. `steps.fetch.outcome` is the thing actually meant,
 * and it is no laxer: GitHub ANDs an implicit `success()` into any condition
 * carrying no status-check function of its own.
 */
test('the "Flag failed products" step only runs when fetch succeeded', () => {
  // The condition resolves against the Fetch step's `id:`, and GitHub does not
  // complain about a `steps.<id>` that names nothing -- it resolves empty, the
  // comparison is quietly false, and the step stops running on every round.
  // Naming the step in the condition is what created this dependency, so the
  // id is pinned here rather than left to be noticed in production silence.
  const fetchStep = requireStep(workflowText(FETCH_WORKFLOW), FETCH_WORKFLOW, 'Fetch');
  const fetchStepId = fieldIn(fetchStep, 'id');
  assert.equal(
    fetchStepId,
    'fetch',
    `the "Fetch" step in ${FETCH_WORKFLOW} declares ` +
      `${fetchStepId === null ? 'no id: at all' : `'id: ${fetchStepId}'`}; the ` +
      '"Flag failed products" condition below reads steps.fetch.outcome, which resolves ' +
      'to an empty string under any other id -- the step would then never run again, ' +
      'silently and on every round',
  );

  const condition = flagFailedProductsCondition();
  assert.equal(
    condition,
    "steps.fetch.outcome == 'success'",
    `the "Flag failed products" step is "if: ${condition}"; it must bind to ` +
      "steps.fetch.outcome or an aborted npm run fetch (which exits before rewriting " +
      "index.json) would either re-flag the previous round's stale failures or, if the " +
      'condition is unconditional, run when it should not -- and a condition that merely ' +
      'reads success() is true whenever no *earlier* step failed, which stops meaning ' +
      '"fetch succeeded" the moment a step is inserted between the two',
  );
});

/**
 * DW-24: ci.yml calls each of its steps a gate, but nothing checked the gates
 * were still there. Delete `- run: npm run schema:check` and `npm test` stays
 * fully green -- the rules the architecture calls "enforced by test" are only
 * enforced while something runs them, and this is what says so out loud.
 *
 * What this cannot cover: `- run: npm test` itself. Delete that step and this
 * file stops running in CI at all, so no assertion in it can report anything.
 * That one gate is held by review and by branch protection, not from in here.
 */
test('the CI job still runs every check the architecture leans on', () => {
  const commands = ciCheckCommands();
  for (const gate of ['npm run typecheck', 'npm run i18n:check', 'npm run schema:check']) {
    assert.ok(
      commands.includes(gate),
      `${CI_WORKFLOW} no longer runs '${gate}'; its check job runs ` +
        `${commands.join(', ')}. That check is a merge gate -- dropping the step ` +
        'retires the rule it enforces without retiring anything that says so.',
    );
  }
});

/**
 * DW-52: the smoke check is a smoke check only while it tests the log for
 * *content*. `npm run fetch ... | tee fetch-output.log` creates the file
 * whether or not main() ever ran, so `-e` or `-f` would pass on the very
 * zero-byte log the step exists to catch -- a guard that reads as present in
 * review and enforces nothing. Matched against the predicate line the shell
 * actually branches on, so a weakened `elif` with the old test left behind in
 * a comment or an echo does not read as still guarding anything.
 */
test('the fetch smoke check tests its log for content, not mere existence', () => {
  const script = stepRunScript(
    workflowText(FETCH_WORKFLOW),
    FETCH_WORKFLOW,
    'Smoke-check fetch entry point',
  );
  assert.match(
    script,
    /^[ \t]*(?:el)?if[ \t]+\[[ \t]*-s[ \t]+fetch-output\.log[ \t]*\]/m,
    `the "Smoke-check fetch entry point" step in ${FETCH_WORKFLOW} no longer branches on ` +
      "`[ -s fetch-output.log ]`. The test must be -s (exists and is non-empty), on the " +
      'line the shell actually evaluates: tee creates the log even when the entry-point ' +
      'gate in src/fetcher.ts never fires, so -e or -f would pass on the empty file that ' +
      'is precisely the symptom being caught.',
  );
});

/**
 * DW-48: the reason the readers above slice a block before reading a field.
 * The old `- name: X\n\s*if:` regexes made a step's fields positional, so an
 * `id:` -- a legal, unrelated edit -- moved `if:` out of reach and the failure
 * came back as "no such step", pointing the reader at the wrong file entirely.
 * These two cases are the ones that used to lie; they are cheap to hold onto.
 */
test('a step field is read past intervening fields, and a missing one says so', () => {
  const withId = [
    'jobs:',
    '  fetch:',
    '    steps:',
    '      - name: Flag failed products',
    '        id: flag',
    '        uses: ./.github/actions/noop',
    "        if: steps.fetch.outcome == 'success'",
    '',
  ].join('\n');
  assert.equal(
    stepField(withId, 'fixture.yml', 'Flag failed products', 'if'),
    "steps.fetch.outcome == 'success'",
  );

  const withoutIf = [
    'jobs:',
    '  fetch:',
    '    steps:',
    '      - name: Flag failed products',
    '        run: echo hi',
    '',
  ].join('\n');
  assert.throws(
    () => stepField(withoutIf, 'fixture.yml', 'Flag failed products', 'if'),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /the step is there, the field is not/);
      assert.doesNotMatch(message, /no "Flag failed products" step found/);
      return true;
    },
  );

  assert.throws(
    () => stepField(withoutIf, 'fixture.yml', 'Some other step', 'if'),
    /no "Some other step" step found in fixture\.yml/,
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

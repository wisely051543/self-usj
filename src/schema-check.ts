/**
 * The build gate for AD-14: the snapshots on disk must be the versions this
 * code was written against.
 *
 * The failure this stops is quiet by construction. `days.json` is regenerated
 * by a workflow, on a schedule, from a fetcher that can be rolled back
 * independently of the site; nothing in `npm test` reads the committed
 * snapshots, so a file one version behind the code sails through every other
 * gate and only shows up as a page full of blank cells. Running this makes the
 * job red instead — the whole point of AD-22 being that a rule nothing executes
 * is not a rule.
 *
 * Today this is the only build pipeline there is. When Epic 2's SSG build
 * lands, it must read `src/schema.ts` too rather than re-deriving the numbers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { assertDaysSchemaVersion, assertIndexSchemaVersion } from './schema';

const ROOT = path.join(__dirname, '..');

/**
 * A file that will not read or will not parse fails the same way a wrong
 * version does: the gate exists to prove the snapshot is usable, and
 * "unreadable" is not a milder answer than "wrong version".
 */
function readSchemaVersion(file: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    throw new Error(`${path.basename(file)} could not be read: ${(err as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown } | null;
    return parsed && typeof parsed === 'object' ? parsed.schemaVersion : undefined;
  } catch (err) {
    throw new Error(`${path.basename(file)} is not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * Throws on the first snapshot that disagrees with the registry.
 *
 * Takes the directory rather than reading `ROOT` itself so a test can drive it
 * over a fixture, and so a future build that stages data elsewhere has a seam.
 */
export function checkSnapshots(dataDir: string): void {
  assertDaysSchemaVersion(readSchemaVersion(path.join(dataDir, 'days.json')));
  assertIndexSchemaVersion(readSchemaVersion(path.join(dataDir, 'index.json')));
}

/**
 * `npm run schema:check` with no arguments checks the repo's own `data/`,
 * which is the only thing CI wants. The optional directory argument exists so
 * `schema.test.ts` can run this file as a real child process against a fixture
 * and assert on the exit status and stderr — the two things a caller actually
 * depends on, and the two things no in-process test of `checkSnapshots` can
 * reach. It is a test seam and nothing else; CI passes no argument.
 *
 * `||` rather than `??`: a caller that stages data elsewhere will pass the
 * directory from a variable, and an unset variable arrives as `''`, which `??`
 * would take for a real path and resolve against the current directory.
 */
function main(argv: string[]): void {
  try {
    checkSnapshots(argv[0] || path.join(ROOT, 'data'));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

// Silent on success: this runs on every CI job, and a gate that prints when
// nothing is wrong trains people to skim past it.
if (require.main === module) main(process.argv.slice(2));

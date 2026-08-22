/**
 * The one place a snapshot's version number is written down.
 *
 * Story 1.5 turned `days.json` from "the cells you can buy" into a full
 * (date × pass) grid where every cell carries a `status`. The shape changed;
 * the number did not; and nothing read the number anyway — the page fetched the
 * file and rendered it. A v1 file reaching v2 code renders a grid of
 * `undefined` cells and stays green all the way through CI. That silent
 * divergence between the writer and the reader is what AD-14 asks for a guard
 * against, and this module is that guard's single source of truth: the writer
 * (`fetcher.ts`), the types (`types.ts`), the build gate (`schema-check.ts`)
 * and the page all quote the same number from here.
 *
 * Two files, two numbers, two guards — deliberately not one generic
 * `assertVersion(actual, expected, file)`. `days.json` and `index.json` version
 * independently, and a shared comparator invites the day their numbers coincide
 * to become the reason a mismatch is waved through.
 *
 * Comparison is `!==`, never `>=`. A fetcher rolled back to v1 while the site
 * is on v2 is exactly the case a "too old is fine, we're newer" test lets
 * through, and it is the case that renders wrong rather than failing.
 *
 * This module imports nothing — `types.ts` imports *it*, for `typeof` — so the
 * guards take `unknown` and do their own narrowing.
 */

/** `data/days.json`: v2 is the full (date × pass) grid, every cell with a `status`. */
export const DAYS_SCHEMA_VERSION = 2;

/** `data/index.json`: unchanged by Story 1.6, and independent of the number above. */
export const INDEX_SCHEMA_VERSION = 5;

/**
 * Reject anything that is not exactly the `days.json` this build understands.
 *
 * `unknown` rather than `number` on purpose: the value arrives from a parsed
 * file, so "missing" and `"2"` as a string are both real inputs, and both must
 * fail rather than be coerced into agreement.
 */
export function assertDaysSchemaVersion(value: unknown): void {
  if (value !== DAYS_SCHEMA_VERSION) {
    throw new Error(
      `days.json schemaVersion is ${JSON.stringify(value)}, expected ${DAYS_SCHEMA_VERSION}`,
    );
  }
}

/** The same check for `index.json`, kept separate from the one above on purpose. */
export function assertIndexSchemaVersion(value: unknown): void {
  if (value !== INDEX_SCHEMA_VERSION) {
    throw new Error(
      `index.json schemaVersion is ${JSON.stringify(value)}, expected ${INDEX_SCHEMA_VERSION}`,
    );
  }
}

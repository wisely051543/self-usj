# Epic 1 Context: 法遵護欄與信任揭露 (Compliance Guardrails & Trust Disclosures)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The operator needs to run the fetch pipeline within explicit, test-enforced rate/concurrency limits, with the ability to audit it and shut it down immediately. Snapshots must carry a complete (date × ticket-type) grid with explicit status for every cell, so downstream consumers never mistake "no data" for "sold out." The existing (already-live) site must immediately carry visible non-official / disclaimer disclosures without waiting for the broader SSG rewrite in Epic 2. This epic is the first line of defense for the data source's survival and legal-compliance urgency, and it is the trust foundation all later work depends on.

## Stories

- Story 1.1: 抓取速率降至 1 req/s 並鎖定常數 (rate limit → 1 req/s, constants locked, test-enforced)
- Story 1.2: 禁止抓取回合重疊 (workflow concurrency group prevents overlapping runs)
- Story 1.3: 請求標頭匿名化 (strip site-identifying strings from outbound headers)
- Story 1.4: 429/5xx 退避與封鎖告警 (exponential backoff; stop + fail job on persistent blocking)
- Story 1.5: 完整格網快照與狀態判定 (full date×ticket grid; explicit status determination in the orchestration layer)
- Story 1.6: 快照 Schema 版本控制 (`days.json` schemaVersion bump; strict rejection of unknown versions)
- Story 1.7: 分層排程回歸保護 (shrink/guard the timeslot fetch tier now that it has no consumer)
- Story 1.8: Kill Switch 分級開關 (tiered L1/L2/L3 killswitch declaration file)
- Story 1.9: 對外聯絡窗口 (visible, working contact email on the site)
- Story 1.10: 靜默失敗偵測與合理性檢查 (sanity checks fail the job instead of publishing collapsed data)
- Story 1.11: 私有儲存 repo 分離遷移 (migrate `data/` to a private, workflow-less storage repo)
- Story 1.12: CI 護欄與 Node 24 升級 (CI workflow for tsc/tests/i18n:check; Node 20→24 upgrade)
- Story 1.13: 現有站台信任揭露文字 (temporary disclosure block pasted onto current `index.html`)

## Requirements & Constraints

- The system is read-only: no cart, no reservation holds, no automated checkout/booking, no resale involvement.
- Data may only be fetched from endpoints that do not require passing a queue/waitlist gate; if the source endpoint changes, confirm it is not routed through such a gate before using it.
- The fact that the data source is a reverse-engineered private interface (no public docs, no API terms, no key) must be documented honestly in code comments/tech docs — not recorded only as a favorable fact.
- No official ticket imagery may be used or hotlinked (this applies to rendering; noted here because it's adjacent to the "derived facts only" constraint this epic partially seeds).
- Sustained outbound request rate to the source host must have an explicit, single, centrally-controlled upper bound. Target: 1 request/sec.
- The total request volume of one fetch run must complete (at the target rate) in no more than half the scheduling interval; rate and volume are jointly constrained, not independently tunable.
- Only one fetch run may execute at a time; a run in progress must not be interrupted by the next scheduled trigger.
- Expensive data tiers must be fetched at lower frequency and driven by change-detection, not re-fetched every run.
- Outbound request headers must not reveal this site's domain or name.
- On 429/5xx, retries must use increasing (exponential) backoff; on persistent blocking, the run must stop outright — never fall back to an alternate way of continuing the fetch.
- The system must have an immediately-usable kill switch, with the enablement procedure documented.
- The kill-switch's "what happens after fetching stops" procedure must define: disposition of existing historical data, whether the site comes down, and the external contact window.
- The site must provide at least one working contact email, and it must be visible, not buried.
- The site must prominently disclose (in all three languages): unofficial status / no affiliation with USJ, official data source with a link to the official store, that this site does not sell/broker/resell tickets, and a disclaimer that data may be inaccurate/stale, is not a guarantee, is used at the visitor's own risk, and the official USJ page is authoritative.
- Planning artifacts explicitly scope NFR3.2 (site name/domain must not use USJ's trademarks as primary identity) **out of any story in this round** — it is blocked on written legal opinion and must not be decided ad hoc by implementation.

## Technical Decisions

- **Single egress gate (AD-3):** every outbound HTTP request to the source host must go through `src/limiter.ts`'s `limitedFetch`; no other bare `fetch(` call is permitted anywhere in `src/`. This is enforced by lint/test.
- **Rate-limit interlock group (AD-4):** `RATE_LIMIT_PER_SEC`, `CONCURRENCY`, cron interval, `timeout-minutes`, and `STALE_MS` are a mutually-dependent set. A test must assert `RATE_LIMIT_PER_SEC <= 1` and `MAX_REQUESTS_PER_RUN <= 6000`. `CONCURRENCY` itself has no static ceiling assertion — the currently-consistent solution is `RATE_LIMIT_PER_SEC=1`, `CONCURRENCY=4`, cron `*/30`, `timeout-minutes=25`, `STALE_MS=90min`; any future change to one of the five requires recomputing all five together, with a test asserting the recomputed cold-start estimate still fits within half the cron interval.
- **Grid completion and state determination (AD-12/AD-13):** the orchestration layer (`src/fetcher.ts`) must persist the full (date × ticket-type) grid — including `available: false` rows, which the current `buildDays()` incorrectly discards — and determine each cell's status exactly once; renderers/downstream consumers must never re-derive status from absence. When the evidence is insufficient (notably an empty `latestDate`, seen in ~10/31 products), the cell must be explicitly "unknown," never defaulted to sold-out or closed.
- **Independent schema versioning per file (AD-14):** `data/` files each carry their own `schemaVersion`. The grid change in Story 1.5 bumps `days.json` from 1 to 2; `index.json`'s version (currently 5) is unrelated and must not share version-comparison logic just because the numbers coincide. Any consumer reading an unrecognized `schemaVersion` must abort the build with an error, never degrade or render with defaults.
- **Shut down unconsumed fetch tiers (AD-21):** since FR5 needs only slot *counts* and the render layer no longer consumes `timeSlots` detail, the timeslot fetch tier's scope must shrink to just what's needed to compute counts (or stop entirely once confirmed unconsumed) — while the existing 3-tier scheduling and change-detection (`slotsAreStale()`, `MAX_SLOT_AGE_MS=6h`, `SLOT_WINDOW_MONTHS=1`) must be preserved and regression-tested. `MAX_PEOPLE` filtering stays out of scope.
- **Tiered kill switch (AD-15):** a single declaration file (`KILLSWITCH`) carries a level value (L1 stop-fetching / L2 stop-service / L3 take-down) — not a presence/absence flag. Both the fetch and build workflows must read the same file. Because a stopped fetch workflow means `workflow_run` never fires, the build workflow needs its own independent `schedule`/`workflow_dispatch` trigger (this is a prerequisite established by AD-6, which formally belongs to the Epic 2 build pipeline but must exist for L2 to work). GitHub UI workflow-disable must never be used as the sole mechanism for L2/L3.
- **Failure boundaries and sanity checks (AD-16):** the job must fail (not publish) on: persistent blocking (403/repeated 429), `budgetExhausted`, N consecutive failed runs, data age past threshold, push-PAT failure, or a sanity check showing the product count / available-cell count / date coverage has collapsed beyond tolerance versus the prior snapshot — zero and near-zero results are always treated as failure. A single product's failure still does not block writes for the rest (existing behavior, unchanged).
- **Storage separation (AD-5):** `data/` and its history must live only in a private, workflow-less storage repo, accessed via a fine-grained PAT; the public repo carries only code, workflows, and build output. This rule is forward-effective only — already-published commit history cannot be un-published, and no "already purged" claim may be made.
- **CI as a publish precondition (AD-22):** a `ci.yml` workflow must run `tsc`, unit tests (covering the 1.1/1.4/1.5/1.6 assertions above), and `i18n:check` on every push/PR. Node upgrades from 20.17.0 (EOL) to 24.x, drops `ts-node`, and uses `node:test` for testing (no new dependencies).

## Cross-Story Dependencies

- Story 1.6 (schema versioning) depends on the grid-structure change delivered in Story 1.5.
- Story 1.12's CI test suite must cover the assertions introduced by Stories 1.1, 1.5, and 1.6.
- Story 1.8's build-workflow independent trigger requirement (so L2 can render even when fetching is stopped) depends on the fetch/build workflow split (AD-6), which is formally realized as part of Epic 2's SSG pipeline — Epic 1 only needs the build workflow's independent entry point to exist.
- Story 1.13's disclosure block is explicitly marked temporary: when Epic 2 ships its full page rewrite (Epic 2 Story 2.13, cutover), the same PR must remove Story 1.13's block. The two must never coexist for more than one deploy cycle.

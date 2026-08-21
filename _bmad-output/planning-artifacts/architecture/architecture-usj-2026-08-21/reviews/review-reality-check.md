# Reality-Check Review — ARCHITECTURE-SPINE.md

- **Target:** `_bmad-output/planning-artifacts/architecture/architecture-usj-2026-08-21/ARCHITECTURE-SPINE.md`
- **Review date:** 2026-08-21
- **Scope:** Verify every committed technical decision was web-researched or reality-checked rather than asserted from training data.
- **Method:** Primary sources only where available (nodejs.org release `schedule.json`, npm registry, docs.github.com, developers.cloudflare.com). Community/staff sources used only where no primary doc exists, and flagged as such.

## Verdict

The spine is **unusually well-researched on versions** — Astro and Eleventy are pinned to the exact current releases, and the Node 20/24 EOL dates match `nodejs.org`'s `schedule.json` to the day. Nothing appears hallucinated from training data.

But **two load-bearing platform claims are wrong or unexamined**, and both are the kind that only surface after implementation:

1. The stated reason for rejecting Cloudflare Pages does not apply to the spine's own deployment shape.
2. The GitHub Actions **billed-minutes** budget is never computed, and the design as written appears to exceed the free allowance.

Neither invalidates an AD, but F1 reopens a rejected alternative and F2 forces a change to the cron interval that AD-4 declares interlocked.

---

## Confirmed correct

| # | Claim in spine | Status | Source |
|---|---|---|---|
| C1 | Node 20 EOL 2026-04-30 | ✅ exact | `nodejs/Release` `schedule.json`: `"v20": { "end": "2026-04-30" }` |
| C2 | Node 24 EOL 2028-04-30 | ✅ exact | same: `"v24": { "end": "2028-04-30" }` |
| C3 | Node 24 is Active LTS | ✅ true **today**, expires in ~2 months — see F4 | same: `"v24": { "lts": "2025-10-28", "maintenance": "2026-10-20" }` |
| C4 | Astro "7.2.x" is the rejected alternative's current line | ✅ current — latest is **7.2.4** | `registry.npmjs.org/astro/latest` |
| C5 | Eleventy 3.1.6 | ✅ exactly current | `registry.npmjs.org/@11ty/eleventy/latest` |
| C6 | Cloudflare Pages free plan = 500 builds/month | ✅ verbatim | [Pages limits](https://developers.cloudflare.com/pages/platform/limits/): Free — "1 build at a time", "500" builds/month |
| C7 | GitHub Pages 10 builds/hour soft limit; **custom Actions workflow exempt** | ✅ verbatim | [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): "GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow." |
| C8 | GitHub Pages 1 GB repo / 1 GB site | ✅ but soft vs hard conflated — see F8 | same page |
| C9 | Free-tier Pages requires a public repo | ✅ | "GitHub Pages is available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server." |
| C10 | `GITHUB_TOKEN`-authored pushes do not trigger `push` workflows | ✅ verbatim | [Triggering a workflow](https://docs.github.com/actions/using-workflows/triggering-a-workflow): "…events triggered by the `GITHUB_TOKEN`, with the exception of `workflow_dispatch` and `repository_dispatch`, will not create a new workflow run." |
| C11 | `workflow_run` only works within the same repository | ✅ | [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — `workflow_run` is configured by naming workflows in the same repo; no cross-repo form exists. Additional caveats in F5. |
| C12 | `node:test` is stable on Node 24, zero extra deps | ✅ | [Node 24 test docs](https://nodejs.org/docs/latest-v24.x/api/test.html): "Stability: 2 - Stable" (stable since v20.0.0). Caveat in F7. |
| C13 | Actions `concurrency` prevents overlapping scheduled runs | ✅ | [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency): a queued run in an occupied group becomes `pending`. Nuance in F9. |
| C14 | Fine-grained PAT scoped to `contents: write` on a single other repo | ✅ | [Managing your PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens): "Only select repositories" + per-permission `read`/`write` (`contents`). Caveat in F6. |
| C15 | Deferred option (a) math: "currently 2/hour" under a 10/hour cap | ✅ `*/30` = 2/hour, correct |

---

## Findings

### F1 — HIGH — The Cloudflare Pages rejection rationale does not apply to this architecture

**Spine says** (Stack, 不採用): *"Cloudflare Pages（免費方案 500 builds/月，而每 30 分部署 ≈ 1,440 次/月，壓進額度需降到約每 1.5 小時，會打破「庫存摘要新鮮度 ≤ 1 小時」）"*

The 500/month figure is correct (C6), and 48 × 30 = 1,440 is correct arithmetic. **The error is in what that quota counts.**

The Pages "builds per month" quota meters **Cloudflare's own Git-triggered build system** — the docs introduce the Builds section with "Each time you push new code to your Git repository, Pages will build and deploy your site." **Direct Upload deployments (`wrangler pages deploy`) do not run a Cloudflare build and do not consume that quota.** Cloudflare staff have stated this repeatedly in the community forum: Direct Upload deployments "do not count towards the monthly builds quota… currently they don't count towards any quota."

This matters because **the spine's own design is already the Direct Upload shape.** AD-5/AD-6 build the site in the private repo's GitHub Actions and push only artifacts. Cloudflare would never be given a Git repo to build from, so the 500-build ceiling is never reached and the "must drop to every 1.5 hours" conclusion does not follow. The alternative was rejected on a constraint it does not face.

**Honest caveat, which the spine should have carried:** this exemption is **not stated in Cloudflare's official docs**. I checked [pages/platform/limits](https://developers.cloudflare.com/pages/platform/limits/), [pages/platform/limits/index.md](https://developers.cloudflare.com/pages/platform/limits/index.md), [pages/get-started/direct-upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), and [pages/configuration/build-configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) — none of them address whether Direct Upload counts. The Direct Upload page documents only file-count/size limits (20,000 files / 25 MiB via wrangler; 1,000 files via drag-and-drop). So the correct state of knowledge is *"undocumented; staff say it's exempt; would need to be confirmed before relying on it"* — which is still the opposite of what the spine asserts.

**Impact:** GitHub Pages may still be the right choice (fewer moving parts, no third-party account in the kill-switch path, and AD-15 explicitly wants no third-party console). But those are the real reasons; the recorded reason is wrong, and a future reader re-litigating this decision will be misled.

**Fix:** Replace the parenthetical with the actual reason for rejection, or record the Cloudflare quota question as verified-but-undocumented.

---

### F2 — HIGH — The GitHub Actions billed-minutes budget is never computed, and the design appears to exceed the free allowance

This is not in the spine at all — it is a missing reality check, and it collides with AD-4 and AD-5.

Facts:

- **AD-5 requires the fetch and build pipeline to live in a private repo.** ("抓取管線、`data/` 及其完整 git 歷史只存在於**私有** repo.")
- Actions minutes are **free in public repositories only**: "The use of standard GitHub-hosted runners is free: In public repositories." ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) Private-repo usage is metered.
- **GitHub Free includes 2,000 minutes/month** (Pro/Team: 3,000).
- **Minutes round up per job:** "GitHub rounds the minutes and partial minutes each job uses up to the nearest whole minute." ([Actions minute multipliers](https://docs.github.com/en/billing/reference/actions-minute-multipliers))

Arithmetic for the spine's design:

| Workflow | Runs/month | Billed minutes (floor) |
|---|---|---|
| `fetch.yml`, cron `*/30` | 48/day × 30 = **1,440** | **≥ 1,440** (even a 10-second run bills 1 min) |
| `build.yml`, `on: workflow_run` | up to 1,440 | **≥ 1,440**, less only if gated to skip when no data changed |
| **Total** | | **1,440 – 2,880 min/month vs a 2,000 min allowance** |

The fetch workflow alone consumes **72% of the free monthly allowance before doing any work**, and a realistic fetch run (rate-limited to ≤1 req/sec with up to 6,000 requests per run, per AD-4) will run for minutes, not seconds — a 3-minute average puts fetch alone at ~4,320 minutes, more than double the allowance. Adding the build workflow guarantees a breach.

**Interaction with AD-4:** AD-4 declares a five-way interlock — `RATE_LIMIT_PER_SEC`, `CONCURRENCY`, cron interval, `timeout-minutes`, `STALE_MS` — "不得單獨調整其一而不重算其餘." **Billed minutes is a sixth variable in that interlock and is missing.** Both cron interval and `timeout-minutes` feed directly into it. Any change to either now has a cost consequence the interlock does not capture.

**Interaction with AD-15/AD-16:** running out of minutes mid-month is exactly the AD-16 silent-failure scenario ("抓取被擋、PAT 過期、站台三天沒更新，而一切看起來都是綠的") — except worse, because a spend-limit stop doesn't produce a red job at all; workflows simply stop being scheduled. AD-16's five must-fail conditions do not include "Actions minutes exhausted."

**Fix options (all architectural, hence in scope for the spine):**
- Lengthen the cron interval and re-derive the freshness claim (but see F3 — the ≤1h freshness claim is already softer than stated).
- Pay for Actions minutes / a plan with more minutes, and record it as an accepted operating cost.
- Split the topology: keep `data/` private (AD-5 is about the *data*, not the *compute*) but note that any public-repo compute would need the data to reach it, which AD-5 forbids — so this is likely not available.
- Add "Actions minutes remaining below threshold" as a sixth AD-16 failure condition regardless of which option is chosen.

---

### F3 — MEDIUM — The freshness guarantee used to reject Cloudflare is not deliverable on GitHub Actions cron either

The Cloudflare rejection turns on breaking *"庫存摘要新鮮度 ≤ 1 小時."* But GitHub Actions `schedule` carries no delivery guarantee:

> "The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the start of every hour. **If the load is sufficiently high enough, some queued jobs may be dropped.**"
> — [Events that trigger workflows § schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

Two consequences:

1. **The comparison is not apples-to-apples.** `*/30` on GitHub Actions does not guarantee ≤1h freshness; it targets it. Rejecting an alternative for *guaranteeing* only ~1.5h while the chosen option *best-efforts* 0.5h with silent drops is a weaker argument than the spine presents.
2. **`*/30` fires at `:00` and `:30` — the two worst minutes.** GitHub explicitly names "the start of every hour" as a high-load window and recommends scheduling off-hour. A cron of `7,37 * * * *` costs nothing and materially improves delivery.

Because AD-13 ("不確定時顯式標為未知") and NFR11 already require displaying the actual capture time, a dropped run degrades gracefully — but the spine should state that freshness is best-effort, not a guarantee, especially since FR18–FR20 are about data transparency.

**Fix:** Restate the freshness target as best-effort; move the cron off `:00`/`:30`.

---

### F4 — MEDIUM — The Node 24 "Active LTS" label expires ~60 days after this document's own date

Per `schedule.json`:

```json
"v24": { "start": "2025-05-06", "lts": "2025-10-28", "maintenance": "2026-10-20", "end": "2028-04-30" }
"v26": { "start": "2026-05-05", "lts": "2026-10-28", "maintenance": "2027-10-20", "end": "2029-04-30" }
```

As of the spine's date (2026-08-21), Node 24 **is** Active LTS — the claim is true. But:

- **2026-10-20:** Node 24 drops to Maintenance LTS.
- **2026-10-28:** Node 26 becomes Active LTS.

So the Stack table's parenthetical `24.x（Active LTS…）` is false within two months of being written. The EOL date (2028-04-30) is correct and the support window is long, so **the pin itself is defensible** — but the justification given for it will not survive the quarter, and a reader in November will find the spine self-evidently stale on its most prominent version claim.

Also worth noting for context (checked, not an error): Node's release cadence changes from October 2026 — one major per April, LTS promotion each October, all releases becoming LTS. The odd/even distinction the spine implicitly relies on is going away.

Current releases at review time: Node **v24.19.0** (2026-08-03), v26.7.0 (2026-08-05).

**Fix:** Justify the pin on the EOL date (2028-04-30) rather than on the "Active LTS" label, or state explicitly that Node 26 is the intended next hop after 2026-10-28.

---

### F5 — MEDIUM — `workflow_run` caveats AD-6 depends on but does not state

AD-6 and the container diagram make `workflow_run` the sole coupling between fetch and build. The same-repo constraint is correct (C11), but three documented behaviors are load-bearing and unstated:

1. **The workflow file must exist on the default branch or the event never fires.** "This event will only trigger a workflow run if the workflow file exists on the default branch." A `build.yml` developed on a feature branch will silently never run — a Day-1 implementation trap.
2. **`workflow_run` fires on *completion*, not on *success*.** Without `types: [completed]` plus an `if: github.event.workflow_run.conclusion == 'success'` gate, the build workflow runs after every failed fetch too. This is arguably *desirable* here — AD-6 explicitly wants the site deployable when fetching dies — but it must be a stated choice, not an accident, because it also doubles the minutes cost in F2.
3. **`workflow_run` chains cap at three levels.** Fine for the current two-level design; a constraint if anyone adds a third stage.

**Additional unverifiable risk worth an empirical check:** "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." The docs scope this to public repos and are silent on private ones. The spine's pipeline is private *and* AD-5's diff-only write convention (`data/` written only "在「答案改變」時") means a quiet period genuinely produces no commits. If the 60-day rule applies to private repos, the fetch workflow would silently disable itself — precisely AD-16's stated nightmare. **This should be confirmed empirically rather than assumed either way.**

---

### F6 — LOW/MEDIUM — The PAT choice is correct but was not compared against the option that removes its own failure mode

The spine's convention — *"推送公開站台 repo 的 PAT 為 fine-grained、僅授予該 repo 的 `contents: write`"* — is **verified achievable** (C14): "Only select repositories" scoping plus a `contents` permission set to read-and-write is exactly the documented configuration for pushing to one repo.

But AD-16 then has to list *"推送公開站台 repo 的 PAT 失效"* as a must-fail condition — i.e. the spine designs around a failure mode it chose. Fine-grained PATs expire, and org/enterprise policy can cap their maximum lifetime ("Infinite lifetimes are allowed but may be blocked by a maximum lifetime policy set by your organization or enterprise owner"). A single-repo **deploy key** (SSH, write-enabled) is scoped just as tightly, is not coupled to a personal account, and does not expire. GitHub also treats a deploy-key push as a normal user push, so it triggers workflows — irrelevant here (the public repo just serves Pages) but a strict superset of PAT behavior.

Not an error — the PAT works. But it is a decision recorded without its alternative, in a spine that elsewhere documents rejections carefully.

---

### F7 — LOW — `node:test` is stable and sufficient, but two adjacent features are not

`node:test` on Node 24 is "Stability: 2 - Stable" (C12), and it is genuinely adequate for AD-4's requirement (assert `RATE_LIMIT_PER_SEC <= 1`, `CONCURRENCY <= 2`, `MAX_REQUESTS_PER_RUN <= 6000`) with zero dependencies. Snapshot testing is also stable (since v23.4.0), and reporters and mocking are stable.

Two caveats if the test strategy grows:
- **Code coverage is still experimental**, requiring `--experimental-test-coverage`.
- **Watch mode is experimental.**
- Global setup/teardown, test tags, and randomized execution are all "1.0 — Early development" on 24.x.

None blocks the spine. Worth knowing before anyone proposes a coverage gate in CI.

---

### F8 — LOW — The `ts-node` pin is obsolete on the very Node version the spine mandates

The Stack table lists `ts-node ^10.9（既有）` alongside the boast that testing uses `node:test` for **"零新依賴"** (zero new dependencies). But the spine simultaneously mandates the upgrade to Node 24, and on Node 24 **`ts-node` is largely unnecessary**:

> "Stability: 2 - Stable" — type stripping, [Node 24 TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
> v23.6.0: enabled by default · v24.3.0: no longer emits an experimental warning · **v24.12.0: stable**

Node 24 runs `.ts` files directly, by default, with no flag. The constraints are modest and align with a clean codebase: no `enum`, no runtime `namespace`, no parameter properties, no import aliases (all of which need `--experimental-transform-types`), and the recommended `tsconfig.json` sets `erasableSyntaxOnly: true` and `verbatimModuleSyntax: true`.

Given the spine explicitly rejects Astro and Eleventy because *"六個頁面攤不掉框架的依賴與升級面"* — a dependency-minimization argument — carrying `ts-node` while claiming zero-new-dependency testing is inconsistent. This is a free dependency removal that the Node upgrade already pays for.

**Fix:** Note `ts-node` as removable-on-Node-24, or state why it is retained.

---

### F9 — LOW — Documentation precision on GitHub Pages limits, and the `concurrency` nuance

**Pages limits — soft vs hard, and two omissions.** The spine cites "1GB repo/site" as one figure. The docs distinguish them:
- Source repo: "GitHub Pages source repositories have a **recommended** limit of 1 GB." (soft)
- Published site: "Published GitHub Pages sites **may be no larger than** 1 GB." (hard)

Two limits the spine omits that matter to this product:
- **"GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month."** The entire business model is SEO traffic plus FR25 ads — bandwidth is the one Pages limit this project could plausibly hit, and it is the only one not mentioned.
- **"GitHub Pages deployments will timeout if they take longer than 10 minutes."**

Neither threatens six pages today. The bandwidth ceiling belongs in the spine because success is what breaches it.

**`concurrency` nuance (assumption holds).** The spine's *"同一時間只允許一個回合"* is accurate. Precisely: a queued run in an occupied group becomes `pending`; by default "any existing `pending` job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place"; `cancel-in-progress: true` additionally kills the running one. So without `cancel-in-progress`, an overrunning fetch **delays** the next tick rather than dropping it — correct for this use case (never kill a mid-flight rate-limited fetch), and it means `timeout-minutes` must stay well under the cron interval or runs chain-delay indefinitely. That is the AD-4 interlock doing its job; no change needed, but the reason `cancel-in-progress` must stay `false` deserves a sentence.

---

## Assertions checked and found sound (no action)

- No pinned version in the Stack table is stale. Astro 7.2.x and Eleventy 3.1.6 are exactly current as of review date — strong evidence these were genuinely looked up.
- AD-6's reasoning chain (`GITHUB_TOKEN` push → no `push` trigger → therefore `workflow_run`) is factually correct end-to-end.
- The Deferred item on Pages publishing (branch-publish vs `actions/deploy-pages`) correctly characterizes both the 10/hour soft limit and the custom-workflow exemption, and its "2/hour currently" math is right.
- Free-tier Pages requiring a public repo is correct and is consistent with AD-5's private/public repo split.

---

## Recommended edits, in priority order

1. **Rewrite the Cloudflare rejection** (F1) — the stated reason does not apply to a Direct Upload deployment shape, which is what this architecture uses.
2. **Add an Actions-minutes budget** (F2) — compute it, pick a resolution, and add billed minutes as a sixth variable in AD-4's interlock plus a sixth condition in AD-16.
3. **Soften the freshness claim to best-effort and move cron off `:00`/`:30`** (F3).
4. **Rejustify the Node 24 pin on its 2028-04-30 EOL rather than the "Active LTS" label** (F4).
5. **State the `workflow_run` default-branch and conclusion-gating caveats in AD-6; empirically confirm whether the 60-day auto-disable applies to private repos** (F5).
6. Minor: PAT vs deploy key (F6); coverage/watch experimental status (F7); drop `ts-node` on Node 24 (F8); Pages bandwidth limit and `cancel-in-progress: false` rationale (F9).

---

## Sources

- [Node.js Releases](https://nodejs.org/en/about/previous-releases) and [nodejs/Release `schedule.json`](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)
- [Node.js — Evolving the Node.js Release Schedule](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)
- [endoflife.date — Node.js](https://endoflife.date/nodejs)
- [Node.js 24 `node:test` docs](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [Node.js 24 TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
- [Node.js release index](https://nodejs.org/dist/index.json)
- [npm registry — astro](https://registry.npmjs.org/astro/latest)
- [npm registry — @11ty/eleventy](https://registry.npmjs.org/@11ty/eleventy/latest)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [index.md](https://developers.cloudflare.com/pages/platform/limits/index.md)
- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare community — Does Pages development via Direct Uploads count towards the monthly build quota?](https://community.cloudflare.com/t/does-pages-development-via-direct-uploads-count-towards-the-monthly-build-quota/390920) (staff answer; not official docs)
- [Cloudflare community — Does a direct upload (using wrangler) count as a "build"?](https://community.cloudflare.com/t/does-an-direct-upload-using-wrangler-count-as-a-build/384701)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub Actions — Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Actions — Triggering a workflow](https://docs.github.com/actions/using-workflows/triggering-a-workflow)
- [GitHub Actions — Workflow syntax (`concurrency`)](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
- [GitHub Actions — Limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Actions minute multipliers](https://docs.github.com/en/billing/reference/actions-minute-multipliers)
- [GitHub — Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

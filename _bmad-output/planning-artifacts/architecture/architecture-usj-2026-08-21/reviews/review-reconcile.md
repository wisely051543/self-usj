# Input Reconciliation Review — ARCHITECTURE-SPINE.md

**Reviewed**: `_bmad-output/planning-artifacts/architecture/architecture-usj-2026-08-21/ARCHITECTURE-SPINE.md`
**Against**: `prds/prd-usj-2026-08-16/prd.md`, `prds/prd-usj-2026-08-16/legal-terms-extract.md`, and the existing codebase (`src/*.ts`, `index.html`, `.github/workflows/fetch.yml`, `.claude/skills/localizing/SKILL.md`, `data/`)
**Date**: 2026-08-21
**Scope**: what did NOT land in the spine, and what the spine asserts that its inputs do not support. No new features proposed. No praise.

Severity: **BLOCKER** (spine cannot be built from as written) / **HIGH** / **MEDIUM** / **LOW**.

---

## A. Requirements that did not land at all (no AD, no Deferred, no binds)

### A1 — NFR15.2 / NFR15.3 / NFR15.4 are absent from the entire spine — **BLOCKER**

**Source**: `prd.md:267` (NFR15.2 隱私權政策頁), `prd.md:268-269` (NFR15.3 電気通信事業法 外部送信規律), `prd.md:270` (NFR15.4 EEA/UK CMP).

The spine's `binds:` list (`ARCHITECTURE-SPINE.md:11`) runs `… NFR13, NFR14, NFR15, NFR15.1, NFR16 …` — **NFR15.2, NFR15.3 and NFR15.4 are skipped**. The Capability map row is `NFR13–NFR15.1 揭露與定位` (`:286`), which stops one sub-clause short. Nothing in Deferred mentions them.

This is not bookkeeping. All three have architectural teeth:

- NFR15.2/NFR15.3 are **pages**. Every generated page is subject to AD-19 (canonical, hreflang three-way symmetry, sitemap coverage) and AD-11's page arithmetic. Adding them retroactively is exactly the kind of change AD-19 is written to catch, and there is no page-inventory anywhere in the spine that includes them.
- NFR15.4 (a certified CMP) is a **third-party runtime script that must execute before ads load**. That collides head-on with AD-8 ("站台零 runtime 資料 fetch", `:96-100`), with NFR18/CLS, and with AD-7's request-boundary carve-out, which exempts only "第三方廣告主機" (`:94`) and says nothing about a consent platform. The spine's one ad-related Deferred entry (`:296`) defers only 版位數量與位置.
- NFR15.3 is flagged in the PRD as "成本很低、可交付的 **P0 項目**" (`prd.md:269`) — i.e. it is *not* deferrable to P3 with the ads.

### A2 — NFR9.2 (working contact address) has no owner; the Deferred entry attributes it to an AD that does not cover it — **HIGH**

**Source**: `prd.md:250` (NFR9.2), `prd.md:249` (the `[NOTE FOR PM]` explaining why anonymity makes a contact address *necessary*, not optional — registrar/host takedown is the fast path that routes around an anonymous operator).

The spine's Deferred entry on request headers says "NFR9.2 的頁面聯絡窗口**已由 AD-16／揭露需求承接**" (`:298`), and the Capability map maps `NFR9–NFR9.2` to `AD-15, AD-16` (`:284`). **AD-16 is the job-failure boundary** (`:144-148`) — five conditions that redden a CI run. It has nothing to do with a public contact address. No AD states that the site must carry a reachable email. NFR9.2 is in `binds` but bound to nothing.

Same defect for **NFR9.1 items 2 and 3** (`prd.md:245-248`): AD-15 covers item 2 (L2/L3 take-down) and AD-5 preserves the feasibility of item 1 (data destruction), but item 3 — **對外窗口：誰接、多久內回覆** — appears nowhere, in any AD or Deferred entry.

### A3 — NFR10's "更新成功 ≠ 更新正確" and §3's two counter-metrics have no mechanism — **HIGH**

**Source**: `prd.md:254` (NFR10: 兩者須**分別量測**), `prd.md:42-43` (counter-metrics: 抓取禮貌性 = 每小時請求數上限 + 封鎖次數 0；資料正確率 = 顯示值與官方不符的回報數).

The spine's only measurement machinery is AD-16, which measures **liveness** (blocked, budget exhausted, N consecutive failures, data age, PAT expiry). Every one of those is a "更新成功" signal. Nothing in the spine measures or even names correctness, and there is no Deferred entry saying it is postponed. The PRD's own framing — "『更新成功』不等於『更新正確』" — is the exact failure mode AD-16 institutionalises, since a source that starts returning plausible-but-wrong numbers reddens nothing.

The counter-metric "被封鎖次數應為 0" is partially covered by AD-16's 403/429 rule; "每小時請求數不得超過上限" is not measured anywhere (AD-4 asserts *constants*, never observed request counts — see B1).

### A4 — O13 (cold start is lossy; `data/` carries state beyond the sampling window) is missing from Deferred — **MEDIUM**

**Source**: `prd.md:223` (實測: cold start recovers 21 products, warm state has 23; `EXP0070`/`EXP0082` survive only via the previous `index.json` `known` list), `prd.md:347` (O13, due "P0 實作降速時一併決定").

Verified in code: `src/sources/usj.ts:457-465` (`known` seeding, `carriedOver`) and `src/fetcher.ts:205-207, 237, 104-114` (`lastSeenAt` clock + `DELIST_AFTER_DAYS = 14` sweep). `data/` is genuinely a state store, not a cache.

The spine has no AD and no Deferred entry for this — while **AD-5 mandates the single most dangerous operation for it**: relocating `data/` and its full history into a different (private) repo (`:78-82`). A migration that drops or truncates `data/index.json` silently loses catalogue entries that the 7-day sampling window cannot recover. AD-6 asserts "建置 workflow 須能在無新資料的情況下獨立成功執行" (`:88`) but says nothing about `data/` durability across the split.

### A5 — O14 (`fetch.yml` comment contradicts measurement) has no home — **LOW**

**Source**: `prd.md:348` (O14), `prd.md:199, 225`. The comment at `.github/workflows/fetch.yml:5-7` states "rate-limited to 5 req/s … a warm one … takes well under a minute". Measured warm run: 7m17s. AD-4 will make the "5 req/s" half wrong too. The spine touches `fetch.yml` in AD-4 and in the Structural Seed (`:264`) but never records that this comment must be corrected, and AD-4's own Prevents clause (`:75`) argues that comments do not hold — which is precisely why leaving a false one in place matters.

### A6 — FR6 and FR7 are missing from `binds` — **LOW**

`ARCHITECTURE-SPINE.md:11` jumps `FR5, FR8` — FR6 (mobile, no horizontal scrolling; `prd.md:101`) and FR7 (name/eyebrow/fromPrice, no official images; `prd.md:102-103`) are absent from the frontmatter, though the Capability map claims "FR1–FR7" (`:275`). FR7's substance is carried by AD-7; FR6's is nominally carried by NFR16 → AD-8/AD-11, neither of which says anything about layout or horizontal scroll.

---

## B. Constraints the spine restated in a way that weakens or inverts them

### B1 — AD-4 adopts `CONCURRENCY <= 2` while keeping cron `*/30` and saying nothing about `timeout-minutes` — this breaches NFR5 — **BLOCKER**

**Source**: `prd.md:192` (NFR4 target: 1 req/s **並行度 2**), `prd.md:195` (`[NOTE FOR PM]`: 並行度 4→2 pushes cold start to **~21 分鐘**; "**若要同時降速率與降並行度，逾時必須一起調高**"), `prd.md:197` (NFR5: 單回合耗時**不得超過排程間隔的一半** = 15 分鐘), `prd.md:208` (NFR5.2: concurrency 2 is one of the three triggers that force the timeout up), `prd.md:210-214` (共同解: the change is an **isolated single-value** edit `RATE_LIMIT_PER_SEC: 5 → 1`; cron, timeout and `STALE_MS` 皆不必動 — **a conclusion that holds only while `CONCURRENCY` stays 4**).

AD-4 (`:72-76`) asserts `RATE_LIMIT_PER_SEC <= 1` **and** `CONCURRENCY <= 2`, then declares the five values interlocked — but never states the recomputed cron or timeout. The Structural Seed keeps `cron */30` (`:209`) and never mentions `timeout-minutes` at all; the current value is 25 (`.github/workflows/fetch.yml:14`).

Consequence, using the PRD's own measured throughput model (`prd.md:223`: 有效吞吐 ≈ CONCURRENCY ÷ 3.5s):
- cold start at concurrency 2 ≈ **21 分鐘 > 15 分鐘** → **NFR5 is violated by the spine as written**, and every 12th run is a near-cold-start heavy run (`prd.md:202`), so this is not a once-only event.
- 21 min against `timeout-minutes: 25` leaves ~4 minutes of margin, versus the "餘裕逾一倍" the PRD relied on (`prd.md:207`).

Worse, AD-4's enforcement mechanism cannot see this: it tests **constants**, not run duration. NFR5 is a statement about *elapsed time per run relative to the schedule interval*, and nothing in the spine ever measures or asserts it. The spine's five-value interlock rule is therefore stated but not enforceable, while the one value it does enforce puts the system outside NFR5.

Either the spine must drop `CONCURRENCY <= 2` (restoring the PRD's isolated-change conclusion), or it must state the recomputed cron/timeout — it does neither.

### B2 — AD-18 inverts the `localizing` skill's explicit design and pressures a FR11 violation — **HIGH**

**Source**: `.claude/skills/localizing/SKILL.md:10` (the `undefined` trap belongs to **`STRINGS` only** — "Adding a locale means writing every key; a missing key renders `undefined`, so the table is all-or-nothing"), `SKILL.md:42` ("**Partial coverage is the designed outcome.** An unmatched phrase stays Japanese, so a half-translated blurb still reads. **Never invent an entry to avoid a gap.**"), `src/i18n-check.ts:1-12` ("a term the tables miss does not break the page — it renders in Japanese, **which is by design**").

AD-18 (`:156-160`) says the two budgets are "**同構**", that key completeness is CI-checked for both, and that "**缺 key 即失敗**". Three problems:

1. **The two budgets are not the same shape.** `terms.<locale>.json` is a *longest-key-first substring replacement table* keyed by Japanese source strings (`SKILL.md:37-44`, `i18n-check.ts:49-56`) — it has no fixed key set to be complete against. `STRINGS` is a key→string map. "Key completeness" is meaningful for one and undefined for the other.
2. **"缺 key 即失敗" reverses a deliberate design.** The graceful Japanese fallback is stated as intentional in two independent places. A CI gate that fails on an uncovered Japanese fragment creates direct pressure to write a guess — which `SKILL.md:42` forbids in as many words and which **FR11** (`prd.md:113`: 須採用官方各語言版本的正式名稱，**不得自行翻譯**) forbids as a product requirement.
3. **"新增語言＝新增兩個 JSON 檔，不改程式碼" is false.** `NAME_LANGS` is a code constant in `src/sources/usj.ts:36`, and `SKILL.md:23` step 1 explicitly instructs adding accepted language codes to it. `TABLE_LOCALES` in `src/i18n-check.ts:22` is likewise hardcoded, and the en table is augmented at check time from API attraction names (`i18n-check.ts:98-107`). There is no `terms.ja.json` — `ja` is the source — so the "two files per language" rule is wrong for the source language too.

### B3 — FR11's actual enforcement mechanism (`verified`: canonical vs provisional) is nowhere in the spine — **HIGH**

**Source**: `SKILL.md:15-19` ("Four of the first fourteen names checked were wrong this way, and none looked wrong" — a literal translation reads perfectly and is still wrong), `SKILL.md:31` ("Record the verdict … A name with no verdict is the one that silently ships wrong"), `SKILL.md:33`, `SKILL.md:48-70`.

FR11 is in `binds` and mapped to AD-18. But AD-18 checks only **presence** of a key. Presence cannot detect the failure mode FR11 exists to prevent: a *present, plausible, self-invented* name. The term files' `verified` field — the canonical/provisional ledger that is the real control — is not mentioned in any AD, convention, or Deferred item. The spine's only automated language gate (AD-19) checks SEO structure, not name provenance.

### B4 — AD-3's rule is over-broad in one direction and silently outlaws the documented localizing workflow in the other — **MEDIUM**

AD-3 (`:66-70`) says "所有發往**來源主機**的 HTTP 請求必須且只能經由 `limitedFetch`" and then "**任何層皆不得直接呼叫 `fetch`**". The second sentence is broader than the first: `index.html:1022, 1282` calls `fetch()` for local `data/*.json`, and the renderer will need file/HTTP reads that have nothing to do with usj.co.jp.

More materially: `SKILL.md:23` instructs a raw `curl` to `comm-api.usj.co.jp`, and `SKILL.md:53-66` instructs fetching `www.usj.co.jp/contentdata/...` plus `WebSearch` scoped to `usj.co.jp`. Under AD-3 as written, the entire documented naming procedure is prohibited; under AD-3 as intended, it is an unacknowledged exemption. Either way the spine does not say which. See also C4.

### B5 — Deferring the "資料齡門檻" reopens a value the PRD explicitly closed — **MEDIUM**

The spine's Deferred entry (`:293`) defers both "連續 N 回合失敗" 的 N **and** "資料齡門檻的具體值", pending a month of Actions history (O6). But `prd.md:210` states `STALE_MS` **維持 90 分鐘** (暖機 7.3 分鐘 + 30 分鐘間隔，餘裕逾 50 分鐘) as a settled non-change, and the value already exists in code (`index.html:287`, `STALE_MS = 90 * 60 * 1000`), where it drives the FR19 stale banner today.

The spine also conflates two different thresholds under one name: the **page's** freshness threshold (FR19/NFR11 — user-facing) and the **pipeline's** alert threshold (AD-16 — operator-facing). Deferring the former erases an existing, PRD-confirmed behaviour; they need separate values because they answer different questions.

### B6 — AD-15 claims "每一級皆須可由單一動作達成" but specifies a mechanism for only L1 and L2 — **MEDIUM**

AD-15 (`:138-142`) names the flag file as the mechanism, and notes the build layer reads it so the site enters L2 automatically. **L3 (整站下架) has no named single action** — and taking GitHub Pages down is necessarily an action inside GitHub's console, which is exactly the "不依賴第三方後台" that AD-15's own *Prevents* clause rules out. The R15 scenario the AD is written against (大阪, 日語, 假處分, 目的為關站, 速度快 — `prd.md:304`, `legal-terms-extract.md:57-59`) is precisely the one where L3 is the level that matters.

---

## C. Quiet requirements with architectural teeth that the AD structure dropped

### C1 — The single fact the whole legal position rests on is not protected by any AD — **HIGH**

**Source**: `legal-terms-extract.md:165` ("**唯一真正的出路是問題 1** — 組入要件。… 本站的事實（**從未註冊、從未登入、從未載入顯示條款的網頁**）在該爭點上是**乾淨的**"), `legal-terms-extract.md:41` (組入 requires a 表示 the client cannot in fact have seen), `prd.md:292` (R3.1: this is the distinguishing point from hiQ), `prd.md:289` (R3).

The spine has AD-1 (read-only) and AD-2 (no Queue-it bypass), but **no invariant forbidding the client from loading usj.co.jp HTML pages, accepting/sending cookies or session state, registering, or authenticating**. That is the load-bearing fact, and it is a purely architectural property — one future commit that fetches a store HTML page (for an image, a name, an OG tag) destroys the only escape hatch the legal package identifies, and nothing in the spine would flag it.

Note that `src/sources/usj.ts:77-82` already sends `x-anonymous-consents: %5B%5D`, i.e. the client deliberately impersonates the store front-end's anonymous-consent state. Whatever the right reading of that, the spine records neither the constraint nor the existing header.

### C2 — The spine's structural claim "本站根本不抓 `www.usj.co.jp`" is already false — **HIGH**

`legal-terms-extract.md:125, 131` and `prd.md:295` (R6) both rest on the factual claim that this project touches only `comm-api.usj.co.jp` and `store.usj.co.jp` — the two hosts whose robots.txt are permissive/absent. `www.usj.co.jp` returns 504 for robots.txt, which under RFC 9309 §2.3.1.4 means *assume disallow*, and both documents dismiss it with "**本站根本不抓 `www.usj.co.jp`**".

`.claude/skills/localizing/SKILL.md:53-66` instructs exactly that fetch: `https://www.usj.co.jp/contentdata/usj/<lang>/<region>/attractions/<slug>/index.html`, plus a parent-area walk when a slug 404s. The spine's Structural Seed shows only `comm-api.usj.co.jp` as an outbound edge (`:221`) and reproduces the same blind spot. Either the naming procedure is part of the system (and the robots.txt argument needs restating), or the spine must say it is out of band — it says neither.

### C3 — NFR2.1's unresolved principle is not carried into the spine, while AD-20 actively makes the forbidden move cheap — **HIGH**

**Source**: `prd.md:171-173` (NFR2.1: the data source is a reverse-engineered private interface; the `[NOTE FOR PM]` — "**本 PRD 對自己使用的私有 API 不設任何原則性限制，卻對別人的私有 API 說『關著的』… 此矛盾須於 P0.5 一併解決，不得繼續並存**"), `prd.md:73` (§5 excludes 任天堂/猩猩 整理券 on exactly that unstable ground), `prd.md:72` (Studio Pass excluded because it 實打實增加請求量，與 NFR4／NFR5 直接衝突).

NFR2.1 is in `binds` but the Capability map hands `NFR1–NFR3.2` to AD-1/AD-2/AD-7/AD-9/AD-17 — none of which contains any principle about private/undocumented interfaces. AD-2's admission gate for a new endpoint is a single question: "是否被轉向至候位機制" (`:64`).

Meanwhile **AD-20** (`:168-172`) is written to make adding a new platform adapter cheap and invites it explicitly ("新增票務平台時…"). The combination is that the spine lowers the cost of the exact expansion the PRD says is unresolved and must not be settled by implementers. The two scope exclusions the PRD justifies on *architectural* grounds (Studio Pass → request volume; App-only 整理券 → the unresolved principle) appear in no AD, no convention, and no Deferred entry, so an EXP-only catalogue is nowhere stated as an invariant even though `src/sources/usj.ts:397-410` currently produces it only as a side effect of the `expressAvailabilityDate` facet query.

### C4 — Design intent recorded only in code comments, deleted by AD-8 with no Deferred entry — **HIGH**

**Source (code comments, all load-bearing)**:
- `src/types.ts:32-38` — per-slot `availableUnits` "Also the party-size limit: the store stops offering a slot once a party is larger than what remains, **so the UI can answer 'which slots fit N people' … and never has to ask the store itself**."
- `src/sources/usj.ts:14-20` — `PEOPLE = 1` exists precisely so the UI can filter by party size offline: "asking for one and recording each slot's remaining units lets the UI filter by party size itself."
- `src/sources/usj.ts:270-277` — `fetchSlotStock` "is what lets the page answer party-size questions offline".
- Live feature in `index.html`: `MAX_PEOPLE = 10` (`:289`), `.people` controls (`:128-148`), `partyTotal` / `noneFitParty` / `dayDetailFit` / `peopleNoteDayHidden` strings in all three locales (`:459-486`), slot chips and slot detail panels (`:150-180`).

**AD-8** (`:96-100`) rules that `products/*.json` `timeSlots` need not reach the site, citing FR5. Two consequences the spine does not acknowledge:

1. **It silently deletes a shipped capability.** The party-size filter and the slot-detail view are the only things per-slot `availableUnits` was ever fetched for. There is no Deferred entry and no note recording that this is being dropped, nor any confirmation that FR5's "不展開逐時段明細" was intended to kill party-size filtering (FR5 speaks only about *displaying slot detail*, `prd.md:98`).
2. **It turns the most expensive fetch tier into pure waste.** The slot tier is the high-cost layer of NFR6's three-tier design (`prd.md:234`) and drives the periodic near-cold-start heavy run every 6 hours (`prd.md:202`, `MAX_SLOT_AGE_MS` at `src/sources/usj.ts:75`). Under AD-8 the entire slot pipeline — `fetchTimeSlots`, `fetchSlotStock`, the 6-hour forced refresh — survives only to produce `slots: <count>` for FR5. Gratuitous requests to usj.co.jp are the single behaviour the one clause that helps this project explicitly targets (`legal-terms-extract.md:83-84`: 禁止…造成**不當負擔或負荷**; `prd.md:290` R3.2). The spine never revisits whether the expensive tier is still justified.

### C5 — NFR6's stated intent is anti-regression, and the spine gave it no teeth — **HIGH**

**Source**: `prd.md:236` — "**本需求的意圖是保住這個設計不被回歸，而非新建**"; `prd.md:227` — 昂貴層須由**變動偵測**驅動而非每回合重取.

The tiering is described in the spine's paradigm table (`:31`, "協調層 … 三層排程") but no AD binds it. AD-4 hard-locks three limiter constants by test, and its Prevents clause is explicitly "一次『順手優化』讓整套法遵判斷無聲失效" (`:75`) — yet the constants that actually determine per-run volume live elsewhere and are unprotected: `SLOT_WINDOW_MONTHS = 1`, `MAX_SLOT_AGE_MS = 6h`, `CATALOG_SAMPLE_DAYS = 7` (`src/sources/usj.ts:52, 75, 67`), `MONTHS_AHEAD = 6` (`src/fetcher.ts:9`), and the `slotsAreStale()` change-detection gate (`src/sources/usj.ts:412-420`). Widening `SLOT_WINDOW_MONTHS` to 2 or dropping `slotsAreStale()` would multiply per-run volume while every AD-4 assertion still passes. AD-4's five-value interlock list does not include any of them.

### C6 — R7's "reverse warning" is half-captured — **LOW/MEDIUM**

`prd.md:296` (R7) warns that §5's exclusion of 付費補貨通知 is "**實質上是一項重大法務決策**，理由須留存，否則日後有人為變現把它加回去時沒有文件擋得住". AD-1 does capture the pricing half ("不得對使用者收費以解鎖庫存資訊", `:58`) — good. What is not captured is the *reason*: AD-1's Prevents cites the three Disney-scraper features generically and never names 補貨通知 as the specific proposal the exclusion exists to block, which is the form the future proposal will actually take (and §11 `prd.md:358` names it as the most obvious next step).

---

## D. Things the spine asserts that the PRD or the code does not support

### D1 — AD-12's mechanism is not implementable against the current data model — **BLOCKER**

AD-12 (`:120-124`) rules that the three states are derived once by `src/fetcher.ts` and "**寫成 `days.json` 的顯式欄位**", and the Structural Seed states "三態欄位掛在 **`DAY_PRODUCT`** 上" (`:241`).

`days.json` contains only *positive* rows. `src/fetcher.ts:132-141`: `if (!date.available) continue;` — a day entry is created only when at least one pass is on sale, and a `DayProduct` row exists only for a pass that is on sale that day. There is **no row to hang a 三態 field on** for the sold-out / not-yet-released / not-operating cases — those are precisely the absent cells. Confirmed against the data: 935 date rows across 31 product files, **0** with `available: false`.

AD-8 compounds it: the renderer may read only `days.json` + `index.json` (`:100`, `:241`). Neither carries the axes needed to enumerate empty cells — `ProductSummary` (`src/types.ts:112-131`) has `latestDate` but no `calendarStart`/`calendarEnd`, and `Days` (`src/types.ts:156-159`) has no date range and no timestamp of its own ("Carries no timestamp of its own", `types.ts:154`). A date on which *nothing* is on sale does not appear in `days.json` at all, so it is invisible to the renderer — yet that is exactly the FR3.1 case the product exists to show.

Either `days.json` must gain explicit negative rows plus an axis definition (a schema change bigger than the "1 → 2" bump AD-14 anticipates, `:136`), or AD-8's read-set is wrong. The spine states both as settled.

### D2 — The port already destroys the discriminating signal AD-12 needs — **HIGH**

`src/sources/usj.ts:162`: `const available = cd.canBeVisited && !cd.forceSoldOut && availableUnits > 0;`

The upstream response distinguishes three different conditions — `canBeVisited` (park/product operating that day), `forceSoldOut` (explicitly sold out), `availableUnits === 0` (exhausted) — and the adapter collapses all of them into one boolean before anything downstream sees them. `DateSlot` (`src/types.ts:42-57`) has no field to carry the reason.

AD-12 places the 三態 derivation in the **協調層** on the argument that it "是唯一同時看得到所有票種的地方" (`:124`). That is true for the cross-product question, but the per-cell reason is decided in the **取得層** and thrown away there. AD-20 (`:168-172`) draws the port boundary at "該通行證有沒有時段是來源自己的判斷" and does not extend it to "why is this date absent" — so under the spine as written, the layer that knows cannot tell, and the layer that must tell cannot know.

### D3 — FR19 (proactive stale marking) cannot survive AD-8 + AD-6 as stated — **HIGH**

**Source**: `prd.md:130` (FR19: 當資料超過新鮮度門檻仍未更新時，頁面須**主動標示**資料可能已過期), `prd.md:255` (NFR11).

Today this works because the page evaluates it live in the browser: `index.html:287` (`STALE_MS`), `:918` (`Date.now() - fetchedAt > STALE_MS`), `:940` (renders the banner). Under AD-8 every fact is baked at build time and the page performs no runtime data work; under NFR19/AD-8 the core content must not depend on JS. A page baked at T therefore cannot know at T+3h that its data has gone stale — the freshness banner freezes in whatever state it had at build.

The spine's only compensations are AD-16 (fail the *job* on excess data age — which changes nothing on the deployed page) and AD-15's flag file (which covers the deliberate kill-switch case, not the R14 case where the source simply disappears, `prd.md:303`). AD-6 chains the build to the fetch via `workflow_run` (`:88`) but never states whether the build runs when the fetch **fails** — and if it does not, the site stops rebuilding at exactly the moment FR19 needs it to rebuild. No AD, convention, or Deferred item resolves this.

### D4 — AD-11's "3 語 × 2 視角 = 6 個可索引 URL" is contradicted by the PRD's own required pages — **MEDIUM**

AD-11 (`:118`) states the page inventory as exactly six. The PRD requires, in three languages each: 隱私權政策 (NFR15.2, `prd.md:267`), an 外部送信 notice/publication page if applicable (NFR15.3, `prd.md:268`), a contact route (NFR9.2, `prd.md:250`), and prominent disclaimer/source/non-affiliation content (NFR13–NFR15.1). Some of that can be page furniture, but not all of it. Every additional page falls under AD-19's hreflang/canonical/sitemap checks, and AD-11's arithmetic is what AD-19 will be implemented against.

### D5 — The Stack table decides a question that Deferred says is open — **LOW**

Stack (`:198`) states hosting as "GitHub Pages（**自訂 Actions workflow 發佈**，明文豁免 10 次/小時的建置軟上限）" — i.e. option (b). Deferred (`:292`) presents (a) branch-publish and (b) a `deploy-pages` workflow as still open. Pick one.

### D6 — AD-5's *Prevents* may already be defeated, and the spine has no migration step — **MEDIUM/HIGH**

AD-5 (`:78-82`) exists so that NFR9.1's destruction obligation stays technically possible — i.e. so `data/` and its history are never fork/GHArchive/clone-able. But `index.html:1022` fetches `./data/days.json` **relative to the served page**, which only works if `data/` is publicly served; the repo is `git@github.com:wisely051543/self-usj.git` with an existing history of `chore: update availability data` commits. If that repo is (or ever was) public, the historical snapshots AD-5 protects are already outside the operator's control, and flipping visibility does not retract forks or archives.

The spine states the target end state and provides no migration invariant: no history-scrub or repo-recreation step, no statement of what happens to the already-published history, and no acknowledgement that AD-9 ("不得發佈任何批次可消費的資料檔", `:102-106`) describes a change from current behaviour rather than a preserved one. **This needs a factual check of the repo's current and past visibility before AD-5 can claim what it claims.**

### D7 — FR23's maintainable agent list has no source-of-truth location — **MEDIUM**

FR23 (`prd.md:139`) requires the robots.txt stance list to be **maintainable** ("新代理出現時應能追加"). The spine's source tree (`:245-269`) lists no `robots.txt` source anywhere in the private repo; the public repo is described as holding "只有建置產物 + robots.txt + sitemap.xml" (`:268`), while AD-6 says the public repo "只收建置產物" (`:88`) and the Structural Seed shows only artifact pushes. A hand-edited `robots.txt` living in a repo that receives automated artifact pushes is a file waiting to be overwritten. AD-19's verification list (`:166`) checks canonical/hreflang/sitemap/`<html lang>` — not robots.txt content, even though FR23 is the one requirement where a silently-reverted file directly costs the business model.

### D8 — FR12 (persisted language choice) has no architectural home — **MEDIUM**

FR12 is in `binds` and mapped to "AD-18, AD-11" (`:277`). AD-18 governs string tables; AD-11 governs view URLs. Neither addresses persistence. The current implementation detects `navigator.languages` and persists to `localStorage` (`index.html:499-512, 668-671`). Under AD-11's per-locale indexable URLs, a stored-preference redirect is a direct hazard for FR13/FR14 (canonical/hreflang) and for crawlers, and NFR15.2 names this same client-side storage as one of the two triggers for needing a privacy policy (`prd.md:267`). The spine records none of it.

### D9 — FR22's timezone requirement is unaddressed at the presentation layer — **LOW**

FR22 (`prd.md:138`) requires every factual statement to carry its extraction time **and timezone**. The conventions table (`:179`) settles storage only ("時間戳一律 ISO 8601 UTC", calendar days JST) and says nothing about what the page displays. A UTC timestamp shown beside JST calendar dates to a Japan-focused audience is a plausible-looking correctness bug, and it is the sort AD-19 does not check.

### D10 — FR4's threshold consolidation is stated without noting what it replaces — **LOW**

The conventions table (`:183`) correctly carries FR4's "設定值，不得寫死於版面邏輯". Worth recording: the current code has **four different hardcoded thresholds at two different semantic scales** — `n <= 5` for per-slot remaining (`index.html:826`), `n <= 3` for the date pill (`:858`), `n <= 5` for the day-row subtitle (`:1052`), `n <= 2` for the day cell (`:1072`). FR4's single value of 10 (`prd.md:97`) is a per-day-per-product number; applying one constant across per-slot and per-day scales changes the meaning of the existing scarcity signal.

### D11 — NFR17/NFR18's ad-specific prohibitions are mapped to ADs that do not address ads — **LOW**

`NFR16–NFR19` map to `AD-8, AD-11` (`:287`). But NFR17 forbids **干擾性插頁廣告** (`prd.md:277`) and NFR18 forbids ad-induced **版面位移** (`prd.md:278`) — both are constraints on FR25, and the FR25 row (`:281`) defers all slot detail while AD-7 addresses only the request boundary. No AD or convention carries "no interstitials" or "reserved ad slot dimensions" forward, and the Deferred entry for ad placement (`:296`) does not restate them as binding on the deferred decision.

---

## E. Smaller notes

- **`i18n-check.ts` never fails today.** It prints and returns (`src/i18n-check.ts:124-131`); there is no non-zero exit. AD-18's "缺 key 即失敗" describes a script that does not yet behave that way — fine as a target, but the spine presents `i18n-check.ts` as an existing control to be "擴充" rather than one whose failure semantics do not exist yet.
- **`storeUrl()` is hardcoded to `/ja/jp/`** (`src/sources/usj.ts:42-43`) and `ProductResult.url` stores only that; the locale rewrite lives in the page (`index.html:309`, `STORE_PATH`). FR8/FR10 under AD-8 (build-time baking) need this rewrite to move into the renderer — an existing behaviour the spine neither records nor assigns a home. Related: 使用条件 第 21 条 (c) requires links to point to the **完整版** page (`legal-terms-extract.md:112`).
- **`imageUrl` is still stored** in `CatalogEntry`/`ProductResult`/`ProductSummary` (`src/types.ts:67, 82, 116`) and is currently rendered. AD-7 forbids the outbound request; the spine does not say whether the field is retired from the snapshot schema (which would be an AD-14 `schemaVersion` event for `Index`, currently 5).
- **O4** (Google AI Overviews 當期政策, `prd.md:344`, due "P1 開工前") appears in no Deferred entry. Largely non-architectural, but it is the one item gating FR23's premise.
- **Node upgrade**: the Stack row (`:191`) mandates Node 24, while `.node-version` is `20.17.0` and `package.json` pins `@types/node: ^20`. Stated correctly by the spine; noted only because `.node-version` is consumed by `.github/workflows/fetch.yml:23` and must move in the same change.

---

## Summary table

| # | Finding | Severity | Primary citation |
|---|---|---|---|
| B1 | AD-4 adopts `CONCURRENCY <= 2` with cron `*/30` and no timeout recompute → cold start ~21 min vs NFR5's 15-min ceiling; PRD's "isolated single-value change" conclusion invalidated | BLOCKER | `prd.md:195, 197, 208, 210-214` vs spine `:72-76, :209` |
| D1 | AD-12's "三態欄位掛在 `DAY_PRODUCT`" is impossible — `days.json` has no rows for absent cells and no date/product axis | BLOCKER | `src/fetcher.ts:132-141`; `src/types.ts:112-159` vs spine `:120-124, :241` |
| A1 | NFR15.2/15.3/15.4 absent from `binds`, every AD, the capability map and Deferred; CMP collides with AD-8/NFR18 | BLOCKER | `prd.md:267-270` vs spine `:11, :286` |
| B2 | AD-18 inverts the localizing skill: term tables are substring budgets with deliberate partial coverage; "缺 key 即失敗" pressures a FR11 violation | HIGH | `SKILL.md:10, 42`; `i18n-check.ts:1-12` vs spine `:156-160` |
| C4 | AD-8 silently deletes the shipped party-size filter and slot detail (intent recorded only in code comments) and leaves the expensive slot tier fetching data nothing consumes | HIGH | `types.ts:32-38`; `usj.ts:14-20, 270-277`; `index.html:289, 459-486` vs spine `:96-100` |
| C1 | No AD protects the never-registered / never-logged-in / never-loaded-an-HTML-page fact — the only identified legal escape hatch | HIGH | `legal-terms-extract.md:41, 165`; `prd.md:292` |
| C2 | "本站根本不抓 `www.usj.co.jp`" is already false — the localizing procedure fetches it | HIGH | `SKILL.md:53-66` vs `legal-terms-extract.md:125, 131` |
| C3 | NFR2.1's unresolved private-API principle has no AD, while AD-20 makes adding a source cheap; Studio Pass / 整理券 exclusions unrecorded | HIGH | `prd.md:72-73, 171-173` vs spine `:168-172` |
| C5 | NFR6's anti-regression intent has no teeth — slot-window, slot-age, catalogue-sample and change-detection constants are unprotected by AD-4 | HIGH | `prd.md:227, 236`; `usj.ts:52, 67, 75, 412-420` |
| A3 | NFR10's "更新正確" and §3's counter-metrics have no mechanism and no Deferred entry | HIGH | `prd.md:42-43, 254` vs spine `:144-148` |
| D3 | FR19's proactive stale marking cannot survive build-time baking; AD-16 reddens a job but does not change the deployed page | HIGH | `prd.md:130`; `index.html:287, 918, 940` vs spine `:96-100, :88` |
| A2 | NFR9.2 and NFR9.1 item 3 (contact window, response time) attributed to AD-16, which does not cover them | HIGH | `prd.md:245-250` vs spine `:284, :298` |
| D2 | The adapter collapses `canBeVisited`/`forceSoldOut`/`units` into one boolean at the port; the layer that knows the reason cannot report it | HIGH | `usj.ts:162`; `types.ts:42-57` |
| D6 | AD-5's *Prevents* may already be defeated by existing public history; no migration invariant stated | MED/HIGH | `index.html:1022`; repo `wisely051543/self-usj` vs spine `:78-82` |
| D7 | FR23's maintainable robots.txt list has no source-of-truth home and is outside AD-19's checks | MEDIUM | `prd.md:139` vs spine `:166, :268` |
| A4 | O13 (cold start is lossy; `data/` is state) missing from Deferred — and AD-5 mandates the riskiest operation for it | MEDIUM | `prd.md:223, 347` vs spine `:78-82` |
| B5 | Deferring "資料齡門檻" reopens a PRD-settled value (`STALE_MS` 90 min) and conflates page vs pipeline thresholds | MEDIUM | `prd.md:210`; `index.html:287` vs spine `:293` |
| B6 | AD-15's "single action per level" is unspecified for L3, which is the level R15 makes urgent | MEDIUM | `prd.md:304`; `legal-terms-extract.md:57-59` vs spine `:138-142` |
| B3 | FR11's real control (`verified` canonical/provisional ledger) is absent; key-presence cannot catch an invented name | HIGH | `SKILL.md:15-19, 31, 33` |
| B4 | AD-3's "任何層皆不得直接呼叫 `fetch`" is over-broad and outlaws the documented naming procedure | MEDIUM | `SKILL.md:23, 53-66`; `index.html:1022` vs spine `:66-70` |
| D8 | FR12 persistence has no architectural home; interacts with FR13/FR14 and NFR15.2 | MEDIUM | `index.html:499-512, 668-671` vs spine `:277` |
| D4 | AD-11's "6 個可索引 URL" contradicts the legally required page set | MEDIUM | `prd.md:250, 267-268` vs spine `:118` |
| C6 | R7's warning half-captured: AD-1 blocks paid unlocking but never names 付費補貨通知 as the proposal to be blocked | LOW/MED | `prd.md:296, 358` vs spine `:54-58` |
| A5 | O14 (`fetch.yml` comment vs measurement) has no home | LOW | `prd.md:348`; `fetch.yml:5-7` |
| A6 | FR6 and FR7 missing from `binds` | LOW | spine `:11` vs `:275` |
| D5 | Stack decides the Pages publish method that Deferred says is open | LOW | spine `:198` vs `:292` |
| D9 | FR22's timezone requirement unaddressed at presentation | LOW | `prd.md:138` vs spine `:179` |
| D10 | FR4's single threshold of 10 collapses four existing thresholds at two semantic scales | LOW | `index.html:826, 858, 1052, 1072` |
| D11 | NFR17/NFR18's ad-specific prohibitions mapped to ADs that do not address ads | LOW | `prd.md:277-278` vs spine `:281, :287, :296` |

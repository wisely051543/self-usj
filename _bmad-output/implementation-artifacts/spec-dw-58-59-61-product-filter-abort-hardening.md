---
title: '強化 --product= 未命中中止分支：try/finally 保護與解析行為測試補洞'
type: 'bugfix'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      catalog 抓取成功但回傳空陣列且未帶 `--product=` 時，會落入「未命中」分支，印出無意義的
      `No product matched . Known: ` 並以 exit code 2 收尾。
    evidence: |-
      `const targets = wanted.length ? catalog.filter(...) : catalog;` 在 `wanted` 為空、`catalog` 也為空時
      仍滿足 `targets.length === 0`。實測以 `listProducts` 回傳 `[]` 執行 `main()`：stderr 為
      `No product matched . Known: ` 後接彙總行，exit code 2。空 catalog 屬來源/解析失敗（語意上是 exit 1），
      被誤分類為「操作者輸入錯誤」的 exit 2。此為既有分支條件（非本次改動造成），本次只在該分支加上
      `try`/`finally` 與訊息斷言，未改變其進入條件。
    location: >-
      src/fetcher.ts:565-580
    severity: medium
  - summary: >-
      空格形式的 `--product TEST0001`（無 `=`）會被解析靜默忽略，`wanted` 為空即等同「無篩選」，
      導致一次除錯用的單品抓取變成整個 catalog 的完整回合。
    evidence: |-
      解析只認 `a.startsWith('--product=')`，空格形式兩個 argv 皆不符合，因此不會落入未命中分支、也不會有
      任何未知旗標警告。與 exit-2 分支「快速失敗」的用意相反。既有解析行為，非本次改動造成；
      本次 spec 的 Never 條款明確禁止改動解析語意。
    location: >-
      src/fetcher.ts:541-544
    severity: medium
  - summary: >-
      `Known: ` 段落會無上限列出整個 catalog 的代碼，而本次新增的斷言要求「每個 catalog 代碼都須出現」，
      等於把窮舉輸出釘死，未來改為「前 N 筆 +（還有 M 筆）」會變成測試失敗。
    evidence: |-
      實際 USJ catalog 為數十筆代碼，全部串在單行 stderr；`npm run fetch 2>&1 | tee` 時可能把其後的彙總行
      推出緩衝區。訊息未設上限屬既有行為，但新斷言確實限制了往後加上限的改法；若要加上限，需同時放寬該斷言
      （例如改斷言未命中代碼加抽樣代碼或總數）。
    location: >-
      src/fetcher.test.ts:456-463
    severity: low
  - summary: >-
      未命中訊息的 `No product matched ${wanted.join(', ')}` 在「多個代碼皆未命中」時的格式仍無測試涵蓋。
    evidence: |-
      現有斷言只驗證單一未命中代碼（`No product matched NOPE0001`）。若該運算式退化為 `wanted[0]`，
      只印出第一個誤植代碼，全套測試仍會通過。本次 DW-59 的範圍是 `Known: ` 段落，此為訊息另一半的既有缺口。
    location: >-
      src/fetcher.test.ts:449-452
    severity: low
  - summary: >-
      多個 `--product=` 部分命中時，未命中的代碼被靜默略過，回合照常以綠燈結束，操作者無從得知該代碼其實沒抓到。
    evidence: |-
      `const targets = wanted.length ? catalog.filter(e => wanted.includes(e.code)) : catalog;` 只做交集，
      從不回報 `wanted` 中沒有對應 catalog 項目的代碼。本次新增的 DW-58 前半測試更明確斷言此情況
      「不得印出 `No product matched`」，等於把這個沉默釘住。與未命中分支「快速失敗」的用意相反：
      批次呼叫中打錯一個代碼，會得到一個看似成功的回合。加上「已忽略未知代碼」警告屬行為變更，
      本次 spec 的 Never 條款禁止改動解析與回報語意，故延後。
    location: >-
      src/fetcher.ts:565
    severity: medium
  - summary: >-
      `wanted.length` 在 `main()` 被讀兩次，第二處決定是否執行 `sweepDelisted`，但該分岔兩邊皆無任何測試涵蓋。
    evidence: |-
      `src/fetcher.ts:565` 決定抓取對象，`src/fetcher.ts:655` 的
      `const products = wanted.length ? merged : sweepDelisted(merged, now);` 另外決定是否清掃下架商品。
      本次 DW-58 兩則新測試只斷言 `fetchProduct` 的呼叫集合，未檢查寫出的 index 內容，因此
      「空值 `--product=` 等同無篩選」這個結論只在抓取面被驗證、未在清掃面被驗證。
      在 `src/fetcher.test.ts` grep `sweepDelisted` 與 `delist` 皆 0 命中 — 這條分岔目前完全沒有回歸網。
      行為本身正確（無篩選才清掃），缺的是驗證，屬既有缺口而非本次改動造成。
    location: >-
      src/fetcher.ts:655
    severity: medium
baseline_revision: '4166b634dc124b084cabd6d5e3f394e75c201327'
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 的 `--product=` 未命中中止分支（`No product matched` → `logAbortSummary(startedAt)` → `process.exit(2)`）沒有像 `handleFatalMainError` 那樣以 `try`/`finally` 保護：若 `console.error` 或 `logAbortSummary`（經 `requestCount()`）丟出例外，`process.exit(2)` 就不會執行，例外會往上由 `main().catch(handleFatalMainError)` 接住並以 exit code 1 收尾，違反來源 spec 的 Never 條款「不變更 exit code 語意（2 維持 2）」（DW-61）。同時該分支的測試涵蓋不足：只測單一不存在代碼，未涵蓋多個 `--product=` 部分命中、以及空值 `--product=` 被 `wanted.filter(Boolean)` 靜默丟棄而退回抓取整個 catalog 的既有行為（DW-58）；且只斷言訊息含 `No product matched`，未驗證列出可用代碼的 `Known: ...` 段落（DW-59）。

**Approach:** 比照 `handleFatalMainError` 既有寫法，把該分支的兩個回報步驟（`console.error` 警示行與 `logAbortSummary`）包進 `try`，`process.exit(2)` 放進 `finally`；並在 `src/fetcher.test.ts` 補上四則測試涵蓋 `finally` 保證、`Known: ...` 段落內容、多旗標部分命中、空值旗標退回全 catalog。

## Boundaries & Constraints

**Always:** exit code 語意不變（未命中維持 2）；`No product matched ... Known: ...` 訊息文字與 `logAbortSummary` 訊息格式維持原樣；回報順序維持「警示行 → 彙總行 → exit」；`--product=` 解析邏輯（`filter(a => a.startsWith('--product='))` / `split('=')[1]` / `filter(Boolean)`）為既有行為，只補測試不改行為；新測試沿用既有 `ExitSignal`、`mockFs`、`captureErrors`、`ABORT_SUMMARY`、`assertAbortSummaryFollows` 工具與 `t.mock.method(limiter, 'requestCount', ...)` 手法。

**Block If:** 若補上的解析行為測試顯示既有行為本身有錯（而非只是缺測試），須改動解析邏輯才能讓測試合理通過 — 那已超出「補測試」範圍，屬需人工判斷的行為變更。

**Never:** 不改 `--product=` 解析語意（空值仍靜默退回全 catalog，不新增警告或報錯）；不動 `handleFatalMainError`、`logAbortSummary`、兩處 `BlockedError` 封鎖中止路徑；不新增重試/backoff；不改 `main()` 的 export 與既有測試呼叫方式。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DW-61：未命中分支回報步驟丟出例外 | `--product=NOPE0001`、catalog 僅含 `TEST0001`，`requestCount()` 被 mock 成丟例外 | `finally` 仍執行 `process.exit(2)` | exit code 維持 2，例外不外洩到 `main()` 的 caller |
| DW-59：未命中訊息內容 | `--product=NOPE0001`、catalog 含 `TEST0001`（可多筆） | 警示行同時含 `No product matched NOPE0001` 與 `Known: ` 後列出 catalog 全部代碼 | 之後照常 exit 2 |
| DW-58a：多個 `--product=` 部分命中 | `--product=TEST0001 --product=NOPE0001`、catalog 僅含 `TEST0001` | 不中止；只抓 `TEST0001`，不抓未命中代碼，`process.exit` 未被呼叫 | 無錯誤，`No product matched` 不得印出 |
| DW-58b：空值 `--product=` | `--product=`、catalog 含 `TEST0001` 與 `TEST0002` | `wanted.filter(Boolean)` 丟棄空字串 → `wanted` 為空 → 退回抓取整個 catalog（兩筆皆抓） | 無錯誤，靜默退回為既有行為 |

</intent-contract>

## Code Map

- `src/fetcher.ts:565-569` -- `const targets = ...` 與 `if (targets.length === 0) { console.error('No product matched ... Known: ...'); logAbortSummary(startedAt); process.exit(2); }`，本次唯一的正式碼改動點（DW-61 包 try/finally）。
- `src/fetcher.ts:541-544` -- `--product=` 解析（`startsWith('--product=')` → `split('=')[1]` → `filter(Boolean)`），DW-58 兩則測試的受測既有行為，**唯讀，不得改動**。
- `src/fetcher.ts:529-537` -- `handleFatalMainError` 的 `try { console.error(...); logAbortSummary(startedAt); } finally { process.exit(1); }`，本次要比照的既有寫法與 JSDoc 措辭範本。
- `src/fetcher.ts:300-302` -- `logAbortSummary(startedAt)` 定義，內部呼叫 `requestCount()`（自 `./limiter` 具名匯入，第 7 行），即測試可 mock 出丟例外的接縫。
- `src/fetcher.ts:673-676` -- 成功回合結尾的 `console.log` 統計行；DW-58 兩則會跑完整回合的測試需 mock `console.log` 保持輸出乾淨。
- `src/fetcher.test.ts:39-42` -- `ExitSignal`；`:71-88` -- `mockFs`；`:102-107` -- `captureErrors`；`:163` -- `ABORT_SUMMARY`；`:170-181` -- `assertAbortSummaryFollows`；`:90-93` -- `snapshotWrites`/`productWrites`。新測試一律復用，勿另造。
- `src/fetcher.test.ts:409-440` -- 既有 DW-38 未命中測試，新測試的撰寫範本（含 `process.argv` 覆寫 + `t.after` 還原的手法）。
- `src/fetcher.test.ts:318-345` -- 既有「回合跑完不中止」測試，DW-58 兩則的範本（`exit` mock 成 no-op 並斷言 `callCount() === 0`、mock `console.log`）。
- `src/fetcher.test.ts:531-545` -- 既有「`logAbortSummary` 丟例外仍 exit 1」測試，DW-61 測試中 `t.mock.method(limiter, 'requestCount', ...)` 的手法來源（`limiter` 已於 `:26` 以 namespace 匯入）。

## Tasks & Acceptance

**Execution:**
- `src/fetcher.ts` -- 將未命中分支改為 `try { console.error('No product matched ...'); logAbortSummary(startedAt); } finally { process.exit(2); }`，並補一段 JSDoc/註解說明為何需要 `finally`（回報步驟丟例外時仍須維持 exit 2，否則會退化為 `handleFatalMainError` 的 exit 1） -- 解決 DW-61
- `src/fetcher.test.ts` -- 新增一則測試：mock `limiter.requestCount` 丟例外，`--product=NOPE0001` 未命中時仍以 exit code 2 結束 -- 覆蓋 I/O Matrix 的 DW-61 情境
- `src/fetcher.test.ts` -- 擴充或新增針對未命中訊息的斷言：警示行須同時含 `No product matched NOPE0001` 與 `Known: ` 且其後列出 catalog 中每個代碼 -- 解決 DW-59
- `src/fetcher.test.ts` -- 新增一則測試：`--product=TEST0001 --product=NOPE0001` 部分命中時不中止、只抓 `TEST0001`、`process.exit` 未被呼叫、未印 `No product matched` -- 解決 DW-58a
- `src/fetcher.test.ts` -- 新增一則測試：`--product=`（空值）時 `wanted` 被 `filter(Boolean)` 清空，退回抓取整個 catalog（兩筆 catalog 項目皆被 `fetchProduct` 抓到） -- 解決 DW-58b

**Acceptance Criteria:**
- Given `--product=` 未命中且 `logAbortSummary` 內部的 `requestCount()` 丟出例外, when `main()` 執行到該分支, then 例外不外洩，仍以 exit code 2 結束。
- Given 既有 DW-38 未命中測試與其餘 `src/fetcher.test.ts` 既有測試, when 執行 `npm test`, then 全數維持原有斷言與行為，無回歸。
- Given `npm run typecheck`, when 執行, then 無型別錯誤。

## Spec Change Log

（本次無 bad_spec 迴圈，無異動紀錄。）

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 1, low 4)
- defer: 4: (high 0, medium 2, low 2)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[medium]` `[patch]` `try`/`finally` 保護涵蓋 `console.error` 與 `logAbortSummary` 兩者，但只有 `logAbortSummary` 那半被測試釘住（審查者以突變驗證：把 `console.error` 移出 `try` 後 164 則測試仍全綠）；已補上以 `console.error` 丟例外驅動的姊妹測試，斷言仍以 exit code 2 結束，並以突變確認該測試會轉紅。
  - `[low]` `[patch]` DW-61 的 `logAbortSummary` 丟例外測試未斷言其 mock 真的被呼叫到，日後若 `logAbortSummary` 不再讀 `requestCount()` 會靜默空轉；已捕捉 mock handle 並斷言 `callCount() > 0`。
  - `[low]` `[patch]` DW-58 部分命中測試用單筆 catalog，「只抓 TEST0001」同時也被「篩選失效、全抓」滿足；已改為兩筆 catalog，使斷言真正證明篩選有作用。
  - `[low]` `[patch]` 測試註解引用的 `DW-58a`/`DW-58b` 在 ledger 中不存在（只有 `DW-58`），grep 不到；已改寫為「DW-58，前半／後半」。
  - `[low]` `[patch]` spec 的 `## Verification` 與驗收條件寫的 `npm test -- src/fetcher.test.ts` 無法限縮範圍（`package.json` 以 `$(find src -name '*.test.ts')` 組檔案清單，傳入路徑只會被附加），已改為 `npm test`。

### 2026-08-23 — Review pass（第二輪 / follow-up）
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 2: (high 0, medium 2, low 0)
- reject: 20: (high 0, medium 0, low 20)
- addressed_findings:
  - none

四路審查（blind-hunter / edge-case-hunter / verification-gap / intent-alignment）皆未在本次改動中找到需修補的缺陷。
被 reject 的 20 則主要為三類：(a) 已登記於 frontmatter `deferred` 的既有項目（空 catalog 誤入未命中分支、
`wanted.join(', ')` 多碼格式未釘、`Known:` 窮舉斷言、空格形式 `--product`）重複提報；
(b) 超出 intent Never 條款的行為變更提案（`Known:` 排序／did-you-mean、`--help` 文件、`abortWith` 抽取、
改 `split('=')` 為 `slice`、把姊妹早退路徑一併包 `try`/`finally`）；
(c) 與既有慣例一致而非本次偏差者（`finally` 吞掉進行中例外、`process.exit` 不 flush stderr —
`handleFatalMainError` 具相同性質；exit 1 的三條早退路徑無 exit code 可失，無須保護）。
新登記 2 則 defer，見 frontmatter `deferred` 第 5、6 項。

## Design Notes

`finally` 是唯一能保住 exit 2 的寫法：把 `process.exit(2)` 留在 `try` 之後、或用 `catch` 吞掉例外再 exit，都會改變「回報失敗時該印什麼」的既有語意；`handleFatalMainError` 已經用 `try`/`finally` 立下同一個模式，照抄可讓兩條早退路徑的保證讀起來一致。

DW-58b 的重點在於**釘住既有行為而非改變它**：空值 `--product=` 靜默退回全 catalog 目前沒有任何測試守著，一次無心的 `filter(Boolean)` 移除會讓它變成「未命中 → exit 2」，測試存在的意義就是把這個分岔點變成紅燈。

```ts
// 未命中分支的目標形狀（比照 handleFatalMainError）
if (targets.length === 0) {
  try {
    console.error(`No product matched ${wanted.join(', ')}. Known: ${catalog.map(e => e.code).join(', ')}`);
    logAbortSummary(startedAt);
  } finally {
    process.exit(2);
  }
}
```

## Verification

**Commands:**
- `npm test` -- expected: 全數通過（含新增測試與既有回歸）
- `npm run typecheck` -- expected: 無型別錯誤

## Auto Run Result

Status: done

### 實作摘要

把 `src/fetcher.ts` 中 `--product=` 未命中的中止分支，比照 `handleFatalMainError` 改寫為
`try { console.error(警示行); logAbortSummary(startedAt); } finally { process.exit(2); }`，
使 exit code 2 在回報步驟自己丟例外時仍然成立，不會被 `main().catch(handleFatalMainError)`
降級成 exit 1。並在 `src/fetcher.test.ts` 補上四則新測試 + 擴充一則既有測試的斷言。

### 變更檔案

- `src/fetcher.ts` — 未命中分支的兩個回報步驟包進 `try`，`process.exit(2)` 移入 `finally`；附上說明為何 `finally` 是唯一能保住 exit 2 的寫法。
- `src/fetcher.test.ts` — 既有 DW-38 未命中測試改用兩筆 catalog 並新增 `Known: ` 段落斷言（DW-59）；新增 `logAbortSummary` 丟例外、`console.error` 丟例外兩則 exit-2 保證測試（DW-61）；新增多旗標部分命中、空值旗標退回全 catalog 兩則解析行為測試（DW-58）。

### 審查結果分佈（本輪）

- patch 已修：0
- defer 新登記：2（皆 medium；部分命中未回報未知代碼、`sweepDelisted` 分岔無測試）
- reject：20

### 後續審查建議

`false`。本輪 patch 數為 0（high 0、medium 0、low 0），計分 `3 × 0 + 1 × 0 = 0`，未達 5。

### 驗證

- `npm run typecheck` — 通過，無型別錯誤。
- `npm test` — `tests 165 / pass 165 / fail 0`，duration 3.20s。
- 工作區確認：審查子代理在突變測試期間曾改動 `src/fetcher.ts`（`wanted.join(', ')` → `wanted[0]`），已自行還原；本輪 finalize 前以 `git diff -- src/` 確認 `src/` 相對 HEAD 乾淨，上述測試結果來自還原後的檔案。

### 殘留風險

- 未命中訊息的 `wanted.join(', ')` 這半在多碼情境仍無測試釘住 — 審查者以突變證實改成 `wanted[0]` 後 165 則測試全綠。已列為 `deferred` 第 4 項，本次 intent 的 DW-59 範圍僅及 `Known: ` 段落。
- 空 catalog（來源回傳 `[]` 且未帶 `--product=`）仍會落入此分支並以 exit 2 收尾，語意上應為 exit 1。既有分支條件，已列為 `deferred` 第 1 項。
- `finally` 會吞掉回報步驟丟出的原始例外，操作者只會看到裸的 exit 2 而無失敗原因。此為 `handleFatalMainError` 既有性質，本次刻意保持一致。

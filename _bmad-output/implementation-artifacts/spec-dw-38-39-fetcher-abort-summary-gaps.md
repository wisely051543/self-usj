---
title: '修補 fetcher.ts 兩處早退路徑缺少 logAbortSummary 彙總'
type: 'bugfix'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      `main().catch(handleFatalMainError)` at the file-tail entry point is never actually executed by any test.
    evidence: |-
      `require.main === module` is false when `fetcher.ts` is imported for testing, so no test in `src/fetcher.test.ts`
      reaches that line; the new `handleFatalMainError` test calls the handler directly with a synthetic error instead.
      A regression that dropped or misspelled the `.catch()` (e.g. `.then()` instead) would ship undetected. The repo
      already has a related, separately-tracked entrypoint smoke-check effort
      (`_bmad-output/implementation-artifacts/spec-dw-12-fetch-entrypoint-smoke-check.md`, status in-review) that is
      the more natural home for a spawnSync-based integration test closing this gap, rather than adding ad hoc test
      hooks to production code here.
    location: >-
      src/fetcher.ts:454
    severity: medium
  - summary: >-
      `startedAt` was converted from a `main()`-local `const` to a module-level `let`, so a second concurrent
      `main()` invocation in the same process would race/corrupt the first invocation's timer.
    evidence: |-
      This CLI is only ever invoked once per process via the `require.main === module` guard, so the race is not
      currently reachable in production; flagged for awareness if `main()` is ever made re-entrant.
    location: >-
      src/fetcher.ts:281,307
    severity: low
  - summary: >-
      `handleFatalMainError` 非 `Error` 分支的 `JSON.stringify` 例外 fallback 若遇到含循環參照的物件，`String(err)`
      仍會印出無意義的 `[object Object]`。
    evidence: |-
      `catch { return String(err); }` 對一般物件與 `JSON.stringify` 失敗時的結果相同，並未真正解決此函式本身要避免的
      `[object Object]` 問題；只是把觸發條件從「任意物件」縮小到「JSON.stringify 會丟例外的物件（如循環參照）」。
      需要循環參照安全的序列化（例如攔截已見過的參照）才能徹底解決，非本次早退彙總修補的範圍。
    location: >-
      src/fetcher.ts:307-314
    severity: low
  - summary: >-
      `handleFatalMainError` 對 `Error` 分支只印出 `err.message`，捨棄 `err.stack`，診斷未知例外時少了呼叫堆疊。
    evidence: |-
      此函式本身定位是「非預期的 bug」的兜底處理（非既有的封鎖判定），呼叫堆疊正是排查此類意外最有用的資訊；目前只印
      `err.message` 會讓 CI 記錄少一層可追溯性。是否要改印 `err.stack` 屬於彙總訊息格式的既有設計決定範圍，非本次
      兩處早退彙總插入點的範圍。
    location: >-
      src/fetcher.ts:305-306
    severity: low
  - summary: >-
      DW-38 新測試只涵蓋單一不存在的 `--product=` 代碼，未涵蓋多個 `--product=` 旗標部分命中、或空值 `--product=`
      時 `wanted.filter(Boolean)` 會靜默退回抓取整個 catalog 的既有行為。
    evidence: |-
      這些是 `--product=` 既有解析邏輯（非本次新增）的既有行為與邊界，本次 diff 只在既有的「未命中」分支插入
      `logAbortSummary`，未改動解析邏輯本身，故非本次改動造成。
    location: >-
      src/fetcher.ts:322-326
    severity: low
  - summary: >-
      DW-38 新測試只斷言 abort 訊息含 `No product matched`，未驗證訊息中列出可用代碼的 `Known: ...` 段落內容。
    evidence: |-
      `Known: ...` 段落是既有訊息的一部分（非本次新增），本次只在其 `process.exit(2)` 前插入
      `logAbortSummary`；若該段落遭意外刪改，既有測試不會失敗，但此屬既有訊息內容的既有驗證缺口。
    location: >-
      src/fetcher.ts:349
    severity: low
  - summary: >-
      `handleFatalMainError` 遇到 `message` 為空字串的 `Error`（如 `new Error()`）時，會印出無詳細內容的
      `[fetch] fatal: `。
    evidence: |-
      此為邊界情境（呼叫端建構 `Error` 時未帶訊息），機率低；彙總行仍會照常接續印出（請求數與耗時仍可供診斷），
      故非阻斷性缺口，本次不在兩處早退彙總插入的範圍內處理。
    location: >-
      src/fetcher.ts:305-306
    severity: low
  - summary: >-
      `--product=` 未命中分支（DW-38 插入點）呼叫 `logAbortSummary` 未如 `handleFatalMainError` 般以
      `try`/`finally` 保護；若 `logAbortSummary` 本身丟出例外，`process.exit(2)` 將不會執行。
    evidence: |-
      例外會往上傳遞並最終由 `main().catch(handleFatalMainError)` 接住、以 exit code 1 收尾，與 spec
      「Never: 不變更 exit code 語意（2 維持 2）」的邊界產生分歧。但現有兩處封鎖中止路徑（`BlockedError`）本就未做
      此保護，本次新增的 `--product=` 分支延續同一既有慣例（spec 的 Approach 明確要求「比照既有封鎖中止路徑」）；
      `requestCount()` 目前只讀取內部計數器變數，實務上幾乎不會拋出例外，即使觸發也仍會以 exit(1) 收尾而非靜默掛起，
      風險極低，非本次早退彙總插入範圍內處理。
    location: >-
      src/fetcher.ts:351-353
    severity: low
  - summary: >-
      `handleFatalMainError` 對 `err` 為 `null` 或 `undefined` 時的處理未被測試涵蓋；`JSON.stringify(undefined)`
      回傳非字串的 `undefined`，經樣板字串隱式轉型後會印出「`[fetch] fatal: undefined`」。
    evidence: |-
      目前測試只涵蓋 `Error` 與一般物件（`{ code, path }`）兩種情境，未涵蓋 `Promise.reject()` 或
      `throw null`/`throw undefined` 這類邊界輸入；雖不會如循環參照物件般印出 `[object Object]`，但「undefined」
      字串本身診斷價值有限。此輸入形態罕見，非本次兩處早退彙總插入點的範圍。
    location: >-
      src/fetcher.ts:307-314
    severity: low
baseline_revision: '66e198f21e2ed4cc23748b205a3a8eab85936fa5'
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 有兩處早退路徑仍跳過 `logAbortSummary`：`--product=` 找不到相符產品時的 `process.exit(2)`（DW-38），以及檔尾 `main();` 呼叫未接 `.catch()` 導致非封鎖類意外例外以 unhandledRejection 收場（DW-39）。

**Approach:** 比照既有封鎖中止路徑，在兩處早退前插入 `logAbortSummary(startedAt)`；`startedAt` 由 `main()` 內賦值的模組層級變數改造，供檔尾新增的 `.catch(handleFatalMainError)` 共用同一份彙總邏輯。

## Boundaries & Constraints

**Always:** 沿用既有 `logAbortSummary(startedAt)` 訊息格式與 `console.error` 輸出流，彙總必須印在對應早退的 exit/catch 動作之前；`main()` 的 export 與既有測試呼叫方式不變。

**Block If:** 若既有測試（BlockedError 相關三則）在改動後行為或斷言必須跟著改，才視為需要人工介入的範圍外變更；預期不會發生。

**Never:** 不擴大範圍處理封鎖中止路徑本身（DW-8/9/10 已涵蓋）；不變更 exit code 語意（2 維持 2、1 維持 1）；不引入與本次無關的重試/backoff 邏輯。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DW-38：`--product=` 未命中任何 catalog 項目 | `wanted` 非空、`targets.length === 0` | `logAbortSummary` 彙總行先印出，再 `process.exit(2)` | exit code 仍為 2 |
| DW-39：`main()` 內丟出未被既有 try/catch 攔截的例外 | 檔尾 `main().catch(handleFatalMainError)` 攔截到 rejection | 印出 `[fetch] fatal: ...`、印出彙總行，`process.exit(1)`，不產生 unhandledRejection | exit code 1 |
| 既有封鎖中止路徑（回歸檢查） | catalog 或 product 拋出 `BlockedError` | 行為與輸出維持 DW-8/9/10 既有邏輯不變 | 沿用既有 exit code 1 |

</intent-contract>

## Code Map

- `src/fetcher.ts:269-272` -- `logAbortSummary(startedAt)`，本次沿用的既有彙總函式，不改簽章。
- `src/fetcher.ts:283` -- `const startedAt = Date.now();`，需改為模組層級 `let startedAt` 並在此賦值，供檔尾 `.catch()` 存取。
- `src/fetcher.ts:300-304` -- `No product matched` 分支，DW-38 插入點：`process.exit(2)` 前補 `logAbortSummary(startedAt)`。
- `src/fetcher.ts:296-297`、`348-349` -- 既有封鎖路徑呼叫 `logAbortSummary` 的參考範例，插入手法比照這兩處。
- `src/fetcher.ts:428-430` -- `if (require.main === module) { main(); }`，DW-39 修改點：改為 `main().catch(handleFatalMainError);`，並新增 `export function handleFatalMainError(err: unknown): never`。
- `src/fetcher.test.ts:37-41,69-106,114-133` -- `ExitSignal`、`mockFs`、`captureErrors`、`ABORT_SUMMARY`、`assertAbortSummaryFollows` 既有測試工具，新增測試直接復用。
- `src/fetcher.test.ts:135-224` -- 既有三則封鎖中止測試，作為回歸基準與新測試的撰寫範本。

## Tasks & Acceptance

**Execution:**
- `src/fetcher.ts` -- 將 `const startedAt = Date.now();` 改為模組層級可變變數，`main()` 內賦值 -- 讓檔尾新增的 `.catch()` 能存取同一份計時起點
- `src/fetcher.ts` -- 在 `No product matched` 分支 `process.exit(2)` 前插入 `logAbortSummary(startedAt)` -- 解決 DW-38
- `src/fetcher.ts` -- 新增 `export function handleFatalMainError(err: unknown): never`（印出 `[fetch] fatal: ...`、呼叫 `logAbortSummary(startedAt)`、`process.exit(1)`），並將檔尾改為 `main().catch(handleFatalMainError);` -- 解決 DW-39，並讓該處理邏輯可被測試直接呼叫
- `src/fetcher.test.ts` -- 新增兩則測試：(1) `--product=` 未命中時彙總行先於 `exit(2)` 印出；(2) 直接呼叫 `handleFatalMainError` 驗證印出 fatal 訊息、彙總行、以 exit code 1 結束 -- 覆蓋 I/O Matrix 的兩個新場景

**Acceptance Criteria:**
- Given `--product=` 帶入 catalog 中不存在的代碼且 catalog 抓取已成功, when `main()` 執行到 `No product matched` 分支, then 符合 `ABORT_SUMMARY` 格式的彙總行先於 `process.exit(2)` 被印出。
- Given `handleFatalMainError` 被以任一 `Error` 呼叫, when 執行該函式, then 依序印出 fatal 訊息與彙總行，並以 exit code 1 結束。
- Given 既有三則封鎖中止測試（`src/fetcher.test.ts:135-260` 一帶）, when 重新執行 `npm test`, then 全數維持原有斷言與行為，無回歸。

## Verification

**Commands:**
- `npm test -- src/fetcher.test.ts` -- expected: 全數通過，含新增的兩則測試與既有三則封鎖中止測試
- `npm run typecheck` -- expected: 無型別錯誤

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 1, low 5)
- defer: 2: (high 0, medium 1, low 1)
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[medium]` `[patch]` `handleFatalMainError` 未防範自身丟例外（`console.error`/`logAbortSummary` 若拋出會再度成為 unhandled rejection）；已改用 `try { ... } finally { process.exit(1); }` 確保 exit 一定執行。
  - `[low]` `[patch]` 非 `Error` 例外物件經樣板字串隱式轉型會印成 `[object Object]`；已改用 `JSON.stringify` 並在其失敗時退回 `String(err)`。
  - `[low]` `[patch]` 補上針對非 `Error` 輸入的 `handleFatalMainError` 測試，驗證不再印出 `[object Object]` 且仍以 exit code 1 結束。
  - `[low]` `[patch]` `logAbortSummary` 註解仍宣稱只在 `process.exit(1)` 之前使用，已改為泛指所有早退路徑（含新增的 exit(2) 與 fatal handler）。
  - `[low]` `[patch]` `handleFatalMainError` 註解引用的 `AD-16 #1` 實際是封鎖判定（403/429），非本情境；已移除該子項引用，改以 AD-16「危險是靜非吵」的整體精神敘述。
  - `[low]` `[patch]` `startedAt` 載入時賦值的註解暗示測試套件驗證了 `main()` 賦值前拋出例外的情境，但實際未驗證；已收斂措辭，僅陳述避免 `NaN` 的目的。

### 2026-08-23 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 1, low 2)
- defer: 5: (high 0, medium 0, low 5)
- reject: 6: (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` `handleFatalMainError` 的 `try`/`finally` 保證（`console.error`/`logAbortSummary` 拋出時仍會 `process.exit(1)`）未被任何測試驗證；已新增測試強制 `console.error` 拋出並斷言仍以 exit code 1 結束。
  - `[low]` `[patch]` 測試檔案中引用 `handleFatalMainError` 文件註解舉例的 `fs.writeFileSync` EACCES 情境有誤（Node 的 fs errno 例外實際是 `Error` 實例，不會走非 `Error` 分支）；已改寫該測試註解為通用的「非 `Error` 物件」情境描述。
  - `[low]` `[patch]` 非 `Error` 分支對字串型別的丟出值仍會經 `JSON.stringify` 加上多餘引號（如 `throw 'boom'` 印成 `"boom"`）；已為字串型別加上特判，直接印出原字串。

### 2026-08-23 — Review pass 3
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 0, low 1)
- defer: 2: (high 0, medium 0, low 2)
- reject: 6: (high 0, medium 1, low 5)
- addressed_findings:
  - `[low]` `[patch]` `handleFatalMainError` 的 `try`/`finally` 保證同時聲稱涵蓋 `console.error` 與
    `logAbortSummary` 拋出兩種情境，但既有測試只涵蓋 `console.error` 拋出；已新增測試強制 `logAbortSummary`
    內部的 `requestCount()` 拋出，並斷言仍以 exit code 1 結束。

## Auto Run Result

**Summary：** 本輪為既有 `done` spec 的追加審查（follow-up review），未變更本次早退彙總修補（DW-38/DW-39）的原有實作，僅補強 `handleFatalMainError` 的 `try`/`finally` 測試涵蓋率。

**Files changed（本輪）：**
- `src/fetcher.test.ts` — 新增 `import * as limiter from './limiter'`，並新增一則測試強制 `logAbortSummary` 內部的 `requestCount()` 拋出，驗證 `handleFatalMainError` 的 `finally` 仍會執行 `process.exit(1)`。
- `_bmad-output/implementation-artifacts/spec-dw-38-39-fetcher-abort-summary-gaps.md` — 狀態改為 `in-review` 再收斂為 `done`；`deferred` 追加兩則新發現；新增本輪 Review Triage Log 與本節。

**Review findings breakdown（本輪）：**
- patch：1（low 1）— 已修補（見上）
- defer：2（low 2）— `--product=` 分支的 `logAbortSummary` 呼叫未如 `handleFatalMainError` 般做 `try`/`finally` 保護；`handleFatalMainError` 對 `null`/`undefined` 輸入的處理未被測試涵蓋
- reject：6（medium 1、low 5）— 均為前兩輪審查已記錄於 `deferred` 的既有發現（`err.stack` 遭捨棄、`startedAt` 模組層級可變狀態的競爭風險、`JSON.stringify` 循環參照 fallback、entry-point `.catch()` 未被端對端測試涵蓋等），本輪多位審查者重新提出但未帶來新資訊，故不重複記錄

**Follow-up review recommendation：** `false`（本輪 patch 僅 1 筆、severity 皆為 low，皆非 high；分數 = 3×0（medium）+ 1×1（low）= 1，未達 5 之門檻）

**Verification performed：**
- `npm test -- src/fetcher.test.ts` — 全數通過（109 tests, 0 fail），含新增測試
- `npm run typecheck` — 無型別錯誤

**Residual risks：** 見本輪新增之兩則 `deferred` 項目（均為 low severity、觸發機率極低的邊界情境），非阻斷性。


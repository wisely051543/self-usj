---
title: 'DW-54：釘住 fetcher.ts 檔尾 entry point 的 main().catch(handleFatalMainError) 接線'
type: 'chore'
created: '2026-08-23'
baseline_revision: 'b253abc2ecea8e1054c733b6c85ea597d20fa22d'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `src/fetcher.test.ts` 有兩處在 `mockFs(t)` 之後又各自對 `fs.writeFileSync` 再 mock 一次，Node 的 MockTracker 依插入順序回捲，導致內層 mock 留在 `node:fs` 模組上，影響該檔後續每一個測試。
    evidence: |-
      `mockFs(t)`（約 src/fetcher.test.ts:107）已經 mock 過 `writeFileSync`，而 `an ordinary (non-BlockedError) failure...`（約 :325/:352）與 `the days.json a round writes...`（約 :379/:390）兩個測試又各自 `t.mock.method(fs, 'writeFileSync', ...)`。實測結果：DW-54 新測試第一次跑時因為 shim 檔實際上沒被寫出而以 MODULE_NOT_FOUND 失敗，改用「模組載入時攔下的 `realFs` 原函式」才穩定。今天沒有紅燈只是因為後續測試都各自重新 mock，屬於潛伏陷阱而非已生效的錯誤。這是本次改動之前就存在的問題，只是被 DW-54 的測試意外照出來。
    location: >-
      src/fetcher.test.ts:325, src/fetcher.test.ts:379
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 檔尾的 `if (require.main === module) { main().catch(handleFatalMainError); }` 這段接線沒有任何測試真的執行過——測試 import 這個模組時 `require.main === module` 恆為 false，現有的 `handleFatalMainError` 測試是拿合成錯誤直接呼叫 handler，CI 的 Smoke-check 步驟又只驗 `fetch-output.log` 非空。因此把 `.catch()` 刪掉或誤寫成 `.then()` 的回歸會全綠出貨：未被 catch 的 rejection 一樣讓 Node 以 1 結束，但 `[fetch] fatal:` 那行診斷與 abort summary 都會消失。

**Approach:** 在 `src/fetcher.test.ts` 新增一個以 `spawnSync` 跑真實 entry point 的測試：用 `--require` 預載一支臨時 shim，把 `./dates` 模組的 `todayJST` 換成會 throw 的版本，藉此在 `main()` 第一個未被 try/catch 包住的語句上製造「未建模的例外」，然後斷言子行程 exit code 為 1、stderr 出現 `[fetch] fatal:` 與注入的錯誤訊息、並接著出現 abort summary 那行。注入點在任何網路請求與檔案寫入之前，所以測試不觸網、不動 `data/`。

## Boundaries & Constraints

**Always:**
- 只改測試檔。`src/fetcher.ts` 這次不得有任何 production 端改動（包含新增測試 hook、export、環境變數分支）。
- 注入用的 shim 檔寫在 `os.tmpdir()` 下的臨時目錄，並以 `t.after()` 清掉；不得在 repo 內留下新的 fixture 檔。
- 子行程必須設 timeout（沿用 `src/schema.test.ts:291` 的 `timeout: 60_000` 慣例），因為 `node:test` 沒有預設 timeout，掛住的子行程會拖死整個 suite。
- 斷言必須同時涵蓋 exit code 與 `[fetch] fatal:` 這行字。單看 exit code 不足以分辨——unhandled rejection 在 Node 也是以 1 結束，只有那行診斷才是 `.catch()` 真的接上的證據。
- 斷言 `result.error === undefined`，避免 spawn 本身失敗時測試以誤導性的訊息紅掉（同 `src/schema.test.ts:293`）。

**Block If:**
- 若無法在不改 production code 的前提下製造未建模例外（例如 `todayJST` 已不再被 `main()` 在未保護區段呼叫，且找不到等效注入點），HALT，blocking condition 為 `no injection point for an unmodeled throw without production hooks`。

**Never:**
- 不要為了測試而在 `src/fetcher.ts` 加任何 hook、旗標或 export。
- 不要讓子行程真的跑到 `source.listProducts()`（會對 usj.co.jp 發請求）或 `fs.mkdirSync(PRODUCTS_DIR)`。
- 不要動 `.github/workflows/` 的 Smoke-check 步驟；那是 DW-12 的地盤，本 spec 只補測試層的接線覆蓋。
- 不要碰 deferred-work ledger（`_bmad-output/implementation-artifacts/deferred-work.md`）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 接線完好 | 預載 shim 讓 `todayJST` throw，spawn `src/fetcher.ts` 作為 entry point | exit code 為 1；stderr 含 `[fetch] fatal:` 與注入訊息；其後含 `[fetch] aborted after` 那行 | 無預期錯誤 |
| `.catch` 被拿掉或改成 `.then`（回歸） | 同上 | 測試必須紅：stderr 只有 Node 的 unhandled-rejection stack，沒有 `[fetch] fatal:` | 由 stderr 斷言擋下（exit code 仍是 1，擋不住） |
| `require.main === module` 守衛被寫反（回歸） | 同上 | 測試必須紅：`main()` 根本沒跑，exit code 0 且 stderr 無 fatal 行 | 由 exit code 與 stderr 斷言共同擋下 |
| spawn 失敗（node/ts-node 不可用） | 子行程無法啟動 | 測試以「跑不起來」的明確訊息紅掉，而不是誤報成接線壞了 | `assert.equal(result.error, undefined, ...)` |

</intent-contract>

## Code Map

- `src/fetcher.ts:704-707` -- 受測目標：`if (require.main === module) { main().catch(handleFatalMainError); }`。**唯讀**，本次不得修改。
- `src/fetcher.ts:546` -- `const start = todayJST();`，`main()` 內第一個未被 try/catch 包住的呼叫，且在 `source.listProducts()`（第一次網路存取）與 `fs.mkdirSync(PRODUCTS_DIR)` 之前。這是注入點。
- `src/fetcher.ts:529-537` -- `handleFatalMainError`：印 `[fetch] fatal: ${detail}`，再呼叫 `logAbortSummary(startedAt)`，`finally` 中 `process.exit(1)`。
- `src/fetcher.ts:300-303` -- `logAbortSummary`：印 `[fetch] aborted after ${requestCount()} requests in ${seconds.toFixed(1)}s`。
- `src/dates.ts:4` -- `export function todayJST()`。TS 以 CommonJS 編出 `exports.todayJST = todayJST`（可寫），且 `fetcher.ts` 的呼叫端編成 `dates_1.todayJST()`，屬於呼叫時的屬性查找，因此在預載階段覆寫模組 exports 就能生效。
- `src/schema.test.ts:274-295` -- 既有的 `spawnSync` 先例：`process.execPath` + `--require ts-node/register` + 腳本路徑，`{ cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }`，並先斷言 `result.error === undefined`。照抄這個形狀。
- `src/schema.test.ts:265-272` -- `fixtureDir(t, ...)`：`fs.mkdtempSync(path.join(os.tmpdir(), 'usj-schema-'))` + `t.after(() => fs.rmSync(dir, { recursive: true, force: true }))`。臨時 shim 目錄照這個形狀寫。
- `src/fetcher.test.ts:22-36` -- 現有 import 區塊與 `const fs = require('node:fs') as typeof import('node:fs')`；新測試需要的 `spawnSync` / `os` / `REPO_ROOT` 都要在此補上（檔內目前沒有 `REPO_ROOT`）。
- `src/fetcher.test.ts:639-660` -- 既有 `handleFatalMainError` 直呼測試與其註解，說明「沒有硬造真實 throw」。新測試正是補上這一塊，註解要互相對得上。
- `src/fetcher.test.ts` 中的 `captureErrors` / `assertAbortSummaryFollows` helper -- 針對 in-process 的 `console.error` 攔截，**不適用**子行程；新測試直接讀 `result.stderr`。

## Tasks & Acceptance

**Execution:**
- `src/fetcher.test.ts` -- 在既有 `handleFatalMainError` 測試群組後面，新增一個 spawn 型的 entry-point 接線測試，並在檔頭 import 區補上 `spawnSync`（`node:child_process`）、`os`（`node:os`）與 `REPO_ROOT` 常數 -- 這是唯一真的執行 `main().catch(handleFatalMainError)` 那行的覆蓋。
- `src/fetcher.test.ts` -- 為新測試寫一段註解，載明 DW-54、為何直呼 handler 不夠、以及為何 exit code 單獨不足以判別（unhandled rejection 同樣 exit 1）-- 否則下一個人會把 stderr 斷言當成多餘的而刪掉。

**Acceptance Criteria:**
- Given `src/fetcher.ts` 檔尾維持 `main().catch(handleFatalMainError)`，when 執行 `npm test`，then 新測試通過，且整份 suite 仍全綠。
- Given 把該行暫時改成 `main().then(handleFatalMainError)`，when 執行新測試，then 它失敗並指出 stderr 缺少 `[fetch] fatal:`。
- Given 把 `require.main === module` 守衛暫時改成恆假，when 執行新測試，then 它失敗（子行程以 0 結束、stderr 無 fatal 行）。
- Given 新測試執行，when 觀察 repo 狀態，then `data/` 未被寫入、`src/fetcher.ts` 未被修改、臨時 shim 目錄已被清除。
- Given 執行 `npm run typecheck`，when 完成，then 無錯誤。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 1, medium 2, low 2)
- defer: 1: (high 0, medium 1, low 0)
- reject: 12: (high 0, medium 0, low 12)
- addressed_findings:
  - `[high]` `[patch]` `if (require.main === module)` 這層守衛本身沒被釘住：把整段 `if` 拿掉、只留 `main().catch(handleFatalMainError)`，新測試仍全綠，但 `fetcher.test.ts` / `fetcher-grid.test.ts` 一 import 就會跑真實 round、覆寫已進版控的 `data/` 快照。已新增第二個 spawn 測試 `importing fetcher.ts does not run the round — the require.main guard holds (DW-54)`，用同一支會 throw 的 shim 搭配 `-e "require(...)"`，守衛在時 exit 0 且 stderr 無 `[fetch]` 行，守衛被刪時 exit 1 並印出 fatal 行——壞掉的狀態也不觸網、不寫 `data/`。
  - `[medium]` `[patch]` 沒有任何斷言證明注入是在 I/O 之前生效（`assertAbortSummaryFollows` 只比對 `\d+ requests` 的形狀）。已加上對 `after 0 requests` 的斷言，把 spec「子行程不得跑到 `source.listProducts()`」這條從註解變成會紅的檢查。
  - `[medium]` `[patch]` shim 無條件覆寫 `dates.todayJST`，一旦改名、解析到另一個模組實例或換成 ESM 就靜默失效並退化成真實 round。shim 改為自我檢查：`typeof` 不是 function、或賦值後 identity 對不上，就印診斷並 `process.exit(97)`；測試斷言 `status !== 97` 並提示注入點已移動。
  - `[low]` `[patch]` 註解兩處說法有誤：`todayJST()` 並非 `main()` 第一個未受保護的語句（argv 過濾鏈在前），且 exit code 斷言並不是抓「守衛寫反」的那一個（該情境下先失敗的是缺少 fatal 行的斷言）。已改寫成真正成立的理由。
  - `[low]` `[patch]` 子行程被 signal 殺掉時 `result.error` 是 undefined、`status` 是 null，會誤報成「沒有 fatal 行」。已在 `result.error` 檢查後補 `assert.equal(result.signal, null, ...)`，兩個 spawn 測試共用。

### 2026-08-23 — Review pass (follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 0, low 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[low]` `[patch]` `assertAbortSummaryFollows` 內部已經 `findIndex` 找到 abort summary 那一行，卻沒有回傳，逼新測試再用 `stderr.find(line => ABORT_SUMMARY.test(line))` 重新掃一次同一份陣列。已把函式改成回傳命中的那一行，呼叫端直接複用回傳值，其餘既有呼叫點（不使用回傳值）不受影響。
  - `[low]` `[patch]` shim 腳本裡 `require(<dates 模組路徑>)` 沒包 try/catch：若 `dates.ts` 被搬移或改壞導致 `require` 本身就丟例外，會在兩個自我檢查跑到之前，於 `--require` 預載階段就讓子行程以未捕捉例外結束，兩個 DW-54 測試都只會看到「缺少 `[fetch] fatal:` 行」這種容易誤導人的訊息，而不是「注入點已移動」的明確診斷。已把 `require` 包進 try/catch，失敗時印出清楚訊息並 `process.exit(97)`，讓這個失敗模式併入既有的 `status !== 97` 斷言與訊息。



注入手法（已在規劃階段實測可行，實測輸出：`[fetch] fatal: Error: ...` → `[fetch] aborted after 0 requests in 0.0s` → exit 1）：

```js
// 寫進臨時目錄的 shim；以 --require 在 ts-node/register 之後預載
const dates = require('<REPO_ROOT>/src/dates.ts');
dates.todayJST = () => { throw new Error('injected unmodeled failure'); };
```

```
spawnSync(process.execPath, [
  '--require', 'ts-node/register',
  '--require', shimPath,
  path.join(REPO_ROOT, 'src', 'fetcher.ts'),
], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 })
```

為何選 `todayJST` 而非其他注入點：`main()` 開頭的 argv 過濾不呼叫任何可覆寫的模組函式；`readIndex()` 自己吞例外；`source.listProducts()` 被 try/catch 包住、走的是「catalog failed」的 exit 1 分支而非 fatal 分支——那條路徑不經過 `.catch(handleFatalMainError)`，拿來測會給出假綠。`todayJST()` 是第一個既未受保護、又在任何 I/O 之前的呼叫。

shim 路徑要用絕對路徑寫入（它位於 tmpdir，相對解析會落空）。shim 內用 `require`（`.js`、CommonJS）而非 import；`ts-node/register` 已先於它註冊了 `.ts` 的 require extension，所以 `require('.../src/dates.ts')` 可解析。

## Verification

**Commands:**
- `npm test` -- expected: 全綠，且輸出中出現新測試的名稱。
- `npm run typecheck` -- expected: 無錯誤。
- `git status --porcelain` -- expected: 只有 `src/fetcher.test.ts` 與本 spec 檔的異動；`data/` 下無新檔。

**Manual checks (if no CLI):**
- 暫時把 `src/fetcher.ts` 檔尾改成 `main().then(handleFatalMainError)`，跑 `npm test`，確認新測試紅掉且訊息指向缺少的 `[fetch] fatal:` 行，然後 `git checkout -- src/fetcher.ts` 還原。

## Auto Run Result

Status: done

### 實作摘要

`src/fetcher.ts` 檔尾的 `if (require.main === module) { main().catch(handleFatalMainError); }` 原本沒有任何測試真的執行過。現由兩個 `spawnSync` 型測試把整段接線釘住：兩者都預載一支寫在 tmpdir 的 shim，把 `./dates` 的 `todayJST` 換成會 throw 的版本，藉此在 `main()` 走到任何網路或檔案 I/O 之前製造未建模的例外。`src/fetcher.ts` 全程未改動，production code 沒有新增任何測試 hook。本次是針對已完成實作的 follow-up review pass（因前次通過的 review 判定 `followup_review_recommended: true`），只再處理這一輪新發現的 2 個 low 級 patch，未變更測試涵蓋範圍或注入手法本身。

- `running fetcher.ts as the entry point routes an unmodeled throw through handleFatalMainError (DW-54)`：以 entry point 身分 spawn `src/fetcher.ts`，斷言 `[fetch] fatal:` 帶出注入訊息、其後緊接 abort summary 且內容為 `after 0 requests`、exit code 為 1。
- `importing fetcher.ts does not run the round — the require.main guard holds (DW-54)`：以 `-e "require(...)"` spawn，斷言 exit 0 且 stderr 無 `[fetch]` 行——守衛被刪或寫反時，這個測試會因為 fatal 行出現而紅。

### 變更檔案

- `src/fetcher.test.ts` -- 新增上述兩個測試與共用 helper（`INJECTED_FAILURE`、`SHIM_INJECTION_MISSED = 97`、`writeThrowShim`、`runWithShim`）；補上 `os` / `spawnSync` import、`REPO_ROOT` 常數，以及在模組載入時攔下的 `realFs`（`mkdtempSync` / `writeFileSync` / `rmSync` 原函式，繞開本檔既有的 mock 洩漏）。本輪 follow-up review 另外：把 `assertAbortSummaryFollows` 改成回傳命中的 abort-summary 行，讓 DW-54 測試直接複用而非重新掃描一次 `stderr`；並把 shim 腳本裡的 `require(<dates 模組路徑>)` 包進 try/catch，`dates.ts` 被搬移或載入失敗時明確 `process.exit(97)`，而不是在 `--require` 預載階段就以未捕捉例外中斷、給出「缺少 fatal 行」這種誤導性訊息。
- `_bmad-output/implementation-artifacts/spec-dw-54-fetcher-entrypoint-catch-pin.md` -- 本 spec，新增本輪 Review Triage Log 條目與本節。

### Review findings 統計

**本輪（follow-up review pass）：**
- patches applied: 2（low 2）——`assertAbortSummaryFollows` 回傳值重用、shim `require` 包 try/catch。
- items deferred: 0。
- items rejected: 0（其餘由 blind-hunter / edge-case-hunter / intent-alignment 提出的項目，經查證後判定為既有殘留風險已在 Design Notes 中記載、或本專案的模組解析方式下不成立、或與本 follow-up review 的追蹤範圍無關，未列入 triage log）。
- verification-gap reviewer：實際跑過測試並對 `src/fetcher.ts` 做過兩種回歸突變（拿掉 `.catch()`、拿掉 `require.main` 守衛），確認兩個 DW-54 測試都會如預期轉紅，回報 no verification gaps found。

**前次（實作 + 首輪 review pass，已記錄於上方 Review Triage Log）：**
- patches applied: 5（high 1、medium 2、low 2）。
- items deferred: 1（medium）——`src/fetcher.test.ts` 既有的 `fs.writeFileSync` 雙重 mock 洩漏，屬本次改動之前既存問題，已記入 frontmatter `deferred`並已由 ledger 收錄為 DW-90。
- items rejected: 12（皆為 low）。

### Follow-up review recommendation

`false`。本輪 patch 分佈：high 0、medium 0、low 2。無 high severity patch；分數計算 `3 × 0 + 1 × 2 = 2`，未達 5。

### 驗證

- `npm test` -- 167 tests / 167 pass / 0 fail，兩個 DW-54 測試皆在輸出中出現。
- `npm run typecheck` -- 無錯誤。
- `git status --porcelain` -- 本輪異動僅 `src/fetcher.test.ts` 與本 spec 檔；`data/` 無新檔。

### 殘留風險

- 注入手法依賴三件不屬於受測接線本身的事實：`main()` 仍在任何 I/O 之前呼叫 `todayJST()`、`tsconfig.json` 的 `module: "CommonJS"` 讓 `exports.todayJST` 可寫、以及呼叫端編成 call-time 的屬性查找。前兩者若改變，shim 的自我檢查會以 exit 97 明確紅掉；若 `todayJST` 移到 `try` 內或 I/O 之後，則由 `after 0 requests` 斷言擋下。
- 測試釘的是 `ts-node` 直跑 `src/fetcher.ts`（`npm run fetch` 與 CI 實際使用的形式），未釘 `npm run build` 產出的 `dist/fetcher.js`。只在編譯產物上才看得到的回歸仍未覆蓋——CI 目前不跑 `build`，所以影響有限。
- 兩個測試各自 spawn 一個 ts-node 子行程，各約 0.6 秒，讓整份 suite 多約 1.2 秒。
- 上述已 deferred 的 mock 洩漏（DW-90）尚未修復；新測試以 `realFs` 繞開，但該檔其餘測試仍暴露在同一個陷阱下。
- 執行本輪 review 時，工作目錄內 `_bmad-output/implementation-artifacts/deferred-work.md` 已存在未提交的異動（將 DW-54 標記為 done 並新增 DW-90），屬 orchestrator 自己的 ledger 記帳、非本次 diff 涵蓋範圍，依指示本 spec 未觸碰、也未一併提交該檔案；它會在提交後仍以 modified 狀態留在工作目錄中，不屬於本次 finalize 的清理範圍。


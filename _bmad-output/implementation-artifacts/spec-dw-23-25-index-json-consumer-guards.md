---
title: 'DW-23/DW-25：補齊兩個 index.json 消費端的檢查不對稱'
type: 'refactor'
created: '2026-08-22'
status: 'done'
baseline_revision: '2a391307ec86529070e03cecc27981105ad46ce6'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `readIndex()`／`main()` 讀 `data/index.json` 失敗（檔案不存在或非合法 JSON）時，
      拋出的是原始 `ENOENT`／`SyntaxError`，不像 `schema-check.ts` 的 `readSchemaVersion()`
      那樣包成具名檔案的友善訊息。
    evidence: |-
      本次變更前的 `main()` 就已是 `JSON.parse(fs.readFileSync(...)) as Index`，
      對讀檔／解析失敗完全沒有 try/catch；`readIndex()` 原樣沿用這段讀檔邏輯，只在其後插入
      版號檢查，讀檔／解析失敗的行為與本次變更前完全一致，非本次引入。
    location: >-
      src/i18n-check.ts（readIndex()）
    severity: low
  - summary: >-
      `main()` 走訪 `index.products` 時，若某個 product code 在 `data/products/` 下沒有對應
      檔案（版號正確但索引與商品檔不一致），仍會以未包裝的 `ENOENT` 中止，訊息不會指出是
      哪個 product code 造成的。
    evidence: |-
      `index.products.map(p => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, ...))))`
      這段本次未觸碰，`readIndex()` 的版號守衛只擋下版號不符的情境，對「版號正確但索引與
      商品檔不同步」這個相鄰失效模式沒有任何新增防護，此為既有行為。
    location: >-
      src/i18n-check.ts（main()，products.map）
    severity: low
  - summary: >-
      `loadCalendar()`（`index.html:1061`）既有的 `!res.ok` 守衛，與本次新增的 `boot()` 守衛
      同樣完全沒有回歸測試——`src/schema.test.ts` 的 `runPage()` fetch stub 目前寫死
      `ok: true`，本輪已就 `boot()` 的新守衛排入 patch（見上）補測，但 `loadCalendar()`
      這處既有、非本次引入的同形狀缺口未一併處理。
    evidence: |-
      grep `src/*.test.ts` 未找到任何 `ok: false`／`status: 404`／`status: 500` 的 fetch stub，
      `runPage()`（`src/schema.test.ts:487-538`）的 `fetch` 固定回傳 `ok: true`，
      `loadCalendar()` 相關測試（`src/schema.test.ts:552-564`）僅涵蓋版號守衛，不涵蓋
      HTTP 狀態守衛。此缺口在本次變更之前就存在，範圍與本次 patch 的 `boot()` 守衛測試不同。
    location: >-
      index.html:1061（loadCalendar()）
    severity: low
---

<intent-contract>

## Intent

**Problem:** 兩個既有的 `data/index.json` 消費端各自缺一道既有慣例已證明必要的檢查：`index.html` 的 `boot()`（1417 行起）取檔後未檢查 `res.ok` 就 `res.json()`，404/500 會落入既有 catch 顯示為 JSON 解析錯誤，誤導排查方向——同檔 `loadCalendar()`（1058 行起）已有 `if (!res.ok) throw new Error(...)`，`boot()` 沒有。`src/i18n-check.ts` 的 `main()`（59 行）讀檔後直接 cast 成 `Index` 並走訪 `.products`，全程不呼叫 `assertIndexSchemaVersion()`，版號不符時會回報成「翻譯缺漏」而非「版號不符」。

**Approach:** 兩處各自比照同檔／同專案已存在的正確作法補上缺的檢查：`boot()` 仿 `loadCalendar()` 加 `!res.ok` 守衛；`src/i18n-check.ts` 仿 `src/schema-check.ts` 的模式，抽出一個先驗版、再回傳的 `readIndex()`，讓 `main()` 在走訪 `.products` 之前就先驗版，並補上該檔目前完全不存在的測試，鎖住「版號不符先於任何走訪失敗」這個順序。兩者皆為既有不對稱的補齊，版號正確、`res.ok` 為真時的可見行為完全不變。

## Boundaries & Constraints

**Always:**
- `boot()` 的新守衛與 `loadCalendar()`（`index.html:1061`）逐字一致的風格：`if (!res.ok) throw new Error(\`HTTP ${res.status}\`);`，插在 `fetch` 之後、`res.json()` 之前。錯誤仍落入 `boot()` 既有的 `catch`，仍顯示既有的 `error-box`，不新增任何 UI 元素。
- `src/i18n-check.ts` 新增的版號檢查必須用 `src/schema.ts` 匯出的 `assertIndexSchemaVersion()`，不得在本檔重新實作版號比對邏輯——與 `src/schema-check.ts:50` 同一個檢查函式，同一份錯誤訊息格式。
- 版號檢查必須發生在 `index.products` 第一次被讀取（`.map()`／任何走訪）之前。
- `src/i18n-check.ts` 目前檔尾以 `main();` 無條件呼叫，需改為 `if (require.main === module) { main(); }`（比照 `src/schema-check.ts:76` 的既有慣例），使測試可以 `import` 這個模組而不觸發它對真實 `data/index.json` 的完整執行副作用。
- 新測試對 `fs.readFileSync` 的 mock 比照 `src/schema.test.ts` 的 `withFiles()` 寫法：用 `require('node:fs')` 取得的模組物件（而非 `import * as fs`）做 `t.mock.method`，並以 `path.basename` 比對檔名——理由與該檔註解相同（namespace import 編譯出唯讀 getter，`t.mock.method` 換不掉）。
- `npm run typecheck` 與 `npm test` 均須通過；`npm run i18n:check` 對本 repo 真實 `data/` 執行時的輸出（gap 數、attraction 數）必須與變更前完全一致。

**Block If:**
- 若 `src/i18n-check.ts` 除了本次要動的 `main()` 讀檔那一行以外，還有其他地方以任何形式重新讀取或快取 `index.json`（目前程式碼沒有，若調查發現有，先確認再動）。

**Never:**
- 不處理 `src/fetcher.ts` 的 `readIndex()`（抓取端同類缺口）——該項另由 DW-21 的人工決策處理，明確排除於本次範圍。
- 不改變版號正確、`res.ok` 為真時任一消費端的可見輸出（`boot()` 的渲染結果、`i18n-check` 的 gap/attraction 統計）。
- 不新增或修改 `INDEX_SCHEMA_VERSION` 的值，不觸碰 `src/schema.ts` 既有內容。
- 不把 `src/i18n-check.ts` 現有的 `main()` 拆成一般函式庫模組以外的更大重構——只抽出讀檔＋驗版這一步供測試呼叫，其餘走訪／報告邏輯原樣保留在 `main()` 內。

</intent-contract>

## Code Map

- `index.html:1058-1068` -- `loadCalendar()`，`!res.ok` 守衛的既有範例，逐字風格要沿用：`if (!res.ok) throw new Error(\`HTTP ${res.status}\`);` 緊接在 `fetch` 之後。
- `index.html:1417-1429` -- `boot()`：`const res = await fetch('./data/index.json?t=' + Date.now());` 後直接 `await res.json()`，DW-23 在此兩行之間插入同款守衛。整個 `try` 已有既有 `catch` 寫入 `#root` 的 `error-box`，守衛丟出的 `Error` 會走同一條路徑，不需改動 `catch`。
- `index.html:1050-1056` -- `assertIndexSchema(doc)`：既有的版號守衛，緊接在 `boot()` 的 `res.json()` 之後呼叫，本次新增的 HTTP 守衛要插在它之前（即 `res.json()` 之前），順序仍是 HTTP → JSON parse → 版號。
- `src/i18n-check.ts:58-62` -- `main()` 開頭：`const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf-8')) as Index;` 是 DW-25 要動的那一行；`index.products.map(...)` 緊接在後，是「走訪」的第一個發生點。
- `src/i18n-check.ts:134` -- 檔尾 `main();`，無條件呼叫，需改為 `if (require.main === module) { main(); }`。
- `src/i18n-check.ts:17` -- `const ROOT = path.join(__dirname, '..');`，`readIndex()` 沿用這個既有常數，不需要參數化。
- `src/schema.ts:31,49-55` -- `INDEX_SCHEMA_VERSION` 與 `assertIndexSchemaVersion(value: unknown): void`，DW-25 直接呼叫此函式，不重新實作比對。
- `src/schema-check.ts:27-40,76` -- 本次抽出的 `readIndex()` 要仿的既有模式：`readSchemaVersion()` 讀出 `schemaVersion` 欄位後立刻交給 `assert*SchemaVersion()`，且模組尾端已有 `if (require.main === module) main(...)` 守衛可以直接參考。
- `src/schema.test.ts:171-179,181-218` -- `withFiles(t, files)` 輔助函式與其呼叫方式，是本次新測試要仿的 `fs.readFileSync` mock 寫法（`require('node:fs')` 取模組物件、`t.mock.method`、`path.basename` 比對檔名、mock 內對未命中檔名 fallback 回真實 `readFileSync`）。
- `src/i18n-check.ts` 目前沒有對應的 `.test.ts`（`ls src/*.test.ts` 確認過），DW-25 要新增 `src/i18n-check.test.ts`。

## Tasks & Acceptance

**Execution:**
- `index.html` -- 在 `boot()`（約 1417 行起）的 `fetch('./data/index.json...')` 之後、`res.json()` 之前插入 `if (!res.ok) throw new Error(\`HTTP ${res.status}\`);`，與 `loadCalendar()` 逐字同款 -- 補齊同檔既有不對稱，404/500 不再偽裝成 JSON 解析錯誤。
- `src/i18n-check.ts` -- 匯入 `assertIndexSchemaVersion`；抽出 `export function readIndex(): Index`，內容為讀檔＋`assertIndexSchemaVersion(parsed.schemaVersion)`＋回傳，`main()` 改呼叫它取代原本內聯的 `JSON.parse(...) as Index`；檔尾 `main();` 改為 `if (require.main === module) { main(); }` -- 讓版號檢查先於 `.products` 走訪執行，且模組可被測試安全 `import`。
- `src/i18n-check.test.ts`（新檔）-- 比照 `src/schema.test.ts` 的 `withFiles()` 寫法 mock `fs.readFileSync`，涵蓋：版號正確時 `readIndex()` 回傳不變；版號不符時丟出含 `index.json schemaVersion is` 的錯誤；`schemaVersion` 缺失時同樣丟出；以及一個以 `main()`（非僅 `readIndex()`）驗證「版號不符時，即使 `products` 陣列內含一個磁碟上不存在對應檔案的假 `code`，仍先以版號錯誤中止，而非在讀該假產品檔時丟出 ENOENT」的順序測試 -- 鎖住「先驗版再走訪」這個順序本身，不只鎖住 `readIndex()` 單獨的回傳值。

**Acceptance Criteria:**
- Given `data/index.json` 回應 404 或 500，when `boot()` 執行，then 錯誤落入既有 `catch`，`#root` 顯示既有 `error-box`，訊息來源是 `HTTP {status}` 而非 JSON 解析錯誤。
- Given `data/index.json` 的 `schemaVersion` 不等於 `INDEX_SCHEMA_VERSION`，when 執行 `npm run i18n:check`（或直接呼叫 `main()`／`readIndex()`），then 拋出的錯誤訊息包含 `index.json schemaVersion is`，且不會走到任何 `.products` 走訪或 term-table 比對邏輯。
- Given 版號正確的既有 `data/index.json` 與 `data/products/*.json`，when 執行 `npm run i18n:check`，then 輸出（gap 數、attraction 數）與變更前完全一致。
- Given `src/i18n-check.ts` 被其他模組 `import`（例如測試檔），when 該 import 發生，then 不會觸發 `main()` 對真實 `data/index.json` 的執行副作用（`console.log` 輸出、實際讀檔）。

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 3: (high 0, medium 0, low 3)
- reject: 6: (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` `boot()` 的新 `!res.ok` 守衛完全沒有回歸測試——`src/schema.test.ts` 的 `runPage()` fetch stub 寫死 `ok: true`，兩個既有 `boot()` 測試都走這條 stub，若日後守衛被移除或寫反，不會有任何測試失敗 —— 讓 `runPage()` 的 fetch stub 支援按 URL 覆寫 `ok`／`status`，並在既有 `boot()` 測試旁新增一個 404 案例，斷言 `renderCalls() === 0` 且 `html('root')` 符合 `/HTTP 404/`。
  - `[low]` `[patch]` `main()` 因測試需要被改為 `export`，但不像 `readIndex()` 有完整 JSDoc 解釋為何要匯出——加一行註解說明匯出僅供測試呼叫，實際執行仍受 `require.main` 守衛保護。

## Design Notes

`readIndex()` 刻意不接收目錄參數（不像 `schema-check.ts` 的 `checkSnapshots(dataDir)`）：本次測試直接 mock `fs.readFileSync` 依檔名比對（`withFiles()` 風格），不需要參數化路徑就能餵入合成內容，維持與原檔一致的「讀固定 `ROOT` 底下的檔案」寫法，改動面最小。

版號檢查放在「回傳前」而非「呼叫端」：`readIndex()` 是本檔唯一讀 `index.json` 的地方，`main()` 呼叫它時已經是驗過版的結果，之後的 `.products` 走訪、term-table 比對都不需要再重複想到版號的事，這與 `assertIndexSchemaVersion` 在 `schema-check.ts`／`index.html` 兩處既有呼叫點「讀完立刻驗」的位置一致。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無錯誤結束
- `npm test` -- expected: 全數通過，包含新增的 `src/i18n-check.test.ts`
- `npm run i18n:check` -- expected: 對本 repo 真實 `data/` 執行，輸出與變更前一致（`0 gap(s)`，`0 attraction(s) without an English name`，若這兩個數字在本次變更之外的因素下已經不同，比對的是「本次變更沒有讓它們改變」而非固定數字）
- `git diff --stat` -- expected: 僅 `index.html`、`src/i18n-check.ts`、`src/i18n-check.test.ts`（新檔）三個檔案

## Auto Run Result

**實作摘要：** 補齊 DW-23、DW-25 兩個既有 `data/index.json` 消費端的檢查不對稱。`index.html` 的 `boot()` 仿同檔 `loadCalendar()` 加上 `if (!res.ok) throw new Error(\`HTTP ${res.status}\`);`，插在 `fetch` 之後、`res.json()` 之前，404/500 不再偽裝成 JSON 解析錯誤，仍落入既有 `catch` 顯示既有 `error-box`（DW-23）。`src/i18n-check.ts` 抽出 `export function readIndex(): Index`，讀檔後立即呼叫 `assertIndexSchemaVersion()`，`main()` 改呼叫它取代原本內聯的 `JSON.parse(...) as Index`，讓版號檢查先於 `.products` 走訪執行；檔尾 `main();` 改為 `if (require.main === module) { main(); }`，使模組可安全被測試 `import`（DW-25）。兩者版號正確／`res.ok` 為真時的可見行為完全不變（`npm run i18n:check` 輸出前後一致）。

**檔案變更：**
- `index.html` -- `boot()` 新增 `!res.ok` 守衛，逐字比照 `loadCalendar()` 的既有風格。
- `src/i18n-check.ts` -- 匯入 `assertIndexSchemaVersion`；抽出並匯出 `readIndex()`（讀檔＋驗版＋回傳）；`main()` 改為匯出並呼叫 `readIndex()`；檔尾呼叫加上 `require.main === module` 守衛。
- `src/i18n-check.test.ts`（新檔）-- 四個測試：版號正確時 `readIndex()` 回傳不變；版號不符／缺失時皆丟出 `index.json schemaVersion is` 錯誤；`main()` 層級的順序測試證明版號不符時先於 `.products` 走訪（含一個磁碟上不存在對應檔案的假 product code）就中止。
- `src/schema.test.ts` -- （review pass 補測）`runPage()` 新增第三參數 `indexResponse`，讓 index.json 的 fetch stub 可覆寫 `ok`／`status`；新增 `'boot() renders nothing when the index.json fetch itself fails'` 測試，鎖住 DW-23 新守衛的行為。

**Review 發現分類：**
- patch：2（medium 1、low 1）—— 均已修補並驗證：`boot()` 新守衛補上 404 回歸測試（`src/schema.test.ts`）；`main()` 匯出處補上一行說明註解（`src/i18n-check.ts`）。
- defer：3（皆 low）—— `readIndex()`／`main()` 對讀檔／解析失敗沒有友善錯誤訊息（既有行為，非本次引入）；`main()` 走訪 `.products` 時對索引與商品檔不同步的情境仍是未包裝的 `ENOENT`（既有行為）；`loadCalendar()` 既有的 `!res.ok` 守衛同樣缺回歸測試，但屬本次變更前就存在的缺口，範圍與本次 patch 的 `boot()` 守衛測試不同。
- reject：6 —— 測試檔案內文引註的間接性（實際內容已自足，非真的誤導）、要求對 `main()` 補完整成功路徑端到端測試（超出 intent 明確界定的「補這條失敗路徑」範圍）、要求新錯誤訊息攜帶更多診斷資訊（與 intent／spec 明訂的「逐字比照 `loadCalendar()`」相牴觸）、要求更新檔案層級 header 註解（與 `readIndex()` 自身 JSDoc 重複）、要求在程式碼中額外註明本次刻意排除的範圍（spec 的 Never 區塊已載明，非程式碼義務）、`withFiles()` mock fallback 的假設性未來風險（與 `schema.test.ts` 既有寫法一致的既定慣例，非本次引入的新風險）。

**Follow-up review recommendation：** `false`。本輪 patch findings：high 0、medium 1、low 1；分數 = 3×1 + 1×1 = 4（< 5 門檻），且無 high 級別 patch，故不建議再排一輪 follow-up review。

**驗證執行：**
- `npm run typecheck` -- 通過，無錯誤。
- `npm test` -- 96/96 全數通過（含新增的 `src/i18n-check.test.ts` 四個測試與 `src/schema.test.ts` 新增的 `boot()` 404 測試）。
- `npm run i18n:check` -- 對本 repo 真實 `data/` 執行，輸出與變更前一致：`[zh-TW] 66 terms, 0 untranslated fragment(s)` / `[en] 62 terms, 0 untranslated fragment(s)` / `0 gap(s), 0 attraction(s) without an English name.`
- `git diff --stat`（against baseline_revision）-- `index.html`、`src/i18n-check.ts`、`src/schema.test.ts` 三個既有檔案的修改，加上 `src/i18n-check.test.ts` 一個新檔，符合預期（`src/schema.test.ts` 的補測是本輪 review pass 才加入，原 Verification 段落訂定時尚未預見）。

**殘餘風險：**
- `readIndex()`／`main()` 對讀檔／解析失敗（檔案不存在、非合法 JSON）仍拋出原始 `ENOENT`／`SyntaxError`，未比照 `schema-check.ts` 包成友善訊息（已記錄為 deferred，屬既有行為）。
- `main()` 走訪 `.products` 時，若 `index.json` 與 `data/products/*.json` 不同步（版號正確但缺對應商品檔），仍以未包裝的 `ENOENT` 中止（已記錄為 deferred，屬既有行為）。
- `loadCalendar()` 既有的 `!res.ok` 守衛仍無回歸測試，與本次修補的 `boot()` 守衛形狀相同但範圍外（已記錄為 deferred）。

---
title: 'DW-36：usj.ts 四處 !res.ok throw 統一改用 BLOCKED_BODY_SNIPPET_MAX 與 snippet() 正規化'
type: 'refactor'
created: '2026-08-23'
status: 'done'
baseline_revision: '0e6b1e4f5a676839e970c1526ae4ae0b0b471342'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      src/sources/usj.ts 的四個 !res.ok throw 點都對 await res.text() 沒有 catch 保護，
      body 讀取本身失敗時會讓原始 stream 例外取代原本意圖的 "X API returned {status}" 訊息。
    evidence: |-
      四處（fetchInventory/fetchTimeSlots/fetchProductInfo/fetchCatalogPage）在本次變更前
      就已經是 `await res.text()` 沒有 `.catch()`；DW-36 只重構了截斷/正規化邏輯，沒有改變
      這個讀取行為，屬於既有問題而非本次變更造成。limiter.ts 內 BlockedError 對應的讀取
      路徑已經有 `.catch(() => undefined)` 保護（見 limitedFetch 的 body 讀取），可作為修法參考。
    location: >-
      src/sources/usj.ts:174,262,374,448
    severity: low
  - summary: >-
      四個 API 錯誤訊息都沒有帶入呼叫當下的識別資訊（productCode/date/query），
      光看 log 行看不出是哪一個請求失敗。
    evidence: |-
      這是既有行為：變更前的三個 `.slice(0, 200)` 版本與 Calendar 的無截斷版本同樣沒有
      帶入 productCode/date，DW-36 的範圍只在統一截斷/正規化慣例，未涉及訊息應包含哪些
      欄位，因此不屬於本次變更造成的問題。
    location: >-
      src/sources/usj.ts:174,262,374,448
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.ts` 有四個 `!res.ok` throw 點各自處理 body 截斷：Variant／Product／Search 三處各自內嵌 `.slice(0, 200)` 魔術數字，Calendar 那一處完全沒有上限，可能把整頁 HTML 錯誤頁灌進公開的 GitHub Actions log。`src/limiter.ts` 已有具名常數 `BLOCKED_BODY_SNIPPET_MAX` 與內部 `snippet()` 正規化函式（控制字元剝除＋collapse＋截斷），但這四處都沒有套用，repo 目前存在兩套並行慣例。

**Approach:** 把 `limiter.ts` 的 `snippet` 改為具名匯出，讓 `usj.ts` 四個 throw 點都改用它做 body 正規化與截斷，取代各自的 `.slice(0, 200)` 或完全無截斷的寫法。

## Boundaries & Constraints

**Always:** 四個 throw 點（Calendar/Variant/Product/Search）統一使用同一個 `snippet()` 呼叫做 body 正規化＋截斷；截斷長度沿用 `BLOCKED_BODY_SNIPPET_MAX`（透過 `snippet()` 內部套用，不重新宣告字面值 200）；`snippet()` 回傳 `undefined` 時（空 body 或正規化後為空）訊息不得留下懸空冒號，比照 `BlockedError` 建構式已有的 `${snip ? `: ${snip}` : ''}` 慣例。

**Block If:** 若 `snippet()` 的簽名或行為與四個呼叫點的既有需求衝突（例如需要保留跨行內容），HALT，blocking condition 為對應描述。

**Never:** 不新增第二套截斷／正規化邏輯；不更動 `BLOCKED_BODY_SNIPPET_MAX` 的數值；不變更 `BlockedError` 類別本身的行為；不觸碰 `fetchSlotStock`（304 行）等未在 ledger 範圍內的函式。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Variant/Product/Search 長 body | `!res.ok`，body 超過 200 字元的文字/HTML | 拋出的 Error message 只含正規化＋截斷後的 snippet（≤ `BLOCKED_BODY_SNIPPET_MAX` 字元） | 無例外，Error 照常拋出 |
| Calendar 長 body（現況無上限） | `!res.ok`，body 為整頁 HTML 錯誤頁 | 拋出的 Error message 同樣被截斷，不再把整頁 HTML 寫入 log | 無例外，Error 照常拋出 |
| body 為空字串或無法讀取 | `!res.ok`，`res.text()` 回傳空字串 | Error message 不含懸空的 `: ` 後綴 | 無例外，Error 照常拋出 |

</intent-contract>

## Code Map

- `src/limiter.ts:47` -- `BLOCKED_BODY_SNIPPET_MAX = 200`，已匯出，維持不變。
- `src/limiter.ts:84-95` -- `snippet()`，目前是模組內部 `const`（未匯出）。改成 `export const snippet`，簽名與行為完全不變：接受 `string | undefined`，回傳正規化＋截斷後的 `string | undefined`。
- `src/limiter.ts:120-122` -- `BlockedError` 建構式已示範目標慣例：`` `...${snip ? `: ${snip}` : ''}` ``，四個 throw 點應比照此寫法。
- `src/sources/usj.ts:12` -- 既有 import：`import { BlockedError, budgetExhausted, limitedFetch, mapLimit } from '../limiter';`，需加入 `snippet`。
- `src/sources/usj.ts:155-174`（`fetchInventory`）-- Calendar API `!res.ok` throw 在第 174 行：`` throw new Error(`Calendar API returned ${res.status}: ${await res.text()}`); ``，目前完全無截斷。
- `src/sources/usj.ts:249-261`（`fetchTimeSlots`）-- Variant API `!res.ok` throw 在第 261 行：`` throw new Error(`Variant API returned ${res.status}: ${(await res.text()).slice(0, 200)}`); ``。
- `src/sources/usj.ts:364-372`（`fetchProductInfo`）-- Product API `!res.ok` throw 在第 372 行，同上魔術數字寫法。
- `src/sources/usj.ts:437-445`（`fetchCatalogPage`）-- Search API `!res.ok` throw 在第 445 行，同上魔術數字寫法。

## Tasks & Acceptance

**Execution:**
- `src/limiter.ts` -- 把第 84 行 `const snippet = (...)` 改為 `export const snippet = (...)` -- 讓 usj.ts 四處可重用同一套正規化＋截斷邏輯，而不是各自維護第二套慣例
- `src/sources/usj.ts` -- import 行（12 行）加入 `snippet`，與既有 `BlockedError, budgetExhausted, limitedFetch, mapLimit` 同一行 -- 供四個 throw 點使用
- `src/sources/usj.ts:174` -- Calendar API throw 改為先 `const snip = snippet(await res.text());` 再 `` throw new Error(`Calendar API returned ${res.status}${snip ? `: ${snip}` : ''}`); `` -- 補上原本缺少的截斷上限
- `src/sources/usj.ts:261` -- Variant API throw 比照上一項改法，移除內嵌 `.slice(0, 200)`
- `src/sources/usj.ts:372` -- Product API throw 比照上一項改法，移除內嵌 `.slice(0, 200)`
- `src/sources/usj.ts:445` -- Search API throw 比照上一項改法，移除內嵌 `.slice(0, 200)`

**Acceptance Criteria:**
- Given Variant/Product/Search API 回傳 `!res.ok` 且 body 超過 200 字元，when 對應的 fetch 函式（`fetchTimeSlots`／`fetchProductInfo`／`fetchCatalogPage`）執行，then 拋出的 Error message 只包含正規化＋截斷後的 snippet，不再有獨立的 `.slice(0, 200)` 字面值
- Given Calendar API（`fetchInventory`）回傳 `!res.ok` 且 body 為完整 HTML 錯誤頁，when 該函式執行，then 拋出的 Error message 同樣被截斷到 `BLOCKED_BODY_SNIPPET_MAX` 內，不再把整頁 HTML 塞進訊息
- Given 四個呼叫點中任一個遇到空字串或正規化後為空的 body，when 拋出 Error，then message 不含懸空冒號（即不會出現 `returned 500: ` 這種結尾多餘冒號的情況）
- Given `src/limiter.ts` 的 `snippet` 具名匯出，when grep `src/sources/usj.ts` 的 `.slice(0, 200)`，then 找不到任何殘留

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 2 (low 2)
- reject: 5 (low 5)
- addressed_findings:
  - `[medium]` `[patch]` 四個 `!res.ok` throw 點的 `snip ? ... : ''` 三元運算式沒有任何測試驗證，反轉的三元運算式不會被既有測試發現。已在 `src/sources/usj-fetchproduct-blocking.test.ts` 新增兩個測試（長 body 正規化＋截斷、空 body 無懸空冒號），並以人工反轉三元運算式驗證新測試會失敗，再改回並確認全數通過。
  - `[low]` `[patch]` `src/limiter.ts` 的 `snippet`／`BLOCKED_BODY_SNIPPET_MAX` JSDoc 仍只描述「blocked 回應的 body」，未反映現在也被 `usj.ts` 四個一般性 `!res.ok` throw 共用。已更新註解說明兩種用途。

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 無型別錯誤（`snippet` 匯出後型別與呼叫點相容）
- `grep -n "slice(0, 200)" src/sources/usj.ts` -- expected: 無輸出（四處魔術數字已全部移除）
- 若專案已有對應測試套件（`npm test` 或等效指令），執行並確認全數通過

## Auto Run Result

**實作摘要：** 把 `src/limiter.ts` 內部未匯出的 `snippet()` 改為具名匯出，並讓 `src/sources/usj.ts` 四個 `!res.ok` throw 點（Calendar/`fetchInventory`、Variant/`fetchTimeSlots`、Product/`fetchProductInfo`、Search/`fetchCatalogPage`）都改用 `snippet()` 做 body 正規化＋截斷，取代 Variant/Product/Search 原本各自的 `.slice(0, 200)` 字面值，並補上 Calendar 原本完全缺少的截斷上限。統一比照 `BlockedError` 已有的 `${snip ? `: ${snip}` : ''}` 慣例，避免空 body 留下懸空冒號。

**變更檔案：**
- `src/limiter.ts` -- `snippet` 由模組內部 `const` 改為 `export const`；更新其與 `BLOCKED_BODY_SNIPPET_MAX` 的 JSDoc，反映現在同時被 `BlockedError` 與 `usj.ts` 一般性 API 錯誤共用（審查後修補）
- `src/sources/usj.ts` -- import 加入 `snippet`；四個 throw 點改用 `snippet()` 正規化＋截斷
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 新增兩個測試，涵蓋 Calendar API 長 body 正規化＋截斷、空 body 無懸空冒號（審查後修補）

**審查發現分類：**
- Patch（已修補）：2 項 -- (1) [medium] 四個 throw 點的 snippet 三元運算式缺少測試覆蓋，已新增測試並以人工反轉三元運算式驗證測試有效；(2) [low] `limiter.ts` 的 JSDoc 未反映 `snippet()` 現在也用於非 blocked 的一般錯誤，已更新註解。
- Defer（記錄於 frontmatter `deferred`）：2 項，皆為既有問題、非本次變更造成 -- 四處 `await res.text()` 未做 `.catch()` 保護；四處錯誤訊息未帶入 productCode/date 等請求識別資訊。
- Reject（略過）：5 項，皆屬風格建議或已被既有慣例滿足（例如四處程式碼重複可抽共用函式、`snip` 變數名與 `snippet` 函式名相近但與 `BlockedError` 既有慣例一致、缺少行內註解說明正規化理由、行為改變未在 commit 訊息中特別註記、缺少「此路徑只會看到 3xx/4xx」的說明註解）。

**Follow-up review recommendation:** `false`（本輪 patch 為 1 個 medium + 1 個 low，`3×medium + 1×low = 4`，未達 5 的門檻，且無 high 嚴重度項目）。

**驗證：**
- `npx tsc --noEmit` -- 無型別錯誤
- `grep -n "slice(0, 200)" src/sources/usj.ts` -- 無殘留
- `npm test` -- 101/101 全數通過（含新增的 2 個測試）

**殘留風險：** 無新增風險。已記錄的 2 項 defer 為既有問題，留待後續獨立處理。

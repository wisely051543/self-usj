---
title: 'DW-35：fetchSlotStock 的 mapLimit 補上與 listProducts 相同的封鎖旗標'
type: 'refactor'
created: '2026-08-23'
baseline_revision: 'cffab53bdfb34e86e2dd347832964ccc414a1fed'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.ts:313` 的 `fetchSlotStock` 以 `mapLimit` 併發送出庫存批次，其 catch 區塊只在 `:333` 對 `BlockedError` 做 `throw err;`，並未設任何共享旗標——其餘 worker 在封鎖浮現後仍會繼續向已知封鎖的來源送出新批次。這與 DW-8/9/10（`spec-dw-8-9-10-block-abort-path-hardening.md`）已修好的 `listProducts`（`:453-476`）是完全相同的併發缺口，當初刻意排除在該次範圍外並記為 deferred（DW-35）。

**Approach:** 套用與 `listProducts` 逐字相同的修法：在 `mapLimit(batches, ...)` 之前宣告 `let blocked = false;`，callback 首行 `if (blocked) return;`，catch 內偵測到 `BlockedError` 時先 `blocked = true;` 再 `throw err;`。新增一支測試檔比照既有的 `usj-blocking.test.ts` DW-9 測試寫法，鎖住「封鎖浮現後不再開新批次」的行為。

## Boundaries & Constraints

**Always:**
- 旗標僅阻擋「尚未發起」的批次；已在途的請求無法取消，屬已知且接受的偵測延遲（與 DW-9 相同前提）。
- 非 `BlockedError` 的批次失敗維持原行為：`console.error` 記錄後略過該批次，不設旗標，其餘批次照常進行。
- `mapLimit` 的公開簽章與語意不得變更（`listProducts` 與 `fetchInventory` 的呼叫者共用同一個 helper）。
- 新測試以 `node:test` 撰寫，沿用 `src/test-support.ts` 的 `settle`／`flush` 與 mocked timers 慣例，並比照 `usj-blocking.test.ts` 的「settle 後仍需繼續 drain 數個 tick 才斷言無新請求」寫法——一次性斷言在旗標被移除時仍會誤判通過。
- `npm run typecheck` 與 `npm test` 均須通過。

**Never:**
- 不改變封鎖情境下 `fetchProduct`／round 的可觀察行為或 exit 語意。
- 不引入 `AbortController` 取消在途請求。
- 不改動 `STOCK_BATCH_SIZE`、速率／並行常數，或 `fetchInventory`／`limitedFetch` 的公開簽章。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 批次期間偵測到封鎖 | 待送批次數遠多於併發度（`CONCURRENCY=4`），其中一批持續回應 5xx（含重試耗盡） | `fetchSlotStock` 以 `BlockedError` reject；封鎖浮現後不再對任何新批次發出請求，`settle` 後續 drain 數個 tick 仍不出現新批次 | 錯誤原樣向上傳播（經 `fetchProduct` 冒出） |
| 批次遇一般錯誤 | 某批次丟出非 `BlockedError`（如 404） | 記錄後略過該批次，其餘批次照常完成；該批次內的 slot 保留 `availableUnits: null` | `console.error` 一行，不中止其餘批次 |

</intent-contract>

## Code Map

- `src/sources/usj.ts:304-339` -- `fetchSlotStock`：待修改函式本體。`:313` 為 `mapLimit(batches, ...)` 呼叫；`:332-336` 為既有 catch 區塊，`:333` 是 `if (err instanceof BlockedError) throw err;`（緊接在 try 之後，尚無旗標）。
- `src/sources/usj.ts:453-481` -- `listProducts` 的旗標寫法（DW-9 已完成的修法），逐字複製其結構：`let blocked = false;` 宣告於 `mapLimit` 之前、callback 首行 `if (blocked) return;`、catch 內先 `blocked = true;` 再 `throw err;`。
- `src/sources/usj.ts:155-179` -- `fetchInventory`：`fetchSlotStock` 內每個批次呼叫的對象，也是產品自身行事曆查詢（`fetchProduct` 內 `:562`）共用的函式；兩者都打 `fetchCalendarDatesWithPriceAndInventory` 端點，新測試需以 request body 的 `partNumber` 而非呼叫順序區分兩者。
- `src/sources/usj.ts:249-294` -- `fetchTimeSlots`：決定 `DateSlot.timeSlots`（即 `fetchSlotStock` 的 pairs 來源）的函式；新測試需 mock `getExpressPassVariantDetails` 回傳足量 variant（見下方測試設計），才能讓 `pairs.length` 遠大於 `STOCK_BATCH_SIZE * CONCURRENCY`。
- `src/sources/usj.ts:518-657` -- `fetchProduct`：唯一呼叫 `fetchSlotStock(pending)` 的地方（`:652`），新測試透過此公開 API 觸發整條路徑，與 `usj-fetchproduct-blocking.test.ts` 既有 `site: 'stock'` 案例作法一致。
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 既有測試已涵蓋「stock 批次第一批即封鎖 → `fetchProduct` reject with `BlockedError`」；本次不重複此斷言，新測試只補「封鎖後不再開新批次」與「一般批次失敗不影響其他批次」兩項。
- `src/sources/usj-blocking.test.ts:56-116` -- DW-9 對應的「stops opening new dates」測試，為新測試的結構藍本（`settle` 後手動 tick 迴圈驗證無新請求）。
- `src/limiter.ts:16,213-222` -- `CONCURRENCY = 4` 與 `mapLimit` 實作：worker 從共享游標依序取下一項，全域速率門檻序列化實際發request 的時序，決定「封鎖批次的重試視窗內，其他 worker 能搶到多少新批次」的邊界。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.ts` -- 在 `fetchSlotStock` 的 `mapLimit(batches, ...)` 前加 `let blocked = false;`，callback 首行加 `if (blocked) return;`，catch 內把 `if (err instanceof BlockedError) throw err;` 改為 `if (err instanceof BlockedError) { blocked = true; throw err; }` -- 封鎖偵測後不再對已知封鎖來源發起新批次請求，補齊與 `listProducts` 相同的併發缺口修正。
- 新增測試檔 `src/sources/usj-slotstock-blocking.test.ts` -- 透過 `usjSource.fetchProduct` 建構單一可用日期、遠多於 `CONCURRENCY * STOCK_BATCH_SIZE` 筆 variant（時段），使 `fetchSlotStock` 產生遠多於 `CONCURRENCY` 的批次數；mock `fetchCalendarDatesWithPriceAndInventory`，以 request body 第一筆 `partNumber` 是否等於第一個批次的第一個 variant code 來判斷是否為「被封鎖的那一批」，該批持續回 5xx、其餘批次成功；另一測試讓某一批次回一般錯誤（如 404）驗證不中止其餘批次 -- 鎖住「封鎖後停止開新批次」與「一般錯誤不擴大」兩個行為，防止旗標被移除或誤設時測試假性通過。

**Acceptance Criteria:**
- Given 待送批次數遠多於 `CONCURRENCY`、其中一批持續回應 5xx 直到重試耗盡，when `usjSource.fetchProduct(...)` 執行至 `fetchSlotStock`，then 該呼叫以 `BlockedError` reject 且已送出的批次數少於批次總數的一半（非全數送出）。
- Given 封鎖已浮現且 `fetchProduct` 已 reject，when 測試繼續驅動 mocked timer 多個 tick，then 不再出現新的批次請求。
- Given 一般（非 `BlockedError`）批次失敗，when 該批次執行完成，then 其餘批次照常進行、該批次內 slot 的 `availableUnits` 維持 `null`，且不影響其他批次的數值。
- Given `src/sources/usj.ts` 以外的檔案，when 本次變更完成，then 除新增的測試檔外未被改動。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 12
- addressed_findings:
  - none

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無錯誤結束
- `npm test` -- expected: 全數通過，無 unhandledRejection、無測試逾時／掛住
- `git diff --stat` -- expected: 僅 `src/sources/usj.ts` 與新增的 `src/sources/usj-slotstock-blocking.test.ts` 兩個檔案有變動

## Auto Run Result

**摘要：** 為 `fetchSlotStock`（`src/sources/usj.ts`）的 `mapLimit` 補上與 `listProducts` 完全相同的封鎖旗標寫法：`mapLimit` 前宣告 `let blocked = false;`，callback 首行 `if (blocked) return;`，catch 內偵測到 `BlockedError` 時先 `blocked = true;` 再 `throw err;`。補齊 DW-35 記錄的併發缺口——封鎖浮現後，其餘 worker 不再對已知封鎖來源發起新的庫存批次請求。

**變更檔案：**
- `src/sources/usj.ts` -- `fetchSlotStock` 內加入共享 `blocked` 旗標與 callback 首行檢查（+14 -1 行）。
- `src/sources/usj-slotstock-blocking.test.ts`（新增）-- 兩支測試：(1) 遠多於 `CONCURRENCY` 的批次數下，首批持續封鎖時 `fetchProduct` 以 `BlockedError` reject，且 drain 數個 tick 後仍不再開新批次；(2) 一般（非 `BlockedError`）批次失敗僅該批次 slot 保留 `availableUnits: null`，其餘批次照常完成。

**Review 發現分類：** 4 個 review 子代理（blind-hunter、edge-case-hunter、verification-gap、intent-alignment）平行審查本次 diff。blind-hunter 提出 12 項發現，逐一評估後全數 `reject`：多數涉及明確超出本次 intent 邊界的建議（如將旗標邏輯抽成共用 helper——intent 的 Approach 明確指定「逐字複製」`listProducts` 的寫法；或修改 deferred-work 台帳——呼叫方明確指示不得修改），其餘為與現有測試慣例一致的既有作法（如僅測試首批封鎖的情境，與 `usj-blocking.test.ts` 既有 DW-9 測試相同）或純文件性建議，且 `nullCount` 斷言已隱含涵蓋批次邊界的 off-by-one 疑慮。edge-case-hunter 與 verification-gap 均回報零發現（verification-gap 並實際還原修法、重跑測試驗證新測試會如預期失敗，再復原）。intent-alignment 稽核確認 diff 忠實實作衍生規格的兩個驗收情境，且未越界觸及同檔案的其他 deferred 項目（如 DW-36）。無 `patch`、`defer` 或 `bad_spec` 項目。

**Follow-up review 建議：** `false`（本輪 `patch` 計數為 0，分數 0）。

**驗證：**
- `npm run typecheck` -- 通過，無錯誤。
- `npm test` -- 全數 99 項測試通過，無 unhandledRejection、無逾時。
- `git diff --stat` -- 僅 `src/sources/usj.ts` 與新增的 `src/sources/usj-slotstock-blocking.test.ts` 兩檔案變動，與規格相符。

**殘留風險：** 無新增風險。與既有 DW-9 測試相同的既知限制：新測試的「批次數過半未開」門檻依賴目前的重試延遲（1s/2s/4s）與速率常數，若日後調整這些常數，門檻可能需要重新校準（`usj-blocking.test.ts` 的對應測試已有相同前提）。

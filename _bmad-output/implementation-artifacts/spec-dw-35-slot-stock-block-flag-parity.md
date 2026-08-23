---
title: 'DW-35：fetchSlotStock 的 mapLimit 補上與 listProducts 相同的封鎖旗標'
type: 'refactor'
created: '2026-08-23'
baseline_revision: '971655c952279f43767855303339fe0b7d1cec6a'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.ts:313` 的 `fetchSlotStock` 以 `mapLimit` 併發送出庫存批次，其中一批丟出 `BlockedError` 後只在 `:333` 傳播，其餘 worker 仍會繼續對已知封鎖的來源送出新批次——與 DW-8/9/10（`spec-dw-8-9-10-block-abort-path-hardening.md`）已修好的 `listProducts` 完全相同的併發缺口，當時刻意排除在範圍外並記為 deferred（DW-35）。

**Approach:** 套用與 `listProducts`（`src/sources/usj.ts:463-476`）完全相同的修法：在 `mapLimit(batches, ...)` 之前宣告共享 `blocked` 旗標，callback 首行檢查該旗標為真則直接 return（不送新批次），catch 內辨識到 `BlockedError` 時先設旗標再 rethrow。

## Boundaries & Constraints

**Always:**
- 旗標僅阻擋「尚未發起」的批次；已在途的請求無法取消，屬已知且接受的偵測延遲（與 DW-9 相同前提）。
- 非 `BlockedError` 的批次失敗維持原行為：`console.error` 記錄後略過該批次，不設旗標，其餘批次照常進行。
- `mapLimit` 的公開簽章與語意不得變更（`listProducts` 與另一呼叫點 `fetchInventory` 共用）。
- 新增測試以 `node:test` 撰寫，沿用 `src/test-support.ts` 的 `settle`／`flush` 與 mocked timers 慣例，並比照 `src/sources/usj-blocking.test.ts` 既有 DW-9 測試「settle 後仍需繼續 drain 數個 tick 才斷言無新請求」的寫法（一次性斷言會在旗標被移除時仍誤判通過）。
- `npm run typecheck` 與 `npm test` 均須通過。

**Never:**
- 不改變封鎖情境下 `fetchProduct`／round 的可觀察行為或 exit 語意。
- 不引入 `AbortController` 取消在途請求。
- 不改動 `STOCK_BATCH_SIZE`、速率／並行常數，或 `fetchInventory`／`limitedFetch` 的公開簽章。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 批次期間偵測到封鎖 | 待送批次數遠多於併發度（CONCURRENCY=4），其中一批持續 5xx | `fetchSlotStock` 以 `BlockedError` reject；封鎖浮現後不再對任何新批次發出請求，settle 後續 drain 數個 tick 仍不出現新批次 | 錯誤原樣向上傳播（經 `fetchProduct` 冒出） |
| 批次遇一般錯誤 | 某批次丟出非 `BlockedError` | 記錄後略過該批次，其餘批次照常完成，該批次內的 slot 保留 `availableUnits: null` | `console.error` 一行，不中止 |

</intent-contract>

## Code Map

- `src/sources/usj.ts:304-339` -- `fetchSlotStock`：待修改函式本體；`:313` 為 `mapLimit(batches, ...)` 呼叫，`:333` 為既有 `if (err instanceof BlockedError) throw err;`（catch 內，緊接在 try 區塊後）。
- `src/sources/usj.ts:453-481` -- `listProducts` 的旗標寫法（已完成的 DW-9 修法），逐字複製其結構：`let blocked = false;` 宣告於 `mapLimit` 之前、callback 首行 `if (blocked) return;`、catch 內先 `blocked = true;` 再 `throw err;`。
- `src/sources/usj.ts:652` -- `fetchProduct` 內對 `fetchSlotStock(pending)` 的唯一呼叫點，用於理解測試如何從公開 API 觸發此路徑。
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 既有測試已涵蓋「stock 批次第一批即封鎖 → `fetchProduct` reject with `BlockedError`」（`CASES` 中 `site: 'stock'`）；本次不重複此斷言，只新增「封鎖後不再開新批次」的測試。
- `src/sources/usj-blocking.test.ts:56-116` -- DW-9 對應的「stops opening new dates」測試，為新測試的結構藍本（settle 後手動 tick 迴圈驗證無新請求）。
- `src/limiter.ts:16` -- `CONCURRENCY = 4`，新測試需要遠多於此數的批次數才能有意義的邊界斷言。
- `src/sources/usj.ts:66` -- `STOCK_BATCH_SIZE = 100`，決定 slot 數換算批次數的除數。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.ts` -- 在 `fetchSlotStock` 的 `mapLimit(batches, ...)` 前加 `let blocked = false;`，callback 首行加 `if (blocked) return;`，catch 內 `if (err instanceof BlockedError) { blocked = true; throw err; }`（取代原本單行 `if (err instanceof BlockedError) throw err;`）-- 封鎖偵測後不再對已知封鎖來源發起新批次請求，補齊與 `listProducts` 相同的併發缺口修正。
- 新增測試檔 `src/sources/usj-slotstock-blocking.test.ts` -- 透過 `usjSource.fetchProduct` 建構單一可用日期、大量 variant（時段）使 `fetchSlotStock` 產生遠多於 `CONCURRENCY` 的批次數；mock `fetchCalendarDatesWithPriceAndInventory` 使第一個庫存批次持續 5xx、其餘批次成功；斷言 `fetchProduct` reject with `BlockedError`，且已送出的批次數不超過批次總數一半，並在 settle 後續 drain 數個 tick 仍不出現新批次 -- 鎖住「封鎖後停止開新批次」的行為，防止旗標被移除後測試假性通過。

**Acceptance Criteria:**
- Given 待送批次數遠多於 `CONCURRENCY`、其中一批持續回應 5xx，when `usjSource.fetchProduct(...)` 執行至 `fetchSlotStock`，then 該呼叫以 `BlockedError` reject 且已送出的批次數少於批次總數（非全數送出）。
- Given 封鎖已浮現且 `fetchProduct` 已 reject，when 測試繼續驅動 mocked timer 多個 tick，then 不再出現新的批次請求。
- Given 一般（非 `BlockedError`）批次失敗，when 該批次執行完成，then 其餘批次照常進行、該批次內 slot 的 `availableUnits` 維持 `null`，且不影響其他批次。
- Given `src/sources/usj.ts` 以外的檔案，when 本次變更完成，then 除新增的測試檔外未被改動。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無錯誤結束
- `npm test` -- expected: 全數通過，無 unhandledRejection、無測試逾時／掛住
- `git diff --stat` -- expected: 僅 `src/sources/usj.ts` 與新增的 `src/sources/usj-slotstock-blocking.test.ts` 兩個檔案有變動

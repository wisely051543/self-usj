---
title: 'usj.ts 四個錯誤訊息點的讀取保護與識別資訊補強'
type: 'bugfix'
created: '2026-08-23'
status: 'done'
baseline_revision: 'b90370c3a16e7c53db4322a1fb7c7dfd0862894f'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.ts` 的四個 `!res.ok` 拋錯點（`fetchInventory`/`fetchTimeSlots`/`fetchProductInfo`/`fetchCatalogPage`，行 174/262/374/448）對 `await res.text()` 沒有 `.catch()` 保護，讀取失敗時原始 stream 例外會取代 "X API returned {status}" 訊息（DW-50）；且訊息都沒有帶入呼叫當下的識別資訊（productCode/date/query），log 行看不出是哪個請求失敗（DW-51）。

**Approach:** 比照 `src/limiter.ts` 既有的 `.catch(() => undefined)` 保護樣式，為四個站點的 `res.text()` 補上讀取保護；並依各站點既有作用域內已有的識別變數（不新增查詢邏輯）在錯誤訊息中補上識別資訊。

## Boundaries & Constraints

**Always:** 沿用 `snippet()` 既有的 `string | undefined` 簽名與「空/缺失視為同一種『無片段』答案」慣例；四個站點都要同時處理 DW-50 與 DW-51，因為兩者改動同幾行程式碼。

**Block If:** 若某站點在既有作用域內找不到任何可用的識別變數（未發生 -- 四站點皆有 `queries`/`productCode`+`date`/`productCode`+`lang`/`date` 可用）。

**Never:** 不擴大範圍去改動 `limiter.ts` 的 `BlockedError` 路徑（該路徑已有 `.catch(() => undefined)` 保護）；不引入新的追蹤參數或改變函式簽名。

</intent-contract>

## Code Map

- `src/sources/usj.ts:172-178` -- `fetchInventory`：`queries: InventoryQuery[]` 在作用域內，用 `queries.length` 與 `queries[0].startDate`..`queries[queries.length-1].endDate` 組成識別片段。
- `src/sources/usj.ts:260-266` -- `fetchTimeSlots(productCode, date, names)`：`productCode`、`date` 已在作用域內。
- `src/sources/usj.ts:372-378` -- `fetchProductInfo(productCode, names, lang)`：`productCode`、`lang` 已在作用域內。
- `src/sources/usj.ts:446-452` -- `fetchCatalogPage(date)`：`date` 已在作用域內（`query` 是由 `date` 派生的字串，不重複帶入）。
- `src/limiter.ts:88-99` -- `snippet(body: string | undefined)`：已接受 `undefined`，`.catch(() => undefined)` 後可直接傳入不需額外判斷。
- `src/limiter.ts:203,208` -- `limitedFetch` 內既有的 `await res.text().catch(() => undefined)` 參考樣式。
- `src/sources/usj-fetchproduct-blocking.test.ts:246-286` -- 既有測試斷言 `Calendar API returned 404...` 訊息全文，訊息改動後需同步更新期望值。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.ts` -- 四個 `!res.ok` 區塊改為 `snippet(await res.text().catch(() => undefined))`，並依上列 Code Map 在錯誤訊息加入識別片段 -- 解決 DW-50（讀取失敗不再取代原訊息）與 DW-51（log 可辨識是哪個請求）。
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 更新兩個既有斷言以符合 `fetchInventory` 新訊息格式（含 `for 1 query (2026-09-01..2027-03-01)` 片段） -- 保持既有 body-snippet 行為測試綠燈。

**Acceptance Criteria:**
- Given `fetchInventory`/`fetchTimeSlots`/`fetchProductInfo`/`fetchCatalogPage` 收到非 ok 回應且 `res.text()` 本身 reject，when 拋錯，then 訊息仍是 "X API returned {status}..." 而非原始 stream 例外。
- Given 任一站點收到非 ok 回應，when 拋錯，then 訊息包含該站點作用域內可得的識別資訊（productCode/date/queries 摘要），不需額外查閱呼叫堆疊即可辨識是哪個請求。
- Given `res.text()` 成功但回應為空字串，when 拋錯，then 訊息不留下懸空的 `: ` 後綴（沿用既有 `snippet()` 慣例）。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0high, medium 3medium, low 1low)
- defer: 0
- reject: 6: (high 0high, medium 0medium, low 6low)
- addressed_findings:
  - `[medium]` `[patch]` DW-50 的 `.catch(() => undefined)` 保護在四個站點都無測試證明「讀取失敗仍退回原狀態訊息」；新增 Calendar 與 Variant 兩站點的讀取失敗回歸測試。
  - `[medium]` `[patch]` DW-51 的識別資訊只有 Calendar 站點的訊息內容被斷言，Variant/Product/Search 三站點皆無測試；新增 info/names/slots 三個 log 內容斷言，以及 Search API 的一行斷言擴充。
  - `[medium]` `[patch]` `fetchProduct` 對 `fetchInventory` 的單筆直接呼叫（無其他 catch 包裹）在原訊息格式下完全沒有 productCode，是四站點中識別資訊最弱的一處；改為優先具名 partNumber（≤3 筆直接列出）。
  - `[low]` `[patch]` Calendar 批次呼叫（`fetchSlotStock`）訊息只有筆數與日期範圍、看不出是哪些 variant code；同一次 partNumber 具名修訂一併涵蓋。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0high, medium 3medium, low 0low)
- defer: 0
- reject: 9: (high 0high, medium 0medium, low 9low)
- addressed_findings:
  - `[medium]` `[patch]` `fetchInventory` 的日期範圍片段直接取 `queries[0].startDate`/`queries[last].endDate`，但批次呼叫（`fetchSlotStock`）刻意把最新日期排最前（見 `usj.ts` `targets` 組裝處的註解），導致範圍可能反向或不具代表性；改為對批次內所有 `startDate`/`endDate` 取排序後的最小/最大值。
  - `[medium]` `[patch]` DW-50 的讀取失敗保護只有 Calendar 與 Variant 兩站點有回歸測試，Product 與 Search 兩站點的 `.catch(() => undefined)` 保護完全無測試證明；於 `usj-fetchproduct-blocking.test.ts` 新增 Product API 讀取失敗測試，於 `usj-blocking.test.ts` 新增 Search API 讀取失敗測試。
  - `[medium]` `[patch]` `fetchInventory` 新增的 partNumber 具名/計數三分支邏輯，所有既有測試都只用單一 query 驅動，只驗證過 1 筆的分支，2-3 筆具名與 >3 筆計數回退兩個分支完全未被任何斷言檢查過（既有的批次失敗測試只斷言外層 `stock batch` 字樣，不檢查內層訊息內容）；新增一個 4 個 variant code 的批次失敗測試，直接斷言訊息落在 `4 parts` 計數分支且不外洩個別 variant code。
- rejected_findings（noise，均為 low，理由簡述）:
  - `≤3` 門檻缺乏具名常數/註解說明 -- 程式碼已有解釋性註解，主張與程式碼現況不符。
  - 去重後的 `parts` 未排序，log 行順序不穩定 -- 純風格瑕疵，不影響可辨識性。
  - `partsDesc` 的 `parts.length === 0` 分支在目前呼叫路徑下不可達 -- 屬無害防禦性寫法，非缺陷。
  - `fetchInventory([])` 目前無任何呼叫者傳空陣列 -- 同上，防禦性寫法保留合理。
  - Product/Variant/Search 三站點新增的識別資訊與呼叫端既有的 log 前綴（如 `${entry.code} product info failed`）重複 -- 意圖合約的 Always 條款明文要求四站點都要補上識別資訊，不因呼叫端另有前綴而排除。
  - Calendar 批次訊息與 `fetchSlotStock` 外層 log 的日期範圍重複計算 -- 同上，屬合約明文要求下的預期重疊，且外層 span 屬既有程式碼、非本次改動範圍。
  - 四個拋錯站點的 `snippet(await res.text().catch(...))` 樣式重複、建議抽共用 helper -- 屬既有程式碼原本就重複的樣式，本次改動未擴大此重複的性質，屬風格建議而非缺陷。
  - 僅 Calendar 站點有「空 body 不留懸空冒號」的專屬測試，其餘三站點缺同款測試 -- 四站點共用同一個三元運算式，機制已由 Calendar 測試驗證，邊際風險低，非本輪必要修補範圍。
  - `"${parts.length} parts"` 中的 "parts" 一詞對讀 log 的人而言語意不夠明確 -- 在該行前後文（Calendar API 錯誤訊息）下已可判讀，非缺陷等級的問題。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0high, medium 2medium, low 0low)
- defer: 0
- reject: 13: (high 0high, medium 0medium, low 13low)
- addressed_findings:
  - `[medium]` `[patch]` `fetchInventory` 批次日期範圍的新測試（4-parts 分支）只用正則檢查兩個日期形狀，未鎖定順序；`fetchSlotStock` 的呼叫順序把最新日期排最前，若排序邏輯被移除，訊息會反向（如 `09-02..09-01`）而測試仍會通過。改為直接斷言完整字串 `for 4 parts (2026-09-01..2026-09-02)`，鎖定遞增順序。
  - `[medium]` `[patch]` `partsDesc` 的 `≤3` 具名分支（逗號分隔列出 partNumber）從未被任何測試驅動到 -- 既有測試只覆蓋 1 筆與 4 筆兩個極端。新增一個 2 個 variant code 的批次失敗測試，斷言訊息為 `for VAR0, VAR1 (...)` 而非計數形式。
- rejected_findings（noise，均為 low，理由簡述）:
  - Product/Variant API 新增的識別資訊與呼叫端既有 log 前綴（如 `${entry.code} product info failed`）重複 -- 與上一輪已駁回的相同主張範圍重疊（上一輪已涵蓋 Product/Variant/Search 三站點），意圖合約明文要求四站點都要補上識別資訊。
  - `fetchInventory` 批次訊息的日期範圍與 `fetchSlotStock` 外層 log 重複計算 -- 上一輪已駁回的同一主張。
  - 四個拋錯站點識別資訊的措辭不一致（`for X on Y` / `for X (Y)` / `for X (Y..Z)` / `for X`）-- 純風格瑕疵，各訊息前綴（Calendar/Variant/Product/Search）已可區分語意，非缺陷。
  - 去重後的 `parts` 未排序、log 行順序不穩定 -- 上一輪已駁回的同一主張，純風格瑕疵。
  - `partsDesc`/`dates` 的空陣列分支在目前呼叫路徑下不可達 -- 上一輪已駁回的同一主張，防禦性寫法合理。
  - 四個拋錯站點 `snippet(await res.text().catch(...))` 樣式重複、建議抽共用 helper -- 上一輪已駁回的同一主張。
  - 僅 Calendar 站點有「空 body 不留懸空冒號」的專屬測試 -- 上一輪已駁回的同一主張。
  - 4-parts 測試的 `inventoryCalls` 計數器缺乏註解說明其對應 `fetchProduct` 呼叫順序 -- 主張與程式碼現況不符，該分支上已有解釋性註解（`// The product's own calendar lookup answers normally...`）。
  - `≤3` 門檻缺乏具名常數 -- 上一輪已駁回的同一主張，程式碼已有解釋性註解。
  - `review_loop_iteration` 停在 0 卻已跑過多輪 review -- 對欄位語意理解有誤：該欄位只在 `bad_spec` 迴圈時遞增，本故事兩輪 `bad_spec` 皆為 0，維持 0 為正確狀態。
  - `status: done` 與 `followup_review_recommended: true` 並存視為矛盾 -- 此為既定機制本身：`done` + `followup_review_recommended: true` 正是觸發本輪 follow-up review 的條件，非缺陷。
  - Design Notes 記載第一輪曾出現日期範圍反向的邏輯瑕疵 -- 該瑕疵已於第二輪修正並有測試鎖定，屬歷史記錄非本輪程式碼現況的缺陷。
  - Edge Case Hunter 與 Intent Alignment Auditor 兩層審查對本輪 diff 均無新增缺陷可回報。

## Design Notes

`fetchInventory` 的識別資訊為去重後的 `partNumber` 列表（≤3 筆直接列出，否則退回筆數，如 `for 4 parts (...)`）加上頭尾日期範圍。單批最多可達 `STOCK_BATCH_SIZE`（100）筆，逐一列出會使 log 行過長，故超過門檻時退回筆數；日期範圍沿用了 `fetchSlotStock` 既有的 `${a}..${b}` span 表示慣例。（此為 2026-08-23 審查通過後的修訂版本 -- 最初版本只列筆數與日期範圍，經 blind-hunter 審查發現 `fetchProduct` 的單筆直接呼叫因此完全沒有 productCode 可辨識，修訂為優先具名。）

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無型別錯誤
- `npm test` -- expected: 全部測試通過（含更新後的 `usj-fetchproduct-blocking.test.ts` 斷言）

## Auto Run Result

**變更摘要：** 四個 `!res.ok` 拋錯點（Calendar/Variant/Product/Search）補上 `res.text().catch(() => undefined)` 讀取保護（DW-50），並在錯誤訊息中補入呼叫當下的識別資訊（DW-51）。第二輪 follow-up review 修正了 `fetchInventory` 批次日期範圍的排序假設錯誤，並補齊 DW-50/DW-51 在 Product、Search 兩站點與 `fetchInventory` 多筆 partNumber 分支的測試覆蓋。第三輪 follow-up review 補上兩個殘留的驗證缺口：批次日期範圍測試改為鎖定確切遞增順序（而非只驗證形狀），以及新增 `partsDesc` 的 2 筆具名分支測試（先前只覆蓋 1 筆與 4 筆兩個極端）。

**變更檔案：**
- `src/sources/usj.ts` -- 四個拋錯點加上讀取保護與識別資訊；`fetchInventory` 的日期範圍片段改為對批次內所有日期排序後取最小/最大值，修正原本假設 `queries` 依時間順序排列（批次呼叫實際上把最新日期排最前）而可能反向的問題。（第三輪未再變更此檔案。）
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 更新既有 Calendar 訊息斷言以符合新格式；新增 Calendar/Variant 讀取失敗回歸測試、Product/Variant/Search 識別資訊斷言（第一輪）；新增 Product API 讀取失敗測試、`fetchInventory` 4-parts 計數分支測試（第二輪）；4-parts 測試斷言改為鎖定確切遞增日期順序、新增 2-parts 具名分支測試（第三輪）。
- `src/sources/usj-blocking.test.ts` -- 新增 Search API 訊息識別資訊斷言（第一輪）；新增 Search API 讀取失敗測試（第二輪）。（第三輪未再變更此檔案。）

**Review 結果：**
- 第一輪：patch 4（medium 3、low 1）、reject 6（low 6）、intent_gap 0、bad_spec 0、defer 0。
- 第二輪：patch 3（medium 3）、reject 9（low 9）、intent_gap 0、bad_spec 0、defer 0。
- 第三輪：patch 2（medium 2）、reject 13（low 13）、intent_gap 0、bad_spec 0、defer 0。
- Follow-up review recommendation：`true`（本輪 patch 為 2 medium：3×2=6 ≥ 5）。

**驗證：**
- `npm run typecheck` -- 通過，無型別錯誤。
- `npm test` -- 118 個測試全數通過（含本輪新增的 1 個測試，以及本輪強化斷言後仍通過的既有測試）。

**殘留風險：**
- Product/Variant/Search 三站點的「空 body 不留懸空冒號」邊界情境僅由 Calendar 站點的測試間接驗證共用機制，未逐站點覆蓋（歷輪判定皆為 reject，風險評估為 low）。
- `fetchInventory` 的識別資訊格式（≤3 具名、>3 計數）與呼叫端既有 log 前綴之間存在文字重複，屬合約明文要求下的預期結果，非缺陷。
- 四個站點識別資訊的措辭（`for X on Y` / `for X (Y)` / `for X (Y..Z)` / `for X`）彼此不完全一致，本輪判定為風格瑕疵、非缺陷，予以駁回。


---
title: 'Story 1.5 - 完整格網快照與狀態判定'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: 'e901f1ed32cd9c0d14d7ac62dcbe6095160ccf5b'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      `buildDays()` 不讀 `ProductSummary` 的 `stale` / `error` 旗標，因此本回合抓取失敗或被
      `--product=` 跳過的票種，其舊檔中不存在的日期會被以與新鮮資料相同的信心斷言為
      `sold-out`。
    evidence: |-
      `src/fetcher.ts` 的 `buildDays()` 只取 `summary.code`，`cellStatus()` 亦只看
      `ProductResult` 的內容，兩者都看不到 `summary.stale === true`（`src/fetcher.ts` 逐產品
      迴圈失敗分支與 untouched 合併處會設定它）。格網化之前，陳舊檔案只會讓「可購」格延用舊值；
      格網化之後，它額外產生「已售罄」這個新的、具體且可能錯誤的斷言。
      本 story 的 AC2 無條件要求「缺席 + latestDate → 售罄／尚未開賣」，未對陳舊證據設例外，
      故本回合依 intent 實作；新鮮度標示由 Story 1.10（靜默失敗偵測）與 Story 3.7（資料新鮮度
      與過期標示）承接時應一併決定陳舊票種的格子是否降級為 `unknown`。
    location: >-
      src/fetcher.ts (buildDays / cellStatus)
    severity: medium
  - summary: >-
      整回合證據崩潰（所有產品檔皆讀不到）時，會產出 5,735 格全 `unknown` 的格網覆蓋掉上一份good
      快照，且 `main()` 仍以 exit 0 結束。
    evidence: |-
      `cellStatus()` 對 `readProduct() === null` 回傳 `unknown`（正確，單一票種層級已有測試涵蓋），
      但沒有任何一層檢查「整份格網沒有任何 available 格」。`writeDays()` 會照寫，
      `.github/workflows/fetch.yml` 的 commit 步驟為 `if: always()`，而 `main()` 只在
      `failed === targets.length` 時才 exit 1——讀檔失敗不計入 `failed`。
      此為既有行為（格網化前同樣會把 `days.json` 寫成空物件），且 Story 1.10
      「零/近零結果視為失敗，不得寫入快照」正是為此而設，故不在本 story 修補。
    location: >-
      src/fetcher.ts (main 的 writeDays 呼叫點)
    severity: medium
  - summary: >-
      `days.json` 的格子結構已變更但 `schemaVersion` 仍為 `1`，且 `index.html` 完全不讀
      `schemaVersion`，因此在 1.5 與 1.6 之間存在「舊快取頁面讀到新檔」的視窗。
    evidence: |-
      舊版 `fitsParty` 的守衛為 `p.units == null || p.units >= people`；非可購格沒有 `units`
      欄位，`undefined == null` 為 true，因此每一格都會通過，售罄與尚未開賣的票種會被畫成可購列
      ——正是本 story 要防的錯誤方向。`days.json` 以 `?t=${catalog.updatedAt}` 破快取，但
      `index.html` 由瀏覽器獨立快取，已開啟未重載的頁面即落在此視窗內。
      升版與「下游遇未識別版本須中止」由 Story 1.6 承接；惟 1.6 的規則作用於建置端，
      不涵蓋瀏覽器端已載入的舊頁面，該視窗需在 1.6 或 Epic 2 cutover 時一併確認關閉。
    location: >-
      src/types.ts (Days.schemaVersion) / index.html
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `data/days.json` 只收錄「該日可購」的 (日期 × 票種) 組合——`buildDays()` 以 `if (!date.available) continue` 丟棄不可購列，且完全不產生來源未回傳的組合。缺席因此同時承載「已售罄」「尚未開賣」「不營業」「未知」四種互斥語意，下游只能猜；實測 31 個產品中有 10 個 `latestDate` 為空字串，這些產品的每一格都毫無判定依據，一旦被下游預設為售罄，就會讓使用者做出「看到售罄就放棄」的錯誤決定（AD-12、AD-13、FR3.1）。

**Approach:** 把 `buildDays()` 由「轉置可購列」改為「產出完整格網」：值域 = 本回合抓取範圍內的每一個日期 × `index.json` 內的每一個票種，每格帶一個由協調層判定一次的顯式 `status`。判定依據依序為「來源直接證據（該列存在與否、`available` 值）」與「該票種的 `latestDate`」；證據不足（`latestDate` 為空字串、產品檔缺失、日期落在該產品抓取範圍外）一律顯式判為 `unknown`，不得回退。

## Boundaries & Constraints

**Always:**
- 狀態判定只在 `src/fetcher.ts` 的協調層發生一次；任何下游（含 `index.html`）只得讀取 `status`，不得從缺席或從 `units`/`price` 重推狀態（AD-12）。
- 值域內每一個 (日期 × 票種) 組合在 `days.json` 內都必須有恰好一格，包含所有票種皆不可購的日期列——不得因「該日無貨」而丟棄整個日期（AD-12）。
- 證據不足時一律 `unknown`，永不回退為 `sold-out` 或 `not-yet-released`（AD-13）。
- `serializeDays()` 維持「一格一行」的輸出格式，讓未變動的格子在 git diff 中保持逐行穩定。
- 既有的「內容未變就不寫檔」規則（`writeDays`）不得被本次變更破壞。

**Block If:**
- 若判定規則出現多種同樣站得住腳、且會產生不同快照內容的讀法，且 epics.md／ARCHITECTURE-SPINE 皆未擇一——HALT。

**Never:**
- 不得變更 `days.json` 的 `schemaVersion`（現行 `1`）：升版至 `2` 與「下游遇未識別版本須中止建置」是 Story 1.6 的範圍，本 story 只做結構變更（AD-14 的落實由 1.6 負責）。
- 不得變更 `data/products/*.json` 的結構、不得變更 `index.json` 的 `schemaVersion`（現行 `5`）。
- 不得新增任何對來源的請求，不得改動 `src/limiter.ts`、抓取排程或 `src/sources/usj.ts` 的取得邏輯（本 story 純屬既有資料的協調層轉置）。
- 不得改變 `index.html` 現行的可見行為（日期橫條顯示哪些日期、清單顯示哪些票種）——本 story 對它只做「維持原樣所需的最小防護」，不做矩陣呈現（那是 Epic 3）。
- 不得把「該日不營業／該票種當日不販售」獨立成第五種狀態：現有證據（`DateSlot` 未攜帶 `canBeVisited`）不足以切分，FR3.1 亦只要求可靠切分「已售罄」與「尚未開賣」。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 可購列 | 產品檔有該日期列且 `available: true` | 該格 `status: 'available'`，並帶 `price`／`units`／`slots` | 無 |
| 不可購列須保留 | 產品檔有該日期列但 `available: false` | 該格 `status: 'sold-out'`（來源直接證據），**不得**被丟棄 | 無 |
| 缺席且在 `latestDate` 之前 | 值域內日期 ≤ 該票種 `latestDate`，但產品檔無該列 | `status: 'sold-out'` | 無 |
| 缺席且在 `latestDate` 之後 | 值域內日期 > 該票種 `latestDate`，產品檔無該列 | `status: 'not-yet-released'` | 無 |
| `latestDate` 為空字串 | 該票種 `latestDate === ''`（實測 10/31 個產品） | 該票種在值域內**每一格**皆 `status: 'unknown'` | 無 |
| 產品檔讀不到 | `index.json` 有該票種，但 `data/products/<code>.json` 缺失或解析失敗 | 該票種在值域內每一格皆 `unknown`（原行為為整個票種消失） | 不拋錯，不中止回合 |
| 日期落在該產品抓取範圍外 | 值域日期 > 該產品檔的 `calendarEnd`（如 stale carry-over 產品） | 該格 `unknown` | 無 |
| 全日無貨 | 值域內某日期所有票種皆非 `available` | 該日期仍有 `DayEntry`，`products` 含全部票種的非 available 格 | 無 |
| 內容未變 | 兩回合產出相同格網 | `writeDays()` 回傳 false，不寫檔、不進 git | 無 |

</intent-contract>

## Code Map

- `src/fetcher.ts:124-155` -- `buildDays(products: ProductSummary[]): Days`。核心變更點。現況：對每個 summary `readProduct()`，`for (const date of result.dates) { if (!date.available) continue; ... }` 只推入可購列，`days[date.date]` 只在有可購票種時才被建立。須改為：(1) 簽章加入本回合的 `range: DateRange` 以取得日期值域；(2) 先以 `everyNthDay(range.start, range.end, 1)` 建出**每一個**日期的 `DayEntry`；(3) 對每個 `ProductSummary` 建 `Map<date, DateSlot>` 後，逐日期判定 `status` 並推入該日的 `products`。`readProduct()` 回傳 `null` 時**不得**再 `continue` 跳過整個票種，須改為該票種全格 `unknown`。
- `src/fetcher.ts:145-153` -- 排序區塊。現況「同日內依價格由低到高、同價依 code」。須調整為：`available` 格在前（維持價格由低到高、同價依 code），其餘格在後依 `code` 排序——讓既有 UI 的「最便宜在前」契約不被非可購格插隊破壞，且輸出完全決定性。日期本身仍以 `Object.keys(...).sort()` 保證日期序。
- `src/fetcher.ts:157-183` -- `serializeDays(days)`。**格式不需改**：它以 `JSON.stringify(product)` 逐格輸出一行，union 型別的兩種變體都能正確序列化。此格式正是讓 ~250KB 檔案在 git 中仍只產生逐行小 diff 的原因，必須保留。
- `src/fetcher.ts:306` -- `const days = buildDays(products);` 呼叫點，須改為 `buildDays(products, range)`（`range` 已於 `main()` 第 202 行附近建立）。
- `src/fetcher.ts:307-311` -- `console.log('[fetch] calendar: N days with stock')`。語意已改（現在每個日期都有列），須改為回報格網規模與 `unknown` 格數，供 Story 1.10 的合理性檢查有可觀察的輸出。
- `src/fetcher.ts:124` 上方 -- `buildDays` 目前未 `export`，測試無法直接驅動。須 `export`（比照 Story 1.4 對 `main()` 的處理）。
- `src/types.ts:129-135` -- `DayProduct`（`code`/`price`/`units`/`slots`）。須新增 `CellStatus` 型別與 `status` 欄位。建議做成可辨識聯集：`available` 變體帶 `price`/`units`/`slots`，其餘變體只帶 `code`+`status`——不可購的格子在型別上就沒有價格可讀，下游被迫先看 `status`（AD-12），同時讓檔案大小少掉約一半。
- `src/types.ts:137-141` -- `DayEntry.products` 註解 `// only passes on sale that day, cheapest first` 已失效，須改寫為「值域內每個票種一格，可購者在前」。
- `src/types.ts:143-153` -- `Days.schemaVersion: 1`。**本 story 不動**（見 Boundaries）。
- `src/dates.ts` -- 已有 `everyNthDay(start, end, step)`（值域展開直接可用）與 `addDays`。**缺** 由 `YYYY-MM-DD` 算 `dayOfWeek` 的 helper；`src/sources/usj.ts:171-172` 內嵌了該公式（`new Date(Date.UTC(y, m - 1, d)).getUTCDay()`）。須在 `dates.ts` 新增 `dayOfWeek(date: string): number` 並讓 `usj.ts:171-172` 改用它，避免同一公式兩份。
- `src/types.ts:99` -- `ProductResult.latestDate` 語意「latest date still on sale」；`src/sources/usj.ts:541-545` 是其唯一產生處（`availableDates` 最後一筆 → `dates` 最後一筆 → `''`）。判定所依據的就是這個欄位，本 story **不改**其計算方式。
- `src/types.ts:92-93` -- `ProductResult.calendarStart` / `calendarEnd`：每個產品檔自帶的抓取範圍，用於判斷「該日期是否落在此產品的證據範圍內」。
- `index.html:1022` -- `fetch('./data/days.json')`，**現役消費者**。以下四處把 `entry.products` 直接當成「該日可購清單」，格網化後會把售罄／未開賣票種顯示為可購，屬回歸，須以顯式 `status` 過濾修正（不是重推狀態，是讀取協調層的判定）：
  - `index.html:1029-1031` `fitsParty(entry, people)` -- `(entry.products || []).filter(p => p.units == null || p.units >= people)`：須先過濾 `p.status === 'available'`。注意 `units == null` 在新型別下對非 available 格為 `undefined`，若不先過濾會全數通過。
  - `index.html:1077-1078` `const hidden = entry.products.length - fitting.length;`
  - `index.html:1091` `t('dayDetail', entry.products.length)`
  - `index.html:1097-1099` `entry.products.length ? ... entry.products.map(dayRowHtml) ...`
- `index.html:1137-1146` -- `renderDay()` 的 `const dates = Object.keys(calendar.days);`：格網化後日期由約 62 個變成值域全長（約 185 個），日期橫條會多出大量 0 貨日期。須過濾為「至少一格 available 的日期」以維持現行可見行為（見 Boundaries「Never」）。
- `index.html:776` -- 票種優先視圖已 `filter(d => d.available)`，讀的是 `products/*.json` 而非 `days.json`，**不受本次變更影響，不需改動**。
- `src/fetcher.test.ts` -- 既有檔（Story 1.4）。示範了如何以 `require('node:fs')` mock `fs`、以 `t.mock.method` 換掉 `usjSource`、並 `await main()`。本 story 的新測試沿用同樣手法，但直接驅動 `buildDays()` 即可，不必走 `main()`。
- `src/test-support.ts` -- `settle`/`track`/`flush`，僅供有 timer 的非同步路徑使用；`buildDays` 為同步純函式，**不需要**這些工具。
- `package.json:test` -- `node --require ts-node/register --test $(find src -name '*.test.ts')`：新測試檔只要放在 `src/` 下並以 `.test.ts` 結尾就會被收進來。

## Tasks & Acceptance

**Execution:**
- `src/types.ts` -- 新增並 `export type CellStatus = 'available' | 'sold-out' | 'not-yet-released' | 'unknown'`；將 `DayProduct` 改為可辨識聯集（`available` 變體保留 `price`/`units`/`slots`，其餘變體僅 `code` + `status`）；更新 `DayEntry.products` 與 `Days` 的註解以反映格網語意 -- 讓「每格都有明確狀態」成為型別層面的不變量，下游無法在不看 `status` 的情況下讀到價格
- `src/dates.ts` -- 新增 `export function dayOfWeek(date: string): number`（0=Sun…6=Sat，以 `Date.UTC` 計算，與 `usj.ts` 現行公式一致） -- 值域內未出現在來源回應中的日期也需要星期幾，公式不得複製第二份
- `src/sources/usj.ts` -- `parseCalendarDate` 內嵌的星期幾計算改呼叫 `dates.ts` 的 `dayOfWeek` -- 消除同一公式的兩份實作，避免日後只改到一邊
- `src/fetcher.ts` -- 改寫並 `export buildDays(products, range)`：以 `everyNthDay` 展開日期值域、對每個票種建 `Map<date, DateSlot>`、逐格判定 `status`（判定順序見 Design Notes）、`readProduct()` 為 `null` 時該票種全格 `unknown`；調整同日排序為「available 在前依價、其餘依 code」；更新第 306 行呼叫點與第 307-311 行的 `console.log` -- 這是 AD-12「狀態由協調層判定一次」的落點
- `src/fetcher-grid.test.ts`（新檔）-- 以 `t.mock.method(fs, 'readFileSync', ...)` 餵入合成的產品檔，逐一涵蓋 I/O Matrix 的九列，並額外斷言：值域內日期數 = `everyNthDay(range)` 長度、每個 `DayEntry.products.length` = 票種數、輸出順序決定性 -- 把格網完整性與四種狀態的判定鎖成可回歸驗證的不變量（Story 1.12 的 CI 將執行它）
- `index.html` -- 新增 `onSale(entry)` helper（回傳 `(entry.products || []).filter(p => p.status === 'available')`），並套用於 `fitsParty` 的來源集合、`paintDay` 的三處 `entry.products.length`/`map`、以及 `renderDay` 的日期清單過濾 -- 讀取協調層的顯式狀態，使現役站台在快照格網化後的可見行為與現在一致，不把售罄／未開賣票種誤顯示為可購

**Acceptance Criteria:**
- Given `index.json` 有 N 個票種、本回合抓取範圍為 D 天, when `buildDays()` 產出快照, then `days.json` 的日期數恰為 D、每個日期的 `products` 恰有 N 格、且每格皆帶四種 `status` 之一——不存在缺席的組合
- Given 任一票種的 `latestDate` 為空字串, when 判定該票種在值域內的所有格, then 全部為 `unknown`，且輸出中不含該票種的任何 `sold-out` 或 `not-yet-released` 格
- Given 某日期的所有票種皆非 `available`, when 產出快照, then 該日期仍存在於 `days.json` 且帶正確 `dayOfWeek`，不得被丟棄
- Given 現役 `index.html` 讀取格網化後的 `days.json`, when 繪製日期優先視圖, then 日期橫條與票種清單顯示的內容與格網化前一致（僅 `status === 'available'` 的格會出現），且不因新增的非可購格而顯示錯誤數量
- Given 快照格網化, when 檢視 `days.json`, then `schemaVersion` 仍為 `1`（升版屬 Story 1.6），`index.json` 的 `schemaVersion` 仍為 `5`
- Given 連續兩回合抓到相同結果, when `writeDays()` 比對, then 檔案不被改寫（不進 git）

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 3, low 5)
- defer: 3: (high 0, medium 3, low 0)
- reject: 10: (high 0, medium 2, low 8)
- addressed_findings:
  - `[medium]` `[patch]` `dayOfWeek` 被以自身為 oracle 斷言（`fetcher-grid.test.ts` 兩處比對 `dayOfWeek(date)`，`row()` fixture 亦以同一函式餵入），把公式改成 `(getUTCDay() + 1) % 7` 仍 37 綠。新增 `src/dates.test.ts` 以字面值釘住（Unix epoch、Y2K、週末兩端、2024-02-29 兩側、2100 世紀規則、跨年、走一週偵測旋轉、UTC/Tokyo/LA/Kiritimati 時區掃描），並將格網測試改用寫死的 `WEEKDAYS` 對照表；已用同一 mutation 反證新測試會失敗。
  - `[medium]` `[patch]` `index.html` 的 `onSale`／`fitsParty`／日期橫條過濾無任何執行性驗證，而非可購格根本沒有 `units` 欄位（`undefined == null` 為 true），一旦 `status` 判斷式失守即全數通過。新增 `src/day-view.test.ts`：自 `index.html` 以括號配對取出 `onSale`／`fitsParty` 與 `renderDay` 的 `const dates = ...` 敘述，於 `node:vm` 中對含四種狀態的合成 entry 實際執行；`paintDay` 因需真實 DOM 改為原始碼層斷言（要求 `const selling = onSale(entry)` 且 body 內零個 `entry.products` 參照）並明確標示。已以 mutation 反證。
  - `[medium]` `[patch]` 手寫的 `serializeDays()` 在 union 型別新增第二種變體後，沒有任何「輸出仍為合法 JSON」的斷言（原測試只數 `{"code"` 開頭的行數）。改為斷言 `JSON.parse(onDisk)` 與所建格網 deep-equal；已以「強制加尾逗號」mutation 反證。
  - `[low]` `[patch]` 「內容未變就不進 git」只靠 `writeDays()` 的回傳值驗證，先寫檔再回傳 `false` 的實作也會通過。改為對已 mock 的 `writeFileSync` 計數，斷言第二次呼叫後寫入次數仍為 1。
  - `[low]` `[patch]` 範圍閘門的下半段 `date < result.calendarStart` 從未被執行（`P_STALE` 只涵蓋 `> calendarEnd`）。新增 `P_LATE` 案例（`calendarStart` 晚於 `range.start`），斷言 `[unknown, unknown, sold-out, available, not-yet-released]`。
  - `[low]` `[patch]` 缺證閘門比對精確值而非真值：`latestDate === ''` 接不住 `null`／`undefined`，且缺 `calendarStart`／`calendarEnd` 時 `date < undefined` 為 false 會讓閘門靜默放行。改為真值守衛並新增 `calendarStart`／`calendarEnd` 缺漏閘門，測試涵蓋五種近似缺漏形狀。
  - `[low]` `[patch]` `writeDays()` 註解寫死「~5,700 cells」，該數字會隨型錄與範圍漂移。改為敘述性描述，並移除測試檔中同樣過期的「~250KB」。
  - `[low]` `[patch]` `main()` 層無人斷言 `buildDays` 收到的是本回合的 `range`，呼叫點接錯會靜默縮小快照日期值域。於 `src/fetcher.test.ts` 新增整回合斷言（起日、`shiftMonths(first, 6)` 迄日、`everyNthDay` 全等），並以 `todayJST()` 前後夾住避免 JST 換日 flake。

### 2026-08-22 — Review pass (follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 1, low 3)
- defer: 0
- reject: 26: (high 0, medium 5, low 21)
- addressed_findings:
  - `[medium]` `[patch]` `paintDay` 的 `hidden = selling.length - fitting.length` 只被原始碼層 regex 覆蓋；把減法寫反（`fitting.length - selling.length`）後 `hidden` 永不為正，「為 N 人隱藏了 N 張票」提示與 `dayDetailFit` 靜默消失，而該測試的五條 regex 全數仍然命中（無一提及 `hidden`）。於 `src/day-view.test.ts` 新增可執行測試：以正規式抬出 `selling`／`fitting`／`hidden` 三行純運算，在 `node:vm` 中對含三可購三非可購格的 entry 實跑，斷言 people=1/4/20 各為 `{3,3,0}`／`{3,2,1}`／`{3,1,2}`。已以該 mutation 反證（51 測試中 1 紅）。跨 realm 原型問題比照同檔 `codes()` 以本 realm 重建物件解決。
  - `[low]` `[patch]` `src/fetcher-grid.test.ts` 以 `DATES = everyNthDay(RANGE.start, RANGE.end, 1)` 斷言 `Object.keys(days.days)`，等號兩邊同源——`everyNthDay` 若重複或漏掉中段日期，該斷言本身接不住（同檔 `WEEKDAYS` 的註解正是為避免此事而寫死字面值，值域卻沒照辦）。改為寫死五個日期字面值並移除該 import。反證：讓 `everyNthDay` 少回傳最後一日，套用後 10 條測試轉紅、套用前僅 6 條（差額由相鄰的 `dayOfWeek` 字面值斷言意外接住，故此項如實記為 low 而非 medium）。
  - `[low]` `[patch]` `src/day-view.test.ts` 抬取 `paintDay` 本體的 `HTML.indexOf('\n    }', start)` 無任何守衛：切點若提前落下，本體被截斷後 `entry\.products` 出現次數會因錯誤原因讀到 0，測試以假通過收場。新增兩道守衛（`end !== -1`，且切片須含 `paintDay` 最後一條敘述 `setView('product', row.dataset.code)`）。已以「把終止字串換成會提前命中的 `\n      });`」反證。
  - `[low]` `[patch]` `src/dates.test.ts` 的時區掃描是恆真式：`dayOfWeek` 以 `Date.UTC` + `getUTCDay` 計算，本質與 TZ 無關，四個時區只是同一條斷言的四份複本，若 runtime 不理會 `process.env.TZ` 也照樣全綠。於迴圈中加入 canary（同一 UTC 瞬間 `2026-08-22T13:00Z` 的本地星期幾），結束後斷言其集合大小 > 1，時區若沒真的動就轉紅。已以「把掃描縮成單一時區」反證。

### 2026-08-22 — Review pass (follow-up 2)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 0
- reject: 23: (high 0, medium 4, low 19)
- addressed_findings:
  - `[medium]` `[patch]` `paintDay` 決定「列出票種清單」或「顯示今日無票」的分支條件（`body.innerHTML = selling.length ? … : dayEmpty`）只被原始碼層 regex 覆蓋。把條件改成 `fitting.length` 後，該測試的四條斷言（`const selling = onSale(entry)`、`entry.products` 出現 0 次、`t('dayTitle', selling.length)`、`selling.map(dayRowHtml)`）全數仍然命中，但「當日有票在賣、只是人數都塞不下」的日期會改渲染 `dayEmpty`，與該敘述正上方註解承諾的「賣到剩不多的票種仍應保留可見」直接矛盾。於 `src/day-view.test.ts` 新增可執行測試：把 `paintDay` 本體切出後於其中定位 `body.innerHTML = …`（避免抓到票種優先視圖第 872 行的同名指派），連同 `selling`／`fitting`／`hidden` 三行在 `node:vm` 中實跑，`t`／`esc`／`dayRowHtml` 以回聲樁替代。以「兩格可購且皆有有限庫存、party=20」的 entry 斷言仍列出 `A_ROOMY`／`B_TIGHT` 且不得出現 `dayEmpty`、標題計數為 `dayTitle(2)`；再以「全部為 sold-out／not-yet-released／unknown」的 entry 斷言必須顯示 `dayEmpty` 且不得渲染任何列。已以該 mutation 反證（52 測試中 1 紅，且僅新測試轉紅）。同時把 `paintDay` 原始碼切片與其兩道守衛抽為 `paintDaySource()`，兩個測試共用。
  - `[low]` `[patch]` `index.html` `renderDay()` 新增註解寫「rather than growing three months of empty pills」，但本回合值域為 `todayJST()` 起算 `MONTHS_AHEAD = 6` 個月（實測 185 天），同檔測試與 `src/fetcher.test.ts` 的 `shiftMonths(first, 6)` 均為六個月。該註解正是日後判斷「這個過濾是否還需要」的唯一依據，數字少講一半會誤導。改為敘述抓取範圍的完整六個月。

## Design Notes

**每格的判定順序（唯一權威，實作須照此順序短路）：**

```
1. 產品檔讀不到（readProduct() === null）      -> 'unknown'
2. result.latestDate === ''                    -> 'unknown'   (AD-13 具名證據缺口：實測 10/31)
3. date < calendarStart || date > calendarEnd   -> 'unknown'   (該產品對此日期無證據，如 stale carry-over)
4. 該日期列存在且 available === true            -> 'available' (帶 price / units / slots)
5. 該日期列存在且 available === false           -> 'sold-out'  (來源直接證據，AD-12)
6. 該日期列缺席且 date <= latestDate            -> 'sold-out'
7. 該日期列缺席且 date >  latestDate            -> 'not-yet-released'
```

第 2 步刻意排在第 4 步之前：`latestDate` 為空代表整個票種的「開賣邊界」不明，即使個別日期列存在也無法區分它是不是全貌——但實測中這 10 個產品的 `dates` 皆為空陣列，兩種排序在現行資料上等價；排在前面是為了讓「證據不足即 unknown」成為單一、不可繞過的閘門。

**檔案大小取捨：** 值域約 185 天 × 31 票種 ≈ 5,700 格（現行僅 935 格）。採用聯集型別讓非可購格只序列化 `{"code":…,"status":…}`，`days.json` 由約 64KB 增至約 250KB 而非約 500KB。`serializeDays()` 的「一格一行」格式是關鍵：檔案雖大，未變動的格子逐行穩定，git diff 仍只反映真正變動的格子。

**為何值域取本回合的 `range` 而非各產品檔的聯集：** `range` 是本回合「問過來源什麼」的唯一定義，穩定且與 `dropPastDates` 的裁切基準一致；改用各產品檔的聯集會讓值域隨某個 stale 產品的舊 `calendarEnd` 漂移，使格網邊界隨機。落在個別產品證據範圍外的格由判定順序第 3 步顯式標為 `unknown`，不靠值域裁切遮蓋。

## Verification

**Commands:**
- `npx tsc -p tsconfig.test.json` -- expected: 無型別錯誤（聯集型別導入後，任何未先檢查 `status` 就讀 `price` 的下游程式碼都會在此暴露）
- `npm test` -- expected: 全部通過，含新增的 `src/fetcher-grid.test.ts`
- `node -e "const d=require('./data/days.json');const ds=Object.keys(d.days);const n=new Set(ds.flatMap(k=>d.days[k].products.map(p=>p.code)));console.log(ds.length,'days',n.size,'products',ds.every(k=>d.days[k].products.length===n.size))"` -- expected: 若本機曾實跑 `npm run fetch`，最後一項須為 `true`（每日格數一致）。未實跑則跳過此項，以測試為準。

**Manual checks (if no CLI):**
- 檢視 `src/fetcher.ts` 的 `buildDays`，確認 `readProduct()` 回傳 `null` 的分支不再 `continue` 跳過整個票種
- 檢視 `index.html` 的 `fitsParty`／`paintDay`／`renderDay`，確認四處 `entry.products` 都已改讀 `onSale(entry)`，且 `renderDay` 的日期清單已過濾
- 檢視 `data/days.json` 的前兩個日期區塊，確認每個日期的票種數相同、且含非 `available` 的格


## Auto Run Result

Status: done

**實作摘要**

`buildDays()` 由「轉置可購列」改為「產出完整格網」：值域為本回合抓取範圍（`todayJST()` 起算六個月，實測 185 天）的每一個日期 × `index.json` 內的每一個票種，共 5,735 格；每格帶一個由 `cellStatus()` 在協調層判定一次的顯式 `status`（`available`／`sold-out`／`not-yet-released`／`unknown`）。三道缺證閘門（產品檔讀不到、`latestDate` 未陳述、日期落在該產品自身 `calendarStart`/`calendarEnd` 之外）一律短路為 `unknown`，永不回退為售罄或未開賣。`index.html` 以新增的 `onSale()` 讀取該顯式狀態，維持格網化前的可見行為。

**變更檔案**

- `src/types.ts` -- 新增 `CellStatus`；`DayProduct` 改為可辨識聯集（`available` 變體帶 `price`/`units`/`slots`，其餘僅 `code` + `status`），下游無法不看 `status` 就讀到價格
- `src/dates.ts` -- 新增 `dayOfWeek(date)`（UTC 計算），供值域內來源未回傳的日期標記星期幾
- `src/sources/usj.ts` -- `parseCalendarDate` 改用共用的 `dayOfWeek()`，消除同一公式的第二份複本
- `src/fetcher.ts` -- 新增 `cellStatus()`；`buildDays(products, range)` 匯出並改產出完整格網；同日排序改為「可購在前依價、其餘依 code」；`writeDays()` 匯出；`main()` 的 `console.log` 改報格網規模與四種狀態的格數
- `index.html` -- 新增 `onSale(entry)`；`fitsParty`、`paintDay` 的三處計數與清單、`renderDay` 的日期橫條皆改讀顯式 `status`
- `src/fetcher-grid.test.ts`（新）-- 逐列涵蓋 I/O 矩陣九種情境，另加格網完整性、排序決定性、序列化往返與「未變動不寫檔」不變量
- `src/day-view.test.ts`（新）-- 以 `node:vm` 實跑自 `index.html` 抬出的 `onSale`／`fitsParty`／日期橫條過濾／`paintDay` 的計數與分支
- `src/dates.test.ts`（新）-- 以字面值釘住 `dayOfWeek`（含閏日、世紀規則、跨年、時區掃描 canary）
- `src/fetcher.test.ts` -- 新增整回合斷言：寫出的 `days.json` 日期值域即本回合 `range`
- `data/days.json` -- 依新結構重新產出（185 天 × 31 票種 = 5,735 格）

**複審結果（本回合，第三次 pass）**

- 套用 patch：2（medium 1、low 1）
  - medium：`paintDay` 的「列出清單／顯示無票」分支條件缺可執行覆蓋，新增 `node:vm` 實跑測試並以 mutation 反證
  - low：`renderDay` 註解把六個月的抓取範圍寫成 three months，已更正
- 延後（defer）：0（本回合四位 reviewer 提出的既有問題——陳舊票種被斷言為售罄、整回合證據崩潰仍寫檔並 exit 0、`schemaVersion` 未升版導致舊快取頁面讀新檔——均已在本 spec frontmatter `deferred` 清單中，未重複登錄）
- 駁回（reject）：23（medium 4、low 19）。主要類別：(a) 主張「缺證閘門應排在來源直接證據之後」——Design Notes 與 AD-13 明文指定現行順序，且實測 10 個空 `latestDate` 產品的 `dates` 皆為空陣列，兩種順序在現行資料上等價；(b) 主張把四種狀態呈現給使用者——intent 明文禁止改變 `index.html` 可見行為（矩陣呈現屬 Epic 3）；(c) 主張新增 `unknown` 的細分原因欄位、格網大小上限、`dayOfWeek` 輸入驗證——皆為超出 intent 的增強；(d) 經查證不成立者：`renderDay` 已有 `const has = d => !!d && dates.includes(d)` 夾住還原日期、`index.html` 除 `onSale()` 外無其他 `entry.products` 讀取點、`readProduct()` 為裸 `catch` 不依 `err.code` 分支。

**Follow-up review recommendation:** `false`（本回合 patch：high 0、medium 1、low 1；score = 3×1 + 1×1 = 4 < 5）

**驗證**

- `npx tsc -p tsconfig.test.json` -- 通過，無型別錯誤
- `npm test` -- 52 pass / 0 fail（本回合由 51 增為 52）
- Mutation 反證：`body.innerHTML = selling.length` → `fitting.length`，52 測試中 1 紅且僅新測試轉紅；還原後回到 52 綠
- `node -e "…days.json…"` -- `185 days 31 products true`（每個日期的格數一致）

**殘留風險**

- frontmatter `deferred` 的三項仍然成立：陳舊／被跳過票種的缺席日期會被以與新鮮資料相同的信心判為 `sold-out`（待 Story 1.10、3.7）；整回合證據崩潰時仍會寫出全 `unknown` 格網且 exit 0（待 Story 1.10）；`schemaVersion` 維持 `1` 而 `index.html` 不讀該欄位，已載入舊頁面的瀏覽器讀到新檔會把非可購格畫成可購（待 Story 1.6／Epic 2 cutover 確認關閉）。
- `src/day-view.test.ts` 以原始碼切片與正規式從 `index.html` 抬出函式，`index.html` 無模組邊界，重新排版或拆行會使測試失敗（非行為變更）。各處皆有守衛，失敗會是明確的「抬取失敗」而非靜默假通過。

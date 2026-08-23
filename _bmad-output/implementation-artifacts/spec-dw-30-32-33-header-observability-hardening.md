---
title: 'DW-30/32/33：HEADERS 鍵值集合、真實請求標頭、裸 fetch( 三個測試盲點補強'
type: 'chore'
created: '2026-08-23'
baseline_revision: '76d9a1729f545015954715f5974b44779c9ece70'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      DW-30 的新測試只能透過 fetchProduct 觀察到三個 limitedFetch 呼叫點的真實
      init.headers，fetchCatalogPage（僅 listProducts 呼叫）仍無執行期標頭觀察。
    evidence: |-
      usj-fetchproduct-blocking.test.ts 新增的 headers 參照相等測試驅動
      usjSource.fetchProduct(...)，只會走過 fetchProductInfo（兩次）、
      fetchInventory（日曆＋庫存批次）、fetchTimeSlots，不會走過
      fetchCatalogPage —— 那是 usjSource.listProducts(...) 才會呼叫的路徑。
      目前唯一涵蓋 fetchCatalogPage 這個呼叫點的是 usj.test.ts 的原始碼文字
      接線檢查（limitedFetchCallSites／wiringProblem），不是執行期觀察。
      此為既有缺口的縮小（本輪之前四個呼叫點皆無執行期觀察），非本輪引入。
    location: >-
      src/sources/usj.ts (fetchCatalogPage)
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.test.ts` 對 `HEADERS` 只有否定式／結構式斷言（不含站名、無 User-Agent、凍結），沒有一條說出 HEADERS *應該* 有哪四個鍵值（DW-33）；既有的 mock-fetch 測試（`src/sources/usj-fetchproduct-blocking.test.ts`）驗證行為但從未讀取傳給 `fetch()` 的 `init.headers`，所以沒有測試觀察「真正送出去的請求」帶了什麼標頭（DW-30）；架構決策要求「所有對外請求須經單一閘門 `limitedFetch`，禁止裸 `fetch(`，由測試強制」，但目前沒有任何測試會在有人新增裸 `fetch(` 時失敗（DW-32）。

**Approach:** 在 `usj.test.ts` 加一條 `deepEqual` 斷言釘住 `HEADERS` 的四鍵值集合；在 `usj-fetchproduct-blocking.test.ts` 新增一條測試，跑一次正常（非阻擋）的 `fetchProduct`，斷言每次 `fetch` 被呼叫時捕捉到的 `init.headers` 與匯入的 `HEADERS` 是同一參照；在 `limiter.test.ts` 新增一條掃描測試，遞迴掃描 `src/**/*.ts`（排除 `*.test.ts`、`test-support.ts`、`limiter.ts` 本身），斷言沒有任何檔案含有自由站立的 `fetch(`（`limitedFetch(` 不算）。三者皆為新增測試，不改動任何生產程式碼。

## Boundaries & Constraints

**Always:**
- 三個新測試各自獨立、可個別失敗，不合併成一個 test()。
- `HEADERS` 的鍵值內容、匯出名稱、`src/limiter.ts`、`src/sources/usj.ts` 均不得變動。
- 新測試以 `node:test` + `node:assert/strict` 撰寫，符合現有測試檔慣例（沿用各檔既有的 `t.mock.timers`／`t.mock.method` 慣例）。
- DW-30 的新測試須捕捉「實際傳給全域 `fetch` 的 `init.headers`」，用 `assert.equal`（參照相等）而非 `assert.deepEqual`（結構相等）比對 `HEADERS`——這是本測試唯一能證明「同一個凍結物件被原樣傳入」而非「湊巧長得一樣的複本」的地方。
- DW-32 的掃描以「`fetch(` 前一字元不屬於 `[A-Za-z0-9_$.]`」為判準，避免誤判 `limitedFetch(`；不需要如 `usj.test.ts` 的 `blankNonCode` 般精確剝除註解/字串——目前 repo 內除 `limiter.ts` 外沒有任何檔案含 `fetch(` 字樣（含註解），此檢查現在必為綠燈；若日後出現假警報（如註解提到 `fetch(`），是可接受的權衡：寧可誤報也不要漏放。
- `npm run typecheck` 與 `npm test` 均須通過。

**Block If:**
- （無需人工判斷的分支；三項工作範圍明確且互不衝突。）

**Never:**
- 不擴大 forbidden-string／User-Agent 既有斷言的比對範圍。
- 不新增、刪除或修改 `HEADERS` 的任何鍵。
- 不改動 `usj.test.ts` 既有的接線回歸測試（`limitedFetchCallSites`／`wiringProblem` 等）。
- 不把 DW-32 的掃描器做成 `usj.test.ts` 等級的完整 comment/string 剝除掃描器——範圍不對等，過度工程。
- 不把 `src/test-support.ts` 或任何 `*.test.ts` 納入 DW-32 的裸 fetch 掃描對象。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HEADERS 鍵值集合正確 | 匯入 `HEADERS` 並與預期物件做 deepEqual | 斷言通過 | 任一鍵被刪除/改值/新增都會失敗 |
| 正常 fetchProduct 通過真實 HEADERS | mock 全域 `fetch`，跑一次非阻擋的 `usjSource.fetchProduct(...)`，捕捉每次呼叫的 `init.headers` | 每次捕捉到的 `init.headers` 與匯入的 `HEADERS` 參照相等 | 任一呼叫點若改傳 `{ ...HEADERS }` 或省略 headers，該次捕捉值與 `HEADERS` 不相等，斷言失敗 |
| 無裸 fetch( | 遞迴掃描 `src/**/*.ts`（排除測試檔、`test-support.ts`、`limiter.ts`） | 找不到自由站立的 `fetch(` | 若有人在排除清單外的檔案新增裸 `fetch(url)`，該檔路徑與行號出現在失敗訊息中 |
| 排除清單本身有效 | `limiter.ts:189` 的 `fetch(url, init)` 存在 | 不影響 DW-32 測試，因為該檔被排除 | 若排除邏輯寫錯導致 `limiter.ts` 被掃到，此測試現在就會紅（可作為排除邏輯本身的隱含驗證） |

</intent-contract>

## Code Map

- `src/sources/usj.ts:106-111` -- `HEADERS` 常數本體（唯讀，不改動）：`{'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'x-anonymous-consents': '%5B%5D', 'Accept-Language': 'ja-JP'}`。DW-33 的 deepEqual 斷言比對對象。
- `src/sources/usj.test.ts` -- DW-33 新測試加在此檔，緊接既有三個 HEADERS 測試（不含站名 / 無 User-Agent / 凍結）之後、`SOURCE_PATH` 常數與接線測試之前。已 `import { HEADERS } from './usj'`，可直接複用。
- `src/sources/usj-fetchproduct-blocking.test.ts:1-38` -- 檔頭與既有 fixtures：`entry`、`range`、`PRODUCT_INFO`（含一個 `TIMED_EVENT`，故 `deep: true`，會觸發 slot 查詢路徑）、`VARIANT_DETAILS`、`CALENDAR`、`json()` helper、`calendarDate()`。DW-30 新測試直接沿用這些既有 fixtures，不必新建。
- `src/sources/usj-fetchproduct-blocking.test.ts:97-117` -- `mockStore()`：現有 mock-fetch 機制，只讀 `input`（url），不讀 `init`。**唯讀**，不修改此函式——DW-30 新測試用自己的 `t.mock.method(globalThis, 'fetch', ...)`，比照這裡的 URL 判斷分支（`fetchCalendarDatesWithPriceAndInventory` / `getExpressPassVariantDetails` / 其餘），但額外捕捉 `init`。
- `src/sources/usj-fetchproduct-blocking.test.ts:174-195` -- 「an ordinary failure ... still degrades」測試群組：既有的正常路徑跑法範本（`t.mock.timers.enable` + `console.error`/`console.log` mock + `settle(t, usjSource.fetchProduct(entry, range, null))` + 斷言 `outcome.status === 'fulfilled'`）。DW-30 新測試比照這個跑法，時鐘起點須晚於檔案內所有既有測試用到的最大值（目前最大是 `95_000_000`），故新測試用 `100_000_000` 起。
- `src/sources/usj.ts` -- 四個 `limitedFetch` 呼叫點（POST 於 fetchInventory、GET 於 fetchTimeSlots/fetchProductInfo/fetchCatalogPage）皆傳 `headers: HEADERS`。DW-30 的新測試透過 `fetchProduct` 只會經過 fetchProductInfo（呼叫兩次：主語言+en）、fetchInventory（一次日曆+一次庫存批次）、fetchTimeSlots（一次），不會經過 `fetchCatalogPage`（僅 `listProducts` 會呼叫）——DW-30 不要求涵蓋全部四個呼叫點，只要求「至少觀察到真實請求帶著同一個 HEADERS 參照」，接線完整性已由既有的 `usj.test.ts` 原始碼掃描測試涵蓋。
- `src/limiter.ts:178-189` -- `limitedFetch` 內 `fetch(url, init)`（第 189 行）是全 repo 唯一允許的裸 `fetch(`。DW-32 掃描須排除本檔。**唯讀**，不改動。
- `src/limiter.test.ts` -- DW-32 新測試加在此檔尾端。已 import `readFileSync`? 目前未 import `node:fs`/`node:path`，需新增 `import { readFileSync, readdirSync } from 'node:fs';` 與 `import { join, relative } from 'node:path';`。
- `src/limits.test.ts:25` -- `const REPO_ROOT = join(__dirname, '..');` 的既有寫法範本（`limiter.test.ts` 與 `limits.test.ts` 同層，直接比照）。
- `src/test-support.ts` -- DW-32 掃描須排除此檔（tsconfig.json 本身也將它視為「test-only plumbing」而排除於 build 之外，理由相同：非生產程式碼路徑）。**唯讀**，不改動。
- `package.json:8` -- `"test": "node --require ts-node/register --test $(find src -name '*.test.ts')"`，三個新測試都寫進既有測試檔，自動被收集，不需改動。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.test.ts` -- 新增一條測試，`assert.deepEqual(HEADERS, { 'Accept': ..., 'Content-Type': ..., 'x-anonymous-consents': ..., 'Accept-Language': ... })`，鍵值與 Code Map 所列完全一致，失敗訊息說明「哪個鍵值集合斷言存在是為了讓刪鍵/改值可見」-- 涵蓋 I/O 矩陣第一列（DW-33）。
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 新增一條測試：`import { HEADERS } from './usj';`，用獨立的 `t.mock.method(globalThis, 'fetch', ...)` 捕捉每次呼叫的 `init?.headers` 到陣列，跑一次非阻擋的 `usjSource.fetchProduct(entry, range, null)`，斷言至少有一次呼叫被捕捉、且每一個捕捉值都以 `assert.equal`（參照相等）等於匯入的 `HEADERS` -- 涵蓋 I/O 矩陣第二列（DW-30）。
- `src/limiter.test.ts` -- 新增一條測試：遞迴收集 `src/**/*.ts`（排除 `*.test.ts`、`test-support.ts`、`limiter.ts`），逐檔逐行以「`fetch(` 前一字元不屬於 `[A-Za-z0-9_$.]`」判準掃描，收集所有命中檔案與行號，`assert.deepEqual(offenders, [])`，失敗訊息列出違規的 `檔案:行號` -- 涵蓋 I/O 矩陣第三、四列（DW-32）。

**Acceptance Criteria:**
- Given 三個新測試皆已加入，when 執行 `npm test`，then 全部測試（含三個新增）通過，且既有測試數不減少。
- Given 有人把 `HEADERS` 換成 `Object.freeze({})` 或刪除任一鍵，when 執行 `npm test`，then DW-33 新測試失敗。
- Given 有人把四個 `limitedFetch` 呼叫點之一改成 `headers: { ...HEADERS, 'X-Foo': '1' }`，when 執行涉及該呼叫點的 `fetchProduct` 路徑並跑 `npm test`，then DW-30 新測試（若該呼叫點在其跑到的路徑內）或既有的 `usj.test.ts` 接線測試（涵蓋全部四個呼叫點）至少其中之一失敗。
- Given 有人在 `src/` 任何非排除檔案新增一行裸 `fetch(url)`，when 執行 `npm test`，then DW-32 新測試失敗，訊息含該檔案與行號。
- Given 未變更任何生產程式碼，when 執行 `npm run typecheck`，then 通過且無新增錯誤。
- Given 本次變更，when 檢視 `git diff --stat`，then 僅 `src/sources/usj.test.ts`、`src/sources/usj-fetchproduct-blocking.test.ts`、`src/limiter.test.ts` 三檔變更。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass (追加)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 0, low 2)
- defer: 0
- reject: 12: (high 0, medium 0, low 12)
- addressed_findings:
  - `[low]` `[patch]` `src/limiter.test.ts` 的 DW-32 掃描器註解宣稱「a real bare fetch( can never slip past as a false negative」，但透過別名／解構（例如 `const f = fetch; f(url)`）仍可繞過偵測，此宣稱與掃描器實際能力不符。已改註解措辭為僅宣稱「以直接識別字呼叫、或透過四個已知全域別名呼叫的 fetch( 不會漏放」，不再過度宣稱涵蓋所有間接手法（該類間接繞過屬於本規格 Never 條款明文排除的「usj.test.ts 等級完整掃描器」範疇，不改動掃描邏輯本身）。
  - `[low]` `[patch]` `src/sources/usj-fetchproduct-blocking.test.ts` 的 DW-30 新測試只 mock 了 `console.log`，未如同檔其餘測試一併 mock `console.error`，與本檔既有慣例不一致。已補上 `t.mock.method(console, 'error', () => undefined)`。
  - 其餘 12 項發現（DW-32 掃描器對進階別名／解構的漏放、缺少掃描邏輯自身的 fixture 測試、`.` 前空白字元邊界情形、DW-30 未涵蓋 `fetchCatalogPage`〔已記錄於既有 `deferred` 清單，非新發現〕、`capturedHeaders.length > 0` 守門過鬆、測試檔案放置位置、`limiter.ts` 排除路徑用字面比對、HEADERS 鍵值於測試中硬編、缺少大小寫不敏感語意測試、掃描僅涵蓋 `.ts` 副檔名未在註解中聲明、intent-alignment 稽核重申已知的 `fetchCatalogPage` 缺口與 DW-32 範圍取捨）均為本規格 Never／Always 條款已明確排除的過度工程、既有 Design Notes 已說明的刻意取捨，或與既有 `deferred` 項目重複，故列為 reject。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 1, low 3)
- defer: 1: (high 0, medium 0, low 1)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[medium]` `[patch]` DW-32 掃描器把 `fetch(` 前一字元是 `.` 一律視為「不是裸呼叫」而放行，導致 `globalThis.fetch(`／`global.fetch(`／`self.fetch(`／`window.fetch(` 這些等價於裸 fetch 的寫法可繞過偵測，與程式內註解「real bare fetch( can never slip past as a false negative」自相矛盾（三位獨立 reviewer 各自發現同一個洞）。已改為：`.` 前一字元命中時，再檢查該 `.` 前面的識別字是否為 `globalThis`／`global`／`self`／`window`，是的話仍列為違規。
  - `[low]` `[patch]` DW-32 新增註解寫「limitedFetch itself (line 189 above) is the one exception」，但「line 189」讀起來像是指 `limiter.test.ts` 自己檔案內的第 189 行（該處與 fetch 呼叫無關），實際上是指 `src/limiter.ts:189`。已改註解明確寫出檔名。
  - `[low]` `[patch]` DW-30 新測試把每次 `fetch` 呼叫的 `init?.headers` 全部塞進同一個陣列，斷言失敗時無法指出是哪個端點送出了錯誤標頭，與本檔既有測試「訊息盡量診斷性」的慣例不一致。已改為同時記錄呼叫的 URL，斷言失敗訊息附上該次呼叫的 URL。
  - `[low]` `[patch]` `usj-fetchproduct-blocking.test.ts` 檔頭註解仍只描述鎖住四個 `BlockedError` rethrow 分支，未提及本輪新增、性質不同的 HEADERS 接線觀察測試。已在檔頭補一段簡短說明。
  - `[low]` `[defer]` DW-30 新測試透過 `fetchProduct` 只能觀察到 `fetchProductInfo`／`fetchInventory`／`fetchTimeSlots` 三個呼叫點的真實 `init.headers`，`fetchCatalogPage`（僅 `listProducts` 呼叫）仍無任何執行期標頭觀察，只有 `usj.test.ts` 的原始碼文字接線檢查涵蓋。此為既有缺口的縮小而非本輪引入，DW-30 原文字面要求是「至少觀察到真實請求帶著 HEADERS」而非逐一涵蓋四個呼叫點（該義務屬於 DW-7，已由接線測試涵蓋），故不視為本輪的 bad_spec 或 intent_gap。

## Design Notes

DW-30 新測試選在 `usj-fetchproduct-blocking.test.ts` 而非 `usj.test.ts` 或 `limiter.test.ts`，是因為它是 DW-30 帳本條目本身指名的既有 mock-fetch 機制之一（另一個是 `limiter.test.ts:50`，但 `limiter.test.ts` 的 mock-fetch 測試在測試重試/退避行為，呼叫 `limitedFetch(TEST_URL)` 時不帶任何 headers，不是驗證 HEADERS 接線的合適擴充點）。`usj-fetchproduct-blocking.test.ts` 已經驅動真正的 `usjSource.fetchProduct(...)`，會走過 `usj.ts` 內大部分真實呼叫點，是唯一能觀察「HEADERS 到達 `fetch()` 那一刻」的既有測試骨架。

`assert.equal`（參照相等）而非 `assert.deepEqual`：如果某呼叫點把 `HEADERS` spread 進一個新物件（`{ ...HEADERS }`），deepEqual 仍會通過（結構相同），但那正是 `usj.ts` 內 `HEADERS` 常數上方註解警告過的「單點 mutate 污染其餘三處」風險場景之一——只有參照相等能分辨「同一個凍結物件」與「湊巧長得一樣的複本」。

DW-32 的掃描刻意不追求 `usj.test.ts` 的 `blankNonCode` 等級精確度（剝除註解/字串/樣板字面值）。目前 `grep -rn "fetch(" src --include="*.ts" | grep -v ".test.ts"` 只在 `limiter.ts` 命中（且都在排除範圍內或就是那唯一合法呼叫點），所以簡單版掃描現在必為綠燈；未來若有檔案的註解剛好含 `fetch(` 字樣導致假警報，是可接受的權衡（寧可誤報排查一次，也不要一個真正的裸 fetch 被註解掃描邏輯的複雜度絆住而漏放）。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無輸出、exit code 0。
- `npm test` -- expected: 全部測試通過，`src/sources/usj.test.ts` 由 5 增至 6、`src/sources/usj-fetchproduct-blocking.test.ts` 與 `src/limiter.test.ts` 各增加 1 個測試。
- `git diff --stat` -- expected: 僅三個測試檔變更，無生產程式碼變更。

## Auto Run Result

**變更摘要：** 為 DW-30／DW-32／DW-33 三個測試盲點各新增一條獨立測試，不動任何生產程式碼：`usj.test.ts` 釘住 `HEADERS` 的四鍵值集合（DW-33）；`usj-fetchproduct-blocking.test.ts` 跑一次正常 `fetchProduct`，以參照相等驗證每次真實 `fetch` 呼叫的 `init.headers` 就是同一個 `HEADERS` 物件（DW-30）；`limiter.test.ts` 新增遞迴掃描測試，禁止 `src/**/*.ts`（排除測試檔／`test-support.ts`／`limiter.ts`）出現裸 `fetch(`（DW-32）。

**檔案變更：**
- `src/sources/usj.test.ts` -- 新增 `HEADERS contains exactly the four keys...` 測試（deepEqual 釘住四鍵值）。
- `src/sources/usj-fetchproduct-blocking.test.ts` -- 匯入 `HEADERS`，新增 `fetchProduct sends the real, same-reference HEADERS object to every request it makes` 測試；本輪覆審再補上 `console.error` mock，與同檔既有測試慣例一致。
- `src/limiter.test.ts` -- 新增 `no source file outside limiter.ts calls the global fetch( directly` 掃描測試與其輔助函式；本輪覆審修正掃描器註解的過度宣稱措辭。

**Review 發現分類：**
- 首輪（implement 階段內建 review）：patch 4（medium 1、low 3，均已修補），defer 1（low，`fetchCatalogPage` 缺乏執行期標頭觀察，已記錄於 `deferred`），reject 9。
- 本輪覆審（build-auto 對 `done` spec 的追加 review pass）：patch 2（均為 low：DW-32 掃描器註解過度宣稱、DW-30 測試未 mock `console.error`，已修補），reject 12（均為既有 Never／Always 條款排除的過度工程、Design Notes 已說明的刻意取捨，或與既有 `deferred` 項目重複），intent_gap 0，bad_spec 0，defer 0。

**Follow-up review 建議：** `false`（本輪 patch 計分 = 3×0(medium) + 1×2(low) = 2，未達 5 門檻，且無 high 嚴重度 patch）。

**驗證：**
- `npm run typecheck`：通過，無輸出。
- `npm test`：104/104 全數通過，含三個新增測試（`HEADERS contains exactly the four keys...`、`fetchProduct sends the real, same-reference HEADERS object...`、`no source file outside limiter.ts calls the global fetch( directly`）。
- `git diff --stat`（相對 baseline）：僅 `src/limiter.test.ts`、`src/sources/usj-fetchproduct-blocking.test.ts`、`src/sources/usj.test.ts` 三個測試檔變更，無生產程式碼變更。

**殘留風險：** `fetchCatalogPage`（僅 `listProducts` 呼叫）仍無執行期標頭觀察，只有 `usj.test.ts` 的原始碼文字接線檢查涵蓋；已記錄於本檔 frontmatter `deferred` 清單，severity low，非本輪範圍。DW-32 掃描器對進階別名／解構繞過手法（如 `const f = fetch; f(url)`）仍屬設計上的已知限制，本規格 Never 條款明文排除將其做成完整掃描器。


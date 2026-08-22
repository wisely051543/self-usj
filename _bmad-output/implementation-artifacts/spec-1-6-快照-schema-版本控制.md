---
title: 'Story 1.6 - 快照 Schema 版本控制'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: 'e15e98467350fb151e20d0f5686e996c6754bc84'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [oversized]
deferred:
  - summary: >-
      瀏覽器已快取的**舊** `index.html`（其程式碼裡沒有 schema 守衛）讀到新版 `days.json` 的視窗，
      本 story 無法關閉——守衛只存在於新頁面裡。
    evidence: |-
      本 story 在 `index.html` 加入 `assertCalendarSchema()` / `assertIndexSchema()`，關閉的是
      「新頁面讀到未識別版本」的缺口。但 DW-17 的另一半是舊頁面：使用者瀏覽器快取中的上一版
      `index.html` 完全沒有這兩個函式，v3 的 `days.json` 上線時它仍會照舊渲染。沒有任何伺服器端
      或建置端手段能對已下載的靜態檔補上守衛。
      真正的關閉點是 Epic 2 cutover（新網址／資產指紋），屆時舊頁面不再是同一份資產。
    location: >-
      index.html (loadCalendar / boot 的守衛只保護新載入的頁面)
    severity: low
  - summary: >-
      守衛只比對 `schemaVersion`，不驗證檔案的**形狀**；同一版號下欄位缺漏或型別改變仍會無聲通過。
    evidence: |-
      `src/schema.ts` 的兩個守衛與 `src/schema-check.ts` 只讀 `schemaVersion` 一個欄位。若寫入端
      在不改版號的情況下漏掉 `status`、把 `price` 寫成字串，或 `days` 少了整段日期，所有閘門仍全綠。
      本 story 的 AC 只要求版號守衛，逐欄位 runtime 形狀驗證屬 AD-14a 的後續提案，故明文排除
      （見 Boundaries「Never」第三條）。
    location: >-
      src/schema.ts、src/schema-check.ts
    severity: medium
  - summary: >-
      `.github/workflows/fetch.yml` 在 `npm run fetch` 之後直接 commit/push `data/`，中間沒有
      schema 閘門，且 commit 步驟為 `if: always()`；被回滾的抓取端寫出的舊版快照會先發佈、CI 才紅燈。
    evidence: |-
      本 story 的閘門只掛在 `ci.yml`（push/PR 觸發）。fetch workflow 以預設 `GITHUB_TOKEN` push，
      該 push 通常不會再觸發 workflow，因此壞快照可能在無人注意下停留於已發佈的樹上，直到下一次
      人為 push 才被 CI 攔下。要真正擋在寫入前，須同時改動 commit 步驟的 `if: always()` 條件——
      該條件屬 Story 1.10「零/近零結果視為失敗，不得寫入快照」的範圍，不宜在本 story 單方面更動。
    location: >-
      .github/workflows/fetch.yml:60-68
    severity: medium
  - summary: >-
      `src/fetcher.ts` 的 `readIndex()` 讀 `data/index.json` 後直接 cast 成 `Index`，
      不驗版號且把任何失敗吞成 `null`，是 AD-14 所指的靜默降級。
    evidence: |-
      本 story 為 `index.json` 在 `index.html` 與 `schema-check.ts` 兩處加了守衛，但抓取端自己
      讀回上一輪 `index.json` 的路徑未納入。在此加硬守衛會讓「升版當回合」的抓取直接失敗，
      需要一併決定升版時的遷移行為，超出本 story 的 AC。
    location: >-
      src/fetcher.ts:24-31
    severity: medium
  - summary: >-
      `data/products/*.json` 完全沒有 `schemaVersion` 欄位，因此不在任何版本守衛的涵蓋範圍內。
    evidence: |-
      AD-14 的字面要求是「`data/` 下的每一份檔案各自擁有獨立的 `schemaVersion` 序列」。
      本 story 的 AC 只點名 `days.json` 與 `index.json`，產品檔連版號欄位都尚未存在，
      為其引入版號屬新的結構變更，須自成一個 story。
    location: >-
      data/products/*.json、src/fetcher.ts:38-41
    severity: medium
  - summary: >-
      `index.html` 的 `boot()` 取 `data/index.json` 時未檢查 `res.ok` 就 `res.json()`，
      404/500 會以 JSON 解析錯誤的面貌出現。
    evidence: |-
      同檔的 `loadCalendar()` 有 `if (!res.ok) throw new Error('HTTP ' + res.status)`，`boot()` 沒有。
      此為本 story 之前既有的不對稱（本次僅在該行之後插入版號守衛），錯誤仍會落入既有 catch 顯示
      錯誤框，故非新缺陷，但錯誤訊息會誤導排查方向。
    location: >-
      index.html:1419-1423
    severity: low
  - summary: >-
      沒有任何測試釘住 CI workflow 的閘門步驟本身；把 `ci.yml` 裡的 `- run: npm run schema:check`
      （或 i18n 閘門）整行刪掉，測試套件仍然全綠。
    evidence: |-
      本 story 引用 AD-22「不被執行的規則就不是規則」把閘門接上 `ci.yml`，但 `src/` 底下沒有任何
      測試讀 `.github/workflows/`，三道閘門（tsc、i18n:check、schema:check）都一樣沒有保護。
      這是全 repo 既有的缺口，不是本 story 造成的；要補應該一次涵蓋三道步驟，自成一個 story。
    location: >-
      .github/workflows/ci.yml:28-37
    severity: low
  - summary: >-
      `src/i18n-check.ts` 讀 `data/index.json` 後直接 cast 成 `Index`，是本 story 之外
      第三個未驗版的 `index.json` 消費者，既有 deferred 項目（抓取端 `readIndex()`、
      `products/*.json`）都沒有涵蓋它。
    evidence: |-
      `src/i18n-check.ts` 以 `JSON.parse(fs.readFileSync(...'index.json')) as Index` 讀檔後
      直接走訪 `index.products`，全程不呼叫 `assertIndexSchemaVersion()`。它本身是一道 CI 閘門，
      卻會對版號不符的 `index.json` 回報「翻譯缺漏」而非「版號不符」，把診斷指向錯誤方向。
      目前無實害：`INDEX_SCHEMA_VERSION` 本 story 未變動，且 CI 中 `npm test` 會先於
      `i18n:check` 失敗；只有單獨執行 `npm run i18n:check` 的開發者會遇到誤導訊息。
      此檔為既有程式碼，本 story 未觸及，且 `src/` 下沒有任何 `i18n-check` 的測試檔，
      補守衛應與該檔的測試一併處理。
    location: >-
      src/i18n-check.ts:59
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 1.5 已把 `days.json` 由「只收錄可購列」改成完整 (日期 × 票種) 格網，但 `schemaVersion` 仍停在 `1`，且沒有任何消費者讀它——`index.html` 的 `loadCalendar()` 直接 `res.json()` 後就渲染。結構已變、版號未變、守衛不存在，正是 AD-14 要防的「協調層與渲染層對同一份檔案無聲分歧、渲染出看似正常但語意錯誤的頁面」（DW-17）。

**Approach:** 建立單一版本登記處 `src/schema.ts`（`DAYS_SCHEMA_VERSION = 2`、`INDEX_SCHEMA_VERSION = 5`，兩個獨立常數、兩個獨立守衛），寫入端（`fetcher.ts`／`types.ts`）與消費端（`index.html`、新的 CI 閘門 `src/schema-check.ts`）一律引用它；消費端遇到不等於自己認識的版本一律拋錯中止，不降級渲染，並以測試驅動這條失敗路徑。

## Boundaries & Constraints

**Always:**
- `days.json` 與 `index.json` 各自一個常數、各自一個守衛函式，比對為**嚴格相等**（`!==`，非 `>`／`>=`）；即使版號數字相同也不得共用同一個判斷（AD-14）。
- 消費端讀到不認識的版本 → 拋錯／job 失敗，**不得**以預設值、樂觀解析或部分渲染帶過。
- 未識別版本的失敗路徑必須有自動化測試涵蓋，不能只靠人工檢視（AC3）。
- `data/days.json` 磁碟上的既有檔案結構已是 v2 形狀（每格帶 `status`），其 `schemaVersion` 須一併改為 `2`，否則新守衛會對現有快照紅燈。
- `index.html` 的常數與 `src/schema.ts` 的常數必須由測試綁在一起（比照 `src/limits.test.ts` 把數值讀回來的做法），不得只靠註解防漂移。

**Block If:**
- 若 `data/days.json` 磁碟內容不是 v2 形狀（存在缺 `status` 的格子），代表 1.5 的產出與此處假設不符——HALT，不得靠改版號掩蓋。

**Never:**
- 不得變更 `index.json` 的 `schemaVersion`（維持 `5`），不得變更 `days.json` 或 `products/*.json` 的**結構**（本 story 只動版號與守衛）。
- 不得改動 `buildDays()` 的判定邏輯、排序、`serializeDays()` 的一格一行格式，或任何抓取／速率／排程行為。
- 不得新增 runtime 形狀驗證器（欄位逐一驗型）：AC 只要求版號守衛，形狀驗證屬 AD-14a 的後續提案，記入 deferred。
- 不得改變 `index.html` 在**版號正確時**的任何可見行為。
- 不得為此新增 i18n 字串鍵：錯誤訊息走既有的 `loadFailed`／`productLoadFailed` 樣板，訊息內文為技術性英文。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 版號正確 | `days.json` 的 `schemaVersion === 2` | 日期優先視圖照常渲染，行為與現況一致 | 無 |
| 版號過舊 | 消費者讀到 `schemaVersion: 1` | 守衛拋錯 → 顯示錯誤框，**不渲染任何格子** | `Error`，訊息含實際值與期望值 |
| 版號過新 | 消費者讀到 `schemaVersion: 3` | 同上（嚴格相等，不因「更新」而放行） | 同上 |
| 版號缺失／非數字 | `schemaVersion` 為 `undefined`／`"2"` | 守衛拋錯 | 同上 |
| `index.json` 版號不符 | 讀到 `schemaVersion !== 5` | `boot()` 走既有 catch → 錯誤框，不渲染 | 同上，訊息指名 `index.json` |
| CI 閘門：磁碟快照版號不符 | `data/days.json` 版號非 2 | `npm run schema:check` 以非零碼結束，CI job 紅燈 | stderr 印出檔名與兩個版號 |
| CI 閘門：磁碟快照正常 | 兩個檔皆為預期版號 | exit 0，無輸出雜訊 | 無 |
| 兩個檔版號互不影響 | `days.json` 升至 2 | `index.json` 仍為 5，且 5 不因 2 的變更而被動 | 無 |

</intent-contract>

## Code Map

- `src/schema.ts`（**新檔**）-- 版本登記處。`export const DAYS_SCHEMA_VERSION = 2;`、`export const INDEX_SCHEMA_VERSION = 5;`（`const` + 數字字面值即推導出字面型別 `2`／`5`，供 `types.ts` 以 `typeof` 取用），以及兩個各自獨立的 `assertDaysSchemaVersion(value: unknown): void` / `assertIndexSchemaVersion(value: unknown): void`。**不得** import `types.ts`（避免與下述 `types.ts` 的反向 import 形成循環），參數型別用 `unknown`。
- `src/types.ts:182-185` -- `interface Days { schemaVersion: 1; ... }`：改為 `schemaVersion: typeof DAYS_SCHEMA_VERSION;`，並把 `Index.schemaVersion`（`src/types.ts:187-188`，現為 `5`）改為 `typeof INDEX_SCHEMA_VERSION`，使型別與常數同源、日後升版只改一處。
- `src/fetcher.ts:208` -- `return { schemaVersion: 1, days };`：改用 `DAYS_SCHEMA_VERSION`。
- `src/fetcher.ts:361` -- 寫 `index.json` 的 `schemaVersion: 5`：改用 `INDEX_SCHEMA_VERSION`（值不變）。
- `src/fetcher.ts:219` -- `serializeDays()` 以 `` `  "schemaVersion": ${days.schemaVersion},` `` 輸出：讀的是物件欄位，**不需改**，會自動輸出 2。
- `src/schema-check.ts`（**新檔**）-- CI 閘門，命名與用法比照 `src/i18n-check.ts`（`ROOT = path.join(__dirname, '..')`、`main()`、`npm run` 腳本）。匯出可測的 `checkSnapshots(dataDir: string): void`（讀 `days.json`／`index.json`，各自呼叫對應 assert；讀不到或 JSON 解析失敗亦視為失敗），`main()` 捕捉後 `console.error` 並設 `process.exitCode = 1`。
- `package.json:5-11` -- `scripts` 新增 `"schema:check": "ts-node src/schema-check.ts"`（與 `i18n:check` 同型）。`test` 腳本以 `find src -name '*.test.ts'` 收檔，新測試檔自動納入。
- `.github/workflows/ci.yml:28-32` -- 三道閘門之後新增 `- run: npm run schema:check`，附一行說明它擋的是「磁碟快照版號與程式碼認識的版本分歧」（AD-14）。這是本 story「建置中止並報錯」在**現階段唯一存在的建置管線**上的落點——Epic 2 的 SSG 建置尚未存在（Story 2.1 為 backlog），屆時該建置須改為引用同一個 `src/schema.ts`。
- `index.html:286-289` -- `STALE_MS` 等頁面常數區。於此加入 `const DAYS_SCHEMA_VERSION = 2;` 與 `const INDEX_SCHEMA_VERSION = 5;`（頁面為單檔無模組邊界，無法 import TS 常數，故以測試綁定，見下）。
- `index.html:1020-1026` -- `loadCalendar()`：`calendar = await res.json();` 之前插入 `assertCalendarSchema(doc)`。呼叫端 `index.html:1232-1237` 已 `try/catch` → `showProductError()`，因此拋錯即得到「錯誤框、不渲染任何格子」，**無須新增錯誤處理路徑**。
- `index.html:1377-1384` -- `boot()`：`render(await res.json())` 拆成先取 `doc`、`assertIndexSchema(doc)`、再 `render(doc)`；既有 catch 已顯示 `loadFailed` 錯誤框。
- `src/day-view.test.ts:28-53` -- `extractFunction()` 以大括號配對從 `index.html` 抽出函式、在 `node:vm` 中執行。新守衛函式須寫成 `function assertCalendarSchema(doc) { ... return doc; }` 才能被它抽出（該 helper 斷言抽出的原始碼含 `return`），且**函式本體不得含大括號字面值**——錯誤訊息用字串串接（`'... ' + doc.schemaVersion + ' ...'`），不要用含 `${}` 以外結構的樣板字串，以免破壞大括號配對。
- `src/fetcher-grid.test.ts:176` -- `assert.equal(days.schemaVersion, 1, 'the version bump is Story 1.6, not this one');`：改為斷言 `DAYS_SCHEMA_VERSION`（自 `./schema` import），註解一併更新。
- `data/days.json:2` -- `"schemaVersion": 1,` → `2`。檔案結構已是格網（每格帶 `status`），僅版號落後；不改任何格子內容。`writeDays()` 的「內容未變不寫檔」規則不受影響（下一回合會因版號行不同而重寫，屬預期）。
- `src/limits.test.ts:104-106` -- 把常數自 `index.html` 讀回來比對的既有範例，新測試沿用同一手法。

## Tasks & Acceptance

**Execution:**
- `src/schema.ts`（新）-- 建立版本登記處：兩個獨立常數 + 兩個獨立嚴格相等守衛，各自拋出指名檔名的 `Error` -- AD-14 要求各檔版號互不相干，共用一個泛用比較函式會讓「數字碰巧相同」變成放行理由
- `src/types.ts` -- `Days.schemaVersion` / `Index.schemaVersion` 改為 `typeof` 對應常數 -- 型別與登記處同源，升版時不可能只改到一邊
- `src/fetcher.ts` -- 第 208、361 行改用常數 -- 寫入端與消費端讀同一個號碼來源
- `src/schema-check.ts`（新）-- CI 閘門：讀 `data/` 兩檔、各自驗版、失敗印訊息並 `process.exitCode = 1`；匯出 `checkSnapshots()` 供測試直接驅動 -- 「建置遇未識別版本中止」在現行管線上的可執行落點
- `package.json` -- 新增 `schema:check` 腳本 -- 讓閘門有單一入口，CI 與本機一致
- `.github/workflows/ci.yml` -- 新增 `npm run schema:check` 步驟 -- 閘門不被執行就不是閘門（AD-22）
- `index.html` -- 加入兩個版號常數與 `assertCalendarSchema()` / `assertIndexSchema()`，接到 `loadCalendar()` 與 `boot()` -- 現役渲染層讀到未識別版本時直接停在錯誤框，而非把缺欄位的格子畫出來
- `data/days.json` -- 版號 1 → 2 -- 磁碟快照已是 v2 形狀，版號補上才與登記處一致（否則新閘門立刻紅燈）
- `src/schema.test.ts`（新）-- 涵蓋 I/O Matrix 全部八列：兩個守衛對舊版／新版／缺失／非數字皆拋錯、對正確版號放行；`checkSnapshots()` 以 `t.mock.method(fs, 'readFileSync', ...)` 餵入壞版號的合成檔並斷言拋錯、餵正確版號則通過；以 `node:vm` 抽出 `index.html` 的兩個守衛執行同一組案例；並斷言 `index.html` 的兩個字面值分別等於 `DAYS_SCHEMA_VERSION`／`INDEX_SCHEMA_VERSION`、且兩常數為互相獨立的宣告 -- 把「未識別版本使建置失敗」鎖成可回歸驗證的路徑（AC3）
- `src/fetcher-grid.test.ts` -- 第 176 行改斷言 `DAYS_SCHEMA_VERSION` -- 1.5 留下的「升版屬 1.6」佔位斷言在此兌現

**Acceptance Criteria:**
- Given 本 story 完成, when 檢視 `buildDays()` 產出與 `data/days.json`, then `schemaVersion` 為 `2`，而 `data/index.json` 與 `fetcher.ts` 寫入端的 `index.json` 版號仍為 `5`
- Given `src/schema.ts`, when 檢視兩組常數與守衛, then 兩者為各自獨立的宣告與比對，改動其中一個號碼不會影響另一個的判斷結果
- Given 版號正確的快照, when 開啟日期優先視圖, then 顯示內容與本 story 之前完全一致（無可見行為變更）
- Given `data/days.json` 的版號被改成任何非 `2` 的值, when 執行 `npm run schema:check`, then 程序以非零碼結束且 stderr 指名 `days.json` 與兩個版號
- Given `npm test`, when 執行, then 新測試涵蓋消費端「讀到未識別版本即失敗」的路徑並通過，且無既有測試因版號變更而紅燈

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 3, low 2)
- defer: 4: (high 0, medium 3, low 1)
- reject: 9: (high 0, medium 1, low 8)
- addressed_findings:
  - `[medium]` `[patch]` `src/fetcher-grid.test.ts` 的版號斷言改成與寫入端同一個常數後成為恆真式，全專案再無任何測試把版號釘在具體數字上——在 `src/schema.test.ts` 補上唯一一組字面值釘樁（`DAYS_SCHEMA_VERSION === 2`、`INDEX_SCHEMA_VERSION === 5`），同時直接涵蓋 AC1。
  - `[medium]` `[patch]` `src/schema-check.ts` 的 `main()`／`process.exitCode = 1`（AC 明文要求的「非零碼結束」）無任何測試執行到，刪掉該行測試仍全綠——`main()` 改為接受 argv 資料夾（test-only seam），新增三個以子行程實跑 CLI 的測試，斷言離開碼與 stderr 內容。
  - `[medium]` `[patch]` `index.html` 兩個守衛的呼叫點只由「原始碼字串順序」斷言，把 `assertCalendarSchema(doc)` 包進吞例外的 try/catch 後 13 個測試仍全綠、DW-17 的失敗重新打開——新增以 `node:vm` 實跑 `loadCalendar()`／`boot()`（stub `fetch`／`catalog`／`render`）的四個測試，斷言拒絕、`calendar` 未被快取、`render` 未被呼叫。
  - `[low]` `[patch]` `src/types.ts` 對登記處為值匯入卻只用於型別位置，在 `verbatimModuleSyntax`／ESM 下會變成真實執行期相依——改為 `import type`。
  - `[low]` `[patch]` `.github/workflows/ci.yml` 的註解描述的是本次變更所移除的舊行為，讀起來像在描述新狀態——改寫為閘門現在保證什麼。

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 0, low 1)
- defer: 3: (high 0, medium 0, low 3)
- reject: 10: (high 0, medium 0, low 10)
- addressed_findings:
  - `[low]` `[patch]` `src/schema-check.ts` 的 `readSchemaVersion()` 對內容為合法 JSON 但頂層值為 `null`（或非物件）的快照檔，會在 `(JSON.parse(raw) as {...}).schemaVersion` 這行對 `null` 取屬性拋出 `TypeError`，被同一個 `catch` 誤標成「不是合法 JSON」。改為先判斷 `parsed && typeof parsed === 'object'` 才讀 `.schemaVersion`，否則回傳 `undefined`，讓錯誤路徑落回既有的「版號不符」訊息而非誤導的解析失敗訊息。`npx tsc -p tsconfig.test.json`、`npm test`（65 綠）、`npm run schema:check`（exit 0）與 `node -e` 讀回版號（`2 5`）均已重新驗證通過。
- deferred_findings（已寫入 `deferred-work.md`，非本 story 範圍）:
  - `src/fetcher.ts` 的 `readIndex()` 讀回上一輪 `index.json` 時未驗版；目前無實害（`INDEX_SCHEMA_VERSION` 本 story 未變動），但 AD-14 精神上也涵蓋此路徑。
  - 逐票種快照檔（`data/products/*.json`）完全沒有 `schemaVersion` 欄位，本 story Boundaries 明文排除變更其結構。
  - 新增的 `schema:check` CI 步驟對 `fetch.yml` 用預設 `GITHUB_TOKEN` push 的排程回合實際不會觸發（GitHub 反遞迴保護），僅對人工 push／PR 生效；`index.html` 端守衛仍會擋下錯誤資料，故 AC 不受影響。
- rejected_findings（noise，已對照 spec 逐一核實非缺陷）: CI 步驟與 `schema.test.ts` 對已提交快照的檢查重複（spec 明文要求兩者並存）；`fetcher-grid.test.ts` 改用匯入常數比對後趨於恆真（其餘測試已涵蓋常數本身為 2）；守衛只驗版號不驗欄位形狀（spec frontmatter 既有 deferred 項目已記錄）；`schema.ts` 與 `index.html` 的守衛函式命名不同（spec Code Map 明文各自命名）；`index.html` 用括號配對抽取函式的脆弱性（既有手法，spec 已要求避免 `${}` 以避開此問題）；錯誤訊息為未翻譯英文（spec Boundaries 明文要求技術性英文、不新增 i18n 鍵）；測試 fixture 缺 `updatedAt` 欄位（`checkSnapshots` 本就不驗該欄位，無實害）；`rejectedVersions()` 未涵蓋頂層非物件 JSON（現況已因 `undefined` 而正確失敗，非必要案例）；`checkSnapshots` 寫死兩個檔名而非資料驅動（比照既有 `i18n-check.ts` 風格，spec 明文如此設計）；部署時序評論（與 spec frontmatter 既有 DW-17 殘留項目重複）。

### 2026-08-22 — Review pass（第三輪，followup review）
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 1: (high 0, medium 0, low 1)
- reject: 18: (high 0, medium 0, low 18)
- addressed_findings:
  - `[medium]` `[patch]` `data/days.json` 的版號是本 story 用手改的（1 → 2），檔案其餘一行未動，而所有守衛都只讀那個數字——「v1 形狀配上被改掉的 v1 版號」這個相反的錯誤能一路綠燈通過閘門、被頁面接受、然後每一格畫成售完。在 `src/schema.test.ts` 新增 `the committed days.json really has the shape its version claims`：直接讀已提交的 `days.json`，斷言每一天都有格子、每一格都帶 `status`（實測 185 天 × 31 格 = 5735 格全數通過）。這是**測試專用**的釘樁，不是 AD-14a 的 runtime 逐欄位驗型器（不在 `schema-check.ts` 內、不在執行期跑），故 Boundaries「Never」第三條未被違反，既有的 deferred 形狀項目也照舊保留。
  - `[medium]` `[patch]` `days.json` 版號過舊那一列的 I/O Matrix 期望是「顯示錯誤框，**不渲染任何格子**」，但該結果屬於 `setView()`，而測試只驗到 `loadCalendar()` 自己的邊界（rejects + `calendar` 未快取）。`index.json` 那一半反而有 `boot()` 的實跑測試，兩邊不對稱：把 `assertCalendarSchema` 的例外吞掉、或在 await 之前先畫日卡，現有測試會全綠而 DW-17 對 `days.json` 重新打開。`runPage()` 增抽 `setView` 與 `showProductError`（另補 `renderDay`／`writePref`／`querySelectorAll` 等 stub），新增兩個測試斷言：版號過舊時 `renderDay` 零次呼叫且錯誤框指名 `days.json`；版號正確時 `renderDay` 恰好一次、錯誤框不出現。
  - `[low]` `[patch]` 三個以子行程實跑閘門的測試用 `assert.notEqual(gate.status, 0)`，而被訊號殺掉（`status === null`）或 ts-node 編譯失敗同樣是非零／非 0，等於「閘門根本沒跑」也算通過；且 `1[\s\S]*2` 這個 stderr 樣式幾乎任何堆疊訊息都能滿足。改為 `assert.equal(gate.status, 1)` 並比對完整訊息字串（`days.json schemaVersion is 1, expected 2`／`index.json schemaVersion is 6, expected 5`）。同時給 `spawnSync` 補 `timeout: 60_000`——`node:test` 預設無逾時，卡住的閘門會無聲吊死整個套件。
  - `[low]` `[patch]` `src/schema-check.ts` 的 `main()` 以 `argv[0] ?? path.join(ROOT, 'data')` 取資料夾，空字串不被 `??` 視為缺值，未設定的環境變數會讓閘門去檢查工作目錄下的檔案而非 `data/`。改為 `||`，並在註解說明原因。

### 2026-08-22 — Review pass（第四輪，followup review）
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 1, low 4)
- defer: 1: (high 0, medium 0, low 1)
- reject: 22: (high 0, medium 0, low 22)
- addressed_findings:
  - `[medium]` `[patch]` `src/schema.test.ts` 的 `runPage()` 以 `getElementById: () => root` 讓**每一個 id 都拿到同一個物件**，而 `boot()` 的 catch 寫 `#root`、`setView()`／`showProductError()` 寫 `#product-root`。兩個錯誤框被混為一談後，`assert.equal(page.errorBox(), '')`（index 正常路徑）與 `doesNotMatch(page.errorBox(), /days\.json/)`（days 正常路徑）都比讀起來寬鬆——後者在正常路徑上讀到的其實是載入中的 placeholder，任何內容都滿足該樣式。改為依 id 建立元素（`els[id] ??= { innerHTML: '' }`），並把兩個弱斷言收緊為 `html('root')` 精確為空、`html('product-root')` 不含 `error-box`。突變驗證：把 `boot()` 的 catch 改寫到 `#product-root`（寫錯宿主的回歸），舊版測試全綠，新版立即紅燈。
  - `[low]` `[patch]` AC4 指名的呼叫是 `npm run schema:check`——不帶引數，資料夾來自 `argv[0] || path.join(ROOT, 'data')`。但三個子行程測試一律傳入 fixture 資料夾，`checkSnapshots(DATA_DIR)` 也是顯式傳入，因此**CI 唯一會走的那條預設分支沒有任何測試執行過**（第三輪把該行由 `??` 改為 `||` 的修補同樣沒有測試）。`runGate()` 的參數改為選用，新增 `the gate checks this repo's own data/ when run with no argument`，斷言 exit 0 且 stdout／stderr 皆為空。突變驗證：把預設改成 `ROOT/nope`，該測試紅燈。
  - `[low]` `[patch]` 登記處有 `bumping one file's version says nothing about the other`（把對方的版號餵進來），頁面卻沒有對應測試——而頁面那兩個號碼是相隔四行的手抄字面值，才是更可能被交叉接錯的地方；既有的「版號相等」測試在兩個號碼都對的前提下，無論怎麼接線都會綠。新增 `the page's two guards say nothing about each other's file`，並補上 `page.assertIndexSchema(null)`（`assertCalendarSchema` 早有此案例）。突變驗證：把頁面 `assertIndexSchema` 改比 `DAYS_SCHEMA_VERSION`，三個測試紅燈。
  - `[low]` `[patch]` `## Suggested Review Order` 十二個行號連結中有六個已經漂移（`schema.ts:40`→41、`types.ts:189`→194、`fetcher-grid.test.ts:129`→179、`ci.yml:36`→41、`schema-check.ts:27`→36、`index.html:1058`→1065）——這一節存在的唯一目的就是把人帶到那一行，連結錯了整節就失效。逐一核對後更新。
  - `[low]` `[patch]` `.github/workflows/ci.yml` 新增步驟的註解寫「A snapshot on any other version fails the job here rather than reaching the page」，但 `fetch.yml` 以預設 `GITHUB_TOKEN` push，GitHub 不會為那些 commit 觸發 workflow（DW-20 已載明），排程回合寫出的漂移快照要等下一次人為 push 才紅燈。註解改為誠實敘述涵蓋範圍，並指出頁面守衛才是那段空窗期的實際防線。
- deferred_findings（已寫入 `{spec_file}` frontmatter `deferred`）:
  - `src/i18n-check.ts:59` 是第三個未驗版的 `index.json` 消費者，既有 deferred 項目（`fetcher.ts` 的 `readIndex()`、`products/*.json`）皆未涵蓋；本 story 未觸及該檔，且 repo 內沒有 `i18n-check` 的測試檔。
- rejected_findings（noise，已逐一核實非本輪缺陷）：`deferred-work.md` 的格式與重複問題（DW-17 與 DW-18 之間三個無編號、無 `status` 的項目，內容分別重複 DW-21／DW-22／DW-20；另 DW-24 的理由誤稱「`src/` 底下沒有任何測試讀 `.github/workflows/`」，實際上 `src/limits.test.ts:72,84,92` 就在讀 `fetch.yml`，且其後果被高估——`schema.test.ts` 的 `checkSnapshots(DATA_DIR)` 已在 `npm test` 內涵蓋已提交快照）——**帳本項目由 orchestrator 擁有，本次不得改寫，改列入下方殘留風險回報**；spec frontmatter 的 `review_loop_iteration: 0`（該計數器記的是 bad_spec 迴圈次數，非審查輪次，目前確實為 0）；`## Spec Change Log` 為空（僅記錄 bad_spec 修訂，四輪皆無）；`selectProduct()` 渲染 `products/*.json` 無守衛（根因是這批檔連 `schemaVersion` 欄位都沒有，已為 DW-22）；`checkSnapshots` 只回報第一個壞檔（Code Map 明文比照 `i18n-check.ts`，第三輪已駁回）；`readSchemaVersion` 與頁面守衛對「頂層非物件」的診斷訊息不夠精確（兩者仍正確失敗，屬措辭）；`fetch.yml` 未掛任何閘門（Boundaries 明文禁止改動抓取／排程行為，已為 DW-20）；`boot()` 未檢查 `res.ok`（已為 DW-23）；頁面守衛的 `return doc` 與字串串接為 `extractFunction()` 的抽出前提（Code Map 明文）；登記處與頁面守衛命名不同（Code Map 明文）；`extractFunction` 在兩個測試檔重複（`day-view.test.ts` 沒有 async 函式要抽，非缺陷）；`sliceFunction` 的 `at - 6` 負索引與「第一個 `function NAME(`」歧義（在 HTML 中皆不可達／目前無同名函式）；測試檔 582 行與三次子行程啟動（三個各自獨立的 CLI 契約，屬刻意）；AC1 只靠單一組字面值斷言（該斷言即為第一輪的補強，設計如此）；形狀釘樁貼近 Boundaries「Never」邊界（測試專用、不在執行期，第三輪已論證接受）；差異三分之二為 `_bmad-output/`（工作流產物）；`renderDay` 為 stub 故未重現「整片售罄」原始症狀（完整 DOM 超出 `node:vm` 抽取式測試的射程）。

## Design Notes

**為何嚴格相等而非「大於才擋」：** 抓取端若因故回滾至 v1、站台仍是 v2，`>` 型守衛會放行 v1 檔案，而 v1 沒有 `status` 欄位 → 每一格渲染 `undefined` 且 CI 全綠。這正是 AD-14 要防的無聲分歧，故守衛一律 `!==`。

**為何頁面常數用測試綁定而非產生：** `index.html` 是無建置步驟的單檔（AD-8 之前的現況），無法 import TS 常數。`src/limits.test.ts` 已建立「把數值讀回來比對」的先例，沿用它比引入產生器誠實且成本低。Epic 2 的 SSG 上線後，該常數應改為建置時 bake，本綁定測試屆時退場。

**DW-17 的殘留：** 本 story 關閉「新頁面讀到未識別版本」的缺口，但無法關閉「瀏覽器已快取的**舊** `index.html`（無守衛）讀到新檔」的視窗——舊頁面的程式碼裡沒有守衛可執行。該殘留須在 Epic 2 cutover（新網址／新資產指紋）時才真正消失，記入 deferred。

## Verification

**Commands:**
- `npx tsc -p tsconfig.test.json` -- expected: 無型別錯誤（`typeof` 常數導入後，任何殘留的 `schemaVersion: 1` 字面值都會在此暴露）
- `npm test` -- expected: 全部通過，含新增的 `src/schema.test.ts`
- `npm run schema:check` -- expected: exit 0、無錯誤輸出
- `node -e "const d=require('./data/days.json'),i=require('./data/index.json');console.log(d.schemaVersion,i.schemaVersion)"` -- expected: `2 5`

**Manual checks (if no CLI):**
- 檢視 `index.html` 的 `loadCalendar()` 與 `boot()`，確認守衛在 `render`／`calendar =` 賦值**之前**執行，且失敗路徑不落回任何預設值
- 檢視 `src/schema.ts`，確認兩組常數與守衛沒有共用的泛用比較函式

## Suggested Review Order

**版本登記處（唯一真相來源）**

- 兩個獨立常數 + 兩個獨立守衛，刻意不共用泛用比較函式，避免版號碰巧相同時放行不相干的檔案。
  [`schema.ts:28`](../../src/schema.ts#L28)

- 嚴格相等（`!==`）而非「新版即可」：抓取端回滾至 v1 時必須被擋，而非被當作「更舊也算過」放行。
  [`schema.ts:41`](../../src/schema.ts#L41)

**寫入端接線**

- `types.ts` 的 `schemaVersion` 欄位改綁 `typeof` 常數，往後升版只需改 `schema.ts` 一處，寫錯字面值會直接變型別錯誤。
  [`types.ts:194`](../../src/types.ts#L194)

- `buildDays()` 產出的 `days.json` 版號改讀常數而非寫死 `1`。
  [`fetcher.ts:209`](../../src/fetcher.ts#L209)

**CI 建置閘門**

- `checkSnapshots()` 讀磁碟兩份快照各自驗版，讀不到或解析失敗都視為失敗——是本 story「未識別版本必須中止」在現行管線上唯一可執行的落點。
  [`schema-check.ts:48`](../../src/schema-check.ts#L48)

- Review 修正：頂層值為合法 JSON 但為 `null` 時不再誤標為「JSON 解析失敗」，改落回正確的版號不符路徑。
  [`schema-check.ts:36`](../../src/schema-check.ts#L36)

- 新增 `npm run schema:check` 腳本，讓本機與 CI 走同一個入口。
  [`package.json:8`](../../package.json#L8)

- CI 於既有 i18n 閘門之後接上這道新閘門。
  [`ci.yml:41`](../../.github/workflows/ci.yml#L41)

**消費端渲染守衛**

- `loadCalendar()` 在快取賦值前先驗版，拒絕的快照永遠不會被渲染。
  [`index.html:1065`](../../index.html#L1065)

- `boot()` 對 `index.json` 走相同順序：先驗版、再 `render()`。
  [`index.html:1423`](../../index.html#L1423)

**磁碟快照**

- 既有 `days.json` 的格網結構已是 v2 形狀，版號補上與登記處對齊。
  [`data/days.json:2`](../../data/days.json#L2)

**測試（涵蓋 I/O Matrix 全部八列 + 頁面守衛綁定）**

- `src/schema.test.ts` — 兩守衛、CI 閘門、頁面守衛（以 `node:vm` 抽出執行）三處各自對「過舊／過新／缺失／非數字」全部拋錯，並綁定 `index.html` 常數與登記處同值。
  [`schema.test.ts:1`](../../src/schema.test.ts#L1)

- `src/fetcher-grid.test.ts` 原本斷言寫死 `1` 的佔位，改斷言匯入的 `DAYS_SCHEMA_VERSION`。
  [`fetcher-grid.test.ts:179`](../../src/fetcher-grid.test.ts#L179)

## Auto Run Result

Status: done

**本次（第四輪 followup review）實作摘要**

本輪為 `status: done` 的規格所觸發的追加審查。四個 review layer 全數回報，沒有 intent_gap 也沒有 bad_spec，程式碼未被重新推導。五個 patch 全部落在「守衛與閘門的可回歸驗證強度、以及文件敘述的準確性」上；**執行期行為零改變**（`index.html`、`src/schema.ts`、`src/schema-check.ts`、`src/fetcher.ts`、`src/types.ts`、`data/days.json` 本輪皆未改動）。

**變更檔案**

- `src/schema.test.ts` -- `runPage()` 的 DOM stub 改為依 id 建立元素（原本每個 id 共用同一物件，混淆 `#root` 與 `#product-root`），兩個弱斷言隨之收緊；`runGate()` 參數改為選用並新增「不帶引數＝CI 實際呼叫方式」的子行程測試；新增頁面兩守衛的交叉版號測試與 `assertIndexSchema(null)` 案例。
- `.github/workflows/ci.yml` -- `schema:check` 步驟的註解改為誠實敘述涵蓋範圍（`fetch.yml` 以預設 `GITHUB_TOKEN` push 不會觸發本 workflow），並指出頁面守衛才是該空窗期的防線。
- `_bmad-output/implementation-artifacts/spec-1-6-快照-schema-版本控制.md` -- `## Suggested Review Order` 六個漂移的行號連結更新；新增一則 deferred 與本輪 triage log。

**審查結果分佈**

- patch 已修：5（medium 1、low 4）
- defer 已記錄：1（low，`src/i18n-check.ts:59` 是第三個未驗版的 `index.json` 消費者，既有 deferred 項目未涵蓋）
- reject：22（皆為與既有 deferred／DW 項目重複、規格 Code Map 或 Boundaries 明文指定的設計選擇、或不可達的假想案例；逐項理由見 triage log）

**Follow-up review recommendation**

本輪 patch 依嚴重度計數：high 0、medium 1、low 4；分數 = 3 × 1 + 1 × 4 = 7 ≥ 5 → `followup_review_recommended: true`。

**驗證**

- `npx tsc -p tsconfig.test.json` -- `No errors found`
- `npm test` -- 78 pass / 0 fail（本輪前 76；新增 2 個測試，其餘為既有測試強化）
- `npm run schema:check` -- exit 0，無輸出
- 三次突變驗證，確認新測試確實有咬合：
  1. `main()` 的預設資料夾改為 `ROOT/nope` → 新的無引數閘門測試紅燈（77/1）
  2. 頁面 `assertIndexSchema` 改比 `DAYS_SCHEMA_VERSION` → 三個測試紅燈（75/3）
  3. `boot()` 的 catch 改寫到 `#product-root`（寫錯宿主）→ 一個測試紅燈（77/1）；此回歸在舊的共用 stub 下完全隱形
  每次突變後皆已還原，最終樹為 78/0。

**殘留風險**

- 守衛仍只比對版號，不驗形狀（AD-14a，已 deferred）；`fetch.yml` 排程回合仍不經過 `schema:check`（已 deferred，本輪已把此事實寫進 `ci.yml` 註解）；`ci.yml` 的閘門步驟本身仍無測試釘住（已 deferred）。
- **回報給 orchestrator（本輪依指示未改動帳本）**：`deferred-work.md` 在 DW-17 與 DW-18 之間有三個無 `### DW-n:` 標題、無 `origin`／`location`／`severity`／`status` 的項目，內容分別重複 DW-21、DW-22、DW-20——以 DW 編號或 `status: open` 做分流的工具不會看見它們。另外 DW-24 的 `reason` 有一處事實錯誤：它稱「`src/` 底下沒有任何測試讀 `.github/workflows/`」，但 `src/limits.test.ts:72`、`:84`、`:92` 正在讀 `.github/workflows/fetch.yml` 並斷言其 cron、`timeout-minutes` 與 `concurrency`；同時 DW-24 高估了後果——刪掉 `ci.yml` 的 `- run: npm run schema:check` 並不會讓已提交快照失去檢查，`src/schema.test.ts` 的 `checkSnapshots(DATA_DIR)` 已在 `npm test` 內涵蓋。此文字同時存在於本 spec frontmatter 的 deferred 第 7 項；為免與帳本副本失步，本輪兩邊都未改。

---
title: 'i18n-check.ts 讀取 index.json 與商品檔失敗時的具名錯誤訊息'
type: 'bugfix'
created: '2026-08-23'
baseline_revision: '4a242c03ab4320200ca4dd39e63b707946ed10ae'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      `readTerms()` 是本檔第三個未包裝的 JSON 讀取，`i18n/terms.<locale>.json` 缺檔或壞掉仍會逸出原始
      ENOENT／SyntaxError，訊息不指名檔案也不區分讀檔或解析失敗。
    evidence: |-
      src/i18n-check.ts:44-48 仍是 `JSON.parse(fs.readFileSync(file, 'utf-8'))`，
      新的 readJsonFile() helper 就在其下方數行、一行呼叫即可修好。
      實測缺檔輸出：`Error: ENOENT: no such file or directory, open 'terms.zh-TW.json'`。
      DW-44／DW-45 的意圖只列舉 readIndex() 與 products.map 兩處讀取，故本次未觸碰。
    location: >-
      src/i18n-check.ts:44-48
    severity: low
  - summary: >-
      本檔進入點沒有 schema-check.ts main() 那樣的 try/catch，具名訊息只會以未捕捉例外的堆疊標頭形式送達，
      不是單行 stderr，離場碼也非刻意設定的 process.exitCode = 1。
    evidence: |-
      src/i18n-check.ts 結尾為裸的 `if (require.main === module) { main(); }`；
      對照 src/schema-check.ts:65-72 會 catch、console.error((err as Error).message)、設 exitCode = 1，
      且 schema.test.ts:275-316 以子行程斷言離場碼與 stderr 全文。此為既有行為（改動前的原始 ENOENT
      同樣以堆疊形式輸出），本次未加劇；意圖明文只要求「包住兩處讀取、訊息指名檔案」。
    location: >-
      src/i18n-check.ts（require.main === module 進入點）
    severity: low
  - summary: >-
      `readIndex()` 對解析結果沒有形狀守衛：`index.json` 內容為 `null`／字串／陣列，或版號正確但缺 `products`
      陣列時，仍以原始 TypeError 中止，不是具名訊息。
    evidence: |-
      實測 `index.json` 為 `null` 得到 `TypeError: Cannot read properties of null (reading 'schemaVersion')`；
      `{"schemaVersion": 5}` 得到 `TypeError: Cannot read properties of undefined (reading 'map')`。
      src/fetcher.ts:50,59 與 src/schema-check.ts:36 都已有對應守衛，本檔沒有。
      此為改動前既有行為（原本同樣是 `JSON.parse(...) as Index` 直接取 .schemaVersion），非本次引入。
    location: >-
      src/i18n-check.ts（readIndex() 與 main() 的 index.products.map）
    severity: low
  - summary: >-
      商品檔解析成非物件（例如內容是 `"hello"` 或 `[]`）時完全不會拋錯，main() 會一路跑完並印出
      「0 gap(s)」，是比缺檔更安靜的失效模式。
    evidence: |-
      實測某 product 檔內容為 `"hello"` 時，p.name／p.eyebrow／p.legalDesc 全為 undefined，
      note() 一律略過，工具正常結束並回報 0 gap。包住讀取無法擋這個情境，需要形狀檢查。
      此為改動前既有行為，非本次引入。
    location: >-
      src/i18n-check.ts（main()，products.map 之後的 note() 走訪）
    severity: low
  - summary: >-
      `withFiles()` 這個以 basename mock `fs.readFileSync` 的 helper，在
      `src/i18n-check.test.ts`、`src/fetcher.test.ts`、`src/schema.test.ts` 各有一份逐字複本，
      而 `src/test-support.ts` 早已是共用測試工具的既定去處。
    evidence: |-
      `grep -ln "function withFiles" src/*.ts` 命中三個檔，三份實作彼此僅註解不同，
      且每份註解都指向另一份複本。本輪新增的 Error 值支援（缺檔情境傳 `Error` 而非字串）
      只存在於 i18n-check 那一份，三份已開始分歧。此為改動前既有的重複，非本次引入。
    location: >-
      src/i18n-check.test.ts:23-32、src/fetcher.test.ts、src/schema.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/i18n-check.ts` 的 `readIndex()`（68-72 行）直接 `JSON.parse(fs.readFileSync(...))`，`data/index.json` 不存在或非合法 JSON 時，逸出的是原始 `ENOENT`／`SyntaxError`，訊息既不指出讀的是哪個檔、也不區分是「讀不到」還是「解析失敗」（DW-44）；`main()` 走訪 `index.products`（78-80 行）有相鄰缺口：索引列出的 product code 在 `data/products/` 下沒有對應檔案時，未包裝的 `ENOENT` 不會指出是哪個 product code（DW-45）。

**Approach:** 比照 `src/schema-check.ts` 的 `readSchemaVersion()`（27-40 行）既有樣式，在 `src/i18n-check.ts` 內加一個本地讀檔 helper，把「讀檔失敗」與「解析失敗」分成兩則具名訊息；`readIndex()` 與 `main()` 的商品走訪都改走這個 helper，商品那一路把 product code 一併帶進訊息主詞。

## Boundaries & Constraints

**Always:** 沿用 `readSchemaVersion()` 的兩段式措辭（`X could not be read: <原始訊息>` / `X is not valid JSON: <原始訊息>`），並保留原始例外訊息作為後綴；`readIndex()` 既有的 `assertIndexSchemaVersion()` 版號守衛與其相對順序（先讀檔解析、後驗版號）不變；商品檔的訊息必須同時指出 product code 與檔案路徑。

**Block If:** 無（兩個站點的改動範圍與參考樣式都明確）。

**Never:** 不改動 `readTerms()`（44-48 行，`i18n/terms.*.json` 的同型未包裝讀取）—— 不在 DW-44／DW-45 範圍內；不在 `require.main === module` 進入點加 try/catch 轉成 `process.exitCode`（那是 `schema-check.ts` `main(argv)` 的另一層機制，本次意圖只要求具名訊息）；不改 `readIndex()` 的回傳型別或簽名；不動 `src/schema-check.ts`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 索引正常 | `data/index.json` 存在、合法 JSON、版號相符 | `readIndex()` 回傳解析後的 `Index`，行為與現況一致 | No error expected |
| 索引讀不到 | `data/index.json` 不存在（`ENOENT`） | 拋 `data/index.json could not be read: <原始訊息>` | 具名訊息取代原始 `ENOENT` |
| 索引解析失敗 | `data/index.json` 內容非合法 JSON | 拋 `data/index.json is not valid JSON: <原始訊息>` | 具名訊息取代原始 `SyntaxError` |
| 索引版號不符 | 合法 JSON 但 `schemaVersion` 不符 | 仍拋既有 `index.json schemaVersion is ...` | 不受本次改動影響 |
| 商品檔缺檔 | 索引列出 code `X`，`data/products/X.json` 不存在 | 拋訊息同時含 `X` 與 `data/products/X.json` | 具名訊息取代原始 `ENOENT` |
| 商品檔解析失敗 | `data/products/X.json` 存在但非合法 JSON | 拋 `... is not valid JSON: <原始訊息>`，主詞含 `X` | 具名訊息取代原始 `SyntaxError` |

</intent-contract>

## Code Map

- `src/i18n-check.ts:68-72` -- `readIndex()`：唯一讀 `data/index.json` 的地方，`JSON.parse(fs.readFileSync(...)) as Index` 後接 `assertIndexSchemaVersion()`。DW-44 的改動點。
- `src/i18n-check.ts:76-80` -- `main()` 的 `index.products.map(p => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, `${p.code}.json`), 'utf-8')) as ProductResult)`。DW-45 的改動點；`p.code` 在 callback 作用域內可直接取用。
- `src/i18n-check.ts:18-20` -- `ROOT` / `PRODUCTS_DIR` 常數，訊息中的檔案路徑由此組出。
- `src/schema-check.ts:27-40` -- `readSchemaVersion(file)`：本次要複製的參考樣式（分開的 read / parse try-catch，各自拋具名 `Error`，後綴原始 `(err as Error).message`）。**唯讀參考，不修改。**
- `src/schema.ts:49-54` -- `assertIndexSchemaVersion()`：版號訊息格式 `index.json schemaVersion is ...`，既有測試以 `/index\.json schemaVersion is/` 斷言，改動後必須維持。
- `src/i18n-check.test.ts:23-32` -- `withFiles(t, files)`：以 **basename** 為鍵 mock `fs.readFileSync`，值為 `string` 時回傳、為 `Error` 時 throw。新增測試沿用此 helper：缺檔情境傳 `Error`、壞 JSON 情境傳非法字串；商品檔以 `'<CODE>.json'` 為鍵。
- `src/i18n-check.test.ts:62-77` -- 既有 `main()` 版號測試，其註解說明「若走到 `.products` 就會是 ENOENT」；新增的 DW-45 測試正是驗證那條 ENOENT 路徑現在會具名。
- `src/fetcher.ts:36-60` -- `fetcher.ts` 自己的 `readIndex()` 走「失敗即回 `null`、視為冷啟動」策略。**唯讀參考**：說明為何本檔不採 null 回退——本檔是檢查工具，讀不到就該紅。

## Tasks & Acceptance

**Execution:**
- `src/i18n-check.ts` -- 新增本地 helper（讀檔／解析各自 try-catch、各拋具名 `Error`、後綴原始訊息），`readIndex()` 與 `main()` 的 `products.map` 都改走它；商品那一路的訊息主詞帶入 `p.code` 與商品檔路徑 -- 解決 DW-44 與 DW-45，兩者共用同一個讀檔包裝。
- `src/i18n-check.test.ts` -- 新增四個測試覆蓋 I/O 矩陣的四個錯誤情境（索引缺檔／索引壞 JSON／商品缺檔／商品壞 JSON），沿用既有 `withFiles()` -- 鎖定具名訊息，避免日後改回未包裝讀取。

**Acceptance Criteria:**
- Given `data/index.json` 版號正確、商品檔齊全，when 執行 `npm run i18n:check`，then 輸出與本次改動前完全一致（既有 gap 報表行為不變）。
- Given 既有的版號不符測試，when 執行 `npm test`，then `/index\.json schemaVersion is/` 斷言仍通過（讀檔包裝不得攔截或改寫版號錯誤）。

## Spec Change Log

（本次無 bad_spec 迴圈，無異動。）

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0high, medium 1medium, low 2low)
- defer: 4: (high 0high, medium 0medium, low 4low)
- reject: 12: (high 0high, medium 0medium, low 12low)
- addressed_findings:
  - `[medium]` `[patch]` 重寫後的 `products.map` 運算式沒有任何測試證明「可正常讀取的商品檔仍會完整流入 `products`」——四個新測試全都只把 map 逼進 throw，既有測試則一律 `products: []`。新增一個以 `[en]` 缺英文名報表為觀測點的正常路徑測試（該報表直接讀解析後的物件，不依賴詞彙表，不會因無關原因變綠）。
  - `[low]` `[patch]` 商品訊息把 `data/products/<code>.json` 手寫第二遍，與真正開啟的 `path.join(PRODUCTS_DIR, ...)` 是兩條各自獨立的運算式；`PRODUCTS_DIR` 一旦搬動，訊息會理直氣壯地指向從未被讀取的路徑。改為以 `path.relative(ROOT, file)` 從實際開啟的路徑推導標籤（索引那一路同樣處理），訊息字串在 posix 上完全不變。
  - `[low]` `[patch]` 兩個解析失敗斷言的正則停在 `is not valid JSON: ` 的冒號空白處，若日後改動把底層 `SyntaxError` 細節丟掉（或變成空字串）測試仍會通過。兩處正則各補一個 `\S`，鎖住「原始解析訊息確實有被保留」。
- rejected_findings（noise，均為 low，理由簡述）:
  - `(err as Error).message` 對非 Error 拋出物會印出 `undefined`，建議改用 `err instanceof Error ? ... : String(err)` -- `fs.readFileSync` 與 `JSON.parse` 只會拋 Error，此分支不可達；且參考樣式 `schema-check.ts:32,38` 正是這個寫法，意圖合約的 Always 明文要求沿用。
  - 包裝時未帶 `{ cause: err }`，遺失 `err.code` 與原始堆疊 -- 沒有任何下游消費者檢查 `.code`，參考樣式同樣未帶，屬理論性損失。
  - 訊息硬編正斜線，Windows 上與實際路徑分隔符不符 -- 本專案 CI 與開發環境皆為 posix，且顯示字串跨平台穩定反而是刻意取捨。
  - 多個商品檔同時損壞時 `.map` 只回報第一個，建議改為蒐集全部後一次回報 -- 屬既有的 fail-fast 行為（改動前 `.map` 同樣在第一個就中止），意圖只要求「指出是哪個 product code」，已達成。
  - ENOENT 測試是循環論證：斷言裡的 `ENOENT` 字樣來自測試自己造的 Error -- `withFiles()` 是本 repo（含 `schema.test.ts`）既定的 mock 慣例，該測試要鎖的是具名前綴，前綴那一半並非循環。
  - `readJsonFile` 回傳 `unknown`、把 `as` 轉型推給呼叫端，建議改泛型 -- 意圖合約要求維持與現況相同的型別姿態，改簽名屬範圍外。
  - `readJsonFile` 與 `schema-check.ts` 的 `readSchemaVersion` 骨架重複，建議抽共用模組 -- 跨模組重構不在意圖範圍內，且兩者訊息主詞策略已刻意分歧（basename vs 呼叫端標籤）。
  - product code 含路徑分隔符或 `..` 時會逃出 `data/products/` -- `data/index.json` 由本專案自家 fetcher 產生、非不受信任輸入，且為既有行為。
  - `p.code` 為 undefined／非字串時訊息會變成 `product undefined (...)` -- 同上，索引為自家產物，屬既有行為。
  - `terms` 檔解析後缺 `terms` 物件會 TypeError -- 屬 `readTerms()` 範圍，已改列 defer，不重複計。
  - 測試檔中 `/* DW-44 / DW-45 */` 區塊是浮空註解，未綁定任何單一測試 -- 純風格瑕疵，該區塊正是四個測試的共同前言。
  - 測試檔註解稱「one per cell of the spec's error matrix」與 `readTerms()` 未涵蓋一事不符 -- 矩陣本身即只涵蓋意圖列舉的兩處讀取，敘述與矩陣一致。

### 2026-08-23 — Review pass（follow-up）
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0high, medium 1medium, low 1low)
- defer: 1: (high 0high, medium 0medium, low 1low)
- reject: 16: (high 0high, medium 0medium, low 16low)
- addressed_findings:
  - `[medium]` `[patch]` 上一輪補的正常路徑測試是本檔唯一跑完 `main()` 的測試，因此也是唯一會走到 `readTerms()` 的；`withFiles()` 對未指名的 basename 會回退真實 `fs`，該測試等於偷讀 `i18n/terms.zh-TW.json` 與 `i18n/terms.en.json` 兩個真實檔——談商品串接的單元測試會因為詞彙表搬家而變紅（且變紅方式正是本次要消滅的裸 ENOENT）。fixture 補上兩張空詞彙表並在註解說明原因。
  - `[low]` `[patch]` 同一測試的斷言只比對到 `has no English name` 為止，停在巢狀 `ja` 值之前：只證明 `attractionNames` 的鍵有到，沒證明巢狀物件完整抵達。斷言延長到含 `ぬるぽアトラクション`，讓「完整流入」這句話真的被鎖住。
- rejected_findings（noise，均為 low，理由簡述）:
  - `readTerms()` 未包裝、進入點無 try/catch、`readIndex()` 無形狀守衛、商品檔非物件時安靜回報 0 gap、`index.products` 非陣列無守衛、terms 檔缺 `terms` 物件 -- 皆已列於 frontmatter `deferred`（本輪之前即已登錄），不重複計。
  - 缺少「多個商品、第二個才壞」的測試 -- 訊息主詞由 `.map` callback 內的 `p.code` 就地組出，指錯商品在結構上不可能發生。
  - 兩個解析失敗 fixture 底層同為 `Unexpected end of JSON input`，`\S` 斷言過寬 -- `\S` 是上一輪刻意的取捨：鎖住「原始訊息有被保留」，同時不把測試綁死在 Node 版本間會變動的 `SyntaxError` 措辭。
  - ENOENT fixture 與 Node 真實訊息不符（真實訊息帶絕對路徑，等於路徑講兩次）-- 後綴保留原始訊息是意圖合約 Always 明文要求，重複是該要求的必然結果。
  - `i18n:check` 用 `data/index.json`、`schema:check` 用 `index.json`，同一檔兩種標籤 -- 意圖的 I/O 矩陣明文寫死 `data/index.json`，且本檔另有既有的 `index.json schemaVersion is ...` 訊息，前綴分開反而可辨識。
  - `subject` 由呼叫端自行組 `path.relative(ROOT, file)`，仍是重述 -- 兩處呼叫端的 label 都由同一個 `file` 變數推導，不存在指向未讀檔案的路徑。
  - 前言註解說「These four」卻後接第五個測試 -- 第二個註解區塊自己就是第五個測試的前言，兩塊各自成立。
  - `{ cause: err }`、非 Error 拋出物、`unknown` 回傳型別、Windows 路徑分隔符、`.map` fail-fast、product code 路徑逃逸 -- 與上一輪同案，理由不變（見上一則 Review pass 的 rejected_findings）。

## Design Notes

參考樣式（`schema-check.ts:27-40`）的關鍵在於 read 與 parse 分兩段 try-catch：合併成一段就無法區分「檔案不在」與「檔案壞了」，而這正是 DW-44 抱怨的其中一半。helper 回傳 `unknown`，由呼叫端各自 `as Index` / `as ProductResult`，維持與現況相同的型別姿態。

商品訊息主詞同時帶 code 與路徑（例如 `product ABC (data/products/ABC.json) could not be read: ...`）：只給路徑雖然 basename 就是 code，但明講 `product ABC` 才直接對上 `index.json` 裡的那一筆，讀 log 的人不必反推。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無型別錯誤
- `npm test` -- expected: 全部測試通過（含新增的四個 `i18n-check.test.ts` 測試）
- `npm run i18n:check` -- expected: 在正常 repo 資料下輸出與改動前一致，正常結束

## Auto Run Result

**變更摘要：** `src/i18n-check.ts` 新增本地 `readJsonFile(file, subject)` helper（比照 `schema-check.ts` 的 `readSchemaVersion()`，讀檔與解析各自 try/catch、各拋具名 Error 並後綴原始訊息）；`readIndex()` 與 `main()` 的商品走訪都改走它，商品那一路的訊息主詞同時帶入 product code 與商品檔路徑。解決 DW-44（索引讀取失敗訊息不具名、不區分讀檔／解析）與 DW-45（商品缺檔的 ENOENT 不指出是哪個 product code）。本輪為 follow-up review pass，程式碼行為未變，只補強測試。

**變更檔案：**
- `src/i18n-check.ts` -- 新增 `readJsonFile()` helper；`readIndex()` 與 `products.map` 改走它；訊息標籤一律由實際開啟的路徑以 `path.relative(ROOT, file)` 推導，不重複手寫路徑字串。（本輪未再改動。）
- `src/i18n-check.test.ts` -- 共六個測試：I/O 矩陣四個錯誤情境（索引缺檔／索引壞 JSON／商品缺檔／商品壞 JSON）、一個正常路徑測試；本輪把正常路徑測試的 fixture 補上兩張空詞彙表（`terms.zh-TW.json`／`terms.en.json`），並把斷言延長到含巢狀 `ja` 值。

**Review 結果（本輪）：** patch 2（medium 1、low 1）、defer 1（low 1）、reject 16（low 16）、intent_gap 0、bad_spec 0。
四層審查（blind-hunter、edge-case-hunter、verification-gap、intent-alignment）全數完整回傳；`verification-gap` 回報「No verification gaps found」，其餘三層獨立指向同一個真實缺口——正常路徑測試偷讀真實 `i18n/terms.*.json`——已於本輪修掉。

**Follow-up review recommendation：** `false`（本輪 patch 為 medium 1、low 1：3×1 + 1×1 = 4 < 5，且無 high）。

**驗證：**
- `npm run typecheck` -- 通過，無型別錯誤。
- `npm test` -- 128 個測試全數通過。
- `npm run i18n:check` -- 輸出 `0 gap(s), 0 attraction(s) without an English name.`，離場碼 0，與改動前一致。
- Patch 有效性實測 -- 暫時把 `i18n/terms.en.json` 移走後單跑 `src/i18n-check.test.ts`，9 個測試仍全綠（含正常路徑那個）；修補前該情境會讓測試以裸 ENOENT 中止。檔案已還原，`ls i18n/` 確認兩張詞彙表都在。

**殘留風險：** 見 frontmatter `deferred` 的五筆（`readTerms()` 仍未包裝、進入點缺 stderr／exitCode 收斂、`readIndex()` 無形狀守衛、商品檔解析為非物件時安靜回報 0 gap、`withFiles()` 在三個測試檔重複）。五筆皆為改動前即存在、本次未加劇的既有行為，且皆在意圖列舉的兩處讀取之外。

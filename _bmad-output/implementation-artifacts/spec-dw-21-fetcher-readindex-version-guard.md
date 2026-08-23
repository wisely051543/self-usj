---
title: 'fetcher.ts readIndex() 補上 index.json 版號守衛'
type: 'bugfix' # feature | bugfix | refactor | chore
created: '2026-08-23'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: 'cfc7b3c80a5aa78a24fbe6c9487b74ce39504ec1'
review_loop_iteration: 0 # incremented by step-04 before each review loopback
followup_review_recommended: false # set by step-04 on status: done — true if the LLM decided another review pass is worthwhile
context: []
warnings: []
deferred:
  - summary: >-
      `readIndex()` 的檔案不存在／JSON 解析失敗路徑仍全數靜默回傳 `null`，與本 story 新加的版號不符
      路徑（會 `console.error`）不對稱。
    evidence: |-
      版號不符與讀取／解析失敗同屬 AD-14 所指「不驗證即接受異常快照」的範疇，但本 story 依 Boundaries
      「Always」第 3 條明文要求後者維持現況靜默，僅補上版號檢查一條路徑的可見度。若未來要讓抓取端的
      異常快照全面可觀測，需一併決定讀取／解析失敗要不要 log、log 什麼內容（例如是否要區分 ENOENT
      與 JSON 語法錯誤），超出本 story 範圍。
    location: >-
      src/fetcher.ts:38-42（readIndex() 第一段 try/catch）
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 的 `readIndex()` 讀回上一輪 `data/index.json` 後直接 cast 成 `Index`，從未呼叫 `assertIndexSchemaVersion()`，是 AD-14 版本守衛尚未涵蓋的一條路徑（DW-21；DW-27 為重複副本）。

**Approach:** 在 `readIndex()` 內對已解析的 JSON 呼叫 `assertIndexSchemaVersion()`；版號不符時印出指名實際與期望版號的 `console.error`，並回傳 `null`，讓本回合走既有的「無上一輪快照」路徑（首次抓取本就是這條路徑）。因所有票種的 `lastSeenAt` 都會設為本回合時間，`sweepDelisted()` 不會誤刪任何票種，代價僅為升版當回合失去 `carriedOver` 的補撈。

## Boundaries & Constraints

**Always:**
- 版號比對透過 `src/schema.ts` 既有的 `assertIndexSchemaVersion()`，不得另寫比較邏輯或改用 `>=`。
- 版號不符時必須 `console.error`，訊息含實際值與期望值（沿用 `assertIndexSchemaVersion()` 拋出的訊息文字），且函式仍回傳 `null`，不得拋出例外（`readIndex()` 是抓取端自己的讀取路徑，不是 CI 閘門或頁面，不得讓抓取因此中止）。
- 其餘既有失敗模式（檔案不存在、JSON 解析失敗、`products` 非陣列）維持現況：靜默回傳 `null`，不新增 log。
- 新增測試須涵蓋版號不符與版號正確兩條路徑。

**Block If:** 若磁碟上 `data/index.json` 目前的 `schemaVersion` 與 `INDEX_SCHEMA_VERSION` 不符（會被本次改動立即攔下並導致 `npm run schema:check` 或既有測試紅燈），HALT 回報，不擅自改動磁碟快照或常數。

**Never:** 不改變 `main()` 用 `previousSummaries`／`lastSeenAt` 的既有邏輯、不改 `sweepDelisted()`、不新增遷移或升版路徑、不處理 `data/products/*.json` 缺 `schemaVersion` 的既有 deferred 項目（DW-22，範圍外）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 版號正確 | `data/index.json` 的 `schemaVersion === INDEX_SCHEMA_VERSION` | `readIndex()` 回傳解析後的 `Index`，不印任何錯誤 | 無 |
| 版號不符 | `schemaVersion` 為其他值或缺失 | `readIndex()` 回傳 `null`，`console.error` 印出指名 `index.json` 與兩個版號的訊息 | 訊息沿用 `assertIndexSchemaVersion()` 拋出的 `Error.message` |

</intent-contract>

## Code Map

- `src/fetcher.ts:5` -- `import { DAYS_SCHEMA_VERSION, INDEX_SCHEMA_VERSION } from './schema';`：加入 `assertIndexSchemaVersion`。
- `src/fetcher.ts:24-31`（改動前）-- `readIndex()`：目前 `try { cast; return Array.isArray(...) ? raw : null } catch { return null }`，未呼叫任何版號守衛，是本次要補的路徑。改為：解析 JSON 一個 try/catch（維持現況），版號檢查另一個 try/catch（新增 `console.error` 後回傳 `null`），最後保留既有 `Array.isArray(raw.products)` 檢查。同時 `export` 此函式，供測試直接呼叫（比照 `buildDays`／`writeDays` 已有的「exported for direct testing」慣例）。
- `src/fetcher.ts:336` -- `const previousIndex = readIndex();` 呼叫端不變；`previousSummaries = previousIndex?.products ?? []`（第 337 行）在版號不符時自然拿到 `[]`，等同無上一輪快照。
- `src/fetcher.ts:366`（`entry.carriedOver ? previous?.lastSeenAt ?? nowIso : nowIso`）-- 已驗證：`previousSummaries` 為空時 `previous` 恆為 `undefined`，`lastSeenAt` 恆為 `nowIso`，故 `sweepDelisted()`（讀 `lastSeenAt` 判斷是否超過 `DELIST_AFTER_DAYS`）不會誤刪任何票種——此為 human decision 的前提，已在既有程式碼中確認成立，本次改動不動這段邏輯。
- `src/schema.ts:47-53` -- `assertIndexSchemaVersion(value: unknown): void`：不符時 `throw new Error('index.json schemaVersion is ${JSON.stringify(value)}, expected ${INDEX_SCHEMA_VERSION}')`。直接複用，不新增比較邏輯。
- `src/i18n-check.ts:68-71` -- 同一守衛在另一消費者的既有用法（`readIndex()` 呼叫 `assertIndexSchemaVersion()` 後直接讓例外往外拋，因為該檔是 CI 閘門）。本次 `fetcher.ts` 的差異是**必須 catch 住**，不得讓例外中止抓取——兩者用途不同（閘門 vs. 抓取端自我降級），故守衛函式本身不變，呼叫端處理方式刻意不同。
- `src/fetcher.test.ts:28` -- 匯入處補上 `readIndex`；`captureErrors(t)`（已存在，第 101-107 行）可直接複用來斷言 `console.error` 內容。新增一個 `withFiles(t, files)` 輔助（依 basename 配 mock 內容、其餘落回真實 `fs`），比照 `src/i18n-check.test.ts` 的同名輔助，供新測試直接呼叫 `readIndex()` 而不需跑整個 `main()`。

## Tasks & Acceptance

**Execution:**
- `src/fetcher.ts` -- `readIndex()` 內對已解析的 `schemaVersion` 呼叫 `assertIndexSchemaVersion()`，不符時 `console.error` 印出訊息並回傳 `null`；`export` 此函式 -- 補上 AD-14 版本守衛在抓取端讀回路徑的缺口，同時讓測試能直接驅動
- `src/fetcher.ts` -- import 中補上 `assertIndexSchemaVersion` -- 呼叫既有守衛，不新增比較邏輯
- `src/fetcher.test.ts` -- 新增 `withFiles()` 輔助與兩個測試：版號不符時回傳 `null` 且 log 指名版號的錯誤、版號正確時回傳解析後的 `Index` 且不 log -- 涵蓋 human decision 明文要求的兩條路徑

**Acceptance Criteria:**
- Given `data/index.json` 的 `schemaVersion` 不等於 `INDEX_SCHEMA_VERSION`, when 呼叫 `readIndex()`, then 回傳 `null` 且 `console.error` 印出的訊息同時包含實際版號與 `INDEX_SCHEMA_VERSION`
- Given `data/index.json` 的 `schemaVersion` 等於 `INDEX_SCHEMA_VERSION`, when 呼叫 `readIndex()`, then 回傳解析後的 `Index` 物件，且未呼叫 `console.error`
- Given 既有測試套件, when 執行 `npm test`, then 全數通過，不因本次改動而紅燈（含 `src/fetcher.test.ts`、`src/schema.test.ts`、`src/i18n-check.test.ts`）

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 2, low 0)
- defer: 1: (high 0, medium 0, low 1)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[medium]` `[patch]` `src/fetcher.ts` 的 `readIndex()` 對 `data/index.json` 解析後為合法 JSON 但非物件（例如頂層值為 `null`）時，`raw.schemaVersion` 會在版號檢查的 `try` 內拋出原始 `TypeError`，被印成一則令人困惑的 `console.error`，違反 Boundaries「Always」第 3 條要求非版號失敗模式維持靜默——在版號檢查前加上 `if (!raw || typeof raw !== 'object') return null;`（比照 `schema-check.ts` 的 `readSchemaVersion()`），非物件 JSON 落回既有的靜默 `null` 路徑。
  - `[medium]` `[patch]` `src/fetcher.test.ts` 版號不符的測試只斷言 log 內含「期望版號」，未斷言「實際版號」，訊息若漏掉實際值不會被抓到——補上對 `INDEX_SCHEMA_VERSION + 1` 的斷言，與期望版號並列檢查。
- deferred_findings（已寫入 frontmatter `deferred`）:
  - `readIndex()` 的第一段 `try`/`catch`（檔案不存在、JSON 解析失敗）對所有失敗一律靜默回傳 `null`，與新加的版號不符路徑（會 log）不對稱——讀取／解析失敗與版號不符同屬 AD-14 所指的異常快照，但前者仍完全不可見。本 story 範圍明確排除（Boundaries「Always」第 3 條要求維持現況），記入 deferred 供後續聚焦處理。
- rejected_findings（noise，已對照 spec 逐一核實非本輪缺陷）：`Array.isArray(raw.products)` 為 false 時也應 log（Boundaries 明文要求此案例維持靜默，非缺陷）；缺少 `schemaVersion` 完全缺失的獨立測試（與「版號不符」走同一分支，無額外風險，spec I/O 矩陣已將兩者併為一列）；缺少「檔案不存在時不 log」的顯式測試（既有靜默行為未變動，非本次新增路徑，非兩條路徑測試要求範圍內）；建議補 `main()`／`sweepDelisted()` 端對端測試涵蓋安全性論證（human decision 明文只要求「readIndex() 版號不符與版號正確兩條路徑的測試」，範圍由 intent 本身界定，round-level 論證屬設計理由而非測試義務）；JSDoc 未提及 `known` 也會因 `previousSummaries` 清空而重置（文件完整性建議，非必要）；`withFiles()` 測試輔助只支援拋 `Error` 而非任意值（無對應情境要求）；兩個新測試的 `withFiles`／`captureErrors` setup 未抽共用輔助（風格建議，重複量小）；`raw` 型別為 `Index`（斷言）而非 `unknown`（沿用檔案既有的 cast 慣例，本次未改動此模式）；降級回合僅有單行 log、無回合摘要標記（超出本次範圍的可觀測性建議）。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 0
- reject: 12: (high 0, medium 0, low 12)
- addressed_findings:
  - `[medium]` `[patch]` `src/fetcher.ts` 的 `readIndex()` 非物件守衛 `if (!raw || typeof raw !== 'object') return null;` 未排除陣列——`typeof [] === 'object'` 為真，頂層值是 JSON 陣列時會跳過此守衛，落到版號檢查，因 `raw.schemaVersion` 為 `undefined` 而觸發不符、印出誤導性 `console.error`，違反 Boundaries「Always」第 3 條要求「`products` 非陣列」這條既有失敗模式維持靜默不新增 log——守衛加上 `|| Array.isArray(raw)`，陣列頂層值落回既有的靜默 `null` 路徑，比照上一輪同類守衛的修法，未另加專屬測試。
- rejected_findings（noise，已對照 spec 與上一輪 Review Triage Log 逐一核實非本輪缺陷，多項與上一輪 rejected 理由相同）：缺少「非物件頂層值」（`null`／陣列／數字）的獨立測試（守衛的正確性以推理驗證，兩條路徑測試要求未涵蓋此新增防禦分支，非缺陷）；缺少版號相符但 `products` 缺失／非陣列的獨立測試（既有靜默行為未變動，非兩條路徑範圍）；缺少檔案不存在／JSON 解析失敗的獨立測試（沿用上一輪已 reject 的相同理由）；缺少 `schemaVersion` 完全缺失的獨立測試（沿用上一輪已 reject 的相同理由——與版號不符同一分支）；`raw` 型別為 `Index` 而非 `unknown`（沿用上一輪已 reject 的相同理由——既有 cast 慣例未改動）；`withFiles()` 與既有 `mockFs()` 兩種 mock 手法並存（風格建議，`withFiles()` 本身比照 `i18n-check.test.ts` 既有慣例，重複量小）；JSDoc 未提及版號不符時 `known` 也會因 `previousSummaries` 清空而重置（與上一輪已 reject 的相同 JSDoc 完整性建議實質相同）；`err instanceof Error ? err.message : String(err)` 分支在目前呼叫下不可達（`assertIndexSchemaVersion()` 僅拋 `Error`，屬防禦性慣例，非缺陷）；`console.error` 訊息前綴 `[fetch] ` 未逐字沿用 `assertIndexSchemaVersion()` 拋出文字（spec 僅要求訊息含實際與期望版號、文字沿用其訊息，前綴為檔案既有 log 慣例，非偏離）；JSDoc 敘述「Exported so tests can drive the version-mismatch path」未提及也涵蓋版號相符路徑（文件用詞精確度建議，非缺陷）；建議補 `main()` 端對端整合測試涵蓋安全性論證（沿用上一輪已 reject 的相同理由——範圍由 intent 界定，round-level 論證屬設計理由而非測試義務）；測試僅以子字串斷言版號數字、未鎖定 log 訊息完整格式（過度測試建議，spec 僅要求訊息同時含兩個版號）；intent-alignment 審計附帶指出帳本 DW-27 尚未實際標記關閉——帳本狀態與解決權屬 orchestrator，非本次程式碼變更範圍，不在此 story 處理。

## Verification

**Commands:**
- `npx tsc -p tsconfig.test.json` -- expected: 無型別錯誤
- `npm test` -- expected: 全部通過，含新增的兩個 `readIndex()` 測試
- `npm run schema:check` -- expected: exit 0

**Manual checks (if no CLI):**
- 檢視 `src/fetcher.ts` 的 `readIndex()`，確認版號不符時不拋出例外（呼叫端 `main()` 不得因此中止）

## Auto Run Result

Status: done

**變更摘要：** 本輪為 `status: done` 觸發的 follow-up review pass，未新增功能程式碼。審查發現 `src/fetcher.ts` 的 `readIndex()` 上一輪新增的非物件守衛（`if (!raw || typeof raw !== 'object') return null;`）未排除 JSON 陣列——`typeof [] === 'object'` 為真，頂層值是陣列時會跳過守衛、落到版號檢查，因 `raw.schemaVersion` 為 `undefined` 觸發不符並印出誤導性 `console.error`，違反 Boundaries「Always」第 3 條「`products` 非陣列」這條既有失敗模式須維持靜默的要求。已修正守衛為 `if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;`，陣列頂層值落回既有的靜默 `null` 路徑；`main()`／`sweepDelisted()` 邏輯與既有兩個 `readIndex()` 測試皆未變動。

**變更檔案：**
- `src/fetcher.ts` -- `readIndex()` 的非物件頂層值守衛加上 `Array.isArray(raw)` 排除，並更新其上的說明註解

**Review 發現分類：**
- patch 已修：1（medium 1、high 0、low 0）—— 非物件守衛未排除陣列，導致陣列頂層值誤觸版號不符 log
- defer：0
- reject：12（皆為超出本輪 story 範圍、與上一輪 Review Triage Log 已核實 reject 的理由相同或重複、或屬於帳本 orchestrator 職責範圍；逐項理由見上方 Review Triage Log）

**Follow-up review recommendation:** `false`（本輪 patch 依嚴重度計數：high 0、medium 1、low 0；分數 = 3 × 1 + 1 × 0 = 3 < 5）

**驗證：**
- `npx tsc -p tsconfig.test.json` -- 無型別錯誤
- `npm test`（全套件） -- 120/120 通過
- `npm run schema:check` -- exit 0，無輸出

**殘留風險：** 無新增殘留風險。frontmatter `deferred` 既有項目（`readIndex()` 讀取／解析失敗路徑與版號不符路徑可觀測性不對稱）維持原狀，範圍外。帳本 DW-27 是否已隨 DW-21 一併關閉為 orchestrator 帳本狀態問題，非本次程式碼變更範圍，未在此處理。


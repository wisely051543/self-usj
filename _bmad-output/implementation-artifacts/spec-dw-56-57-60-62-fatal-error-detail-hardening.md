---
title: 'handleFatalMainError 致命錯誤細節強化（DW-56/57/60/62）'
type: 'bugfix'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
baseline_revision: 'e7620964f29bad893ab6bdb4977125404f988326'
deferred:
  - summary: >-
      handleFatalMainError 的 Error 分支只印 err.stack，未走訪 err.cause 鏈，
      也未展開 AggregateError.errors，包裝過的錯誤會遺失真正的根因。
    evidence: |-
      V8 的 err.stack 不包含 cause 的堆疊（已由 review 實測確認）：
      new Error('outer', { cause: inner }) 印出的 stack 完全沒有 inner 的痕跡；
      Promise.any 的 AggregateError 同理，errors 陣列不會出現在 stack 中。
      這與 DW-57「丟掉呼叫堆疊就少一層可追溯性」屬同一類診斷資訊遺失，
      但本次 intent 只要求「加上 err.stack」，未涵蓋 cause 走訪；
      且此 repo 目前沒有任何地方以 { cause } 建構 Error，故非阻斷性。
    location: >-
      src/fetcher.ts:deriveThrownValueDetail（Error-like 分支）
    severity: low
  - summary: >-
      更正上一則（已入帳為 DW-79）的嚴重度依據：本 repo 確實會遇到帶 cause 的 Error，
      因此不走訪 err.cause 會在最常見的網路失敗上丟掉真正的 errno。
    evidence: |-
      DW-79 的理由寫「此 repo 目前沒有任何地方以 { cause } 建構 Error」——
      這句話成立，但不足以支撐 low：cause 不是本 repo 建的，是 undici 建的。
      src/limiter.ts:189-195 在重試次數用盡後把 fetch() 丟出的錯誤原樣 rethrow，
      而 Node 內建 fetch 失敗時丟的是 `TypeError: fetch failed`，
      真正的 ECONNREFUSED / ENOTFOUND / TLS 失敗只掛在 err.cause 上。
      已於 Node v24 實測：new Error('outer', { cause: inner }).stack 完全不含 inner，
      AggregateError.stack 也不含 errors。
      也就是說對一個 fetcher 而言，最可能走到這個兜底的值，
      正是 DW-57 的修法（印 err.stack）唯一印不出根因的那一種。
      本次不修：intent 的 Approach 明寫 Error 分支只做 stack→message→name，
      加走訪 cause 鏈與展開 AggregateError.errors 需要新的深度上限與輸出格式決策。
    location: >-
      src/fetcher.ts:deriveThrownValueDetail（Error-like 分支）；證據在 src/limiter.ts:189-195
    severity: medium
  - summary: >-
      process.exit(1) 不會等待 stderr 的非同步寫入完成；當 stderr 是 pipe（CI 常態）時，
      fatal 行與 abort 摘要可能在寫出前就被截斷，與 detail 長度無關。
    evidence: |-
      Node 對 process.exit() 的行為有明文：stdout/stderr 在導向 pipe 時是非同步寫入，
      process.exit() 不會等它們排空，因此輸出可能遺失。
      handleFatalMainError 的 finally 正是無條件呼叫 process.exit(1)，
      所以這個路徑存在「印了但沒真的寫出去」的可能——
      這會讓整個函式唯一的價值（在 CI 記錄留下可診斷的一行）在最壞情況下歸零。
      本次的 4000 字元上限降低了風險但沒有解決機制本身。
      非本次造成：process.exit(1) 在改動前後都在 finally 裡，且 intent 的 Always
      明確凍結了這個保證，改成 process.exitCode ＋ 自然結束屬於行為契約變更，需人為決定。
    location: >-
      src/fetcher.ts:handleFatalMainError（finally 的 process.exit(1)）
    severity: medium
  - summary: >-
      Error 分支只印 stack／message／name，會丟掉 Error 自身攜帶的可列舉兄弟欄位；
      Node 的 fs 錯誤（code／path／syscall）就是這個形狀。
    evidence: |-
      已實測：handleFatalMainError(Object.assign(new Error('open failed'),
      { code: 'ENOENT', path: '/data/index.json', syscall: 'open' })) 只印出 stack，
      code／path／syscall 完全不出現。這與本次為「帶 message／stack 的一般 payload」
      補上的兄弟欄位保護是同一類資訊遺失，但發生在真正的 Error 上。
      非本次造成：改動前的 `err instanceof Error ? err.message` 同樣丟掉這些欄位，
      且 intent 的 Approach 明寫 Error 分支只做 stack→message→name。
      實務衝擊有限——fs 錯誤的 message 本身通常已含 code 與 path——
      要補需決定「附加哪些欄位、如何與既有字元上限互動」，屬 intent 層決定。
    location: >-
      src/fetcher.ts:deriveThrownValueDetail（isErrorLike 分支）
    severity: low
---

<intent-contract>

## Intent

**Problem:** `handleFatalMainError`（`src/fetcher.ts:332-352`）是所有未建模例外（bug）的兜底處理，唯一價值就是讓 CI 記錄留下可診斷的一行；但目前四種輸入形態都會退化：`Error` 只印 `err.message` 而丟掉呼叫堆疊（DW-57）、空訊息的 `Error` 只印出 `[fetch] fatal: `（DW-60）、含循環參照的物件會經 `catch { return String(err) }` 印成 `[object Object]`（DW-56，正是此分支要避免的結果）、`null`/`undefined` 則印出無診斷價值的 `undefined` 且完全沒有測試涵蓋（DW-62）。

**Approach:** 把 detail 推導從內嵌 IIFE 抽成一個模組層級的純函式，對每種丟出值形態各給一條可診斷的輸出：`Error` 優先印 `err.stack`（缺 stack 時退回 message、再退回 name），非 `Error` 物件改用「seen-set replacer」的循環安全序列化，`null`/`undefined` 與空字串給明確的佔位描述。同時補上四種未涵蓋輸入的單元測試。`try`/`finally` 與 `process.exit(1)` 保證不變。

## Boundaries & Constraints

**Always:**
- 保留 `handleFatalMainError` 的 `try`/`finally`，`process.exit(1)` 在任何路徑（含 detail 推導自身丟例外）都必須被執行。
- detail 推導函式本身絕不得丟出例外：所有序列化路徑都要有最終保底。
- 輸出仍是 `console.error` 印出 `[fetch] fatal: ${detail}`，且必須接續既有的 `logAbortSummary(startedAt)`（順序不變）。
- 記錄字串（log/前綴/佔位描述）維持英文，與 `src/fetcher.ts` 既有訊息一致；程式碼註解沿用檔案既有的英文 JSDoc 風格。
- `detail` 永不為空字串——任何輸入形態都要留下可辨識內容。

**Block If:**
- 若要滿足本規格必須改動 `handleFatalMainError` 以外的公開行為（例如 `logAbortSummary` 的格式、`main()` 的錯誤路徑），停止並回報。

**Never:**
- 不新增相依套件（no new deps）。
- 不改 `logAbortSummary` 的訊息格式或 `ABORT_SUMMARY` 正規式所鎖定的形狀。
- 不改 `src/fetcher.ts:55`、`:373`、`:431` 等其他 `err instanceof Error` 記錄點（本次範圍只有致命兜底）。
- 不匯出新的公開 API 供正式程式使用（新函式維持模組內部，測試一律透過 `handleFatalMainError` 驅動）。
- 不改動 deferred-work 帳本（`_bmad-output/implementation-artifacts/deferred-work.md`）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般 Error（DW-57） | `new Error('boom')` | `[fetch] fatal:` 之後同時含 `boom` 與呼叫堆疊（含 `at ` 幀） | 無 |
| 空訊息 Error（DW-60） | `new Error()` | detail 非空；含 `Error` 名稱與堆疊，不得只剩 `[fetch] fatal: ` | 無 |
| 無 stack 的 Error | `err.stack` 被設為 `undefined`/空字串 | 退回 `err.message`；message 也空時退回 `Error` 名稱＋明確佔位說明 | 無 |
| 字串丟出 | `'boom'` | 原樣輸出 `boom`（空字串則輸出明確佔位描述） | 無 |
| 一般物件（既有） | `{ code: 'EACCES', path: '/data/index.json' }` | JSON 序列化，含 `EACCES` 與 `/data/index.json`，不得為 `[object Object]` | 無 |
| 循環參照物件（DW-56） | `const a = { code: 'ELOOP' }; a.self = a` | 序列化成功，含 `ELOOP`，循環處以標記取代；不得為 `[object Object]` | replacer 攔截已見過的參照 |
| `null`（DW-62） | `throw null` | detail 明確表示丟出的是 `null`，非空字串 | 無 |
| `undefined`（DW-62） | `throw undefined` | detail 明確表示丟出的是 `undefined`，不得只印字面 `undefined` | 無 |
| 無法序列化也無法轉字串 | `Object.create(null)`（`String()` 會丟 TypeError） | 仍回傳非空 detail，不得讓 `handleFatalMainError` 少印 fatal 行 | 最終保底以 `Object.prototype.toString.call()` | 
| 報告自身丟例外（既有） | `console.error` 或 `requestCount()` 丟例外 | 仍 `process.exit(1)` | `finally` 保證 |

</intent-contract>

## Code Map

- `src/fetcher.ts:332-352` -- `handleFatalMainError(err: unknown): never`。目前 detail 由內嵌三元＋IIFE 推導（`err.message` / `typeof err === 'string'` / `JSON.stringify` 搭配 `catch { return String(err) }`）；`try`/`finally` 包住 `console.error` 與 `logAbortSummary`，`finally` 呼叫 `process.exit(1)`。這是唯一要改的正式程式位置。
- `src/fetcher.ts:301-304` -- `logAbortSummary(startedAt)`：印 `[fetch] aborted after N requests in X.Xs`。唯讀，格式不得動。
- `src/fetcher.ts:306-313` -- 模組層級 `let startedAt = Date.now()`（含 JSDoc 說明為何模組層級）。唯讀。
- `src/fetcher.ts:508` -- `main().catch(handleFatalMainError)`：兜底的實際掛載點。唯讀。
- `src/fetcher.test.ts:39-43` -- `class ExitSignal extends Error`：測試把 `process.exit` 換成丟 `ExitSignal`，用 `assert.throws` 斷言退出碼。新測試沿用。
- `src/fetcher.test.ts:102-108` -- `captureErrors(t)`：以 `t.mock.method(console, 'error', ...)` 收集每次呼叫（`args.map(String).join(' ')`）成 `string[]`。多行 detail 會落在同一個陣列元素。
- `src/fetcher.test.ts:163-181` -- `ABORT_SUMMARY` 正規式與 `assertAbortSummaryFollows(errors, alertIndex)`：新測試都要用它確認摘要仍接在 fatal 行之後。
- `src/fetcher.test.ts:443-543` -- 既有四個 `handleFatalMainError` 測試（一般 Error／非 Error 物件／`console.error` 丟例外／`logAbortSummary` 丟例外）。新測試緊接其後追加，既有斷言必須全數維持通過（`new Error('boom')` 的 stack 仍含 `boom`，故不會被打破）。
- `package.json:7-9` -- `npm test`（`node --require ts-node/register --test $(find src -name '*.test.ts')`）與 `npm run typecheck`（`tsc -p tsconfig.test.json`）。
- `src/test-support.ts` -- 假時鐘相關工具，本次不需要（`handleFatalMainError` 為同步）。唯讀。

## Tasks & Acceptance

**Execution:**
- `src/fetcher.ts` -- 在 `handleFatalMainError` 之前新增模組內部函式 `describeThrownValue(err: unknown): string`（附英文 JSDoc 說明每個分支存在的理由與 DW 編號），依序處理：`Error`（`stack` → `message` → `name` ＋佔位）、`string`（空字串給佔位）、`null`/`undefined`（明確佔位）、其餘以 seen-set replacer 做循環安全 `JSON.stringify`，`JSON.stringify` 回傳非字串或丟例外時退回 `String(err)`，`String(err)` 也丟例外時退回 `Object.prototype.toString.call(err)` -- 讓每種丟出值形態都留下可診斷內容，同時徹底解掉 `[object Object]` 與空 detail。
- `src/fetcher.ts` -- 把 `handleFatalMainError` 內嵌的 detail 三元／IIFE 換成 `const detail = describeThrownValue(err);`，其餘（`console.error` 的 `[fetch] fatal: ${detail}`、`logAbortSummary(startedAt)`、`try`/`finally`、`process.exit(1)`）原封不動 -- 只換推導來源，不動兜底保證。
- `src/fetcher.test.ts` -- 於既有 `handleFatalMainError` 測試之後追加涵蓋 I/O 矩陣未測情境的單元測試：帶 stack 的 `Error`（DW-57）、空訊息 `Error`（DW-60）、循環參照物件（DW-56）、`throw null` 與 `throw undefined`（DW-62）；每個都沿用 `ExitSignal` + `captureErrors` + `assertAbortSummaryFollows`，並斷言 detail 非空且不含 `[object Object]` -- 把四個帳本項目各自釘成回歸測試。

**Acceptance Criteria:**
- Given `handleFatalMainError` 收到任一形態的丟出值（`Error`、字串、一般物件、循環參照物件、`null`、`undefined`），when 它執行完畢，then `process.exit(1)` 必被呼叫，且 `console.error` 印出的 fatal 行在 `[fetch] fatal: ` 之後含非空內容，並由 `[fetch] aborted after ...` 摘要接續。
- Given 既有的四個 `handleFatalMainError` 測試，when 執行 `npm test`，then 全部仍通過（本次為行為強化，非契約變更）。
- Given `src/fetcher.ts` 的改動，when 執行 `npm run typecheck`，then 無型別錯誤，且 `describeThrownValue` 未被加入模組匯出。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 2, low 6)
- defer: 2: (high 0, medium 2, low 0)
- reject: 8: (high 0, medium 0, low 8)
- addressed_findings:
  - `[medium]` `[patch]` duck-typed 的 `isErrorLike` 把「帶 `message` 欄位的一般失敗 payload」誤判為 Error：`{ code: 'EACCES', message: 'permission denied', path: '/data/index.json' }` 只會印出 message，`code` 與 `path` 被丟掉——這是改動本身造成的回歸（舊碼會整個 `JSON.stringify`），且方向正是 DW-56 要避免的資訊遺失 — 收緊判定為「`stack` 是字串」或「`message` 是字串且**不可列舉**」（真 Error 的 `message` 一律不可列舉），並補上 payload 保留兄弟欄位的測試。
  - `[medium]` `[patch]` DW-62 的 `null` 測試對改動前的實作也會通過，等於沒有釘住任何東西：`JSON.stringify(null)` 回傳字串 `"null"`，舊碼印出的 `[fetch] fatal: null` 已滿足 `includes('null')`（已用突變實測確認）；該測試的 JSDoc 也把舊行為寫錯（舊碼對 `throw null` 印的是 `null` 而非 `undefined`）— 補上 `notEqual('[fetch] fatal: null')` 與「說明是被丟出的」斷言，並更正 JSDoc。
  - `[low]` `[patch]` `describeStructurally` 用 `Object.keys`，與它自己 JSDoc 寫的存在理由矛盾：值會走到這裡的原因之一就是「所有欄位都不可列舉」，而 `Object.keys` 對這種值恰好回傳空陣列並印出 `no own keys` — 改用 `Object.getOwnPropertyNames`，並補上全不可列舉欄位的測試。
  - `[low]` `[patch]` 截斷測試斷言 `alert.length < 10_000`，但上限是 4000；把上限放寬到 9000 仍全綠 — 改為以鏡射常數 `FATAL_DETAIL_CAP` 為界，並補上反向測試（一般 Error 不得被截斷，否則收緊上限剪掉真實堆疊也不會轉紅）。
  - `[low]` `[patch]` `describeStructurally` 內的兩個 try/catch 完全沒有可抵達的測試：既有 hostile Proxy 的 `get` 陷阱在第一次讀 `stack` 時就丟例外，外層 guard 直接接手，結構化描述根本沒被進入（已用突變實測確認拿掉守衛仍全綠）— 補上「只有 `ownKeys` 丟例外的 Proxy」與「`Symbol.toStringTag` getter 丟例外的物件」兩個測試。
  - `[low]` `[patch]` JSON 層只拒絕 `{}`／`[]`，但 `toJSON` 回傳 null 會序列化成裸 token `null`，在記錄上與 DW-62 的 `throw null` 無法區分 — 加上 `json !== 'null'`，並補測試。
  - `[low]` `[patch]` `String(err)` 只拒絕 `[object Object]`，因此丟出 `Map`／`Set`／`Response` 會停在同樣沒有內容的 `[object Map]` — 改為拒絕任何 `[object Tag]` 形狀，讓結構化描述至少報出型別，並補測試。
  - `[low]` `[patch]` `errorLike.stack`／`.message` 各被讀兩次（判定一次、分支內一次），對帶 getter 的值等於執行兩次外來程式碼且兩次結果可能不一致；JSDoc 另有一句事實錯誤（宣稱 `DOMException` 會 fail `instanceof Error`，Node v24 實測為 `true`）— 改為各讀一次存進區域變數，並移除該錯誤舉例。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 5, low 5)
- defer: 1: (high 0, medium 0, low 1)
- reject: 8: (high 0, medium 0, low 8)
- addressed_findings:
  - `[medium]` `[patch]` `instanceof Error` 漏掉跨 realm／DOMException／手工 `{ message, stack }` 等 Error-like 值，因 `message`/`stack` 不可列舉而被序列化成空的 `{}` — Error 分支改為 duck-typing（`instanceof` 或物件的 `stack`/`message` 為字串）。
  - `[medium]` `[patch]` `JSON.stringify` 因非循環原因丟例外（丟例外的 getter／`toJSON`）時，`String(err)` 仍會回傳 `[object Object]`；且 `{}`／`[]` 這類無內容序列化結果被當成成功 — 三層尾端各自拒絕無內容結果，最終改用 `describeStructurally()`（class tag ＋ own keys）。
  - `[medium]` `[patch]` 「本函式絕不丟例外」未成立：讀取 Proxy 或丟例外 getter 的 `err.stack` 會直接把 fatal 行與 abort 摘要一起弄丟 — 整條 ladder 包在 `describeThrownValue` 的 try/catch 內，並以 hostile Proxy 測試釘住。
  - `[medium]` `[patch]` 輸出無上限：seen-set 只限制循環不限制體積，龐大物件圖在 CI 的 pipe 下可能把 abort 摘要擠出緩衝區 — 加上 4000 字元上限與 `... (truncated, N chars total)` 標記，並補上超大輸入仍保留摘要的測試。
  - `[medium]` `[patch]` 尾端 fallback 層完全沒有可抵達的測試（`JSON.stringify(Object.create(null))` 會回傳 `"{}"`，reviewer 刪掉兩層後測試仍全綠）— 補上 `toJSON` 丟例外（`toString` 可用／不可用兩種）的測試分別釘住 `String(err)` 層與結構化層。
  - `[low]` `[patch]` `NaN`／`Infinity` 走進 JSON 分支印成 `null`，與 DW-62 的 null 情境無法區分 — 新增非物件 primitive 分支（`${typeof err} thrown: ...`），涵蓋 number/boolean/bigint/symbol/function。
  - `[low]` `[patch]` 堆疊斷言 `alert.includes(' at ')` 過鬆（`new Error('blocked at checkout')` 也會通過）— 改用 `STACK_FRAME = /\n\s+at /` 的 `assert.match`。
  - `[low]` `[patch]` 「無 stack 也無 message」分支只斷言 `includes('Error')`，刪掉佔位字串仍全綠 — 加上 `includes('no message and no stack')` 斷言。
  - `[low]` `[patch]` `reportFatal` JSDoc 寫「three assertions」卻列出四項 — 更正，並依新分支順序重寫 JSDoc。
  - `[low]` `[patch]` 缺少形態覆蓋 — 補上 `NaN`、symbol、function、自訂 `name` 的 Error 子類、Error-like 非 Error、hostile Proxy、超大物件等測試。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 2, low 7)
- defer: 1: (high 0, medium 0, low 1)
- reject: 10: (high 0, medium 0, low 10)
- addressed_findings:
  - `[medium]` `[patch]` duck test 的 `stack` 那一半沒有可列舉性守衛（只有 `message` 那半有）：`{ code: 'EACCES', stack: 'not-a-real-stack', path: '/data/index.json' }` 只印出 `not-a-real-stack`，`code` 與 `path` 被丟掉（已實測）——正是上一輪為 `message` 修掉的同一個回歸，換個欄位名又出現一次 — 兩半一律要求「字串且不可列舉」，把跨 realm error 測試改成以 `defineProperties` 建不可列舉欄位（真 Error 的形狀），並補上 `stack` 版的兄弟欄位保留測試。
  - `[medium]` `[patch]` 字元上限只被「由上」釘住：`caps an oversized detail` 是上界斷言，`does not truncate an ordinary error` 用測試回呼裡的 6 幀短堆疊（實測 420 字元），把 4000 降到 500 仍全綠（實測 400 才轉紅），而該測試的 JSDoc 卻宣稱擋得住「上限收緊到會剪掉真實堆疊」— 改用 55 幀、逾 3000 字元的擬真堆疊，並斷言最後一幀仍在，把上限同時由下釘住。
  - `[low]` `[patch]` JSON 層只拒 `{}`／`[]`／`null`，`toJSON` 回傳空字串或裸數字仍會印出 `[fetch] fatal: ""` 或 `[fetch] fatal: 0`（實測）— 改為只接受以 `{`／`[`／`"` 開頭且非空的結果（裸 token 一律讓位給結構化描述），並補上 `''` 與 `0` 兩個測試。
  - `[low]` `[patch]` `json !== '[]'` 這條守衛沒有任何測試可抵達（刪掉仍全綠），且 JSDoc 提到的 `Infinity` 只測了 `NaN` 那一半 — 補上丟出空陣列與丟出 `Infinity` 的測試。
  - `[low]` `[patch]` `FATAL_DETAIL_MAX_CHARS` 沒有真正約束回傳值：截斷標記接在切片之後，使結果超出常數本身，測試只好用來歷不明的 `+ 200` 寬限 — 改為把標記長度算進上限內，測試改斷言 `<= FATAL_DETAIL_CAP + 前綴長度`。
  - `[low]` `[patch]` 三個結構化保底測試只斷言 `includes('Object')`，而 `'Object'` 也是 `[object Object]` 的子字串，等於完全倚賴 `reportFatal` 的通用檢查 — 改為斷言完整輸出形狀（`Object (no own keys)` / `Object (own keys: ...)`）。
  - `[low]` `[patch]` 外層守衛的字面值 `(thrown value could not be described)` 沒有被釘住：唯一抵達它的 hostile Proxy 測試丟棄了回傳值 — 改為斷言完整 fatal 行。
  - `[low]` `[patch]` NaN 測試以 `!alert.includes('null')` 作反向斷言，任何含 "null" 子字串的措辭改寫都會誤判轉紅 — 改為正向斷言 `/number thrown: NaN/`。
  - `[low]` `[patch]` `describeStructurally` 只列 `Object.getOwnPropertyNames`，對「只帶 symbol 鍵欄位」的值回報 `(no own keys)`——而這種值序列化成 `{}` 正是它走到這裡的原因 — 加列 `Object.getOwnPropertySymbols`，並補測試。

## Design Notes

循環安全序列化採 intent 指定的 seen-set 作法（`WeakSet` + replacer）：

```ts
const seen = new WeakSet<object>();
const json = JSON.stringify(err, (_key, value) => {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
  }
  return value;
});
```

已知取捨：seen-set 只記「看過」而不記「祖先鏈」，因此同一物件被兩個兄弟欄位共用（非真循環）時也會顯示 `[circular]`。對一條診斷用記錄行而言可接受，且遠優於整個物件退化成 `[object Object]`；改用祖先堆疊的精確作法會讓兜底函式本身複雜化，非本次目的。`bigint` 分支同理：`JSON.stringify` 遇 `bigint` 會丟 `TypeError`，若不攔就會落回 `String(err)` 的 `[object Object]`——與 DW-56 同一類失效。

`Error` 分支優先印 `stack` 而非 `message`：V8 的 `err.stack` 首行已含 `Error: message`，因此 stack 是 message 的超集，一次解掉 DW-57（缺堆疊）與 DW-60（空訊息時 stack 仍有 `Error` 名稱與位置）。stack 非字串或修剪後為空（例如手動清掉 stack 的物件）才退回 message，再退回 name。

## Verification

**Commands:**
- `npm test` -- expected: 全部測試通過，含新增的 DW-56/57/60/62 情境。
- `npm run typecheck` -- expected: 無錯誤輸出。

## Auto Run Result

Status: done

### 實作摘要
對已完成 story 的第三次追加 review pass（`followup_review_recommended: true` 觸發）。四層 review 找出 9 個由本次改動造成、可就地修好的問題並全部修掉。兩個 medium 是同一種病灶的兩個面向：上一輪為 `message` 補的「一般 payload 不得被當成 Error」保護，在 `stack` 欄位上完全沒有對應（實測會丟掉 `code`／`path`）；以及 4000 字元上限只被由上釘住，實測可一路降到 500 而測試全綠，同時該測試的 JSDoc 卻宣稱擋得住這件事。`try`/`finally`、`process.exit(1)`、`[fetch] fatal: ${detail}` 的輸出形狀與 `logAbortSummary` 順序皆未動；未新增匯出、未新增相依、未改動 deferred-work 帳本。

### 變更檔案
- `src/fetcher.ts` -- `isErrorLike` 的 `stack` 與 `message` 兩半一律要求「字串且不可列舉」；JSON 層改為只接受以 `{`／`[`／`"` 開頭且有內容的結果（取代原本逐一列舉 `{}`／`[]`／`null`）；截斷標記改為算進 `FATAL_DETAIL_MAX_CHARS` 之內；`describeStructurally` 加列 symbol 鍵；三處 JSDoc 依新規則改寫（含對稱性理由與其代價）。
- `src/fetcher.test.ts` -- 跨 realm error fixture 改用 `defineProperties` 建不可列舉欄位；`does not truncate` 測試改用 55 幀擬真堆疊並斷言最後一幀；上限斷言去掉 `+ 200` 寬限；三個結構化測試改斷言完整形狀；hostile Proxy 測試改斷言保底字面值；NaN 改正向斷言；新增 6 個測試（`stack` 版兄弟欄位保留、`toJSON` 回傳 `''`、`toJSON` 回傳 `0`、丟出空陣列、丟出 `Infinity`、只帶 symbol 鍵的值）。

### Review findings 分佈
- patch 已修：9（medium 2、low 7）
- defer：1（low：真正的 `Error` 自身攜帶的可列舉兄弟欄位（fs 的 `code`／`path`／`syscall`）仍會被丟掉；改動前後皆然，且 intent 的 Approach 凍結了 Error 分支的 stack→message→name 形狀。見 frontmatter `deferred`）
- reject：10（截斷可能切斷 surrogate pair、龐大物件圖在套上限前先 OOM、非 V8 的 stack 未內含 message、`err.cause`／`AggregateError.errors`（已入帳為 DW-79/80，重複）、既有兩個測試未改用 `reportFatal`、註解量與重複理由、雙空行、deferred-work 帳本未在本 diff 更新（intent 明文禁止改動）、`describeStructurally` 對陣列列出 `length`、Error 子類測試倚賴 V8 延遲產生 stack、未斷言「只印一行 fatal」）
- Follow-up review 建議：true（patched 統計 high 0、medium 2、low 7；分數 3×2 + 7 = 13 ≥ 5）

### 驗證
- `npm run typecheck` -- 通過，無錯誤輸出。
- `npm test` -- 161/161 通過（本次前 155）。
- 突變測試：逐一還原本次七處新守衛／新斷言，每次都轉紅——拿掉 `stack` 可列舉性守衛（1 紅）、JSON 形狀守衛改回列舉式（2 紅）、拿掉 symbol 鍵（1 紅）、截斷標記改回接在上限之後（1 紅）、上限 4000 改 1200（1 紅）、保底字面值改寫（1 紅）、結構化輸出措辭改寫（3 紅）。

### 殘餘風險
- 真正的 `Error` 攜帶的可列舉兄弟欄位仍會被丟掉（已 defer）。
- `err.cause` 與 `AggregateError.errors` 仍未走訪；對本 repo 最可能發生的網路失敗（undici `TypeError: fetch failed`）而言，fatal 行印得出堆疊但印不出根因（DW-79/80）。
- `process.exit(1)` 在 stderr 為 pipe 時可能截斷未排空的輸出（DW-81）。
- seen-set 只記「看過」而非「祖先鏈」，同一物件被兄弟欄位共用時也會顯示 `[circular]`（Design Notes 已記錄的取捨，仍無測試釘住）。
- 4000 字元上限現在由下釘在約 3500 字元的擬真堆疊上，但該數字仍是經驗值，未以真實 CI pipe 緩衝區實測。
- 測試斷言仍綁在實作自訂的佔位字串與輸出措辭上（`[circular]`、`no message and no stack`、`empty string`、`truncated`、`Object (no own keys)`）；改寫措辭會讓測試轉紅，即使語意期待仍成立。

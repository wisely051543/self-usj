---
title: 'DW-6/DW-7：請求標頭匿名化的不可變性與接線強制驗證'
type: 'refactor'
created: '2026-08-22'
baseline_revision: '8226519e5dc878b8420709691066e51fb8d9e72a'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      NFR7 目前沒有任何測試觀察「真正送出去的請求」帶了什麼標頭；所有斷言都止於原始碼文字與匯出常數。
    evidence: |-
      src/limiter.ts:114 的 `await fetch(url, init)` 是四個呼叫點與網路之間的唯一一跳。
      把它改成 `await fetch(url)`，或改成合併一個自訂 User-Agent 的版本，四個 NFR7 測試全部照樣通過：
      HEADERS 仍凍結、仍不含站名、仍無 User-Agent 鍵，usj.ts 的原始碼文字也仍顯示四個 `headers: HEADERS`。
      repo 內既有 `t.mock.method(globalThis, 'fetch', ...)` 的機制（src/limiter.test.ts:50、
      src/sources/usj-fetchproduct-blocking.test.ts:100），但沒有任何測試讀取傳給 fetch 的第二個參數。
    location: >-
      src/limiter.ts:114
    severity: medium
  - summary: >-
      接線檢查只掃 src/sources/usj.ts 一個檔案，新增的其他來源檔若呼叫 limitedFetch 而未帶 HEADERS 不會被發現。
    evidence: |-
      limitedFetch 由 src/limiter.ts 匯出，目前生產程式碼只有 src/sources/usj.ts 呼叫它，
      但 NFR7「請求標頭不得揭露本站網域或站名」是 repo 層級要求。掃描範圍改為 src/**/*.ts（排除 *.test.ts）
      才能讓保證涵蓋面與需求一致。本次刻意不擴大，因 intent 指名的就是那四個呼叫點。
    location: >-
      src/sources/
    severity: medium
  - summary: >-
      沒有測試禁止裸 fetch( ；架構決策要求「禁止裸 fetch(，由測試強制」，但該強制目前不存在。
    evidence: |-
      epic-1-context.md 的技術決策明載「所有對外請求須經單一閘門 limitedFetch，禁止裸 fetch(，由測試強制」。
      grep 全 repo 後，除 src/limiter.ts:114 本身外沒有生產端裸 fetch，但也沒有任何測試會在有人新增時失敗。
      在 src/sources/usj.ts 加一個裸 fetch(url) 既不帶 HEADERS 也繞過速率閘門，且對本次新增的計數檢查完全隱形。
    location: >-
      src/
    severity: medium
  - summary: >-
      沒有任何測試釘住 HEADERS 應有的鍵值集合；把 HEADERS 換成 Object.freeze({}) 或刪掉
      x-anonymous-consents／Accept-Language，四個測試全部照樣通過。
    evidence: |-
      forbidden-name 測試只斷言「不含站名」，User-Agent 測試只斷言「無該鍵」，凍結測試只斷言
      「凍結且寫入會拋錯」，接線測試只讀原始碼文字。三者都是否定式或結構式斷言，沒有一個說出
      HEADERS *應該* 有哪四個鍵、值是什麼。刪除任一標頭（例如 Accept-Language: ja-JP，日文頁面
      的語系依據）對測試完全隱形。此為 Story 1.3 起既有的缺口，本次凍結與接線強化並未加劇它，
      但也未涵蓋；補法是加一條 deepEqual 的預期鍵值集合斷言。
    location: >-
      src/sources/usj.test.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `src/sources/usj.ts` 的 `HEADERS` 是可變動物件，四個 `limitedFetch` 呼叫點共用同一參照，任一處意外 mutate 會污染其餘三處（DW-6）；且現有 `src/sources/usj.test.ts` 只靜態檢查常數內容，沒有驗證那四個呼叫點確實原樣傳入該常數，註解宣稱的「鎖住全部四個呼叫點」目前只靠人工核對（DW-7）。

**Approach:** 以 `Object.freeze` 加唯讀型別把 `HEADERS` 鎖成不可變；並比照 `src/limits.test.ts` 讀回原始碼字串的手法，新增回歸測試，斷言 `src/sources/usj.ts` 內恰有四個 `limitedFetch` 呼叫點、且每一處都以 `headers: HEADERS` 原樣傳入，不得改為 spread 或就地覆寫。

## Boundaries & Constraints

**Always:**
- `HEADERS` 的鍵值內容與匯出名稱維持不變，僅加上凍結與唯讀型別。
- 新測試以讀回 `src/sources/usj.ts` 原始碼字串的方式驗證接線事實（同 `src/limits.test.ts` 的 yml 解析手法），不得以 mock `fetch`／跑真實網路請求代替。
- 測試以 `node:test` + `node:assert/strict` 撰寫，符合現有測試檔慣例。
- `npm run typecheck` 與 `npm test` 均須通過。

**Block If:**
- 凍結 `HEADERS` 後 `limitedFetch(url, { headers: HEADERS })` 無法通過 `tsc --strict` 型別檢查，且修正需要變更 `limitedFetch` 的公開簽章。

**Never:**
- 不新增、刪除或修改任何標頭鍵值（含 User-Agent、聯絡 email）。
- 不擴大 forbidden-string 比對範圍到網域字串——那是 DW-5，阻塞於網域指定。
- 不改動四個 `limitedFetch` 呼叫點本身的寫法。
- 不改動 `src/limiter.ts`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 凍結生效 | 匯入 `HEADERS` 後查詢凍結狀態 | `Object.isFrozen(HEADERS)` 為 `true` | 無錯誤 |
| 阻擋 mutate | 於 strict mode 下嘗試改寫既有鍵或新增鍵 | 拋出 `TypeError`，且 `HEADERS` 內容不變 | 測試以 `assert.throws` 斷言 |
| 接線完整 | 讀回 `src/sources/usj.ts` 原始碼 | 恰有 4 個 `limitedFetch(` 呼叫點 | 數量不符時失敗，訊息點出實際數量 |
| 接線原樣 | 逐一取出每個呼叫點的 init 物件文字 | 每個都含 `headers: HEADERS`（後接 `,` 或 `}`） | 不符時失敗，訊息含該呼叫點行號與實際片段 |
| 拒絕 spread／覆寫 | 某呼叫點改為 `headers: { ...HEADERS, X: 'y' }` | 測試失敗 | 上一列的比對即涵蓋 |
| 呼叫點無 init | 某處寫成 `limitedFetch(url)` | 測試失敗（缺 `headers: HEADERS`） | 同上 |

</intent-contract>

## Code Map

- `src/sources/usj.ts:84-93` -- `HEADERS` 常數與其註解（註解已宣稱「shared by all four `limitedFetch` call sites」）。要改的就是這裡：加 `Object.freeze` 與唯讀型別，並更新註解說明強制手段。
- `src/sources/usj.ts:150-154` -- 呼叫點 1，POST，init 為多行物件 `{ method, headers: HEADERS, body }`。**唯讀**。
- `src/sources/usj.ts:242` -- 呼叫點 2，單行 `await limitedFetch(url, { headers: HEADERS });`。**唯讀**。
- `src/sources/usj.ts:340` -- 呼叫點 3，同上格式。**唯讀**。
- `src/sources/usj.ts:413` -- 呼叫點 4，同上格式。**唯讀**。
- `src/sources/usj.test.ts` -- 現有 NFR7 回歸測試（兩個 test：forbidden name、無自訂 User-Agent），已 `import { HEADERS } from './usj'` 並用 `readFileSync` 讀 `package.json`。新測試加在此檔。
- `src/limits.test.ts:69-107` -- 要比照的手法範本：`readFileSync(join(REPO_ROOT, ...))` + 具名 helper + 正則抽取 + `assert.ok(match, '訊息')`；失敗訊息說明「為什麼這條線重要」。
- `src/limiter.ts:103` -- `limitedFetch(url: string, init?: RequestInit)`，`RequestInit['headers']` 為 `HeadersInit`。**唯讀**：確認凍結後仍可指派即可，不得改簽章。
- `package.json` -- `test` 腳本以 `find src -name '*.test.ts'` 收集測試，新測試放進既有檔即自動納入；`typecheck` 走 `tsconfig.test.json`。**唯讀**。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.ts` -- 將 `HEADERS` 改為凍結且型別唯讀的常數（例如 `Object.freeze({...} as const)`），並更新其上方註解，說明不可變性由 `Object.freeze` 強制、四個呼叫點的接線由 `usj.test.ts` 的原始碼回歸測試強制 -- 讓「共用同一參照」不再可能被單點 mutate 污染（DW-6）。
- `src/sources/usj.ts` -- 確認四個呼叫點在型別檢查下仍可原樣傳入 `HEADERS`；若 `tsc --strict` 報錯，僅以不變更 `limitedFetch` 簽章的方式在 `usj.ts` 內解決 -- 凍結不得以放寬型別或改寫呼叫點為代價。
- `src/sources/usj.test.ts` -- 新增不可變性測試：斷言 `Object.isFrozen(HEADERS)`，並以 `assert.throws` 斷言寫入既有鍵與新增鍵皆拋 `TypeError` 且內容不變 -- 涵蓋 I/O 矩陣前兩列（DW-6）。
- `src/sources/usj.test.ts` -- 新增接線回歸測試：以 `readFileSync` 讀回 `src/sources/usj.ts`，用具名 helper 掃出所有 `limitedFetch(` 呼叫點（以括號配對取出該次呼叫的引數文字），斷言數量恰為 4，且每一個的 init 物件都含原樣 `headers: HEADERS`（後接 `,` 或 `}`）-- 涵蓋 I/O 矩陣後四列（DW-7）。
- `src/sources/usj.test.ts` -- 更新檔頭註解，說明本檔現在同時鎖住「標頭內容」與「四個呼叫點的接線」兩件事 -- 避免註解再度領先於實際強制範圍。

**Acceptance Criteria:**
- Given `HEADERS` 已凍結，when 執行 `npm test`，then 不可變性測試通過，且既有兩個 NFR7 測試仍通過。
- Given 四個呼叫點維持 `headers: HEADERS` 原樣，when 執行 `npm test`，then 接線回歸測試通過。
- Given 有人把任一呼叫點改成 `headers: { ...HEADERS }` 或新增第五個未傳 `HEADERS` 的 `limitedFetch` 呼叫點，when 執行 `npm test`，then 接線回歸測試失敗，且失敗訊息指出是哪個呼叫點（行號）以及 NFR7 為何在意。
- Given 未變更任何原始碼，when 執行 `npm run typecheck`，then 通過且無新增錯誤。
- Given 本次變更，when 檢視 diff，then `HEADERS` 的鍵值集合、四個呼叫點的呼叫寫法、`src/limiter.ts` 皆未被改動。

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 0, low 7)
- defer: 3: (high 0, medium 3, low 0)
- reject: 8: (high 0, medium 0, low 8)
- addressed_findings:
  - `[low]` `[patch]` 掃描器對註解／字串字面值不設防：JSDoc 宣稱「無法配對即大聲失敗」，但只有多餘的 `(` 會；字串內多餘的 `)` 會提早收斂並回傳截斷的引數文字。已新增 `blankNonCode()` 將註解、字串、樣板字面值內容以等長空白抹平（保留換行以維持行號正確），掃描改在抹平後的副本上進行。
  - `[low]` `[patch]` 標記字串 `limitedFetch(` 會匹配到 `unlimitedFetch(` 等字尾。已在命中前檢查前一字元非識別字元。
  - `[low]` `[patch]` `{ headers: HEADERS, ...override }` 可通過原樣檢查卻在執行期被覆寫。已加第二條斷言：呼叫點引數中不得出現 spread。
  - `[low]` `[patch]` 凍結測試漏了刪除這一種 mutate。已補 `delete mutable['Accept-Language']` 的 `assert.throws(..., TypeError)`。
  - `[low]` `[patch]` 註解宣稱該檢查能擋住「JS caller」，但非 strict mode 的寫入是靜默 no-op 而非 TypeError，測試會誤報成「凍結失效」。已更正註解，說明拋錯是 strict mode 的性質。
  - `[low]` `[patch]` `src/sources/usj.ts` 路徑字面值重複三處，且檔案不在時只拋裸 ENOENT。已抽出 `SOURCE_PATH` 常數並加 `existsSync` 前置斷言與說明訊息。
  - `[low]` `[patch]` `EXPECTED_CALL_SITES` 的註解寫「is allowed to have」像是上限，實際斷言是等值比較。已改為與斷言一致的措辭。

### 2026-08-22 — Review pass（第二輪）
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 2, low 3)
- defer: 1: (high 0, medium 1, low 0)
- reject: 21: (high 0, medium 0, low 21)
- addressed_findings:
  - `[medium]` `[patch]` spread 檢查是 `!site.args.includes('...')`，會擋下引數中*任何位置*的 spread。已實測：把 POST 呼叫點的 `body: JSON.stringify(payload)` 改成 `JSON.stringify({ ...payload })`（完全碰不到標頭）就會讓測試變紅，並指控該呼叫點覆寫 HEADERS。這也與 I/O 矩陣「拒絕 spread／覆寫」列的原意（只針對 headers 值）不符。已改為 `spreadsAtHeadersLevel()`：只在 `headers` 鍵所在的那一層（brace 深度 1、無未閉合括號）偵測 spread。實測 `{ headers: HEADERS, ...override }` 仍變紅、body 內的 spread 維持綠燈。
  - `[medium]` `[patch]` 約 170 行的手寫掃描器（`blankNonCode`／`matchingParen`／`limitedFetchCallSites`）自身沒有任何測試，只被指向一個目前必定通過的檔案；「呼叫點被改動就會紅」這條 AC 因此只是宣稱而非事實——掃描器睡著與接線正確在綠燈下無法區分。已新增測試 `the call-site scan can tell a wired source from an unwired one`，以字面原始碼字串當 fixture，正反兩向各自釘住：單行／多行呼叫形狀、headers 層 spread、`{ ...HEADERS }`、無 init、註解與字串中的假呼叫點、`unlimitedFetch(`、引數字串內的 `)`、行號正確性、第五個呼叫點會改變計數。
  - `[low]` `[patch]` `src/sources/usj.ts` 註解宣稱唯讀型別「turn it into a compile error before that」，實際上 TypeScript 判斷可指派性時忽略 `readonly`，`const h: Record<string, string> = HEADERS` 與其後所有寫入都能通過型別檢查；真正的屏障只有執行期凍結。已改寫該段，說明唯讀只擋經由此 binding 的直接寫入。
  - `[low]` `[patch]` 同一段註解開頭寫「Exported so the NFR7 regression test can lock it directly rather than parsing source text」，與後方新增段落描述的「讀回原始碼文字的測試」自相矛盾。已改為「可直接對這個物件斷言，而非從原始碼文字推斷其內容」，並點明接線是*第二個*測試。
  - `[low]` `[patch]` 測試檔註解把 strict mode 歸給「tsconfig.json's `strict: true`」，但 `tsconfig.json` 的 `exclude` 明列 `src/**/*.test.ts`，讀者循線查證會誤判推理有誤。已補明：strict 來自 tsconfig.json 的 compilerOptions，經 tsconfig.test.json 繼承供 typecheck 使用、由 ts-node 於 `npm test` 時套用，而 `exclude` 管的是 `dist/` 產出而非 strict 模式。

### 2026-08-22 — Review pass（第三輪）
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 2, low 7)
- defer: 0
- reject: 16: (high 0, medium 0, low 16)
- addressed_findings:
  - `[medium]` `[patch]` `VERBATIM_HEADERS` 比對整段引數文字，不看深度：`limitedFetch(url, { body: JSON.stringify({ headers: HEADERS }) })` 完全不帶標頭卻判為 wired。已實測確認（regex 對該字串回 true）。改為先以新的 `initLevelText()` 取出「init 物件那一層直屬的字元」（巢狀內容抹成空白），再對該層比對；已加對應 fixture，實測該形狀現在判為 unwired，真檔案上的變異測試也如預期變紅。
  - `[medium]` `[patch]` `spreadsAtHeadersLevel()` 只數 `{}` 與 `()`，不數 `[]`，因此 `{ headers: HEADERS, tags: [...list] }` 這種正確呼叫點會被誤判為 headers 層 spread。已實測確認回傳 true。深度改由 opener 堆疊追蹤，`{`／`[`／`(` 三者一律計入巢狀；已加 fixture 釘住陣列 spread 維持綠燈。這與第二輪修掉的 body-spread 誤報是同一類，只是漏了中括號。
  - `[low]` `[patch]` `blankNonCode()` 的引號掃描不在換行處停止，一個雜散單引號會與數行之後的引號配對，把中間的真實程式碼（可能含呼叫點）整片抹白。已讓掃描在行尾停止，斷言改為必須真的收在同一行的閉合引號；跨行的合法情形（跳脫換行）由既有的 `\\` 分支先行跳過，不受影響。
  - `[low]` `[patch]` 識別字前綴守衛的字元集 `[A-Za-z0-9_$]` 不含 `.`，`client.limitedFetch(` 與 `client?.limitedFetch(` 會被計入呼叫點數。已實測確認 `.` 不在該集合。已補入 `.` 並加 fixture。
  - `[low]` `[patch]` 掃描器自身的測試把判定條件就地重寫（`VERBATIM_HEADERS.test(...) && !spreadsAtHeadersLevel(...)`），註解卻宣稱「exactly as the check above forms it」。真檢查若日後加第三個條件，該測試會繼續綠燈而註解變成謊言。已抽出單一 `wiringProblem()` 判定函式，正式檢查與 meta 測試共用同一個。
  - `[low]` `[patch]` meta 測試沒有任何 template literal 案例，`blankNonCode()` 最複雜的一段（堆疊、per-frame brace 計數、`${` 推入、`}` 彈出）完全未被覆蓋。已補兩條：寫在 template literal 字面部分的假呼叫點不得計入、寫在 `${...}` 內插中的真呼叫點必須計入且判為 wired。
  - `[low]` `[patch]` `blankNonCode()` 的註解說「regex 只有括號不平衡或雜散引號會出問題」，但 `/https:\/\//` 這種尾端出現 `//` 的 regex 會被當成行註解起點，把該行其餘部分抹白——這是註解沒列到的第三種形狀。已補上，並說明三種形狀一律是大聲失敗（斷言或呼叫點計數不符），不會讓未接線的呼叫點變綠。
  - `[low]` `[patch]` `src/sources/usj.ts` 的註解仍寫 `Object.freeze` 「turns that into a TypeError at runtime」，未帶第二輪已補進測試檔的 strict mode 但書，兩處說法不一致。已補上但書並點明無論哪種模式標頭集合都不會被改動。
  - `[low]` `[patch]` 凍結測試的三個 `assert.throws` 依賴 runner 發出 strict 模組；已實測在 repo 內既有的 `tsx` 下三個斷言全部失敗，把一個完好的凍結誤報成「freeze is not in effect」（此為 pristine HEAD 上即存在的行為，非本輪修改所致）。已在三個 arrow function 內加上顯式 `'use strict'` 指令，讓拋錯成為測試自身的保證；`tsx` 下由 3 綠 2 紅轉為 5 綠，`npm test` 維持 81/81。原本用來解釋此風險的長段註解隨之縮短。

## Design Notes

接線測試不能只用單一全域正則掃 `headers: HEADERS` 的出現次數——那樣「四個呼叫點其中一個被刪掉、另一處出現兩次」會誤判通過。要先定位每個 `limitedFetch(` 呼叫點，再各自檢查其引數文字，數量與內容才彼此獨立。括號配對掃描（處理巢狀 `{}`／`()`，字串內容以本檔目前用法而言無括號干擾，若遇無法配對即 `assert.fail` 而非猜測）比手寫巨型正則更禁得起格式變動（單行 vs 多行 init）。

失敗訊息比照 `limits.test.ts`：不只說「不相等」，要說明為何這條線存在（NFR7：標頭不得揭露本站身分；四個呼叫點共用同一常數是唯一保證方式）。

型別上 `Object.freeze` 回傳 `Readonly<T>`，其唯讀屬性在 TypeScript 結構相容性下仍可指派給 `Record<string, string>`（唯讀修飾不參與可指派性判斷），故 `RequestInit.headers` 應可原樣接受；實作時仍須以 `npm run typecheck` 實測確認，不得預設成立。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無輸出、exit code 0。
- `npm test` -- expected: 全部測試通過；`src/sources/usj.test.ts` 的測試數由 2 增至 4（不可變性 1 + 接線 1，或等價拆分）。
- `git diff --stat` -- expected: 僅 `src/sources/usj.ts` 與 `src/sources/usj.test.ts` 兩檔變更。

## Auto Run Result

Status: done

### 實作摘要

本輪為 `status: done` 之後的追加 review pass，未新增功能，只修正前兩輪留下的判定瑕疵。核心變更是把「呼叫點是否原樣接線」的判定改成深度感知：新增 `initLevelText()` 取出 init 物件那一層直屬的字元（巢狀 `{}`／`[]`／`()` 內容抹成空白），並以單一 `wiringProblem()` 作為正式檢查與掃描器自測共用的判定。這同時堵掉兩個相反方向的錯誤——把埋在 body 裡的 `headers` 誤判為已接線（假綠燈），以及把陣列 spread 誤判為標頭層覆寫（假紅燈）。另修掉引號掃描不在行尾停止、成員存取被計入呼叫點、掃描器自測與正式檢查各寫一份判定、template literal 完全未被覆蓋，以及凍結測試依賴 runner 的 ambient strict mode。

### 變更檔案

- `src/sources/usj.ts` — 僅註解：`Object.freeze` 的效果補上 strict mode 但書，與測試檔說法對齊。`HEADERS` 鍵值集合、四個呼叫點寫法、`src/limiter.ts` 均未動。
- `src/sources/usj.test.ts` — 以 `initLevelText()` + `wiringProblem()` 取代 `spreadsAtHeadersLevel()` 與「對整段引數比對 `VERBATIM_HEADERS`」；引號掃描在行尾停止；識別字守衛納入 `.`；凍結測試三處加顯式 `'use strict'`；`blankNonCode()` 註解補上 regex `//` 形狀；掃描器自測新增 6 條 fixture（陣列 spread、body 內巢狀 headers、成員存取、template literal 字面、`${}` 內插、共用判定）。

### Review findings 分佈

- patch 9 項（medium 2、low 7），全部已修並重跑驗證。
- defer 0 項。本輪四位 reviewer 提出的 runtime 標頭觀測缺口、掃描範圍只涵蓋單一檔案、無裸 `fetch(` 禁令、`HEADERS` 鍵值集合未釘住四項，均與 frontmatter `deferred` 既有項目及 deferred-work 帳本（DW-30／DW-31／DW-32／DW-33）重複，未重複登錄。
- reject 16 項：上述四項重複、區域 `HEADERS` 遮蔽（原始碼文字掃描無法辨識識別身分）、凍結若回歸會污染同進程後續測試、淺凍結未釘住、計數斷言先於逐點斷言導致訊息不完整、外提 init 物件為假紅燈但未文件化、`existsSync` 未被測試／TOCTOU、失敗訊息內嵌 `rawArgs` 未截斷、註解密度過高、四個防禦性斷言路徑未被測試、`limitedFetch<T>(` 與 `limitedFetch (` 形狀漏掃、regex 字面值未建模（僅接受文件修正）、meta 測試未驗證正式檢查有在用該判定（已由共用判定涵蓋）。

### 後續 review 建議

`true`。本輪 patch 依嚴重度計為 high 0、medium 2、low 7；`3 × 2 + 1 × 7 = 13`，達到門檻 5。

### 驗證

- `npm run typecheck` — 通過，無輸出。
- `npm test` — 81 tests，81 pass，0 fail（`src/sources/usj.test.ts` 維持 5 個測試）。
- `npx tsx --test src/sources/usj.test.ts` — 5 pass 0 fail。修改前同一指令為 3 pass 2 fail，且該 2 紅在 pristine HEAD 上即可重現，確認為 runner 相依而非本輪引入。
- 指控實測：以獨立腳本對舊版 `spreadsAtHeadersLevel()` 與 `VERBATIM_HEADERS` 餵入 `{ headers: HEADERS, tags: [...list] }` 與 `{ body: JSON.stringify({ headers: HEADERS }) }`，分別得到 `true`（假紅燈）與 `true`（假綠燈），三項指控（含 `.` 不在守衛字元集）全部成立。
- 變異測試（改完即還原，`git diff` 已確認 `src/sources/usj.ts` 回到只剩註解變更）：把單行呼叫點改成 `{ body: JSON.stringify({ headers: HEADERS }) }` → `every limitedFetch call site passes HEADERS through verbatim` 變紅，訊息正確指出 `src/sources/usj.ts:259` 與實際引數。
- `git diff --stat` — 程式碼變更僅 `src/sources/usj.ts` 與 `src/sources/usj.test.ts` 兩檔。

### 殘餘風險

- 保證面仍止於原始碼文字：沒有測試觀察 `src/limiter.ts:114` 真正交給 `fetch` 的 init（DW-30）；掃描範圍只有 `src/sources/usj.ts` 一個檔案（DW-31）；沒有測試禁止裸 `fetch(`（DW-32）；`HEADERS` 應有的鍵值集合仍無斷言（DW-33）。四者皆已登錄於 deferred-work 帳本，本輪未觸碰。
- 原始碼文字掃描無法辨識識別身分：若 `usj.ts` 內出現遮蔽用的區域 `const HEADERS`，`headers: HEADERS` 仍會判為已接線。此為此手法的本質上限，intent 明文排除以 mock `fetch` 取代，故未在本輪處理。
- 掃描器仍不建模 regex 字面值。目前 `usj.ts` 唯一的 regex 安全；日後若出現含未配對括號、雜散引號或尾端 `//` 的 regex，該檔會因與標頭無關的理由變紅（會紅、不會靜默放行），註解已載明此為第一個該查的地方。
- 掃描器的四個防禦性斷言（未閉合區塊註解／字串、找不到配對右括號、EOF 時堆疊未歸位）仍無測試覆蓋。三者皆為錯誤路徑，最壞後果是訊息誤導，不會產生假綠燈。

---
title: 'DW-8/DW-9/DW-10：持續封鎖中止路徑的可排查性與偵測延遲強化'
type: 'refactor'
created: '2026-08-22'
baseline_revision: '6d66ffcbd785dca1eb2aeb933647117f029b0c00'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      `src/sources/usj.ts:313` 的另一處 `mapLimit`（時段庫存批次）與 `listProducts` 有完全相同的併發缺口，
      本次刻意未加封鎖旗標。
    evidence: |-
      該處於 `src/sources/usj.ts:333` 同樣以 `if (err instanceof BlockedError) throw err;` 傳播，
      但沒有共享旗標，其餘 worker 在封鎖浮現後仍會繼續對已知封鎖的來源送出批次請求。
      本次 intent 指名的是 `listProducts`，故不在範圍；修法與本次完全相同（旗標 + callback 首行檢查）。
    location: >-
      src/sources/usj.ts:313-337
    severity: medium
  - summary: >-
      `usj.ts` 四個 `!res.ok` throw 點各自內嵌 `.slice(0, 200)` 魔術數字，未改用新匯出的
      `BLOCKED_BODY_SNIPPET_MAX`；其中 calendar 那一處更完全沒有上限。
    evidence: |-
      `src/sources/usj.ts:261`、`:359`、`:432` 皆為 `(await res.text()).slice(0, 200)` 字面值；
      `src/sources/usj.ts:174` 則是 `Calendar API returned ${res.status}: ${await res.text()}`，
      完全沒有截斷，可能把整頁 HTML 灌進公開的 Actions log。本次新增了具名常數與 `snippet()`
      正規化，但未回頭套用到這四處，repo 目前存在兩套並行慣例。
    location: >-
      src/sources/usj.ts:174
    severity: medium
  - summary: >-
      封鎖偵測後，已通過旗標檢查但仍卡在速率閘門／退避 sleep 的取樣，依舊會跑完自己完整的
      1s/2s/4s 重試序列，沒有 AbortSignal 可取消。
    evidence: |-
      `listProducts` 的旗標檢查在 `mapLimit` callback 首行，實際請求要再經
      `fetchCatalogPage` → `limitedFetch` → `acquire()` → 速率閘門 `sleep()` 才送出；
      最多 `CONCURRENCY - 1` 個取樣會在偵測後仍各自對已封鎖來源送出首次請求與三次重試。
      intent 明示「在途請求無法取消，不在範圍內」，但把閘門前排隊的請求也歸入「在途」，
      比 intent 字面的排除範圍更寬，值得記錄。
    location: >-
      src/sources/usj.ts:463-470
    severity: low
  - summary: >-
      `--product=` 找不到對應產品時的 `process.exit(2)` 仍會跳過任何彙總，而該路徑已經跑完整輪
      catalog 取樣。
    evidence: |-
      `src/fetcher.ts` 的 `No product matched ...` 分支在 `listProducts` 已耗用真實請求與時間之後
      直接 exit 2，沒有 `logAbortSummary`。本次 DW-10 的授權範圍是「因持續封鎖中止」，
      故未涵蓋；但這是唯一剩下的無彙總早退出口。
    location: >-
      src/fetcher.ts:300-304
    severity: low
  - summary: >-
      `main()` 於檔尾以 `main();` 呼叫且未接 `.catch()`，非封鎖類的意外例外仍會以
      unhandledRejection 收場，且同樣沒有彙總。
    evidence: |-
      `if (require.main === module) { main(); }`；catalog 階段之後任何 throw
      （`fs.writeFileSync` EACCES、`buildDays` 例外等）都不會經過本次新增的 `logAbortSummary`。
      屬既有結構問題，非本次變更造成。
    location: >-
      src/fetcher.ts:409-411
    severity: medium
  - summary: >-
      本次新增的封鎖旗標在目前的生產接線下作用窗口極窄，其效益主要是防禦性的。
    evidence: |-
      `listProducts` 的唯一生產呼叫點 `src/fetcher.ts` 的 catalog catch 會在 rejection 的
      microtask 續行中同步 `process.exit(1)`，其餘 worker 多半停在 macrotask（網路 I/O 或
      `sleep()`）上，來不及重新檢查旗標。旗標真正發揮作用的前提是未來有不會立即 exit 的呼叫者。
      新測試直接呼叫 `listProducts` 並在 rejection 後續 tick，才觀察得到差異。
    location: >-
      src/sources/usj.ts:463
    severity: low
  - summary: >-
      I/O 矩陣「超長內文」列以等式描述長度，但當截斷點恰落在代理對（surrogate pair）中間時，
      `body.length` 會是 199 而非 200。
    evidence: |-
      `clipLoneSurrogate` 會丟掉被切一半的高位代理，以免輸出孤立代理字元。
      矩陣該列陳述的輸入是 `'x'.repeat(500)`，該輸入下等式成立；此為措辭與實作在極端輸入上的
      落差，非行為缺陷。
    location: >-
      src/limiter.ts
    severity: low
  - summary: >-
      截斷沒有任何標記，恰好 200 字的內文與被截斷的內文在 log 上無從分辨。
    evidence: |-
      本輪一度加上 `…` 標記，但 `<intent-contract>` 的 I/O 矩陣「超長內文」列明訂
      `body.length` 等於上限常數（200），標記使長度變成 201，與凍結契約抵觸，故回滾。
      要落地需先修訂 intent-contract 的該列措辭。
    location: >-
      src/limiter.ts
    severity: low
  - summary: >-
      欄位名 `body` 實際存放的是正規化並截斷後的片段，名稱與內容不符，需靠 JSDoc 更正。
    evidence: |-
      本輪一度更名為 `bodySnippet`，但 I/O 矩陣四列皆以 `body` 指稱該欄位，屬凍結契約，故回滾。
      此欄位為本次新增，趁尚無其他消費者時更名成本最低，但同樣需先修訂 intent-contract。
      後於 DW-43 重新套用此改名，並同步更新本文件 I/O 矩陣（行 137-140）與 `src/limiter.ts`，此則歷史記錄予以保留。
    location: >-
      src/limiter.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** 「持續封鎖 → 中止回合」這條路徑目前既慢又難排查：`src/limiter.ts` 重試耗盡時已 `await res.text()` 取得內文卻直接丟棄，使 WAF／驗證碼頁這類最需要內文的情境毫無線索（DW-8）；`src/sources/usj.ts` 的 `listProducts` 以 `mapLimit` 併發取樣，某一取樣丟出 `BlockedError` 後，其餘 worker 仍會繼續對尚未開始的日期發出新請求（DW-9）；`src/fetcher.ts` 的封鎖中止分支直接 `process.exit(1)`，跳過 `main()` 結尾的請求數／耗時彙總 log，事後無從得知該回合實際跑了多少請求、耗時多久（DW-10）。

**Approach:** 三者共用同一條封鎖中止路徑，一次補齊：`BlockedError` 額外攜帶截斷後的回應內文片段並帶進訊息；`listProducts` 的 `mapLimit` 加入共享封鎖旗標，偵測到封鎖後不再發起新請求；`fetcher.ts` 在兩個封鎖中止出口 `process.exit(1)` 前先印出請求數／耗時彙總。行為契約不變：仍是 exit 1，仍不寫 `index.json`／`days.json`。

## Boundaries & Constraints

**Always:**
- `BlockedError` 的 `body` 為 optional 第三個建構參數，既有兩參數呼叫與既有測試（`src/limiter.test.ts:111`）須原樣通過型別檢查。
- 內文片段長度上限以具名匯出常數集中控制，並由測試斷言，不得散落魔術數字。
- `listProducts` 的封鎖旗標僅阻擋「尚未發起」的請求；已在途的請求無法取消，屬已知且接受的偵測延遲。
- 封鎖中止彙總 log 走 `console.error`（與該路徑既有 alert 同一輸出流，且被既有測試的 `captureErrors` 攔截）。
- 中止路徑的可觀察契約不變：仍 `process.exit(1)`，仍不寫入 `index.json`／`days.json`，既有 `src/fetcher.test.ts` 三個封鎖測試不得改動其斷言語意。
- 測試以 `node:test` + `node:assert/strict` 撰寫，沿用 `src/test-support.ts` 的 `settle`／`track`／`flush` 與 mocked timers 慣例。
- `npm run typecheck` 與 `npm test` 均須通過。

**Block If:**
- 為了在 `listProducts` 加入封鎖旗標而必須變更 `mapLimit` 的公開簽章或語意（該函式為 `src/sources/usj.ts:313` 另一呼叫點共用）。

**Never:**
- 不改變封鎖情境的 exit code、不改變「不寫入 `index.json`／`days.json`」的行為。
- 不把封鎖旗標下沉進 `mapLimit` 或 `limitedFetch`，也不引入 `AbortController` 取消在途請求。
- 不處理 `src/sources/usj.ts:313` 的另一處 `mapLimit`（時段批次）——intent 指名的是 `listProducts`。
- 不改動 `RETRY_DELAYS_MS`、速率／並行常數，或 `limitedFetch` 的公開簽章。
- 不改動 `main()` 結尾原有的正常彙總 log。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 內文可讀的封鎖 | 重試耗盡仍 429/5xx，回應內文為 `blocked by WAF` | 丟出的 `BlockedError.bodySnippet === 'blocked by WAF'`，且 `message` 含該片段 | 仍為 `BlockedError`，`url`／`status` 不變 |
| 超長內文 | 內文長度 500 字元 | `bodySnippet.length` 等於匯出的上限常數（200），為前綴截斷 | 無 |
| 多行內文 | 內文含換行與連續空白 | `bodySnippet` 空白正規化為單一空格、首尾裁切，log 維持單行 | 無 |
| 無內文可讀 | `res.text()` reject，或內文為空字串 | `bodySnippet` 為 `undefined`，`message` 維持原句且不帶尾綴冒號 | `res.text()` 失敗被吞掉，不改變丟出的錯誤 |
| 取樣期間偵測到封鎖 | 取樣日期數遠多於併發度，其中一個日期持續 503 | `listProducts` 以 `BlockedError` reject；封鎖浮現後不再對任何新日期發出請求，實際請求到的日期數少於取樣日期總數 | 錯誤原樣向上傳播 |
| 取樣遇一般錯誤 | 某日期丟出非 `BlockedError` | 記錄後略過該日期，其餘取樣照常完成、照常回傳目錄 | `console.error` 一行，不中止 |
| 封鎖中止（product 階段） | `fetchProduct` 丟出 `BlockedError` | `exit(1)` 前先印出 `[fetch] aborted after N requests in Xs` 彙總 | 既有 `[fetch] {code} blocked` alert 保留 |
| 封鎖中止（catalog 階段） | `listProducts` 丟出 `BlockedError` | 同上，彙總 log 先於 `exit(1)` | 既有 `[fetch] catalog failed` alert 保留 |

</intent-contract>

## Code Map

- `src/limiter.ts:47-57` -- `BlockedError` 類別定義（`url`／`status` 兩個 readonly 欄位、`message` 組法）。DW-8 在此加 optional `body` 與截斷。
- `src/limiter.ts:124-127` -- 重試耗盡分支：`await res.text().catch(() => undefined)` 的回傳值目前被丟棄，改為接住並傳入建構子。
- `src/limiter.ts:130` -- 另一處 `res.text()`（為 socket 重用而 drain），屬重試中途，不在本次範圍。
- `src/limiter.ts:139-148` -- `mapLimit`：worker 迴圈 `while (next < items.length) await fn(items[next++])`。fn 丟錯會結束該 worker 自己的迴圈，但其餘 worker 仍會取用剩餘 items——這正是 DW-9 的機制。唯讀，不得變更簽章。
- `src/sources/usj.ts:453-503` -- `listProducts`：`everyNthDay(..., CATALOG_SAMPLE_DAYS=7)` 產生取樣日期，`mapLimit(samples, ...)` 在 457，per-date catch 於 461-468（`BlockedError` 已 rethrow）。DW-9 的旗標宣告於 `mapLimit` 之前、檢查置於 callback 最前。
- `src/sources/usj.ts:313` -- 另一處 `mapLimit`（時段批次），同樣的偵測延遲存在但明確不在範圍。
- `src/fetcher.ts:258-268` -- `main()` 開頭，`startedAt = Date.now()` 在 266，為耗時彙總的基準。
- `src/fetcher.ts:275-280` -- catalog 階段的 catch → `process.exit(1)`：封鎖從 `listProducts` 傳上來時走這裡。
- `src/fetcher.ts:320-331` -- per-product `BlockedError` 分支 → `process.exit(1)`：intent 指名的位置。
- `src/fetcher.ts:390-394` -- 原有的正常彙總 log（`requestCount()` + 耗時 + req/s），本次新增的中止彙總以它為藍本但不得改動它。
- `src/fetcher.ts:7` -- 已 import `requestCount`，中止彙總無須新增 import。
- `src/limiter.test.ts:63-94,110-116` -- 既有 `BlockedError` 測試；110 的 `new BlockedError(TEST_URL, 503)` 兩參數呼叫必須繼續編譯通過。
- `src/sources/usj-blocking.test.ts` -- 既有「封鎖不被吞掉」測試（單日範圍、mock `fetch` 回 503、`settle` 驅動）。DW-9 新測試加在此檔。
- `src/fetcher.test.ts:100-176` -- `captureErrors` 輔助與兩個封鎖中止測試（product 階段、catalog 階段），DW-10 的斷言加在這兩個測試內。
- `src/test-support.ts:62-79` -- `settle(t, promise)`：以 10s／最多 500 次的 mocked tick 驅動至 settle，逾時丟明確錯誤。
- `src/limits.test.ts` -- 常數斷言測試的既有慣例參考。

## Tasks & Acceptance

**Execution:**
- `src/limiter.ts` -- 新增匯出常數 `BLOCKED_BODY_SNIPPET_MAX = 200`；`BlockedError` 加 optional 第三參數 `body`，於建構子內做空白正規化＋截斷後存為 `readonly body?: string`，非空時併入 `message`；重試耗盡分支接住 `await res.text().catch(() => undefined)` 並傳入 -- 讓封鎖情境保有排查線索（DW-8）。
- `src/limiter.test.ts` -- 補測 I/O 矩陣前四列：帶內文、超長截斷、多行正規化、無內文；並保留既有兩參數建構呼叫 -- 鎖住 `body` 的存在與截斷契約。
- `src/sources/usj.ts` -- `listProducts` 於 `mapLimit(samples, ...)` 之前宣告共享封鎖旗標，callback 最前檢查到已封鎖即直接 return（不發請求），catch 內辨識到 `BlockedError` 時先設旗標再 rethrow -- 封鎖偵測後不再發起新請求（DW-9）。
- `src/sources/usj-blocking.test.ts` -- 新增測試：取樣日期數遠多於併發度、其中一個日期持續 503，斷言 `listProducts` 以 `BlockedError` reject、請求到的日期數少於取樣總數，且在 settle 後繼續 drain 若干 tick 仍不再出現新日期 -- drain 是關鍵，否則移除旗標後測試會假性通過。
- `src/fetcher.ts` -- 新增內部 helper（例如 `logAbortSummary(startedAt)`）印出 `[fetch] aborted after {requestCount()} requests in {seconds}s`，於 catalog catch 與 per-product `BlockedError` 分支的 `process.exit(1)` 之前呼叫 -- 中止回合仍留下請求數／耗時可見度（DW-10）。
- `src/fetcher.test.ts` -- 於既有兩個封鎖中止測試補斷言：`captureErrors` 收到的行中存在含 `aborted` 與 `requests` 的彙總行，且既有 exit code／不寫快照斷言不變 -- 鎖住彙總 log 先於 exit 執行。

**Acceptance Criteria:**
- Given `src/limiter.test.ts:110` 既有的兩參數 `new BlockedError(url, status)` 呼叫，when 執行 `npm run typecheck`，then 通過且該測試仍綠。
- Given 封鎖中止時 `fetcher.ts` 印出的既有 alert 行，when 該回合被封鎖中止，then `[fetch] {code} blocked` ／ `[fetch] catalog failed` 行仍存在，且新彙總行為額外一行而非取代。
- Given 一個被封鎖中止的回合，when `process.exit(1)` 被呼叫，then 彙總行已先行輸出（測試中以 `captureErrors` 於 `assert.rejects` 之後讀到該行證明）。
- Given `src/sources/usj.ts:313` 的另一處 `mapLimit`，when 本次變更完成，then 該處程式碼未被改動。
- Given `npm test`，when 全部測試執行，then 全數通過且無 unhandledRejection。

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 4, low 7)
- defer: 9: (high 0, medium 3, low 6)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[medium]` `[patch]` `snippet()` 的 `\s+` 正規化未涵蓋 C0/DEL 控制字元，來源可控的內文可把 ANSI escape 灌進公開 Actions log —— 加上 `[\x00-\x1f\x7f]` 剝除。
  - `[medium]` `[patch]` 沒有任何測試驗證內文片段真的抵達 operator 看得到的 `[fetch] {code} blocked` 那一行（DW-8 的真正表面）—— `src/fetcher.test.ts` 改以帶 body 的 `BlockedError` 斷言片段出現在該行且不含換行。
  - `[medium]` `[patch]` 中止彙總的斷言只比對 `aborted`／`requests` 兩個字，`[fetch] aborted after undefined requests in NaNs` 也會通過（reviewer 以 mutation 證實）—— 改為 `/^\[fetch\] aborted after \d+ requests in \d+\.\d+s$/` 形狀比對。
  - `[medium]` `[patch]` 「一般錯誤不設旗標」測試被自己的取樣數繳械：3 個取樣 < `CONCURRENCY` 4，所有日期在 404 出現前已被領走，`blocked = true` 加在整個 catch 也照樣全綠 —— 改用 53 取樣、失敗點移到中段。
  - `[low]` `[patch]` 正規化在截斷之前執行，會為 multi-MB 錯誤頁複製整份字串 —— 先切 `BLOCKED_BODY_SCAN_MAX`（= 上限 × 8）前綴再正規化。
  - `[low]` `[patch]` `slice()` 可能切在代理對中間留下孤立高位代理 —— 新增 `clipLoneSurrogate`，兩處切點皆套用。
  - `[low]` `[patch]` 沒有斷言彙總落在 alert 之後（`console.error` 的理由正是接在 alert 後）—— 新增 `assertAbortSummaryFollows`，比對兩者索引先後。
  - `[low]` `[patch]` catalog 測試新增的註解錯誤宣稱「零請求」是生產行為，實際上生產端要先送出一次請求加三次重試 —— 改寫為「零是本測試 mock `listProducts` 的產物」。
  - `[low]` `[patch]` 兩個新增的 limiter 非同步測試沿用固定 tick 寫法，該寫法在被鎖分支消失時是 hang 而非 fail —— 改用 `settle()`；既有的延遲序列測試維持原樣（它確實在量時間）。
  - `[low]` `[patch]` 封鎖測試的 `opened.size < samples.length` 過鬆（53 個中只擋下 1 個也會過）—— 收緊為不超過取樣數一半，並在註解記下實測值 13/53。
  - `[low]` `[patch]` 新增測試在正常路徑外還補上控制字元、掃描視窗上限、代理對切點三條斷言，使新增的防護不會靜默失效。

### 2026-08-22 — Follow-up review pass (status: done → in-review)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` `snippet()` 的 docstring 宣稱「C0/C1 controls and DEL are stripped」，但正規化只剝除了 `\x00-\x1f`（C0）與 `\x7f`（DEL），C1（`\x80-\x9f`）完全沒被涵蓋，與自身文件宣告不符 —— `src/limiter.ts` 的剝除正則改為 `[\x00-\x1f\x7f-\x9f]`。
  - `[low]` `[patch]` `logAbortSummary` 以 `(Date.now() - startedAt) / 1000` 算耗時，若系統時鐘在回合中被往回調（NTP 校時、VM 恢復），會印出負數秒數 —— `src/fetcher.ts` 改為 `Math.max(0, Date.now() - startedAt) / 1000`。
- 其餘 blind-hunter／edge-case-hunter 提出的項目（`usj.ts:313` 另一處 `mapLimit`、`usj.ts:174/261/359/432` 的內文截斷慣例不一致、`--product=` 無配對時的 `exit(2)` 無彙總、`main()` 無 `.catch()`、旗標在生產接線下作用窗口窄、代理對截斷使矩陣等式失準、截斷無標記、`body` 欄位命名與內容不符）與既有 `deferred` 清單中的項目完全重複，本輪不重複記錄。verification-gap 與 intent-alignment 兩層審查均無新增可執行發現（intent-alignment 指出 DW-8/DW-9 的測試在部分內部機制上比 `<intent-contract>` 明訂得更嚴格，但均未違反 Never/Block-If 條款，屬合理的額外強化，非落差）。

## Design Notes

`body` 的正規化與截斷放在 `BlockedError` 建構子內，而非呼叫端：如此「片段不超過上限、log 維持單行」成為類別不變式，可直接以 `new BlockedError(url, 503, 'x'.repeat(500))` 單元測試，不必跑完整重試序列。空字串與 `undefined` 一律視為「無內文」，`message` 才不會出現懸空的尾綴冒號。

```ts
// src/limiter.ts（示意）
export const BLOCKED_BODY_SNIPPET_MAX = 200;

const snippet = (body: string | undefined): string | undefined => {
  const collapsed = body?.replace(/\s+/g, ' ').trim();
  return collapsed ? collapsed.slice(0, BLOCKED_BODY_SNIPPET_MAX) : undefined;
};
```

DW-9 的旗標必須擋在「發起請求之前」，因此檢查點是 `mapLimit` callback 的第一行，而不是 catch 之後：`mapLimit` 的 worker 在 fn 丟錯時只結束自己的迴圈，其餘 worker 會繼續取用剩餘 items，那些才是要被擋下的新請求。

DW-9 測試若只 `settle` 到 reject 就斷言，會假性通過：`Promise.all` 在第一個 rejection 就 settle，此時未加旗標的其餘 worker 只是停在 mocked timer 上、還沒來得及發新請求。測試必須在 settle 之後繼續 drain 數個 tick，再斷言「沒有出現新日期」，該斷言才真的會在旗標被移除時失敗。

DW-10 的彙總同時掛在 catalog catch（非僅 `BlockedError`）與 per-product `BlockedError` 分支：兩者都是「中止整個回合」的出口，ledger 要的可見度（此回合跑了多少請求、多久）在兩處同義。正常結尾的彙總（`src/fetcher.ts:390-394`）維持原樣，中止彙總是另一行、另一個訊息前綴，不共用格式字串以免任一方被牽動。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無錯誤結束（含既有兩參數 `BlockedError` 呼叫點）
- `npm test` -- expected: 全數通過，無 unhandledRejection、無測試逾時／掛住
- `git diff --stat` -- expected: 僅 `src/limiter.ts`、`src/limiter.test.ts`、`src/sources/usj.ts`、`src/sources/usj-blocking.test.ts`、`src/fetcher.ts`、`src/fetcher.test.ts` 六個檔案

## Auto Run Result

**實作摘要：** 三個既有 deferred-work 項目（DW-8/DW-9/DW-10）共用同一條「持續封鎖 → 中止回合」路徑，一次補齊。`BlockedError` 新增 optional 第三參數 `body`，重試耗盡分支接住原本被丟棄的回應內文，正規化（剝除控制字元、空白摺疊為單一空格、UTF-16 代理對安全截斷）後截斷至具名常數 `BLOCKED_BODY_SNIPPET_MAX`（200）並併入 `message`（DW-8）。`listProducts` 的 `mapLimit` 加入共享封鎖旗標，偵測到 `BlockedError` 後不再對尚未發起的日期送出新請求，已在途的請求不受影響（DW-9，已知且接受的偵測延遲）。`fetcher.ts` 在 catalog 與 per-product 兩個封鎖中止出口的 `process.exit(1)` 之前，新增 `logAbortSummary` 印出 `[fetch] aborted after N requests in Xs`（DW-10）。中止路徑的可觀察契約全程不變：仍 `process.exit(1)`，仍不寫 `index.json`／`days.json`。

**檔案變更：**
- `src/limiter.ts` -- 新增 `BLOCKED_BODY_SNIPPET_MAX`／`BLOCKED_BODY_SCAN_MAX` 常數、`clipLoneSurrogate`／`snippet` 正規化函式；`BlockedError` 建構子加 optional `body` 並併入 `message`；重試耗盡分支改為接住 `res.text()` 的結果並傳入。
- `src/limiter.test.ts` -- 補測 I/O 矩陣前四列（帶內文、超長截斷、多行正規化、無內文）與控制字元剝除、掃描視窗上限、代理對安全截斷等邊界；保留既有兩參數建構呼叫。
- `src/sources/usj.ts` -- `listProducts` 加入共享封鎖旗標 `blocked`，`mapLimit` callback 首行檢查、`BlockedError` catch 內先設旗標再 rethrow。
- `src/sources/usj-blocking.test.ts` -- 新增「封鎖後不再開新日期」（含 settle 後續 drain 驗證）與「一般錯誤不設旗標」兩個測試。
- `src/fetcher.ts` -- 新增 `logAbortSummary(startedAt)` helper，掛在 catalog catch 與 per-product `BlockedError` 分支的 `process.exit(1)` 之前；本輪追加 `Math.max(0, ...)` 防止時鐘回撥造成負數秒數。
- `src/fetcher.test.ts` -- 於既有兩個封鎖中止測試補斷言，確認彙總行以固定形狀出現且落在既有 alert 之後。

**Review 發現分類（本輪 follow-up review pass）：**
- patch：2（medium 1、low 1）—— 均已修補並驗證：`snippet()` 的控制字元剝除補上 C1（`\x80-\x9f`），使其與自身 docstring 宣稱一致；`logAbortSummary` 的耗時計算加上 `Math.max(0, ...)` 防止時鐘回撥產生負數秒數。
- defer：0（本輪無新增；blind-hunter／edge-case-hunter 提出的其餘項目與既有 `deferred` 清單完全重複，不重複記錄）。
- reject：0（本輪其餘發現——generalized abort summary 涵蓋非 `BlockedError` 的 catalog 失敗、`requestCount()` 全域計數器未在測試間重置、`assertAbortSummaryFollows` 僅檢查先後而非緊鄰、`BLOCKED_BODY_SCAN_MAX` 邊界未測試、bidi／零寬字元未剝除——均屬既有慣例延續或高度推測性的攻擊模型，經評估後不成立為需處理項，未列入 triage 計數）。
- 上一輪（2026-08-22 初次 review pass）已處理：patch 11、defer 9、reject 5，詳見上方 Review Triage Log。

**Follow-up review recommendation：** `false`。本輪 patch findings：high 0、medium 1、low 1；分數 = 3×1 + 1×1 = 4（< 5 門檻），且無 high 級別 patch，故不建議再排一輪 follow-up review。

**驗證執行：**
- `npm run typecheck` -- 通過，無錯誤。
- `npm test` -- 91/91 全數通過，無 unhandledRejection、無逾時。
- `git diff --stat`（against baseline_revision）-- 僅 `src/limiter.ts`、`src/limiter.test.ts`、`src/sources/usj.ts`、`src/sources/usj-blocking.test.ts`、`src/fetcher.ts`、`src/fetcher.test.ts` 六個檔案，符合預期。

**殘餘風險：**
- `listProducts` 的封鎖旗標在目前生產接線下（`fetcher.ts` 在 rejection 的 microtask 續行中同步 `process.exit(1)`）作用窗口極窄，效益主要是防禦性的（已於上一輪記錄為 deferred）。
- `usj.ts:313` 的另一處 `mapLimit`（時段批次）仍有相同的偵測延遲缺口，intent 明確排除、未處理（已於上一輪記錄為 deferred）。
- `usj.ts:174/261/359/432` 的內文截斷仍用魔術數字或完全無上限，未套用新常數 `BLOCKED_BODY_SNIPPET_MAX`（已於上一輪記錄為 deferred）。


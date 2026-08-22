### DW-1: GitHub Actions concurrency 群組在 cancel-in-progress:false 下，若第三次觸發於已有一個 pending 回合等待時發生，會取消該 pending 回合並取而代之，導致某次排程可能被跳過而非僅延後執行； 此為 GitHub 平台既有語意，非本次變更之缺陷。
origin: spec-deferred d9aa9375a781
location: .github/workflows/fetch.yml:18-22
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: medium
reason: 架構文件 review-reality-check.md 的 F9 已載明並接受此語意（"queued run... pending job... will be canceled and the new queued job... will take its place"），現行 spec 的 I/O & Edge-Case Matrix 與 Design Notes 未涵蓋此邊界情境，值得補一句說明或未來評估告警機制。
status: open

### DW-2: epic-1-context.md（本次重新編譯的英文版）Goal 段落用詞「test-enforced rate/concurrency limits」略為誇大——CONCURRENCY 本身無靜態上限斷言。
origin: spec-deferred d7470bfd7c02
location: _bmad-output/implementation-artifacts/epic-1-context.md:7
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: epic-1-context.md 自身 Technical Decisions 段落即載明「CONCURRENCY 本身無靜態上限斷言」， 與 Goal 段落用詞略有落差，屬編譯側措辭精確度問題，非 Story 1.2 範圍內的程式碼缺陷。
status: open

### DW-3: epic-1-context.md 英文版 Story 1.7 註解只提到「shrink」，未提及該 story 名稱本身強調的 「回歸保護」（既有三層排程與變動偵測須被保留並回歸測試）。
origin: spec-deferred d1b5dbd2a359
location: _bmad-output/implementation-artifacts/epic-1-context.md:17
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: 對照 epics.md 原文 Story 1.7「分層排程回歸保護」與 Technical Decisions 中 AD-21 條目， 只讀該行英文括號註解的人可能誤以為此 story 純粹是刪減功能。
status: open

### DW-4: epic-1-context.md 的 Cross-Story Dependencies 段落未提及 Story 1.2 與其所滿足之 「同一時間僅一回合執行」需求的關聯，即使該需求列在同一份文件的 Requirements & Constraints 中。
origin: spec-deferred 575b064b5a6a
location: _bmad-output/implementation-artifacts/epic-1-context.md:55-60
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: 同文件其餘每條可對應到單一 story 的限制都在 Cross-Story Dependencies 有對應說明，唯獨 Story 1.2 這條被省略，屬編譯完整性小缺口。
status: open

### DW-5: HEADERS 的 forbidden-string 比對僅涵蓋 package.json 的 name 字串，未涵蓋未來若指定 repo 名稱、hosting 網域，或 Referer/Origin 標頭等其他可能洩漏本站身分的形式。
origin: spec-deferred 0c18c33c5655
location: src/sources/usj.test.ts
source_spec: `spec-1-3-請求標頭匿名化.md`
severity: medium
reason: 本 story 的 epic-1-context.md 明載 NFR3.2（站名/網域不得使用 USJ 商標）目前卡在待法遵書面意見， 本輪不得由實作單方面決定；且本站目前尚未指定任何實際網域，無具體字串可比對。Design Notes 已確認 Node fetch 不會自動附加 Referer/Origin，故現況不違反 AC，但比對範圍偏窄，值得在 Epic 2 指定網域後 補強測試涵蓋範圍。
status: open

### DW-6: HEADERS 匯出後仍為可變動（未 Object.freeze／未加 Readonly 型別），四個 limitedFetch 呼叫點共用同一 物件參照，理論上可被其中一處意外 mutate 而影響其他呼叫點。
origin: spec-deferred 8c616cb92930
location: src/sources/usj.ts:84
source_spec: `spec-1-3-請求標頭匿名化.md`
severity: low
reason: 此為既有行為（匯出前已是同一可變物件、同檔案內四處共用），本 story 只是加上 export 使測試可直接匯入， 並未新增或加劇此風險；epics.md 的 Story 1.3 AC 也未要求不可變性，屬額外強化而非本 story 範圍缺陷。
status: open

### DW-7: 新增測試僅靜態檢查 HEADERS 常數本身，未驗證四個 limitedFetch 呼叫點確實仍原樣傳入該常數（例如未來 某呼叫點改為 spread/覆寫），註解宣稱「鎖住全部四個呼叫點」但無程式碼強制驗證這個接線事實。
origin: spec-deferred ae0e2a645e0d
location: src/sources/usj.ts:147,240,337,410
source_spec: `spec-1-3-請求標頭匿名化.md`
severity: low
reason: 目前四個呼叫點皆為 `headers: HEADERS` 字面寫法（已於本次 Code Map 人工核對），本 story 的 diff 未 改動任何呼叫點；要做到自動化驗證接線需要類似 limits.test.ts 對 yml 的正則解析手法，屬額外強化， 非本 story 明確要求範圍。
status: open

### DW-8: `BlockedError` 未攜帶造成封鎖的回應內文（body），而其他錯誤路徑（`usj.ts` 四個 `!res.ok` throw 點）皆會附上內文片段；封鎖情境（WAF/驗證碼頁等）反而是最需要內文以利排查的一種。
origin: spec-deferred 48485b2b559e
location: src/limiter.ts:120-127
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `src/limiter.ts` 的 `limitedFetch` 於重試耗盡時 `await res.text().catch(() => undefined)` 後即丟棄，只以 `BlockedError(url, status)` 攜帶 URL 與狀態碼。獨立審查（blind-hunter、 edge-case-hunter）皆指出此點；本 story 的 AC 僅要求可用 `instanceof` 辨識封鎖並中止回合， 未要求攜帶回應內文，屬額外強化而非本 story 範圍缺陷。
status: open

### DW-9: `listProducts` 以 `mapLimit`（並行度 4）併發取樣多個日期，其中一個取樣命中持續封鎖並 throw `BlockedError` 後，其餘已在併發中的取樣仍會各自跑完自己的完整重試序列才各自失敗， 並非「偵測到即取消其餘進行中請求」，使「立即停止」在併發情境下有偵測延遲。
origin: spec-deferred 5f718f95ac0f
location: src/sources/usj.ts:438-467
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `Promise.all`／`mapLimit` 的設計本質如此：JS 無法中途取消已發出的 in-flight request。`src/sources/usj.ts` 的 `mapLimit(samples, ...)` 呼叫並未加入共享的 abort 旗標。獨立審查（blind-hunter、edge-case-hunter）皆指出此點；AC 的「立即停止」 合理解讀為「偵測到後不再發起新請求」而非「取消所有已在途的請求」，故不視為本 story 缺陷，但併發取樣的偵測延遲值得記錄。
status: open

### DW-10: `fetcher.ts` 因持續封鎖中止時，跳過了 `main()` 原本結尾處的請求數／耗時彙總 log， 降低事後排查此次回合實際跑了多少請求、耗時多久的可見度。
origin: spec-deferred 3657aa24548a
location: src/fetcher.ts:256-264
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `src/fetcher.ts` 的 `BlockedError` catch 分支只印一行 `[fetch] {code} blocked` 訊息 即呼叫 `process.exit(1)`，未執行到後面 `requestCount()`／耗時的彙總 log。獨立審查 （blind-hunter）指出此點；AD-16 只要求「非 0 exit 觸發 GitHub Actions 內建失敗通知」， 未要求額外彙總資訊，屬觀測性強化而非本 story AC 缺陷。
status: open

### DW-11: 因封鎖中止的回合，雖然不會改寫 `index.json`／`days.json`，但中止前已逐一寫入的 `data/products/*.json`（含被判定為 walk-up 而刪除的檔案）仍留在磁碟，且 `.github/workflows/fetch.yml` 的 commit 步驟為 `if: always()`，會把這批 與未更新的 `index.json` 不一致的檔案一起提交。
origin: spec-deferred 7d964dcc27e0
location: src/fetcher.ts:249-263 / .github/workflows/fetch.yml:61-68
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: medium
reason: `src/fetcher.ts` 逐產品迴圈在 `writeProduct()`／`fs.rmSync()` 之後才可能於下一個 產品命中 `BlockedError` 並 `process.exit(1)`；新增的 `src/fetcher.test.ts`「a block on a later product…」測試即斷言此行為（先前產品 的檔案確實已寫入）。四個審查角度皆獨立指出。AC 只要求「本回合不得寫入 index.json／days.json（上一份成功快照保留）」，字面已滿足，且站台以 `index.json` 的 `updatedAt` 當快取鍵，故不一致的產品檔實際上讀不到；要真正達成 整份快照原子性需改為緩衝寫入或在 workflow 端加閘門，屬本 story 範圍外的設計決策。
status: open

### DW-12: `src/fetcher.ts` 底部新增的 `if (require.main === module)` 閘門沒有任何測試或 CI 冒煙檢查確認 entry point 仍會實際執行；若日後工具鏈改動（ESM／改用 tsx／包一層 launcher）使該條件為 false，`npm run fetch` 會靜默無作為並以 exit 0 結束。
origin: spec-deferred b2bfe8951a17
location: src/fetcher.ts:333-338
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: medium
reason: 唯一 import `fetcher.ts` 的是 `src/fetcher.test.ts`，它直接呼叫 `main()`，因此閘門 本身在測試中永遠不會被求值；`src/limits.test.ts` 只做原始碼字串檢查。目前在 `tsconfig.json` 的 `"module": "CommonJS"` + ts-node 下行為正確（已實測 `node --require ts-node/register src/fetcher.ts` 仍會跑 `main()`），風險屬未來變更。 這正是 AD-16 要防的「靜默失敗」形態，但補強手段（CI 冒煙步驟）屬新增 CI 介面。
status: open

### DW-13: `.github/workflows/fetch.yml` 的 `Flag failed products` 步驟為 `if: always()` 且 讀取 `data/index.json`；封鎖中止的回合並未改寫該檔，因此該步驟會把「上一回合」的 失敗產品重新標成本次執行的 `::warning`。
origin: spec-deferred 02fdacdb5bbd
location: .github/workflows/fetch.yml:45-56
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: 獨立審查（blind-hunter、verification-gap）皆指出。本 story 之前逐產品迴圈不會中途 中止，`index.json` 幾乎必然被本回合改寫，故此情境是新中止路徑才變得可達；但修正 需調整 workflow 步驟條件，且封鎖回合本身已是紅燈並印出明確的 `[fetch] … blocked` 訊息，誤導性有限。
status: open

### DW-14: Follow-up review still recommended for 1-4-429-5xx-退避與封鎖告警 after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260822-132139-136d; this entry preserves the lingering recommendation for a deliberate later review.
status: open

### DW-15: `buildDays()` 不讀 `ProductSummary` 的 `stale` / `error` 旗標，因此本回合抓取失敗或被 `--product=` 跳過的票種，其舊檔中不存在的日期會被以與新鮮資料相同的信心斷言為 `sold-out`。
origin: spec-deferred d0a5552c6e70
location: src/fetcher.ts (buildDays / cellStatus)
source_spec: `spec-1-5-完整格網快照與狀態判定.md`
severity: medium
reason: `src/fetcher.ts` 的 `buildDays()` 只取 `summary.code`，`cellStatus()` 亦只看 `ProductResult` 的內容，兩者都看不到 `summary.stale === true`（`src/fetcher.ts` 逐產品 迴圈失敗分支與 untouched 合併處會設定它）。格網化之前，陳舊檔案只會讓「可購」格延用舊值； 格網化之後，它額外產生「已售罄」這個新的、具體且可能錯誤的斷言。 本 story 的 AC2 無條件要求「缺席 + latestDate → 售罄／尚未開賣」，未對陳舊證據設例外， 故本回合依 intent 實作；新鮮度標示由 Story 1.10（靜默失敗偵測）與 Story 3.7（資料新鮮度 與過期標示）承接時應一併決定陳舊票種的格子是否降級為 `unknown`。
status: open

### DW-16: 整回合證據崩潰（所有產品檔皆讀不到）時，會產出 5,735 格全 `unknown` 的格網覆蓋掉上一份good 快照，且 `main()` 仍以 exit 0 結束。
origin: spec-deferred 8869a3e0176f
location: src/fetcher.ts (main 的 writeDays 呼叫點)
source_spec: `spec-1-5-完整格網快照與狀態判定.md`
severity: medium
reason: `cellStatus()` 對 `readProduct() === null` 回傳 `unknown`（正確，單一票種層級已有測試涵蓋）， 但沒有任何一層檢查「整份格網沒有任何 available 格」。`writeDays()` 會照寫， `.github/workflows/fetch.yml` 的 commit 步驟為 `if: always()`，而 `main()` 只在 `failed === targets.length` 時才 exit 1——讀檔失敗不計入 `failed`。 此為既有行為（格網化前同樣會把 `days.json` 寫成空物件），且 Story 1.10 「零/近零結果視為失敗，不得寫入快照」正是為此而設，故不在本 story 修補。
status: open

### DW-17: `days.json` 的格子結構已變更但 `schemaVersion` 仍為 `1`，且 `index.html` 完全不讀 `schemaVersion`，因此在 1.5 與 1.6 之間存在「舊快取頁面讀到新檔」的視窗。
origin: spec-deferred edc11e3d2bf3
location: src/types.ts (Days.schemaVersion) / index.html
source_spec: `spec-1-5-完整格網快照與狀態判定.md`
severity: medium
reason: 舊版 `fitsParty` 的守衛為 `p.units == null || p.units >= people`；非可購格沒有 `units` 欄位，`undefined == null` 為 true，因此每一格都會通過，售罄與尚未開賣的票種會被畫成可購列 ——正是本 story 要防的錯誤方向。`days.json` 以 `?t=${catalog.updatedAt}` 破快取，但 `index.html` 由瀏覽器獨立快取，已開啟未重載的頁面即落在此視窗內。 升版與「下游遇未識別版本須中止」由 Story 1.6 承接；惟 1.6 的規則作用於建置端， 不涵蓋瀏覽器端已載入的舊頁面，該視窗需在 1.6 或 Epic 2 cutover 時一併確認關閉。
status: open

- source_spec: `spec-1-6-快照-schema-版本控制.md`
  summary: `src/fetcher.ts` 的 `readIndex()` 讀回上一輪 `index.json` 供合併（取得已知 `products`、`lastSeenAt`）時，從未呼叫 `assertIndexSchemaVersion()`，本 story 建立的版本守衛只用在消費端（`index.html`）與 CI 閘門，未涵蓋抓取端自己讀回舊檔這條路徑。
  evidence: 目前無實害——`readIndex()` 只讀 `raw.products` 陣列並已有 `Array.isArray` 結構檢查，`INDEX_SCHEMA_VERSION` 本 story 未變動（維持 5），故版號不符不會腐化合併結果；但此為既有行為（1.6 之前即如此），非本 story 造成，AD-14 的精神（任何讀取此檔的消費者都應驗版）嚴格上也涵蓋這條路徑，值得未來 `index.json` 形狀真的改版時一併補上。

- source_spec: `spec-1-6-快照-schema-版本控制.md`
  summary: 逐票種快照檔（`data/products/<code>.json`，`ProductResult` 型別）完全沒有 `schemaVersion` 欄位，不在本 story 新增的任何守衛（`schema.ts`／`schema-check.ts`／`index.html`）覆蓋範圍內。
  evidence: 本 story 的 Boundaries 明文排除變更 `products/*.json` 的結構，故不在範圍內；但 `buildDays()`／`cellStatus()` 直接讀這些檔案，AD-14 描述的「抓取端版本回滾造成無聲錯誤斷言」對這批檔案同樣成立，只是尚未發生，值得日後與 Story 1.10（靜默失敗偵測）一併評估是否也需要版本欄位。

- source_spec: `spec-1-6-快照-schema-版本控制.md`
  summary: 新增的 `.github/workflows/ci.yml` `schema:check` 步驟，實際上不會在 `fetch.yml` 排程回合自己寫入不符版號快照的當下被觸發——GitHub Actions 對預設 `GITHUB_TOKEN` 推送的提交不會觸發其他 workflow（反遞迴保護），而 `fetch.yml` 的 commit 步驟正是用預設 token 直接 push 到 `main`，故 `ci.yml` 的 `on: push` 不會為那些提交執行。
  evidence: `index.html` 端的 `assertCalendarSchema`／`assertIndexSchema` 仍會在使用者瀏覽器端擋下錯誤版本（使用者不會看到無聲錯誤資料），故本 story 的 AC 仍然成立；但 CI 閘門「建置紅燈而非無聲錯誤」的敘事對排程回合這個主要情境實際上不生效，要等到下一次人工 push 或 PR 觸發 CI 才會被抓到。修正需要調整 `fetch.yml` 的推送機制（例如改用具備推送觸發權限的 token 或改走 PR），屬於既有排程／推送架構的變更，超出本 story 範圍（Boundaries 明文禁止改動抓取排程行為）。

### DW-18: 瀏覽器已快取的**舊** `index.html`（其程式碼裡沒有 schema 守衛）讀到新版 `days.json` 的視窗， 本 story 無法關閉——守衛只存在於新頁面裡。
origin: spec-deferred 167bc2813831
location: index.html (loadCalendar / boot 的守衛只保護新載入的頁面)
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: 本 story 在 `index.html` 加入 `assertCalendarSchema()` / `assertIndexSchema()`，關閉的是 「新頁面讀到未識別版本」的缺口。但 DW-17 的另一半是舊頁面：使用者瀏覽器快取中的上一版 `index.html` 完全沒有這兩個函式，v3 的 `days.json` 上線時它仍會照舊渲染。沒有任何伺服器端 或建置端手段能對已下載的靜態檔補上守衛。 真正的關閉點是 Epic 2 cutover（新網址／資產指紋），屆時舊頁面不再是同一份資產。
status: open

### DW-19: 守衛只比對 `schemaVersion`，不驗證檔案的**形狀**；同一版號下欄位缺漏或型別改變仍會無聲通過。
origin: spec-deferred e32d3792ea71
location: src/schema.ts、src/schema-check.ts
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: medium
reason: `src/schema.ts` 的兩個守衛與 `src/schema-check.ts` 只讀 `schemaVersion` 一個欄位。若寫入端 在不改版號的情況下漏掉 `status`、把 `price` 寫成字串，或 `days` 少了整段日期，所有閘門仍全綠。 本 story 的 AC 只要求版號守衛，逐欄位 runtime 形狀驗證屬 AD-14a 的後續提案，故明文排除 （見 Boundaries「Never」第三條）。
status: open

### DW-20: `.github/workflows/fetch.yml` 在 `npm run fetch` 之後直接 commit/push `data/`，中間沒有 schema 閘門，且 commit 步驟為 `if: always()`；被回滾的抓取端寫出的舊版快照會先發佈、CI 才紅燈。
origin: spec-deferred b7c9f7ebcc2b
location: .github/workflows/fetch.yml:60-68
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: medium
reason: 本 story 的閘門只掛在 `ci.yml`（push/PR 觸發）。fetch workflow 以預設 `GITHUB_TOKEN` push， 該 push 通常不會再觸發 workflow，因此壞快照可能在無人注意下停留於已發佈的樹上，直到下一次 人為 push 才被 CI 攔下。要真正擋在寫入前，須同時改動 commit 步驟的 `if: always()` 條件—— 該條件屬 Story 1.10「零/近零結果視為失敗，不得寫入快照」的範圍，不宜在本 story 單方面更動。
status: open

### DW-21: `src/fetcher.ts` 的 `readIndex()` 讀 `data/index.json` 後直接 cast 成 `Index`， 不驗版號且把任何失敗吞成 `null`，是 AD-14 所指的靜默降級。
origin: spec-deferred ab4970d09919
location: src/fetcher.ts:24-31
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: medium
reason: 本 story 為 `index.json` 在 `index.html` 與 `schema-check.ts` 兩處加了守衛，但抓取端自己 讀回上一輪 `index.json` 的路徑未納入。在此加硬守衛會讓「升版當回合」的抓取直接失敗， 需要一併決定升版時的遷移行為，超出本 story 的 AC。
status: open

### DW-22: `data/products/*.json` 完全沒有 `schemaVersion` 欄位，因此不在任何版本守衛的涵蓋範圍內。
origin: spec-deferred 392e3fcbc717
location: data/products/*.json、src/fetcher.ts:38-41
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: medium
reason: AD-14 的字面要求是「`data/` 下的每一份檔案各自擁有獨立的 `schemaVersion` 序列」。 本 story 的 AC 只點名 `days.json` 與 `index.json`，產品檔連版號欄位都尚未存在， 為其引入版號屬新的結構變更，須自成一個 story。
status: open

### DW-23: `index.html` 的 `boot()` 取 `data/index.json` 時未檢查 `res.ok` 就 `res.json()`， 404/500 會以 JSON 解析錯誤的面貌出現。
origin: spec-deferred a17edf54c60d
location: index.html:1419-1423
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: 同檔的 `loadCalendar()` 有 `if (!res.ok) throw new Error('HTTP ' + res.status)`，`boot()` 沒有。 此為本 story 之前既有的不對稱（本次僅在該行之後插入版號守衛），錯誤仍會落入既有 catch 顯示 錯誤框，故非新缺陷，但錯誤訊息會誤導排查方向。
status: open

### DW-24: 沒有任何測試釘住 CI workflow 的閘門步驟本身；把 `ci.yml` 裡的 `- run: npm run schema:check` （或 i18n 閘門）整行刪掉，測試套件仍然全綠。
origin: spec-deferred 4eadf5a0aa26
location: .github/workflows/ci.yml:28-37
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: 本 story 引用 AD-22「不被執行的規則就不是規則」把閘門接上 `ci.yml`，但 `src/` 底下沒有任何 測試讀 `.github/workflows/`，三道閘門（tsc、i18n:check、schema:check）都一樣沒有保護。 這是全 repo 既有的缺口，不是本 story 造成的；要補應該一次涵蓋三道步驟，自成一個 story。
status: open

### DW-25: `src/i18n-check.ts` 讀 `data/index.json` 後直接 cast 成 `Index`，是本 story 之外 第三個未驗版的 `index.json` 消費者，既有 deferred 項目（抓取端 `readIndex()`、 `products/*.json`）都沒有涵蓋它。
origin: spec-deferred d14807030099
location: src/i18n-check.ts:59
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: `src/i18n-check.ts` 以 `JSON.parse(fs.readFileSync(...'index.json')) as Index` 讀檔後 直接走訪 `index.products`，全程不呼叫 `assertIndexSchemaVersion()`。它本身是一道 CI 閘門， 卻會對版號不符的 `index.json` 回報「翻譯缺漏」而非「版號不符」，把診斷指向錯誤方向。 目前無實害：`INDEX_SCHEMA_VERSION` 本 story 未變動，且 CI 中 `npm test` 會先於 `i18n:check` 失敗；只有單獨執行 `npm run i18n:check` 的開發者會遇到誤導訊息。 此檔為既有程式碼，本 story 未觸及，且 `src/` 下沒有任何 `i18n-check` 的測試檔， 補守衛應與該檔的測試一併處理。
status: open

### DW-26: Follow-up review still recommended for 1-6-快照-schema-版本控制 after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260822-132139-136d; this entry preserves the lingering recommendation for a deliberate later review.
status: open

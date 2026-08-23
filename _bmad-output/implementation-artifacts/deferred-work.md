### DW-1: GitHub Actions concurrency 群組在 cancel-in-progress:false 下，若第三次觸發於已有一個 pending 回合等待時發生，會取消該 pending 回合並取而代之，導致某次排程可能被跳過而非僅延後執行； 此為 GitHub 平台既有語意，非本次變更之缺陷。
origin: spec-deferred d9aa9375a781
location: .github/workflows/fetch.yml:18-22
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: medium
reason: 架構文件 review-reality-check.md 的 F9 已載明並接受此語意（"queued run... pending job... will be canceled and the new queued job... will take its place"），現行 spec 的 I/O & Edge-Case Matrix 與 Design Notes 未涵蓋此邊界情境，值得補一句說明或未來評估告警機制。
status: done 2026-08-22
resolution: closed by human decision: 此為 GitHub concurrency 的既有平台語意，非本次變更之缺陷，且已於架構文件 review-reality-check.md F9 明文載明並接受；30 分鐘排程重複覆蓋，跳過一回合僅延後資料新鮮度。
decision: 2026-08-22 接受並關閉 — 此為 GitHub concurrency 的既有平台語意，非本次變更之缺陷，且已於架構文件 review-reality-check.md F9 明文載明並接受；30 分鐘排程重複覆蓋，跳過一回合僅延後資料新鮮度。

### DW-2: epic-1-context.md（本次重新編譯的英文版）Goal 段落用詞「test-enforced rate/concurrency limits」略為誇大——CONCURRENCY 本身無靜態上限斷言。
origin: spec-deferred d7470bfd7c02
location: _bmad-output/implementation-artifacts/epic-1-context.md:7
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: epic-1-context.md 自身 Technical Decisions 段落即載明「CONCURRENCY 本身無靜態上限斷言」， 與 Goal 段落用詞略有落差，屬編譯側措辭精確度問題，非 Story 1.2 範圍內的程式碼缺陷。
status: done 2026-08-22
resolution: already resolved: epic-1-context.md 已於 commit e901f1e 重新編譯為繁體中文版，全檔已無 'test-enforced' 字串；現行 Goal（epic-1-context.md:7）只寫「在明確的速率／並行上限內運作」，未宣稱並行度由測試斷言上限。

### DW-3: epic-1-context.md 英文版 Story 1.7 註解只提到「shrink」，未提及該 story 名稱本身強調的 「回歸保護」（既有三層排程與變動偵測須被保留並回歸測試）。
origin: spec-deferred d1b5dbd2a359
location: _bmad-output/implementation-artifacts/epic-1-context.md:17
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: 對照 epics.md 原文 Story 1.7「分層排程回歸保護」與 Technical Decisions 中 AD-21 條目， 只讀該行英文括號註解的人可能誤以為此 story 純粹是刪減功能。
status: done 2026-08-22
resolution: already resolved: 同一次重新編譯（commit e901f1e）後 epic-1-context.md:17 為「- Story 1.7: 分層排程回歸保護」，全檔已無 'shrink' 註解，story 名稱本身即載明回歸保護。

### DW-4: epic-1-context.md 的 Cross-Story Dependencies 段落未提及 Story 1.2 與其所滿足之 「同一時間僅一回合執行」需求的關聯，即使該需求列在同一份文件的 Requirements & Constraints 中。
origin: spec-deferred 575b064b5a6a
location: _bmad-output/implementation-artifacts/epic-1-context.md:55-60
source_spec: `spec-1-2-禁止抓取回合重疊.md`
severity: low
reason: 同文件其餘每條可對應到單一 story 的限制都在 Cross-Story Dependencies 有對應說明，唯獨 Story 1.2 這條被省略，屬編譯完整性小缺口。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-epic-context-cross-story-dep
resolution-undo: 550612e1d3de030b1c6278f02afd2b0dc45b97e48d0f24d4861d9112b579ab5a 2026-08-23 7374617475733a206f70656e

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
status: done 2026-08-22
resolution: resolved by sweep bundle dw-header-anonymization-hardening
resolution-undo: a46b86ae59d6044313cd4d050efa192774e882f33294959b47509a46f44cff07 2026-08-22 7374617475733a206f70656e

### DW-7: 新增測試僅靜態檢查 HEADERS 常數本身，未驗證四個 limitedFetch 呼叫點確實仍原樣傳入該常數（例如未來 某呼叫點改為 spread/覆寫），註解宣稱「鎖住全部四個呼叫點」但無程式碼強制驗證這個接線事實。
origin: spec-deferred ae0e2a645e0d
location: src/sources/usj.ts:147,240,337,410
source_spec: `spec-1-3-請求標頭匿名化.md`
severity: low
reason: 目前四個呼叫點皆為 `headers: HEADERS` 字面寫法（已於本次 Code Map 人工核對），本 story 的 diff 未 改動任何呼叫點；要做到自動化驗證接線需要類似 limits.test.ts 對 yml 的正則解析手法，屬額外強化， 非本 story 明確要求範圍。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-header-anonymization-hardening
resolution-undo: a46b86ae59d6044313cd4d050efa192774e882f33294959b47509a46f44cff07 2026-08-22 7374617475733a206f70656e

### DW-8: `BlockedError` 未攜帶造成封鎖的回應內文（body），而其他錯誤路徑（`usj.ts` 四個 `!res.ok` throw 點）皆會附上內文片段；封鎖情境（WAF/驗證碼頁等）反而是最需要內文以利排查的一種。
origin: spec-deferred 48485b2b559e
location: src/limiter.ts:120-127
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `src/limiter.ts` 的 `limitedFetch` 於重試耗盡時 `await res.text().catch(() => undefined)` 後即丟棄，只以 `BlockedError(url, status)` 攜帶 URL 與狀態碼。獨立審查（blind-hunter、 edge-case-hunter）皆指出此點；本 story 的 AC 僅要求可用 `instanceof` 辨識封鎖並中止回合， 未要求攜帶回應內文，屬額外強化而非本 story 範圍缺陷。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-block-abort-path-hardening
resolution-undo: 28808aec610d79c52978609d3a007ac27c9438a25d2cda2890dde1fdc79cb947 2026-08-22 7374617475733a206f70656e

### DW-9: `listProducts` 以 `mapLimit`（並行度 4）併發取樣多個日期，其中一個取樣命中持續封鎖並 throw `BlockedError` 後，其餘已在併發中的取樣仍會各自跑完自己的完整重試序列才各自失敗， 並非「偵測到即取消其餘進行中請求」，使「立即停止」在併發情境下有偵測延遲。
origin: spec-deferred 5f718f95ac0f
location: src/sources/usj.ts:438-467
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `Promise.all`／`mapLimit` 的設計本質如此：JS 無法中途取消已發出的 in-flight request。`src/sources/usj.ts` 的 `mapLimit(samples, ...)` 呼叫並未加入共享的 abort 旗標。獨立審查（blind-hunter、edge-case-hunter）皆指出此點；AC 的「立即停止」 合理解讀為「偵測到後不再發起新請求」而非「取消所有已在途的請求」，故不視為本 story 缺陷，但併發取樣的偵測延遲值得記錄。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-block-abort-path-hardening
resolution-undo: 28808aec610d79c52978609d3a007ac27c9438a25d2cda2890dde1fdc79cb947 2026-08-22 7374617475733a206f70656e

### DW-10: `fetcher.ts` 因持續封鎖中止時，跳過了 `main()` 原本結尾處的請求數／耗時彙總 log， 降低事後排查此次回合實際跑了多少請求、耗時多久的可見度。
origin: spec-deferred 3657aa24548a
location: src/fetcher.ts:256-264
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: `src/fetcher.ts` 的 `BlockedError` catch 分支只印一行 `[fetch] {code} blocked` 訊息 即呼叫 `process.exit(1)`，未執行到後面 `requestCount()`／耗時的彙總 log。獨立審查 （blind-hunter）指出此點；AD-16 只要求「非 0 exit 觸發 GitHub Actions 內建失敗通知」， 未要求額外彙總資訊，屬觀測性強化而非本 story AC 缺陷。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-block-abort-path-hardening
resolution-undo: 28808aec610d79c52978609d3a007ac27c9438a25d2cda2890dde1fdc79cb947 2026-08-22 7374617475733a206f70656e

### DW-11: 因封鎖中止的回合，雖然不會改寫 `index.json`／`days.json`，但中止前已逐一寫入的 `data/products/*.json`（含被判定為 walk-up 而刪除的檔案）仍留在磁碟，且 `.github/workflows/fetch.yml` 的 commit 步驟為 `if: always()`，會把這批 與未更新的 `index.json` 不一致的檔案一起提交。
origin: spec-deferred 7d964dcc27e0
location: src/fetcher.ts:249-263 / .github/workflows/fetch.yml:61-68
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: medium
reason: `src/fetcher.ts` 逐產品迴圈在 `writeProduct()`／`fs.rmSync()` 之後才可能於下一個 產品命中 `BlockedError` 並 `process.exit(1)`；新增的 `src/fetcher.test.ts`「a block on a later product…」測試即斷言此行為（先前產品 的檔案確實已寫入）。四個審查角度皆獨立指出。AC 只要求「本回合不得寫入 index.json／days.json（上一份成功快照保留）」，字面已滿足，且站台以 `index.json` 的 `updatedAt` 當快取鍵，故不一致的產品檔實際上讀不到；要真正達成 整份快照原子性需改為緩衝寫入或在 workflow 端加閘門，屬本 story 範圍外的設計決策。
status: done 2026-08-23
resolution: closed by human decision: No fix; index.json's updatedAt cache key already prevents the site from serving orphaned product files, and true atomic writes are a bigger change better done deliberately.
decision: 2026-08-23 Accept current behavior — No fix; index.json's updatedAt cache key already prevents the site from serving orphaned product files, and true atomic writes are a bigger change better done deliberately.

### DW-12: `src/fetcher.ts` 底部新增的 `if (require.main === module)` 閘門沒有任何測試或 CI 冒煙檢查確認 entry point 仍會實際執行；若日後工具鏈改動（ESM／改用 tsx／包一層 launcher）使該條件為 false，`npm run fetch` 會靜默無作為並以 exit 0 結束。
origin: spec-deferred b2bfe8951a17
location: src/fetcher.ts:333-338
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: medium
reason: 唯一 import `fetcher.ts` 的是 `src/fetcher.test.ts`，它直接呼叫 `main()`，因此閘門 本身在測試中永遠不會被求值；`src/limits.test.ts` 只做原始碼字串檢查。目前在 `tsconfig.json` 的 `"module": "CommonJS"` + ts-node 下行為正確（已實測 `node --require ts-node/register src/fetcher.ts` 仍會跑 `main()`），風險屬未來變更。 這正是 AD-16 要防的「靜默失敗」形態，但補強手段（CI 冒煙步驟）屬新增 CI 介面。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-fetch-entrypoint-smoke-check
resolution-undo: 05acb5a0c853638836181f61a99a89f751c877d64e6c6f3a4cc81b08474dea93 2026-08-23 7374617475733a206f70656e

### DW-13: `.github/workflows/fetch.yml` 的 `Flag failed products` 步驟為 `if: always()` 且 讀取 `data/index.json`；封鎖中止的回合並未改寫該檔，因此該步驟會把「上一回合」的 失敗產品重新標成本次執行的 `::warning`。
origin: spec-deferred 02fdacdb5bbd
location: .github/workflows/fetch.yml:45-56
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: 獨立審查（blind-hunter、verification-gap）皆指出。本 story 之前逐產品迴圈不會中途 中止，`index.json` 幾乎必然被本回合改寫，故此情境是新中止路徑才變得可達；但修正 需調整 workflow 步驟條件，且封鎖回合本身已是紅燈並印出明確的 `[fetch] … blocked` 訊息，誤導性有限。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-flag-failed-products-abort-skip
resolution-undo: 75987223e8022d7158934c121fe69996664d97b6b2599713d0ead05c94f6baf4 2026-08-23 7374617475733a206f70656e

### DW-14: Follow-up review still recommended for 1-4-429-5xx-退避與封鎖告警 after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-1-4-429-5xx-退避與封鎖告警.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260822-132139-136d; this entry preserves the lingering recommendation for a deliberate later review.
status: done 2026-08-22
resolution: closed by human decision: 該 review 的具體發現已以 DW-8～DW-13 六筆進入帳本，且本次 sweep 已逐筆對照現行程式碼重新驗證；再跑一次只會重新推導同一批項目。
decision: 2026-08-22 關閉，已由具體項目承接 — 該 review 的具體發現已以 DW-8～DW-13 六筆進入帳本，且本次 sweep 已逐筆對照現行程式碼重新驗證；再跑一次只會重新推導同一批項目。

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
status: done 2026-08-22
resolution: already resolved: Story 1.6（commit c0a1d5d）已將 src/schema.ts:28 的 DAYS_SCHEMA_VERSION 升為 2，並在 index.html:1041 assertCalendarSchema / index.html:1050 assertIndexSchema 加上守衛（呼叫點 index.html:1065、index.html:1423）；index.html:1083 的 fitsParty 亦改為先經 onSale() 過濾，不再讓無 units 的非可購格通過。舊頁面快取那一半另由 DW-18 追蹤。

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
decision: 2026-08-22 留待 Story 1.10 一併設計

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
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-fetcher-readindex-version-guard
resolution-undo: bda380cbc0469d400402b31bde975cb5edc7727116cdaa6c3e5d205953e3f306 2026-08-23 7374617475733a206f70656e
decision: 2026-08-22 版號不符時記警告並視為「沒有上一輪 index」 — 在 src/fetcher.ts 的 readIndex() 內呼叫 assertIndexSchemaVersion()（或等價比對），版號不符時印出明確的 console.error 說明版號與期望值，並回傳 null，使本回合以「無上一輪快照」的既有路徑繼續。此路徑本來就存在（首次抓取即是），且因為所有產品的 lastSeenAt 都會設為本回合時間，sweepDelisted() 不會誤刪任何票種，代價僅為升版當回合失去 carriedOver 的補撈。同時補測試涵蓋版號不符與版號正確兩條路徑。DW-27 為本項的重複副本，一併關閉。

### DW-22: `data/products/*.json` 完全沒有 `schemaVersion` 欄位，因此不在任何版本守衛的涵蓋範圍內。
origin: spec-deferred 392e3fcbc717
location: data/products/*.json、src/fetcher.ts:38-41
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: medium
reason: AD-14 的字面要求是「`data/` 下的每一份檔案各自擁有獨立的 `schemaVersion` 序列」。 本 story 的 AC 只點名 `days.json` 與 `index.json`，產品檔連版號欄位都尚未存在， 為其引入版號屬新的結構變更，須自成一個 story。
status: open
decision: 2026-08-22 留待 Story 1.10 一併評估

### DW-23: `index.html` 的 `boot()` 取 `data/index.json` 時未檢查 `res.ok` 就 `res.json()`， 404/500 會以 JSON 解析錯誤的面貌出現。
origin: spec-deferred a17edf54c60d
location: index.html:1419-1423
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: 同檔的 `loadCalendar()` 有 `if (!res.ok) throw new Error('HTTP ' + res.status)`，`boot()` 沒有。 此為本 story 之前既有的不對稱（本次僅在該行之後插入版號守衛），錯誤仍會落入既有 catch 顯示 錯誤框，故非新缺陷，但錯誤訊息會誤導排查方向。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-index-json-consumer-guards
resolution-undo: f593b0423cb62355b6fe08e61270945f67f23701b1155c84ab16e36cb45aac68 2026-08-22 7374617475733a206f70656e

### DW-24: 沒有任何測試釘住 CI workflow 的閘門步驟本身；把 `ci.yml` 裡的 `- run: npm run schema:check` （或 i18n 閘門）整行刪掉，測試套件仍然全綠。
origin: spec-deferred 4eadf5a0aa26
location: .github/workflows/ci.yml:28-37
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: 本 story 引用 AD-22「不被執行的規則就不是規則」把閘門接上 `ci.yml`，但 `src/` 底下沒有任何 測試讀 `.github/workflows/`，三道閘門（tsc、i18n:check、schema:check）都一樣沒有保護。 這是全 repo 既有的缺口，不是本 story 造成的；要補應該一次涵蓋三道步驟，自成一個 story。
status: open
decision: 2026-08-23 新增 ci.yml 三道閘門的存在性 pin 測試 — 比照 limits.test.ts 對 fetch.yml 的既有正規表示式手法，新增測試涵蓋 ci.yml 的 tsc、npm run i18n:check、npm run schema:check 三道步驟存在，任一被整行刪除即測試失敗。

### DW-25: `src/i18n-check.ts` 讀 `data/index.json` 後直接 cast 成 `Index`，是本 story 之外 第三個未驗版的 `index.json` 消費者，既有 deferred 項目（抓取端 `readIndex()`、 `products/*.json`）都沒有涵蓋它。
origin: spec-deferred d14807030099
location: src/i18n-check.ts:59
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: `src/i18n-check.ts` 以 `JSON.parse(fs.readFileSync(...'index.json')) as Index` 讀檔後 直接走訪 `index.products`，全程不呼叫 `assertIndexSchemaVersion()`。它本身是一道 CI 閘門， 卻會對版號不符的 `index.json` 回報「翻譯缺漏」而非「版號不符」，把診斷指向錯誤方向。 目前無實害：`INDEX_SCHEMA_VERSION` 本 story 未變動，且 CI 中 `npm test` 會先於 `i18n:check` 失敗；只有單獨執行 `npm run i18n:check` 的開發者會遇到誤導訊息。 此檔為既有程式碼，本 story 未觸及，且 `src/` 下沒有任何 `i18n-check` 的測試檔， 補守衛應與該檔的測試一併處理。
status: done 2026-08-22
resolution: resolved by sweep bundle dw-index-json-consumer-guards
resolution-undo: f593b0423cb62355b6fe08e61270945f67f23701b1155c84ab16e36cb45aac68 2026-08-22 7374617475733a206f70656e

### DW-26: Follow-up review still recommended for 1-6-快照-schema-版本控制 after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-1-6-快照-schema-版本控制.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260822-132139-136d; this entry preserves the lingering recommendation for a deliberate later review.
status: done 2026-08-22
resolution: closed by human decision: 該 review 的具體發現已以 DW-18～DW-25 與 DW-27～DW-29 進入帳本，且本次 sweep 已逐筆對照現行程式碼重新驗證；再跑一次只會重新推導同一批項目。
decision: 2026-08-22 關閉，已由具體項目承接 — 該 review 的具體發現已以 DW-18～DW-25 與 DW-27～DW-29 進入帳本，且本次 sweep 已逐筆對照現行程式碼重新驗證；再跑一次只會重新推導同一批項目。

### DW-27: `src/fetcher.ts` 的 `readIndex()` 讀回上一輪 `index.json` 供合併（取得已知 `products`、`lastSeenAt`）時，從未呼叫 `assertIndexSchemaVersion()`，版本守衛未涵蓋抓取端自己讀回舊檔這條路徑。

origin: migrated from legacy ledger (flat append from spec-1-6-快照-schema-版本控制.md), 2026-08-22
location: src/fetcher.ts:24-31 (readIndex)
source_spec: `spec-1-6-快照-schema-版本控制.md`
reason: 本 story 建立的版本守衛只用在消費端（`index.html`）與 CI 閘門。目前無實害——`readIndex()` 只讀 `raw.products` 陣列並已有 `Array.isArray` 結構檢查，`INDEX_SCHEMA_VERSION` 本 story 未變動（維持 5），故版號不符不會腐化合併結果；但此為既有行為（1.6 之前即如此），非本 story 造成，AD-14 的精神（任何讀取此檔的消費者都應驗版）嚴格上也涵蓋這條路徑，值得未來 `index.json` 形狀真的改版時一併補上。
status: open

### DW-28: 逐票種快照檔（`data/products/<code>.json`，`ProductResult` 型別）完全沒有 `schemaVersion` 欄位，不在本 story 新增的任何守衛（`schema.ts`／`schema-check.ts`／`index.html`）覆蓋範圍內。

origin: migrated from legacy ledger (flat append from spec-1-6-快照-schema-版本控制.md), 2026-08-22
location: data/products/*.json、src/schema.ts、src/schema-check.ts
source_spec: `spec-1-6-快照-schema-版本控制.md`
reason: 本 story 的 Boundaries 明文排除變更 `products/*.json` 的結構，故不在範圍內；但 `buildDays()`／`cellStatus()` 直接讀這些檔案，AD-14 描述的「抓取端版本回滾造成無聲錯誤斷言」對這批檔案同樣成立，只是尚未發生，值得日後與 Story 1.10（靜默失敗偵測）一併評估是否也需要版本欄位。
status: open

### DW-29: 新增的 `.github/workflows/ci.yml` `schema:check` 步驟，不會在 `fetch.yml` 排程回合自己寫入不符版號快照的當下被觸發——預設 `GITHUB_TOKEN` 推送的提交不會觸發其他 workflow。

origin: migrated from legacy ledger (flat append from spec-1-6-快照-schema-版本控制.md), 2026-08-22
location: .github/workflows/ci.yml:41、.github/workflows/fetch.yml:64-68
source_spec: `spec-1-6-快照-schema-版本控制.md`
reason: GitHub Actions 對預設 `GITHUB_TOKEN` 推送的提交不會觸發其他 workflow（反遞迴保護），而 `fetch.yml` 的 commit 步驟正是用預設 token 直接 push 到 `main`，故 `ci.yml` 的 `on: push` 不會為那些提交執行。`index.html` 端的 `assertCalendarSchema`／`assertIndexSchema` 仍會在使用者瀏覽器端擋下錯誤版本，故本 story 的 AC 仍然成立；但 CI 閘門「建置紅燈而非無聲錯誤」的敘事對排程回合這個主要情境實際上不生效，要等到下一次人工 push 或 PR 觸發 CI 才會被抓到。修正需要調整 `fetch.yml` 的推送機制（例如改用具備推送觸發權限的 token 或改走 PR），屬既有排程／推送架構的變更。
status: open
decision: 2026-08-22 併入 Story 1.11 的 PAT 工作

### DW-30: NFR7 目前沒有任何測試觀察「真正送出去的請求」帶了什麼標頭；所有斷言都止於原始碼文字與匯出常數。
origin: spec-deferred ddf68c779ae1
location: src/limiter.ts:114
source_spec: `spec-dw-6-7-header-anonymization-hardening.md`
severity: medium
reason: src/limiter.ts:114 的 `await fetch(url, init)` 是四個呼叫點與網路之間的唯一一跳。 把它改成 `await fetch(url)`，或改成合併一個自訂 User-Agent 的版本，四個 NFR7 測試全部照樣通過： HEADERS 仍凍結、仍不含站名、仍無 User-Agent 鍵，usj.ts 的原始碼文字也仍顯示四個 `headers: HEADERS`。 repo 內既有 `t.mock.method(globalThis, 'fetch', ...)` 的機制（src/limiter.test.ts:50、 src/sources/usj-fetchproduct-blocking.test.ts:100），但沒有任何測試讀取傳給 fetch 的第二個參數。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-header-observability-hardening
resolution-undo: 69b582856c86820c5190afbaee1f514e7087f9ab0f25d377e77f8e89ba7010f7 2026-08-23 7374617475733a206f70656e

### DW-31: 接線檢查只掃 src/sources/usj.ts 一個檔案，新增的其他來源檔若呼叫 limitedFetch 而未帶 HEADERS 不會被發現。
origin: spec-deferred c2cce39eed83
location: src/sources/
source_spec: `spec-dw-6-7-header-anonymization-hardening.md`
severity: medium
reason: limitedFetch 由 src/limiter.ts 匯出，目前生產程式碼只有 src/sources/usj.ts 呼叫它， 但 NFR7「請求標頭不得揭露本站網域或站名」是 repo 層級要求。掃描範圍改為 src/**/*.ts（排除 *.test.ts） 才能讓保證涵蓋面與需求一致。本次刻意不擴大，因 intent 指名的就是那四個呼叫點。
status: done 2026-08-23
resolution: closed by human decision: 維持前一輪的刻意範圍決定；目前只有 usj.ts 呼叫 limitedFetch，無立即風險，待新增來源檔時再處理。
decision: 2026-08-23 維持現有範圍，關閉 — 維持前一輪的刻意範圍決定；目前只有 usj.ts 呼叫 limitedFetch，無立即風險，待新增來源檔時再處理。

### DW-32: 沒有測試禁止裸 fetch( ；架構決策要求「禁止裸 fetch(，由測試強制」，但該強制目前不存在。
origin: spec-deferred be971369a148
location: src/
source_spec: `spec-dw-6-7-header-anonymization-hardening.md`
severity: medium
reason: epic-1-context.md 的技術決策明載「所有對外請求須經單一閘門 limitedFetch，禁止裸 fetch(，由測試強制」。 grep 全 repo 後，除 src/limiter.ts:114 本身外沒有生產端裸 fetch，但也沒有任何測試會在有人新增時失敗。 在 src/sources/usj.ts 加一個裸 fetch(url) 既不帶 HEADERS 也繞過速率閘門，且對本次新增的計數檢查完全隱形。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-header-observability-hardening
resolution-undo: 69b582856c86820c5190afbaee1f514e7087f9ab0f25d377e77f8e89ba7010f7 2026-08-23 7374617475733a206f70656e

### DW-33: 沒有任何測試釘住 HEADERS 應有的鍵值集合；把 HEADERS 換成 Object.freeze({}) 或刪掉 x-anonymous-consents／Accept-Language，四個測試全部照樣通過。
origin: spec-deferred 41a3a3f899c7
location: src/sources/usj.test.ts
source_spec: `spec-dw-6-7-header-anonymization-hardening.md`
severity: medium
reason: forbidden-name 測試只斷言「不含站名」，User-Agent 測試只斷言「無該鍵」，凍結測試只斷言 「凍結且寫入會拋錯」，接線測試只讀原始碼文字。三者都是否定式或結構式斷言，沒有一個說出 HEADERS *應該* 有哪四個鍵、值是什麼。刪除任一標頭（例如 Accept-Language: ja-JP，日文頁面 的語系依據）對測試完全隱形。此為 Story 1.3 起既有的缺口，本次凍結與接線強化並未加劇它， 但也未涵蓋；補法是加一條 deepEqual 的預期鍵值集合斷言。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-header-observability-hardening
resolution-undo: 69b582856c86820c5190afbaee1f514e7087f9ab0f25d377e77f8e89ba7010f7 2026-08-23 7374617475733a206f70656e

### DW-34: Follow-up review still recommended for dw-header-anonymization-hardening after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-dw-6-7-header-anonymization-hardening.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260822-193604-52a6; this entry preserves the lingering recommendation for a deliberate later review.
status: done 2026-08-23
resolution: closed by human decision: 該 review 的具體發現已以 DW-30～DW-33 進入帳本並列入本次 sweep 的 header-observability-hardening bundle；再跑一次獨立 follow-up 只會重新推導同一批項目，與 DW-14／DW-26 的既有先例一致。
decision: 2026-08-23 Close now, superseded by DW-30–DW-33 — 該 review 的具體發現已以 DW-30～DW-33 進入帳本並列入本次 sweep 的 header-observability-hardening bundle；再跑一次獨立 follow-up 只會重新推導同一批項目，與 DW-14／DW-26 的既有先例一致。

### DW-35: `src/sources/usj.ts:313` 的另一處 `mapLimit`（時段庫存批次）與 `listProducts` 有完全相同的併發缺口， 本次刻意未加封鎖旗標。
origin: spec-deferred f147c4bf3ccd
location: src/sources/usj.ts:313-337
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: medium
reason: 該處於 `src/sources/usj.ts:333` 同樣以 `if (err instanceof BlockedError) throw err;` 傳播， 但沒有共享旗標，其餘 worker 在封鎖浮現後仍會繼續對已知封鎖的來源送出批次請求。 本次 intent 指名的是 `listProducts`，故不在範圍；修法與本次完全相同（旗標 + callback 首行檢查）。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-slot-stock-block-flag-parity
resolution-undo: b7a548d8677a9afcab4a582565d2514a99352b5efdb190c36da52c6713faf303 2026-08-23 7374617475733a206f70656e

### DW-36: `usj.ts` 四個 `!res.ok` throw 點各自內嵌 `.slice(0, 200)` 魔術數字，未改用新匯出的 `BLOCKED_BODY_SNIPPET_MAX`；其中 calendar 那一處更完全沒有上限。
origin: spec-deferred 0dab1c56c2ff
location: src/sources/usj.ts:174
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: medium
reason: `src/sources/usj.ts:261`、`:359`、`:432` 皆為 `(await res.text()).slice(0, 200)` 字面值； `src/sources/usj.ts:174` 則是 `Calendar API returned ${res.status}: ${await res.text()}`， 完全沒有截斷，可能把整頁 HTML 灌進公開的 Actions log。本次新增了具名常數與 `snippet()` 正規化，但未回頭套用到這四處，repo 目前存在兩套並行慣例。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-usj-response-snippet-consistency
resolution-undo: ba12f270878d8a5f8e10c97dbc1005eb9acee6ef764efe41218d7d1be5934469 2026-08-23 7374617475733a206f70656e

### DW-37: 封鎖偵測後，已通過旗標檢查但仍卡在速率閘門／退避 sleep 的取樣，依舊會跑完自己完整的 1s/2s/4s 重試序列，沒有 AbortSignal 可取消。
origin: spec-deferred 6ce522a6891e
location: src/sources/usj.ts:463-470
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: `listProducts` 的旗標檢查在 `mapLimit` callback 首行，實際請求要再經 `fetchCatalogPage` → `limitedFetch` → `acquire()` → 速率閘門 `sleep()` 才送出； 最多 `CONCURRENCY - 1` 個取樣會在偵測後仍各自對已封鎖來源送出首次請求與三次重試。 intent 明示「在途請求無法取消，不在範圍內」，但把閘門前排隊的請求也歸入「在途」， 比 intent 字面的排除範圍更寬，值得記錄。
status: done 2026-08-23
resolution: closed by human decision: No change; this is the same boundary the original story deliberately drew, and the bounded extra requests (up to CONCURRENCY-1) this allows are a known, accepted cost.
decision: 2026-08-23 Keep current best-effort scope — No change; this is the same boundary the original story deliberately drew, and the bounded extra requests (up to CONCURRENCY-1) this allows are a known, accepted cost.

### DW-38: `--product=` 找不到對應產品時的 `process.exit(2)` 仍會跳過任何彙總，而該路徑已經跑完整輪 catalog 取樣。
origin: spec-deferred da0e3be97fae
location: src/fetcher.ts:300-304
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: `src/fetcher.ts` 的 `No product matched ...` 分支在 `listProducts` 已耗用真實請求與時間之後 直接 exit 2，沒有 `logAbortSummary`。本次 DW-10 的授權範圍是「因持續封鎖中止」， 故未涵蓋；但這是唯一剩下的無彙總早退出口。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-fetcher-abort-summary-gaps
resolution-undo: 1e0d62fefb9767ec1695789596fe639daf07e96353be5a6755f1d001451b189a 2026-08-23 7374617475733a206f70656e

### DW-39: `main()` 於檔尾以 `main();` 呼叫且未接 `.catch()`，非封鎖類的意外例外仍會以 unhandledRejection 收場，且同樣沒有彙總。
origin: spec-deferred 48bfb04bc401
location: src/fetcher.ts:409-411
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: medium
reason: `if (require.main === module) { main(); }`；catalog 階段之後任何 throw （`fs.writeFileSync` EACCES、`buildDays` 例外等）都不會經過本次新增的 `logAbortSummary`。 屬既有結構問題，非本次變更造成。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-fetcher-abort-summary-gaps
resolution-undo: 1e0d62fefb9767ec1695789596fe639daf07e96353be5a6755f1d001451b189a 2026-08-23 7374617475733a206f70656e

### DW-40: 本次新增的封鎖旗標在目前的生產接線下作用窗口極窄，其效益主要是防禦性的。
origin: spec-deferred 982babb109ba
location: src/sources/usj.ts:463
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: `listProducts` 的唯一生產呼叫點 `src/fetcher.ts` 的 catalog catch 會在 rejection 的 microtask 續行中同步 `process.exit(1)`，其餘 worker 多半停在 macrotask（網路 I/O 或 `sleep()`）上，來不及重新檢查旗標。旗標真正發揮作用的前提是未來有不會立即 exit 的呼叫者。 新測試直接呼叫 `listProducts` 並在 rejection 後續 tick，才觀察得到差異。
status: done 2026-08-23
resolution: closed by human decision: 接受現況為文件化的防禦性限制；旗標本身是刻意為未來不會立即 exit 的呼叫者準備，不投入 AbortController 重構。
decision: 2026-08-23 接受現況為文件化限制，關閉 — 接受現況為文件化的防禦性限制；旗標本身是刻意為未來不會立即 exit 的呼叫者準備，不投入 AbortController 重構。

### DW-41: I/O 矩陣「超長內文」列以等式描述長度，但當截斷點恰落在代理對（surrogate pair）中間時， `body.length` 會是 199 而非 200。
origin: spec-deferred a34d3d6020a2
location: src/limiter.ts
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: `clipLoneSurrogate` 會丟掉被切一半的高位代理，以免輸出孤立代理字元。 矩陣該列陳述的輸入是 `'x'.repeat(500)`，該輸入下等式成立；此為措辭與實作在極端輸入上的 落差，非行為缺陷。
status: open
decision: 2026-08-23 Revise matrix wording for the edge case — Update the 超長內文 row in the frozen <intent-contract> I/O matrix of spec-dw-8-9-10-block-abort-path-hardening.md to state body.length is <= 200, and may be 199 when the truncation point lands mid-surrogate-pair; no code change needed since clipLoneSurrogate's behavior is already correct and intentional.

### DW-42: 截斷沒有任何標記，恰好 200 字的內文與被截斷的內文在 log 上無從分辨。
origin: spec-deferred 6236d53e937b
location: src/limiter.ts
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: 本輪一度加上 `…` 標記，但 `<intent-contract>` 的 I/O 矩陣「超長內文」列明訂 `body.length` 等於上限常數（200），標記使長度變成 201，與凍結契約抵觸，故回滾。 要落地需先修訂 intent-contract 的該列措辭。
status: done 2026-08-23
resolution: closed by human decision: No change; already tried and reverted once specifically to honor the frozen contract, and an unmarked 200-char cap is an acceptable log-readability tradeoff.
decision: 2026-08-23 Keep unmarked, close — No change; already tried and reverted once specifically to honor the frozen contract, and an unmarked 200-char cap is an acceptable log-readability tradeoff.

### DW-43: 欄位名 `body` 實際存放的是正規化並截斷後的片段，名稱與內容不符，需靠 JSDoc 更正。
origin: spec-deferred 5d272c029812
location: src/limiter.ts
source_spec: `spec-dw-8-9-10-block-abort-path-hardening.md`
severity: low
reason: 本輪一度更名為 `bodySnippet`，但 I/O 矩陣四列皆以 `body` 指稱該欄位，屬凍結契約，故回滾。 此欄位為本次新增，趁尚無其他消費者時更名成本最低，但同樣需先修訂 intent-contract。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-blockederror-body-rename
resolution-undo: ff469ba8ab69a7c58296f58a95183e4d9d0ea2f8e1cd623c92149dd17e01a62a 2026-08-23 7374617475733a206f70656e
decision: 2026-08-23 Rename now, update contract — Rename BlockedError.body to bodySnippet, update its JSDoc, and revise the I/O matrix in spec-dw-8-9-10-block-abort-path-hardening.md to match, while no other code consumes the field yet.

### DW-44: `readIndex()`／`main()` 讀 `data/index.json` 失敗（檔案不存在或非合法 JSON）時， 拋出的是原始 `ENOENT`／`SyntaxError`，不像 `schema-check.ts` 的 `readSchemaVersion()` 那樣包成具名檔案的友善訊息。
origin: spec-deferred 3a913104726f
location: src/i18n-check.ts（readIndex()）
source_spec: `spec-dw-23-25-index-json-consumer-guards.md`
severity: low
reason: 本次變更前的 `main()` 就已是 `JSON.parse(fs.readFileSync(...)) as Index`， 對讀檔／解析失敗完全沒有 try/catch；`readIndex()` 原樣沿用這段讀檔邏輯，只在其後插入 版號檢查，讀檔／解析失敗的行為與本次變更前完全一致，非本次引入。
status: open

### DW-45: `main()` 走訪 `index.products` 時，若某個 product code 在 `data/products/` 下沒有對應 檔案（版號正確但索引與商品檔不一致），仍會以未包裝的 `ENOENT` 中止，訊息不會指出是 哪個 product code 造成的。
origin: spec-deferred e4ccf2a400ea
location: src/i18n-check.ts（main()，products.map）
source_spec: `spec-dw-23-25-index-json-consumer-guards.md`
severity: low
reason: `index.products.map(p => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, ...))))` 這段本次未觸碰，`readIndex()` 的版號守衛只擋下版號不符的情境，對「版號正確但索引與 商品檔不同步」這個相鄰失效模式沒有任何新增防護，此為既有行為。
status: open

### DW-46: `loadCalendar()`（`index.html:1061`）既有的 `!res.ok` 守衛，與本次新增的 `boot()` 守衛 同樣完全沒有回歸測試——`src/schema.test.ts` 的 `runPage()` fetch stub 目前寫死 `ok: true`，本輪已就 `boot()` 的新守衛排入 patch（見上）補測，但 `loadCalendar()` 這處既
origin: spec-deferred e20e815b5b05
location: index.html:1061（loadCalendar()）
source_spec: `spec-dw-23-25-index-json-consumer-guards.md`
severity: low
reason: grep `src/*.test.ts` 未找到任何 `ok: false`／`status: 404`／`status: 500` 的 fetch stub， `runPage()`（`src/schema.test.ts:487-538`）的 `fetch` 固定回傳 `ok: true`， `loadCalendar()` 相關測試（`src/schema.test.ts:552-564`）僅涵蓋版號守衛，不涵蓋 HTTP 狀態守衛。此缺口在本次變更之前就存在，範圍與本次 patch 的 `boot()` 守衛測試不同。
status: open

### DW-47: Cross-Story Dependencies 段落未記錄 Story 1.2（禁止抓取回合重疊）與 Story 1.4（429/5xx 退避與封鎖告警）之間的潛在互動：持續封鎖觸發 1.4 的「停止該回合並告警」時，1.2 排隊中的下一回合應如何處理未被說明。
origin: spec-deferred 6ef86f4999f8
location: _bmad-output/implementation-artifacts/epic-1-context.md:57-64
source_spec: `spec-dw-4-epic-context-cross-story-dep.md`
severity: low
reason: Requirements & Constraints 同時列有「同一時間只允許一個抓取回合，未跑完的回合須排隊而非並行」（Story 1.2）與 「遇 429/5xx 須遞增延遲退避；持續封鎖須停止該回合並告警，不得改以其他方式續抓」（Story 1.4）， 兩者交界（封鎖中止進行中回合時，佇列中回合的行為）在 Cross-Story Dependencies 段落無對應說明， 屬本次 review（blind-hunter 層）於既有文件中發現、非本次變更引入的既存缺口。
status: open

### DW-48: `src/limits.test.ts` 解析 `fetch.yml` 全靠手刻正規表示式，插入 `id:` 等欄位就可能讓 `flagFailedProductsCondition()` 之類的 helper 抓不到值。
origin: spec-deferred aa8aedecbe61
location: src/limits.test.ts:70-116
source_spec: `spec-dw-13-flag-failed-products-abort-skip.md`
severity: low
reason: `scheduleIntervalMin`／`jobTimeoutMin`／`concurrencyBlock`（`src/limits.test.ts:70-100`） 與本次新增的 `flagFailedProductsCondition()` 都是同一手法：直接對 YAML 原始文字跑正規 表示式，而非用真正的 YAML parser。這是本檔既有慣例，不是本次改動引入；本次只是比照 既有寫法新增一個同型 helper。獨立審查（blind-hunter、edge-case-hunter）皆指出，若日後 在 `- name:` 與 `if:` 之間插入 `id:`／`uses:` 等欄位，這類正規表示式會抓不到值， `assert.ok(step, …)` 會丟出「找不到步驟」的誤導性錯誤，而非指向真正的條件內容。
status: open

### DW-49: `if: success()` 判斷的是「job 到此為止沒有任何步驟失敗」，不是專門針對 `npm run fetch` 這一步；若日後在兩者之間插入會獨立失敗的新步驟，會連帶讓本應正常的 回合也被跳過標記。
origin: spec-deferred a8795972081e
location: .github/workflows/fetch.yml:45-56
source_spec: `spec-dw-13-flag-failed-products-abort-skip.md`
severity: low
reason: intent-alignment 審查指出：目前 `npm run fetch` 與「Flag failed products」中間沒有 其他步驟，且皆無 `continue-on-error`，所以 `success()` 現況等同於「fetch 這一步成功」； 但這個等價關係是隱含的，沒有用 `steps.<id>.outcome` 明確綁定到 `npm run fetch` 這個 步驟本身。spec 的 Always 條款寫的是「緊鄰的前一步驟」，現況成立，但寫法本身不會在 未來插入新步驟時提醒維護者重新檢查這個假設。
status: open
decision: 2026-08-23 改為明確綁定 steps.fetch.outcome — 為 npm run fetch 步驟加上 id: fetch，並把 Flag failed products 的 if: success() 改成 if: steps.fetch.outcome == 'success'，明確綁定觸發語意，避免未來插入新步驟時靜默改變行為。

### DW-50: src/sources/usj.ts 的四個 !res.ok throw 點都對 await res.text() 沒有 catch 保護， body 讀取本身失敗時會讓原始 stream 例外取代原本意圖的 "X API returned {status}" 訊息。
origin: spec-deferred d8c52e09ce52
location: src/sources/usj.ts:174,262,374,448
source_spec: `spec-dw-36-response-snippet-consistency.md`
severity: low
reason: 四處（fetchInventory/fetchTimeSlots/fetchProductInfo/fetchCatalogPage）在本次變更前 就已經是 `await res.text()` 沒有 `.catch()`；DW-36 只重構了截斷/正規化邏輯，沒有改變 這個讀取行為，屬於既有問題而非本次變更造成。limiter.ts 內 BlockedError 對應的讀取 路徑已經有 `.catch(() => undefined)` 保護（見 limitedFetch 的 body 讀取），可作為修法參考。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-usj-error-message-hardening
resolution-undo: 3f13beab102a47ef9a203e72a7f59827d39f812ca7bc7b8e45d5499684fa61cb 2026-08-23 7374617475733a206f70656e

### DW-51: 四個 API 錯誤訊息都沒有帶入呼叫當下的識別資訊（productCode/date/query）， 光看 log 行看不出是哪一個請求失敗。
origin: spec-deferred 0d32661b291d
location: src/sources/usj.ts:174,262,374,448
source_spec: `spec-dw-36-response-snippet-consistency.md`
severity: low
reason: 這是既有行為：變更前的三個 `.slice(0, 200)` 版本與 Calendar 的無截斷版本同樣沒有 帶入 productCode/date，DW-36 的範圍只在統一截斷/正規化慣例，未涉及訊息應包含哪些 欄位，因此不屬於本次變更造成的問題。
status: done 2026-08-23
resolution: resolved by sweep bundle dw-dw-usj-error-message-hardening
resolution-undo: 3f13beab102a47ef9a203e72a7f59827d39f812ca7bc7b8e45d5499684fa61cb 2026-08-23 7374617475733a206f70656e

### DW-52: 新增的 `Smoke-check fetch entry point` 步驟本身（`[ -s fetch-output.log ]` 這個判準）沒有任何自動化測試釘住，未來若有人把 `-s` 誤改成 `-e`/`-f`，會靜默弱化這個檢查而不被任何 `npm test` 抓到。
origin: spec-deferred 6555d043b2b0
location: .github/workflows/fetch.yml (Smoke-check fetch entry point step); src/limits.test.ts
source_spec: `spec-dw-12-fetch-entrypoint-smoke-check-2.md`
severity: low
reason: repo 內已有同類先例：`src/limits.test.ts` 用 `flagFailedProductsCondition()` 這類 regex-parse helper 釘住 `fetch.yml` 鄰近步驟（`Flag failed products`）的 `if:` 條件字串，並在 `ci.yml` 的 `npm test`（merge-blocking gate）下每次 push/PR 執行；但這次新增的 `Smoke-check` 步驟的腳本內容（尤其是 `-s` 而非 `-e`/`-f`）沒有對應的 pin 測試。本次 spec 的 Never 條款明確排除新增測試檔案、且 Design Notes 已論證選 CI 冒煙步驟正是為了避免另外設計測試方式，因此在本次範圍內不處理；若要處理，屬於修改既有 `src/limits.test.ts`（非新增檔案）的後續加強項。
status: open

### DW-53: DW-30 的新測試只能透過 fetchProduct 觀察到三個 limitedFetch 呼叫點的真實 init.headers，fetchCatalogPage（僅 listProducts 呼叫）仍無執行期標頭觀察。
origin: spec-deferred 1340623e299d
location: src/sources/usj.ts (fetchCatalogPage)
source_spec: `spec-dw-30-32-33-header-observability-hardening.md`
severity: low
reason: usj-fetchproduct-blocking.test.ts 新增的 headers 參照相等測試驅動 usjSource.fetchProduct(...)，只會走過 fetchProductInfo（兩次）、 fetchInventory（日曆＋庫存批次）、fetchTimeSlots，不會走過 fetchCatalogPage —— 那是 usjSource.listProducts(...) 才會呼叫的路徑。 目前唯一涵蓋 fetchCatalogPage 這個呼叫點的是 usj.test.ts 的原始碼文字 接線檢查（limitedFetchCallSites／wiringProblem），不是執行期觀察。 此為既有缺口的縮小（本輪之前四個呼叫點皆無執行期觀察），非本輪引入。
status: open

### DW-54: `main().catch(handleFatalMainError)` at the file-tail entry point is never actually executed by any test.
origin: spec-deferred 3fc421dd771c
location: src/fetcher.ts:454
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: medium
reason: `require.main === module` is false when `fetcher.ts` is imported for testing, so no test in `src/fetcher.test.ts` reaches that line; the new `handleFatalMainError` test calls the handler directly with a synthetic error instead. A regression that dropped or misspelled the `.catch()` (e.g. `.then()` instead) would ship undetected. The repo already has a related, separately-tracked entrypoint smoke-check effort (`_bmad-output/implementation-artifacts/spec-dw-12-fetch-entrypoint-smoke-check.md`, status in-review) that is the more natural home for a spawnSync-based integration test closing this gap, rather than adding ad hoc test hooks to production code here.
status: open

### DW-55: `startedAt` was converted from a `main()`-local `const` to a module-level `let`, so a second concurrent `main()` invocation in the same process would race/corrupt the first invocation's timer.
origin: spec-deferred 56d29dffefd3
location: src/fetcher.ts:281,307
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: This CLI is only ever invoked once per process via the `require.main === module` guard, so the race is not currently reachable in production; flagged for awareness if `main()` is ever made re-entrant.
status: open

### DW-56: `handleFatalMainError` 非 `Error` 分支的 `JSON.stringify` 例外 fallback 若遇到含循環參照的物件，`String(err)` 仍會印出無意義的 `[object Object]`。
origin: spec-deferred fff709b06944
location: src/fetcher.ts:307-314
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: `catch { return String(err); }` 對一般物件與 `JSON.stringify` 失敗時的結果相同，並未真正解決此函式本身要避免的 `[object Object]` 問題；只是把觸發條件從「任意物件」縮小到「JSON.stringify 會丟例外的物件（如循環參照）」。 需要循環參照安全的序列化（例如攔截已見過的參照）才能徹底解決，非本次早退彙總修補的範圍。
status: open

### DW-57: `handleFatalMainError` 對 `Error` 分支只印出 `err.message`，捨棄 `err.stack`，診斷未知例外時少了呼叫堆疊。
origin: spec-deferred 466cd80e2e4d
location: src/fetcher.ts:305-306
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: 此函式本身定位是「非預期的 bug」的兜底處理（非既有的封鎖判定），呼叫堆疊正是排查此類意外最有用的資訊；目前只印 `err.message` 會讓 CI 記錄少一層可追溯性。是否要改印 `err.stack` 屬於彙總訊息格式的既有設計決定範圍，非本次 兩處早退彙總插入點的範圍。
status: open

### DW-58: DW-38 新測試只涵蓋單一不存在的 `--product=` 代碼，未涵蓋多個 `--product=` 旗標部分命中、或空值 `--product=` 時 `wanted.filter(Boolean)` 會靜默退回抓取整個 catalog 的既有行為。
origin: spec-deferred 4c11165a95da
location: src/fetcher.ts:322-326
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: 這些是 `--product=` 既有解析邏輯（非本次新增）的既有行為與邊界，本次 diff 只在既有的「未命中」分支插入 `logAbortSummary`，未改動解析邏輯本身，故非本次改動造成。
status: open

### DW-59: DW-38 新測試只斷言 abort 訊息含 `No product matched`，未驗證訊息中列出可用代碼的 `Known: ...` 段落內容。
origin: spec-deferred 7b8144332ada
location: src/fetcher.ts:349
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: `Known: ...` 段落是既有訊息的一部分（非本次新增），本次只在其 `process.exit(2)` 前插入 `logAbortSummary`；若該段落遭意外刪改，既有測試不會失敗，但此屬既有訊息內容的既有驗證缺口。
status: open

### DW-60: `handleFatalMainError` 遇到 `message` 為空字串的 `Error`（如 `new Error()`）時，會印出無詳細內容的 `[fetch] fatal: `。
origin: spec-deferred b0fcda90fdb2
location: src/fetcher.ts:305-306
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: 此為邊界情境（呼叫端建構 `Error` 時未帶訊息），機率低；彙總行仍會照常接續印出（請求數與耗時仍可供診斷）， 故非阻斷性缺口，本次不在兩處早退彙總插入的範圍內處理。
status: open

### DW-61: `--product=` 未命中分支（DW-38 插入點）呼叫 `logAbortSummary` 未如 `handleFatalMainError` 般以 `try`/`finally` 保護；若 `logAbortSummary` 本身丟出例外，`process.exit(2)` 將不會執行。
origin: spec-deferred f7fe7021299c
location: src/fetcher.ts:351-353
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: 例外會往上傳遞並最終由 `main().catch(handleFatalMainError)` 接住、以 exit code 1 收尾，與 spec 「Never: 不變更 exit code 語意（2 維持 2）」的邊界產生分歧。但現有兩處封鎖中止路徑（`BlockedError`）本就未做 此保護，本次新增的 `--product=` 分支延續同一既有慣例（spec 的 Approach 明確要求「比照既有封鎖中止路徑」）； `requestCount()` 目前只讀取內部計數器變數，實務上幾乎不會拋出例外，即使觸發也仍會以 exit(1) 收尾而非靜默掛起， 風險極低，非本次早退彙總插入範圍內處理。
status: open

### DW-62: `handleFatalMainError` 對 `err` 為 `null` 或 `undefined` 時的處理未被測試涵蓋；`JSON.stringify(undefined)` 回傳非字串的 `undefined`，經樣板字串隱式轉型後會印出「`[fetch] fatal: undefined`」。
origin: spec-deferred fe1efc8168bf
location: src/fetcher.ts:307-314
source_spec: `spec-dw-38-39-fetcher-abort-summary-gaps.md`
severity: low
reason: 目前測試只涵蓋 `Error` 與一般物件（`{ code, path }`）兩種情境，未涵蓋 `Promise.reject()` 或 `throw null`/`throw undefined` 這類邊界輸入；雖不會如循環參照物件般印出 `[object Object]`，但「undefined」 字串本身診斷價值有限。此輸入形態罕見，非本次兩處早退彙總插入點的範圍。
status: open

### DW-63: Follow-up review still recommended for dw-dw-usj-error-message-hardening after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `spec-dw-50-51-error-message-hardening.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260823-132556-242e; this entry preserves the lingering recommendation for a deliberate later review.
status: open

### DW-64: `readIndex()` 的檔案不存在／JSON 解析失敗路徑仍全數靜默回傳 `null`，與本 story 新加的版號不符 路徑（會 `console.error`）不對稱。
origin: spec-deferred 80e9c435b208
location: src/fetcher.ts:38-42（readIndex() 第一段 try/catch）
source_spec: `spec-dw-21-fetcher-readindex-version-guard.md`
severity: low
reason: 版號不符與讀取／解析失敗同屬 AD-14 所指「不驗證即接受異常快照」的範疇，但本 story 依 Boundaries 「Always」第 3 條明文要求後者維持現況靜默，僅補上版號檢查一條路徑的可見度。若未來要讓抓取端的 異常快照全面可觀測，需一併決定讀取／解析失敗要不要 log、log 什麼內容（例如是否要區分 ENOENT 與 JSON 語法錯誤），超出本 story 範圍。
status: open

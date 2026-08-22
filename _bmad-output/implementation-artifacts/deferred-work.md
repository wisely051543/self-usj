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

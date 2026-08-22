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

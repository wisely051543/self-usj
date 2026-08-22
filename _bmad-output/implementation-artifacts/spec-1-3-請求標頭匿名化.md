---
title: 'Story 1.3 - 請求標頭匿名化'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: 'deba4788ce0c66f83afe42e2f01a76142e68c4d8'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      HEADERS 的 forbidden-string 比對僅涵蓋 package.json 的 name 字串，未涵蓋未來若指定 repo
      名稱、hosting 網域，或 Referer/Origin 標頭等其他可能洩漏本站身分的形式。
    evidence: |-
      本 story 的 epic-1-context.md 明載 NFR3.2（站名/網域不得使用 USJ 商標）目前卡在待法遵書面意見，
      本輪不得由實作單方面決定；且本站目前尚未指定任何實際網域，無具體字串可比對。Design Notes 已確認
      Node fetch 不會自動附加 Referer/Origin，故現況不違反 AC，但比對範圍偏窄，值得在 Epic 2 指定網域後
      補強測試涵蓋範圍。
    location: >-
      src/sources/usj.test.ts
    severity: medium
  - summary: >-
      HEADERS 匯出後仍為可變動（未 Object.freeze／未加 Readonly 型別），四個 limitedFetch 呼叫點共用同一
      物件參照，理論上可被其中一處意外 mutate 而影響其他呼叫點。
    evidence: |-
      此為既有行為（匯出前已是同一可變物件、同檔案內四處共用），本 story 只是加上 export 使測試可直接匯入，
      並未新增或加劇此風險；epics.md 的 Story 1.3 AC 也未要求不可變性，屬額外強化而非本 story 範圍缺陷。
    location: >-
      src/sources/usj.ts:84
    severity: low
  - summary: >-
      新增測試僅靜態檢查 HEADERS 常數本身，未驗證四個 limitedFetch 呼叫點確實仍原樣傳入該常數（例如未來
      某呼叫點改為 spread/覆寫），註解宣稱「鎖住全部四個呼叫點」但無程式碼強制驗證這個接線事實。
    evidence: |-
      目前四個呼叫點皆為 `headers: HEADERS` 字面寫法（已於本次 Code Map 人工核對），本 story 的 diff 未
      改動任何呼叫點；要做到自動化驗證接線需要類似 limits.test.ts 對 yml 的正則解析手法，屬額外強化，
      非本 story 明確要求範圍。
    location: >-
      src/sources/usj.ts:147,240,337,410
    severity: low
---

<intent-contract>

## Intent

**Problem:** 對外抓取請求標頭目前雖未含站名或網域等識別字串，但沒有任何測試防止未來變更（例如新增自訂 `User-Agent` 或 `Referer`）意外洩漏本站身分，違反 NFR7。

**Approach:** 匯出 `src/sources/usj.ts` 既有的單一 `HEADERS` 常數（四個 `limitedFetch` 呼叫點的唯一來源），新增測試檔動態比對 `package.json` 名稱等識別字串，並斷言未新增自訂 `User-Agent`，將「不揭露本站身分」鎖為可回歸驗證的不變量。

## Boundaries & Constraints

**Always:** `HEADERS` 維持為 `src/sources/usj.ts` 內唯一定義、四個 `limitedFetch` 呼叫點共用的物件；新測試須以讀取 `package.json` 的 `name` 欄位等方式動態取得禁止字串，不得寫死猜測中的網域字串。

**Block If:** 無需人工決策——本 story 是既有標頭設定的稽核與回歸測試補強，範圍與作法在 epics.md AC 中已明確。

**Never:** 不得新增自訂 `User-Agent` 或任何中性 bot 識別字串（NFR7 明訂中性 bot 識別為可延後項 O5，本 story 不含）；不得新增聯絡信箱（屬 Story 1.9 範圍）；不得變更 `HEADERS` 既有必要欄位（`Accept`、`Content-Type`、`x-anonymous-consents`、`Accept-Language` 皆為來源 API 所需，非識別本站的欄位）；不得修改 `limiter.ts` 的請求邏輯本身。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 現行 `HEADERS` 序列化後與 `package.json` 的 `name` 比對 | 執行新測試 | 測試通過，因現行 4 個欄位均不含該字串 | 若未來混入識別字串，測試失敗並指出違規字串 |
| 檢查 `HEADERS` 是否存在 `User-Agent`／`user-agent` 鍵 | 執行新測試 | 測試通過，因現行未設定自訂 UA（Node 內建 fetch 預設送出通用 `user-agent: node`，不揭露身分） | 若未來新增自訂 UA，測試失敗並提示 O5 為延後項 |

</intent-contract>

## Code Map

- `src/sources/usj.ts:84-89` -- 唯一的 `HEADERS` 常數定義處；目前為 `Accept`、`Content-Type`、`x-anonymous-consents`、`Accept-Language` 四個來源 API 所需欄位，不含任何站名/網域字串。需加上 `export`，使測試可直接匯入而非以正則解析原始碼。
- `src/sources/usj.ts:145-149,240,337,410` -- 四個 `limitedFetch` 呼叫點皆傳入同一個 `HEADERS` 物件，無任何呼叫點另外附加標頭；唯讀佐證，本 story 不需改動這些呼叫點本身。
- `src/limiter.ts:83-112` -- `limitedFetch`（AD-3 唯一出口閘門）僅透傳呼叫端傳入的 `init`，本身不注入或覆寫任何標頭；唯讀佐證，不需改動。
- 已於本機以 Node 24 的內建 `fetch` 實測驗證：呼叫端未指定 `User-Agent` 時，底層 undici 送出的預設值為字面字串 `"node"`，且不會自動附加 `Referer`／`Origin`。`"node"` 為通用值，不揭露站名或網域，故現行程式碼已符合 AC，本 story 的變更重心在於把這個事實鎖成回歸測試。
- `package.json:2` -- `"name": "usj-availability"`，作為新測試動態取得「禁止字串」的來源，而非寫死猜測的網域。
- `src/limits.test.ts` -- 既有測試檔，範圍鎖定 AD-4 節流互鎖（見檔案開頭註解），本 story 的標頭斷言屬不同關注點，不併入此檔，改新增獨立測試檔。

## Tasks & Acceptance

**Execution:**
- `src/sources/usj.ts` -- 為既有 `const HEADERS = {...}` 加上 `export` -- 讓新測試檔可直接匯入單一事實來源，避免以正則解析原始碼造成的脆弱比對
- `src/sources/usj.test.ts`（新檔）-- 新增兩則測試：(1) 讀取 `package.json` 的 `name`，斷言 `JSON.stringify(HEADERS)` 不含該字串（大小寫不敏感）；(2) 斷言 `HEADERS` 物件不存在 `User-Agent`／`user-agent` 鍵 -- 將 NFR7「請求標頭不揭露本站身分」鎖為可回歸驗證的不變量，並在測試中以註解記錄 O5（中性 bot 識別＋聯絡信箱）為刻意延後、非本 story 缺陷

**Acceptance Criteria:**
- Given 現有抓取請求標頭設定, when 檢查並移除任何含本站網域、站名的識別字串, then 所有經 `limitedFetch` 送出的請求（`fetchInventory`、`fetchTimeSlots`、`fetchProductInfo`、`fetchCatalogPage` 四個呼叫點共用同一 `HEADERS`）不含可辨識本站身分的字串
- Given `HEADERS` 未設定自訂 `User-Agent`, when 檢視其鍵值, then 不得存在 `User-Agent`／`user-agent` 鍵（NFR7 決定不揭露身分；中性 bot 識別＋聯絡信箱為可延後項 O5，本 story 不含）

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 3: (high 0, medium 1, low 2)
- reject: 6
- addressed_findings:
  - `[medium]` `[patch]` `src/sources/usj.test.ts` 的 `pkg.name` 未經驗證即作為比對基準，`name` 缺失時字串比對會退化成恆為通過（vacuous pass）、為空字串時則恆為失敗；已補上非空字串斷言，避免此 NFR7 回歸測試在未來 package.json 變動下悄悄失效。
  - `[low]` `[patch]` `src/sources/usj.ts:84` 新匯出的 `HEADERS` 缺少說明註解，與檔案既有「每個模組層級常數皆有註解」慣例不一致；已補上說明其為四個 `limitedFetch` 呼叫點共用、因本測試需要而匯出的一行註解。

## Design Notes

Node 24 內建 `fetch`（undici）在呼叫端未指定 `User-Agent` 時，仍會自動送出預設值。本機以 `node:http` 起一個本地伺服器、用內建 `fetch` 打一次請求驗證，收到的標頭為：

```
"user-agent": "node"
```

且未見任何 `referer`／`origin` 鍵被自動附加。`"node"` 是 Node.js 執行環境的通用標識，不含站名、網域或任何可回溯到本站的字串，因此不需要也不應該覆寫它——覆寫成自訂字串反而更可能不小心帶入識別資訊，而刻意偽裝成瀏覽器或加上中性 bot 識別字串屬於 O5，本 story 明確排除。

## Verification

**Commands:**
- `npm test` -- expected: 全部測試通過，包含新增的 `src/sources/usj.test.ts` 兩則標頭斷言
- `npx tsc -p tsconfig.test.json` -- expected: 無型別錯誤

**Manual checks (if no CLI):**
- 檢視 `src/sources/usj.ts` 的 `HEADERS` 常數，確認四個既有欄位（`Accept`、`Content-Type`、`x-anonymous-consents`、`Accept-Language`）維持不變，且未新增任何 `User-Agent`／`Referer`／`Origin` 或其他識別性欄位
- `git diff --stat` 確認變更範圍僅限 `src/sources/usj.ts`（加上 `export`）與新檔 `src/sources/usj.test.ts`，無範圍外變更

## Auto Run Result

**摘要：** 匯出 `src/sources/usj.ts` 既有的單一 `HEADERS` 常數（四個 `limitedFetch` 呼叫點——`fetchInventory`、`fetchTimeSlots`、`fetchProductInfo`、`fetchCatalogPage`——共用的唯一來源），新增 `src/sources/usj.test.ts` 兩則回歸測試，將 NFR7「請求標頭不揭露本站身分」鎖為可自動驗證的不變量：(1) 動態讀取 `package.json` 的 `name` 欄位，斷言 `HEADERS` 序列化後不含該字串；(2) 斷言 `HEADERS` 不存在自訂 `User-Agent`／`user-agent` 鍵。經本機以 Node 24 內建 `fetch` 實測確認，未設定 UA 時底層 undici 送出的預設值為通用字串 `"node"`，不會自動附加 `Referer`／`Origin`，現行程式碼已符合 AC；審查階段追加一則輸入驗證與一段行內註解。

**變更檔案：**
- `src/sources/usj.ts` -- 為既有 `HEADERS` 常數加上 `export`，並補上一行說明其為四個 `limitedFetch` 呼叫點共用、因回歸測試需要而匯出的註解
- `src/sources/usj.test.ts`（新檔）-- 新增兩則測試鎖定 NFR7；審查階段加上 `pkg.name` 非空字串斷言，避免未來 package.json 變動使此測試悄悄退化為 vacuous pass 或恆為失敗

**審查結果分類：**
- patch（已修補）：2 項（medium 1、low 1）——`pkg.name` 未經驗證即作比對基準（缺失時恆為通過、空字串時恆為失敗）、新匯出常數缺少說明註解，皆已修補並驗證通過
- defer（延後）：3 項（medium 1、low 2）——forbidden-string 比對僅涵蓋 package.json 名稱，未涵蓋未來網域/Referer/Origin 等其他洩漏形式（待 Epic 2 指定實際網域後補強）；`HEADERS` 匯出後仍可變動、未加 `Readonly`/`Object.freeze`（既有行為，本 story 未加劇）；新測試未自動驗證四個呼叫點確實仍原樣傳入 `HEADERS`（已人工核對，非本 story 明確範圍）
- reject（駁回）：6 項——包含要求鎖定既有必要欄位不變的測試、要求對真實網路端點做端對端驗證、字串跳脫風格瑕疵、要求對測試本身做突變測試、要求鎖定 `HEADERS` 鍵集合的精確形狀，以及要求為 `package.json` 讀取加上檔案不存在/格式錯誤防護（與既有 `limits.test.ts` 讀取外部檔案的慣例一致，非本次缺陷）

**後續複審建議：** `false`（patch 計分 = 3×1(medium) + 1×1(low) = 4，未達 5；且無 high 嚴重度 patch）

**驗證執行：**
- `npm test`：10/10 通過（含新增的兩則 HEADERS 標頭斷言，審查修補後重跑仍全數通過）
- `npx tsc -p tsconfig.test.json`（typecheck）：無錯誤
- 人工檢視 `src/sources/usj.ts`：`HEADERS` 既有四個欄位（`Accept`、`Content-Type`、`x-anonymous-consents`、`Accept-Language`）未變動，未新增任何 `User-Agent`／`Referer`／`Origin` 欄位
- `git diff --stat` 確認變更範圍僅限 `src/sources/usj.ts` 與新檔 `src/sources/usj.test.ts`，無範圍外變更（`sprint-status.yaml` 未被本次執行寫入或還原，維持 orchestrator 所有權）

**殘留風險：** forbidden-string 檢查目前僅能比對 `package.json` 的 `name`，尚無實際網域可比對（NFR3.2 卡在法遵書面意見，本輪明確排除）；一旦 Epic 2 指定正式網域，應回頭擴充此測試的比對範圍，已列為 deferred 項目。
</content>

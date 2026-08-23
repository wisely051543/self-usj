---
title: 'DW-13：中止回合不應讓「Flag failed products」誤報上一輪的失敗'
type: 'bugfix'
created: '2026-08-23'
baseline_revision: '452a766148b6544f4e6c5f0fbe1751cebd52e109'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `src/limits.test.ts` 解析 `fetch.yml` 全靠手刻正規表示式，插入 `id:` 等欄位就可能讓
      `flagFailedProductsCondition()` 之類的 helper 抓不到值。
    evidence: |-
      `scheduleIntervalMin`／`jobTimeoutMin`／`concurrencyBlock`（`src/limits.test.ts:70-100`）
      與本次新增的 `flagFailedProductsCondition()` 都是同一手法：直接對 YAML 原始文字跑正規
      表示式，而非用真正的 YAML parser。這是本檔既有慣例，不是本次改動引入；本次只是比照
      既有寫法新增一個同型 helper。獨立審查（blind-hunter、edge-case-hunter）皆指出，若日後
      在 `- name:` 與 `if:` 之間插入 `id:`／`uses:` 等欄位，這類正規表示式會抓不到值，
      `assert.ok(step, …)` 會丟出「找不到步驟」的誤導性錯誤，而非指向真正的條件內容。
    location: >-
      src/limits.test.ts:70-116
    severity: low
  - summary: >-
      `if: success()` 判斷的是「job 到此為止沒有任何步驟失敗」，不是專門針對
      `npm run fetch` 這一步；若日後在兩者之間插入會獨立失敗的新步驟，會連帶讓本應正常的
      回合也被跳過標記。
    evidence: |-
      intent-alignment 審查指出：目前 `npm run fetch` 與「Flag failed products」中間沒有
      其他步驟，且皆無 `continue-on-error`，所以 `success()` 現況等同於「fetch 這一步成功」；
      但這個等價關係是隱含的，沒有用 `steps.<id>.outcome` 明確綁定到 `npm run fetch` 這個
      步驟本身。spec 的 Always 條款寫的是「緊鄰的前一步驟」，現況成立，但寫法本身不會在
      未來插入新步驟時提醒維護者重新檢查這個假設。
    location: >-
      .github/workflows/fetch.yml:45-56
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.github/workflows/fetch.yml` 的「Flag failed products」步驟為 `if: always()`，且無條件讀取 `data/index.json`。當 `npm run fetch` 因 `BlockedError`（或更早的 catalog 失敗、`--product=` 找不到對應產品）中止時，本回合從未改寫過 `index.json`，該步驟因此把「上一回合」已知的失敗產品重新標成 `::warning`，誤導本次執行的結果。

**Approach:** 把「Flag failed products」步驟的執行條件從 `if: always()` 改為只在 `npm run fetch` 步驟本身成功時才跑（即 `if: success()`），讓中止的回合直接跳過本步驟——中止本身已經讓 job 變紅、且 `npm run fetch` 已在 log 印出明確的 `[fetch] … blocked` / `catalog failed` 訊息，不需要靠這個步驟重複告警。

## Boundaries & Constraints

**Always:** 只在 `npm run fetch` 這個緊鄰的前一步驟成功時才執行「Flag failed products」；判斷方式是 workflow 步驟本身的 `if:` 條件，不是解析 script 輸出。「Commit results」步驟維持 `if: always()` 不動——它本來就設計成「即使部分產品失敗仍要提交健康產品的新資料」，不在本次範圍內。

**Block If:** _(none — 範圍單一，皆已在程式碼中確認)_

**Never:** 不嘗試在 workflow 條件中區分 `BlockedError` 中止與其他中止原因（catalog 失敗、`--product=` 找不到產品）——這三者都是 `npm run fetch` 在改寫 `index.json`（`src/fetcher.ts:387`）之前就 `process.exit`，GitHub Actions 的步驟結論看不出差異，也不需要看出差異，一律跳過即可。不處理 `src/fetcher.ts:419-422`「全部產品失敗」那個中止路徑——它發生在 `index.json` 已改寫之後，本回合資料仍是新鮮的，維持現有「照跑」行為，不在本次改動範圍內。不新增通知管道或改動 `npm run fetch` 本身的結束碼。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `npm run fetch` 成功（含部分產品逐一失敗但未整輪中止） | fetch 步驟 exit 0 | 「Flag failed products」照跑，對本回合 `index.json` 內真正失敗／`budgetExhausted` 的產品發出 `::warning` | 無（現況不變） |
| `npm run fetch` 因 `BlockedError` 中止 | fetch 步驟 exit 1；`index.json` 未被本回合改寫 | 「Flag failed products」被跳過，不再對上一回合的舊失敗發出 `::warning` | fetch 步驟本身已讓 job 變紅，並印出 `[fetch] … blocked` |
| `npm run fetch` 因 catalog 失敗中止 | fetch 步驟 exit 1；`index.json` 未被本回合改寫 | 「Flag failed products」被跳過 | fetch 步驟已印出 `[fetch] catalog failed: …` 並讓 job 變紅 |
| `--product=` 找不到對應產品 | fetch 步驟 exit 2 | 「Flag failed products」被跳過 | fetch 步驟已印出 `No product matched …` 並讓 job 變紅 |

</intent-contract>

## Code Map

- `.github/workflows/fetch.yml:45-56` -- 「Flag failed products」步驟，現為 `if: always()`，本次改動目標。
- `src/fetcher.ts:339-349` -- `BlockedError` 中止路徑：`console.error` 後 `process.exit(1)`，發生在 `index.json` 改寫（:387）之前。
- `src/fetcher.ts:292-298` -- catalog 失敗中止路徑，同樣早於 :387 就 `process.exit(1)`。
- `src/fetcher.ts:300-304` -- `--product=` 找不到產品，`process.exit(2)`，同樣早於 :387。
- `src/fetcher.ts:387` -- `index.json` 實際寫入處，在每產品迴圈跑完之後；上述三個中止路徑都在此之前退出，故本回合完全沒碰過這個檔案。
- `src/fetcher.ts:419-422` -- 「全部產品失敗」路徑：`process.exit(1)` 發生在 :387 之後，`index.json` 已是本回合新鮮資料——依 Never 條款排除在本次範圍外。
- `src/limits.test.ts:70-108` -- 既有的正規表示式讀取慣例（直接解析 `fetch.yml` 文字），新測試比照此手法擴充，不引入新的解析工具。

## Tasks & Acceptance

**Execution:**
- `.github/workflows/fetch.yml` -- 把「Flag failed products」步驟的 `if: always()` 改成 `if: success()`，並加一行簡短註解說明原因（中止回合未改寫 `index.json`，避免重複標記上一輪已知失敗）-- 直接消除誤報來源，同時保留「Commit results」步驟原有的 `if: always()`。
- `src/limits.test.ts` -- 仿照檔案既有的 `scheduleIntervalMin` / `jobTimeoutMin` 手法，新增一個小型 helper 讀出「Flag failed products」步驟的 `if:` 條件字串，並加一則測試斷言該值不是 `always()` -- 防止未來的編輯不小心把 `always()` 改回來。

**Acceptance Criteria:**
- Given `.github/workflows/fetch.yml` 的「Flag failed products」步驟，when `npm run fetch` 在改寫 `index.json` 之前中止（`BlockedError`、catalog 失敗、或 `--product=` 找不到產品）, then 該步驟被跳過，不對上一回合的資料發出任何 `::warning`。
- Given 同一步驟, when `npm run fetch` 成功完成（不論本回合是否有個別產品失敗）, then 該步驟照常執行，對本回合 `index.json` 內的失敗產品與 `budgetExhausted` 發出 `::warning`，行為與現況相同。
- Given `src/limits.test.ts` 新增的測試, when 執行 `npm test`, then 若日後有人把「Flag failed products」的條件改回 `always()`，該測試會失敗並指出原因。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (medium 1)
- defer: 2 (low 2)
- reject: 13
- addressed_findings:
  - `[medium]` `[patch]` `src/limits.test.ts` 的新測試只斷言 `condition !== 'always()'`，且擷取用的正規表示式在遇到 `${{ always() }}` 這類包裝語法時只會抓到 `${{` 就在空白處截斷——兩者合起來讓 `if: failure()` 或 `if: ${{ always() }}` 這類回退都會被誤判為通過。已改成正規表示式抓到行尾、斷言改為 `assert.equal(condition, 'success()')`，重跑 `npm test`／`tsc --noEmit` 皆通過。

## Verification

**Commands:**
- `npm test` -- expected: 全數測試通過，包含新增的 workflow 條件斷言。
- `npx tsc -p tsconfig.test.json --noEmit` -- expected: 無型別錯誤（`typecheck` script 的等效呼叫）。

**Manual checks (if no CLI):**
- 目視確認 `.github/workflows/fetch.yml` 的「Commit results」步驟仍是 `if: always()`，未被本次改動誤觸。

## Auto Run Result

**摘要：** 把 `.github/workflows/fetch.yml` 的「Flag failed products」步驟從 `if: always()` 改成 `if: success()`，讓中止的回合（`BlockedError`、catalog 失敗、`--product=` 找不到產品——皆在 `index.json` 改寫之前就退出）不再把上一回合的舊失敗重新標成本次執行的 `::warning`；「Commit results」步驟維持原樣。另在 `src/limits.test.ts` 新增回歸測試鎖住這個條件。

**變更檔案：**
- `.github/workflows/fetch.yml` -- 「Flag failed products」步驟 `if: always()` → `if: success()`，並加上說明中止路徑的註解。
- `src/limits.test.ts` -- 新增 `flagFailedProductsCondition()` helper 與對應測試，斷言該步驟條件為 `success()`。

**Review 結果：**
- patch：1（medium 1）-- 已修正並重新驗證（見 Review Triage Log）。
- defer：2（low 2）-- 已寫入 frontmatter `deferred`：正規表示式解析 YAML 的既有脆弱性、`success()` 未綁定特定步驟 id 的隱含假設。
- reject：13 -- 噪音／已被既有測試涵蓋／屬 spec Never 條款明確排除範圍。

**Follow-up review 建議：** `false`（本輪 patch 僅 1 筆 medium，無 high；`3×1(medium)+1×0(low)=3 < 5`）。

**驗證執行：**
- `npm test` -- 97/97 通過（含新增與修正後的測試）。
- `npx tsc -p tsconfig.test.json --noEmit` -- 無型別錯誤。
- 目視確認「Commit results」步驟未受影響，仍為 `if: always()`。

**殘餘風險：** 兩筆 low severity 的 defer 項目（見 frontmatter `deferred`）：(1) 本檔沿用既有的正規表示式解析 `fetch.yml` 慣例，對步驟結構調整（如插入 `id:`）不夠健壯；(2) `if: success()` 現況等同「fetch 這一步成功」，但不是明確綁定該步驟 id，未來若在兩步驟間插入新步驟需重新檢視此假設。

---
title: 'BlockedError.body 改名為 bodySnippet'
type: 'refactor' # feature | bugfix | refactor | chore
created: '2026-08-23'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: '6af60ee2b156995938a4236597c9add2b233be5b'
review_loop_iteration: 0 # incremented by step-04 before each review loopback
followup_review_recommended: false # set by step-04 on status: done — true if the LLM decided another review pass is worthwhile
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `BlockedError.body` 實際存放的是正規化並截斷後的診斷片段，欄位名與內容不符，目前只能靠 JSDoc 補充說明；此欄位為本輪新增、尚無其他消費者（僅 `src/limiter.test.ts` 直接讀取），此時改名成本最低。

**Approach:** 將 `src/limiter.ts` 的 `BlockedError.body` 欄位改名為 `bodySnippet`（僅改欄位名與其 JSDoc，建構子參數名 `body` 不變），同步更新 `src/limiter.test.ts` 內對該欄位的讀取，並修訂 `spec-dw-8-9-10-block-abort-path-hardening.md` I/O 矩陣中以 `body` 指稱該欄位的四列，使其改用 `bodySnippet`。

## Boundaries & Constraints

**Always:**
- 只改欄位名 `body` → `bodySnippet` 及其 JSDoc 用字；建構子參數名 `body`、`snippet()` 函式簽章、`BLOCKED_BODY_SNIPPET_MAX`／`BLOCKED_BODY_SCAN_MAX` 常數名一律不動。
- `BlockedError` 建構子的正規化／截斷行為（含兩參數呼叫仍合法）維持不變，只換讀出的屬性名。
- `src/limiter.test.ts` 內所有讀取 `err.body` 的斷言改讀 `err.bodySnippet`，測試涵蓋的行為（截斷、正規化、無內文、讀取失敗）不得改變。
- `spec-dw-8-9-10-block-abort-path-hardening.md` 的 I/O 矩陣四列（內文可讀的封鎖／超長內文／多行內文／無內文可讀）改以 `bodySnippet` 指稱該欄位；矩陣描述的行為本身不變。

**Block If:** 若發現 `src/limiter.ts`／`src/fetcher.ts`／`src/sources/usj.ts` 以外，還有其他程式碼（非測試）已消費 `BlockedError.body`，先 HALT 回報，不擅自擴大改名範圍。

**Never:** 不改動 `RETRY_DELAYS_MS`、速率／並行常數、`limitedFetch` 公開簽章，或 `snippet()`／`clipLoneSurrogate` 的正規化邏輯本身。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 欄位讀取改名 | `new BlockedError(url, 503, 'blocked by WAF')` | `err.bodySnippet === 'blocked by WAF'`，`err.body` 不再存在（TS 編譯期即應報錯，非執行期屬性） | 無 |
| 既有兩參數呼叫 | `new BlockedError(url, 503)` | `err.bodySnippet === undefined`，其餘行為不變 | 無 |

</intent-contract>

## Code Map

- `src/limiter.ts:114-132` -- `BlockedError` 類別：`readonly body?: string` 欄位定義（行 122）與其上方 JSDoc（行 117-121，"The blocked response's body as a snippet..."）、建構子內 `this.body = snip;`（行 130）三處改名為 `bodySnippet`；建構子參數 `body`（行 124）與 `snippet()` 函式（行 88 起）不動。
- `src/limiter.test.ts` -- 7 處讀取 `err.body`／`.body`／`.body?.length`：行 145、157、158、170、176、188、206、227、249（`assert.equal(err.body, ...)` 或 `err.body?.length` 或 `const snippet = err.body ?? ''`）全部改讀 `err.bodySnippet`；測試檔頂部 JSDoc（行 1-23 附近）提到 "the blocked response's body survives..." 之敘述若指涉欄位名可保留原文字義，不強制改寫敘述性文字，僅改程式碼中的屬性存取。
- `_bmad-output/implementation-artifacts/spec-dw-8-9-10-block-abort-path-hardening.md:137-140` -- I/O 矩陣四列：`BlockedError.body === 'blocked by WAF'`、`body.length` ×2、`body` 空白正規化、`body` 為 `undefined` 等描述改為 `bodySnippet`。
- `src/fetcher.ts`、`src/sources/usj.ts` -- 已 grep 確認僅以 `err instanceof BlockedError` 分支，未存取 `.body`／`.bodySnippet`，無需改動。

## Tasks & Acceptance

**Execution:**
- `src/limiter.ts` -- 將 `BlockedError` 的 `body` 欄位（含 JSDoc、賦值語句）改名為 `bodySnippet` -- 欄位名需反映內容為正規化截斷後的片段，而非原始 body
- `src/limiter.test.ts` -- 將所有 `err.body` 存取改為 `err.bodySnippet` -- 隨欄位改名同步，避免編譯失敗與測試失真
- `_bmad-output/implementation-artifacts/spec-dw-8-9-10-block-abort-path-hardening.md` -- I/O 矩陣第 137-140 列的 `body` 改為 `bodySnippet` -- 使凍結契約文件與程式碼實際欄位名一致

**Acceptance Criteria:**
- Given `src/limiter.ts` 已改名，when 以 `new BlockedError(url, 503, 'blocked by WAF')` 建構，then `err.bodySnippet === 'blocked by WAF'` 且 TypeScript 編譯不再存在 `body` 屬性
- Given `src/limiter.test.ts` 已同步改名，when 執行既有測試套件，then 所有原本鎖住的截斷／正規化／無內文行為斷言全數通過，無需新增或刪減測試案例
- Given `spec-dw-8-9-10-block-abort-path-hardening.md` 已同步修訂，when 檢視 I/O 矩陣第 137-140 列，then 欄位名全部顯示為 `bodySnippet`，其餘描述內容不變

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 0
- reject: 8
- addressed_findings:
  - `[medium]` `[patch]` `src/limiter.ts` 的 `BlockedError.body` JSDoc（行 117-121）在改名時未同步更新，intent 與本 spec Code Map 皆明列 JSDoc 為三個改名點之一 — 更新註解文字使其對齊 `bodySnippet` 欄位名。
  - `[low]` `[patch]` `spec-dw-8-9-10-block-abort-path-hardening.md` frontmatter `deferred:` 中 DW-43 該筆歷史記錄（行 94-101）仍陳述「本輪一度更名為 bodySnippet…故回滾」，與本次已重新套用改名且更新 I/O 矩陣的現況矛盾 — 於該筆 evidence 末尾附加一句說明已於 DW-43 重新套用並同步文件，不刪改原始歷史文字。

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 編譯通過，無 `body` 屬性殘留造成的型別錯誤
- `node --test src/limiter.test.ts` -- expected: 全數通過

## Auto Run Result

**變更摘要：** 將 `src/limiter.ts` 的 `BlockedError.body` 欄位（含 JSDoc）改名為 `bodySnippet`，同步更新 `src/limiter.test.ts` 內所有讀取該欄位的斷言，並修訂 `spec-dw-8-9-10-block-abort-path-hardening.md` 凍結 I/O 矩陣四列與其 DW-43 歷史 `deferred` 記錄，使文件與程式碼現況一致。建構子參數名 `body`、`snippet()` 簽章、`BLOCKED_BODY_SNIPPET_MAX`／`BLOCKED_BODY_SCAN_MAX` 常數皆未變動。

**變更檔案：**
- `src/limiter.ts` -- `BlockedError` 的 `readonly body?: string` 欄位、其 JSDoc、建構子賦值改名為 `bodySnippet`
- `src/limiter.test.ts` -- 9 處 `err.body` 存取改為 `err.bodySnippet`
- `_bmad-output/implementation-artifacts/spec-dw-8-9-10-block-abort-path-hardening.md` -- I/O 矩陣第 137-140 列改用 `bodySnippet`；DW-43 歷史 `deferred` 記錄附加一句說明已重新套用

**Review 發現分類：**
- patch 已修：2（medium 1 -- `BlockedError` JSDoc 補改；low 1 -- DW-43 歷史 deferred 記錄附加同步說明）
- defer：0
- reject：8（測試斷言訊息／標題沿用「body」措辭、`spec-dw-8-9-10` `<intent-contract>` 外的敘述性文字、另外兩則與其他 DW 相關的既有 deferred 記錄、破壞性變更未加註記等建議 -- 皆屬人類決策明示範圍之外，予以拒絕）

**Follow-up review recommendation:** `false`（本輪 patch 無 high；3×medium(1) + 1×low(1) = 4 < 5）

**驗證：**
- `npx tsc --noEmit` -- 通過，無錯誤
- `node --require ts-node/register --test src/limiter.test.ts` -- 13/13 通過
- `npm test`（全套件） -- 109/109 通過

**殘留風險：** 無已知風險。此為純改名，`BlockedError` 除 `src/limiter.ts`／`src/limiter.test.ts` 外無任何消費者讀取該欄位（已 grep 確認 `src/fetcher.ts`、`src/sources/usj.ts` 僅用 `instanceof` 判斷）。

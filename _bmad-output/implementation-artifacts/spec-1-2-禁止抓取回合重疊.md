---
title: 'Story 1.2 - 禁止抓取回合重疊'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: '820791438969df9bbdbf4afbad7210932cb710ee'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      GitHub Actions concurrency 群組在 cancel-in-progress:false 下，若第三次觸發於已有一個
      pending 回合等待時發生，會取消該 pending 回合並取而代之，導致某次排程可能被跳過而非僅延後執行；
      此為 GitHub 平台既有語意，非本次變更之缺陷。
    evidence: |-
      架構文件 review-reality-check.md 的 F9 已載明並接受此語意（"queued run... pending
      job... will be canceled and the new queued job... will take its place"），現行 spec 的
      I/O & Edge-Case Matrix 與 Design Notes 未涵蓋此邊界情境，值得補一句說明或未來評估告警機制。
    location: >-
      .github/workflows/fetch.yml:18-22
    severity: medium
  - summary: >-
      epic-1-context.md（本次重新編譯的英文版）Goal 段落用詞「test-enforced rate/concurrency
      limits」略為誇大——CONCURRENCY 本身無靜態上限斷言。
    evidence: |-
      epic-1-context.md 自身 Technical Decisions 段落即載明「CONCURRENCY 本身無靜態上限斷言」，
      與 Goal 段落用詞略有落差，屬編譯側措辭精確度問題，非 Story 1.2 範圍內的程式碼缺陷。
    location: >-
      _bmad-output/implementation-artifacts/epic-1-context.md:7
    severity: low
  - summary: >-
      epic-1-context.md 英文版 Story 1.7 註解只提到「shrink」，未提及該 story 名稱本身強調的
      「回歸保護」（既有三層排程與變動偵測須被保留並回歸測試）。
    evidence: |-
      對照 epics.md 原文 Story 1.7「分層排程回歸保護」與 Technical Decisions 中 AD-21 條目，
      只讀該行英文括號註解的人可能誤以為此 story 純粹是刪減功能。
    location: >-
      _bmad-output/implementation-artifacts/epic-1-context.md:17
    severity: low
  - summary: >-
      epic-1-context.md 的 Cross-Story Dependencies 段落未提及 Story 1.2 與其所滿足之
      「同一時間僅一回合執行」需求的關聯，即使該需求列在同一份文件的 Requirements & Constraints 中。
    evidence: |-
      同文件其餘每條可對應到單一 story 的限制都在 Cross-Story Dependencies 有對應說明，唯獨
      Story 1.2 這條被省略，屬編譯完整性小缺口。
    location: >-
      _bmad-output/implementation-artifacts/epic-1-context.md:55-60
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.github/workflows/fetch.yml` 目前沒有 GitHub Actions `concurrency` 群組設定，只靠 `timeout-minutes: 25` 間接避免重疊；一旦某回合因降速或其他原因跑得比排程間隔長，下一次 `*/30` 排程觸發時可能與尚未完成的前一回合並行執行，造成對來源請求量倍增，以及資料寫入衝突。

**Approach:** 在 `fetch.yml` 新增 workflow-level `concurrency` 設定，`group` 綁定 workflow 名稱，`cancel-in-progress: false`，讓前一回合未完成時，新排程觸發改為進入佇列等待，而不是並行執行或中斷正在寫入的回合。

## Boundaries & Constraints

**Always:** concurrency 的 `group` 必須綁定 workflow 名稱（例如 `${{ github.workflow }}`），不得用 job 名稱或會隨每次執行變動的動態值；`cancel-in-progress` 必須明確設為 `false`。

**Block If:** 無需人工決策——本 story 是單一 workflow 檔案的設定變更，範圍與作法在 epics.md 與 architecture spine 中已明確一致。

**Never:** 不得使用 `cancel-in-progress: true`（會中斷正在寫入資料的回合，與 NFR11 資料完整性衝突）；不得新增或修改 `build.yml`（跨 workflow 併發保護屬 Epic 2 範圍，且 build workflow 目前尚不存在）；不得變更 cron 間隔、`timeout-minutes`、`RATE_LIMIT_PER_SEC`、`CONCURRENCY` 或其他 AD-4 互鎖常數。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 前一回合仍在執行時新排程觸發 | 前一 fetch 回合進行中，`schedule` 或 `workflow_dispatch` 再次觸發 | 新回合進入 `pending` 佇列，等待前一回合完成後才開始執行 | 無錯誤；正在執行的回合不得被取消 |
| 前一回合已完成後新排程觸發 | 無進行中回合 | 新回合立即開始執行（行為與現況相同） | 無錯誤 |

</intent-contract>

## Code Map

- `.github/workflows/fetch.yml` -- 抓取排程 workflow，現況第 1-61 行無 `concurrency` 設定；需在 `on:` 區塊（第 3-16 行）與 `jobs:` 區塊（第 18 行起）之間新增 workflow-level `concurrency:`。

## Tasks & Acceptance

**Execution:**
- `.github/workflows/fetch.yml` -- 在 `on:` 與 `jobs:` 之間新增 workflow-level `concurrency:` 區塊，`group: ${{ github.workflow }}`、`cancel-in-progress: false` -- 確保同一時間僅一個抓取回合執行，新觸發排隊等待而非並行或取消（NFR5.1）

**Acceptance Criteria:**
- Given `fetch.yml` 現無 `concurrency` 群組設定, when 新增 workflow-level `concurrency`（group 綁定 workflow 名稱，`cancel-in-progress: false`）, then 上一回合未完成時，新排程觸發須排隊等待而非並行執行
- Given 新增的 `concurrency` 設定, when 檢視其 `cancel-in-progress` 欄位, then 值必須為 `false`，不得為 `true`

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 4: (high 0, medium 1, low 3)
- reject: 6
- addressed_findings:
  - `[medium]` `[patch]` `fetch.yml` 新增的 `concurrency` 區塊缺少回歸測試保護；已於 `src/limits.test.ts` 新增比照 `scheduleIntervalMin()`/`jobTimeoutMin()` 寫法的 `concurrencyBlock()` 斷言，驗證 `cancel-in-progress` 為 `false` 且 `group` 綁定 `github.workflow`。
  - `[low]` `[patch]` `fetch.yml` 新增的 `concurrency` 區塊缺少行內註解，與檔案既有 cron 區塊的說明慣例不一致；已補上說明 NFR5.1／NFR11 理由的 4 行註解。

## Design Notes

GitHub Actions `concurrency` 語意：同一 group 內若已有回合在執行，新觸發的回合會進入 `pending`（佇列等待），而非被丟棄；只要沒有 `cancel-in-progress: true`，正在執行的回合就不會被中斷。這正是本 story 要的效果——同時避免重疊執行（NFR5.1）與避免中斷正在寫入資料的回合（NFR11）。

## Verification

**Manual checks (if no CLI):**
- 開啟 `.github/workflows/fetch.yml`，確認 `on:` 之後、`jobs:` 之前存在 `concurrency:` 區塊，且 `group: ${{ github.workflow }}`（或等效、明確綁定 workflow 名稱的寫法）、`cancel-in-progress: false`
- 確認 cron 間隔（`*/30 * * * *`）、`timeout-minutes: 25` 及其他既有 AD-4 互鎖常數未被變動
- repo 內無 YAML lint 工具（無 actionlint、無 pyyaml），以人工檢視 YAML 縮排與結構正確性取代自動化 lint

## Auto Run Result

**摘要：** 為 `.github/workflows/fetch.yml` 新增 workflow-level `concurrency` 設定（`group: ${{ github.workflow }}`、`cancel-in-progress: false`），使前一抓取回合未完成時，新排程觸發改為排隊等待而非並行執行，滿足 NFR5.1；`cancel-in-progress: false` 同時確保不會中斷正在寫入資料的回合（NFR11）。審查階段追加一則回歸測試與一段行內註解。

**變更檔案：**
- `.github/workflows/fetch.yml` -- 新增 `concurrency:` 區塊（4 行）及說明其 NFR5.1／NFR11 理由的行內註解（4 行）
- `src/limits.test.ts` -- 新增 `concurrencyBlock()` 輔助函式與對應測試，比照既有 `scheduleIntervalMin()`/`jobTimeoutMin()` 寫法，斷言 `cancel-in-progress` 為 `false` 且 `group` 綁定 `github.workflow`
- `_bmad-output/implementation-artifacts/epic-1-context.md` -- 依 step-01 指示重新編譯（中文→英文），為本次工作流執行的快取更新副作用，非本 story 意圖範圍內的變更

**審查結果分類：**
- patch（已修補）：2 項（medium 1、low 1）——缺少回歸測試、缺少行內註解，皆已修補並驗證通過
- defer（延後）：4 項（medium 1、low 3）——GitHub concurrency 群組 pending-取代語意的邊界情境說明；epic-1-context.md 用詞精確度與完整性小問題（皆非本 story 範圍）
- reject（駁回）：6 項——包含審查輸入建構時的重複內容誤判 2 項、workflow_dispatch 手動覆寫討論（屬 Story 1.8 Kill Switch 範圍）、spec frontmatter `context` 未回填來源文件、`sprint-status.yaml` 仍為 `backlog`（依呼叫端指示，該檔案由 orchestrator 擁有，不得改寫，非本次缺陷）、過期的 `bmad-build-auto-result-*.md` halt 紀錄（gitignored 的逐次執行產物）

**後續複審建議：** `false`（patch 計分 = 3×1(medium) + 1×1(low) = 4，未達 5；且無 high 嚴重度 patch）

**驗證執行：**
- `npm test`：8/8 通過（含新增的 concurrency 區塊測試）
- `npx tsc -p tsconfig.test.json`（typecheck）：無錯誤
- 人工檢視 `fetch.yml`：`concurrency:` 區塊位於 `on:` 與 `jobs:` 之間，`group: ${{ github.workflow }}`、`cancel-in-progress: false`；cron 間隔、`timeout-minutes: 25` 及其他 AD-4 互鎖常數未變動
- `git diff --stat` 確認變更範圍僅限預期檔案，無範圍外變更

**殘留風險：** GitHub Actions 實際排隊行為（`pending` 佇列、`cancel-in-progress` 語意）無法在本機以自動化方式觸發驗證，僅能以人工檢視 YAML 語法與比對官方文件語意確認；已列為 deferred 項目待未來視需要補充告警或文件說明。

---
title: 'CI 閘門釘住與 workflow 解析 helper 強化（DW-24/48/49/52）'
type: 'refactor'
created: '2026-08-23'
baseline_revision: '5dfc4f0c5aff578fef0b6b774004c3130a8085a1'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      ci.yml 的閘門 pin 只證明指令字串還在，無法察覺閘門被 continue-on-error、步驟或 job 層的
      if: false 停用，或 workflow 的 on: push/pull_request 觸發被移除。
    evidence: |-
      review 期間實測：對 `- run: npm run schema:check` 加上 `continue-on-error: true`、
      把閘門改寫成帶 `if: false` 的具名步驟、對 `jobs.check` 加 `if: false`、
      把 `on:` 改成只剩 `workflow_dispatch:`——四種情況 `npm test` 全部維持全綠，
      但 AD-22「失敗即擋 merge」已不再成立。本次 intent 明確只要求「存在性 pin」
      （「deleting any one line reddens npm test」），故不在範圍內。
    location: >-
      src/limits.test.ts (the CI gate pin test); .github/workflows/ci.yml
    severity: medium
  - summary: >-
      Smoke-check 的 pin 只釘住 `-s` 判準，沒有釘住失敗分支仍以 exit 1 讓 job 變紅。
    evidence: |-
      把 else 分支的 `exit 1` 改成 `echo done`，判準仍是 `-s`，pin 照樣通過，
      但這道守門從此只會印一行字、不會擋任何回合——正是 DW-52 註解自己反對的
      「看起來有守、實際不守」。本次 intent 只要求釘住判準本身。
    location: >-
      src/limits.test.ts (the fetch smoke check pin); .github/workflows/fetch.yml
    severity: low
  - summary: >-
      DW-48 點名的四個 helper 中，只有 flagFailedProductsCondition 走的路徑有回歸測試；
      scheduleIntervalMin／jobTimeoutMin／concurrencyBlock 的新作用域無測試保護。
    evidence: |-
      review 實測確認新作用域有效（同層新增一個帶 `timeout-minutes: 1` 的兄弟 job，
      jobTimeoutMin 仍讀到 25；job 層的 concurrency: 不會蓋過 workflow 層的），
      但沒有任何斷言會在這些性質退化時出聲。fixture 成本很低，屬後續加強。
    location: >-
      src/limits.test.ts:70-250
    severity: low
  - summary: >-
      刪掉 ci.yml 的 `- run: npm test` 會讓本檔所有 pin 在 CI 完全停止執行，而這件事
      無法從本檔內部偵測。
    evidence: |-
      斷言只有在被執行時才能報告任何事；`npm test` 那一步被刪除時，limits.test.ts
      在 CI 根本不會跑。本次 intent 明確只列三道閘門（typecheck／i18n:check／schema:check）。
      真正的補法在 repo 之外（branch protection 的 required status check），
      本次已改寫註解說明覆蓋邊界，但缺口本身仍在。
    location: >-
      .github/workflows/ci.yml:29
    severity: low
  - summary: >-
      blockUnder 的 atIndent 只用於頂層 key（on／jobs／concurrency），巢狀查詢
      （jobs.fetch、jobs.check、on.schedule）未傳入對應層級的 atIndent，若巢狀結構未來
      出現同名 key 會被誤配對而非回報「找不到」。
    evidence: |-
      已閱讀程式碼與兩份 workflow 檔案現況確認：jobs.fetch／jobs.check／on.schedule
      下皆無同名子欄位碰撞，故現況未觸發；但此為結構性缺口，非本次 intent 要求範圍。
    location: >-
      src/limits.test.ts（blockUnder 的巢狀呼叫，如 jobTimeoutMin／ciCheckCommands／scheduleIntervalMin）
    severity: medium
  - summary: >-
      runCommandsIn 對 `run: |` 折疊區塊的分支目前未被兩份 workflow 檔案的任何實際內容
      觸發，且消費完一個區塊後迴圈索引未跳過該區塊內容，僅依賴區塊內容不含符合
      `run:` 開頭格式的行來避免重複計入。
    evidence: |-
      已閱讀程式碼確認邏輯；ci.yml 的 run: 皆為單行，現況無 run: | 步驟可驗證此路徑。
    location: >-
      src/limits.test.ts:runCommandsIn
    severity: low
  - summary: >-
      BLOCK_SCALAR 正規表示式（/^[|>][-+]?$/）未涵蓋 YAML 合法的顯式縮排指示數字
      （如 `run: |2` 或 `run: >4-`），該寫法會被誤讀為單行純量而非區塊開頭。
    evidence: |-
      兩份 workflow 檔案現況未使用顯式縮排指示，未觸發；為已知限制。
    location: >-
      src/limits.test.ts:BLOCK_SCALAR
    severity: low
  - summary: >-
      runCommandsIn／stepRunScript 對 `run: |`（逐行）與 `run: >`（折疊成一行）的處理
      方式相同（皆逐行拆開），若未來步驟改用折疊語法，會被誤報為多條指令而非一行。
    evidence: |-
      兩份 workflow 現況只用 `run: |` 或單行 `run:`，未觸發；為已知限制。
    location: >-
      src/limits.test.ts:runCommandsIn, stepRunScript
    severity: low
  - summary: >-
      stepBlock 只辨識 `- name:` 是 dash 行自身第一個欄位的寫法；若步驟改寫成
      `- id: x` 換行後接 `name: X`，會被判定為「找不到步驟」而非正確定位。
    evidence: |-
      兩份 workflow 現況所有步驟皆以 `- name:` 開頭，未觸發；DW-48 intent 只要求容忍
      `name:` 與 `if:` 之間插入欄位，未涵蓋 `name:` 本身被移到非首位。
    location: >-
      src/limits.test.ts:stepBlock
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.github/workflows/ci.yml` 的三道閘門（`npm run typecheck`、`npm run i18n:check`、`npm run schema:check`）與 `fetch.yml` 的 `Smoke-check fetch entry point` 判準（`[ -s fetch-output.log ]`）都只靠註解與人工信任，整行刪掉或把 `-s` 弱化成 `-e`/`-f`，`npm test` 依然全綠（DW-24、DW-52）；同時 `src/limits.test.ts` 讀 workflow 的手刻正規表示式硬綁欄位相鄰順序，日後在 `- name:` 與 `if:` 之間插入 `id:`／`uses:` 就會抓不到值並丟出誤導性的「找不到步驟」（DW-48）；而 `Flag failed products` 的 `if: success()` 只是「到此為止沒有步驟失敗」，並未明確綁定到 `npm run fetch` 這一步（DW-49）。

**Approach:** 在既有 `src/limits.test.ts` 內把 workflow 讀取改為「先切出區塊、再從區塊裡讀欄位」的結構化解析（不引入新相依、不新增測試檔），讓四個既有 helper 都改用它並在「步驟找到但欄位缺席」時給出正確的錯誤訊息；用同一組 helper 新增 ci.yml 三道閘門的存在性 pin 與 Smoke-check `-s` 判準 pin；並把 `fetch.yml` 的 `Flag failed products` 條件改成 `steps.fetch.outcome == 'success'`（`id: fetch` 已存在），同步更新 `src/limits.test.ts:206-216` 那條斷言。

## Boundaries & Constraints

**Always:**
- 不新增測試檔、不新增執行時相依（repo 無 YAML parser，維持零相依的手刻解析）。
- 解析必須結構化：欄位一律從「該步驟／該區塊」切出的文字裡讀，不得再用跨行相鄰的單一正規表示式。
- 錯誤訊息必須可區分「找不到步驟／區塊」與「步驟在、但缺該欄位」。
- 既有八條測試的語意與斷言訊息品質維持不變；helper 換實作後回傳值型別不變。
- 每一道新 pin 都必須是真閘門：對應的 workflow 那行被刪除或弱化時，`npm test` 必須紅。

**Block If:**
- ci.yml 的三道閘門步驟中有任何一道在現行檔案裡不存在（代表閘門已被移除，屬於需人判斷的既成事實，不可由本次改動自行補上）。

**Never:**
- 不改動 `ci.yml` 的實際閘門內容或順序（本次只「釘住」它，不重寫它）。
- 不改 `Smoke-check fetch entry point` 步驟的腳本本身。
- 不改動 `src/limiter.ts`、`index.html` 或互鎖組的任何數值（AD-4）。
- 不編輯 deferred-work ledger。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 閘門完整 | 現行 `ci.yml`、`fetch.yml` | 全部測試通過 | 無 |
| 刪除閘門行 | `ci.yml` 移除 `- run: npm run schema:check`（或 typecheck／i18n:check） | ci 閘門 pin 失敗，訊息點名缺哪一道 | 斷言失敗訊息含缺席指令 |
| 弱化冒煙判準 | `[ -s fetch-output.log ]` 改成 `-e`／`-f` | Smoke-check pin 失敗 | 訊息說明 `-s`（非空）才是判準 |
| 步驟中插入欄位 | `- name: Flag failed products` 與 `if:` 之間插入 `id: x` | helper 仍讀到 `if:` 值，測試照常通過 | 無 |
| 步驟缺欄位 | 某步驟被拿掉 `if:` | 錯誤訊息為「步驟在、缺 if 欄位」而非「找不到步驟」 | 斷言訊息區分兩者 |
| 條件被改回 | `Flag failed products` 改回 `success()` 或 `always()` | 斷言失敗並說明必須綁 `steps.fetch.outcome` | 訊息含實際值 |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml:26,32,41` -- 三道待釘住的閘門步驟（`- run: npm run typecheck`／`npm run i18n:check`／`npm run schema:check`），皆為無 `name:` 的 `- run:` 簡寫，位於 `jobs.check.steps` 之下；`npm test` 在 `:29`（不在本次 pin 範圍）。
- `.github/workflows/fetch.yml:43-46` -- `Fetch` 步驟，`id: fetch` 已存在（DW-49 所需前提，無須新增）。
- `.github/workflows/fetch.yml:57-67` -- `Smoke-check fetch entry point`：`run: |` 區塊裡的 `elif [ -s fetch-output.log ]; then` 即待釘住的判準。
- `.github/workflows/fetch.yml:69-74` -- `Flag failed products` 的 `if: success()` 與其上方註解，本次改為 `steps.fetch.outcome == 'success'` 並改寫註解理由。
- `src/limits.test.ts:70-116` -- 四個待強化 helper：`scheduleIntervalMin`（`on.schedule` 的 `- cron:`）、`jobTimeoutMin`（`^\s*timeout-minutes:` 全檔第一個）、`concurrencyBlock`（硬寫 2 空格縮排）、`flagFailedProductsCondition`（`- name:` 與 `if:` 跨行相鄰）。
- `src/limits.test.ts:206-216` -- 目前斷言 `condition === 'success()'`，是本次條件變更會直接打破的那條，必須同步更新。
- `src/limits.test.ts:102-108` -- `staleThresholdMin()` 讀的是 `index.html` 而非 workflow，維持原樣（read-only）。
- `package.json` -- `test` script 為 `node --require ts-node/register --test $(find src -name '*.test.ts')`；`typecheck` 為 `tsc -p tsconfig.test.json`，新程式碼須通過型別檢查。

## Tasks & Acceptance

**Execution:**
- `.github/workflows/fetch.yml` -- 將 `Flag failed products` 的 `if: success()` 改為 `if: steps.fetch.outcome == 'success'`，並改寫其上方註解，說明綁定的是 `Fetch` 這一步的結果（未來插入新步驟不會靜默改變語意）。
- `src/limits.test.ts` -- 新增結構化區塊解析的內部 helper（依 key 切出巢狀區塊、依 `- name:` 切出步驟區塊、只取某層自身欄位、讀 `run: |` 字面區塊），四個既有 helper 全部改用之；新增 ci.yml 三道閘門存在性 pin 測試與 Smoke-check `-s` 判準 pin 測試；更新 `Flag failed products` 條件斷言為 `steps.fetch.outcome == 'success'` 並改寫其斷言訊息與註解。

**Acceptance Criteria:**
- Given 現行 repo，when 執行 `npm test` 與 `npm run typecheck`，then 兩者皆通過且測試數量較改動前增加（新增的 pin 有實際執行）。
- Given `ci.yml` 中任一道閘門行被整行刪除，when 執行 `npm test`，then 測試失敗且訊息點名缺席的那道指令。
- Given `fetch.yml` 的 `[ -s fetch-output.log ]` 被改成 `[ -e fetch-output.log ]`，when 執行 `npm test`，then 測試失敗。
- Given 在 `- name: Flag failed products` 與其 `if:` 之間插入一行 `id: flag`，when 執行 `npm test`，then 測試仍通過（不再誤報找不到步驟）。
- Given `Flag failed products` 的 `if:` 被改回 `success()`，when 執行 `npm test`，then 斷言失敗並在訊息中顯示實際條件值。

## Spec Change Log

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 3, low 5)
- defer: 4: (high 0, medium 1, low 3)
- reject: 7: (high 0, medium 0, low 7)
- addressed_findings:
  - `[medium]` `[patch]` 新的 `if: steps.fetch.outcome == 'success'` 依賴 `Fetch` 步驟的 `id: fetch`，但沒有任何斷言釘住它；刪除或改名會讓 context 解析成空值、條件永遠為假，「Flag failed products」從此靜默不再執行而測試全綠。已在 DW-49 測試中加上 `id:` 斷言（實測刪除／改名皆會讓 `npm test` 變紅）。
  - `[medium]` `[patch]` Smoke-check 的 pin 比對整段 `run:` 文字，把 `-s` 那行註解掉、改用 `-e` 仍可通過。已改為只比對 shell 真正分支的那一行（`if`／`elif` 開頭）。
  - `[medium]` `[patch]` `fieldIn` 未剝除行尾未加引號的 `#` 註解，較被取代的舊正規表示式退步：`timeout-minutes: 25  # kill switch` 會變成 `NaN`、`cancel-in-progress: false # NFR11` 會誤判。已新增 `scalarValue()` 剝除（引號內的 `#` 不動）。
  - `[low]` `[patch]` `jobTimeoutMin` 未驗證讀到的形狀就丟給 `Number()`；已比照 cron reader 加上 `/^\d+$/` 斷言並在訊息中印出實際值。
  - `[low]` `[patch]` `blockUnder` 讀不到被格式化工具正規化過的 `"on":`；已允許 key 與步驟名稱帶引號，`stepBlock` 亦允許行尾註解。
  - `[low]` `[patch]` `ciCheckCommands` 只讀單行 `run:`，閘門被折成 `run: |` 區塊時會抓到字面的 `|` 並丟出與事實相反的失敗訊息；已改為同時收集區塊內的指令行。
  - `[low]` `[patch]` `stepRunScript` 對單行 `run: cmd` 的步驟會誤報「沒有腳本」；已加上單行 fallback。
  - `[low]` `[patch]` 兩處註解修正：`npm test` 那句「this assertion running is the proof」在 CI 情境下是循環論證，已改寫為明說覆蓋邊界；檔頭 docblock 只提 AD-4 互鎖，已補上本檔現在也擁有 ci.yml 閘門 pin、smoke-check pin 與 workflow reader。

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 5: (high 0, medium 1, low 4)
- reject: 8: (high 0, medium 0, low 8)
- addressed_findings:
  - `[medium]` `[patch]` `scalarValue()` 對加了引號的欄位值只剝掉行尾註解，沒有剝除包住整個值的引號本身：`cancel-in-progress: 'false'` 會被讀成含引號的 `'false'`（7 字元），而非語意值 `false`；同理任何被格式化工具加上引號的 `run:` 指令字串或欄位值都會比對失敗。現行兩份 workflow 檔案的欄位皆未加引號，故現況測試不受影響，但這是新程式碼裡的真實缺陷（`quotable()` 的註解本身就指出格式化工具會主動加引號），下一次格式化即可能讓正確設定被誤判為錯誤而擋下合併。已修正為擷取引號內的內容並剝除引號本身；`npm run typecheck` 與 `npm test`（123 通過）皆綠燈，另以獨立腳本驗證修正後 `'false'` → `false`、`"npm run schema:check"` → `npm run schema:check`。

## Design Notes

`if: steps.fetch.outcome == 'success'` 並未放寬既有語意：GitHub Actions 對不含任何 status check function 的 `if:` 會隱含補上 `success()`，因此新條件等價於 `success() && steps.fetch.outcome == 'success'`——比原本更嚴格，且明確綁到 `Fetch` 步驟本身。

解析形狀（示意，非逐字要求）：

```ts
// 先切區塊，再從區塊裡讀欄位——這一層拆分正是 DW-48 要的解耦。
const job = blockUnder(blockUnder(yml, 'jobs'), 'fetch');   // jobs.fetch 的內容
const timeout = ownFields(job);                              // 只留 job 自己的 key，排除 steps 底下的同名欄位
const step = stepBlock(yml, 'Flag failed products');         // - name: 起，到下一個同縮排項目為止
const cond = stepField(step, 'if', 'Flag failed products');  // 缺欄位時的訊息 ≠ 找不到步驟
```

步驟區塊的結束界線取「下一行非空白且縮排 ≤ `- ` 所在縮排」，因此 `fetch.yml` 中位於步驟之間、與 `-` 同縮排的註解會正確終止區塊，不會把註解文字誤讀成欄位。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 無錯誤。
- `npm test` -- expected: 全數通過，且輸出的 test 總數大於改動前。
- 暫時性負向驗證（驗畢還原，不得留下改動）：刪掉 `ci.yml` 的 `- run: npm run schema:check` 行 → `npm test` 應失敗；把 `-s fetch-output.log` 改為 `-e fetch-output.log` → `npm test` 應失敗；在 `- name: Flag failed products` 下插入 `id: flag` → `npm test` 應仍通過。

## Auto Run Result

**Summary of implemented change：** 在 `fetch.yml` 的 `Flag failed products` 步驟把 `if: success()` 改為 `if: steps.fetch.outcome == 'success'`，並在 `src/limits.test.ts` 內新增結構化區塊解析 helper（`blockUnder`／`ownFields`／`fieldIn`／`stepBlock`／`requireStep`／`stepField`／`stepRunScript`／`runCommandsIn`），讓四個既有 workflow-reading helper（`scheduleIntervalMin`／`jobTimeoutMin`／`concurrencyBlock`／`flagFailedProductsCondition`）全部改用之；新增 ci.yml 三道閘門存在性 pin、fetch.yml 冒煙判準 `-s` pin、`Fetch` 步驟 `id: fetch` pin，並更新 `Flag failed products` 條件斷言。Review pass 額外修正 `scalarValue()` 的引號剝除缺陷。

**Files changed：**
- `.github/workflows/fetch.yml` — `Flag failed products` 條件改綁 `steps.fetch.outcome`，並改寫上方註解。
- `src/limits.test.ts` — 新增結構化 workflow 讀取 helper 與三項新 pin 測試（ci.yml 閘門存在性、smoke-check `-s` 判準、DW-48 欄位解析回歸測試），四個既有 helper 改用新 helper；review pass 修正 `scalarValue()` 引號剝除缺陷。

**Review findings breakdown：**
- 第一輪（實作後）：patch 8（medium 3, low 5，全數已修）、defer 4（medium 1, low 3，已寫入 frontmatter `deferred`）、reject 7、intent_gap 0、bad_spec 0。
- 第二輪（本次 fresh review）：patch 1（medium 1，已修）、defer 5（medium 1, low 4，已寫入 frontmatter `deferred`）、reject 8（含「本次診斷出 deferred-work ledger 已被上游 orchestrator sweep 流程改動」一項——依呼叫端明示指令，ledger 由 orchestrator 專管，本次 review 不介入、不視為本 story 缺陷）、intent_gap 0、bad_spec 0。

**Follow-up review recommendation：** `false`（本輪 patch 僅 1 筆 medium，3×1 + 1×0 = 3 < 5，且無 high）。

**Verification performed：**
- `npm run typecheck` — 無錯誤（兩輪皆執行）。
- `npm test` — 123 項測試全數通過（patch 前後皆驗證）。
- 暫時性負向驗證（第一輪實作時已執行並還原）：刪除 ci.yml 三道閘門任一行、`fetch.yml` 的 `-s`→`-e`、`Flag failed products` 的 `id:`/`if:` 條件變異，皆如預期紅／綠。
- 本輪 review 額外以獨立 node 腳本驗證 `scalarValue()` 修正：`'false'` → `false`、`"npm run schema:check"` → `npm run schema:check`、`false` → `false`（無引號情境不受影響）。
- 未對 workflow 檔案做本輪負向驗證重跑（第一輪已完整覆蓋，本輪未改動 pin 的斷言目標，僅修正共用 helper 的既有邏輯缺陷）。

**Residual risks：** 見 frontmatter `deferred`（9 筆，含本輪新增 5 筆低／中風險項目：`blockUnder` 巢狀查詢未套用 `atIndent`、`runCommandsIn` 折疊區塊路徑未被現況觸發、`BLOCK_SCALAR` 未涵蓋顯式縮排指示、折疊純量與逐行純量處理方式相同、`stepBlock` 要求 `name:` 為 dash 行首欄位）；皆為現行兩份 workflow 檔案未觸發的結構性限制，非本次 intent 要求範圍。


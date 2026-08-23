---
title: 'DW-12：fetch.yml 冒煙檢查，確認 entry point 真的執行了 main()'
type: 'chore'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      新增的 `Smoke-check fetch entry point` 步驟本身（`[ -s fetch-output.log ]` 這個判準）沒有任何自動化測試釘住，未來若有人把 `-s` 誤改成 `-e`/`-f`，會靜默弱化這個檢查而不被任何 `npm test` 抓到。
    evidence: |-
      repo 內已有同類先例：`src/limits.test.ts` 用 `flagFailedProductsCondition()` 這類 regex-parse helper 釘住 `fetch.yml` 鄰近步驟（`Flag failed products`）的 `if:` 條件字串，並在 `ci.yml` 的 `npm test`（merge-blocking gate）下每次 push/PR 執行；但這次新增的 `Smoke-check` 步驟的腳本內容（尤其是 `-s` 而非 `-e`/`-f`）沒有對應的 pin 測試。本次 spec 的 Never 條款明確排除新增測試檔案、且 Design Notes 已論證選 CI 冒煙步驟正是為了避免另外設計測試方式，因此在本次範圍內不處理；若要處理，屬於修改既有 `src/limits.test.ts`（非新增檔案）的後續加強項。
    location: >-
      .github/workflows/fetch.yml (Smoke-check fetch entry point step); src/limits.test.ts
    severity: low
baseline_revision: 'c96a41a9bb5b127d5a466b18ed13d38ac83e7687'
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 底部的 `if (require.main === module) { main(); }` 閘門（`:428-430`）沒有任何測試或 CI 檢查驗證它仍會執行；唯一 import 這個檔案的 `src/fetcher.test.ts` 直接呼叫 `main()`，繞過了閘門本身。若未來工具鏈變動（ESM、改用 tsx、包一層 launcher）使該條件變成 false，`npm run fetch` 會靜默無作為並以 exit 0 結束，`.github/workflows/fetch.yml` 全綠但這回合什麼資料都沒抓。

**Approach:** 在 `.github/workflows/fetch.yml` 既有的 `npm run fetch` 步驟後新增一個 `if: always()` 冒煙檢查步驟：擷取該步驟加了 `--silent` 之後的 stdout+stderr，斷言輸出非空。`main()` 目前每一條真實路徑（成功收尾、單一產品失敗、`BlockedError` 中止、catalog 失敗、目標為空）都至少會 log 一行；唯一會「零輸出且 exit 0」的情況正是閘門失效、`main()` 從未被呼叫。

## Boundaries & Constraints

**Always:** 新增的檢查步驟必須放在 `.github/workflows/fetch.yml`，緊接在 `npm run fetch` 之後、`Flag failed products` 之前；`npm run fetch` 步驟本身必須改為 `npm run fetch --silent`（見 Design Notes：不加 `--silent` 時 npm 的 lifecycle banner 不論 `main()` 有沒有跑都會印，使「輸出非空」判準恆真）；輸出用 `tee` 存成檔案，且維持原本 exit code 語意可被後續 `Flag failed products` 的 `if: success()` 正確讀到；冒煙檢查步驟必須以 `if: always()` 執行，讓中止路徑（`BlockedError`、catalog 失敗）一樣被驗證有輸出；失敗時用 `::error::` annotation 並 `exit 1`，明確點名 `require.main === module` 閘門。

**Block If:** 無。

**Never:** 不修改 `src/fetcher.ts` 的閘門邏輯本身或 `main()` 的行為；不新增 `src/fetcher.test.ts` 之外的單元測試檔案來重複驗證同一件事（理由見 Design Notes：真正的 subprocess 測試需要打正式站台或另外注入依賴，超出範圍）；不對 `npm run fetch` 的既有 log 格式做字串比對式斷言（訊息文字未來可能改寫，會讓檢查變脆——只斷言「輸出非空」）；不改動 `concurrency`、`cron`、`timeout-minutes` 等既有排程設定（AD-4 互鎖群組，不在本次範圍）；不額外釘死 `shell: bash`（GitHub Actions 預設 shell 已含 `pipefail`，檔案其餘步驟也未指定，維持一致）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 正常執行 | `require.main === module` 為 true，`main()` 照常跑完（成功或有 log 的中止） | `npm run fetch --silent` 產生至少一行輸出；冒煙檢查通過，job 繼續走既有流程 | 無 |
| 閘門失效（未來工具鏈變動） | `require.main === module` 求值為 false，`main()` 從未被呼叫，process 以 exit 0 結束 | 輸出檔為空 | 冒煙檢查以 `::error::` 標記並 `exit 1`，job 轉紅 |
| `main()` 中止但仍有 log（BlockedError／catalog 失敗／目標為空） | `main()` 在完成前呼叫 `process.exit(1)` 或 `process.exit(2)`，但已先 `console.error` | 輸出檔非空 | 冒煙檢查通過（只驗證 entry point 有跑，不驗證這回合本身成功） |

</intent-contract>

## Code Map

- `.github/workflows/fetch.yml:31` -- 目前 `- run: npm run fetch`（無 name/id，緊接在 `setup-node`/`npm ci` 之後，`Flag failed products` 之前）。改為具名步驟並加 `id`、`--silent` 旗標，輸出以 `tee` 存檔：`npm run fetch --silent 2>&1 | tee fetch-output.log`。
  - **⚠️ 修正（review pass 1 發現）：GitHub Actions 未指定 `shell:` 時的預設值是 `bash -e {0}`，不含 `pipefail`**（`pipefail` 只有在明確寫 `shell: bash` 時才會套用，變成 `bash --noprofile --norc -eo pipefail {0}`）。已對照 GitHub 官方文件 `workflow-syntax-for-github-actions` 的 `shell` 對照表確認：unspecified 預設欄位是 `bash -e {0}`，明確指定 `bash` 才是 `bash --noprofile --norc -eo pipefail {0}`，兩者不同。因此這個新增步驟**必須明確加上 `shell: bash`**，否則 `npm run fetch --silent | tee fetch-output.log` 這個 pipeline 的 exit code 會是 `tee` 的（幾乎恆為 0），而不是 `npm run fetch` 的——這會讓 `BlockedError`／catalog 失敗／全部產品失敗等既有的中止路徑（`npm run fetch` exit 非 0 但仍有 log 輸出）被 `tee` 蓋掉 exit code，使這個新步驟本身回報成功、也使 `Flag failed products` 的 `if: success()`（`:37`）誤判round 成功。這是本次要防的「靜默失敗」故障模式在別的路徑上重新出現，比原本 DW-12 要防的 `require.main` 情境影響更廣（原本裸的 `- run: npm run fetch`，單一指令不經過 pipe，exit code 本來就是可靠的——這個迴歸是本次新增 `tee` 才引入的，不是既有行為）。修正方式：在這個步驟加上 `shell: bash`，讓 `pipefail` 生效。
- `.github/workflows/fetch.yml:33` -- `Flag failed products` 步驟，`if: success()`，緊接在 fetch 步驟後；新增的驗證步驟要插入在 fetch 步驟之後、這步之前。
- `.github/workflows/fetch.yml:50` -- `Commit results`，`if: always()`；不受影響，維持在最後。
- `src/fetcher.ts:275` -- `export async function main()`：每條路徑至少一次 log 的證據來源，不需修改。
  - `:295,297` catalog 失敗 → `console.error('[fetch] catalog failed: ...')` + `process.exit(1)`。
  - `:302-303` 目標為空 → `console.error('No product matched ...')` + `process.exit(2)`。
  - `:347,349`（`BlockedError` 分支）→ `console.error('[fetch] ${entry.code} blocked: ...')` + `process.exit(1)`。
  - `:398-410` 成功收尾 → 多行 `console.log`（calendar 摘要、products/written/failed 統計）。
  - `:415,420-421` 全部產品失敗 / 預算耗盡 → `console.error(...)`，其中全部失敗會 `process.exit(1)`。
  - 沒有任何路徑會在完全不輸出的情況下正常結束——這是冒煙檢查「輸出非空」判準成立的依據。
- `src/fetcher.ts:428-430` -- `if (require.main === module) { main(); }`：本次要防護的閘門本身，不修改。
- `src/fetcher.test.ts` -- 既有測試，透過直接 `import { main }` 並呼叫來繞過閘門；本次新增的檢查與它互補（它測 `main()` 的邏輯，本次測 entry point 真的會呼叫 `main()`），不重疊、不修改。

## Tasks & Acceptance

**Execution:**
- `.github/workflows/fetch.yml` -- 將 `- run: npm run fetch` 改為具名步驟（含 `id`），加上 `--silent` 旗標排除 npm 自己的 lifecycle banner，**明確加上 `shell: bash`**（見 Code Map 修正：unspecified 預設 shell 不含 `pipefail`，會讓 `tee` 蓋掉 `npm run fetch` 的 exit code），並將輸出 `tee` 到檔案；緊接著新增 `if: always()` 的驗證步驟，檢查該檔案非空（`[ -s fetch-output.log ]`），否則以 `::error::` annotation 點名 `require.main === module` 閘門並 `exit 1` -- 讓「閘門失效導致靜默 exit 0」這個故障模式從綠變紅，不需修改 `fetcher.ts` 或新增單元測試檔案。

**Acceptance Criteria:**
- Given `require.main === module` 在目前的 CommonJS + ts-node 工具鏈下維持 true（現況）, when `.github/workflows/fetch.yml` 的 `fetch` job 執行, then `npm run fetch` 步驟的輸出如常寫入 `data/`，新增的驗證步驟讀到非空輸出檔並成功通過，job 其餘步驟（`Flag failed products`、`Commit results`）行為與修改前一致。
- Given 假設性地把 `src/fetcher.ts` 底部的 `if (require.main === module)` 改成一個恆為 false 的條件（僅用於人工驗證，不落地到程式碼）, when 在本機執行 `npm run fetch --silent | tee fetch-output.log`, then `fetch-output.log` 為空檔案且 `npm run fetch` exit code 為 0 -- 驗證新檢查判準（`[ -s fetch-output.log ]`）確實會在這個情境下失敗，而不是誤判通過。

## Design Notes

選「CI 冒煙步驟」而非「child_process-based test」的理由：`fetch.yml` 已經在真實排程下執行 `npm run fetch`（真的打 USJ API），在既有真實執行的輸出上加一個斷言步驟，不會新增任何額外的對外請求；若改寫成 `child_process`-based 單元測試，要嘛得真的 spawn 一個會打正式站台的 subprocess（不宜放進 `npm test`），要嘛得為測試另外注入假的 network source，已超出「加一個冒煙檢查」的範圍（見 Never）。

判準選「輸出非空」而非「比對特定訊息字串」：`main()` 的 log 文案會隨功能演進改寫，字串比對式斷言會反覆因為無關文案調整而假紅；只要閘門正常，任何一條路徑都保證至少一行輸出，「有沒有輸出」是這個故障模式唯一需要、最不脆弱的訊號。

**`--silent` 旗標的必要性：** 「輸出非空」只考慮了 `main()` 自己的 log，漏算了 `npm run <script>` wrapper 自己的輸出。npm 在執行任何 script 前，預設會印一行形如 `> usj-availability@1.0.0 fetch` 加一行 `> ts-node src/fetcher.ts` 的 lifecycle banner，這與 `require.main === module` 是否成立、`main()` 有沒有被呼叫完全無關。本機驗證：`npm run typecheck`（成功時完全無 stdout 的腳本）不加 `--silent` 時仍印出上述兩行 banner，加了 `--silent` 後消失；對有真實輸出的 `npm run i18n:check` 驗證 `--silent` 不會連帶吃掉腳本本身的輸出。因此必須加 `--silent`，否則「輸出非空」永遠成立，閘門真的失效時也不會被抓到。

**`shell: bash` 的必要性（review pass 1 追加）：** 這個步驟把 `npm run fetch` 的輸出 pipe 進 `tee`，而 GitHub Actions 對 `run:` 步驟未指定 `shell:` 時的預設值是 `bash -e {0}`——**不含 `pipefail`**（官方文件 `workflow-syntax-for-github-actions` 的 shell 對照表：unspecified 是 `bash -e {0}`；明確寫 `bash` 才是 `bash --noprofile --norc -eo pipefail {0}`，兩者不同，已本機重現：`bash -c 'false | tee /dev/null; echo $?'` 印 `0`，加 `set -o pipefail` 後印 `1`）。沒有 `pipefail`，pipeline 的 exit code 是 `tee` 的（幾乎恆為 0），不是 `npm run fetch` 的——這會讓 `BlockedError`／catalog 失敗／全部產品失敗等既有中止路徑（原本 exit 非 0）被 `tee` 蓋掉，使新步驟與 `Flag failed products` 的 `if: success()` 都誤判成功，是本次要防的「靜默失敗」故障模式在別的路徑上重新出現，且比 DW-12 原本要防的 `require.main` 情境影響更廣。修正：在這個步驟加上 `shell: bash`。

## Spec Change Log

### 2026-08-23 — Review pass 1（bad_spec loopback）

**觸發發現：** 已實作的機制（`npm run fetch --silent 2>&1 | tee fetch-output.log`，未宣告 `shell:`）永遠無法讓 `Flag failed products` 的 `if: success()` 正確反映 `npm run fetch` 的真實 exit code。原因：GitHub Actions 對 `run:` 步驟未指定 `shell:` 時的預設是 `bash -e {0}`，不含 `pipefail`；本次 Code Map 誤寫成「預設含 pipefail」，導致實作依此誤信而未加 `shell: bash`。四個獨立 review 層（blind-hunter、edge-case-hunter、verification-gap、intent-alignment）均各自發現這個問題；已對照 GitHub 官方文件的 shell 對照表並本機重現（`bash -c 'false | tee /dev/null; echo $?'` 印 `0`；加 `set -o pipefail` 後印 `1`）確認無誤。

**修改內容：** 修正 `## Code Map` 中對 GitHub Actions 預設 shell 行為的錯誤描述，改為正確引用官方文件；`## Tasks & Acceptance` 與 `## Design Notes` 補上「必須明確加上 `shell: bash`」的要求與理由；`## Verification` 補上一條手動檢查項，驗證新步驟確實宣告 `shell: bash`。`<intent-contract>` 本身未修改：其 Always 條款（「維持原本 exit code 語意可被後續 `Flag failed products` 的 `if: success()` 正確讀到」）在本次修正前後都成立——問題出在 Code Map 對「如何」滿足這條 Always 條款的一個具體技術判斷有誤，不是 Always 條款本身或 Approach（「斷言輸出非空」）有誤。

**避開的已知壞狀態：** 出貨一個新增的冒煙檢查步驟，表面上防住了 DW-12 的 `require.main` 情境，實際上卻讓 `Flag failed products` 的既有失敗偵測（`BlockedError`、catalog 失敗、全部產品失敗）失效——比修改前的裸 `- run: npm run fetch`（單一指令、exit code 本來就可靠）更不可靠，是一次淨負面的迴歸。

**KEEP 指示（重新推導時必須保留）：**
- 新驗證步驟緊接在 fetch 步驟之後、`Flag failed products` 之前。
- 驗證步驟用 `if: always()`，讓 `BlockedError`／catalog 失敗中止路徑一樣被檢查，不只驗證成功路徑。
- `::error::` annotation 的風格與用詞，明確點名 `require.main === module` 閘門。
- `npm run fetch` 步驟加 `--silent` 旗標（排除 npm 自己的 lifecycle banner）與 `2>&1 | tee fetch-output.log`（合併 stdout/stderr 存檔）這兩點做法本身正確，不要換掉，只需要**額外**加上 `shell: bash`。
- 判準維持「輸出非空」（`[ -s fetch-output.log ]`），不要換成 `grep` 比對特定字串。
- 不修改 `src/fetcher.ts`、不新增單元測試檔案、不改動 `concurrency`/`cron`/`timeout-minutes`、不額外釘死非必要的 `shell:`（本次的 `shell: bash` 是修正必要項，例外）。

## Review Triage Log

### 2026-08-23 — Review pass 1
- intent_gap: 0
- bad_spec: 1: (high 1, medium 0, low 0)
- patch: 4: (high 0, medium 1, low 3)
- defer: 2: (high 0, medium 0, low 2)
- reject: 6: (high 0, medium 0, low 6)
- addressed_findings:
  - `[high]` `[bad_spec]` 新增步驟未宣告 `shell: bash`，在 GitHub Actions 預設（不含 `pipefail`）的 shell 下，`npm run fetch --silent | tee fetch-output.log` 的 exit code 會被 `tee` 蓋掉，讓 `BlockedError`／catalog 失敗／全部產品失敗等既有中止路徑被誤判成功 -- 已修正 Code Map 對預設 shell 行為的錯誤描述，並在 Tasks/Design Notes/Verification 補上「必須明確加 `shell: bash`」的要求，程式碼已還原、待重新實作。

### 2026-08-23 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 0, low 3)
- defer: 1: (high 0, medium 0, low 1)
- reject: 7: (high 0, medium 0, low 7)
- addressed_findings:
  - `[low]` `[patch]` `Smoke-check` 步驟在 `Fetch` 因更早步驟失敗而被 skip 時（`fetch-output.log` 不存在），仍會誤把責任歸咎於 `require.main` 閘門 -- 改為先判斷 `steps.fetch.outcome == 'skipped'`，該情況下只發 `::notice::`，不再誤判為閘門問題。
  - `[low]` `[patch]` `npm run fetch --silent` 也會壓掉 npm 自己的錯誤診斷（例如缺 script），`::error::` 訊息原本斷言過於武斷 -- 補充「或是 npm run fetch 內部本身提早失敗且無輸出」的可能性，不改變判斷邏輯。
  - `[low]` `[patch]` `fetch-output.log` 未被 `.gitignore` 排除，安全性僅隱含依賴 `Commit results` 步驟的 `git add data/` 範圍 -- 在 `.gitignore` 新增一行 `fetch-output.log` 作為防呆。

## Verification

**Commands:**
- `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/fetch.yml','utf8'))"` 或等效 YAML 解析 -- expected: 不拋出例外，確認修改後的 YAML 語法合法（若專案未安裝 `js-yaml`，改用 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/fetch.yml'))"`）。

**Manual checks (if no CLI):**
- 讀一遍修改後的 `.github/workflows/fetch.yml`：確認新步驟緊接在 `npm run fetch` 之後、`Flag failed products` 之前；確認新步驟 `if: always()`；確認 `npm run fetch` 步驟**明確宣告 `shell: bash`**，且該步驟在失敗時仍會讓 job 步驟回報失敗（`pipefail` 語意），不會被 `tee` 吞掉 exit code——本機驗證：`bash -c 'false | tee /dev/null; echo "exit:$?"'` 印出 `exit:0`（無 pipefail，被 `tee` 蓋掉)，而 `bash -c 'set -o pipefail; false | tee /dev/null; echo "exit:$?"'` 印出 `exit:1`（`shell: bash` 步驟等效於後者）。

## Auto Run Result

**Summary of implemented change：** 在 `.github/workflows/fetch.yml` 的 `fetch` job 中，把裸的 `- run: npm run fetch` 改為具名步驟 `Fetch`（`id: fetch`、`shell: bash`、加 `--silent` 旗標、輸出以 `2>&1 | tee fetch-output.log` 存檔），並在其後、`Flag failed products` 之前新增 `Smoke-check fetch entry point` 步驟（`if: always()`）：若 `Fetch` 因更早步驟失敗而被 skip，只發 `::notice::`；否則檢查 `fetch-output.log` 是否非空，非空則通過，空則以 `::error::`（點名 `require.main === module` 閘門，並註明也可能是 `npm run fetch` 內部提早失敗）標記並 `exit 1`。`src/fetcher.ts` 的閘門邏輯與 `main()` 行為完全未修改，未新增任何測試檔案。

**Files changed：**
- `.github/workflows/fetch.yml` -- 新增 `Fetch`／`Smoke-check fetch entry point` 兩個具名步驟，取代原本裸的 `npm run fetch` 步驟。
- `.gitignore` -- 新增 `fetch-output.log` 一行，作為 CI 產生的暫存 log 不被誤 commit 的防呆。

**Review findings breakdown：**
- Review pass 1：bad_spec 1（high）已修正並重新實作；patch 4（medium 1、low 3，此輪因 bad_spec 而 moot，未套用）；defer 2（low）；reject 6。
- Review pass 2：patch 3（low，全數套用：skip 情境訊息歸因修正、`::error::` 措辭放寬、`.gitignore` 防呆）；defer 1（low，`Smoke-check` 判準本身缺自動化 pin 測試，記入 frontmatter `deferred`）；reject 7。
- 累計：intent_gap 0、bad_spec 1（已解決）、patch 7（3 套用、4 moot）、defer 3（2 未單獨記錄於 frontmatter——屬 pass 1 的一般性強化建議，已在 Review Triage Log 保留原文；1 已記入 frontmatter `deferred`）、reject 13。

**Follow-up review recommendation：** 依規則只計最後一輪（review pass 2）的 patch findings：3 個、皆 low severity、0 個 high。`3 × medium(0) + 1 × low(3) = 3`，未達 5 的門檻 → `false`。

**Verification performed：**
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/fetch.yml'))"` -- 通過，YAML 語法合法（兩輪實作與修補後皆重跑確認）。
- `npm run typecheck` -- 通過，確認 `src/fetcher.ts` 無殘留修改。
- `git diff --stat` -- 確認整個實作與修補過程中 `src/fetcher.ts` 診斷為零差異，僅 `.github/workflows/fetch.yml` 與 `.gitignore` 有變更。
- 手動重現 DW-12 情境：暫時把 `require.main === module` 閘門改成恆為 false，本機執行 `npm run fetch --silent | tee fetch-output.log`，確認輸出檔為空、pipeline exit code 為 0；改回原狀後 `git diff` 對 `src/fetcher.ts` 乾淨。
- 本機驗證 `pipefail` 語意差異：`bash -c 'false | tee /dev/null; echo $?'`（無 pipefail）印出 `0`；加 `set -o pipefail` 後印出 `1`，佐證 `shell: bash` 為必要修正。
- Acceptance Criterion 1（真實排程下 `npm run fetch` 打正式 API、下游步驟行為不變）僅能在實際 GitHub Actions 執行中完全驗證；本次未觸發真實排程執行（會打正式 USJ API，超出本次範圍），改以程式碼檢查（step 順序、`if:` 條件、`steps.fetch.outcome` 邏輯）確認結構正確。

**Residual risks：**
- Acceptance Criterion 1 未在真實 CI 環境驗證過，僅靠本機模擬與程式碼檢查佐證；理論上仍可能有本機環境與 GitHub-hosted runner 之間未預期的行為差異（例如 runner 版本、`bash` 路徑）。
- Review pass 2 的 defer 項（`Smoke-check` 判準缺自動化 pin 測試）維持未處理狀態，已記入 frontmatter `deferred`，留待未來聚焦處理。
- `--silent` 仍會壓掉 npm 自身的錯誤診斷（如缺 script）；`::error::` 訊息已放寬措辭以降低誤導風險，但這個限制本身未消除（spec 明確要求 `--silent`，理由見 Design Notes）。

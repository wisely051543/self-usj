---
title: 'fetch.yml 冒煙檢查：確認 entry point 真的執行了 main()'
type: 'chore'
created: '2026-08-23'
status: 'in-review'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
baseline_revision: 'c96a41a9bb5b127d5a466b18ed13d38ac83e7687'
---

<intent-contract>

## Intent

**Problem:** `src/fetcher.ts` 底部的 `if (require.main === module) { main(); }` 閘門沒有任何測試或 CI 檢查驗證它仍會執行；唯一 import 這個檔案的 `src/fetcher.test.ts` 直接呼叫 `main()`，繞過了閘門本身。若未來工具鏈變動（ESM、改用 tsx、包一層 launcher）使該條件變成 false，`npm run fetch` 會靜默無作為並以 exit 0 結束，`.github/workflows/fetch.yml` 全綠但這回合什麼資料都沒抓。

**Approach:** 在 `.github/workflows/fetch.yml` 既有的 `npm run fetch` 步驟後新增一個冒煙檢查步驟：擷取該步驟的 stdout+stderr，斷言輸出非空。`main()` 目前每一條真實路徑（成功收尾、單一產品失敗、`BlockedError` 中止、catalog 失敗）都至少會 log 一行；唯一會「零輸出且 exit 0」的情況正是閘門失效、`main()` 從未被呼叫。這比比對特定字串更穩固：不用在意訊息格式如何演變，只要閘門失效這個特定故障模式必定被抓到。

## Boundaries & Constraints

**Always:** 新增的檢查步驟必須放在 `.github/workflows/fetch.yml`，緊接在 `npm run fetch` 之後；必須以 `if: always()` 執行，讓中止路徑（`BlockedError`、catalog 失敗）一樣被驗證有輸出，而不是只驗證成功路徑；失敗時要用 `::error::` 讓 Actions UI 清楚標出问题（沿用檔案內既有的 `::warning`/`::error` annotation 慣例）。`npm run fetch` 步驟本身的 exit code 必須維持可被後續 `Flag failed products` 步驟的 `if: success()` 正確讀到（pipe 進 tee 時需保留原本的 exit code）。

**Block If:** 無。

**Never:** 不修改 `src/fetcher.ts` 的閘門邏輯本身或 `main()` 的行為；不新增 `src/fetcher.test.ts` 之外的單元測試檔案來重複驗證同一件事；不對 `npm run fetch` 的既有 log 格式做字串比對式斷言（訊息文字未來可能改寫，會讓檢查變脆）；不改動 `concurrency`、`cron`、`timeout-minutes` 等既有排程設定（AD-4 互鎖群組，改動需要重新核算四個值，不在本次範圍）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 正常執行 | `require.main === module` 為 true，`main()` 照常跑完（成功或有 log 的中止） | `npm run fetch` 產生至少一行輸出；冒煙檢查通過，job 繼續走既有流程 | 無 |
| 閘門失效（未來工具鏈變動） | `require.main === module` 求值為 false，`main()` 從未被呼叫，process 以 exit 0 結束 | `npm run fetch` 步驟輸出檔為空 | 冒煙檢查以 `::error::` 標記並 `exit 1`，讓 job 轉紅，而不是先前的靜默綠燈 |
| `main()` 中止但仍有 log（BlockedError／catalog 失敗） | `main()` 在完成前呼叫 `process.exit(1)`，但已先 `console.error` | 輸出檔非空 | 冒煙檢查通過（該步驟的職責只驗證 entry point 有跑，不是驗證這回合本身成功） |

</intent-contract>

## Code Map

- `.github/workflows/fetch.yml` -- 唯一需要修改的檔案。目前結構（第 22-49 行左右）：`- run: npm run fetch`（無 name/id）→ `Flag failed products`（`if: success()`，讀 `data/index.json`）→ `Commit results`（`if: always()`）。需要：(1) 把 `npm run fetch` 步驟改成有 `name` 與 `id`，加上 `--silent` 旗標並把輸出用 `tee` 存成檔案（見下方「⚠️ Review 修正」，理由見 Design Notes）；(2) 在其後插入新的 `Verify fetch entry point executed` 步驟（`if: always()`），檢查該檔案非空，否則 `::error::` + `exit 1`。GitHub Actions 預設 shell 是 `bash --noprofile --norc -eo pipefail {0}`（含 `pipefail`），所以 `npm run fetch --silent | tee file` 的 exit code 仍會是 `npm run fetch` 的 exit code，`Flag failed products` 的 `if: success()` 語意不受影響。
  - **⚠️ Review 修正（第一輪 review 發現，見 Spec Change Log）：** 光是 `npm run fetch 2>&1 | tee file` 不夠 —— npm 本身會在腳本執行前無條件印出一行 lifecycle banner（形如 `> usj-availability@1.0.0 fetch` / `> ts-node src/fetcher.ts`），**不管底層腳本有沒有輸出、甚至不管 `require.main === module` 有沒有成立都會印**。已在本機對 `npm run typecheck`（一個目前無輸出的腳本）驗證：不加 `--silent` 時仍會印出兩行 banner；加 `--silent` 後這兩行完全消失。另外對 `npm run i18n:check`（一個確實有 stdout 輸出的腳本）驗證：加 `--silent` 後腳本本身的輸出仍正常穿透，只有 npm 自己的 banner 被抑制。因此**必須加 `--silent`**（或等效方式，如 `npm_config_loglevel=silent` 環境變數），否則「輸出非空」這個判準永遠是 true，閘門失效也偵測不到 —— 這正是本次要防的故障模式，卻被 npm 自己的 wrapper 輸出蓋掉了。`--silent` 不是字串比對，不違反 Never 的「不對 log 格式做字串比對式斷言」；也沒有修改 `fetcher.ts`/`main()` 的行為，不違反 Never 的另一條。
- `src/fetcher.ts:275` -- `export async function main()`：每條路徑至少一次 log 的證據來源，不需修改。
  - `:294-298` catalog 失敗 → `console.error('[fetch] catalog failed: ...')` + `process.exit(1)`。
  - `:301-303` 目標為空 → `console.error('No product matched ...')` + `process.exit(2)`。
  - `:337-345`（BlockedError 分支）→ `console.error('[fetch] ${entry.code} blocked: ...')` + `logAbortSummary` + `process.exit(1)`。
  - `:398-422` 成功收尾 → 多行 `console.log`（calendar 摘要、products/written/failed 統計）。
  - 沒有任何路徑會在完全不輸出的情況下正常結束——這是冒煙檢查「輸出非空」判準成立的依據。
- `src/fetcher.ts:428-429` -- `if (require.main === module) { main(); }`：本次要防護的閘門本身，不修改。
- `src/fetcher.test.ts:1-20` -- 既有測試，透過直接 `import { main }` 並呼叫來繞過閘門；本次新增的檢查與它互補（它測 `main()` 的邏輯，本次測 entry point 真的會呼叫 `main()`），不重疊、不修改。

## Tasks & Acceptance

**Execution:**
- `.github/workflows/fetch.yml` -- 將 `- run: npm run fetch` 改為具名步驟（含 `id`），加上 `--silent` 旗標排除 npm 自己的 lifecycle banner，並將輸出 `tee` 到檔案；同時緊接著新增 `if: always()` 的驗證步驟，檢查該檔案非空，否則以 `::error::` annotation 並 `exit 1` -- 讓「閘門失效導致靜默 exit 0」這個故障模式從綠變紅，而不需要修改 `fetcher.ts` 本身或新增單元測試檔案。`--silent` 是必要的，不是可選的優化：沒有它，npm 自己的 banner 會讓「輸出非空」判準恆真，第一輪 review 已實測證實（見 Design Notes）。

**Acceptance Criteria:**
- Given `require.main === module` 在目前的 CommonJS + ts-node 工具鏈下維持 true（現況）, when `.github/workflows/fetch.yml` 的 `fetch` job 執行, then `npm run fetch` 步驟的輸出如常寫入 `data/`，新增的驗證步驟讀到非空輸出檔並成功通過，job 其餘步驟（`Flag failed products`、`Commit results`）行為與修改前一致。
- Given 假設性地把 `src/fetcher.ts` 底部的 `if (require.main === module)` 改成一個恆為 false 的條件（僅用於人工驗證，不落地到程式碼）, when 在本機執行 `npm run fetch | tee fetch-output.log`, then `fetch-output.log` 為空檔案且 `npm run fetch` exit code 為 0 -- 驗證了新檢查判準（`[ -s fetch-output.log ]`）確實會在這個情境下失敗，而不是誤判通過。

## Design Notes

選「CI 冒煙步驟」而非「child_process-based test」的理由：`fetch.yml` 已經在真實排程下執行 `npm run fetch`（真的打 USJ API），在既有真實執行的輸出上加一個斷言步驟，不會新增任何額外的對外請求；而若改寫成 `child_process`-based 單元測試，要嘛得真的 spawn 一個會打正式站台的 subprocess（不宜放進 `npm test`，會拖慢/弄髒每次 CI push 且耦合外部服務），要嘛得為測試另外注入假的 network source，那已經超出「加一個冒煙檢查」的範圍，等於重新設計 `fetcher.ts` 的依賴注入方式——不在本次範圍內（見 Never）。

判準選「輸出非空」而非「比對特定訊息字串」：`main()` 的 log 文案本身會隨功能演進改寫（例如未來新增 AD-16 的資料齡告警訊息），字串比對式斷言會反覆因為無關的文案調整而假紅；而「entry point 有沒有被呼叫」這件事，只要閘門正常，任何一條路徑都保證至少一行輸出，「有沒有輸出」是這個故障模式唯一需要的、最不脆弱的訊號。

**`--silent` 旗標的必要性（第一輪 review 追加）：** 上面「輸出非空」的推論只考慮了 `main()` 自己的 log 行為，漏算了 `npm run <script>` 這層 wrapper 自己的輸出。npm（本專案用的是 npm 11.x）在執行任何 script 前，預設會印一行形如 `> usj-availability@1.0.0 fetch` 加一行 `> ts-node src/fetcher.ts` 的 lifecycle banner —— 這與 `require.main === module` 是否成立、`main()` 有沒有被呼叫完全無關，純粹是 npm 自己的行為。本機驗證：`npm run typecheck`（目前是一個成功時完全無 stdout 的腳本）在不加 `--silent` 時仍印出上述兩行 banner；加 `--silent` 後這兩行消失，且對另一個「有真實輸出」的腳本（`npm run i18n:check`）驗證 `--silent` 不會連帶吃掉腳本本身的輸出。結論：`tee` 抓的必須是加了 `--silent` 之後的輸出，否則「輸出非空」永遠成立，閘門真的失效時也不會被抓到 —— 這正是本次要防的故障模式本身被 npm 的 wrapper 輸出掩蓋掉。

## Spec Change Log

### 2026-08-23 — Review pass 1（bad_spec loopback）

**觸發發現：** 已實作的機制（`npm run fetch 2>&1 | tee fetch-output.log`，再斷言檔案非空）永遠抓不到它要防的故障。`npm run <script>` 在腳本本體執行前一定會印出自己的 lifecycle banner（形如 `> usj-availability@1.0.0 fetch` / `> ts-node src/fetcher.ts`），不管 `require.main === module` 是否成立、`main()` 有沒有被呼叫都會印。兩個獨立 review 層各自確認了這個問題，並在本機對 `npm run typecheck`（成功時無 stdout 的腳本）重現：不加 `--silent` 仍印出 banner，加了就消失；再對有真實輸出的 `npm run i18n:check` 確認 `--silent` 不會連帶吃掉腳本自己的輸出。

**修改內容：** 修改 `## Code Map` 與 `## Tasks & Acceptance`（皆在 `<intent-contract>` 之外）—— 要求執行 `npm run fetch --silent`（而非裸的 `npm run fetch`）再接 `tee`；並在 `## Design Notes` 補上這個要求的理由與本機重現證據。`<intent-contract>` 本身未修改：其 Approach 文字（「斷言輸出非空」）與 Never 條款（禁止字串比對式斷言）在排除 npm wrapper 自身雜訊之後仍然成立——問題出在「how」的一個規格不足之處（未指定要排除 npm banner），不是「what」本身錯誤。

**避開的已知壞狀態：** 出貨一個不管 `main()` 有沒有真的執行、CI 永遠回報綠燈的檢查，讓人誤以為 DW-12 已解決，而原本「閘門失效導致靜默無作為」的風險完全沒被蓋到。

**KEEP 指示（重新推導時必須保留）：**
- 新驗證步驟緊接在 fetch 步驟之後、`Flag failed products` 之前。
- 驗證步驟用 `if: always()`，讓 BlockedError／catalog 失敗中止路徑一樣被檢查，不只驗證成功路徑。
- `::error::` annotation 的風格與用詞，明確點名 `require.main === module` 閘門。
- 不需要額外釘死 `shell: bash`——GitHub Actions 預設 shell 已含 `pipefail`，檔案內其餘步驟也都沒有另外指定 `shell:`，此處特別加只會破壞既有慣例的一致性（review 中有此建議，已判定 out-of-scope／無實益予以拒絕）。
- 「斷言輸出非空」這個判準本身是對的，不要換成 `grep` 比對特定字串——只需要修正判準的輸入來源（用 `--silent` 排除 npm 自己的 banner），不是判準邏輯本身有問題。

## Review Triage Log

### 2026-08-23 — Review pass
- intent_gap: 0
- bad_spec: 1: (high 1, medium 0, low 0)
- patch: 2: (high 0, medium 0, low 2)
- defer: 1: (high 0, medium 0, low 1)
- reject: 8: (high 0, medium 0, low 8)
- addressed_findings:
  - `[high]` `[bad_spec]` npm 的 lifecycle banner（`> pkg@ver script`）不論 `main()` 是否執行都會印，使「輸出非空」判準恆真、閘門失效偵測不到 —— 修正為要求 `npm run fetch --silent`，已本機重現驗證有效並記入 Spec Change Log。

## Verification

**Commands:**
- `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/fetch.yml','utf8'))"` 或等效的 YAML 解析 -- expected: 不拋出例外，確認修改後的 YAML 語法合法（若專案未安裝 `js-yaml`，改用 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/fetch.yml'))"`）。

**Manual checks (if no CLI):**
- 讀一遍修改後的 `.github/workflows/fetch.yml`：確認新步驟緊接在 `npm run fetch` 之後、`Flag failed products` 之前；確認新步驟 `if: always()`；確認 `npm run fetch` 步驟仍會在失敗時讓 job 步驟回報失敗（`pipefail` 語意），不會被 `tee` 吞掉 exit code。

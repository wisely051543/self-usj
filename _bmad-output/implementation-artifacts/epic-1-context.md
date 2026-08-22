# Epic 1 Context: 法遵護欄與信任揭露 (Compliance Guardrails & Trust Disclosures)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

營運者能在明確速率/並行上限內運作抓取管線、可稽核、可立即停用；快照具備完整格網狀態判定；現有站台立即掛上顯著的非官方聲明、免責聲明，不等待架構重構。此 epic 是資料源存續與法遵急迫性的第一道防線，為後續所有工作提供可信賴的基礎。

## Stories

- Story 1.1: 抓取速率降至 1 req/s 並鎖定常數
- Story 1.2: 禁止抓取回合重疊
- Story 1.3: 請求標頭匿名化
- Story 1.4: 429/5xx 退避與封鎖告警
- Story 1.5: 完整格網快照與狀態判定
- Story 1.6: 快照 Schema 版本控制
- Story 1.7: 分層排程回歸保護
- Story 1.8: Kill Switch 分級開關
- Story 1.9: 對外聯絡窗口
- Story 1.10: 靜默失敗偵測與合理性檢查
- Story 1.11: 私有儲存 repo 分離遷移
- Story 1.12: CI 護欄與 Node 24 升級
- Story 1.13: 現有站台信任揭露文字

## Requirements & Constraints

- 系統為唯讀：不得建立購物車、保留庫存、自動化下單/預約，或涉入轉售。
- 只能從無須通過候位機制（Queue-it）即可存取的端點取得資料，不得繞過或自動化通過候位機制讀取結帳階段庫存；資料源為逆向而來的私有介面，此事實須如實記載，不得只記有利面。
- 對來源主機的持續請求速率須有明確上限、以單一常數集中控制，目標 1 req/秒；單回合請求總量所需時間不得超過排程間隔一半；同時間只允許一個抓取回合執行；逾時上限須大於降速後冷啟動回合預期耗時。
- 抓取須分層排程，昂貴資料以較低頻率取得且由變動偵測驅動，不得每回合重取。
- 請求標頭不得揭露本站網域或站名。
- 遇 429/5xx 須遞增延遲退避；持續封鎖須停止該回合並告警，不得改以其他方式續抓。
- 須具備可立即停用抓取的開關（kill switch），並記錄啟用程序、停抓後的完整處置程序（既有資料處置、頁面是否下架、對外窗口）。
- 須提供可運作的對外聯絡方式（至少一個 email）。
- 現有站台須以顯著方式聲明非官方、與 USJ 無隸屬關係（三語）；標示資料來源與官方商店連結；聲明不販售/不代購/不轉售；顯著免責聲明——資料可能不正確或不即時、不構成保證、風險自負、以官方頁面為準。
- 「更新成功」與「更新正確」是分開量測的兩個指標，不得混為一談。

## Technical Decisions

- 系統分六層（取得→節制→協調→快照→渲染→發佈）；本 epic 落在節制層（`src/limiter.ts`）與協調層（`src/fetcher.ts`）。所有對來源主機的請求必須經 `limiter.ts` 的 `limitedFetch`，任何層不得直接呼叫裸 `fetch`，須由測試/lint 強制。
- 節制常數為互鎖組：`RATE_LIMIT_PER_SEC`、`CONCURRENCY`、cron 間隔、`timeout-minutes`、`STALE_MS`。任一項變更須整組重算並由測試斷言「冷啟動預估耗時 < cron 間隔/2」。當前一致解：`RATE_LIMIT_PER_SEC=1`、`CONCURRENCY=4`（不隨降速調降）、cron `*/30`、`timeout-minutes=25`、`STALE_MS=90分`；測試須斷言 `RATE_LIMIT_PER_SEC<=1`、`MAX_REQUESTS_PER_RUN<=6000`。
- 抓取 workflow 須設定 GitHub Actions `concurrency` 群組，`cancel-in-progress: false`（不得用 `true`，會中斷正在寫入的回合）。
- 協調層須保留完整 (日期×票種) 格網：`available: false` 的日期列不得丟棄；缺席組合須依 `latestDate` 判定售罄或尚未開賣，`latestDate` 為空字串時須顯式判為「未知」，不得回退猜測。狀態由協調層判定一次，下游一律讀取不得自行重推。
- `days.json` 因格網化須將 `schemaVersion` 由 1 升至 2；`index.json` 版號（現行 5）不因此變更，兩者互不相干。下游讀到不認識的 schemaVersion 須中止建置並報錯，不得降級渲染，須有測試覆蓋此路徑。
- 時段層取得範圍須縮減至只夠算出數量；既有三層排程與變動偵測（`slotsAreStale()`、`MAX_SLOT_AGE_MS=6h`、`SLOT_WINDOW_MONTHS=1`）須維持不被回歸破壞並有測試斷言；人數篩選（`MAX_PEOPLE`）明確不恢復。
- kill switch 為帶等級值的宣告檔（非存在性旗標）：L1 停抓（workflow 立即結束，站台續存並標示資料已凍結）、L2 停止服務（三語明示已停止更新）、L3 下架（單一動作自公開發佈面移除）。建置 workflow 須有獨立於抓取的觸發入口（`schedule`/`workflow_dispatch`），使停抓後建置仍執行並讀到最新等級；GitHub UI 停用 workflow 不得作為 L2/L3 唯一手段。
- 合理性檢查：本回合產品數/可購格子數/日期涵蓋範圍相對前一份快照崩塌超出容差時 job 須失敗且資料不得寫入快照，零結果與近零結果一律視為失敗；`budgetExhausted`、資料齡超門檻、推送 PAT 失效同樣須觸發失敗。單一產品失敗不阻斷其餘產品寫入。
- 私有儲存 repo 分離：`data/` 快照須遷至私有、無 workflow 的儲存 repo，以 fine-grained PAT（最小權限）讀寫；此規則向前生效，已公開散佈的歷史 commit 不可收回，任何「已清除」敘述皆不實；公開 repo 既有 `data/` 的處置須明確決定並記錄。
- 須新增 CI workflow，每次 push/PR 執行 `tsc`、單元測試、`i18n:check`，任一未過即失敗。`.node-version` 由 20.17.0（已 EOL）升至 24.x，移除 `ts-node`，`@types/node` 升至 `^24`，測試採 `node:test`（零新依賴）。
- 日期一律 `YYYY-MM-DD` JST 日曆日；時間戳一律 ISO 8601 UTC。`null` 表示「未揭露/本回合未取得」，語意不得與 `0` 混用；狀態未知須以顯式狀態值表示，不得以 `null` 兼任。

## Cross-Story Dependencies

- Story 1.13 的揭露文字為「臨時揭露」，貼於現有 CSR `index.html`；Epic 2 完整頁面骨架上線時，同一 PR 須移除該區塊（由 Epic 2 Story 2.13 執行），新舊揭露文字不得並存超過一個部署週期。
- 系統僅呈現衍生事實、不複製官方敘述文字的要求，不在本 epic 落地，於 Epic 3 Story 3.1 實作。
- 站名/網域不得使用官方標識的要求，不在本輪任何 epic 的 story 範圍內，阻塞於律師書面意見，待取得意見後才有可實作的具體規則。
- Story 1.5（完整格網快照）是 Epic 3 缺席狀態推導與視覺標示、以及渲染層狀態讀取邏輯的資料前提。
- Story 1.6（schemaVersion 升版）與 Story 1.10（合理性檢查）的斷言須整合進 Story 1.12 新增的 CI workflow。
- Story 1.8（kill switch）的 L2 生效依賴建置 workflow 具備獨立於抓取的觸發入口（`schedule`/`workflow_dispatch`）；該建置 workflow 骨架本身屬 Epic 2 範圍，需留意實作順序。

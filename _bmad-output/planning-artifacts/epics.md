---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-usj-2026-08-16/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-usj-2026-08-21/ARCHITECTURE-SPINE.md
---

# usj - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for usj (USJ 通行證庫存看板), decomposing the requirements from the PRD and Architecture Spine into implementable stories. No UX design contract exists for this project — UX requirements section is empty by design.

**Brownfield note**: the site is already live (`wisely051543/self-usj`, public repo, GitHub Pages since 2026-08-15). This breakdown covers PRD phases P0 (compliance guardrails) through P2 (inventory dashboard); P2.9 (AdSense submission) and P3 (ads) depend on external gating events and are out of scope for story generation until their preconditions are met.

## Requirements Inventory

### Functional Requirements

FR1: 系統須在單一畫面呈現「日期 × 票種」的可購狀態矩陣，使用者無須逐一點入即可跨日期、跨票種比較。
FR2: 矩陣須支援兩種閱讀主軸並可由使用者切換：依日期（鎖定某一天，看該天哪些票種還有貨）、依票種（鎖定某一張票，看哪些日期還有貨）。
FR3: 每個格子須呈現該日該票種的可購狀態與剩餘張數（資料來源欄位 `units`）。
FR3.1: 「不可購」狀態須由缺席推導並區分成因（已售罄／尚未開賣／該日不營業或不販售），系統不得將三者一律呈現為「售罄」；至少須能以 `latestDate` 切分已售罄與尚未開賣。
FR4: 剩餘張數低於稀缺門檻時須以視覺方式標示「即將售罄」，門檻初始值 10 張，須為可調整設定值。
FR5: 每個格子須呈現該日該票種的時段數（`slots`），但不展開逐時段明細；`slots` 為 `null` 時須呈現為「未知／尚未取得」，不得呈現為 0 或空白。
FR6: 行動裝置上使用者須能在不進行大幅橫向捲動的前提下完成跨日期或跨票種比較。
FR7: 系統須呈現每張票種的名稱、副標（`eyebrow`）與起始價格（`fromPrice`），不得使用官方圖片。
FR8: 每張票種須可點擊前往其官方販售頁（`url`），於新分頁開啟。
FR9: 系統不處理任何交易、金流或代購行為；購買一律在官方通路完成。
FR10: 系統須提供繁體中文、日文、英文三種語言，三語內容完全一致（相同日期範圍、相同票種集合、相同排序邏輯）。
FR11: 票種與設施名稱須採用 USJ 官方各語言版本的正式名稱，不得自行翻譯。
FR12: 使用者須能明確切換語言，且切換後的語言選擇須在後續造訪時保留。
FR13: 每一種語言須有其獨立且可被索引的 URL，而非共用單一 URL 由用戶端切換。
FR14: 各語言版本之間須以 `hreflang` 互相宣告，並各自宣告 canonical URL。
FR15: 每個可索引頁面須具備該語言的頁面標題與 meta description，且 `<html lang>` 須與該頁語言一致。
FR16: 頁面的核心內容（票種名稱、日期、可購狀態、剩餘量）須能被搜尋引擎在不執行 JavaScript 的前提下讀取。
FR17: 系統須產出 `sitemap.xml`，涵蓋所有語言的可索引頁面。
FR18: 頁面須明確顯示資料的最後更新時間（`updatedAt`）。
FR19: 當資料超過新鮮度門檻仍未更新時，頁面須主動標示資料可能已過期，不得靜默呈現陳舊數字。
FR20: 頁面須標示資料來源為 USJ 官方通路，並聲明本站為非官方服務。
FR21: 頁面須提供機器可讀的結構化資料（JSON-LD），描述票種、價格、可購日期、資料擷取時間，以及本站與 USJ 的非隸屬關係。
FR22: 每個事實陳述須明確標示資料擷取時間與時區，並標示資料來源為 USJ 官方通路。
FR23: `robots.txt` 對各代理的立場須依「它會不會帶回點擊」區分（拒絕訓練/接地型代理；允許會附連結送回流量的答案引擎檢索代理），清單須可維護。
FR24: 各語言版本的 URL 與實體命名須穩定，票種名稱採官方正式名稱，使搜尋引擎能跨語言辨識為同一實體。
FR25: 頁面須具備廣告版位，且不得遮蔽或干擾核心比較操作，尤其在行動裝置上。

### NonFunctional Requirements

NFR1: 系統為唯讀。不得建立購物車、不得保留庫存、不得自動化任何下單或預約流程、不得涉入票券轉售。
NFR2: 系統僅得從無須通過候位機制（Queue-it）即可存取的端點取得資料；不得繞過、預熱或自動化通過候位機制以讀取結帳階段庫存。
NFR2.1: 資料源為逆向而來的私有介面（`comm-api.usj.co.jp` OCC v2），此事實須如實記載。
NFR3: 系統僅儲存與呈現衍生事實（可購狀態、剩餘數量、時間戳記、價格），不複製官方敘述文字。
NFR3.1: 不得使用 USJ 官方圖片，尤其不得熱連結官方圖片 URL；票種呈現改以自製圖示或純文字。
NFR3.2: 站名、網域與品牌識別不得使用「USJ」「Universal Studios Japan」「ユニバーサル」等標識作為主要識別，亦不得使用官方標誌與識別色。
NFR4: 對來源主機的持續請求速率須有明確上限，並在程式碼中以單一常數集中控制。目標值：1 request/秒，並行度 2（現況並行度暫維持 4，見架構 AD-4 互鎖組）。
NFR5: 單回合的請求總量，須使該回合以 NFR4 的速率跑完所需的時間不超過排程間隔的一半；速率與總量須共同約束。
NFR5.1: 同一時間只允許一個抓取回合執行，排程間隔內未跑完的回合不得與下一回合並行。
NFR5.2: 工作流程的逾時上限須大於降速後冷啟動回合的預期耗時。
NFR6: 抓取須分層排程，昂貴的資料以較低頻率取得，且昂貴層須由變動偵測驅動而非每回合重取。
NFR7: 請求標頭不得揭露本站網域或站名。
NFR8: 遇到 429 或 5xx 須以遞增延遲退避；遇到持續封鎖須停止該回合並告警，不得改以其他方式續抓。
NFR9: 系統須具備可立即停用抓取的開關（kill switch），並記錄啟用程序。
NFR9.1: kill switch 須定義「停止抓取之後」的完整程序：既有歷史資料的處置、頁面是否下架、對外窗口。
NFR9.2: 頁面須提供可運作的對外聯絡方式（至少一個電子郵件位址）。
NFR10: 頁面呈現的資料須附帶其實際擷取時間；「更新成功」與「更新正確」須分別量測。
NFR11: 抓取回合失敗時，系統須繼續提供上一份成功資料並明確標示其時間，不得呈現空白頁或靜默呈現陳舊數字。
NFR12: 資料呈現須反映「售完不是終局」這項事實，頁面至少不得暗示售完為永久狀態。
NFR13: 頁面須以顯著方式聲明本站為非官方服務、與 USJ 無隸屬關係（三語皆須）。
NFR14: 頁面須標示資料來源與擷取時間，並提供前往 USJ 官方商店的明顯連結。
NFR15: 頁面須聲明本站不販售、不代購、不轉售票券。
NFR15.1: 頁面須有顯著免責聲明：資料可能不正確或不即時、不構成任何保證、依此作成決定風險自負、一切以 USJ 官方頁面為準（三語皆須）。
NFR15.2: 須提供隱私權政策頁。
NFR15.3: 須確認是否落入日本電気通信事業法「外部送信規律」，並在落入時設置外部送信情報的通知或公表頁面。
NFR15.4: 若投放廣告且可能有 EEA／UK 流量，須依廣告方案要求採用經認證的同意管理平台（CMP）。
NFR16: 核心比較操作在小螢幕上須可完成，且不得依賴橫向捲動。
NFR17: 頁面須通過行動裝置可用性基本要求：可點擊目標大小足夠、字級不需縮放即可閱讀、內容不溢出視窗寬度、不使用干擾性插頁廣告。
NFR18: 頁面須符合 Core Web Vitals 的「良好」門檻（LCP、INP、CLS），以行動裝置實測為準；廣告版位不得造成版面位移。
NFR19: 核心內容不得依賴 JavaScript 執行才能被讀取。

### Additional Requirements

以下為 Architecture Spine 之技術決策，影響 Epic／Story 切分（本專案為棕地遷移，非綠地起始模板）：

- **架構分層**：抓取管線與靜態站台須依「取得層 → 節制層 → 協調層 → 快照層 → 渲染層 → 發佈層」六層分層落地（AD 全部）；渲染層與快照層之間、渲染層與來源之間有明文禁止的依賴方向。
- **儲存分離（AD-5）**：`data/` 快照須遷移至私有、無 workflow 的儲存 repo；公開 repo 僅存程式碼、workflow 與建置產物。此為 P1 前置的遷移工作，屬 Deferred 項但為上線必要條件。
- **雙 workflow 解耦（AD-6）**：抓取（`fetch.yml`）與建置（`build.yml`）須為兩條獨立 workflow，以 `workflow_run` 銜接，並各自具備 `schedule`／`workflow_dispatch` 獨立入口。
- **單一外送閘門（AD-3）**：所有對來源主機的 HTTP 請求須經 `src/limiter.ts` 的 `limitedFetch`，以測試強制禁止裸 `fetch(`。
- **節制常數互鎖組（AD-4）**：`RATE_LIMIT_PER_SEC`、`CONCURRENCY`、cron 間隔、`timeout-minutes`、`STALE_MS` 為互鎖組，任一項變更須整組重算並由測試斷言。
- **格網化與狀態判定（AD-12、AD-13）**：`days.json` 須升版為完整 (日期 × 票種) 格網，協調層一次判定狀態，渲染層不得自行從缺席推論；不確定時顯式標為「未知」。
- **公開面零批次資料（AD-9）**：發佈方式須為單一 orphan 分支強制覆寫；不得發佈任何可批次消費的資料檔（含 JSON-LD 之外的資料）。
- **零 runtime 資料 fetch（AD-8）**：頁面所需資料事實須於建置時 bake 進 HTML，不得於執行期向 `products/*.json` 或任何資料端點發請求。
- **零來源請求（AD-7）**：已發佈頁面不得對 `usj.co.jp` 任一主機發出請求（含圖片熱連結）。
- **兩軸各自獨立 URL（AD-11）**：「依日期」與「依票種」須於建置時各自產出獨立可索引 URL，JS 僅用於升級為無重載切換。
- **頁面產生器參數化（AD-10）**：渲染核心以 `(locale, 視角, 鍵)` 參數化，不得為個別頁面寫死渲染路徑。
- **kill switch 分級（AD-15）**：帶等級值的宣告檔（L1 停抓／L2 停止服務／L3 下架），抓取與建置 workflow 皆須讀取同一檔案。
- **失敗邊界與合理性檢查（AD-16）**：須偵測「什麼都沒抓到」等靜默失敗場景（來源改 schema、空陣列等），觸發時 job 須失敗且不得寫入快照。
- **兩字串預算分離（AD-18）**：頁面文案（`i18n/ui.<locale>.json`，全有全無）與廠商字串（`i18n/terms.<locale>.json`，允許不完整）須以不同規則檢查；`.claude/skills/localizing/SKILL.md` 須同步更新。
- **SEO／揭露驗證腳本（AD-19）**：建置後須執行驗證腳本，涵蓋 canonical、hreflang 對稱性、sitemap 完整性、`<html lang>` 一致性、揭露頁存在性，失敗時中止發佈。
- **來源層 ports-and-adapters（AD-20）**：每個票務平台實作 `src/types.ts` 的 `Source` 介面。
- **無消費者的抓取須關閉（AD-21）**：時段層取得範圍須縮減至只夠算出數量（因 FR5 不展開明細、AD-8 不消費 `timeSlots`）。
- **CI 為發佈前提（AD-22）**：須新增 CI workflow，於每次 push/PR 執行 `tsc`、單元測試、`i18n:check`；建置 workflow 部署前須執行 AD-19 驗證。
- **技術堆疊升級**：Node.js 20.17.0（已 EOL 2026-04-30）須升級至 24.x；移除 `ts-node`；測試採 `node:test`（零新依賴）。
- **Deferred（不在本輪 Story 範圍，但架構已預留）**：人數篩選功能移除（AD-21，需 PM 確認）、每票種／每月頁面（AD-10 已保留擴充路徑，P1 上線 + 3 個月數據後重訪）、廣告版位詳規（P3）、Core Web Vitals 具體門檻數值（採 Google 當期公告值）。

### UX Design Requirements

（無 UX 設計文件；本專案不適用此區塊。）

### FR Coverage Map

FR1-9, FR3.1: Epic 3 — 矩陣核心
FR10-17: Epic 2 — 多語與 SEO 基礎、獨立揭露頁
FR18-20: Epic 3 — 資料透明度（黏在矩陣頁）
FR21-24: Epic 2 — 機器可讀性與代理立場
FR25: Epic 4 — 廣告

## Epic List

### Epic 1: 法遵護欄與信任揭露 (Compliance Guardrails & Trust Disclosures)
營運者能在明確速率/並行上限內運作抓取管線、可稽核、可立即停用；快照具備完整格網狀態判定；現有站台立即掛上顯著的非官方聲明、免責聲明，不等待架構重構。此 epic 是資料源存續與法遵急迫性的第一道防線，為後續所有工作提供可信賴的基礎。
**FRs covered:** （無直接 FR，為 FR3.1 的資料前提）
**NFRs covered:** NFR1, NFR2, NFR2.1, NFR3.1, NFR4, NFR5, NFR5.1, NFR5.2, NFR6, NFR7, NFR8, NFR9, NFR9.1, NFR9.2, NFR13, NFR14, NFR15, NFR15.1
**Implementation notes:** NFR13/14/15/15.1（非官方聲明、資料來源標示、免責聲明）以 story 直接貼於現有 CSR `index.html`，不等 Epic 2 的 SSG 重構；Epic 2 上線時須同一 PR 移除舊揭露文字區塊，不得與新頁面並存超過一個部署週期（cutover 風險，party mode 決議）。NFR3（僅呈現衍生事實）於 Epic 3 Story 3.1 落地。**NFR3.2（站名/網域不得用官方標識）不在本輪任何 epic 的 story 範圍內**——阻塞於律師書面意見（PRD O2、Deferred「網域名稱與營運主體形態」），待取得意見後才有可實作的具體規則，不得先斬後奏自行決定。

### Epic 2: 靜態多語 SEO 基礎與獨立揭露頁 (Static Multi-Language SEO Foundation & Standalone Disclosure Pages)
使用者可用三語瀏覽獨立、可索引的頁面；隱私權政策與外部送信情報頁存在且可索引；核心內容不需 JS 即可讀取；答案引擎代理依政策放行/拒絕。
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR21, FR22, FR23, FR24
**NFRs covered:** NFR15.2, NFR15.3, NFR15.4, NFR19
**Implementation notes:** 含 cutover story——上線同時移除 Epic 1 貼在舊頁面上的揭露文字，避免新舊版本並存衝突。**Epic 獨立性說明**：Story 2.5 要求核心資料（票種名稱、日期、可購狀態、剩餘量）零 JS 可讀，但這只要求「原始欄位值被 bake 進 HTML」，不要求 Epic 3 的稀缺門檻標示、四態視覺樣式、行動版面等呈現邏輯——Epic 2 完成時即產出一個資料真實、可索引、但呈現較樸素的站台，本身已解決核心痛點（看得到剩餘量），Epic 3 在同一組頁面上疊加使用體驗，不是 Epic 2 可用性的前提。

### Epic 3: 庫存比較矩陣 (Inventory Comparison Dashboard)
使用者在一個畫面看完跨日期×跨票種可購狀態與剩餘量、資料新鮮度一目了然，行動裝置可用，可導流至官方購買頁。
**FRs covered:** FR1, FR2, FR3, FR3.1, FR4, FR5, FR6, FR7, FR8, FR9, FR18, FR19, FR20
**NFRs covered:** NFR3, NFR10, NFR11, NFR12, NFR16, NFR17, NFR18

### Epic 4: 廣告版位 (Ad Placement)
站台具備不遮蔽核心操作的廣告版位，變現廣告收入。
**FRs covered:** FR25
⚠️ 依賴 P2.9 AdSense 過審（外部審核，非本輪工程可控）——story 建立時會標註此依賴。

## Epic 1: 法遵護欄與信任揭露 (Compliance Guardrails & Trust Disclosures)

營運者能在明確速率/並行上限內運作抓取管線、可稽核、可立即停用；快照具備完整格網狀態判定；現有站台立即掛上顯著的非官方聲明、免責聲明，不等待架構重構。此 epic 是資料源存續與法遵急迫性的第一道防線，為後續所有工作提供可信賴的基礎。

### Story 1.1: 抓取速率降至 1 req/s 並鎖定常數

As a 營運者,
I want 抓取速率被限制在安全上限並以測試強制,
So that 降低被來源防護機制判定為異常流量、留下可稽核的自我節制紀錄。

**Acceptance Criteria:**

**Given** `src/limiter.ts` 現有 `RATE_LIMIT_PER_SEC = 5`
**When** 改為具名匯出常數 `RATE_LIMIT_PER_SEC = 1`
**Then** 抓取回合有效請求速率不超過 1 req/s（NFR4）
**And** `src/limits.test.ts` 斷言 `RATE_LIMIT_PER_SEC <= 1`、`MAX_REQUESTS_PER_RUN <= 6000`，斷言失敗即 CI 失敗（AD-4）
**And** `CONCURRENCY` 維持既有值 4，不隨此變更調降（AD-4 現行一致解）
**And** cron 間隔（`*/30`）、`timeout-minutes`（25）、`STALE_MS`（90分）皆不因此變更；單回合請求總量所需時間仍不超過排程間隔的一半（互鎖組現行解未觸發重算）（NFR5, NFR5.2）
**And** 抓取端點須持續為未轉向候位機制（`nbcuniversal.queue-it.net`）的端點；若來源端點日後變更，須先確認未被轉向候位機制才可繼續使用（NFR2, AD-2）
**And** 該端點（`comm-api.usj.co.jp/occ/v2/b2cportal`）為逆向而來的私有介面（無公開文件、無 API 條款、無金鑰）此事實須於程式碼註解或技術文件中如實記載，不得僅記載為有利事實（NFR2.1）

### Story 1.2: 禁止抓取回合重疊

As a 營運者,
I want 同一時間只有一個抓取回合執行,
So that 避免重疊抓取造成請求量倍增與資料寫入衝突。

**Acceptance Criteria:**

**Given** `.github/workflows/fetch.yml` 現無 `concurrency` 群組設定
**When** 新增 workflow-level `concurrency`（group 綁定 workflow 名稱，`cancel-in-progress: false`）
**Then** 上一回合未完成時，新排程觸發須排隊等待而非並行執行（NFR5.1）
**And** 不得使用 `cancel-in-progress: true`（會中斷正在寫入的回合，與 NFR11 資料完整性衝突）

### Story 1.3: 請求標頭匿名化

As a 營運者,
I want 對外請求標頭不揭露本站網域或站名,
So that 降低被來源方直接定位到本站的機率。

**Acceptance Criteria:**

**Given** 現有抓取請求標頭設定
**When** 檢查並移除任何含本站網域、站名的識別字串
**Then** 所有經 `limitedFetch` 送出的請求不含可辨識本站身分的字串
**And** NFR7 決定不揭露身分；中性 bot 識別+聯絡信箱為可延後項（O5），本 story 不含

### Story 1.4: 429/5xx 退避與封鎖告警

As a 營運者,
I want 遇到 429/5xx 時自動退避、持續封鎖時停止並告警,
So that 不對受防護來源產生持續無效請求，且能第一時間知道被封鎖。

**Acceptance Criteria:**

**Given** 抓取請求收到 429 或 5xx
**When** 重試
**Then** 重試延遲須遞增（exponential backoff）
**Given** 退避後仍連續收到封鎖回應
**When** 判定為持續封鎖
**Then** 該回合須立即停止，不得改以其他方式續抓（NFR8）
**And** job 須以非 0 exit code 結束，觸發 GitHub Actions 內建失敗通知（AD-16 #1）

### Story 1.5: 完整格網快照與狀態判定

As a 使用者,
I want 每個(日期×票種)組合都有明確狀態,
So that 系統不會把「沒資料」誤導成「售罄」。

**Acceptance Criteria:**

**Given** 來源回應同時含 `available: true` 與 `available: false` 的日期列
**When** 協調層 `buildDays()` 處理
**Then** `available: false` 列須被保留寫入快照，不得如現況丟棄（AD-12）
**Given** 值域內某(日期×票種)在回應中完全缺席
**When** 協調層判定該格狀態
**Then** 須依 `latestDate` 判定為「已售罄」或「尚未開賣」，不得留白或預設售罄
**Given** 該票種 `latestDate` 為空字串
**When** 協調層判定
**Then** 該格須顯式判為「未知」，不得回退為售罄或不營業（AD-13, FR3.1 資料基礎）

### Story 1.6: 快照 Schema 版本控制

As a 開發者,
I want `days.json` 的格網化變更以 schemaVersion 明確升版，下游對未識別版本嚴格拒絕,
So that 協調層與渲染層對同一份檔案的理解不會無聲分歧，渲染出語意錯誤但看似正常的頁面。

**Acceptance Criteria:**

**Given** Story 1.5 完成後 `days.json` 的結構因格網化而改變（每個組合皆有明確狀態列，而非只有可購的）
**When** 寫入新結構的快照
**Then** `days.json` 的 `schemaVersion` 須由現行 1 升版至 2（AD-14）
**And** `index.json` 的 `schemaVersion`（現行 5）不因此變更，兩者版號互不相干，不得因數字相同而共用判斷邏輯
**Given** 渲染層或任何下游消費者讀取 `days.json`
**When** 讀到的 `schemaVersion` 不是消費者程式碼認識的版本
**Then** 建置須立即中止並報錯，不得降級渲染或以預設值靜默帶過
**And** 須有測試涵蓋「讀到未知 schemaVersion 時建置失敗」這條路徑，不能只靠人工檢查

### Story 1.7: 分層排程回歸保護

As a 營運者,
I want 時段層抓取「無消費者即收斂」且有測試防回歸,
So that 不對來源產生無人使用的多餘負載。

**Acceptance Criteria:**

**Given** FR5 只要求時段數量、AD-8 使站台不再消費 `timeSlots` 明細
**When** 檢視現行時段層取得邏輯
**Then** 取得範圍須縮減至只夠算出數量，或確認無消費者後停止取得
**And** 既有三層排程與變動偵測條件（`slotsAreStale()`、`MAX_SLOT_AGE_MS=6h`、`SLOT_WINDOW_MONTHS=1`）須維持不被回歸破壞，並有測試斷言（NFR6）
**And** `MAX_PEOPLE` 人數篩選明確不在本 story 恢復範圍

### Story 1.8: Kill Switch 分級開關

As a 營運者,
I want 帶等級值的宣告檔可立即降級或停止站台,
So that 收到 USJ 任何聯繫時能於當日回應。

**Acceptance Criteria:**

**Given** 新增 `KILLSWITCH` 宣告檔（帶等級值，非存在性旗標）（NFR9）
**When** 設為 L1
**Then** 抓取 workflow 立即結束不執行任何請求；站台續存並顯著標示資料已凍結及其時間
**Given** 設為 L2
**When** 建置 workflow 讀取
**Then** 站台明示已停止更新服務（三語）
**Given** 設為 L3
**When** 執行對應程序
**Then** 可透過移除發佈分支或關閉 Pages，公開 repo 單一動作達成下架
**And** 建置 workflow 須有獨立於抓取的觸發入口（`schedule`/`workflow_dispatch`），使停抓後建置仍執行並讀到最新等級（AD-6, AD-15）
**And** GitHub UI 停用 workflow 不得作為 L2/L3 唯一手段
**And** L2/L3 的完整程序（既有歷史資料處置、頁面是否下架、對外窗口）須一併書面記載（NFR9.1）

### Story 1.9: 對外聯絡窗口

As a 使用者／權利人,
I want 頁面上有可運作的聯絡方式,
So that 我能直接聯繫營運者而非只能向註冊商/主機商申訴。

**Acceptance Criteria:**

**Given** 頁面尚無對外聯絡方式
**When** 新增至少一個可運作 email（三語皆可見位置）
**Then** 須顯著呈現，非埋藏深層頁面（NFR9.2）
**And** 聯絡窗口程序（誰接、多久回覆）須另行書面記載（非頁面顯示內容）

### Story 1.10: 靜默失敗偵測與合理性檢查

As a 營運者,
I want 系統偵測「什麼都沒抓到」時讓 job 失敗,
So that 不會靜默發佈全站錯誤資料。

**Acceptance Criteria:**

**Given** 本回合產品數/可購格子數/日期涵蓋範圍相對前一份快照崩塌超出容差
**When** 執行合理性檢查
**Then** job 須失敗，資料不得寫入快照；零結果與近零結果一律視為失敗（AD-16 #6）
**Given** `budgetExhausted` 觸發、資料齡超過門檻、或推送 PAT 失效
**When** 對應偵測觸發
**Then** job 亦須失敗（AD-16 #2/#4/#5）
**And** 單一產品失敗不阻斷其餘產品寫入（既有設計維持）
**And** 容差門檻精確值列入 PRD O6，先以既有近似值起手，不阻塞本 story

### Story 1.11: 私有儲存 repo 分離遷移

As a 營運者,
I want data/ 快照遷至私有無 workflow 儲存 repo,
So that 抓取快照不進入公開發佈面，且既有歷史處置有明確落點。

**Acceptance Criteria:**

**Given** 現況 `data/` 位於公開 repo
**When** 建立私有儲存 repo，設定 fine-grained PAT（最小權限）
**Then** 抓取 workflow 改用該 PAT 讀寫私有 repo `data/`；建置 workflow 改用 PAT 讀取
**And** 公開 repo 既有 `data/` 處置（保留或歷史改寫）須明確決定並記錄
**And** 須記載此規則向前生效——已公開散佈的 commit 歷史不可收回，任何「已清除」敘述皆為不實（AD-5）

### Story 1.12: CI 護欄與 Node 24 升級

As a 開發者,
I want 每次 push/PR 自動執行型別檢查、測試與 i18n 檢查,
So that 測試強制的規則真正被執行。

**Acceptance Criteria:**

**Given** repo 現況無測試、無 `test` script、無執行 `tsc` 的 workflow
**When** 新增 `.github/workflows/ci.yml`
**Then** 每次 push/PR 執行 `tsc`、單元測試（含 1.1/1.5/1.6 的斷言）、`i18n:check`，任一未過即 CI 失敗
**Given** `.node-version` 現為 20.17.0（已 EOL）
**When** 升級
**Then** 改為 24.x，移除 `ts-node`，`@types/node` 升至 `^24`

### Story 1.13: 現有站台信任揭露文字

As a 使用者,
I want 現有站台立即顯示非官方、免責聲明等揭露文字,
So that 我在下單決定前就知道本站定位與風險。

**Acceptance Criteria:**

**Given** 現有 `index.html` 尚無揭露文字區塊
**When** 新增顯著揭露區塊（頁尾或顯眼處）
**Then** 三語呈現「非官方服務、與 USJ 無隸屬關係」（NFR13）
**And** 標示資料來源為官方通路並提供官方商店連結（NFR14）
**And** 聲明不販售/不代購/不轉售（NFR15）
**And** 顯著免責聲明：資料可能不正確或不即時、不構成保證、風險自負、以官方頁面為準（NFR15.1）
**And** 此區塊標記「臨時揭露」，Epic 2 上線同一 PR 須移除，不得與新頁面並存超過一個部署週期

## Epic 2: 靜態多語 SEO 基礎與獨立揭露頁 (Static Multi-Language SEO Foundation & Standalone Disclosure Pages)

使用者可用三語瀏覽獨立、可索引的頁面；隱私權政策與外部送信情報頁存在且可索引；核心內容不需 JS 即可讀取；答案引擎代理依政策放行/拒絕。

### Story 2.1: Node 24 SSG 建置管線骨架

As a 開發者,
I want 以 (locale, 視角, 鍵) 參數化的靜態頁面產生器,
So that 新增語言/視角只需多餵參數，不必為個別頁面寫死渲染路徑。

**Acceptance Criteria:**

**Given** 現況 `index.html` 為單一 URL 用戶端渲染頁（55KB, 44KB inline script, 資料瀏覽器端 fetch）
**When** 建立 `src/site/generate.ts` 渲染核心
**Then** 渲染核心以 `(locale, 視角, 鍵)` 參數產出頁面，不得為個別頁面寫死渲染路徑（AD-10）
**And** 頁面所需資料事實須於建置時 bake 進 HTML，不得執行期 fetch 任何資料檔（AD-8）
**And** 已發佈頁面不得對 `usj.co.jp` 任一主機發出請求，含圖片熱連結（AD-7）
**And** 渲染層只讀 `days.json` 與 `index.json`（AD-8）

### Story 2.2: 雙軸獨立可索引 URL

As a 使用者,
I want 「依日期」與「依票種」各自有獨立 URL,
So that 我可以分享、加書籤特定視角。

**Acceptance Criteria:**

**Given** FR2 要求矩陣支援兩種閱讀主軸並可切換
**When** 以 2.1 的產生器分別產出兩視角頁面
**Then** 兩視角於建置時各自產出獨立、可索引的 URL，切換即導航（AD-11）
**And** JS 僅在可用時升級為無重載切換，不得成為切換前提
**And** 可索引頁集合 = 3語×2視角 + 每語揭露頁組，確切頁數由產生器實際輸出決定，不得以寫死數字為準

### Story 2.3: 三語 hreflang/canonical/meta

As a 使用者,
I want 每頁有正確語言標題、meta description 與跨語言宣告,
So that 我在搜尋結果找到自己語言版本。

**Acceptance Criteria:**

**Given** 每個可索引頁面
**When** 產生器輸出該頁
**Then** 該語言頁面標題與 meta description 須存在，`<html lang>` 與該頁語言一致（FR15）
**And** 同視角三語版本以 `hreflang` 互相宣告、各自宣告 canonical URL；hreflang 只在同視角語言間宣告，視角之間不互指（FR14, AD-19）

### Story 2.4: sitemap.xml 產出

As a 搜尋引擎,
I want sitemap.xml 涵蓋所有語言可索引頁面,
So that 能完整發現並索引本站內容。

**Acceptance Criteria:**

**Given** 建置產出的頁集合
**When** 產出 `sitemap.xml`
**Then** 須恰好涵蓋輸出中所有可索引頁，無遺漏亦無不存在的項（FR17, AD-19）

### Story 2.5: 核心內容零 JS 可讀

As a 爬蟲（搜尋引擎/生成式引擎）,
I want 票種名稱、日期、可購狀態、剩餘量在不執行 JS 前提下可讀,
So that 不執行 JS 的爬蟲也能索引核心內容。

**Acceptance Criteria:**

**Given** 2.1 的建置時 bake 機制
**When** 停用 JavaScript 檢視已發佈頁面
**Then** 票種名稱、日期、可購狀態、剩餘量須完整呈現於 HTML（FR16, NFR19）

### Story 2.6: JSON-LD 結構化資料

As a Google 複合式搜尋結果,
I want 每頁具機器可讀結構化資料,
So that 能正確理解票種、價格、可購日期與本站定位。

**Acceptance Criteria:**

**Given** 每個可索引頁面
**When** 產出 JSON-LD
**Then** 至少描述票種為何物、價格、可購日期、資料擷取時間、本站與 USJ 非隸屬關係（FR21）
**And** 每個事實陳述須標示資料擷取時間與時區、資料來源為 USJ 官方通路（FR22）

### Story 2.7: robots.txt 代理立場清單

As a 營運者,
I want robots.txt 依「是否帶回點擊」區分代理立場,
So that 拒絕訓練型代理、放行會送流量回本站的答案引擎。

**Acceptance Criteria:**

**Given** FR23 立場表（拒絕：GPTBot/ClaudeBot/anthropic-ai/Google-Extended/CCBot/Bytespider/Applebot-Extended/meta-externalagent；允許：OAI-SearchBot/ChatGPT-User/PerplexityBot）
**When** 產出 `robots.txt`
**Then** 清單依此立場區分，結構可維護，新代理出現時可追加不需重構
**And** 一般索引用途爬蟲（Googlebot 等）不受此清單限制

### Story 2.8: 跨語言實體命名穩定性

As a 搜尋引擎,
I want 各語言版本 URL 與命名穩定,
So that 能跨語言辨識為同一實體。

**Acceptance Criteria:**

**Given** 票種名稱採用 FR11 官方正式名稱
**When** 產出各語言頁面
**Then** 各語言版本 URL 與實體命名須穩定，不因後續建置改變既有 URL 結構（FR24）

### Story 2.9: 隱私權政策頁

As a 使用者,
I want 每語都有隱私權政策頁,
So that 我了解本站如何處理我的資料。

**Acceptance Criteria:**

**Given** FR12 要求用戶端儲存語言選擇，加上廣告 cookie 與第三方追蹤
**When** 產出隱私權政策頁
**Then** 須為每語一頁、可索引，符合 2.3 的 hreflang/canonical 規則（NFR15.2, AD-11）
**And** 須被連結到，並通過 AD-19 驗證存在性

### Story 2.10: 外部送信情報揭露頁

As a 日本使用者,
I want 外部送信情報的通知或公表頁面,
So that 我知道本站有向第三方傳送我的終端資訊。

**Acceptance Criteria:**

**Given** 本站對日本使用者提供資訊並置入第三方廣告代碼
**When** 判定落入電気通信事業法「外部送信規律」第四類型
**Then** 產出每語一頁的外部送信情報通知/公表頁（NFR15.3）
**And** 頁面須被連結到，並通過 AD-19 驗證存在性

### Story 2.11: 同意管理平台 (CMP)

As a EEA/UK 使用者,
I want 網站在載入任何廣告或追蹤腳本前先徵得我的同意,
So that 我的同意選擇在廣告開始投放之前就已受尊重。

**Acceptance Criteria:**

**Given** FR10 提供英文版即面向非日/台使用者，可能有 EEA/UK 流量
**When** 使用者以 EEA/UK 地區身分（或無法排除該身分）造訪頁面
**Then** 系統須先載入經認證的同意管理平台（CMP）並顯示同意彈窗，預設狀態為「未同意/拒絕」，直到使用者主動同意（NFR15.4）
**And** 在使用者拒絕或尚未回應同意前，頁面不得載入任何第三方廣告或追蹤腳本——此行為須可獨立測試（例如：檢查該情境下無對應第三方網域的請求發出），不依賴 Epic 4 的廣告版位是否已上線
**And** CMP 的同意狀態須可被程式讀取並公開一個查詢介面，供未來 Epic 4 的廣告腳本查詢
**And** 本 story 的驗收獨立於 Epic 4；Epic 4 Story 4.1 上線時只需查詢既有同意狀態，不需重新整合 CMP

### Story 2.12: 建置後 SEO/揭露驗證腳本

As a 開發者,
I want 建置後自動驗證 SEO 與揭露正確性,
So that hreflang/canonical/sitemap 錯誤在發佈前被攔截，而非靜默流失流量。

**Acceptance Criteria:**

**Given** 2.1-2.11 的頁面產出
**When** 執行 `src/site/verify.ts`
**Then** 檢查對象為產生器實際輸出的頁集合，至少涵蓋：每頁具 canonical；同視角三語 hreflang 三向互指且對稱；sitemap.xml 恰好涵蓋輸出中所有可索引頁；`<html lang>` 與該頁內容語言一致；每語揭露頁組（NFR13~15.1）、隱私權政策（NFR15.2）與外部送信情報頁（NFR15.3）皆存在且被連結（AD-19）
**And** 驗證失敗時建置 workflow 須中止發佈

### Story 2.13: 舊站台揭露文字下架 (cutover)

As a 使用者,
I want 新舊揭露文字不並存造成內容矛盾,
So that 我看到的揭露資訊一致、最新。

**Acceptance Criteria:**

**Given** Epic 1 Story 1.13 已在舊 `index.html` 貼上臨時揭露文字
**When** 本 story（Epic 2 完整頁面骨架）部署上線
**Then** 舊頁面的臨時揭露文字區塊須於同一 PR 移除
**And** 新舊揭露文字不得並存超過一個部署週期
**And** 部署後須人工確認舊 URL（若仍存在）正確導向新頁面或明確標示已停用

## Epic 3: 庫存比較矩陣 (Inventory Comparison Dashboard)

使用者在一個畫面看完跨日期×跨票種可購狀態與剩餘量、資料新鮮度一目了然，行動裝置可用，可導流至官方購買頁。

### Story 3.1: 矩陣核心呈現

As a 使用者,
I want 在單一畫面看到日期×票種可購狀態矩陣,
So that 不用逐一點入就能跨日期跨票種比較。

**Acceptance Criteria:**

**Given** 已建置的矩陣頁（Epic2 Story2.2 的獨立 URL 骨架）
**When** 頁面渲染
**Then** 須呈現「日期×票種」矩陣，每格顯示該日該票種可購狀態與剩餘張數 `units`（FR1, FR3）
**And** 每張票種須呈現名稱、副標`eyebrow`、起始價格`fromPrice`，不得使用官方圖片，以自製圖示或純文字識別（FR7, NFR3.1）
**And** 系統不得建立購物車、不得保留庫存、不得自動化任何下單流程；矩陣頁不處理任何交易或金流，購買一律導向官方通路完成（FR9, NFR1）
**And** 頁面僅儲存與呈現衍生事實（可購狀態、剩餘數量、時間戳記、價格），不得複製官方的敘述文字（NFR3）

### Story 3.2: 缺席狀態推導與視覺標示

As a 使用者,
I want 系統正確區分售罄/尚未開賣/不營業/未知,
So that 我不會被誤導「沒資料=售罄」而放棄本可購買的日期。

**Acceptance Criteria:**

**Given** Epic1 Story1.5 已產出完整格網快照，每格帶明確狀態
**When** 矩陣頁渲染該格
**Then** 渲染層須直接讀取協調層判定的狀態，不得自行從缺席推論（AD-12）
**And** 「未知」狀態須以顯式視覺區分，並連向官方頁，不得暗示售完為永久狀態（AD-13, NFR12）
**And** 四種狀態（可購/售罄/尚未開賣/不營業/未知）須有各自可辨識視覺樣式，不得混用（FR3.1）

### Story 3.3: 稀缺門檻標示

As a 使用者,
I want 剩餘張數低於門檻時看到「即將售罄」標示,
So that 我能判斷該現在下手還是可以再等。

**Acceptance Criteria:**

**Given** 某格可購狀態且剩餘張數（`units`）已知
**When** 剩餘張數低於稀缺門檻（初始值10）
**Then** 該格須以視覺方式標示「即將售罄」
**And** 門檻值須為可調整設定值，不得寫死於版面邏輯（FR4）

### Story 3.4: 時段數呈現

As a 使用者,
I want 看到該日該票種的時段數,
So that 我知道還有多少時段選擇，但不需要展開明細。

**Acceptance Criteria:**

**Given** 該格的 `slots` 欄位為數字
**When** 渲染該格
**Then** 須呈現時段數，不展開逐時段明細（FR5）
**Given** `slots` 為 `null`（該日時段尚未抓取，落在滾動窗外）
**When** 渲染該格
**Then** 須呈現為「未知/尚未取得」，不得呈現為0或空白（FR5）

### Story 3.5: 行動裝置無橫捲比較

As a 行動裝置使用者,
I want 在不大幅橫向捲動的前提下完成跨日期或跨票種比較,
So that 我能在手機上順暢比價。

**Acceptance Criteria:**

**Given** 矩陣頁在行動裝置寬度下渲染
**When** 使用者比較跨日期或跨票種資料
**Then** 核心比較操作不得依賴橫向捲動（FR6, NFR16）
**And** 可點擊目標大小須足夠、字級不需縮放即可閱讀、內容不溢出視窗寬度、不使用干擾性插頁廣告（NFR17）

### Story 3.6: 官方購買頁導流

As a 使用者,
I want 點擊票種能前往官方販售頁,
So that 我能直接完成購買。

**Acceptance Criteria:**

**Given** 某票種的官方販售頁 URL（`url`）
**When** 使用者點擊該票種
**Then** 須於新分頁開啟該官方頁面（FR8）
**And** 系統不處理任何交易、金流或代購行為（FR9）

### Story 3.7: 資料新鮮度與過期標示

As a 使用者,
I want 看到資料最後更新時間，並在資料過期時被提醒,
So that 我能判斷所見資訊的可信度。

**Acceptance Criteria:**

**Given** 頁面資料的 `updatedAt`
**When** 頁面渲染
**Then** 須明確顯示資料最後更新時間（FR18）
**Given** 資料超過新鮮度門檻（庫存摘要≤1小時；時段明細≤6小時）仍未更新
**When** 頁面渲染
**Then** 須主動標示資料可能已過期，不得靜默呈現陳舊數字（FR19, NFR10）

### Story 3.8: 抓取失敗降級呈現

As a 使用者,
I want 抓取失敗時仍能看到上一份成功資料並知道其時間,
So that 我不會看到空白頁或被誤導的即時資料。

**Acceptance Criteria:**

**Given** 抓取回合失敗（依 Epic1 Story1.10 的合理性檢查判定）
**When** 建置/渲染頁面
**Then** 系統須繼續提供上一份成功資料，並明確標示其實際擷取時間（NFR11）
**And** 不得呈現空白頁

### Story 3.9: 售罄非終局呈現

As a 使用者,
I want 頁面不暗示售完是永久狀態,
So that 我知道之後可能補貨，不會直接放棄行程規劃。

**Acceptance Criteria:**

**Given** 某格狀態為「售罄」
**When** 渲染該格
**Then** 呈現方式不得暗示該狀態為永久，措辭與視覺不得使用「永久售完」等絕對用語（NFR12）

### Story 3.10: 資料來源與非官方聲明（矩陣頁）

As a 使用者,
I want 矩陣頁本身標示資料來源與非官方定位,
So that 我在瀏覽核心功能時就清楚本站定位。

**Acceptance Criteria:**

**Given** 矩陣頁渲染
**When** 頁面載入
**Then** 須標示資料來源為 USJ 官方通路，並聲明本站為非官方服務（FR20）
**And** 此標示與 Epic1/Epic2 揭露頁組內容一致，不產生矛盾陳述

### Story 3.11: Core Web Vitals 與版面穩定性

As a 使用者,
I want 矩陣頁載入快、不跳動,
So that 我在行動裝置上有流暢的比較體驗。

**Acceptance Criteria:**

**Given** 矩陣頁含 FR25 預留的廣告版位
**When** 頁面載入與渲染
**Then** 須符合 Core Web Vitals「良好」門檻（LCP、INP、CLS），以行動裝置實測為準（NFR18）
**And** 廣告版位須預留固定尺寸，不得造成版面位移（Epic4 尚未啟用廣告時，版位預留邏輯仍須存在）
**And** 具體門檻採 Google 當期公告值，不在本 story 寫死數值（PRD O7）

## Epic 4: 廣告版位 (Ad Placement)

站台具備不遮蔽核心操作的廣告版位，變現廣告收入。⚠️ 依賴 P2.9 AdSense 過審（外部審核，非本輪工程可控）。

### Story 4.1: 廣告版位置入

As a 營運者,
I want 在矩陣頁置入不干擾核心操作的廣告版位,
So that 產生廣告收入。

**Acceptance Criteria:**

**Given** AdSense（或其他聯播網）已核准（P2.9 前置條件，外部審核，非本 story 可控）
**When** 於矩陣頁置入廣告版位
**Then** 廣告版位不得遮蔽或干擾核心比較操作，尤其在行動裝置上（FR25）
**And** 廣告版位須使用 Epic3 Story3.11 已預留的固定尺寸，不造成版面位移（NFR18）
**And** 若判定有 EEA/UK 流量，投放前須確認 Epic2 Story2.11 的 CMP 已啟用同意流程（NFR15.4）
**And** 版位數量與位置細節依 PRD O8，留待 P3 實際執行時依當下聯播網規則決定，本 story 僅定義「至少一個不干擾版位」的最小可行範圍

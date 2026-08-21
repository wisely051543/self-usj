---
title: 'ARCHITECTURE-SPINE 對抗性審查 — 一致性攻擊'
type: review
lens: adversarial
target: '_bmad-output/planning-artifacts/architecture/architecture-usj-2026-08-21/ARCHITECTURE-SPINE.md'
created: '2026-08-21'
method: '對每條 AD 構造「兩個各自完全合規、但互不相容」的下一層單元對（兩個 epic／兩個 story／兩個開發者／兩個 AI agent）'
---

# 對抗性審查：一致性攻擊

## 攻擊方法與判準

本審查不問「這條 AD 對不對」，只問一件事：

> 給定這條 AD 的字面規則，能不能構造出兩個下一層單元，各自逐字合規，卻蓋出互不相容的東西？

只有能寫成**具體失敗劇本**（指名檔案、欄位、實際資料、可觀察的錯誤結果）的才計為 finding。無法變成失敗劇本的疑慮一律不列。

**攻擊面涵蓋**：協調層↔渲染層的接縫、AD-12／AD-13 三態推導、AD-15 的旗標被兩層讀取、AD-5／AD-6 跨 repo 推送、AD-18 的兩張表加上資料攜帶的設施名、AD-11 的兩個視角對上 AD-19 的 hreflang 正確性、AD-3／AD-4 的節制承諾。

**證據基礎**：`src/*.ts`、`src/sources/usj.ts`、`index.html`、`.github/workflows/fetch.yml`、以及 2026-08-21 當下 `data/` 的實際內容（31 個產品、62 個日期鍵、935 筆 `DayProduct` 列）。

**結論先講**：脊椎的分層與禁止邊界是紮實的，但**多條 AD 只鎖定了「在哪裡做」，沒有鎖定「做出來是什麼」**。這種形狀的規則對單一實作者有效，對兩個平行單元無效——而 PRD 的 P1／P2 正好是兩個平行 epic。以下 11 個 finding 全部落在這個縫上。

---

## 嚴重度總表

| # | Finding | 主要 AD | 嚴重度 |
| --- | --- | --- | --- |
| F1 | 三態語意有兩種合規推導，31 個產品中 10 個整批翻面 | AD-12, AD-13 | 🔴 Critical |
| F2 | 資料源無聲崩塌時，全綠 CI 發佈一個「全部售罄」的三語站台 | AD-16, AD-12, AD-13 | 🔴 Critical |
| F3 | KILLSWITCH：單一存在旗標表達不了三級，且兩層對「存在」的解讀不同 | AD-15, AD-6 | 🔴 Critical |
| F4 | 公開 repo 的 git 歷史比 `data/` 更好用，AD-5 完全沒蓋到 | AD-5, AD-6 | 🟠 High |
| F5 | `schemaVersion` 的守衛鎖在一個號碼上，而脊椎已把該號碼預先配給兩個變更 | AD-14 | 🟠 High |
| F6 | `units` 有兩個擁有者：矩陣格子與 JSON-LD 可合規地讀不同來源 | AD-8, AD-9 | 🟠 High |
| F7 | 視角軸是不是 canonical 軸沒人規定，兩種讀法互斥 | AD-11, AD-19 | 🟠 High |
| F8 | 設施名稱依語言不同而有兩個擁有者；「不改程式碼」為假 | AD-18 | 🟠 High |
| F9 | AD-3 的「唯一閘門」是模組單例，脊椎剛新增了第二個行程 | AD-3, AD-4, AD-7 | 🟠 High |
| F10 | 「資料太舊」有三個擁有者，其中一個在 AD-4 的 Binds 之外 | AD-4, AD-16 | 🟡 Medium |
| F11 | `robots.txt` 與 `sitemap.xml` 有兩個擁有者，且 AD-9 字面上禁止它們 | AD-9, AD-19 | 🟡 Medium |

---

## F1 🔴 Critical — AD-12 鎖住了推導的位置，沒鎖住推導的定義

### 兩個單元

- **單元 A — Story「依票種視角的每日狀態」**（P2 epic，開發者甲）
- **單元 B — Story「依日期視角的每票種狀態」**（P2 epic，開發者乙）

### 兩者各自如何完全合規

AD-12 的 Rule 只有三個約束：(1) 由 `src/fetcher.ts` 推導；(2) 只推導一次；(3) 寫成 `days.json` 的顯式欄位，下游一律讀取。

- **甲**把 `deriveState()` 寫進 `src/fetcher.ts`，只呼叫一次，結果寫成顯式欄位。切分依據取 PRD FR3.1 的原文：「**至少須能以「最新開賣日」（`latestDate`）切分 1 與 2**」，而 `latestDate` 在 `ProductResult` 與 `ProductSummary` 上都是**每票種**欄位。故甲的規則是：`date > product.latestDate` → 尚未開賣，否則 → 售罄。
- **乙**同樣寫進 `src/fetcher.ts`、同樣一次、同樣顯式欄位。乙的切分依據是**全目錄的開賣邊界**：USJ 的滾動開賣視窗是全站性質的，而 per-product 的 `latestDate` 只是「這張票最後一個還買得到的日子」；把它當開賣邊界，會把「這張票早就賣完了」誤判成「還沒開賣」。乙進一步主張 **AD-13 要求他這樣做**——AD-13 的 Prevents 正是「把尚未開賣誤報為售罄」，反向誤報同樣是猜測。故乙的規則是：`date > max(所有票種的 latestDate)` → 尚未開賣，否則 → 售罄。

兩人都通過 AD-12 的每一個字，都通過 AD-13（都在真的不確定時輸出「未知」），也都能引 PRD 的句子替自己背書。

### 具體不相容（以 2026-08-21 的 `data/` 實測）

`data/index.json` 現有 31 個產品，`data/days.json` 有 62 個日期鍵（2026-08-22 ～ 2026-10-22）。

**其中 10 個產品的 `availableDateCount` 為 0 且 `latestDate` 為空字串 `""`**：

```
E4DKT16C51A014  E4DKT16D56A045  E4DKT23C59A017  E4DKT25C51A021
E4MKC42C51A007  E4YSA11C51A033  EXP0070  EXP0082  EXP0083  EXP0094
```

- 甲的規則：`'2026-09-15' > ''` 為 true → 這 10 個票種 × 62 天 = **620 格全部顯示「尚未開賣」**。
- 乙的規則：全目錄 `max(latestDate)` = `2026-10-22`，`'2026-09-15' <= '2026-10-22'` → **同樣 620 格全部顯示「售罄」**。

**32% 的目錄，1,240 格中每一格，在兩個逐字合規的實作之間完全翻面。**

再看非空的情形：`latestDate` 只有三個相異值 `2026-09-01`、`2026-10-09`、`2026-10-22`。以 `latestDate = 2026-09-01` 的產品為例，2026-09-02～2026-10-22 共 51 天，甲說「尚未開賣」，乙說「售罄」。頁面上寫的是「這張票 10/13 賣完了」還是「這張票 10/13 還沒開賣」——這正是 §2 目標三與 UJ-1 全部的立論基礎，也是 SEO 主打的查詢詞。

### 更糟的一層：`latestDate` 本身就是兩個東西

`src/sources/usj.ts:522-525`：

```ts
const latestDate =
  availableDates[availableDates.length - 1]?.date ??
  dates[dates.length - 1]?.date ??
  '';
```

當一個票種**日曆有列但一列都不可購**時，`latestDate` 靜默退回成「日曆的最後一天」，也就是 `calendarEnd`（`MONTHS_AHEAD = 6`）。甲的規則在這種產品上會宣告**未來六個月每一天都售罄**，而唯一的證據是「該票種目前沒有任何可購日」。這正是 AD-13 的 Prevents 與 NFR15.1 存在的理由，卻是甲逐字遵守 AD-12＋FR3.1 的直接後果。

### 致命的結構問題：轉置是有損的

要真正切開「售罄」與「未知」，需要的輸入是「日曆端點對這個 (票種, 日期) **有沒有回傳一列**」。這個事實存在於 `products/*.json`（`dates[]` 保留了 `available: false` 的列），但 `src/fetcher.ts:132-133` 的 `buildDays()` 在轉置時把它丟掉：

```ts
for (const date of result.dates) {
  if (!date.available) continue;   // ← 三態需要的那個事實，在這裡被丟棄
```

於是 AD-12 要求協調層推導的東西，其輸入在協調層的轉置步驟被消滅，而 AD-8 又規定渲染層只能讀 `days.json`。**沒有任何單元有義務注意到這件事**——甲和乙都只需要用手上有的欄位湊出一個答案，而他們湊出的是相反的答案。

### 提議的 AD（新增 AD-12a，取代 AD-12 的 Rule 後半）

> **AD-12a — 三態的定義以真值表寫死，且其輸入不得為 `latestDate`**
>
> - **Rule:** 每個 (票種, 日期) 的狀態由下列真值表唯一決定，寫成 `days.json` 的顯式欄位 `state`，值域為 `soldOut | notYetOnSale | notOffered | unknown`：
>
>   | 條件 | state |
>   | --- | --- |
>   | 日曆端點對該 (票種, 日期) 回傳了一列，且 `available === false` 或 `availableUnits === 0` | `soldOut` |
>   | 日曆端點對該 (票種, 日期) 回傳了一列，且可購 | （不適用，該格為有貨） |
>   | 未回傳列，且 `date > releaseHorizon` | `notYetOnSale` |
>   | 未回傳列，且 `date <= releaseHorizon`，且該日至少有一個票種有回傳列 | `unknown` |
>   | 未回傳列，且該日**所有**票種皆未回傳任何列 | `notOffered`（日級，掛在 `DayEntry` 上） |
>
> - `releaseHorizon` 為全目錄層級的單一值：所有票種中，日曆端點**回傳過任何一列**（不論可購與否）的最大日期。它是 `days.json` 的頂層欄位，不是 per-product 欄位。
> - **`latestDate` 不得作為三態的輸入。** 它在 `src/sources/usj.ts:522-525` 有靜默 fallback，語意是「最後一個可購日」或「日曆最後一天」兩者之一，取決於資料狀態——一個有兩種語意的欄位不能當判準。若渲染層仍需要它，改名為 `lastAvailableDate` 並移除 fallback（無可購日時為 `null`）。
> - **`buildDays()` 不得在轉置時丟棄 `available: false` 的日曆列**：那正是切分 `soldOut` 與 `unknown` 的唯一證據。轉置改為輸出完整的 (票種 × 日期) 網格，不可購的格子以短欄位形式攜帶 `state`。
> - 測試須以固定 fixture 斷言這張真值表的每一列。

### 對量體的影響（供決策，不是反對理由）

現況 935 筆 `DayProduct` 列／65,567 bytes。完整網格為 31 × 62 = 1,922 格，約 135KB。但售罄格是**穩定的**（賣完就不再變動），而 `days.json` 的寫檔條件是「序列化位元組改變」（`src/fetcher.ts:183-191`），因此每回合的 diff 不會因此變大——變大的只有檔案本身，一次。這與「狀態變更」慣例相容。

---

## F2 🔴 Critical — 資料源無聲崩塌時，全綠 CI 發佈一個「全部售罄」的三語站台

### 兩個單元

- **單元 A — Story「AD-16 失敗邊界」**：實作 AD-16 列舉的五種失敗條件。
- **單元 B — Story「FR18 頁首更新時間」**：頁面顯示 `updatedAt`。

### 兩者各自如何完全合規

- **A** 逐條實作 AD-16 的五項：403／連續 429、`budgetExhausted`、連續 N 回合抓取失敗、資料齡超過門檻、PAT 失效。全部到位，且保留「單一產品失敗仍不紅」（AD-16 明文要求保留）。
- **B** 讀 `index.json` 的 `updatedAt`——那是渲染層依 AD-8 唯一能讀到的全域時間戳，而 `Days` 型別在 `src/types.ts:150-155` 明文寫著「Carries no timestamp of its own」。B 沒有別的選擇。

### 具體失敗劇本（這是 R14，已經發生在別人身上）

USJ 改了後端 schema，日曆端點改為對每個票種回傳**空的 `calendarDates`** 而不是報錯（Thrill Data 2025-11 就是這樣掛掉的，無 C&D、無法律行動、純技術性變更）。逐步追蹤現行程式：

1. `src/sources/usj.ts:518` — `dates = (availability?.calendarDates ?? []).map(...)` → `dates = []`，**不丟例外**。
2. `usj.ts:521-525` — `latestDate = ''`。
3. `usj.ts:548` — `if (!deep || !latestDate) return result` → 不取時段，不報錯。
4. `src/fetcher.ts:253-254` — `writeProduct` 成功、`summarize` 得到 `availableDateCount: 0`。
5. `fetcher.ts` 的 `failed` 計數 = **0**（沒有任何例外）。
6. `fetcher.ts:293` — `buildDays()` 產出 `{"schemaVersion":1,"days":{}}`。
7. `fetcher.ts:284-291` — `index.json` **無條件寫入**，`updatedAt: nowIso`。
8. `fetcher.ts:314` — `failed > 0 && failed === targets.length` 為 false → **`exit 0`**。
9. `fetch.yml` commit + push → 綠。
10. AD-6 的 `workflow_run` 觸發 build → AD-6 明文要求「建置 workflow 須能在無新資料的情況下獨立成功執行」→ **綠**。
11. AD-19 的 `verify.ts`：6 個 URL 都在、hreflang 三向對稱、sitemap 完整、`<html lang>` 正確——**頁面只是空的，驗證項目一項都沒違反** → 綠。

**對照 AD-16 的五項**：無 403、無 429、`budgetExhausted` 為 false、無「抓取失敗」（沒有例外）、資料齡為零（`updatedAt` 剛剛才動過）、PAT 正常。**五項全部不觸發。**

結果：站台以三種語言、附 JSON-LD、附一個十分鐘前的新鮮時間戳，宣告未來六個月所有 USJ 快通全部不可購。若三態採 F1 的甲式推導，那 1,922 格全部寫著**「售罄」**——就是 NFR15.1 與 AD-13 存在的唯一理由，以最大爆炸半徑發生，而且 CI 全綠。

單元 A 沒有違反 AD-16 任何一個字；單元 B 沒有違反 AD-8 或 FR18 任何一個字。不相容之處在於：**AD-16 的五項全部是「發生了壞事」型偵測，沒有一項是「該發生的好事沒發生」型偵測**，而 `updatedAt` 量測的是「檔案何時被寫」，不是「事實何時為真」。

### 提議的 AD

> **AD-16a — 合理性下限：抓不到東西必須和抓錯一樣紅**
>
> - **Rule:** 在 AD-16 的五項之外，再加一項必失敗條件：**本回合產出的 (票種, 可購日期) 列數少於上一回合的 60%，或為零時，job 須失敗，且該回合的 `data/` 不得 commit。**門檻值與 AD-16 的 N 一同定值（Deferred），但「零列必失敗」不待定，立即生效。
> - 判定所需的上一回合基準值，由 `days.json` 自帶的 coverage 欄位提供（見下）。

> **AD-14b — `days.json` 自帶產生時間與覆蓋計數**
>
> - **Rule:** `Days` 須攜帶 `generatedAt`（ISO 8601 UTC）、`productCount`、`dayCount`、`rowCount`、`releaseHorizon`。
> - **渲染層顯示的每一個時間，一律取自 `days.generatedAt` 與 per-product `fetchedAt`，不得取自 `index.updatedAt`。** `index.updatedAt` 量測的是檔案何時被寫入（`src/fetcher.ts:291` 無條件執行），不是資料何時為真；它不得出現在任何使用者可見的位置，亦不得作為 AD-16 資料齡判定的輸入。

---

## F3 🔴 Critical — KILLSWITCH：一個存在旗標表達不了三級，兩層對「存在」的解讀不同，且第二道閘會使 L2 永遠不到達

AD-15 的 Rule 在一句話裡塞了四個獨立決策，每個都有兩種合規解法。

### 攻擊一：旗標是布林還是等級？

**兩個單元**

- **單元 A — Story「建置層讀取 KILLSWITCH 使站台進入 L2」**
- **單元 B — Story「抓取層讀取 KILLSWITCH，存在即 exit 0」**

**兩者各自如何合規**

- **B** 逐字照抄 AD-15：「**存在即抓取 `exit 0`**」。實作為 `[ -f KILLSWITCH ] && exit 0`。操作手冊寫：`touch KILLSWITCH && git commit && git push`。
- **A** 面對的是 AD-15 的另一句：「三級為 L1 停抓（**站台續存**）／L2 停抓 + 站台明示停止服務／L3 整站下架」。既然只有一個旗標檔而有三個等級，A 只能讀**檔案內容**當等級：內容為 `L1` → 站台維持正常但顯示資料凍結時間；`L2` → 明示停止服務；`L3` → 下架。

**具體不相容**

營運者依 L1 程序執行 `touch KILLSWITCH`。抓取停止（正確）。建置層的 parser 讀到**空字串**，比對不到任何等級，落入 default 分支 → **站台照常渲染**。資料自此凍結，而頁首時間戳（見 F2）仍顯示新鮮。

這正是 AD-15 自己 Prevents 欄寫的那句話：「抓取已停而站台不知情，繼續以正常樣式顯示逐漸腐朽的資料」。

反過來若 B 的解讀勝出（存在＝布林），則 **L1 根本不可達**：一停抓，站台就同時宣告停止服務，AD-15 自己定義的三級中的第一級消失。

### 攻擊二：兩種合規的 `exit 0`，一種讓 L2 到不了

**兩個單元**：兩個開發者實作同一句「存在即抓取 `exit 0`」。

- **甲**用 job 層條件：`jobs.fetch.if: ${{ hashFiles('KILLSWITCH') == '' }}`。旗標在時 job 被 skip，工作流程結束——這是最乾淨的寫法，且一個請求都不會發出（比甲的替代方案更符合 AD-15 的意圖）。
- **乙**用 step 層守衛：第一個 step 檢查旗標並 `exit 0`。run 的 conclusion 是 `success`。

**具體不相容**：AD-6 規定 build 以 `workflow_run` 串接。而 `workflow_run` 觸發的標準寫法（GitHub 官方範例）是：

```yaml
on:
  workflow_run:
    workflows: [Fetch Express Pass Availability]
    types: [completed]
jobs:
  build:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

甲的 job 被 skip 時，workflow run 的 conclusion 是 **`skipped`**，不是 `success` → **build 永不執行 → 站台永遠進不了 L2**。乙的寫法則正常。兩人都逐字實作了 AD-15 的同一句話，結果一個能停站、一個不能。

### 攻擊三：AD-15 的「後備第二道閘」直接廢掉 AD-15 的主要目的

AD-15 明文把「GitHub UI 停用 workflow」列為後備第二道閘。AD-6 明文規定 build 只由 `workflow_run` 觸發，且**禁止 `on: push`**（理由正當：`GITHUB_TOKEN` 推的 commit 不觸發 push workflow）。

於是：在 UI 停用 fetch workflow → 不再有 `workflow_run` 事件 → **build 永遠不再執行** → 站台凍結在最後一次建置的樣子，帶著一個看起來新鮮的時間戳，直到有人手動介入。AD-15 自己核可的備援手段，恰好觸發 AD-15 自己宣稱要防止的失敗。

同一個 AD-6 條款還造成第二個延遲：**建立 KILLSWITCH 檔案本身是一次 push，而 build 禁用 `on: push`**，所以旗標落地不會引發重建。L2 最快也要等到下一次 cron 抓取回合跑完（最多 30 分鐘），而且要那回合的 conclusion 是 `success`（見攻擊二）。在 R15 的假處分情境（大阪、日語、目的為關站、速度快）裡，這 30 分鐘是要被寫進答辯狀的。

### 攻擊四：L3 從私有 repo 出發不是單一動作

AD-15 要求「每一級皆須可由單一動作達成」，且主機制「不依賴第三方後台」。但 L3（整站下架）要處置的產物在**另一個 repo**，其 Pages 開關在 GitHub 的設定介面裡——那正是一個第三方後台。私有 repo 裡的旗標檔在目前設計下最多只能讓 build 產出一個「停止服務」頁面（L2），無法讓站台消失。

**失敗劇本**：週五 18:00 JST 收到假處分聲請。營運者 `touch KILLSWITCH`（一個動作）。抓取停止。建置或者不觸發、或者渲染 L2 橫幅。站台仍然在線。要達成 L3，必須登入 GitHub、找到公開 repo、關掉 Pages 或刪 repo——**第二個動作、第二個系統、第三方後台**，正是 AD-15 說要避免的。

### 提議的 AD（重寫 AD-15 的 Rule）

> **AD-15a — kill switch 的旗標是分級的、fail-closed 的，且兩層共用同一個 parser**
>
> - 旗標為私有 repo 根目錄的單一檔案 `KILLSWITCH`，其**第一行內容**為 `L1`、`L2` 或 `L3` 之一。**檔案不存在＝運作中；檔案存在但內容無法解析＝視為 `L3`（fail closed）。**
> - 解析只有一個實作：`src/killswitch.ts` 匯出 `readLevel(): null | 'L1' | 'L2' | 'L3'`。抓取層與建置層都**必須**呼叫它，不得各自 `grep`／`test -f`。測試須斷言空檔、空白、未知字串三種輸入都回傳 `L3`。
> - **抓取層的守衛必須是 step 層守衛，不得是 job 層 `if:`**——run 的 conclusion 必須維持 `success`，否則下游的 `workflow_run` 串接會斷。此項須有 workflow lint 斷言。
> - **建置 workflow 除 `workflow_run` 外，另須具備 `workflow_dispatch` 與一個 `schedule` 心跳（建議每 6 小時）**，使等級變更不必等待抓取回合、且在抓取被 UI 停用後仍能落地。此為 AD-6「跨 repo 的只有產物推送，不是觸發」的必要補充，不與之衝突（心跳仍在私有 repo 內）。
> - **L3 必須由建置層達成**：發佈一個只含下架說明頁的 orphan commit，並移除 `CNAME`。GitHub UI／Pages 開關降格為**第三**道閘，不得是 L3 的唯一路徑。
> - 三級的語意固定為：`L1` 停抓、站台續存並顯著標示資料凍結時間；`L2` 停抓、站台明示停止服務、矩陣不再呈現；`L3` 整站僅剩下架說明與聯絡窗口。

---

## F4 🟠 High — 公開 repo 的 git 歷史比 `data/` 更好用，而 AD-5 只檢查路徑

### 兩個單元

- **單元 A — Story「發佈：以 PAT 推送 dist/ 至公開 repo」**
- **單元 B — Story「AD-5 稽核閘」**：CI 拒絕任何把 `data/` 推入公開 repo 的變更。

### 兩者各自如何完全合規

- **A** 依 AD-6「跨 repo 的只有產物推送」，實作最直觀的寫法：`cp -r dist/* .; git add -A; git commit -m "deploy"; git push`（fine-grained PAT，僅該 repo 的 `contents: write`，符合設定慣例）。
- **B** 依 AD-5「任何把 `data/` 或其片段推入公開 repo 的變更一律拒絕」，實作為路徑檢查：`git diff --name-only | grep '^data/' && exit 1`。這是「片段」最自然的可執行解讀。

兩者都通過。`data/` 底下沒有任何一個檔案跨過 repo 邊界。

### 具體不相容

AD-5 的 Prevents 寫得非常清楚：

> NFR9.1 第 1 項（停抓後銷毀抓取資料及其衍生物）因**歷史已被 fork／GHArchive／clone 散佈**而在技術上不成立

而 A 的實作每 30 分鐘往一個**公開、可 fork、被 GHArchive 鏡像**的 repo commit 一次完整的渲染快照——每一份都含 21 個票種 × 62 個日期的精確剩餘張數。六個月後那是約 **8,640 個 commit**，每個都是一張完整的庫存切片。

**這比 `data/` 本身更好用**：`data/days.json` 只在「答案改變」時寫入（`src/fetcher.ts:183-191`，這是刻意設計），公開 repo 的 deploy commit 則是**每回合都有**、且已經是人類與機器都易讀的形式。§11 的「補貨訊號」——PRD 明說那是對造最會要求銷毀的東西——**可以完整地從公開 repo 的歷史重建**，由任何人，不需要私有 repo 的存取權。

AD-5 的 Prevents 被 AD-6 授權的那條通道、以 AD-5 自己指名的機制（fork／GHArchive／clone）、完整地擊穿。而單元 B 的稽核閘永遠不會響——它檢查的是路徑，穿過去的是內容。

### 同一個 story 的第二個不相容：加法式推送 vs 取代式推送

**兩個開發者**實作同一句「產物推送」：

- **甲**：`cp -r dist/* . && git add -A`（加法式）。
- **乙**：`git rm -rqf . && cp -r dist/* . && git add -A`（整樹取代）。

AD-19 規定「**建置後**須執行驗證腳本並在失敗時中止發佈」——驗證的對象是 `dist/`。但甲的實作下，**實際被服務的是 `dist/` ∪ 歷史殘留**。

**失敗劇本**：P1 上線時 URL 為 `/zh-TW/by-date/`；三個月後 O11 解除，決定加上每票種頁並把視角區段改名為 `/zh-TW/date/`。`verify.ts` 對新的 `dist/` 全綠：6（或 12）個 URL、hreflang 三向對稱、sitemap 完整。但線上仍然存在 `/zh-TW/by-date/`，內容凍結在三個月前的庫存數字，帶著指向 `/ja/by-date/` 與 `/en/by-date/` 的 hreflang，而那兩頁也還在。搜尋引擎看到兩組互相競爭的叢集，其中一組數字是三個月前的。**`verify.ts` 永遠看不到這個問題，因為它驗證的是 `dist/`，不是被服務的樹。**

AD-19 的 Prevents——「這類錯誤是**靜默失敗**，不報錯、只是沒有流量」——在比 AD-19 高一層的地方原封不動地重現。

### 提議的 AD

> **AD-5a — 公開 repo 無歷史，每次發佈為整樹取代**
>
> - **Rule:** 發佈至公開 repo 一律為 orphan commit 並 force-push（`git checkout --orphan`），公開 repo 的預設分支永遠只有**一個** commit。
> - 三個後果同時達成，故不接受「加法式推送比較簡單」的取捨：
>   1. NFR9.1 的「銷毀衍生物」變成單一動作可達成（無歷史可散佈）；
>   2. 發佈成為整樹取代，被移除的 URL 不可能留在線上（關閉 AD-19 的上層漏洞）；
>   3. 消除每 30 分鐘一格的公開庫存時間序列。
> - **AD-5 的稽核閘不得只檢查路徑。** 除路徑檢查外，須斷言公開 repo 的 commit 數為 1，且推送前的樹中不存在任何 `.json` 資料檔（見 F11 的白名單）。

> **AD-19a — 驗證的對象是將被服務的樹，不是 `dist/`**
>
> - **Rule:** AD-19 的驗證腳本必須在「發佈樹組裝完成之後、推送之前」對**該樹**執行，且該樹必須與推送內容逐檔相同。禁止對 `dist/` 驗證後再另行加工發佈內容。

---

## F5 🟠 High — `schemaVersion` 的守衛鎖在一個號碼上，而脊椎已把該號碼預先配給了兩個變更

### 兩個單元

- **單元 A — Story「三態欄位」**（AD-12）。脊椎自己在 AD-14 的括號裡寫著：「（三態欄位加入使 `Days` 由 1 升至 2。）」
- **單元 B — Story「`days.json` 自帶時間戳與覆蓋計數」**（FR18／NFR11，亦即 F2 的修法）。B 也改了 `Days` 的結構，依 AD-14「每次結構變更必須升 `schemaVersion`」→ 由 1 升至 **2**。

### 兩者各自如何完全合規

兩者都改了結構，兩者都升了版，兩者升到的都是脊椎預先宣告過的那個號碼。AD-14 的 Rule 沒有任何一個字被違反。

### 具體不相容

渲染層的守衛依 AD-14 寫成 `if (days.schemaVersion !== 2) abort()`。A 與 B 的產出**都是 `2`**，守衛對兩者都放行。

- A 的 fetcher + B 的 renderer：renderer 讀 `days.generatedAt` → `undefined` → 頁首時間戳渲染成 `Invalid Date` 或空白，而版本守衛全綠。
- B 的 fetcher + A 的 renderer：renderer 讀 `row.state` → `undefined` → 每一格的三態渲染成 `undefined`（`localizing` skill 已明文警告過的那個陷阱，只是這次不在 i18n 表，在資料層）。

AD-14 的 Prevents 逐字寫著：「協調層與渲染層對同一份檔案的理解無聲分歧，渲染出看似正常但語意錯誤的頁面」。**AD-14 防的正是這件事，而它的機制正好防不到。**

型別層也擋不住：`Days.schemaVersion: 1` 是 `src/types.ts:157` 的字面型別，兩個分支都會把它改成 `2`，在 `types.ts` 產生文字衝突——但那只在 `types.ts` 一個檔案。合併時取任一方的 `types.ts` 再配上另一方的 `fetcher.ts` 或 `site/`，**TypeScript 完全編譯得過**（欄位是 optional 或型別已被另一分支加入）。

### 第二個攻擊面：「不認識」是模糊的

**兩個開發者**實作 AD-14 的「遇到不認識的 `schemaVersion` 必須中止建置」：

- **甲**：`if (v !== CURRENT) abort()`（嚴格相等）。
- **乙**：`if (v > CURRENT) abort()`（向前不相容才擋；主張舊版是「認識的」，向後相容是好工程）。

**失敗劇本**：抓取端因故 revert 回 v1（例如 F2 的合理性閘擋下一次壞資料後有人回滾 fetcher），站台仍是 v2。甲的守衛紅燈、建置中止、AD-14 生效。乙的守衛放行 v1 檔案，三態欄位不存在 → 全站每一格渲染 `undefined`，而 CI 全綠。兩人都逐字實作了同一句話。

### 提議的 AD（取代 AD-14 的 Rule）

> **AD-14a — 版本號是單調登記簿，且守衛是形狀驗證不是號碼比對**
>
> - **Rule:** `data/` 每個檔案的 schema 版本登記於單一檔案 `src/schema-registry.ts`，一個號碼對應一個形狀，**號碼由合併順序配發，不得在脊椎或任何文件中預先宣告**（本脊椎 AD-14 括號中「使 `Days` 由 1 升至 2」的預先配發即為本問題的成因，須刪除）。
> - 渲染層的守衛必須是**嚴格相等**（`!==` 而非 `>`），且除號碼外還必須以 runtime validator 驗證形狀：所有必要欄位存在、型別正確。號碼相同但形狀不符時同樣中止建置。
> - CI 須有一項檢查：`data/*.json` 磁碟上的實際內容通過當前版本的 validator。這使「兩個分支都升到 2」在合併後立刻紅燈，而不是在渲染時變成 `undefined`。

---

## F6 🟠 High — `units` 有兩個擁有者：AD-8 的括號是理由，不是規則

### 兩個單元

- **單元 A — Story「庫存矩陣格子」**（FR3／FR4／FR5）。依脊椎「快照的核心實體」段落最後一句「渲染層只讀 `days.json` 與 `index.json`（AD-8）」，只讀這兩個檔。
- **單元 B — Story「JSON-LD（FR21）」**。FR21 要求 JSON-LD 至少描述「票種為何物、其價格、**可購日期**、資料的擷取時間」。B 需要 per-date 的價格與擷取時間，於是在**建置時**讀 `data/products/*.json`。

### 兩者各自如何完全合規

AD-8 的 Rule 只有兩句：「頁面所需的全部事實於建置時 bake 進 HTML。**頁面不得在執行期 fetch 任何資料檔。**」B 在建置時讀本機檔案，**執行期一個 fetch 都沒有**。AD-8 的括號裡那句「故 `products/*.json` 的 `timeSlots` 不需進站台」是**成立依據**（理由），不是禁止條款——「不需」不是「不得」。B 逐字合規。

AD-9 也不擋 B：AD-9 允許「渲染後的 HTML 與 FR21 要求的逐頁 JSON-LD」，而 B 產出的正是逐頁 JSON-LD。

### 具體不相容（以實測資料）

同一頁上會出現同一個事實的兩個不同數字，因為 `units` 至少有兩個測量：

1. `DayProduct.units` ← `DateSlot.availableUnits` ← 日曆端點的 `inventoryEvents[0].availableUnits`（`src/sources/usj.ts:155`）——**當日總量**。
2. `sum(timeSlots[].availableUnits)`——**逐時段餘量之和**。而 `src/types.ts:32-38` 註明每個時段的 `availableUnits` 同時是「入場人數上限」，且「只有仍可購的 variant 會回來」。兩者沒有任何理由相等。

935 筆列中 **384 筆（41%）的 `slots` 為 `null`**（實測）。對這些日期，A 的格子依 FR5 渲染「時段未知」，B 的 JSON-LD 則根本沒有時段資料可用，於是 B 只能改用 `date.available` 或 `date.availableUnits`——兩個單元對同一格的權威來源不同。

**失敗劇本**：2026-08-22 / EXP0049，`days.json` 寫 `units: 14`（低於 FR4 的稀缺門檻 10？否，14 > 10，正好落在邊界附近）。B 從 `products/EXP0049.json` 讀該日的 `timeSlots`，加總得到 9 → JSON-LD 的 `inventoryLevel` 為 9，觸發「即將售罄」的結構化語意，而畫面上的格子寫 14、沒有稀缺標示。Google 的結構化資料與可見內容不一致（這是有文件記載的品質問題），而 FR22／NFR10 主張的「每個事實陳述須明確標示擷取時間與來源」在同一頁上自我矛盾。

### 同一條 AD 的第二個攻擊面：AD-9 的 Prevents 被 FR21 從正門擊穿

AD-9 的 Prevents 寫著：「把 `days.json` 掛成任何人可 `curl` 的免費 API——那同時餵養兩家收費競品」。但 AD-9 的 Rule **明文允許逐頁 JSON-LD**，而 B 依 FR21 把 per-date 的可購狀態與擷取時間放進 JSON-LD。

**失敗劇本**：競品寫 12 行 Python，每 30 分鐘 `curl` 6 個 URL，解析 `<script type="application/ld+json">`，完整重建 `days.json`。**這比 `curl days.json` 只多了一個解析步驟**，而且格式是標準化的、有 schema.org 定義的，比原始 JSON 更好處理。AD-9 的 Prevents 完全失效，且失效路徑是 AD-9 自己的 Rule 授權的。

### 提議的 AD

> **AD-8a — 渲染層的輸入是封閉集合**
>
> - **Rule:** 渲染層（`src/site/**`）**只得讀取 `data/days.json` 與 `data/index.json`**。不得讀取、import、或以任何方式取用 `data/products/**`。此為 Rule，非理由。
> - 以 CI 強制：斷言 `src/site/**` 的靜態相依與檔案讀取路徑不含 `products`。

> **AD-9a — JSON-LD 的欄位是白名單**
>
> - **Rule:** 逐頁 JSON-LD 只得攜帶：票種名稱、官方 URL、幣別、價格區間（`lowPrice`/`highPrice`）、資料擷取時間、與 USJ 的非隸屬關係聲明。**不得攜帶 per-date 的 `units`、`slots` 或 per-date 的 `availability`。**
> - 理由：per-date 的數字是本產品唯一的差異化資產（PRD §1、R10），而 JSON-LD 是它唯一可被批次消費的形式。稀缺數字只存在於渲染後的 HTML 文字節點中。
> - 以驗證腳本強制（納入 AD-19 的檢查清單）：JSON-LD 的鍵集合須為白名單子集。

---

## F7 🟠 High — 視角軸是不是 canonical 軸，沒人規定，而兩種讀法互斥

### 兩個單元

- **單元 A — Story「兩視角各自產出可索引 URL」**（AD-11）。
- **單元 B — Story「canonical 與 hreflang」**（FR14／AD-19）。

### 兩者各自如何完全合規

- **A** 依 AD-11「兩個視角於建置時各自產出獨立、可索引的 URL」，產出 6 個 URL，每頁 self-canonical，全部進 sitemap，每頁帶三語 hreflang（同視角內三向互指）。AD-11 與 AD-19 逐字滿足。
- **B** 注意到一件 A 沒注意到的事：`by-date` 與 `by-pass` 承載的是**完全相同的事實**，只是版面不同（AD-11 自己說是「兩個閱讀主軸」，FR10 說三語內容完全一致）。兩個 URL 相同內容是教科書級的 duplicate content，會稀釋排名——而排名就是本產品的商業模式。B 於是把 `by-pass` 的 canonical 指向 `by-date`，同時**保留兩頁的三語 hreflang**，因為 AD-19 明文要求「**每頁**具 canonical、三語 hreflang 三向互指且對稱」。B 逐字滿足 AD-19 的每一項。

### 具體不相容

B 的產出中，`/zh-TW/by-pass/` 的 canonical 指向 `/zh-TW/by-date/`，同時帶著指向 `/ja/by-pass/` 與 `/en/by-pass/` 的 hreflang。Google 對「hreflang 指向非 canonical 頁面」的處理是有文件記載的：**整個叢集的 hreflang 註記被忽略**，且 `by-pass` 被摺疊進 `by-date`。結果：

- 6 個可索引 URL 變成 3 個 → **AD-11 的 Prevents 一字不差地實現**：「第二軸淪為……對爬蟲不存在、不可分享、不可索引」。
- 三語 hreflang 全叢集失效 → **AD-19 的 Prevents 一字不差地實現**：hreflang 錯誤是靜默失敗。

而 **A 寫的 `verify.ts` 全綠**：每頁都有 canonical（有，只是指向別處）、三語 hreflang 三向對稱（是，在 HTML 裡對稱）、sitemap 涵蓋 6 頁（是）。**建置是綠的，失敗只會出現在三個月後的 Search Console。**

反向也一樣壞：若 A 的讀法勝出，B 必須說服 `verify.ts`「`by-pass` 不算可索引頁」，於是 AD-11 在產物層面死亡，而兩條 AD 讀起來都還是滿足的。

### 附帶：排序也有兩個擁有者

`src/fetcher.ts:149`：

```ts
days[date].products.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.code.localeCompare(b.code));
```

`localeCompare` 不帶 locale 參數，結果取決於執行環境的 ICU 預設值——也就是說，**三個語言版本的排序由 fetcher 的執行環境決定**，而 FR10 明文要求三語「相同的排序邏輯」。更直接的問題是：`by-pass` 視角沒有任何既定順序，開發者可自選價格、代碼或名稱。同一份事實在兩個視角下以兩種順序呈現，切換視角時使用者的閱讀位置被打散，FR24 的「跨語言辨識為同一實體」也弱化。

### 提議的 AD

> **AD-11a — 視角是內容軸，不是 canonical 軸**
>
> - **Rule:** 6 個 URL 每一個都是 self-canonical。hreflang 叢集**只沿語言軸展開**，視角區段固定不變（`/zh-TW/by-date/` ↔ `/ja/by-date/` ↔ `/en/by-date/`）；跨視角**不得**有 canonical 或 hreflang 關係。
> - 為使 self-canonical 成立，兩個視角**必須各自承載對方沒有的內容**：`by-date` 額外承載當日的跨票種排名、當日 `notOffered` 狀態與當日彙總；`by-pass` 額外承載該票種的價格區間、開賣視窗與 `lastAvailableDate`。這是硬要求，不是建議——兩頁若完全同構，Google 的摺疊行為會讓 AD-11 失效，而任何驗證腳本都測不到。

> **AD-19b — 驗證清單補三項**
>
> - 每一個列於 `sitemap.xml` 的頁面，其 canonical 必須指向自己；
> - 每一個 hreflang 目標必須自身為 self-canonical 且存在於 `sitemap.xml`；
> - 沒有任何頁面同時具有「canonical 指向他頁」與「hreflang 註記」。

> **Consistency Conventions 補一列（排序）**
>
> | 排序 | 日內：價格由低至高，同價以 `code` 的**位元組序**遞增為 tiebreak（不得用 `localeCompare`，其結果依執行環境的 ICU 而異）。跨票種：`code` 位元組序遞增。此順序在三語與兩視角中完全一致。 |

---

## F8 🟠 High — AD-18：設施名稱依語言而有兩個擁有者，且「不改程式碼」為假

### 兩個單元

- **單元 A — Story「新增語言（以韓文 `ko` 為例）」**，逐字執行 AD-18：「**新增語言＝新增兩個 JSON 檔，不改程式碼**」。新增 `i18n/ui.ko.json` 與 `i18n/terms.ko.json`，`i18n-check` 綠，出貨。
- **單元 B — Story「官方名稱正確性」**（FR11：「票種與設施名稱須採用 USJ 官方各語言版本的正式名稱，**不得自行翻譯**」）。B 發現設施名稱不在任何 JSON 表裡，而在**資料**裡（`ProductResult.attractionNames[code].en`），於是把 `ko` 加進 `src/sources/usj.ts` 的 `NAME_LANGS`。

### 三個具體不相容

**(a) A 單獨出貨時，AD-18 的 CI 檢查證明不了 FR11。**
`i18n-check.ts` 檢查的是「兩張表的 key 完整性」——表與表之間。設施名稱不在表裡（`i18n/terms.en.json` 的 header 自己寫著：「**Attraction names are not listed here at all**——the API's own English is authoritative」）。所以 A 的韓文頁上，每一個設施名稱都會**渲染成日文**（`index.html:608` 的 `term(entry.ja)` 在韓文表沒有 key 時原樣返回），而 CI 全綠。FR10 的「三語內容完全一致」與 FR11 同時破功，靜默。
若 A 為了補救而在 `terms.ko.json` 手寫設施名稱，那**就是自行翻譯**，直接違反 FR11——而 CI 更綠了。

**(b) B 的變更是一次沒有人審核的請求量變更。**
`src/sources/usj.ts:500-506`：

```ts
for (const lang of NAME_LANGS) {
  try { await fetchProductInfo(entry.code, attractionNames, lang); }
  ...
}
```

`NAME_LANGS` 每多一個語言，**每個產品每回合就多一次 product-info 請求**。以現況 31 個產品計，就是每回合 +31 個請求，永久。AD-4 的五值互鎖的 Binds 是 `src/limiter.ts` 與 `.github/workflows/fetch.yml`——`NAME_LANGS` 在 `src/sources/usj.ts`，**不在任何一個**。一個 i18n story 改變了節制層的成本基準，而 AD-4 的測試看不到。

**(c) 兩者都落地時，同一個設施有兩個名字，且優先序已經不一致。**
現行 `index.html:605-608`：

```js
if (locale === 'ja') return entry.ja || code || '';
if (locale === 'en' && entry.en) return entry.en;   // en：API 勝
return term(entry.ja) || code || '';                 // zh-TW：表勝
```

規則實際上是「**看這個語言碰巧有沒有在 `NAME_LANGS` 裡**」，不是一個擁有權宣告。`i18n/terms.zh-TW.json` 的 header 主張它的設施名是 canonical（「taken from usj.co.jp/contentdata/usj/zh/tw on 2026-08-16」）。**USJ 只要哪天把 zh-TW 加進它自己 API 的語言集**，這 40 餘個手工核對過的中文名稱就與 API 值同時存在且可能不同（USJ 商店端自創的名稱與官網 contentdata 的名稱不一定一致——`terms.zh-TW.json` 自己就記載了「USJ leaves some titles part-English on its own Chinese pages」）。

**失敗劇本**：`by-date` 頁的格子 tooltip 走 `attractionName()` → API 值；`by-pass` 頁的 `legalDesc` 走 `term()` 的整段替換 → 表值；JSON-LD 的 `name` 走第三個 call site → 第三個值。同一個設施在同一次建置的三個位置有三個名字，FR24「使搜尋引擎能跨語言辨識為同一實體」的整條立論失效，而 `i18n-check` 全綠。

**(d) 兩張表根本不同構，逐字執行 AD-18 會製造一個沒有人讀的檔案。**
AD-18 說「兩者同構」。實際上：`ui.*` 需要 3 個 locale（zh-TW／ja／en），`terms.*` 只有 2 個——`src/i18n-check.ts:22` 的 `TABLE_LOCALES = ['zh-TW', 'en']`，且 `index.html:592` 的 `term()` 對 `ja` 直接短路返回。`terms.ja.json` **不存在且不該存在**。
一個逐字實作 AD-18「兩者同構、缺 key 即失敗」的開發者，CI 第一天就紅（缺 `terms.ja.json`），於是他建立一份 identity 對照表把它補上。從此每一個新的日文商店字串都必須同步加進一個**沒有任何程式讀取**的檔案，否則 CI 紅；而任何譯者去修改那個檔案裡的值，站台上不會有任何變化。

### 提議的 AD（重寫 AD-18 的 Rule）

> **AD-18a — 設施名稱的擁有者由語言決定，且只能有一個**
>
> - **Rule:** 對語言 `L`，設施顯示名稱的擁有者是：`L ∈ NAME_LANGS` 時為**資料**（`ProductResult.attractionNames[code][L]`）；否則為 `i18n/terms.L.json`。**兩者不得同時擁有。**
> - `src/i18n-check.ts` 須新增一項檢查：當 `L ∈ NAME_LANGS` 時，`terms.L.json` 中若存在任何一個 key 等於某設施的 `ja` 名稱，即為 CI 失敗（重複擁有）。
> - 渲染層對設施名稱只得有**一個** call site（`src/site/attraction-name.ts`），矩陣、`legalDesc` 的替換、與 JSON-LD 一律經由它。

> **AD-18b — 誠實陳述新增語言的成本**
>
> - **Rule:** 新增一個「僅頁面文案」的語言 = 新增 `ui.L.json` + `terms.L.json`，不改程式碼。
> - 新增一個「設施名稱亦須為官方名稱」的語言 = 上述兩檔 + `NAME_LANGS` + **依 AD-4 重算請求預算**（每語言每回合 +N 個請求，N = 目錄產品數）。後者是節制層變更，須經 AD-4 的互鎖測試，不得由 i18n story 單獨完成。
> - `ja` 為來源語言：`ui.ja.json` 必須存在，`terms.ja.json` **必須不存在**；`i18n-check` 須斷言此事，以免有人為了「同構」而造一個死檔。
> - `src/types.ts` 的 `Localized` 由 `{ ja: string; en?: string }` 改為 `{ ja: string } & Record<string, string | undefined>`，使新增語言不需要改型別定義——目前的兩欄位介面使「不改程式碼」在型別層就已為假。

---

## F9 🟠 High — AD-3 的「唯一閘門」是模組單例；脊椎剛新增了第二個行程

### 兩個單元

- **單元 A — Story「連結健檢」**：FR8 要求每個票種可點擊前往官方販售頁，而 `url` 由 `storeUrl(code)` 組出（`src/sources/usj.ts`），票種下架時會 404。A 在 `src/site/verify.ts` 加一項建置後檢查：對 21 個 `url` 各發一次 `HEAD`，**經由 `limitedFetch`**。
- **單元 B — Story「P0 降速」**：設定 `RATE_LIMIT_PER_SEC = 1`、`CONCURRENCY = 2`，寫 AD-4 的互鎖測試。

### 兩者各自如何完全合規

- **A** 逐字遵守 AD-3：「所有發往來源主機的 HTTP 請求必須且只能經由 `src/limiter.ts` 的 `limitedFetch`」——A 用的就是 `limitedFetch`。AD-7 也不擋：AD-7 的 Rule 說的是「**已發佈的頁面**不得對 `usj.co.jp` 的任何主機發出請求」，A 的請求發生在建置時的 runner 上，不是已發佈的頁面。
- **B** 的測試斷言 `RATE_LIMIT_PER_SEC <= 1`、`CONCURRENCY <= 2`、`MAX_REQUESTS_PER_RUN <= 6000`，全部通過。

### 具體不相容

`src/limiter.ts:32-35` 的節制狀態是**模組層變數**：

```ts
let inFlight = 0;
let nextSlotAt = 0;
let issued = 0;
```

這些是**一個 Node 行程內**的狀態。建置 workflow 是**另一個 workflow run 裡的另一個行程**，因此：

- 它拿到一份**全新的 6,000 請求預算**；
- 它拿到一份**全新的速率窗口**（`nextSlotAt = 0`）；
- AD-4 的三項斷言**仍然全部通過**。

於是對 `usj.co.jp` 的**總體速率**不再能從 `src/limiter.ts` 推算出來，而那是整個節制層存在的唯一理由，也是 R3.2（「已針對對方明示關切之事項採取具體措施」）唯一可稽核的證據。

更糟的是併發：脊椎的併發慣例寫「**抓取 workflow** 須設定 GitHub Actions `concurrency` 群組」（NFR5.1）。建置 workflow 不在該群組內。於是**第 N 回合的建置（含 21 次連結檢查）可以與第 N+1 回合的抓取同時打同一台主機**——NFR5.1「同一時間只允許一個抓取回合」在字面上仍然成立（只有一個「抓取」回合），在實質上已被繞過。

### 第二個不相容：同一個 429，兩條 AD 要求相反的處置

AD-16 要求「被來源封鎖（403 或連續 429）」必須讓 job 失敗。A 的連結檢查若吃到 403，依 AD-16 應該讓 job 紅。但那是**建置 job**，而 AD-6 明文要求「建置 workflow 須能在無新資料的情況下獨立成功執行」——一個讀了 AD-6 的開發者會把連結檢查設成非阻斷（`continue-on-error`）。結果：來源第一次表態封鎖本站的訊號，在唯一觀察到它的地方被吞掉。

### 提議的 AD（收緊 AD-3）

> **AD-3a — 節制是行程級的，且渲染層的外送請求數為零**
>
> - **Rule:** 除抓取 workflow 的那一個行程之外，**任何行程不得對來源主機發出任何請求**——包含建置期的連結健檢、預覽、截圖、快取暖機。渲染層（`src/site/**`）的對外請求數恆為 0。（AD-7 因此成為本條的一個特例，而非獨立規則。）
> - 以 CI 強制：斷言 `src/site/**` 不 import `src/limiter` 與 `src/sources/**`。
> - 若需要連結健檢，它屬於抓取回合，在同一個行程、同一份預算內執行，其結果寫入 `data/`。
> - **`concurrency` 群組設在 repository 層級並涵蓋 fetch 與 build 兩條 workflow**，使兩者不可能重疊。（此變更不影響 AD-6：串接方式不變，只是加了互斥。）

---

## F10 🟡 Medium — 「資料太舊」有三個擁有者，其中一個在 AD-4 的 Binds 之外

### 三個單元

- **單元 A — Story「AD-4 互鎖測試」**：在 `src/limiter.ts` 斷言三個上限。
- **單元 B — Story「FR19 過期標示」**：渲染層需要一個過期門檻。
- **單元 C — Story「AD-16 資料齡告警」**：`fetch.yml` 需要第三個門檻（AD-16 的具體值已列為 Deferred）。

### 兩者（三者）各自如何完全合規

AD-4 說五個值互鎖：`RATE_LIMIT_PER_SEC`、`CONCURRENCY`、cron 間隔、`timeout-minutes`、`STALE_MS`。但 AD-4 的 **Binds 只有 `src/limiter.ts` 與 `.github/workflows/fetch.yml`**，而 `STALE_MS` 目前在 **`index.html:287`**：

```js
const STALE_MS = 90 * 60 * 1000;
```

——也就是**正在被 `src/site/` 取代的那一層**，兩個被 Bind 的檔案裡都沒有它。A 的測試看不到 B 的值。B 依 FR19 自行選一個數字，完全合規（FR19 沒給數字，AD-4 沒 Bind 渲染層）。C 依 AD-16 自行選第三個數字，也完全合規（AD-16 明文把該值列為 Deferred）。

**AD-4 說「不得單獨調整其一而不重算其餘」，但其中一個值住在測試看不到的地方，而另一個值根本還沒定義。**

### 具體不相容

「重算其餘」不是可測試的不變量。兩個開發者都誠實地「重算」，得到相反的設定：

- **甲**：`rate=1, conc=2` → 依 PRD §7.2 的自陳算式，冷啟動約 21 分鐘。21 > 30/2 = 15 → 違反 NFR5。甲於是把 cron 放寬為 `*/60`、`timeout-minutes` 提到 40。AD-4 滿足（五值都重算了）。**但 60 分鐘 cron + 21 分鐘回合 = 資料最舊可達 81 分鐘，破壞 §3 的「庫存摘要 ≤ 1 小時」成功指標。**
- **乙**：同樣 `rate=1, conc=2`，但引 PRD NFR5.2 的「已符合，無須變更」保持 `*/30` 與 `timeout-minutes: 25`。AD-4 也滿足（乙也重算了，只是結論不同）。**但 21 > 15，違反 NFR5；且 `STALE_MS = 90min` 在渲染層仍宣告「新鮮」，AD-16 的資料齡門檻尚未定值。**

兩人都逐字滿足 AD-4，一人破壞成功指標，一人破壞 NFR5，而三項斷言（`<=1`、`<=2`、`<=6000`）對兩人都是綠的。

### 提議的 AD（取代 AD-4 的 Rule 後半）

> **AD-4a — 互鎖以不等式表達並由測試斷言，五個值住在同一個測試看得到的地方**
>
> - **Binds 擴充為**：`src/limiter.ts`、`.github/workflows/fetch.yml`、`src/site/**`。
> - `STALE_MS` 與 AD-16 的資料齡門檻由 `index.html` 遷入 `src/limiter.ts` 作為 exported 常數，與其餘四值同檔。
> - **Rule 的「重算其餘」改為四條可執行的不等式，由測試斷言**（`expectedColdRunMinutes` 與 `expectedWarmRunMinutes` 為以 rate、concurrency、目錄規模、實測平均延遲計算的純函式）：
>   1. `expectedColdRunMinutes <= cronMinutes / 2`（NFR5）
>   2. `timeoutMinutes >= 2 * expectedColdRunMinutes`（NFR5.2）
>   3. `STALE_MS >= (cronMinutes + expectedWarmRunMinutes) * 60000 * 1.5`（避免正常運作被誤標為過期）
>   4. `cronMinutes + expectedWarmRunMinutes <= 60`（§3 的「庫存摘要 ≤ 1 小時」）
> - 任一常數變動而不等式不成立時，CI 失敗並印出違反的那一條——這才是「互鎖」，而不是註解裡的一句提醒（AD-4 自己的 Prevents 已經證明註解擋不住）。

---

## F11 🟡 Medium — `robots.txt` 與 `sitemap.xml` 有兩個擁有者，且 AD-9 字面上禁止它們

### 兩個單元

- **單元 A — Story「FR23 robots.txt 代理立場」**。脊椎的源碼樹寫著：

  ```text
  （公開 repo）
    只有建置產物 + robots.txt + sitemap.xml
  ```

  這句話把 `robots.txt` 與 `sitemap.xml` 列在**「建置產物」之外**、與之並列，最自然的讀法是它們是 repo 常駐檔。A 於是在公開 repo 手動 commit 一份 `robots.txt`。
- **單元 B — Story「sitemap 與 AD-19 驗證」**。AD-19 要求驗證「`sitemap.xml` 涵蓋所有可索引頁」，而可索引頁只有產生器知道，故 B 由 `src/site/generate.ts` 產出 `sitemap.xml`（並順手產出 `robots.txt`，因為 FR23 要求「清單須可維護」）到 `dist/`。

### 具體不相容

視 F4 的推送方式而定，結果是兩種相反的靜默失敗：

- **加法式推送（F4 甲）**：A 手寫的 `robots.txt` 永遠不被覆蓋，B 產生的那份也永遠不會生效（若路徑相同則以 `cp` 覆蓋，若 A 的在 repo 根而 B 的在 `dist/` 子路徑下則兩者並存但只有根目錄那份會被 Pages 服務）。**FR23 的 Disallow 清單從此凍結**——`GPTBot`、`ClaudeBot`、`Google-Extended` 繼續爬，而那是 PRD 花了一整節（§6.6、R11）做出的商業決策，被一行 deploy script 反轉。
- **取代式推送（F4 乙）**：A 手寫的 `robots.txt` 在第一次發佈時被刪除。若 B 那時還沒把 `robots.txt` 納入產生器（兩個 story 不同 sprint），站台會有一段時間**完全沒有 robots.txt**。

**第三個問題**：AD-9 的 Rule 是「公開站台**只**發佈渲染後的 HTML 與 FR21 要求的逐頁 JSON-LD」。逐字讀，`robots.txt` 與 `sitemap.xml` 都不在允許清單內——AD-9 字面上禁止了 AD-19 與 FR23 所要求的檔案。一個逐字執行 AD-9 的稽核 story 會刪掉它們。

### 提議的 AD

> **AD-9b — 發佈樹是白名單，且完全由產生器產出**
>
> - **Rule:** 公開 repo 中被服務的每一個檔案，都必須由 `src/site/generate.ts` 產出。公開 repo **不得有任何人工維護的檔案**。
> - 允許的檔案類型窮舉為：`*.html`（含其內嵌 JSON-LD）、`robots.txt`、`sitemap.xml`、`CNAME`、自製圖示（AD-7 要求的自製資產）。任何 `.json`、`.csv`、`.xml`（`sitemap.xml` 除外）一律禁止。
> - FR23 的代理清單存為私有 repo 的 `src/site/agents.json`（產生器的輸入），使「新代理出現時應能追加」不需改程式碼，且變更留在私有 repo 的稽核紀錄裡。
> - 脊椎源碼樹中「只有建置產物 + robots.txt + sitemap.xml」的寫法須改為「**只有建置產物**（其中包含產生器產出的 `robots.txt` 與 `sitemap.xml`）」，以消除「它們是 repo 常駐檔」的讀法。

---

## 附錄 A：AD 修改索引

| 現有 AD | 動作 | 新編號 |
| --- | --- | --- |
| AD-3 | 收緊：節制為行程級；渲染層外送請求恆為 0；concurrency 提升至 repository 層級 | AD-3a |
| AD-4 | 收緊：Binds 加入渲染層；`STALE_MS` 遷入 `limiter.ts`；「重算」改為四條可測不等式 | AD-4a |
| AD-5 | 收緊：公開 repo 無歷史，orphan commit force-push；稽核閘檢查內容而非路徑 | AD-5a |
| AD-8 | 收緊：括號中的理由升格為 Rule；渲染層輸入為封閉集合 `{days.json, index.json}` | AD-8a |
| AD-9 | 收緊：JSON-LD 欄位白名單（禁 per-date 數字）；發佈樹白名單且全由產生器產出 | AD-9a, AD-9b |
| AD-11 | 收緊：視角是內容軸非 canonical 軸；兩視角必須各有獨有內容 | AD-11a |
| AD-12 | **重寫**：三態以真值表定義；`releaseHorizon` 為全域欄位；禁用 `latestDate` 為輸入；轉置不得丟棄 `available:false` 的列 | AD-12a |
| AD-14 | **重寫**：版本號為單調登記簿，禁止預先配發；守衛為嚴格相等 + 形狀驗證 | AD-14a |
| AD-14 | 新增：`days.json` 自帶 `generatedAt` 與覆蓋計數；禁止使用 `index.updatedAt` 作為對外時間 | AD-14b |
| AD-15 | **重寫**：分級旗標 + 共用 parser + fail-closed；step 層守衛；build 加 `workflow_dispatch` 與心跳；L3 由建置層達成 | AD-15a |
| AD-16 | 新增第六項失敗條件：合理性下限（列數暴跌或為零必須紅且不得 commit） | AD-16a |
| AD-18 | **重寫**：設施名稱擁有者由 `NAME_LANGS` 決定且唯一；誠實陳述新增語言的兩種成本；`ja` 無 terms 表；`Localized` 改為可擴充 | AD-18a, AD-18b |
| AD-19 | 收緊：驗證對象為將被服務的樹；補三項 canonical／hreflang 檢查 | AD-19a, AD-19b |
| Conventions | 補一列：排序規則（位元組序 tiebreak，禁 `localeCompare`） | — |

## 附錄 B：未構成 finding 的觀察

以下項目在攻擊中被檢視但無法寫成失敗劇本，記於此以免重複審查：

- **AD-1、AD-2、AD-17、AD-20**：這四條的 Rule 是禁止式且值域為布林（做了／沒做），無法被兩個單元用相容的方式做出不同結果。攻擊失敗。
- **AD-6 的 `workflow_run` checkout ref**：兩個開發者可能一個用預設 checkout、一個用 `ref: ${{ github.event.workflow_run.head_sha }}`（處理 PR 時的正確寫法，且被廣泛複製），後者會取到抓取回合**推送資料之前**的 SHA，造成站台永遠落後一個週期。這是真實的 GitHub 語意陷阱，但在本專案的排程觸發下 head_sha 通常已包含資料 commit（push 是 fetch job 的最後一步，`workflow_run` 事件在 job 完成後才發出），故**不穩定地**成立。列為實作備註而非 finding：建議 `build.yml` 的 checkout 明確指定 `ref: main` 並在 log 印出 `git rev-parse HEAD`，使落後一個週期時可被觀察到。
- **`--product=` 部分回合造成的混齡矩陣**：`buildDays()` 從磁碟讀取全部產品（`src/fetcher.ts:124-127`），故部分回合仍產出完整日曆，但其中部分產品的資料可能是數日前的，而 `index.json` 以 `stale: true` 標記。這是 F2 的一個特例，已由 AD-14b（per-product `fetchedAt` 為唯一時間來源）涵蓋，不另列。

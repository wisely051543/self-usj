---
title: 'ARCHITECTURE-SPINE 規準審查（good-spine checklist）'
target: '_bmad-output/planning-artifacts/architecture/architecture-usj-2026-08-21/ARCHITECTURE-SPINE.md'
reviewer: rubric-reviewer
date: '2026-08-21'
verdict: FAIL
---

# 規準審查 — ARCHITECTURE-SPINE.md

**裁決：FAIL。**

不是因為方向錯。層次切分、單一外送閘門、三態單點推導、兩軸各自擁有 URL、兩 repo 拓撲——這些都切在對的地方。裁決為 FAIL 的理由只有三條：

1. **脊椎最高風險的那一條不變式（AD-5），其前提在現實中已經是假的**，而脊椎沒有任何一句處置它。這不是「待辦」，是脊椎在批准一個不存在的現況。
2. **AD-4 用 CI 強制的那個上限，會讓實作違反 PRD NFR5。** 一個規則若照做即違規，它不是護欄。
3. **兩個本層次擁有的維度整個沉默**（量測／同意堆疊、CI 強制點），且三條 PRD 需求（NFR15.2／15.3／15.4）在 `binds` 與 Capability Map 中皆不存在。

以下逐條對照 checklist。

---

## 1. 是否釘住了下一層（epics/stories）真正會分歧的點？有無遺漏？

**已釘住的（不重述優點，僅列出以界定遺漏）**：層依賴方向、外送閘門唯一性、快照 schema 版本剛性、三態單點推導、URL 軸數、字串表形狀、SEO 驗證腳本、兩 workflow 拓撲、失敗邊界清單、kill switch 三級。

**遺漏的分歧點**（每一項都會讓兩個 story 各自發明一套）：

| # | 遺漏 | 為什麼會分歧 |
|---|---|---|
| F8 | **URL 文法與 base URL** | AD-11 只釘住**數量**（6），沒釘住**形狀**：locale 段的位置、視角段的字面（`by-date`／`date`／`calendar`？）、尾斜線 vs `.html`、以及絕對 base URL（隨網域一起 Deferred）。至少六個消費者必須一致：產生器、`sitemap.xml`、hreflang/canonical、JSON-LD 的 `@id`／`url`、`robots.txt`、語言與視角切換器。脊椎一句未定，而 AD-19 的驗證腳本要檢查「三向互指且對稱」——它檢查的是產生器自己編出來的 URL 集合，兩邊一起錯就一起綠。 |
| F12 | **三態欄位的載體與列舉值** | AD-12 說「寫成 `days.json` 的顯式欄位」，AD-14 說 Days 由 1 升至 2。但今天的 `days.json` **只承載可購的 (票種, 日期) 對**（`fetcher.ts:133` `if (!date.available) continue;`）——FR3.1 要分類的正是「不在裡面的那些對」。三態要掛在哪裡（每日補全整份票種名冊？改為每票種的日期 map？），列舉值是什麼（`soldout`／`not-yet`／`closed`／`unknown`？），脊椎皆未定。AD-12 的整個 Prevents 就是「多個消費者各自重推而分歧」——載體與列舉不定，fetcher story 與 renderer story 立刻重演該分歧。 |
| F4 | **陳舊判定在哪個時點做** | 見第 2 節 F4。 |
| F14 | **FR12 語言選擇的保存機制** | 現況是 `localStorage` + `detectLocale()`（`index.html:507`）。改為每語言獨立 URL 後，「保留上次選擇」只剩兩條路：JS 轉向（傷 AD-8／FR16，並製造 canonical 與 soft-404 雜訊）或放棄該行為。Capability Map 把 FR12 掛在 AD-18／AD-11 下，這兩條都沒有一個字談到它。 |
| F13 | **公開 repo 的發佈語意：整棵樹取代 vs 合併** | 源碼樹寫「只有建置產物 + `robots.txt` + `sitemap.xml`」。`sitemap.xml` 是產生的，`robots.txt` 卻被單列——若推送是整棵樹取代，手維護的 `robots.txt` 每次部署被刪；若是合併，鍵消失的舊頁永遠不會被移除，而 AD-19 只檢查 sitemap **涵蓋**所有可索引頁，抓不到「多出來的孤兒頁」。FR23 還要求代理清單「可維護」，沒有任何 AD 管它，AD-19 也不驗證它。 |
| F23 | **FR4 稀缺門檻（10）的落點** | 慣例只說「為設定值，不得寫死於版面邏輯」，沒說住哪（建置設定？`i18n`？常數模組？）。一行的事，但這正是兩個 story 會各放一處的東西。 |
| F20 | **`.claude/skills/localizing/SKILL.md` 的同步** | memlog 第 45 行明文記為 AD-18 的連帶動作，**蒸餾到最終脊椎時掉了**。該 skill 現在仍寫著 chrome strings 住在 `index.html` 的 `STRINGS`（`SKILL.md:10`、`:37`）。下一個做在地化的 agent 會照舊地圖走。 |
| F21 | **`index.html` 的處置** | 它在源碼樹裡完全不存在，只在 AD-18 被提到「STRINGS 遷入」。刪除？留作開發用？還是它的純函式字串組裝邏輯**就是**產生器的來源（memlog 第 34 行否決 Astro 的理由之一正是「不必全部重寫」）？P1 的 story 會在這裡直接分岔。 |

---

## 2. 每條 AD 的 Rule 是否真的可強制？是否真的防住它宣稱的分歧？

### 🔴 F2（high）— AD-4 的規則照做即違反 NFR5

AD-4 要求 CI 斷言 `CONCURRENCY <= 2`。PRD 自己的算術（NFR4 的 `[NOTE FOR PM]`、NFR5.2、§7.2 實測推論）是：並行度由 4 降到 2 → 冷啟動由約 12 分鐘推到**約 21 分鐘**。而 NFR5 要求「單回合耗時不超過排程間隔的一半」＝ cron `*/30` 下的 **15 分鐘**。21 > 15。

脊椎的 Structural Seed 明確保留 `cron */30`，且**通篇沒有一個字提到 `timeout-minutes`**（NFR5.2 明文要求並行度降半時逾時必須一起調高，現值 25 分鐘）。

結果：一個滿足 AD-4 測試的實作，同時違反 NFR5，並把 timeout 餘裕從一倍壓到 16%。這條規則不是護欄，是陷阱。PRD 的 P0 結論是「**孤立單值變更**：`RATE_LIMIT_PER_SEC: 5 → 1`，cron／逾時／`STALE_MS` 皆不必動」——AD-4 把 PRD 明確標為「有真實代價、須整組重算」的那一半，寫成了無條件的 CI 硬上限。

**修法**：`CONCURRENCY <= 2` 要嘛降級為目標值並移出 CI 斷言，要嘛同時在 AD-4 內釘住配套（cron 放寬至 60 分鐘 + `timeout-minutes` 上調），二選一，不能只寫上限。

### 🔴 F3（high）— AD-4 的斷言在今天的程式碼上寫不出來，且第五個值不在它綁定的範圍內

- `RATE_LIMIT_PER_SEC`、`CONCURRENCY`、`MAX_REQUESTS_PER_RUN` 都是 `src/limiter.ts` 的**未匯出** module 常數（`limiter.ts:13/16/26`）。測試讀不到它們。這件事本身是實作細節，但 AD-4 的整個價值建立在「機器讀得到這三個值」上，脊椎連一句「這三個常數須匯出（或以可讀設定承載）」都沒有。
- 更嚴重：**`STALE_MS` 根本不在 `src/`**。它在 `index.html:287`（`90 * 60 * 1000`），是用戶端常數。AD-4 的 Binds 只有 `src/limiter.ts` 與 `.github/workflows/fetch.yml`——五值互鎖裡的第五個值，落在兩個被綁定檔案之外，而 `index.html` 依 AD-8／FR16 正要被退役。它遷去哪裡（渲染層？共用設定？），脊椎未定。

### 🟠 F2b（medium-high）— 「五值互鎖」是願望，不是約束

> 「且 `RATE_LIMIT_PER_SEC`、`CONCURRENCY`、cron 間隔、`timeout-minutes`、`STALE_MS` 五者互鎖：不得單獨調整其一而不重算其餘。」

這句沒有可判定的謂詞。「重算了沒有」不可檢查。AD-4 的前半（三個 `<=` 斷言）是本脊椎最好的規則之一，後半退回成註解——而 AD-4 的 Prevents 自己寫著「註解已被證明擋不住」。

**可檢查的版本存在且便宜**：一支測試由五個值推導預估冷啟動秒數，斷言 `est < cron_interval/2` 且 `est < timeout*60`。這正好也會擋下 F2。脊椎沒有要求它。

### 🔴 F4（high）— AD-8 與 FR19／NFR11 的衝突未解

FR19 要求「資料超過新鮮度門檻仍未更新時，頁面須**主動標示**」，NFR11 要求「不得靜默呈現陳舊數字」。現況是**檢視時**計算（`index.html:918`：`Date.now() - fetchedAt > STALE_MS`）。

AD-8 把全部事實 bake 進 HTML、頁面不得執行期 fetch。一張在 T 時刻建置的靜態頁，無法在 T+3 天自己知道自己過期了。

脊椎唯一的重建觸發是 AD-6 的 `on: workflow_run`。它沒有說：(a) 該觸發必須不過濾 `conclusion`（`workflow_run` 在失敗完成時也會觸發，但業界慣用寫法是 `if: github.event.workflow_run.conclusion == 'success'`——照慣例寫，抓取全滅就不重建，陳舊橫幅**永遠不會出現**，正是 FR19／NFR11 存在要防的那個失效）；(b) build.yml 是否另有 `schedule` 與 `workflow_dispatch`。

AD-6 只說「建置 workflow 須能在無新資料的情況下獨立成功執行」——「能夠」不等於「會被觸發」。

### 🟠 F5（high）— AD-15 的後備閘門會廢掉 AD-15 自己的 L2

AD-15：主機制是檔案旗標（建置層讀取 → 站台自動進入 L2），「GitHub UI 停用 workflow 為後備第二道閘」。

若真的走後備——在 GitHub UI 停用 `fetch.yml`——則 `workflow_run` 永不觸發，`build.yml` 永不執行，站台**永遠不會進入 L2**，繼續以正常樣式顯示逐漸腐朽的資料。那字面上就是 AD-15 自己寫的 Prevents。

同一條的 L3（整站下架）宣稱「每一級皆須可由單一動作達成」，但**沒有指名任何 L3 機制**。檔案旗標做不到 L3。脊椎的 Prevents 特別強調「R15 假處分情境下 L3 不得需要登入第三方後台」——然後把該級的機制留白。

### 🟠 F6（high）— AD-18 的「缺 key 即失敗」與既有設計相反，且會讓 CI 綁在外部事件上

`src/i18n-check.ts` 的 docstring 明說：「a term the tables miss **does not break the page** — it renders in Japanese, **which is by design**」，且「The store's wording **changes with every season**」。這支腳本的設計是**回報殘餘**，不是 gate。

而且兩張表**不同構**：
- `ui.<locale>.json`：以訊息 id 為 key，`ja` **需要**一份（`localizing` skill 的 `undefined` 陷阱正是針對它）。
- `terms.<locale>.json`：以**日文來源片語**為 key 的最長優先替換表，`ja` **不該有**（`i18n-check.ts:TABLE_LOCALES = ['zh-TW','en']`，ja 是來源）。它本質上永遠不完整。

把「缺 key 即失敗」一體套用到兩張表，等於讓 USJ 每季改一次文案就紅一次建置，而 repo 內沒有任何修法。AD-18 需要把兩張表的**失敗語意分開**：`ui.*` 全有全無、CI 硬失敗；`terms.*` 覆蓋率回報、不阻斷（或設覆蓋率下限）。

### 🟠 F7（high）— 「新增語言＝新增兩個 JSON 檔，不改程式碼」被現有程式碼直接否證

- `src/i18n-check.ts`：`TABLE_LOCALES = ['zh-TW', 'en']` — 寫死。
- `index.html:304-309`：`LOCALES`、`LOCALE_LABELS`、`INTL_LOCALE`、`STORE_PATH` — 四張寫死的表，其中 `STORE_PATH`（`/zh/tw/`、`/ja/jp/`、`/en/us/`）與 `INTL_LOCALE` 是**不可能從 BCP 47 標籤推導**的資料。

AD-18 直接斷言結果，沒有決定機制。要成立，脊椎必須釘住「locale 名冊本身是資料」（`i18n/locales.json` 或檔名 glob），並指定 `LOCALE_LABELS`／`INTL_LOCALE`／`STORE_PATH` 這三份**無法推導**的映射住在哪。否則第一個新增語言的 story 就會回頭改程式碼，AD-18 的 Prevents（「一半改 JSON、一半改程式碼」的不對稱）當場落空。

### 🟠 F18（medium）— 風險最高的兩條規則（AD-3、AD-5）是唯二沒有閘門的

AD-4（低風險）拿到 CI 測試；AD-3（所有節制承諾的前提）與 AD-5（NFR9.1 的整個前提）只有「不得」「一律拒絕」——審查時的意圖，不是約束。兩者都便宜可檢查：

- AD-3：CI 對 `src/` grep `\bfetch\(`，allowlist 只留 `limiter.ts`。（附帶：今天全庫**確實**沒有繞過閘門的 `fetch(`，AD-3 是純批准——正因為現況乾淨，加一道 grep 的成本是零。）
- AD-5：發佈步驟斷言推送樹內不含 `data/`、不含任何非 sitemap 的 `.json`。

### 🟠 F15（medium）— AD-16 的 Binds 指錯層，且其中一個條件需要不存在的計數器

AD-16 Binds 寫「NFR8, NFR10, NFR19, **發佈層**」。但它五個失敗條件裡有四個（403／連續 429、`budgetExhausted`、連續 N 回合失敗、資料齡）屬於**節制層／協調層**，不是發佈層。沒有任何一層被指派為擁有者。

「連續 429」尤其：`limiter.ts:93-98` 對 429 重試三次後**把 response 原封交回呼叫端**，而 `usj.ts` 的失敗會被 `fetcher.ts:255` 收成單一產品失敗——而單一產品失敗依設計不紅（`fetcher.ts:314`，AD-16 自己也保留了這條）。要偵測「持續封鎖」必須在節制層加一個跨請求的計數器。脊椎沒說誰做。

### 🟡 F16（medium）— AD-15 與 AD-16 的交互未解

kill switch 開啟 → 抓取 `exit 0` → 資料齡持續增長 → 越過 AD-16 的「資料齡超過門檻」→ job 必須失敗？在一個**刻意停止**的系統上每半小時紅一次，等於訓練營運者忽略紅燈。抑或該檢查在旗標存在時被抑制？未定。

### 🟡 AD-1／AD-2／AD-17 — 可接受的非程式碼規則

這三條本質上是範圍禁令與命名禁令，不可能寫成測試，這沒問題。AD-1 還明確寫了升級路徑（「須先在架構層被推翻，不得由實作階段自行判斷」），是本脊椎處理法遵護欄最好的一段。**不列為 finding**（AD-17 的問題見 F19，那是別的事）。

---

## 3. Deferred 裡有沒有東西會讓兩個單元分歧？

| Deferred 項 | 判定 |
|---|---|
| 網域名稱與營運主體形態 | 🔴 **是**。網域決定 base URL，而 canonical（FR14）、hreflang（FR14）、`sitemap.xml`（FR17）、JSON-LD 的 `@id`／`url`（FR21）全都需要**絕對** URL。脊椎沒有一條規則說「base URL 是單一建置時設定，所有絕對 URL 由它推導」。這正是最典型的「三個 story 各自寫一個常數」。**修法便宜**：把「base URL 為單一注入設定」寫成慣例即可，網域本身仍可繼續 Deferred。見 F8。 |
| 公開站台 repo 的發佈方式 (a)/(b) | 🟡 選項本身無害（兩者都不影響 AD），但**與之綁在一起的「整棵樹取代 vs 合併」語意沒有被 Deferred，是根本沒被提出**。見 F13。 |
| AD-16 的 N 與資料齡門檻 | 🟡 值可延後，但脊椎沒說**在值定出來之前 AD-16 對這兩項是失效的**。P0 交付時會出現「AD-16 已實作」但其中兩條靜默不作用的狀態。至少該寫一個保守暫定值（例如 N=3、資料齡 = 3 × 排程間隔），到期再依 Actions 歷史校準。 |
| §11 補貨訊號的資料模型 | ✅ 無害。AD-5 確實保住其前提。 |
| 廣告版位數量與位置 | 🟠 **部分有害**。位置可延後，但 **NFR18 明文要求「廣告版位不得造成版面位移」**——那是一條**架構級**約束（版位必須是建置時保留固定高度的容器，而非讓 AdSense auto-ads 在執行期插入）。這條被連同版位詳規一起延到 P3，而版面骨架在 P2 就凍結了。等到 P3 才知道要留位，就是回頭改版面。 |
| Core Web Vitals 門檻 | ✅ 無害，且「不在脊椎複製數值以免過期」是對的做法。 |
| 請求標頭是否帶中性 bot 識別 | ✅ 無害。 |
| 每票種／每月頁面（O11） | ✅ 無害，AD-10 確實保住了成本。 |
| `NAME_LANGS` | ⚠️ 註記：`NAME_LANGS` 這個識別字**在整個 repo 裡不存在**（`index.html` 對應的是 `LOCALES`／`INTL_LOCALE`）。Deferred 條目指向一個不存在的符號，讀者會找不到它。 |

---

## 4. 具名技術是否為當期版本？

**大致通過。** 逐項查證（2026-08-21）：

| 項目 | 脊椎的說法 | 查證 | 判定 |
|---|---|---|---|
| Node.js 24.x | Active LTS、EOL 2028-04-30 | nodejs.org：v24 (Krypton) LTS，EOL 2028-05；v26 為 Current；v20 已 EOL | ✅ |
| Node 20 已 EOL | 2026-04-30 | 正確；`.node-version` 現釘 `20.17.0`，確實跑在無安全支援的執行環境上 | ✅ 且是對的發現 |
| Astro 7.2.x（不採用） | — | 7.0 於 2026-06 發佈，最新 7.2.x（2026-08） | ✅ |
| Eleventy 3.1.6（不採用） | — | 最新穩定 3.1.6 | ✅ |
| Cloudflare Pages 免費 500 builds/月 | 否決依據 | 與官方 limits 相符 | ✅ 數字正確（但推論有問題，見 F17） |
| GitHub Pages 10 次/小時軟上限 + 自訂 Actions workflow 豁免 | — | 相符 | ✅ |

### 🟡 F22（low）— 唯一沒被套用同一把尺的：`ts-node ^10.9`

它被標為「（既有）」直接沿用。ts-node 的最後一版是 10.9.2（2023-12），而脊椎同時 (a) 升到 Node 24，(b) 採用 `node:test`。Node 24 內建 TS type-stripping，`--loader` 路徑在該版已被 deprecate。**在 CommonJS + `.ts` 上怎麼跑 `node:test`**，脊椎一字未提——而 AD-4（P0 唯一的機器強制護欄）就靠它。這不是「版本錯」，是「別處都做了當期查證，這裡沒做」。

---

## 5. 是否 RATIFY 而非牴觸既有 brownfield 程式碼？

### 🔴🔴 F1（critical）— AD-5 與 AD-9 所描述的現況是假的，而脊椎沒有任何處置

實測（2026-08-21）：

```
GET https://api.github.com/repos/wisely051543/self-usj
  "private": false        "visibility": "public"       "has_pages": true
  "created_at": "2026-08-15T04:16:14Z"

GET https://wisely051543.github.io/self-usj/                 → 200
GET https://wisely051543.github.io/self-usj/data/days.json   → 200
GET https://raw.githubusercontent.com/.../main/data/days.json → 200

git log --oneline | wc -l  → 50 commits（data/ 自 2026-08-15 起）
```

也就是說：

- **AD-5**（「抓取管線、`data/` 及其完整 git 歷史只存在於**私有** repo」）在此刻是假的。它的 Prevents 是「NFR9.1 第 1 項（停抓後銷毀抓取資料及其衍生物）因歷史已被 fork／GHArchive／clone 散佈而在技術上不成立」——**這件事已經發生了六天**，並且每小時還在往公開歷史裡加一個 commit。
- **AD-9**（「不得把 `days.json` 掛成任何人可 `curl` 的免費 API」）的 Prevents **就是目前的線上狀態**。`days.json` 現在任何人可 curl，兩家收費競品也可以。

而 memlog 第 21 行把現況記為：「**無任何部署管線**：無 Pages workflow、無 CNAME、無 robots.txt、無 sitemap — **站台目前不存在於網路上**」。這是本次教練階段的事實基礎錯誤：GitHub Pages 的「deploy from branch」模式**不需要 workflow**，`has_pages: true` + 200 就是證據。脊椎的兩 repo 拓撲是從這個錯誤前提推導出來的。

**脊椎需要補的不是一句「要私有」，而是一個明確的切換決策**（且它是 P0 級，因為每過一小時代價就變大一點）：

1. 現有 repo 轉私有，還是新建私有 repo？（轉私有會使既有 Pages 站台失效——免費方案私有 repo 不支援 Pages，這點 memlog 第 29 行自己記對了。）
2. 既有的 50 個公開 commit：purge 歷史後強推，還是承認**已散佈的部分無法回收**、AD-5 僅對「此後」成立？後者是誠實的，但那句話必須寫在 AD-5 裡，否則 NFR9.1 的程序書會建立在一個做不到的承諾上。
3. `wisely051543.github.io/self-usj/` 這個現存站台何時、由誰下架。
4. 公開站台 repo 的**名稱**（見 F19）。

只要這四點還沒被脊椎決定，AD-5 就不是不變式，是願望。

### 🟠 F17（medium）— cron 的可靠度前提被本 repo 自己的歷史否證

脊椎否決 Cloudflare Pages 的理由是「壓進額度需降到約每 1.5 小時，**會打破『庫存摘要新鮮度 ≤ 1 小時』**」；AD-4 的五值互鎖也把「cron 間隔」當成一個受控常數。

本 repo 最近 15 個 commit 的實際間隔（08-20 23:32 → 08-21 12:50，單位分鐘）：

```
25, 32, 33, 47, 54, 56, 56, 57, 60, 65, 69, 70, 84, 90
```

cron 是 `*/30`，但 GitHub 的排程執行是排隊制、經常延遲甚至跳過。**≤ 1 小時的新鮮度目標在現行平台上已經常態未達成**（14 個間隔裡有 6 個 > 60 分鐘，最長 90 分鐘）。

兩個後果：(a) 「Cloudflare 每 1.5 小時會打破 ≤1h」不能作為區辨兩平台的理由，因為 incumbent 也在打破；(b) 「cron 間隔」不是一個可以拿來算互鎖的常數，實際交付間隔才是。`index.html` 的 `STALE_MS = 90 分鐘` 看起來正是為了吸收這個漂移而選的——那是既有程式碼裡的一個訊號，脊椎沒有接。

### 🟠 F19（medium）— AD-17 與現存識別牴觸，而脊椎把它整包丟給 Deferred

- `index.html:6`：`<title>USJ Express Pass 時段查詢</title>` —— 以「USJ」識別本站。
- 公開 URL：`wisely051543.github.io/**self-usj**/` —— repo 名即是識別的一部分。

AD-17 禁止的正是這個。脊椎把「網域名稱」Deferred 到律師意見，但 **AD-17 的射程包含頁面標題與 repo／子路徑名稱，而這兩者在 P1 就要凍結、且不受網域決策阻塞**。脊椎沒有寫下這個過渡期規則，於是 P1 可以在「網域還在 Deferred」的掩護下，發佈一個違反 AD-17 的識別。

### ✅ 正確 RATIFY 的部分（列出以示已查核）

- `Source` port ↔ `src/types.ts:178`、adapter ↔ `src/sources/usj.ts` — 相符。
- 「單一產品失敗不阻斷其餘、不紅」↔ `fetcher.ts:314`（`failed === targets.length` 才 exit 1）— 相符。
- 「只在答案改變時寫、比對排除時間戳」↔ `contentKey()`（`fetcher.ts:58`）與 `writeDays()` — 相符。
- 「`null` 表示未揭露／未取得，不得與 `0` 混用」↔ `types.ts` 各處註解 — 相符。
- 「`dayOfWeek` 以 `0=Sun…6=Sat` 數字攜帶、標籤由渲染層產生」↔ `types.ts:44` — 相符。
- JST 日曆日 ↔ `dates.ts` 的 `todayJST` — 相符。
- AD-3（無繞過閘門的 `fetch`）↔ `grep -rn "fetch(" src/` 除 `limiter.ts` 外零命中 — 現況已成立，脊椎是純批准。
- AD-6 的 GitHub 事實（`GITHUB_TOKEN` 推的 commit 不觸發 `push` workflow；`workflow_run` 僅同 repo 有效）— 皆正確。
- AD-7 vs `imageUrl`：脊椎要求呈現端不熱連結，`ProductSummary.imageUrl` 仍留在資料層——這不是牴觸（PRD NFR3.1 要求的就是這個變更），不列為 finding。

---

## 6. 是否覆蓋 PRD 的需求（Capability → Architecture Map）？

### 🔴 F9（high）— 三條 PRD 需求完全沒有架構落點

`binds` 從 `NFR15, NFR15.1` 直接跳到 `NFR16`；Capability Map 從「NFR13–NFR15.1」直接跳到「NFR16–NFR19」。以下三條在脊椎中**不存在**：

| 需求 | 內容 | 為什麼不能當成「實作細節」 |
|---|---|---|
| **NFR15.2** | 須提供隱私權政策頁 | 是**新的可索引頁面**。AD-11 明文寫死「實際頁數為 3 語 × 2 視角 = **6 個可索引 URL**」——加上隱私權、免責、聯絡（NFR9.2）三語版本後這個數字就錯了，而 AD-19 要驗證「`sitemap.xml` 涵蓋**所有可索引頁**」與「三語 hreflang 三向互指」。脊椎從未列舉這個頁面集合。 |
| **NFR15.3** | 電気通信事業法「外部送信規律」的通知／公表頁 | 同上（又一個頁面），且它的內容取決於**站上實際載入哪些第三方腳本**——而那件事脊椎也沒決定（見 F10）。 |
| **NFR15.4** | EEA／UK 流量須用經認證的 CMP | **這是架構級的**：CMP 是一支阻斷式的第三方 runtime 腳本，直接壓在 AD-8（頁面行為）、NFR18／CLS（FR25 明文要求廣告不得造成版面位移）、以及 FR25 的載入順序上。它不能等到 P3 才第一次被想到。 |

另：`binds` 也漏了 **FR6** 與 **FR7**（Capability Map 的「FR1–FR7」列涵蓋了，但 frontmatter 的機器可讀清單沒有——兩者不一致，下游若以 `binds` 做追溯就會漏）。

### 🟠 F9b（medium）— NFR16–NFR18 的 Map 列是空頭支票

> 「NFR16–NFR19 行動與效能 | 渲染層 | AD-8, AD-11」

AD-8（不執行期 fetch）與 AD-11（各軸獨立 URL）**與 NFR16／NFR17／NFR18 沒有任何關係**：不依賴橫向捲動（NFR16／FR6）、可點擊目標大小與字級（NFR17）、CWV 與廣告版位零位移（NFR18／FR25）——這三條沒有任何 AD 管轄。只有 NFR19 真的由 AD-8 承接。這一列讓 Map 看起來滿格，實際是三條需求無家可歸。

（本審查不主張把版面規範塞進脊椎——那是 UX 層的事。但脊椎至少要**指名**這三條由誰承接，或明確寫入 Deferred／Open question，而不是掛在兩條不相干的 AD 底下。）

### ✅ 其餘覆蓋良好

FR1–FR5、FR8–FR14、FR16–FR24、NFR1–NFR12、NFR13–NFR15.1、NFR19 都有明確且合理的落點。FR3.1／O1 的處理（AD-12 + AD-13）尤其到位：把「能不能切分」與「切不出來時怎麼辦」分成兩條，是對的切法。

---

## 7. 本層次擁有的每個維度是否都已決定／延後／列為未決？

| 維度 | 狀態 |
|---|---|
| 部署與環境 | 🟡 拓撲已定（兩 repo、Pages）。**缺**：只有 prod 一個環境（可以，但未言明）；本機如何預覽產生器輸出；發佈語意（取代 vs 合併，F13）；**以及最重要的——從現存公開站台到目標拓撲的切換（F1）**。 |
| 基礎設施／供應商 | ✅ 已決定並附否決理由（GitHub Pages vs Cloudflare Pages）。理由的一半有問題（F17），但決定本身站得住。 |
| 營運 | 🟡 kill switch 三級已定，但 L2 的觸發鏈有洞（F5）、L3 無機制（F5）、與告警的交互未解（F16）。 |
| 可觀測性／告警 | 🟡 AD-16 定義了失敗邊界並明確拒絕新增通知管道——這是一個乾淨的決定。但 Binds 指錯層（F15）、兩個門檻延後後規則部分失效（第 3 節）。 |
| 秘密 | ✅ PAT 為 fine-grained、僅該 repo `contents: write`。**缺**：存放位置（repo secret vs environment）與輪替節奏未言明，但 AD-16 已把「PAT 失效必須紅」納入，可接受。 |
| 測試 | 🔴 **F11（high）**。Stack 寫了 `node:test`，AD-4 寫「斷言失敗即 CI 失敗」，AD-18 寫「由 CI 檢查」，AD-19 寫「是建置的一部分」——**但源碼樹只有 `fetch.yml` 與 `build.yml`，repo 今天沒有 test script、沒有 test 目錄、沒有任何 workflow 跑 `npm run i18n:check` 或 `tsc`**。三條 AD 都指向一個不存在的強制點。特別要命的是 AD-4：它是 P0 唯一的機器強制法遵護欄，若只掛在 `build.yml`，那麼**改 `limiter.ts` 的 PR 不會被它擋**——而 AD-4 的整個 Prevents 就是「一次順手優化」。脊椎必須指名：測試在哪個 workflow、由哪個事件觸發（PR？push？兩者？），以及 `.ts` 上怎麼跑 `node:test`（見 F22）。另：來源層（`usj.ts`）打真網路，脊椎沒說它是否／如何以 fixture 測試。 |
| **量測與同意堆疊** | 🔴 **F10（high）— 整個維度沉默**。PRD §3 的「比較廣度」先行指標與 O9 需要用戶端埋點；NFR15.3／15.4 的成立與否**完全取決於站上載入哪些第三方腳本**；FR25 的 AdSense 本身就是第三方腳本。脊椎對此**一個字都沒有**：沒有「不做分析」的決定，沒有供應商，沒有同意閘門，沒有 Deferred 條目，沒有 open question。這不是遺漏一個選項，是遺漏一個維度。 |
| 從 `index.html` 的遷移路徑 | 🔴 **F21 + F14 + F3 + F1**。脊椎只提了 `STRINGS` 一件事。實際要遷的至少有五樣：`STRINGS`（已提）、`STALE_MS`（F3，脊椎當它在 `src/`）、`LOCALES`/`LOCALE_LABELS`/`INTL_LOCALE`/`STORE_PATH`（F7）、`localStorage` 語言保存與 `detectLocale`（F14）、以及**用戶端對 `data/*.json` 與 `i18n/terms.*.json` 的三處 runtime fetch**（`index.html:574/1022/1282/1361`）——最後這一項的下線時點，同時就是 AD-9 生效的時點（F1）。`index.html` 本身在源碼樹裡不存在，去留未定。 |
| 開發者體驗／在地化流程 | 🟡 F20：`localizing` skill 未同步，教練階段記得，蒸餾時掉了。 |

---

## Findings（依嚴重度）

| # | 嚴重度 | 規準 | 標題 |
|---|---|---|---|
| F1 | **critical** | 5, 7 | repo 已是 public、Pages 已上線、`data/days.json` 可公開 curl、50 個公開 commit——AD-5／AD-9 的前提在現實中已是假的，脊椎無任何切換決策（memlog 記為「站台目前不存在於網路上」，錯誤） |
| F2 | **high** | 2, 1 | AD-4 用 CI 強制 `CONCURRENCY <= 2`，照做會使冷啟動約 21 分 > NFR5 的 15 分半間隔，且未同步處理 `timeout-minutes`／cron |
| F3 | **high** | 2, 5 | AD-4 的三個常數未匯出；第五個互鎖值 `STALE_MS` 根本不在 `src/`（在 `index.html:287`），落在 AD-4 的 Binds 之外 |
| F4 | **high** | 1, 2 | AD-8（建置時 bake）與 FR19／NFR11（頁面主動標示過期）衝突未解；重建只靠 `on: workflow_run`，未規定不得過濾 `conclusion`、未指定 `schedule`/`workflow_dispatch` |
| F5 | **high** | 2 | AD-15 的後備閘門（UI 停用 fetch.yml）會使 build 永不觸發 → 站台永不進入 L2，正是 AD-15 自己的 Prevents；L3 無任何具名機制 |
| F6 | **high** | 5, 2 | AD-18 的「缺 key 即失敗」與 `i18n-check.ts` 的既有設計相反（缺詞是 by design），且兩張表並非同構；照做會讓 USJ 每季改文案就紅一次建置 |
| F7 | **high** | 2, 5 | 「新增語言不改程式碼」被 `TABLE_LOCALES` 與 `index.html:304-309` 四張寫死的表否證；locale 名冊與三張不可推導的映射沒有落點 |
| F8 | **high** | 1, 3 | URL 文法與 base URL 未決：AD-11 只釘數量不釘形狀，網域 Deferred 連帶讓絕對 URL 無單一來源，六個消費者會各自發明 |
| F9 | **high** | 6 | NFR15.2／15.3／15.4 在 `binds` 與 Capability Map 中完全不存在；連帶使 AD-11 的「6 個可索引 URL」與 AD-19 的 sitemap 檢查失去正確的頁面集合。`binds` 另漏 FR6、FR7 |
| F10 | **high** | 7 | 量測與同意堆疊整個維度沉默：§3 比較廣度／O9 埋點、NFR15.3 外部送信、NFR15.4 CMP、FR25 廣告腳本，全無決定、無延後、無未決 |
| F11 | **high** | 7, 2 | AD-4／AD-18／AD-19 都指向 CI，但源碼樹只有 fetch.yml 與 build.yml，repo 無 test script／test 目錄／任何跑檢查的 workflow；AD-4 若只在 build 生效，改 `limiter.ts` 的 PR 不會被擋 |
| F12 | **medium** | 1 | AD-12 的三態欄位載體與列舉值未定；今天的 `days.json` 只承載可購對，FR3.1 要分類的是缺席對——AD-8 的「days.json 皆已有」對售罄列並不成立 |
| F13 | **medium** | 1, 7 | 公開 repo 推送語意（整棵樹取代 vs 合併）未決 → `robots.txt` 無擁有者、孤兒頁無清除機制；FR23 的代理清單無 AD 管轄、AD-19 不驗證 |
| F14 | **medium** | 1, 6 | FR12（語言選擇保留）無機制；靜態 URL 下只剩 JS 轉向（傷 AD-8／canonical）或放棄，脊椎未選 |
| F15 | **medium** | 2 | AD-16 的 Binds 指向發佈層，但五個條件有四個屬節制／協調層；「連續 429」需要 limiter 層的跨請求計數器，無人被指派 |
| F16 | **medium** | 2 | AD-15 開啟時資料齡必然越過 AD-16 門檻 → 刻意停機的系統每回合紅燈，或該檢查須抑制；未決 |
| F17 | **medium** | 5 | cron `*/30` 的實際交付間隔為 25–90 分鐘（本 repo 近 15 個 commit），≤1h 新鮮度已常態未達成 → 否決 Cloudflare 的理由不成立，且「cron 間隔」不是可拿來算互鎖的常數 |
| F18 | **medium** | 2 | AD-3 與 AD-5（風險最高的兩條）是唯二沒有機器閘門的規則，而兩者都便宜可檢查（grep gate／發佈樹斷言） |
| F19 | **medium** | 5 | AD-17 與現存識別牴觸（`<title>USJ Express Pass…`、repo 名 `self-usj`），而過渡期規則被連同網域一起 Deferred，使 P1 可合法地發佈違反 AD-17 的識別 |
| F9b | **medium** | 6 | Map 的「NFR16–NFR19 → AD-8, AD-11」是空頭支票：NFR16／17／18 與這兩條 AD 無關，實際無 AD 管轄 |
| F20 | **low** | 1 | memlog 記錄的連帶動作（同步 `.claude/skills/localizing/SKILL.md`）在蒸餾時掉失；該 skill 仍指向 `index.html` 的 `STRINGS` |
| F21 | **low** | 1, 7 | `index.html` 在源碼樹中不存在，去留未定（刪除／開發用／作為產生器的來源），P1 story 會在此分岔 |
| F22 | **low** | 4 | `ts-node ^10.9`（最後一版 2023-12）被標為「既有」沿用，未套用他處的當期查證；Node 24 + CommonJS + `.ts` 上如何跑 `node:test` 未言明，而 AD-4 靠它 |
| F23 | **low** | 1 | FR4 稀缺門檻（10）稱為「設定值」但無指定落點 |
| — | note | 3 | Deferred 的「`NAME_LANGS`」指向一個在 repo 中不存在的識別字（對應的是 `LOCALES`／`INTL_LOCALE`） |

---

## 修復後最小可通過條件

1. **F1**：在脊椎內做出四項切換決策（現有 repo 轉私有 vs 新建、既有 50 個公開 commit 的處置、現存 Pages 站台的下架時點、公開 repo 命名），並在 AD-5 誠實寫下「已散佈的歷史無法回收」若確實如此。
2. **F2 + F3 + F2b**：把 AD-4 改成「三個上限 + 一條由五值推導的耗時斷言」，並在同一條 AD 內處理 cron／`timeout-minutes` 的連動與 `STALE_MS` 的新落點。
3. **F4 + F5**：在 AD-6／AD-15 內釘死 build 的觸發集合（`workflow_run` 不過濾 conclusion、加 `schedule`、加 `workflow_dispatch`），並為 L3 指名機制。
4. **F9 + F10**：把 NFR15.2／15.3／15.4 納入 `binds` 與 Map，列舉完整的可索引頁面集合（AD-11／AD-19 依賴它），並對量測／同意堆疊做出決定——包含「不做」也是決定。
5. **F11**：指名 CI 強制點（哪支 workflow、哪個事件），否則 AD-4／AD-18／AD-19 全是註解。
6. **F6 + F7**：拆開兩張字串表的失敗語意；把 locale 名冊與三張不可推導的映射變成資料並指定落點。
7. **F8**：加一條慣例——base URL 為單一建置時注入設定，所有絕對 URL 由它推導；並釘住 URL 路徑文法。網域本身可續留 Deferred。

# 廣告聯播網研究：USJ Express Pass 剩餘票數資料站

研究日期：2026-08-16
研究方法：純網路研究（WebSearch / WebFetch），未讀取本地程式碼。
標的站點特徵：純自動產生的資料表（每小時抓取更新）、零原創文字內容、三語（日 / 繁中 / 英）、流量預期以日本與台灣為主、個人開發者、免費站。

---

## 摘要（先講結論）

三個決定性事實：

1. **這不是「AdSense 或別家」的選擇題，而是「有沒有原創內容層」的選擇題。** 幾乎每一家值得接的網路（AdSense、Ezoic、Newor、Raptive、i-mobile、AdStir）都要求「原創、有價值、非自動產生」的內容；只有真正零審查的網路（忍者AdMax、fam8、Adsterra 類）不要求，而它們的收益低到接近雜訊（忍者AdMax 實測約 **1PV = 0.02 日圓**，即 RPM ≈ 20 日圓）。
2. **台灣本土聯播網對本站完全不可行**：Vpon / TenMax / 域動 / Ad2iction 全部是 sales-led 的企業級 SSP，合作對象是自由時報、聯合新聞網、ETtoday、三立、民視這種等級的媒體，沒有任何一家提供自助註冊或公布流量門檻。台灣流量只能靠 AdSense 或國際網路吃。
3. **對這個站，聯盟行銷（affiliate）的期望值遠高於展示廣告。** 一張 USJ Express Pass 單價 ¥8,000–¥25,000，Klook 景點類佣金 5%、KKday 透過 Involve Asia 最高約 9.6% CPS，一次成交約等於數千到上萬 PV 的 display 收入。而本站的使用者意圖（查剩餘票數）距離購買只有一步。

建議堆疊寫在文末。

---

## 1. 日本廣告聯播網

### 1.1 現況總表（2026-08 查證）

| 網路 | 現況 | 審查 | 內容要求 | 流量門檻 | 付款門檻 | 對本站可行性 |
|---|---|---|---|---|---|---|
| **nend** | ❌ **已死**，2024-03-29 停止全部廣告投放 | — | — | — | — | 不存在 |
| **忍者AdMax** | ✅ 運作中（官網 2026-07 / 2026-08 仍有公告） | **無審查**，最短 5 分鐘上線 | 無（連成人站都收） | 無 | 點數制，1pt = 0.5 日圓，每月 10 日付款，可經 PeX 兌換 | ✅ 唯一 100% 會過的，但 RPM ≈ ¥20 |
| **i-mobile Ad Network** | ✅ 運作中（2020 年與影音平台 maio 整併） | 有審查，相對寬鬆；有「0 篇文章被拒、約 5 篇可過」的實測回報 | 需有實質頁面內容 | 未公布 | 累計 **3,000 日圓**；註冊後 2 年內未達即失效 | ⚠️ 需先加內容層 |
| **AdStir**（United Marketing Technologies） | ✅ 運作中 | 2 個工作天～1 週 | **明文要求「定期更新」** ← 本站的強項 | **無 PV 下限** | 未查證 | ⚠️ 最值得試的日系網路 |
| **Zucks** | ✅ 運作中（官方資料 2025-07 仍更新） | 有審查（媒体審査），排除違反公序良俗 / 違法內容 | 一般建議 10–20 篇 | 未公布 | **3,000 日圓**，超過當月月底結算、次月月底支付；未達則保留 1 年後結清 | ⚠️ 偏 App / 智慧型手機媒體 |
| **fluct** | ✅ 運作中 | **審查嚴格**，網路上有 30 萬 PV 仍被拒的案例；個人可申請但不保證 | 重視記事數與更新頻率 | 未公布 | 未查證 | ❌ 現狀幾乎必被拒 |
| **Geniee（ジーニー）GENIEE SSP** | ✅ 運作中，日本 SSP 市佔前段，5,000+ 媒體、月約 8,000 億 imp | 需業務洽談，無自助流程 | — | 二手來源指「月 PV 需達數萬以上，否則難過審且收益低」（**未經官方證實**） | 未公布 | ❌ 規模不足 |
| **MicroAd COMPASS** | ✅ 運作中，月廣告請求數超過 450 億 | 企業級，需洽談 | — | 未公布 | 未公布 | ❌ 規模不足 |

其他在日本站長圈常被提到、值得知道的小型網路（來源為站長比較文，非官方）：

- **fam8（フィング）**：**無審查**，最低支付 3,000 日圓，PC / 行動同一組 tag，操作最接近 AdSense。缺點是「廣告經常停播，收益可能突然歸零」。
- **ムニー（UNIQUEST）**：有審查，記事下方 / 行動版位，2025 年仍被評為收益性不錯。
- **GOODLIFE**：審查較嚴、需既有流量、**僅行動版**（無 PC 版位）。
- **フォーエム（forEm）**：Google 認證 AdX 合作夥伴，收益性高，但門檻約 **月 40 萬 PV**。

### 1.2 收益現實（可引用的實際數字）

| 指標 | 數字 | 來源性質 |
|---|---|---|
| 忍者AdMax | **1PV ≈ 0.02 日圓**（1,000PV ≈ 20 日圓）、CTR ≈ 0.05%、單次點擊數日圓 | 日本站長實測部落格 |
| AdSense（日本一般雜記／趨勢部落格） | **1PV ≈ 0.6 日圓**；另一來源給 RPM 200–350 日圓（2024 年） | 站長實測，兩來源不一致 |
| 兩者差距 | 約 **30 倍** | 同上 |
| AdStir（實測） | 12,631 PV → ¥1,284；106,528 PV → ¥17,464（RPM 約 ¥100–164） | 站長實測，但該收益主要來自 wipe / interstitial 等**侵入式版型** |
| 台灣 display RPM | 約 **NT$10–60 / 千次瀏覽**（依主題），或 US$1–3 | 台灣站長／變現分析文 |

**旅遊類日本流量的 eCPM：查不到可信的公開數字。** 日本站長社群普遍認為旅遊是「高單價廣告容易出現」的主題，RPM 傾向較高，但我找不到任何具體的旅遊類平均 RPM 數據。不要在 PRD 裡引用未經證實的旅遊 RPM 假設。

### 1.3 對本站的判讀

- 本站「每小時更新」這件事在 AdStir 的審查標準下是**加分項**（明文要求定期更新），在 AdSense 標準下卻不足以彌補「零原創文字」。
- 日系網路的付款門檻普遍是 **3,000 日圓**，門檻低但需要注意 i-mobile 的「2 年失效」條款。
- 若採「無審查網路先上線」策略，忍者AdMax 是最穩的（確定會過），但要接受 RPM ≈ ¥20 的現實 —— 月 10 萬 PV 只有約 2,000 日圓。

---

## 2. 台灣廣告聯播網

### 2.1 現況

| 網路 | 定位 | 是否自助 | 合作對象 | 公布門檻 |
|---|---|---|---|---|
| **TenMax（聯ationsuite / 聯瑞）** | 自建 DSP + SSP + DMP，聯播網覆蓋率宣稱 95%、原生聯播網涵蓋 500+ 家主流媒體 | ❌ 需業務洽談 | 自由時報、聯合新聞網、壹蘋新聞網、民視、LINE TV、HamiVideo、三立、ETtoday | 未公布 |
| **域動行銷 ClickForce** | MULTIFORCE 多螢跨屏聯播網 + HOLMES DATA 數據平台，2009 年成立 | ❌ 需電話 (02)2719-8500 / service@clickforce.com.tw | 台灣主流入口與新聞媒體 | 未公布 |
| **Ad2iction 艾迪英特（Ad2 行動廣告）** | TNL Media Group 旗下，行動廣告為主，2013 成立 | ❌ 官網無媒體自助申請入口 | 跨平台消費者資料庫 | 未公布 |
| **Vpon 威朋** | 亞洲大數據行動廣告公司，主力是 **App SDK 變現**（Web SDK 也有 banner / interstitial / native 文件） | ❌ 需洽談（台灣 02-7730-8328） | App publisher 為主 | 未公布，採 CPM/CPC 動態計算 |

### 2.2 判讀（重要）

**四家全部是 sales-led 的企業級 SSP，沒有任何一家提供自助註冊、也沒有任何一家公布流量門檻。** 它們的商業模式是與大型媒體簽約後把庫存賣給品牌主，一個個人經營的資料站不在它們的商業目標內 —— 光是導入的業務成本就不划算。我沒有找到任何台灣個人站長成功接入這四家其中之一的公開紀錄。

台灣站長社群的實務共識（來自 AdSense 替代方案整理文）也印證這點：**「以台灣來說，實際收益確實 Google AdSense 算是最穩定且最多的」**，而被列為「替代品」的一律是國際的低審查網路（Adsterra、Monetag、PropellerAds、AdMaven、PopAds、Infolinks、A-ADS、ExoClick），不是台灣本土網路。

值得注意：該篇作者本人的部落格（ivonblog.com）**申請 AdSense 被拒且未獲說明理由**，這是一個具體的台灣小站被 AdSense 拒的案例點。

**結論：台灣流量的變現路徑上，本土聯播網等於不存在。繁中頁面只能靠 AdSense、國際低審查網路，或聯盟行銷。**

---

## 3. AdSense 現實檢查

### 3.1 政策原文怎麼寫（已查證）

Google 官方「您的 AdSense 帳戶未獲核准」頁面（support.google.com/adsense/answer/81904）列出的拒絕原因包含：

- **內容不足**：「以圖片、影片或 Flash 動畫為主」的網站不符資格；內容必須是「完整的句子與段落，而不只是標題」。
- **內容品質低**：網站缺乏「足夠的原創、豐富、對使用者有價值的內容」（"enough original, rich content that would be of value to users"）；**自動產生的頁面**與無附加價值的薄型聯盟內容都是問題。
- **重複／抄襲內容**。
- 其他：政策違規、導覽問題、可疑流量來源、不支援的語言。

一個關鍵的政策定位釐清：

- **「低價值內容」不在 Google Publisher Policies 的禁止清單裡。** 我實際抓取了 Google Publisher Policies 全文，禁止項目是違法內容、智財侵權、危險／貶抑內容、動物虐待、誤導性內容、欺騙行為、性內容、兒少保護等 12 類 —— **沒有「低價值內容」或「自動產生內容」這一條**。「低價值內容」只出現在術語表，且是**資格審查（eligibility）**的判準，不是政策違規。這個區別很重要：它決定了被擋是「不給你進場」還是「你違規了」。
- **「spammy automatically generated content」現在的正式名稱是 Google Search 的 "scaled content abuse"**，重點在於「**大量**產生頁面且主要目的是操縱搜尋排名」。單純「用程式產生頁面」本身不違反該政策 —— 判準是這些頁面是否真的服務使用者。本站每個日期頁提供的是真實、有用、無法在別處輕易取得的資訊，理論上不落在 scaled content abuse 的定義內。**但這是我的推論，不是 Google 的裁決。**

### 3.2 實際發生了什麼（真實案例）

**案例 A —— 工具站被拒（英文，dev.to 開發者）**
一個開發者做了 65+ 個瀏覽器端工具，加上部落格文章、API 目錄、about / privacy policy / contact 頁 —— 也就是說**不是**只有一個輸入框加廣告的薄站 —— 仍被 AdSense 以 **"Low value content"** 拒絕。他的歸因：

- **網站年齡**：Google 傾向要 3–6 個月的歷史。
- **既有流量**：Google 想要已經有訪客的站（雞生蛋問題）。
- **工具站的類別汙名**：「太多垃圾工具站毀了這個類別」，演算法預設對工具站存疑。
- 他的對策：3–4 週後**原封不動重新申請**（「很多人在第 2、3 次申請時零修改就過了」）。他建議的替代方案是 Ezoic 與 Carbon Ads。

**案例 B —— 日本的統計現實**
一份分析 2024-01 至 2025-08 期間 1,926 件日本 AdSense 合格回報的資料：

- 申請次數：平均 **4.2 次**、中位數 **3 次**、眾數 1 次（32.5% 一次過），最高 32 次。
- 合格時的文章數：平均 50.3 篇、**中位數 25 篇**、**眾數 10 篇**，範圍 1–2,606 篇。
- 通知天數：平均 9.6 天、中位數 7.5 天，29.6% 在 1 天內。
- 結論之一：「文章少或被拒多次並不預測失敗」，時機與內容品質更重要。

日本站長的通行建議是：獨立網域、隱私權政策、聯絡表單、營運者資訊、分類整理、**10–20 篇以上、每篇 1,000 字以上、含親身體驗的原創文章**。

**案例 C —— 台灣小站被拒**
ivonblog.com 作者申請 AdSense 被拒且未獲說明理由；同一作者的另一站（mcbedev.net，高瀏覽量）則在數月內成功變現。

### 3.3 執行時機：進場擋，還是事後罰？

**兩者都有，但性質不同：**

- **進場**：AdSense 會**審查整個網站**（"reviews your entire site"）以確認符合方案政策，通常數天、有時 2–4 週。這是「低價值內容」實際被執行的主要時點。
- **事後**：通過後仍會被監控。Google 自 2020 年起導入 **page-level enforcement（頁面層級處置）** —— 發現違規時**只停該頁的廣告投放**，其他無違規的頁面照常投放，不再動輒整站停權。中間層級是「站台層級處置」（整站或部分頁面停止投放）。

**可回復性：**

- 站台／頁面層級處置：到 **Policy Center** 找到該違規通知 → 修正 → 按 **「要求審查（Request Review）」**。多數違規只要及時徹底處理都可回復。
- 申請被拒：**無成本、可反覆重申請**。官方指示是「調整內容後登入 AdSense 確認已解決問題」。
- **唯一不可逆的情況**：因**無效流量**或**政策違規**遭「帳戶終止（terminated）」者，**不得再開新的 AdSense 帳戶**。單純的「未獲核准」不屬於此類。

### 3.4 對本站的判讀

- 以「純資料表、零原創文字、新網域」的現狀申請，**被以 "Low value content" 拒絕的機率很高**（我估計 >70%，此為推論非查證）。
- 但被拒**不傷帳號、可反覆重試**，成本只有時間。所以「先申請看看」是合理的，只是不該把它當成 Day-1 的變現計畫。
- 提高過審機率的最高槓桿動作（依據上述來源）：
  1. **加原創內容層**：每個 Pass 一頁的說明（差異、適用設施、購買時機、搶票攻略）、FAQ、更新紀錄、資料方法論說明。目標 10–25 篇、每篇有實質內容。
  2. **等網域滿 3–6 個月**再申請。
  3. 補齊 privacy policy / contact / about / 營運者資訊。
  4. 讓每個日期頁除了數字之外，有可讀的敘述（例如「這一天 X 通行證已售罄，Y 通行證剩餘 N 張」的自然語言句子）—— 直接回應官方「必須是完整的句子與段落，而不只是標題」這條。
- 一個實務觀察：Google 自己也經營大量「純資料」介面（航班、天氣），純資料本身不是原罪；問題出在「新網域 + 零流量 + 工具站類別汙名」的組合。

---

## 4. Header bidding / 聚合商（對小站與亞洲流量）

| 平台 | 現行門檻 | 地理要求 | 內容要求 | 對本站 |
|---|---|---|---|---|
| **Ezoic** | **250,000 月活躍使用者**（2026-02-19 起的新站）；該日期前接入者 grandfathered，但斷開超過 7 天即失去資格 | 無明文 | **明文禁止「automatically generated」頁面**；內容須「原創、有建設性、吸引人」；須為 AdSense 支援語言 | ❌ 雙重不可行 |
| **Raptive** | **25,000 月 PV**（2026 年從 100,000 大幅下調） | 25K–99,999：**≥50% 來自美/英/加/澳/紐**；100K+：≥40% | 「多數頁面為長篇內容」、原創、有實質人為參與；網域需 **6 個月以上** | ❌ 日/台流量直接出局 |
| **Mediavine** | 主線需**年廣告收入 $5,000+**；入門的 **Journey** 方案從 **10,000 sessions** 起 | 偏英語系 | 「乾淨、真人、品牌安全」流量；需與 AdSense/AdX 保持良好狀態 | ❌ |
| **Setupad** | **≥100,000 月訪客**，偏好 Tier 1 | 偏好 Tier 1 | — | ❌ |
| **Snigel** | ⚠️ **已於 2025 年與 Publisher Collective 合併**（snigel.com 現 301 導向 publisher-collective.com）。合併後門檻 **300 萬 PV/月** | 全球，無地理限制 | 需「獨特、高品質內容」與可信流量來源 | ❌ |
| **Adapex** | 來源指「最高到 100 萬 PV/月」，PV 越高越易過 | — | 需與主要廣告夥伴保持良好關係 | ❌（此數字來自 2022 年評測，**可能已過時**） |
| **Newor Media** | **無硬性門檻**；Elevate! 方案無 PV 下限、標準方案 30,000；有來源說從 5,000 月不重複使用者起收 | 無明文 | 「原創、高品質、及時且持續更新」 | ⚠️ **本區塊唯一現實選項** |

### 4.1 三個關鍵判讀

1. **小型 header bidding 市場在 2026 年整體上移了。** Ezoic 於 2026-02 從「無門檻」跳到 25 萬月活，等於退出小型出版商市場 —— 這推翻了過去幾年「AdSense 過不了就去 Ezoic」的通用建議。**注意：仍有大量二手文章寫「Ezoic 無 PV 門檻」，那是過期資訊**（我實際抓到的 ppc.land 文章就仍寫「no pageview limits」，與 Ezoic 官方支援頁矛盾；以官方頁為準）。
2. **地理是硬牆。** Raptive、Mediavine、Setupad 的經濟模型建立在美加英澳紐流量上。日本 + 台灣流量在這些平台不僅過不了門檻，就算過了 eCPM 也撐不起管理成本。
3. **「符合 Google 政策」條款讓內容問題如影隨形。** Ezoic、Newor 等都要求符合 AdSense 政策 —— AdSense 過不了的內容問題會一路跟著。這意味著**「繞過 AdSense」不是繞過內容要求，只是繞過那一次審查。**

### 4.2 真正零審查的全球網路（最後手段）

Adsterra、Monetag、PropellerAds、AdMaven、PopAds、Infolinks、A-ADS、ExoClick —— 審核寬鬆、幾乎必過。

- Adsterra 宣稱日本是它在亞洲 CPM 最高的地區之一。
- 流傳的「$5–8 CPM」數字（Adsterra，遊戲站）與「$3–5」（Monetag）**多半來自 popunder / social bar 等侵入式格式，不是乾淨的 display banner**。Monetag 付款門檻較低、出款較快。
- **代價**：這些格式會嚴重傷害使用者體驗，並可能損害 SEO 與品牌信任 —— 對一個靠「好用」建立口碑的工具站，這是自毀基礎。**不建議**，除非確定放棄長期經營。

---

## 5. 混合堆疊：不同語言版本掛不同網路，可行嗎？

### 5.1 政策面：允許

Google 官方明文（support.google.com/adsense/answer/9728）：

> "You may place non-Google ads on the same site or page as Google ads. We do allow affiliate or limited-text links."

限制只有三條：

1. **inventory value policy** —— 「廣告不得多於內容」（"You may not place more ads than content on your page"）。對本站是實質風險：頁面內容量本來就少，塞太多廣告會直接踩到這條。
2. **不得模仿 AdSense 外觀** —— 其他網路的廣告不得與 AdSense 廣告視覺上混淆。
3. **合約衝突自負** —— 你要自己處理與既有廣告商的合約問題。

同時，發布者仍須遵守 Google Publisher Policies 與版位政策。

### 5.2 但有一個關鍵陷阱（這是本站計畫最大的誤解點）

**AdSense 的網站審查是 site-level（整個網域），而且子網域沿用母網域的狀態。**

因此「日文頁掛日系網路、只在 /en/ 掛 AdSense，讓 AdSense 只審查英文頁」**行不通**。AdSense 審的是整個網站，不是有貼廣告碼的那些頁。要靠語言分區來規避整站內容品質審查，是無效的策略。

（補充：官方也說明「若移除所有廣告碼，就不需要要求審查；日後恢復廣告碼時可再申請審查」—— 這反過來證實審查是綁在網站與廣告碼狀態上，而非單頁。）

反向則沒有問題：**AdSense 通過後，可以在任何語言的頁面上同時掛日系網路**，只要不違反上述三條限制。

### 5.3 日系／台系網路那一側

我**未查到**忍者AdMax、i-mobile、AdStir、Zucks 有任何禁止同時使用 AdSense 的條款。日本站長比較文普遍以「他社広告併用で収益 1.5 倍」為賣點推薦併用，顯示這是業界常態。**但我沒有逐一讀過各家規約全文，建議實際簽約前確認。**

### 5.4 語言分流的正當用法

按語言分配網路在技術與商業上都正常且常見，但正確的理由是**填充率與 eCPM 最佳化**（日系網路對日本 IP 有較好的 demand，AdSense 對繁中/英文較有效），而不是規避審查。實務作法：

- 用單一 ad slot 元件依 `lang` 切換 provider，保留隨時整體切換的能力。
- 保持 ads.txt 正確涵蓋所有使用中的網路（漏掉會直接掉收益）。
- 每個 slot 只掛一家，避免同版位競價衝突。

---

## 6. 建議堆疊（針對本站）

### 階段 0：立刻（不需要任何審查）

1. **聯盟行銷放在第一順位，不是展示廣告。** 這是本站最大的錯配修正點。
   - **Klook 聯盟**：景點類 **5%**（旅遊團與飯店 6.5%、eSIM 20%），cookie **30 天**。Klook 本身就有 USJ Express Pass 商品頁。
   - **KKday**：透過 Involve Asia 加入，最高約 **9.6% CPS**（一般約 3.24%），cookie 30 天，約 2 個工作天核准。
   - 日文頁另加 **バリューコマース / A8.net**（樂天旅遊、JTB、日本旅行等）。
   - 算術：Express Pass 約 ¥8,000–¥25,000，5% ≈ ¥400–¥1,250 / 單。以忍者AdMax 的 RPM ¥20 換算，**一次成交 ≈ 2 萬–6 萬 PV 的展示廣告收入**。
   - 站點已有「連到販售該 pass 的商店頁」的功能（見 commit `3b947a2`），把那些連結換成聯盟連結是最低成本、最高報酬的一步。
2. **忍者AdMax 當作零審查的展示廣告佔位**（日文頁優先）。無審查、5 分鐘上線，用來驗證版位與量測。但**要事先設定期望：RPM 約 ¥20**，月 10 萬 PV 只有約 2,000 日圓。可視為「不做白不做」而非收入來源。

### 階段 1：30–90 天（低成本申請）

3. **AdStir**：無 PV 下限、明文重視「定期更新」（本站每小時更新是加分），審查 2 個工作天～1 週。建議先備妥約 10 篇原創說明文再申請。**避開 wipe / interstitial 侵入式版型**，即使它們收益較高 —— 那會毀掉工具站的口碑。
4. **i-mobile Ad Network**：門檻低（3,000 日圓）、Google 認證合作夥伴。同樣需先有內容層。注意 2 年未達門檻即失效的條款。
5. **同步建置原創內容層**（這是所有後續選項的共同前置條件）：
   - 每種 Pass 一頁的完整介紹（差異比較、適用設施、價格區間、購買時機、搶票實務）。
   - 資料方法論頁（資料來源、更新頻率、準確性說明、免責）。
   - FAQ、關於、隱私權政策、聯絡方式。
   - 讓日期頁除了數字之外有自然語言敘述句（直接對應 AdSense「完整的句子與段落」要求）。
   - 目標：10–25 篇實質頁面（對應日本合格資料的中位數 25 篇 / 眾數 10 篇）。

### 階段 2：網域滿 3–6 個月 + 內容層完成後

6. **申請 AdSense，全站掛，涵蓋日 / 繁中 / 英三語。** 這是唯一能同時有效變現日本與台灣流量的展示廣告網路。
   - 心理準備：日本資料顯示平均需 **4.2 次**申請、中位數 3 次。被拒不傷帳號、可反覆重申請。
   - 通過後可與日系網路併用（官方允許），但務必守住「廣告不得多於內容」這條 —— 對本站是實質風險。
7. **若 AdSense 三次以上仍不過**：改試 **Newor Media**（無硬性門檻、不要求獨家、可與 AdSense 併用、24 小時內回覆）。這是 header bidding 區塊裡唯一對本站規模合理的選項。

### 明確不要浪費時間的

- ❌ **nend** —— 已於 2024-03 停止服務。
- ❌ **台灣全部本土聯播網**（Vpon / TenMax / 域動 / Ad2iction）—— sales-led、無自助入口、目標客戶是主流媒體。
- ❌ **Ezoic** —— 2026-02 起 25 萬月活門檻，且明文禁止自動產生頁面。
- ❌ **Raptive / Mediavine / Setupad / Publisher Collective(Snigel) / Adapex** —— 門檻或 Tier-1 地理要求都不符。
- ❌ **fluct / Geniee / MicroAd** —— 規模不足，且 fluct 有 30 萬 PV 仍被拒的紀錄。
- ⚠️ **Adsterra / Monetag / PopAds 類** —— 會過，但侵入式格式會毀掉工具站賴以生存的使用體驗。只在確定放棄長期經營時考慮。

---

## 7. 我無法驗證的部分（誠實標註）

以下項目我找不到可信的公開資料，PRD 中請勿當成既定事實：

1. **日本旅遊類流量的實際 eCPM/RPM** —— 只找到「旅遊是高單價主題」的定性說法，沒有數字。
2. **Geniee / fluct / MicroAd 的實際 PV 門檻** —— 全部未公布，僅有二手推測（Geniee「數萬 PV」）。
3. **AdStir 的付款門檻** —— 未查到。
4. **忍者AdMax、i-mobile、AdStir、Zucks 是否有禁止併用 AdSense 的規約條文** —— 未逐條讀過規約全文，僅知業界普遍併用。
5. **Adapex 的 2026 年門檻** —— 找到的數字來自 2022 年評測。
6. **台灣本土網路對個人站的實際態度** —— 沒有找到任何個人站接入的公開紀錄，我的判斷是基於「無自助入口 + 合作對象皆為主流媒體」的推論。
7. **本站被 AdSense 拒絕的機率（我估 >70%）** —— 這是推論，不是資料。
8. **Klook / KKday 對「非內容型工具站」的聯盟申請接受度** —— 我確認了佣金率與申請管道，但沒有查到針對資料站的核准案例。

**時效性警告**：廣告網路的門檻在 2025–2026 間變動劇烈（Ezoic 2026-02 大幅上調、Raptive 2026 大幅下調、Snigel 2025 合併、nend 2024 收攤）。本文所有門檻數字都應在實際申請前重新確認。

---

## 參考來源

**AdSense / Google 官方**
- [Your AdSense account wasn't approved](https://support.google.com/adsense/answer/81904?hl=en)
- [Use other ad networks together with AdSense](https://support.google.com/adsense/answer/9728?hl=en)
- [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938?hl=en)
- [Spam policies for Google web search (Publisher Policies Help)](https://support.google.com/publisherpolicies/answer/11035931?hl=en)
- [Fix policy issues that affect ad serving](https://support.google.com/adsense/answer/7003627?hl=en)
- [Introducing page-level enforcements and a new Policy center](https://blog.google/products/adsense/introducing-page-level-enforcements-and/)
- [Site management is changing in AdSense](https://support.google.com/adsense/answer/12170421?hl=en)
- [インプレッション収益（RPM）](https://support.google.com/adsense/answer/190515?hl=ja)

**日本網路**
- [nend サービス終了（gamebiz）](https://gamebiz.jp/news/379899) / [uzurea.net](https://uzurea.net/nend-service-termination/)
- [忍者AdMax 官網](https://admax.shinobi.jp/)
- [忍者AdMax 収益実測](https://nobutoblog.com/ninjya-admax/)
- [i-mobile Ad Network 官方媒体向け](https://adpf-info.i-mobile.co.jp/)
- [i-mobile 審査実測](https://happachan.com/i-mobile-shinsa/)
- [AdStir 審査基準・収益実測](https://ym-life.com/adstir-passing/)
- [AdStir 利用規約](https://ja.ad-stir.com/rules.html)
- [Zucks Publisher FAQ](https://zucks.co.jp/publisher/adnetwork/faq/)
- [fluct 審査](https://nobutoblog.com/asp-fluct/)
- [GENIEE SSP](https://geniee.co.jp/products/ssp/)
- [MicroAd COMPASS](https://www.microad.co.jp/services/adplatform/microad-compass/)
- [アドセンス代替広告 7 選（比較）](https://ym-life.com/google-adsense-alternative-ad/)
- [Googleアドセンス合格体験 1,926 件分析](https://www.tmaccarones.com/googleadsense-passed-x-post/)

**台灣網路**
- [TenMax ad Tech Lab](https://www.tenmax.io/tw/adformat) / [DSP 到 SSP 全自製](https://www.tenmax.io/tw/archives/85146)
- [域動行銷 ClickForce](https://www.clickforce.com.tw/)
- [Ad2 行動廣告](https://ad2.ad2iction.com/)
- [Vpon SDK Web 文件](https://wiki.vpon.com/zh-tw/web/native/)
- [台灣 AdSense 替代品整理（Ivon）](https://ivonblog.com/posts/google-adsense-alternatives/)

**Header bidding / 聚合商**
- [Ezoic 官方要求](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements)
- [Publisher Collective FAQ（前 Snigel）](https://www.publisher-collective.com/faq)
- [Raptive 門檻下調至 25,000（Search Engine Journal）](https://www.searchenginejournal.com/raptive-drops-traffic-requirement-by-75-to-25000-views/558780/)
- [premium ad network approvals 門檻整理（ppc.land）](https://ppc.land/is-your-site-finally-ready-the-new-math-behind-premium-ad-network-approvals/)
- [Newor Media Ad Policy](https://newormedia.com/adpolicy) / [Elevate FAQ](https://newormedia.com/elevatefaqs)
- [Setupad: Best ad networks for publishers](https://setupad.com/blog/best-ad-networks-for-publishers/)
- [Adsterra: CPM rates by country](https://adsterra.com/blog/geos-with-high-cpm-rates-for-publishers/)

**工具站 AdSense 實例**
- [I applied for AdSense and got rejected for low value content（dev.to）](https://dev.to/bdubs/i-applied-for-adsense-and-got-rejected-for-low-value-content-hog)

**聯盟行銷**
- [Klook Affiliate Program（Involve Asia）](https://involve.asia/blog/klook-affiliate-program/)
- [Klook 佣金明細](https://getlasso.co/affiliate/klook/)
- [KKday Affiliate Programs](https://linkmydeals.com/affiliate-programs/info/kkday.com/)

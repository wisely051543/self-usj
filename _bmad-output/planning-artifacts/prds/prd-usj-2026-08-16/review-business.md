---
title: "商業模式對抗性審查 — USJ 通行證庫存看板 PRD"
reviewer: adversarial business review
target: prd.md (2026-08-16 draft)
scope: §2、§3、§5、§6.6、§6.7、R1、R2、R4、R5、R11
created: 2026-08-16
---

# 商業模式對抗性審查

## 0. 判決

**「零原創文字 + 純 AdSense + 封鎖生成式引擎」這三項決定無法同時成立。** 它們不是各自有風險，而是彼此互相取消：沒有原創文字就難以在目標長尾查詢上排名（因為前排全被長文攻略站佔據），排不上就沒有流量；即使有流量，AdSense 的政策原文正好把「無原創內容、自動產生、彙整第三方資料」列為不投放的標的；而封鎖清單裡真正被封掉的，多數是**會帶來點擊的**通路（ChatGPT Search、Perplexity），對真正吃掉點擊的 AI Overviews 則完全無效（已由 Google 官方文件證實）。

三者疊起來的期望收入量級，在樂觀假設下也只有**每月數十至數百美元**，而要跨到「非瑣碎」（US$1,000/月）需要約 **33 萬次月瀏覽**——對一個只有 3 個可索引 URL、主題極窄、季節性極強的站台而言，這個數字不現實。

以下逐題拆解，並在 §8 分列「已驗證事實」與「推論」。

---

## 1. 零原創散文能不能贏得資訊型長尾排名？

### 1.1 先看那些查詢今天實際排的是什麼

我對三語各跑了一次目標查詢，結果高度一致：**前排 100% 是長文散文，0% 是純資料工具。**

**日文「USJ エクスプレスパス 売り切れ 完売 確認方法」**
| 排序 | 站台 | 形態 |
|---|---|---|
| 1 | [castel.jp/p/8928](https://castel.jp/p/8928) 「【最新】USJエクスプレスパスの売り切れ状況・在庫状況一覧！」 | **長文 + 人工 ◯/△/－ 表** |
| 2 | [yuniba.hatenablog.com](https://yuniba.hatenablog.com/entry/_usj-express-pass-sellout-guide)「売り切れ完全ガイド」 | 純散文 |
| 3 | [castel.jp/p/3887](https://castel.jp/p/3887)「売り切れ時の対処法まとめ」 | 純散文 |
| 4~6 | sumatokoblog、[tabikatu.jp/expresspass-soldout](https://tabikatu.jp/expresspass-soldout/)、isearch.jp | 純散文 |

**繁中「USJ 快速通關 售完 怎麼辦 補票」**
前排為 [wkitty.tw](https://wkitty.tw/blog/post/usj)、[gototravel.tw](https://gototravel.tw/usj-app/)、[osaka.letsgojp.com](https://osaka.letsgojp.com/archives/572047/)、[hello-alpine.com](https://hello-alpine.com/universal-studio-japan-express-pass-guide/)、[vivianexplore.tw](https://vivianexplore.tw/usj-express-pass/)、[letsgokyoto.com](https://letsgokyoto.com/universal-studio-japan-express-pass-guide/)——**全部是部落格長文攻略**，無一例外。

**英文「Universal Studios Japan express pass sold out check availability」**
前排為 [KKday Blog](https://www.kkday.com/en/blog/57997/usj-express-pass-guide)、[Klook Blog](https://www.klook.com/blog/japan-universal-express-pass-guide/)、[neverendingvoyage.com](https://www.neverendingvoyage.com/universal-studios-japan-express-pass/)、[therealjapan.com](https://www.therealjapan.com/universal-studios-japan-usj-guide-tickets-express-pass/)、[thetokyochapter.com](https://www.thetokyochapter.com/how-to-choose-the-best-express-passes-for-universal-studios-japan/)——**同樣全是長文，且其中兩個是通路自營的內容行銷**（Klook、KKday 有預算、有品牌權重、有反向連結）。

### 1.2 §1 對 castel.jp 的判斷是錯的（**嚴重度：高**）

PRD §1 寫：

> 「日文市場的既有玩家（castel.jp 的人工 ◯/△/ー 表、usjinfo.com 的即時等待時間）**都不碰票券庫存**」

這句話自我矛盾，且與事實不符。castel.jp 那張 ◯/△/－ 表**就是票券庫存**；它的標題直接叫「売り切れ状況・在庫状況一覧」，而且**它就是日文目標查詢的第一名**。換句話說：

- castel.jp 不是「不相干的既有玩家」，它是**這個關鍵字群的現任佔位者**；
- 它贏在本 PRD 正要放棄的那個維度（約 2,000~2,500 字的原創日文散文，環繞著那張表）；
- 本產品相對它的優勢是**粒度**（精確張數 vs ◯/△/－）與**自動化**（castel.jp 為人工維護），這是真的優勢；但**粒度不是排名因子，內容才是**。

這一條必須回寫進 §1 與 R5，否則整份 PRD 的競品判斷建立在一個錯誤前提上。

### 1.3 為什麼「技術 SEO 做滿」不足以扭轉

FR13~FR17（三語獨立 URL、hreflang、canonical、meta、sitemap、SSR）解決的是**「搜尋引擎看不看得見」**。這是入場券，不是勝利條件。R5 說得對，現況等同不存在；但把它修好之後，本站只是進入了一場**它沒有任何內容資產可以打的比賽**。

更具體的問題：**FR13 + FR17 產生的可索引 URL 只有 3 個**（每語言一個）。而本站的資料規模是 **23 個票種 × 63 個日期 = 1,449 個「日期 × 票種」組合**（已由 `data/index.json`、`data/days.json` 驗證）。目標長尾查詢的形態是「10/13 快通 7 還有票嗎」這種組合式問句——**3 個 URL 無法承接 1,449 種長尾意圖**。

這裡有一個真正的兩難，PRD 沒有寫出來：

- **不擴頁面** → 只有 3 個 URL，長尾承接能力接近零，§2 目標三失效；
- **擴頁面**（例如每票種一頁、每日期一頁）→ 立刻變成「大量自動產生、幾乎無原創文字、內容為第三方資料」的頁面群，**正中 §2 節所引的 AdSense 與搜尋垃圾政策**。

**結論：** 在「完全不做編輯內容」的約束下，§2 目標三（以資訊型長尾取得自然流量）**不是有風險，而是缺乏可行路徑**。這不是我在猜測未來，這是當前 SERP 的直接觀察。

---

## 2. AdSense 政策核查（R2）

R2 的狀態是「待查證」。以下為查證結果，**皆為 Google 官方文件原文**。

### 2.1 直接命中的政策條文

**（a）Google-served ads on screens without publisher-content**
來源：<https://support.google.com/publisherpolicies/answer/11112688>

> "We do not allow Google-served ads on screens: without publisher-content or with low-value content, that are under construction, that are used for alerts, navigation or other behavioral purposes"

同一頁並明列：

> "don't place ads on automatically generated content without manual review or curation."

> "The content you provide should be of value to the user and be the focal point for users visiting your site or app."

**這是本次審查中最貼合的一條。** 本站的頁面內容 **100% 由排程管線自動產生、無任何人工審閱或策展**（`.github/workflows/fetch.yml` cron 驅動），且 §5 明確排除編輯內容。「automatically generated content without manual review or curation」是逐字命中。

**（b）Replicated content（Google Publisher Policies）**
來源：<https://support.google.com/adsense/answer/9335564>

> "with embedded or copied content from others without additional commentary, curation, or otherwise adding value to that content"

本站的每一個資料點都來自 `comm-api.usj.co.jp`，且 NFR3 刻意規定「不複製官方的敘述文字」。這在著作權上是正確的自保，但在 AdSense 政策上**反而使頁面更接近「沒有原創內容的第三方資料集合」**——法遵姿態與變現姿態在此互相扣分。

需要注意的是政策留了一個出口：`"without ... commentary, curation, or otherwise adding value"`。本站確實**有**加值（跨日期跨票種攤平、精確張數、稀缺門檻標示）。這是本站唯一可辯護的立足點，但它是**功能性加值而非內容性加值**，能否被審查（人工或自動）採認，是不確定的。

**（c）Search spam policies — Scraping**
來源：<https://developers.google.com/search/docs/essentials/spam-policies>

> "Scraping refers to the practice of taking content from other sites, often through automated means, and hosting it with the purpose of manipulating search rankings."

其例示明確包含：

> "creating sites that compile third-party content without substantial added value"

以及 Scaled content abuse 下的：

> "Scraping feeds, search results, or other content to generate many pages (including through automated transformations like synonymizing, translating, or other obfuscation techniques), where little value is provided to users."

注意最後一句括號裡的 **"translating"**。本站的三語策略（FR10「三語內容完全一致」）在最壞情況下，會被描述成「把同一份第三方資料自動翻譯成三份」。這不是說一定會被判違規，而是說**辯護空間比 PRD 假設的窄**。

**（d）AdSense 資格門檻**
來源：<https://support.google.com/adsense/answer/9724>

> "Your content must be high-quality, original, and attract an audience."

「original」是明文用字。

### 2.2 「會不會過審」與「過審後會不會被停」是兩個問題

PRD 的 §9 把 AdSense 放在 P3，隱含假設是「置入版位」是一件小事。實際上有兩道關卡：

1. **初審**：本站要以「零文章、單頁矩陣、自動產生」的形態送審。日文社群對 AdSense 審查「有用性の低いコンテンツ／価値の低い広告枠」退件的普遍經驗值是「1,000 字以上 × 10 篇以上」（[Google AdSense 社群討論串](https://support.google.com/adsense/thread/131090610?hl=ja)、[seory.co.jp 整理](https://seory.co.jp/google-adsense-audit/)）。這是社群經驗而非官方門檻，但方向一致。**推論：初審通過機率低。**
2. **過審後的投放限制**：Publisher Restrictions 的效果原文是——被標記為 restriction 的內容，「fewer advertising sources will be eligible to bid on it... In some cases this will mean that no advertising sources are bidding on your inventory and no ads will appear on your content」（<https://support.google.com/adsense/answer/10437795>）。也就是說，**帳號沒被停、頁面上就是沒有廣告、收入為零**，而且不一定會有明顯的告警。這種失敗模式比封號更難察覺，也不在 §3 的任何指標裡。

### 2.3 R2 應如何改寫

R2 現況欄應由「待查證」改為：

> **已查證，風險確立。** Google Publisher Policies 明文禁止在「without publisher-content or with low-value content」以及「automatically generated content without manual review or curation」的畫面投放廣告（support.google.com/publisherpolicies/answer/11112688）。本站在「零編輯內容 + 全自動產生」的設定下，逐字命中該條件。唯一辯護點為功能性加值（跨維度比較、精確張數），採認與否不確定。**建議在 P0 階段即以現有單頁送一次 AdSense 審查，把這個未知在投入 P1 大改架構之前關掉。**

**這是本審查最重要的一條流程建議：** §9 把 P3（廣告）排在最後，等於把整個商業模式的生死開關擺在**所有工程成本都已投入之後**才驗證。順序應該反過來——AdSense 能不能過，是一張幾天內就能拿到答案的便宜門票。

---

## 3. 封鎖 AI 爬蟲能不能保住點擊？（§6.6、FR24、R11）

**簡答：不能。而且 FR24 的清單裡，有一半的項目是自傷。**

### 3.1 Google-Extended：確認無效（PRD 的 NOTE FOR PM 是對的）

Google 官方爬蟲文件原文（<https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers>）：

> "Crawling preferences addressed to the `Google-Extended` user agent affect crawls requested by the site owners' for building Vertex AI Agents. **It has no effect on Google Search or other products.**"

> "**Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal in Google Search.**"

而 Googlebot 的說明是：

> "Crawling preferences addressed to the `Googlebot` user agent affect Google Search (including Discover and **all Google Search features**), as well as other products such as Google Images, Google Video, Google News, and Discover."

AI Overviews 與 AI Mode 是 **Google Search features**，由 Googlebot 的索引供給。因此：

- 把 `Google-Extended` 放進 FR24 的 Disallow 清單，**對 AI Overviews 的點擊流失零效果**；
- 唯一能讓頁面退出 AI Overviews 的槓桿是 snippet 家族（`nosnippet`、`data-nosnippet`、`max-snippet:0`），而那會**同時砍掉一般搜尋結果的摘要與精選摘要**，實務上等於自廢流量。

PRD 的 `[NOTE FOR PM]` 已經正確描述了這件事，但 **FR24 的清單卻仍然把 `Google-Extended` 列進去**。需求與註記自相矛盾，應擇一修正。列著它不會有害，但它會給人「R11 已經處理過了」的錯覺——那才是真正的成本。

### 3.2 OAI-SearchBot / PerplexityBot：封鎖是自傷（**嚴重度：高**）

OpenAI 官方文件原文（<https://developers.openai.com/api/docs/bots>）：

> "OAI-SearchBot is for search. OAI-SearchBot is used to surface websites in search results in ChatGPT's search features. **Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers**, though can still appear as navigational links."

> "GPTBot ... is used to crawl content that may be used in training our generative AI foundation models."

> "ChatGPT-User ... When users ask ChatGPT or a CustomGPT a question, it may visit a web page with a ChatGPT-User agent." （文件另註明 ChatGPT-User 不決定內容是否出現在 Search）

關鍵區別，PRD 完全沒有做：

| 代理 | 用途 | 封鎖的後果 |
|---|---|---|
| `GPTBot`、`ClaudeBot`、`anthropic-ai`、`CCBot`、`Applebot-Extended`、`meta-externalagent` | **訓練** | 合理。不帶點擊，封鎖沒有流量成本 |
| `Google-Extended` | Gemini/Vertex 訓練與接地 | **無效**。與 Google 搜尋、AI Overviews 無關 |
| `OAI-SearchBot` | **ChatGPT Search 的來源檢索**——會列出可點擊的引用連結 | **自傷**。封鎖 = 主動退出一個會帶 referral 的入口 |
| `PerplexityBot` | Perplexity 答案的來源檢索——同樣列出來源連結 | **自傷**，同上 |
| `ChatGPT-User` | **使用者當下主動要求**去讀這一頁 | **自傷且弔詭**。這不是機器人偷資料，這是一個真人使用者要求打開你的頁面 |

FR24 的立意是「保住點擊」，但它把**帶點擊的通路**和**不帶點擊的訓練用途**混在同一份清單裡一起封。結果是：真正吃掉點擊的（AI Overviews）擋不掉，會給你點擊的（ChatGPT Search、Perplexity）反而被自己關掉。

**這是 §6.6 最需要修正的一條。** 建議 FR24 拆為兩個清單：
- **拒絕（訓練用途）**：`GPTBot`、`ClaudeBot`、`anthropic-ai`、`CCBot`、`Bytespider`、`Applebot-Extended`、`meta-externalagent`、`Google-Extended`（無效但無害，可保留作為立場宣示）
- **允許（帶引用連結的檢索用途）**：`OAI-SearchBot`、`PerplexityBot`、`ChatGPT-User`

順帶：既然 `OAI-SearchBot` 與 `PerplexityBot` 改為允許，被 PRD 捨棄的「可獨立引用的完整句子」與 `llms.txt` 的成本效益也應重新評估——它們的成本極低（幾行文字），而在**沒有任何編輯內容**的站上，AI 引擎的引用可能是本站少數幾個能繞過「內容不足以排名」瓶頸的入口之一。

### 3.3 兩個附帶觀察

**（a）現況：站上根本還沒有 robots.txt。** 已驗證 repo 根目錄與各層皆無 `robots.txt`（`find . -name "robots*"` 無結果）。FR24 是**新建**而非修改，這一點 §9 的 P1 描述可以更精確。

**（b）敘事一致性成本，PRD 未討論。** 本站一方面在抓取 usj.co.jp 的資料（NFR1~NFR9，且 NFR7 刻意不具名），一方面在自己的 robots.txt 上宣告拒絕別人抓取自己。這不構成法律問題，但若 R7 的情境成真（USJ 注意到本站），這份 robots.txt 會是對方手上現成的材料。這是一個小成本，但既然 §7 花了大量篇幅在建立「自我節制的可稽核紀錄」，這一項的不一致值得記上一筆。

---

## 4. §3 的成功指標能不能判斷生意做不做得起來？（R4）

**不能。它只能判斷管線活著。** PRD 自己的 `[NOTE FOR PM]` 已經誠實承認了這件事，但補救不足。

### 4.1 現況盤點

| 指標 | 量測的是 | 零流量零收入時的讀數 |
|---|---|---|
| 資料更新成功率（**主指標**） | 管線健康 | **滿分** |
| 資料新鮮度 | 管線健康 | **滿分** |
| 比較廣度 | 使用者行為 | 無資料（分母為零時無意義） |
| 自然搜尋工作階段 | 流量 | `[NOTE FOR PM]` 待設定 |
| 廣告收入 | 商業 | `[NOTE FOR PM]` 待設定 |

**把「資料更新成功率」定為主指標，等於宣告本產品的第一順位是「爬蟲不要壞」。** 這在 P0 階段是對的（§9 的排序原則「先保護資料源」有其道理），但它不能同時是**產品**的主成功指標。一個管線 100% 健康、零人造訪、AdSense 被拒的站，在這張表上是滿分。

### 4.2 「比較廣度」這個補救本身有量測問題（**嚴重度：中**）

「每次工作階段中，使用者實際檢視的『日期 × 票種』組合數」——但 FR1 的設計目標**就是讓使用者在一個畫面內看完**，不需要點擊。設計得越成功，可觀測的互動事件就越少。要量測它，只能靠捲動深度、視區停留、或 FR2 的主軸切換次數，都是代理指標且雜訊大。這不是說不該量，而是說**它承擔不起「唯一行為型先行指標」的重量**。

### 4.3 缺少的指標

按照「能否回答『這門生意成不成立』」排序：

1. **AdSense 帳號／頁面狀態**（是否核准、是否被標記 inventory restriction、實際填充率 fill rate）——這是二元的生死開關，卻完全不在表上。參照 §2.2，「有廣告位但沒有廣告投放」是一種安靜的失敗。
2. **外連點擊率（CTR to `store.usj.co.jp`）**——FR8 的行為。這是**唯一能證明使用者真的做出了購買決定**的訊號，也是 UJ-1 旅程的終點。它同時是未來談聯盟或談合作時唯一有說服力的數字。強烈建議升為主要行為指標，取代或並列「比較廣度」。
3. **每工作階段廣告曝光數（ad impressions / session）**——單頁站的結構性弱點就在這裡：一個 session 只看一頁，廣告曝光機會極少。這個數字會直接決定 §5 的收入試算落在哪一格。
4. **實際 RPM**（而非 R1 引用的產業區間）——上線後兩週內就能拿到，且會立刻證實或推翻整個 §5。
5. **每查詢的排名與曝光（Search Console：impressions / average position，按目標查詢分群）**——區分「排不上」與「排得上但沒人點」，這兩者的處方完全相反。

### 4.4 建議的指標重構

| 層 | 指標 | 判斷什麼 |
|---|---|---|
| 營運（**降為衛生指標**） | 資料更新成功率、新鮮度、正確率、抓取禮貌性 | 管線與法遵沒壞 |
| 流量 | 目標查詢群的曝光數與平均排名、自然點擊 | §2 目標三成不成立 |
| 行為（**主**） | 外連 `store.usj.co.jp` 的 CTR、每 session 廣告曝光數 | 使用者有沒有真的被幫到 |
| 商業（**生死**） | AdSense 核准狀態與填充率、實際 RPM、月收入 | 這門生意成不成立 |

並建議設一個**明確的止損條件**（例如：P1 上線後 90 天內若目標查詢群平均排名未進前 10、或 AdSense 未通過審查，則重新評估變現模式）。目前 PRD 沒有任何一條退出準則。

---

## 5. 收入量級試算

### 5.1 假設（全部列出，逐項可挑戰）

| # | 假設 | 依據 | 信心 |
|---|---|---|---|
| A1 | 流量地理組成以日本、台灣為主，tier-1 佔比低 | PRD R1 的自陳，且產品為三語但主力為 JP/TW | 高 |
| A2 | 旅遊垂直的 AdSense 頁面 RPM，tier-1 為 US$3~12 | PRD R1 引用；一般站台 CPM 區間 US$0.30~2、高價垂直 US$5~15 | 中 |
| A3 | 本站的實際 RPM 顯著低於 A2 的 tier-1 區間 | 日本 CPC 約 **US$0.14**、香港 US$0.13、新加坡 US$0.27（[partnerkin](https://partnerkin.com/en/blog/articles/adsense_rpm_rates_by_country)），皆屬亞洲較低段 | 中 |
| A4 | 單頁站 → 每 session 約 1.0~1.3 次瀏覽；FR26 限制版位不得干擾核心操作 → 版位數少（1~2 個） | PRD FR1（單一畫面）、FR26 | 高 |
| A5 | **綜合估算 RPM = US$1~4，樂觀 US$5** | A2~A4 綜合 | 中（**這是全篇最脆弱的一個數字，上線兩週即可用實測取代**） |
| A6 | 「非瑣碎」的門檻定為 **US$1,000/月**（約 NT$32,000） | 主觀設定；讀者可自行替換 | — |

### 5.2 算術

月收入 = （月瀏覽數 ÷ 1,000）× RPM

| 月瀏覽數 | RPM $1 | RPM $2 | RPM $3 | RPM $5 |
|---|---|---|---|---|
| 10,000 | $10 | $20 | $30 | $50 |
| 50,000 | $50 | $100 | $150 | $250 |
| 100,000 | $100 | $200 | $300 | $500 |
| 300,000 | $300 | $600 | $900 | $1,500 |
| 1,000,000 | $1,000 | $2,000 | $3,000 | $5,000 |

**達到 US$1,000/月所需的月瀏覽數：**
- RPM $1 → **1,000,000 PV/月**（約 33,000 PV/日）
- RPM $2 → **500,000 PV/月**（約 16,700 PV/日）
- RPM $3 → **333,000 PV/月**（約 11,100 PV/日）
- RPM $5 → **200,000 PV/月**（約 6,700 PV/日）

### 5.3 這些數字現不現實？

**推論：不現實。** 理由：

1. **可索引頁面只有 3 個。** 要靠 3 個 URL 拿到每日一萬次自然造訪，等於要在該關鍵字群拿下絕對多數份額——而 §1 顯示前排全被有數年權重的長文站佔據。
2. **主題極窄且高度季節性。** 單一樂園的單一票種家族；快通提前約 60 天開賣，需求集中在暑假、黃金週、萬聖等尖峰前的購票窗口。年度流量不是平均分佈的，離峰月份可能是尖峰的零頭。
3. **單頁站的 PV ≈ session。** 大型內容站可以靠每 session 3~5 頁把 PV 撐起來，本站不行。這等於在同一個「使用者人數」下，本站的 PV 是內容站的 1/3~1/5。
4. **R1 的替代網路確認關閉。** 已驗證：Raptive 現行門檻為 25,000 月瀏覽，但 25,000~99,999 這一段**要求 50% 以上流量來自 tier-1 市場（美英加澳紐）**（[Search Engine Journal](https://www.searchenginejournal.com/raptive-drops-traffic-requirement-by-75-to-25000-views/558780/)）——本站不符。Ezoic 的 Access Now 雖無流量門檻，但 **2026-02-19 之後新增的站台須符合 25 萬流量要求**（[Ezoic Support](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements)）。**R1 的結論（實務上僅 AdSense 可用）成立**，只有 Raptive 的門檻數字需由「100k」更新為「25k（且 25k~100k 區間要求 50% tier-1）」。

### 5.4 現實的期望值

**推論：** 在「P1 技術 SEO 做滿、但完全沒有編輯內容」的情境下，合理的第一年流量期望是**每月數千至數萬 PV**，對應**每月 US$5~100** 的廣告收入。這個量級**連網域與基礎設施成本都不一定能覆蓋**，更不足以回報 P1（架構重寫，PRD 自評「大」）+ P2（中）+ P0/P0.5 的工程投入。

要說得公道：如果本產品的目的**不是**賺錢，而是（a）解決作者自己的問題、（b）技術練習、（c）為未來的 B2B 或付費層累積資料與名聲，那麼上述數字完全不構成否決理由。**但那樣的話，§2 目標三與整個 §6.7、P3 就應該從 PRD 裡拿掉**，因為它們正在讓 P1 的巨大架構投資看起來像是有商業回報的——而它沒有。**目前 PRD 最危險的一點，是用一個不成立的變現故事去正當化一項昂貴的架構重寫。**

---

## 6. 被排除的變現選項，有沒有值得重開的？

先講清楚：**付費補貨通知與代購／聯盟，使用者已經明確決定排除**（§5、R11）。我不假裝這個決定沒發生。以下只做兩件事：**標示這些決定的成本**，以及**指出幾個 PRD 從未討論、且與既有決定相容的選項**。

### 6.1 付費補貨通知——我認為排除它是本 PRD 最貴的一個決定

**這是我明確不同意的一項，理由如下。**

競品的實際定價（已驗證）：
- [usjexpress.com](https://usjexpress.com/)：**Budget $3.99 / Value $6.99 / Deluxe $11.99**（Value 支援 4 人、2 個日期、2 種票券；無票可買則全額退款）
- [usjexpresspass.com](https://usjexpresspass.com/)：不公開定價，需進結帳流程；**不公開任何庫存資料**，只在首頁放樣本狀態
- [usjalert.com](https://usjalert.com/)：早期存取期間免費（新進者）

**算術對照（達到 US$1,000/月）：**

| 模式 | 單位收入 | 假設轉換率 | 所需月流量 | 相對廣告的效率 |
|---|---|---|---|---|
| AdSense（RPM $3） | $0.003/PV | — | **333,000 PV** | 1× |
| 付費通知 @ $6.99 | $6.99/筆 → 需 143 筆 | session→付費 1.0% | **14,300 sessions** | **23×** |
| 付費通知 @ $6.99 | 同上 | session→付費 0.5% | **28,600 sessions** | **12×** |
| Klook 聯盟（景點類 5%，快通 ¥14,800 ≈ US$98 → 約 $4.9/筆） | $4.9/筆 → 需 204 筆 | session→成交 1.0% | **20,400 sessions** | **16×** |

（Klook 景點類佣金約 5%：[involve.asia](https://involve.asia/blog/klook-affiliate-program/)、[getlasso](https://getlasso.co/affiliate/klook/)；KKday 約 3~5%）

**也就是說：付費通知在相同收入下，只需要廣告模式 1/12 ~ 1/23 的流量。** 而流量正是本產品最稀缺、最不確定、最需要架構重寫才拿得到的資源。

更關鍵的是**產品優勢的方向**：三家競品**都不公開庫存資料**（已逐一驗證）。它們的收費理由是資料稀缺性。本產品的差異化資產是「精確剩餘張數」與（§10 提到的）**補貨歷史**——這正好是把免費看板當漏斗、把「我幫你盯著」當付費層的完美結構：

- **免費層**（看板）滿足「現在還有沒有」——同時就是 SEO 與口碑的載體；
- **付費層**（通知）滿足「沒了，等它回來」——這是使用者焦慮的真正終點，也是 UJ-1 裡「只能每天回來重刷」的那個痛點的直接解藥。

**PRD 現在的設計，是把免費層做完、然後在漏斗底端放一個 RPM $3 的廣告，而不是放一個 $6.99 的商品。** 使用者已經決定不做，我尊重；但這個決定的成本應該在 R1 裡被明確寫成一句話：「本決定使達成同等收入所需的流量提高約 12~23 倍。」

### 6.2 聯盟：效率高，但與本產品的法遵姿態衝突——PRD 漏了這個理由

§5 排除聯盟的理由寫的是「使用者選擇純廣告變現」。這個理由不完整。**聯盟其實有一個更硬的反對理由，PRD 沒寫出來：**

- FR8 導向 `store.usj.co.jp`（官方），而資料也取自官方的 `comm-api.usj.co.jp`。改導 Klook/KKday 會造成**顯示的庫存與導向的通路不一致**（Klook 的庫存池與官方不同），這會直接破壞 FR3 與 NFR10 建立的資料可信度；
- 會弄髒 NFR13~NFR15 建立的「非官方、不介入交易、無商業利益」定位——而那正是 §7 全篇在經營的善意證明；
- 在 R3（契約為主要曝險路徑）的情境下，「用抓來的資料為第三方通路導流獲利」比「用抓來的資料放展示廣告」在性質認定上更不利。

**結論：排除聯盟是對的，但理由應該從「使用者選擇」升級為上述實質理由。** 這樣寫，這個決定才站得住，也才不會在下次檢討時被輕易推翻。

### 6.3 從未被討論、且與既有決定相容的三個選項

以下三項**不牴觸**「不做編輯內容」「不做代購」「不做付費通知」的任何一項既有決定：

**（a）直售單一贊助版位（值得認真評估）**
不經 AdSense，直接向少數與情境高度相關的廣告主（日本 eSIM、行李寄放、關西交通票券、大阪住宿）賣固定版位。優點：
- **完全繞開 §2 的 AdSense 政策風險**——這是它最大的價值，因為 §2 的風險是二元的；
- 在低流量下的單位經濟遠優於 AdSense（贊助商買的是**受眾精準度**，不是曝光量：一個「三個月後要去 USJ、正在買票」的使用者，是極高意圖的旅遊受眾）；
- 版位可控，容易滿足 NFR18（不造成版面位移）。
缺點：需要人工銷售，非被動收入。但在 PV 只有數千至數萬的階段，**一個贊助商的月費就可能超過 AdSense 一整年的收入**。

**（b）資料授權 / API（我認為最值得重開的一項）**
把「零編輯內容」從弱點翻成賣點：本站的產品是**資料**，那就把資料賣給需要它的人。而需要它的人是誰？**正是 §1 裡那些正在佔據 SERP 前排的攻略站**——castel.jp 的那張表是**人工維護**的（已驗證），tabikatu、letsgojp、hello-alpine 這些站每年都要重寫「售完怎麼辦」。一個「即時庫存表 embed / JSON API」對它們是省人力、增黏著的東西。
**這個模式的決定性優點：它不要求本站自己贏得 SEO。** 它把「本站排不上」這個 §1 的核心弱點整個繞過去，改成向已經排得上的人收費。同時它與「不做編輯內容」的決定完全一致——甚至是這個決定的自然延伸。

**（c）捐款 / Buy Me a Coffee**
零政策風險、零工程成本、量級很小。不是商業模式，但作為 P3 的**佔位方案**比 AdSense 更誠實：在確認 AdSense 能不能過之前，先放一個不會被拒的東西。

### 6.4 一個更根本的提問

如果 §2 目標三（自然搜尋 + 廣告）被證實不成立，**§9 的 P1（大，架構重寫）還值得做嗎？**

值得——但理由要換。P1 的產出（SSR、三語獨立 URL、穩定命名、JSON-LD）同時是 **6.3(b) 資料授權**的技術前提，也是被 AI 引擎引用（§3.2 修正後）的前提。也就是說 P1 可以保留，但它的正當性應該從「為了 AdSense 流量」改寫為「為了讓這份資料可被機器與人穩定取用」。這是一個小改動，但它會讓後續每一個取捨的方向都不一樣——例如它會立刻讓 FR24 封鎖 `OAI-SearchBot` 這件事變得明顯荒謬。

---

## 7. 建議的 PRD 修改清單

| # | 位置 | 建議 | 嚴重度 |
|---|---|---|---|
| C1 | §1 | 修正對 castel.jp 的描述：它**就是**票券庫存表，且是日文目標查詢的第一名。本站相對它的優勢是粒度與自動化，不是「它不做這件事」 | **高** |
| C2 | §2 目標三 / §5 | 明寫「零編輯內容」與「長尾 SEO」的衝突無解，並二選一：接受目標三不成立、或鬆綁「完全不做編輯內容」 | **高** |
| C3 | R2 | 由「待查證」改為「已查證、風險確立」，引用 support.google.com/publisherpolicies/answer/11112688 原文 | **高** |
| C4 | §9 | **把 AdSense 送審從 P3 提前到 P0**。這是幾天可得答案的便宜門票，不該擺在所有工程投入之後 | **高** |
| C5 | FR24 | 拆為「訓練用途→拒絕」與「帶引用連結的檢索用途→允許」兩份清單；`OAI-SearchBot`、`PerplexityBot`、`ChatGPT-User` 應移出拒絕清單 | **高** |
| C6 | §6.6 / R11 | 移除或標註 `Google-Extended` 為「立場宣示、無實際效果」，避免造成「R11 已處理」的錯覺 | 中 |
| C7 | §3 | 依 §4.4 重構指標分層；補「AdSense 核准／填充率」與「導向官方商店的外連 CTR」；新增明確止損條件 | **高** |
| C8 | §3 | 標註「比較廣度」的量測困難（FR1 的設計本身抑制互動事件），不應為唯一行為指標 | 中 |
| C9 | R1 | 更新 Raptive 門檻為 25k（25k~100k 區間要求 50% tier-1）；補記 Ezoic 對 2026-02-19 後新站的 25 萬門檻。**R1 的結論成立**，數字需更新 | 低 |
| C10 | R1 或新增 R12 | 記錄「排除付費層」的量化成本：達成同等收入所需流量提高約 12~23 倍 | 中 |
| C11 | §5 排除表 | 把排除聯盟的理由由「使用者選擇」升級為 §6.2 的實質理由（庫存不一致、破壞非官方定位、加重 R3 曝險） | 中 |
| C12 | §10 | 把「資料授權／API」列入未來方向——它不要求本站贏得 SEO，且與「不做編輯內容」完全相容 | 中 |
| C13 | §6.6 | 補記敘事一致性成本：本站抓取他人資料、同時拒絕他人抓取自己，在 R7 情境下是對方可用的材料 | 低 |
| C14 | §9 P1 | 現況無 `robots.txt`（已驗證），FR24 為新建而非修改 | 低 |

---

## 8. 已驗證事實 vs. 推論

### 8.1 已驗證（來源為官方文件或直接觀察）

| 事實 | 來源 |
|---|---|
| Google 官方：「Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal in Google Search.」「It has no effect on Google Search or other products.」 | <https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers> |
| Googlebot 的偏好設定影響「Google Search (including Discover and **all Google Search features**)」——AI Overviews 屬 Search features | 同上 |
| OpenAI 官方：「Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers」 | <https://developers.openai.com/api/docs/bots> |
| Google Publisher Policies：「We do not allow Google-served ads on screens: without publisher-content or with low-value content...」「don't place ads on automatically generated content without manual review or curation.」 | <https://support.google.com/publisherpolicies/answer/11112688> |
| Google Publisher Policies（Replicated content）：「with embedded or copied content from others without additional commentary, curation, or otherwise adding value to that content」 | <https://support.google.com/adsense/answer/9335564> |
| Google Search spam policies：「creating sites that compile third-party content without substantial added value」；scaled content abuse 明列 "translating" 為 obfuscation 手法之一 | <https://developers.google.com/search/docs/essentials/spam-policies> |
| AdSense：「Your content must be high-quality, original, and attract an audience.」 | <https://support.google.com/adsense/answer/9724> |
| Publisher Restrictions 的效果：「In some cases this will mean that no advertising sources are bidding on your inventory and no ads will appear on your content」 | <https://support.google.com/adsense/answer/10437795> |
| 日文目標查詢第一名為 castel.jp 的「売り切れ状況・在庫状況一覧」，形態為長文 + 人工 ◯/△/－ 表，無數字剩餘量 | <https://castel.jp/p/8928>（已直接讀取） |
| 繁中／英文目標查詢前排 100% 為長文攻略或通路內容行銷 | 三語 SERP 觀察（§1.1 列表） |
| usjexpress.com 定價：Budget $3.99 / Value $6.99 / Deluxe $11.99，無票全額退款 | <https://usjexpress.com/>（已直接讀取） |
| usjexpresspass.com 不公開定價、**不公開庫存資料**、頁面無廣告 | <https://usjexpresspass.com/>（已直接讀取） |
| usjalert.com 早期存取免費，僅發通知、不公開庫存 | <https://usjalert.com/>（已直接讀取） |
| Raptive 門檻降為 25,000 月瀏覽；25k~99,999 區間要求 50% 流量來自 tier-1 | <https://www.searchenginejournal.com/raptive-drops-traffic-requirement-by-75-to-25000-views/558780/> |
| Ezoic Access Now 無流量門檻，但 2026-02-19 後新增站台須符合 25 萬要求 | <https://support.ezoic.com/kb/article/getting-started-ezoics-requirements> |
| Klook 景點類聯盟佣金約 5%（tours/hotels 6.5%） | <https://involve.asia/blog/klook-affiliate-program/>、<https://getlasso.co/affiliate/klook/> |
| 日本 AdSense CPC 約 US$0.14（香港 $0.13、新加坡 $0.27） | <https://partnerkin.com/en/blog/articles/adsense_rpm_rates_by_country> |
| 本專案資料規模：23 個票種 × 63 個日期（2026-08-16 ~ 2026-10-17） | `data/index.json`、`data/days.json`（已直接讀取） |
| repo 中目前**不存在任何 robots.txt** | `find . -name "robots*"` 無結果 |

### 8.2 推論（我的判斷，非事實）

| 推論 | 信心 | 若要證偽 |
|---|---|---|
| 零編輯內容的站台無法在目標長尾查詢上排進前段 | **高** | 找出任一個純資料工具站排在這些查詢前 10 名 |
| AdSense 初審以現況形態送出，通過機率低 | 中高 | **直接送審即可證實／證偽——成本近乎零，強烈建議立刻做** |
| 即使通過初審，後續被標記 inventory restriction 而導致零填充的風險顯著 | 中 | 上線後觀察填充率 |
| 綜合 RPM 落在 US$1~4 | 中（**最脆弱**） | 上線兩週的實測 RPM |
| 第一年月收入落在 US$5~100 量級 | 中 | 同上 |
| 付費層在相同收入下只需 1/12~1/23 的流量 | 中（轉換率為假設值） | 實測 session→付費轉換率 |
| 資料授權／API 是最值得重開的補充變現 | 中 | 向 3~5 家攻略站詢價，看有無付費意願 |
| 本站的 robots.txt 立場在 R7 情境下會成為對方材料 | 低（敘事層面，非法律意見） | — |

---

## 9. 一句話總結

**這份 PRD 的工程部分（§7 法遵護欄、§6.1 產品設計）是紮實的；商業部分不是。** 三個決定（零編輯內容、純 AdSense、封鎖 AI 爬蟲）各自看起來像是簡化，合起來卻構成一個閉環：**沒有內容 → 排不上 → 沒流量 → 廣告無收入；而為了保住那個不存在的收入，又關掉了少數幾個不需要贏 SEO 就能帶來曝光的入口。**

**最便宜、最該立刻做的一步：把 AdSense 送審從 P3 提到 P0，用現有的單頁去送一次。** 幾天就能拿到答案，而這個答案會決定 P1 那筆昂貴的架構重寫要不要照現在的理由去做。

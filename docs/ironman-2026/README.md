# 可信的 AI Research System：ResearchForge 的 30 天工程紀錄

ResearchForge 並不是從一套成熟的研究架構開始。它先是一個能產生、排版與匯出報告的工具，接著才逐步面對更難的問題：來源是否相關、同一研究如何辨認、缺少的事實怎麼保存、Writer 可以說多強、全文是否真的取得，以及誰有權決定一筆材料能不能進入正式輸出。

這個系列以實際專案歷史為界，保留通過、失敗、撤回與未知。它不把測試通過寫成 live generalization，也不把 HTTP 200、metadata、摘要或受控 fixture 寫成已取得可引用全文。系列終點仍有未解工程問題；可信度來自把這些問題留在正確狀態，而不是用流暢文字補完。

## 30 日目錄

| Day | 文章 | 核心問題 |
|---:|---|---|
| 01 | [從報告生成器開始：成品出現了，研究還沒有](articles/day-01.md) | 可見輸出與可信研究為何是兩套工程問題？ |
| 02 | [模板先完成，證據仍然缺席](articles/day-02.md) | 介面、文件與知識完整度如何分開？ |
| 03 | [引用在句尾，證據仍可能不成立](articles/day-03.md) | 引用存在為什麼不能證明句子被支持？ |
| 04 | [搜尋開始成為一條流程：API 回應只是第一站](articles/day-04.md) | 搜尋如何拆成可診斷、可負責的階段？ |
| 05 | [資料先過關：Accepted Source 如何建立單向流水線](articles/day-05.md) | 被拒絕的來源如何避免從另一條路回到 Writer？ |
| 06 | [搜尋題目不是一個字串：Query Expansion 如何不搜歪](articles/day-06.md) | 查詢變多時，如何保留原研究問題？ |
| 07 | [三個學術 Provider，三種資料形狀](articles/day-07.md) | 多個學術 API 如何共享資料語言又保留差異？ |
| 08 | [DOI、作者與年份：去重其實在辨認研究](articles/day-08.md) | 去重為何是 scholarly work identity 問題？ |
| 09 | [每個字都對，題目卻變了：離題結果為何最難除錯](articles/day-09.md) | 看似相關的搜尋結果如何悄悄改題？ |
| 10 | [從摘要到可主張證據：Evidence Card 的真正工作](articles/day-10.md) | 寫作材料至少要保存哪些支持關係？ |
| 11 | [不要把十篇來源接成一篇：Synthesis 的第一道分界](articles/day-11.md) | 來源順序為什麼不能決定文章結構？ |
| 12 | [部署失敗也是架構訊號：本地能跑不代表入口正確](articles/day-12.md) | Runtime entrypoint 與 build output 如何改變產品行為？ |
| 13 | [瀏覽器關掉，研究工作還在嗎？](articles/day-13.md) | Client request 與 durable job 為何必須分離？ |
| 14 | [Direct Paper Search 的權限邊界](articles/day-14.md) | 搜尋入口如何避免變成證據旁門？ |
| 15 | [Report Intelligence 整合：測試全綠，真實輸出仍可被擋下](articles/day-15.md) | Integration pass 與 live output acceptance 如何並存？ |
| 16 | [Writer 之外，誰負責關閉出版閘門？](articles/day-16.md) | 生成後誰驗證句子與引用的支持關係？ |
| 17 | [長報告可能只剩短報告：證據決定可寫長度](articles/day-17.md) | 字數要求為什麼不能命令證據出現？ |
| 18 | [Case A 通過、Case B 擋下：出版驗收必須綁定個案](articles/day-18.md) | 一份成功文件能證明到哪裡？ |
| 19 | [三個新題，零個完整出口：成功 Demo 遇上泛化測試](articles/day-19.md) | 固定 unseen cohort 如何防止挑結果？ |
| 20 | [十個新題暴露共同瓶頸：先找第一個失敗層](articles/day-20.md) | Retrieval、access、facts 與 Writer 應先修哪一層？ |
| 21 | [先把 Study Facts 變成可拒絕的資料](articles/day-21.md) | UNKNOWN、NOT_REPORTED 與零為何不可混用？ |
| 22 | [Evidence Gap 要能驅動補查，而不是無限重搜](articles/day-22.md) | 缺口如何變成 bounded acquisition action？ |
| 23 | [Client Timeout 不是研究失敗：把生命週期交還給 Job](articles/day-23.md) | Wait expiry、transport timeout 與 terminal state 有何差別？ |
| 24 | [同一研究只能有一個 Admission Owner](articles/day-24.md) | 多個 consumer 如何避免 split-brain truth？ |
| 25 | [HTTP 200 不是全文：從回應成功到可用 Artifact](articles/day-25.md) | Route、payload、artifact、identity 與 qualification 如何分層？ |
| 26 | [合法 Open Access 也可能只是 Landing Page](articles/day-26.md) | 合法路徑為何仍要驗格式、身分與正文？ |
| 27 | [9/10 找到研究，2/10 拿到全文：兩種 Coverage 不能合併](articles/day-27.md) | 找到 direct study 與拿到 qualifying full text 如何分開計數？ |
| 28 | [先前的「通過」可能需要被撤回](articles/day-28.md) | Closure audit 何時應推翻舊摘要？ |
| 29 | [Retry 不是免費的：Execution Budget 必須管到 Side Effect](articles/day-29.md) | Agent 的外部動作如何在執行前取得預算？ |
| 30 | [讓「不知道」成為一級輸出](articles/day-30.md) | 系統如何把未知保存成有 provenance、有下一步的狀態？ |

## 系列的四條主線

- 搜尋與來源：題目、provider、normalization、dedupe、relevance、review。
- 證據與寫作：Evidence Card、synthesis、Study Facts、Writer、citation verification。
- Runtime 與治理：durable job、terminal state、canonical admission、execution budget。
- 出版與誠實邊界：case-scoped acceptance、generalization、legal full text、UNKNOWN。

Repository 內的文章是 canonical publication source。所有文章目前只到 `READY_FOR_HUMAN_REVIEW`；尚未取得人類核准，也未在 iThome 發布。


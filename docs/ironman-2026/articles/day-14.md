# Day 14｜Direct Paper Search 的權限邊界

到 2026 年 7 月，ResearchForge 已有一條由研究題目展開的來源流程。但使用者有時不是要立刻完成整份報告，只是想直接找一篇 paper、查看基本資料，再把摘要帶往下一步。Direct paper search 因此成為一條獨立入口。

這個功能很容易被高估。搜尋頁能展示更多 papers、逐步產生摘要、過濾明顯離題結果，使用體驗確實更直接；但 discoverability 改善，不代表 evidence eligibility 已被解決。

## 搜尋 UX 解決的是「找到」

Direct paper search 的價值，是縮短使用者與候選文獻之間的距離。結果不必等整條研究 pipeline 完成才出現；摘要也可以 progressive 地補上，讓使用者先看到可辨認的 paper records。

對前端而言，這需要處理 loading、部分結果與離題項目。對 API 而言，則要有獨立 route，把查詢轉成 normalized paper result。這些都是具體產品能力，不能因為它們不是最終 evidence gate 就否定。

然而，搜尋卡片上的標題、作者、年份與摘要只回答「這可能是哪篇研究」。它尚未回答研究是否直接對應問題、是否取得足夠內容、可否抽出可追溯事實。

## Summary handoff 最容易越權

當系統已經能替 paper 生成摘要，下一步很自然是把摘要交給報告 Writer。但這條捷徑會把 discovery 變成 admission：只要某筆結果看起來相關，就直接獲得進入正式內容的資格。

安全的 handoff 必須保留限制。摘要可協助使用者理解候選，不得聲稱已檢查全文；搜尋結果可被選取，不得因一次 click 就提升成正式證據。若原始資料只有 metadata，summary 也只能在 metadata 或現有摘要範圍內工作。

```text
paper result
→ 可閱讀的 summary
→ 人工選取或後續審查
→ 更嚴格的 evidence path
```

這個順序讓搜尋入口保持輕量，同時避免它成為繞過研究流程的旁門。

## 「直接搜尋」不等於「直接研究」

這兩個中文詞很接近，工程上卻不同。Direct paper search 是產品入口；direct study 是後來用來描述能直接回答研究問題的 empirical unit。前者可以找到 review、背景文章或相關但不同族群的研究；後者需要更嚴格的 population、exposure、outcome 與 study type 判斷。

2026 年 7 月的 commit 證明的是搜尋與摘要 workflow 已加入，不能把後來的 direct-study classification 或全文資格回填到這一天。這個 chronology boundary 很重要，否則功能歷史會看起來像一開始就擁有後來所有治理層。

## 入口也需要誠實的完成狀態

Progressive summary 的設計提醒我，UI 不必等所有工作結束才顯示任何東西，但每個中間產物都要標明自己的狀態。Paper record 已取得、摘要正在產生、摘要可用、來源需進一步審查，不應被壓成同一個 loading spinner。

同樣地，irrelevance filter 可以減少明顯噪音，不能被描述成已證明 paper 合格。搜尋頁的成功標準是讓人更快找到與理解候選；研究系統的成功標準還包括材料、事實、引用與輸出閉合。

這條 direct paper workflow 讓 ResearchForge 更像一個可用產品，也更清楚暴露 discovery 與 evidence 之間的縫隙。接下來的大型 report-intelligence 整合會把 facts、claims、statistics、Writer 與正式文件接進同一條 vertical slice；入口變多之後，真正的驗收問題反而更尖銳：綠色 regression 能證明到哪裡？

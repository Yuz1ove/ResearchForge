# Day 15｜Report Intelligence 整合：測試全綠，真實輸出仍可被擋下

2026 年 8 月 13 日的整合，是 ResearchForge committed history 的最後一個大型 checkpoint。報告規劃、結構化事實、claim graph、citation markers、Writer checks、正式文件與品質閘門被接進同一條 vertical slice。從檔案與 contract 的角度看，專案終於不再只是零散功能。

同一天的 QA 卻沒有給出「全面完成」的故事。Configured regression 全部通過，真實模型執行仍因句級主張與引用關係不足而停止正式匯出。這不是互相矛盾，而是兩種測試回答了不同問題。

## Vertical slice 到底證明什麼

一條 report-intelligence slice 至少要讓資料穿過幾個責任區：來源進入 facts 與 claims，報告計畫決定章節需求，Writer 只取得安全投影，生成後再驗證引用與內容，最後才形成 canonical document 與 export。

```text
sources
→ facts / claims / report intelligence
→ writer-safe projection
→ Writer
→ post-edit verification
→ quality gate
→ document / export
```

把這些元件串起來的價值，是可以觀察錯誤在哪一層發生。以前只看到最後文章不好；現在可以區分 fact contract、Writer output、citation entailment 或 export gate。

但 integration existence 只證明路徑存在。它不能證明每一個真實題目都有足夠來源，也不能證明模型會在每次執行中遵守 claim boundary。

## Regression PASS 的正確讀法

那次 QA 記錄了 828 項 configured regression checks 通過。這個數字有價值：它說明當時配置的 package contracts 沒有出現已知 regression。它不等於 828 份真實報告，也不等於多題 live acceptance。

數字若脫離 scope，會比沒有數字更危險。Parser fixture 可以證明特定 payload 被正確解析；deterministic benchmark 可以證明固定輸入遵守 contract；它們都不能證明外部 provider 當下可用，更不能證明新題目取得合格內容。

因此我會替每個 PASS 補一句「它不能證明什麼」。Regression PASS 不能證明 live content；Writer response 不能證明 citation；檔案建立不能證明 publication readiness。這不是故意降低成果，而是讓結果能被正確使用。

## 真實模型輸出讓 gate 有了意義

同一階段的實際模型執行產生了可閱讀內容，卻沒有通過 post-edit claim/citation entailment。正式 DOCX 與 PDF 因此被阻擋。

如果品質 gate 只在測試 fixture 中存在，團隊很難知道它在真實輸出面前是否真的會關門。這次失敗證明了更重要的行為：即使上游整合完成、模型也有回答，系統仍能拒絕把不合格內容包裝成正式文件。

這個結果應被寫成 failure，而不是「幾乎成功」。能完成部分段落，不足以把正式匯出改成通過。Fail closed 的價值正是在輸出很像成品時仍保留拒絕權。

## Committed history 與後續 worktree 要分開

這個 checkpoint 也是時間邊界。後來的 canonical admission、legal full-text materialization 與 authoritative budget 都出現在 HEAD 之後的工作階段，不能寫成這次 commit 已包含。即使今天在同一個 repository 看得到那些檔案，Git history 與 later worktree evidence 仍是不同證據類型。

到這一天，ResearchForge 已有一條可測的 intelligence vertical slice，也清楚遇到 live Writer verification failure。整合證明路徑存在，失敗則指出權限邊界：Writer 可以產生文字，不能因為文字順暢就替自己取得發布權。

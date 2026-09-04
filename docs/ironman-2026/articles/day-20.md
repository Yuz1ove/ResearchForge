# Day 20｜十個新題暴露共同瓶頸：先找第一個失敗層

三個 unseen topics 告訴我 golden case 不能代表泛化，卻還不足以判斷共同弱點。8 月 25 日，ResearchForge 把固定 cohort 擴成十個新題，讓 retrieval、access、study facts、admission、Writer 與 export 都留在同一張矩陣裡。

結果很直接：0/10 publishable，0/10 FORMAL；被阻擋的 cases 沒有 report、DOCX、PDF 或 chart。Writer requests 也維持在零。這不是 Writer 完全失靈，而是 upstream 材料沒有取得讓 Writer 開始工作的資格。

## 一張 cohort matrix 比十份錯誤訊息有用

若每題只回傳「生成失敗」，很難看出共通性。Cohort matrix 則把每一層分開：provider 是否取得候選、是否辨認 direct study、是否有 full-text access、能否抽出 design、direction 與 numeric facts、Writer gate 是否開啟。

如此一來，同樣是沒有報告，可以區分：

```text
retrieval 沒找到候選
≠ 有候選但沒有 direct study
≠ 有研究但沒有可用內容
≠ 有內容但 facts 無法准入
≠ Writer 輸出驗證失敗
```

只有知道第一個失敗層，修復才不會落在錯誤位置。

## 共同瓶頸不代表只有一個根因

那次 current-live 報告把 structured study-fact extraction 與 schema admission 指認為共同 bottleneck，同時也保留某些題目更早就卡在 retrieval 或 access 的事實。

「共同」不是說十題都以完全相同方式失敗，而是即使較早層取得一些材料，整體仍無法穩定把 study-level facts 送過 admission。對部分 cases，真正的 first weak layer 更早；不能因為想要一個乾淨 root cause 就把差異擦掉。

這也解釋 Writer request 為零的意義。當 upstream 沒有足夠 evidence，呼叫 Writer 只會產生不可驗證內容與額外成本。零次不是功能缺失，而是 gate 按規則保持關閉。

## Green regression 與 live zero 可以同時成立

這輪最容易被誤解的畫面，是工程測試仍可通過，真實 cohort 卻 0/10 publishable。Regression 檢查固定 contract；live run 同時受 provider availability、題目分布、全文存取與實際內容影響。它們不在同一個分母上。

成熟的報告不應讓兩種結果互相覆蓋。Regression 綠色表示已知行為沒有破壞；live zero 表示固定十題仍未達內容門檻。只有同時寫出，團隊才知道核心 code 沒有明顯退化，但 product readiness 仍不足。

## 下一步不是改 Prompt

如果 Writer 根本沒有被呼叫，調整 Writer prompt 不可能修復這一輪結果。最小下一步是把 study-level facts 做成能保留狀態、locator 與 provenance 的 contract，讓 admission 知道缺的是什麼。

0/10 是固定十題、特定時間的 current-live結果，不代表所有 provider 或所有研究題目永久無法工作。它的工程價值在於把修復焦點從「讓文章看起來更完整」移到「讓事實可以被可靠接受或拒絕」。

這個 first weak layer 需要一個比 optional field 更嚴格的資料合約。沒有看到、研究沒有報告、確定為零，三者絕不能被存成同一個 `null`；Study Facts V2 正是從這個差異開始。

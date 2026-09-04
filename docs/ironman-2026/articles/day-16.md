# Day 16｜Writer 之外，誰負責關閉出版閘門？

生成式模型最擅長的事情之一，是把不完整材料整理成一段讀起來完整的文字。對一般草稿工具，這常是優點；對研究系統，它也是最需要防守的風險。段落越順，讀者越不容易注意到某個因果詞、族群範圍或數字其實沒有足夠來源。

8 月 13 日的實際 Writer 執行，把這個問題變成具體結果：要求的七個 section 都有輸出位置，但其中四個來自模型，三個走 fallback；生成後的句級 claim/citation entailment 沒有通過，正式匯出因此保持關閉。

## 有七個段落，不等於七個段落都成立

如果驗收只看章節是否齊全，這次執行很容易被報成成功。文章結構存在，文字也能閱讀，引用標記甚至可能出現在預期位置。但研究報告的最小單位不是「段落有沒有」，而是段落裡每個重要主張是否能回到足以支持它的 evidence。

Fallback 也不能被偷偷算成模型成功。它可以維持介面結構，或明確告訴讀者材料不足；它不能用通用文字填滿缺失的研究答案。把 model section 與 fallback section 分開計數，正是為了不讓輸出完整度掩蓋內容來源。

## Two-pass Writer 仍需要外部驗證

當時的 Writer 採取 `teach-back → academic reconstruction` 的兩階段思路。第一階段先確認模型如何理解受控材料，第二階段再轉成較正式的研究敘事。這比一次要求模型直接產生終稿更容易定位錯誤，也能讓寫作與資料投影分開。

但兩個 pass 都是生成行為。它們不能自行證明自己的輸出。完成 reconstruction 後，系統仍要重新檢查句子與 citation 的支持關係，因為任何改寫都可能移動主張強度。

```text
受控 facts / claims
→ teach-back
→ academic reconstruction
→ sentence-level verification
→ export gate
```

最後一個箭頭不能省略。模型在第一階段理解正確，也可能在第二階段為了連貫而補入未支持的轉折或結論。

## Writer 是 consumer，不是 authority

一個可靠的 Writer 可以決定段落順序、解釋術語、刪除重複，卻不應決定某筆來源是否升格成 evidence。若 Writer 同時看到原始摘要、accepted source 與被阻擋資料，它很難穩定遵守每一層限制。

更安全的做法，是先投影一個窄資料面，只包含允許使用的 facts、claim strength、citation identity 與必要限制。Writer 的自由留在語言層；改變真實性或權限的決定留在外部 gate。

這個階段尚未有後來集中式的 canonical study admission，所以不能假裝所有 consumer 已共享單一 authority。能由實際 QA 證明的是：Writer 輸出沒有取得自動發布權，而且 verification failure 真的擋住了正式文件。

## 被擋下來也是有效工程結果

面對一篇看起來已經完成的文章，最難的產品決定往往不是再修一句，而是拒絕交付。這次結果沒有讓 ResearchForge READY，卻確認 fail-closed gate 不是裝飾。

對其他生成系統也是如此。合約、醫療說明、財務分析或程式變更，只要 Writer 的文字會造成高風險後果，就需要一個不由 Writer 自己控制的 admission 或 validation layer。生成成功與准許發布必須是兩個事件。

Fail-closed 不只會擋住整份輸出，也會縮小輸出。當 unsupported prose 被刪除，原本要求的長報告可能只剩一份短而有限的內容；那不是系統突然變笨，而是它終於停止用語言掩蓋證據密度。

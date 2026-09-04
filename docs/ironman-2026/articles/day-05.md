# Day 05｜資料先過關：Accepted Source 如何建立單向流水線

當我第一次把 ResearchForge 的流程畫成箭頭時，它看起來並不驚人：題目、搜尋、來源、證據、報告、匯出。真正重要的是箭頭的方向。每一個下游步驟只能使用上一關已經接受的資料，不能為了完成輸出，回頭把被拒絕的來源重新撿回來。

2026 年 6 月的那條流水線，還沒有後來完整的 canonical authority，但它已經把產品從「輸入題目就生成」改造成一個 staged workflow。這是 ResearchForge 第一次有了研究系統的骨架。

## 第一道關不是 Writer，而是把題目說清楚

短題目很難直接拿去搜尋。「微塑膠」可以指環境分布、人體暴露、海洋生物、生態毒理或政策；「社群媒體與睡眠」也可能混合不同年齡、不同平台、不同使用型態與不同 outcome。

因此流程先做 topic clarification 和 search planning。它不是要把題目擴寫成一段漂亮介紹，而是建立後面檢索要守住的範圍：核心概念、可能的中英文詞、子題，以及哪些方向不應該被混進來。

這一步後來演化成更完整的 topic anchors、facets、must-include 與 exclude terms。早期版本比較簡單，但已經有一個正確直覺：搜尋不是拿原句去 API 撞運氣，而是把研究意圖編譯成可執行的查詢。

## 搜尋結果只是候選，不能直接變成證據

來源從學術 provider 回來後，系統要先解決格式差異。不同服務提供的作者、年份、摘要、DOI、URL 與來源類型並不完全一致；如果前端直接認識每一種 provider，去重、排序與日後擴充都會變得很脆弱。

ResearchForge 因此建立共同的 source record。provider adapter 負責把外部差異吸收掉，後面的 UI 與 evidence logic 使用同一種語言。這也是為什麼 normalization 是資料管線的一部分，而不只是 type conversion：只有先知道哪些欄位可以比較，系統才有機會判斷兩筆結果是不是同一篇、哪一筆 metadata 更完整。

但正規化完仍然只是候選來源。系統還要做相關性與權威訊號判定，並讓使用者接受或拒絕。當時的互動設計把這個責任留給 source review：來源卡顯示足夠資訊供檢查，接受後可以收合，誤選也能取消。

這裡形成一個重要的不變條件：報告生成只能看 accepted sources，不能把搜尋結果陣列整包交給下游。

## Evidence Card 是中間層，不是另一張漂亮卡片

使用者接受來源之後，ResearchForge 會建立 Evidence Card。早期 evidence card 的能力比現在簡單，主要目的是把來源轉成報告可以使用的摘要、可引用重點、章節提示與 citation identity。

這個中間層很容易被誤解成 UI 元件。實際上，它更像一份 contract：上游說「這些材料已通過來源審查」，下游則只能根據卡片裡明確存在的內容寫作。Evidence Card 不應該創造來源沒有的事實，也不該因為摘要寫得順，就提高主張強度。

以下是這條早期流程的簡化表示，不是 exact implementation：

```ts
const candidates = await searchSources(plan);
const normalized = dedupeAndScore(candidates, topic);
const accepted = await reviewSources(normalized);
const cards = buildEvidenceCards(accepted);

if (!generationReadiness(cards).canProceed) {
  return showEvidenceGaps(cards);
}

return createReportDraft(cards);
```

這段最重要的不是函式名稱，而是 `canProceed`。在一個傳統生成器裡，錯誤通常發生在最後一次 API call；在研究流水線裡，系統應該更早判斷材料是否足夠。如果不足，就把 gap 顯示出來，而不是讓 Writer 幫忙遮住。

## 為什麼 Evidence Card 不該全部堆在畫面上

那段時間還有一個看似 UI、其實很像架構的爭論：來源卡和證據卡要不要都完整顯示在主畫面？

答案最後不是「資訊越多越透明」。來源卡是使用者的決策點，所以應該清楚、可展開、可接受或撤回。Evidence Card 則主要服務下游報告，它可以在 debug 或詳細檢視中出現，但不需要把所有中間欄位同時塞在主要操作流程。

這個選擇教會我，透明度不等於把內部資料全部倒給使用者。好的透明度是讓人看見會改變決策的資訊：來源為什麼相關、目前被接受了什麼、報告還缺哪一類證據。至於 parser 的每個欄位、內部 ID 與診斷資料，應該保留可追溯性，但不必主宰前台。

## 早期流水線仍然有一個大洞

現在回頭看，這條流程雖然順序正確，authority 還不夠集中。accepted sources、evidence cards、generation readiness 與 report writer 分散在不同模組；每個地方都有機會重新解釋「這筆資料能不能用」。

在題目少、資料型態單純時，這個問題不一定立刻爆炸。等系統加入全文、Study Facts、FORMAL／LIMITED 分級與更多 Writer 路徑後，同一篇研究可能在一處被拒絕，到了另一處卻重新變成合格。那就是系列後半段 canonical admission 要處理的 split-brain truth。

但不能因為後來發現更深的問題，就否定這條早期流水線。它建立了最關鍵的單向資料流，也讓每一層開始有可測的責任。沒有這一步，後面所有 authority、provenance 與 fail-closed gate 都沒有可以落地的位置。

## 流水線真正需要的是不變條件

只畫出方框不會自動得到可靠架構。早期最重要的不變條件是：報告只能消費 accepted sources 衍生的材料，被拒絕的候選不能從另一條路回到 Writer。若某層拒絕資料而下游仍能撿回來，流程圖只是建議，不是治理。

同樣地，降級要沿著箭頭向後傳。Provider 只取得部分資料，Evidence Card 就不能假裝完整；卡片只有摘要級支持，Writer 就必須降低語氣。這個原則尚不等於後來的 canonical authority，卻建立了它所需要的單向所有權。

這條單向流水線把下一個實務難題推到最前面：怎麼把一個研究問題擴成多組查詢，又不在擴張過程中把原本的問題弄丟？Query Expansion 的風險不在它不夠聰明，而在它可能很流暢地改掉原題。

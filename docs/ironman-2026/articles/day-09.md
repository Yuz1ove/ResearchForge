# Day 09｜每個字都對，題目卻變了：離題結果為何最難除錯

搜尋完全失敗其實不難處理。畫面顯示零筆，provider 回 timeout，大家都知道下一步要查 query 或外部服務。真正麻煩的是另一種結果：系統找到很多篇，標題裡也有關鍵字，但沒有幾篇真的能回答原研究問題。

這種錯誤在 ResearchForge 裡反覆出現。Query expansion 越積極，候選數越漂亮，topic drift 的風險就越高。使用者問的是特定族群、特定 exposure 與特定 outcome，結果清單可能只保留其中一兩項。每篇單獨看都「相關」，合在一起卻無法支撐報告。

## Relevance 不是一個總分就能說完

早期做 relevance scoring 時，很自然會想把 title match、abstract match、來源類型與年份加成一個分數，再設定門檻。這種方法適合排序，但若只留下總分，除錯會很痛苦。

假設一篇文章因為 title 出現三個熱門詞拿到高分，卻沒有正確 population；另一篇標題比較廣，但 abstract 明確描述目標族群與 outcome。單一 lexical score 可能排錯順序。更糟的是，不同領域的命名習慣不同，固定權重很容易在換題目後失效。

ResearchForge 後來同時保留 relevance level 與 debug reasons，區分 primary、secondary、clue、low、off-topic 等狀態。分級不一定完美，但它讓「這篇為什麼留下」不再只剩一個神祕總分。

## 分級要說明「這筆來源扮演什麼角色」

同一篇 review 可能非常適合補背景，卻不能直接回答介入效果；另一篇研究方法看似相符，population 卻不同，只能作間接線索。早期 relevance 分級因此需要區分 primary、secondary、clue、low 與 off-topic，而不是把所有「相關」壓成一個總分。

這些狀態在當時仍是搜尋與審查訊號，不是後來的 evidence admission class。它們的作用是幫助人看出候選與原題之間的距離，並避免背景資料因高關鍵字命中而直接進入報告。

## 為什麼有時不能把低分結果全部丟掉

Fail closed 不等於凡是低信心就立即刪除。早期 ResearchForge 曾在高品質結果不足時，把 rejected pool 中相對較好的候選保留成低信心待審資料，並清楚標示需要人工確認。

這個策略有一個前提：候選不能自動進入 evidence pipeline。保留是為了讓使用者檢查、幫助調整 query，或避免 provider degradation 造成完全空白；不是把門檻換一個名字後放行。

這種「保留但不晉級」的狀態，在很多 agent system 都很有用。Binary filter 常逼系統過早做出不可逆決定；分層狀態則允許資料繼續被觀察，同時不污染正式輸出。

## False positive 和 false negative 的成本不同

相關性 gate 太鬆，false positive 會進入後面流程，增加人工審查、抽取與 Writer 風險。Gate 太緊，false negative 則會讓真正的直接研究消失，系統誤判為沒有證據。

這類錯誤不能只靠「多搜幾次」解決，因為真正的來源可能已經在候選裡，問題發生在分類與排序。Relevance 系統因此同時需要正例、明顯負例與容易誤判的 hard negatives；修改規則時，要看哪些原本正確的來源被誤殺，也要看哪些離題來源被放行。

更重要的是保留 first weak layer。候選為零，先查 retrieval；候選很多但題目元素缺失，先查 query 與 relevance；被接受的材料仍不足，再往後查證據整理。這比把所有失敗都叫成「搜尋品質不好」更容易修。

## 人工審查不是替演算法收拾殘局

ResearchForge 讓使用者接受或拒絕來源，不代表系統可以把未整理的結果全丟給人。好的 source review 應該先做基本 normalization、dedupe、relevance explanation 與風險標示，讓人的注意力用在真正模糊的判斷，而不是清理機器可以處理的重複資料。

同樣地，人工接受回答的是「這篇值得往下看嗎」，不會讓缺少的內容自動出現。Review 是候選決策點，不是讓搜尋結果取得無限制寫作權的快捷鍵。

## 別只用「前十筆看起來不錯」驗收 ranking

搜尋排序很容易靠肉眼抽查熟悉題目，得到過度樂觀結論。較可靠的做法，是同時保留 direct-study 正例、明顯離題項目與容易誤判的 hard negatives；修改 scorer 時，一起看 precision、recall 與 off-topic leakage。

Provider degradation 也要和 relevance 分開。固定 fixture 測規則，fresh cohort 測外部世界；若某題出現 false negative，應先做局部、可回歸的修復，而不是全域降低門檻。

## 一個好排序器，應該讓錯誤更容易被看見

Relevance scoring 的目標不只是把「好文章」排前面，而是讓系統能解釋目前找到了什麼、缺了什麼、下一步該修哪一層。若一個高分無法被拆解，它對 debug 的價值很有限。

我現在更偏好能回答具體問題的評分：topic anchors 命中了哪些？population 是否一致？source role 是 direct 還是 background？摘要是否真的包含 outcome？哪個 exclusion 觸發？這些欄位不一定全部展示給一般使用者，但應該存在於可稽核層。

去重與相關性處理完後，系統才有一批較值得審查的 sources。可是把每篇摘要縮短成兩句，仍然不會自動得到證據；下一個資料結構必須保存的不只是「這篇在說什麼」，還要讓主張能回到來源與限制。

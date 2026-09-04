# Day 19｜三個新題，零個完整出口：成功 Demo 遇上泛化測試

一個 golden case 通過後，最容易做的事是繼續修它：補齊內容、調整版面、讓每個 gate 都對這份材料更友善。這能產生漂亮展示，卻回答不了系統是否能面對陌生題目。

ResearchForge 因此在同一天用三個新題進行固定 cohort 測試，不重抽有利樣本，也不借用 Case A 的內容。結果是 0/3 通過 complete canonical export。更值得注意的是，其中一個 case 通過了 Writer-level gate，接回較嚴格的 canonical publication gate 後仍被阻擋。

## 固定題組是防止結果被挑選

泛化測試最怕隱形 resampling。某題失敗就換一題，某次 provider 不順就重跑到數字好看，最後只留下成功結果。這會把搜尋運氣、人工挑選與系統能力混在一起。

固定 cohort 的意義，是讓每個失敗都有位置。三個題目各自可能卡在直接證據、grounded claim 或 citation/evidence table；不能因為 failure class 不同，就只報其中較接近成功的一個。

0/3 也有明確範圍。它說的是那三個 unseen topics 在那次 pipeline 與 gate 下沒有完整出口，不代表世界上所有題目永遠失敗。負面數字同樣需要避免過度外推。

## Writer gate 與 Publication gate 為什麼要分開

某個 case 能產生足夠長、看似有根據的 Writer content，不代表它已與 canonical evidence set 閉合。Writer-level gate 可以檢查內容結構、引用形式與基本支持；canonical gate 還要確認輸出的事實、citation registry 與 evidence table 來自同一個受控狀態。

如果兩個 gate 合併成一個 `success`，團隊只會看到「模型寫成功了」，看不到接回 authority 後出現的矛盾。分開記錄才能指出最小修復層：不是再跑一次 Writer，而是查明哪個 canonical binding 沒有成立。

## 失敗不應產生「先看看再說」的正式檔案

當 complete export gate 失敗時，最乾淨的 artifact 是明確的 no-export state，而不是仍產生一份帶警告的正式 PDF。正式檔案很容易脫離介面流通；一旦被下載，旁邊的 warning 未必會跟著走。

這不表示所有中間內容都要丟棄。Diagnostics、可接受的有限摘要與 evidence gaps 可以留在產品裡，但它們不應穿上與已通過報告相同的外衣。

## 這輪測試改變了問題的位置

Case A 通過時，焦點還在 Writer、citation 與 layout。三個新題失敗後，問題往上游移動：到底缺的是 direct evidence、full text、structured facts，還是 synthesis？

這個轉向很重要。若所有失敗都叫「報告生成失敗」，團隊自然會一直調 prompt；若每題保存 first weak layer，就能知道哪一層最常先讓 Writer 關閉。

三題結果還不足以找出共同瓶頸，因此 ResearchForge 接著擴大到固定十題的 current-live ingestion。工程 regression 仍然通過，十個新題卻沒有任何可發布輸出；更關鍵的是，Writer 一次都不應被呼叫，因為第一個失敗層仍在更上游。

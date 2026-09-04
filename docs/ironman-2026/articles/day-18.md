# Day 18｜Case A 通過、Case B 擋下：出版驗收必須綁定個案

在 8 月 24 日的 publication QA 中，Case A 通過了 citation resolution、content integrity、cross-format anchors 與 rendered visual checks。它證明 ResearchForge 的一條完整路徑可以從 canonical report 走到 DOCX 與 PDF。

同一輪裡，Case B 因 supported content 不足而沒有匯出。這兩個結果必須同時保留。若只展示 Case A，會把個案成功誤寫成系統能力；若因 Case B 失敗就否定 Case A，則會抹掉已證明的工程路徑。

## Publication success 是 case-scoped

一份報告能否出版，取決於當次題目、來源、evidence revision、Writer output 與 renderer。只要其中任何一項改變，前一份文件的 PASS 就不能自動轉移。

Case A 的 20/20 citation resolution 是清楚且有用的數字：在那份個案輸出中，讀者引用都能閉合。它不是一個產品全域 SLA，也不代表 Case B 的正文突然得到二十個可用引用。

這種 case scope 對生成式系統尤其重要。Demo 往往會選擇材料豐富、格式熟悉的題目；真實輸入可能只有摘要、缺直接研究或缺可追溯數值。若 acceptance 沒有綁定 run，成功 artifact 就會變成替所有後續輸入背書的護身符。

## Export gate 不只檢查檔案存在

一份 DOCX 能被建立，只證明 exporter 產生了檔案。Publication acceptance 還要確認正文與 canonical content 一致、引用 marker 能回到參考資料、圖表沒有脫離事實，以及不同格式沒有改變語意。

```text
canonical report
→ reader citation projection
→ document layout
→ DOCX / PDF
→ cross-format 與 rendered review
```

Case A 走完這條路；Case B 在更前面的 supported-content gate 已停止。讓 Case B 不產生檔案，不是 exporter 壞掉，而是上游拒絕把不足內容包裝成正式交付物。

## Layout 修復不能創造內容

出版階段可以修字型、標題、換頁、圖表與引用呈現。它不能替缺失的 evidence 產生新段落。這條分界很容易在趕交付時被破壞：看到頁數太少，就增加留白或重複結論；看到圖表不夠，就把 diagnostics 包裝成研究結果。

較安全的做法，是讓 layout 只投影 canonical document。若內容不足，回到 acquisition 或 synthesis；不要讓 renderer 取得「讓檔案看起來完整」的內容權限。

## 成功案例真正證明的事

Case A 的價值，是確認 citation、content、format 與 visual gate 可以共同閉合。它讓團隊知道這條路不是純規格，而是能生成一份可檢查文件。Case B 的價值，則是確認同一條路在材料不足時仍會停止。

這兩個結果一起才構成可信的 publication pipeline：有能力通過，也有能力拒絕。若 gate 只會在預先挑選的成功案例裡顯示綠色，它還沒有被真正測試。

再美化 Case A 不會回答泛化問題。只有把完全不同的題目送進同一套規則，才知道成功來自可移植的系統，還是來自個案本身；固定 unseen cohort 隨後給出的答案很尖銳：三個新題目，零個完整 canonical export。

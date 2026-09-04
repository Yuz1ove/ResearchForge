# Day 17｜長報告可能只剩短報告：證據決定可寫長度

使用者要求一份長報告時，最直接的工程反應是把目標字數交給 Writer。模型很會延伸：增加背景、換句話說、補過渡句，再把同一組材料從不同角度重述。字數可以達標，evidence density 卻可能一路下降。

8 月 23 日的一次 frozen offline audit，把 raw content 經 validation、repair、trace reconstruction 到 canonicalization 的流失逐階記錄。最後能安全保留的正文只有 2,214 個中日韓字元，證據只支持較短的 Limited Evidence Brief，不能撐起原本要求的長報告。

## Canonicalization 不是刪字比賽

Canonicalization 的目的，不是把文章越縮越短，而是移除沒有可靠 ownership 的內容。某段文字可能文法正確，也可能和主題相關；若它無法連到已支持的主張、在 repair 後仍沒有 citation，或只是另一段的改寫，就不該因為有助字數而留下。

這個過程會暴露一種常見錯覺：raw output 的長度看起來是內容量，其實混合了真正發現、重複說明、模板句與未實現的段落承諾。只有經過 trace 與 support 檢查，剩下的才接近可防守內容。

## 字數要求不能命令證據出現

報告模板可以要求背景、方法、發現、限制與結論，但 evidence 沒有義務填滿每一格。若材料只支援現象描述，模型不能因模板需要「機制」就補一個合理機制；若中央研究問題仍未閉合，結論也不能用更抽象的語言繞過。

因此，我會把長度視為 evidence budget 的結果：

```text
unique supported facts
× 可成立的 cross-source relations
× 可解釋的限制
= 可防守的內容範圍
```

這不是精確公式，而是一個順序提醒。先算材料能承擔什麼，再選輸出形式；不能先定宏大篇幅，再要求 Writer 生出證據。

## 短而誠實，不等於品質低

「Limited Evidence Brief」很容易被誤認成失敗品。實際上，它是一個不同的 product state：內容較短、主張較窄、限制更明確，但讀者知道哪些問題尚未回答。

這種降級比兩種常見做法安全。一種是直接回傳空白，讓已取得的可靠材料無法使用；另一種是硬湊長度，讓可靠與推測混在一起。Limited output 保留可用價值，同時不冒充正式完整報告。

這次 audit 是 frozen/offline evidence，不是 fresh live Writer，也不是廣泛題目的泛化證明。2,214 這個數字只屬於那次受控內容密度檢查。把它寫成系統通常能產生的長度，同樣是超出證據。

## 內容 gate 應比 UI 設定更有權力

如果使用者在介面選了「長篇正式報告」，系統仍需要拒絕不可能的要求。UI 選項描述偏好，evidence gate 描述能力；兩者衝突時，後者應該勝出。

這個原則也讓除錯更精確。報告太短，可能不是 Writer 退化，而是 source diversity 不足、facts 沒有實現、結論 closure 被阻擋。只有 upstream evidence 真正增加，重新生成才可能得到更長而仍然可防守的結果。

這個界線到了出版層會變得非常具體：同一套 citation、layout 與 cross-format pipeline，可以讓 Case A 通過，也必須讓證據不足的 Case B 保持沒有 DOCX、沒有 PDF。

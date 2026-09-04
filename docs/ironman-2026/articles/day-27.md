# Day 27｜9/10 找到研究，2/10 拿到全文：兩種 Coverage 不能合併

搜尋系統常用「找到幾篇論文」描述成功，但這個數字混合了至少兩件事：是否找到直接回答研究問題的 study，以及是否取得足以抽取正式事實的全文。8 月 29 日的 V3 run 把它們分開後，差距非常明顯：direct-study case coverage 是 9/10，qualifying-full-text coverage 仍只有 2/10。

9/10 不是九份可發布報告。它只表示多數 cases 已辨認出直接研究；其中許多仍停在 abstract 或其他 non-qualifying acquisition state。

## Direct Study 是研究角色

一筆來源與題目高度相關，不一定是 direct study。Review 可以整理背景，guideline 可以提供實務脈絡，commentary 可以指出爭點；若研究問題要求某族群、暴露或介入與 outcome 的 empirical result，只有直接檢驗這些元素的研究才屬於 direct unit。

分類至少要檢查 population、exposure／intervention、outcome 與 study design。Title match 很高不足以成立，來源被人工接受也不會自動改變研究角色。

V3 對 zero-direct cases 才啟動 bounded、topic-anchored fallback，避免每題都無限制擴張。這個 cascade 解決 discovery false negative 的一部分，沒有越權替 full-text gate 作答。

## Full Text 是 Materialization 狀態

找到 direct study 後，系統才知道值得為哪個 work 尋找合法全文。接下來仍要經過 route、payload、format、identity、parser 與 qualification。任何一層失敗，都可能留下「有 direct study、沒有 qualifying artifact」。

```text
candidate
→ direct-study classification
→ lawful route
→ payload / materialization
→ qualifying full text
→ Study Facts / admission
```

這張漏斗不能只顯示最上層。否則 9/10 會被讀者自然地理解成系統已擁有九份完整證據。

## 為什麼不該先優化 Writer

當 first weak layer 是 full text，Writer 只能看到摘要與有限 facts。讓它多跑幾次，可能得到不同表述，不能得到缺少的方法細節、效果數值或 exact locator。

V3 沒有用 manual rescue 或重新挑內容美化結果。Body-first HTML extraction 與 PDF fallback 都在 bounded 規則內執行。最後保留 9/10 與 2/10 的落差，正是為了讓下一個工程問題留在 acquisition，而不是被 prose 覆蓋。

## 每個數字都要命名 Success Unit

對任何 retrieval system，我現在會要求指標名稱直接寫出單位：candidate records、unique works、direct studies、qualifying artifacts、admitted facts、publishable reports。只說 coverage 或 success rate，幾乎一定會被誤讀。

這個分層也避免錯誤歸因。Direct-study 低時，先修 query、relevance 或 study type；qualifying full text 低時，先修 legal route、identity 或 parser；facts 低時，再看 extraction。成功單位越明確，first weak layer 越容易定位。

兩種 coverage 分開後，一次 closure audit 才能看見更深的矛盾：一份看似 qualifying 的 artifact，其 canonical owner state 其實是 BLOCKED；名義上的小型搜尋 cascade，也已展開成遠超表面的外部嘗試。可靠系統不只要產生 verdict，還要能撤回不成立的 verdict。

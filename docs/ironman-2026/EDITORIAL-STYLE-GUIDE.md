# ResearchForge 鐵人賽編輯風格指南

## 讀者與承諾

預設讀者是懂基本軟體開發、用過生成式 AI，但未必做過學術檢索或 evidence engineering 的工程師。文章可以使用 canonical admission、provenance、materialization、idempotency、heterogeneity 等術語；第一次出現時，要用自然句子說清楚它在這個問題裡負責什麼。

每篇至少交付一個可移植觀念。ResearchForge 是案例，不是要求讀者採用的產品。文章的價值要能離開這個 repository 繼續成立。

## 聲音

- 使用第一人稱，承認當時的誤判與後來的修正。
- 不虛構場景、對話、工時、情緒或他人反應。
- 把「當時的理解」與「現在回頭看」分開。
- 語氣像工程師寫開發專欄：具體、有判斷，但不把 verdict 當成戲劇效果。
- 不使用空泛開場，例如「隨著 AI 快速發展」。
- 不以「今天是第 N 天」開場，也不以「敬請期待」收尾。

## 一篇文章的節奏

沒有固定模板，但通常要形成這條因果線：

`具體問題 → 當時的假設 → 證據矛盾 → 架構選擇 → 實作邊界 → 得到與沒得到的結果 → 可移植教訓`

開場 2–4 段要出現一個真正的張力：錯誤、反直覺結果、被阻擋的輸出、看似成功卻不可信的功能。正文以完整段落為主。清單只用於精確比較、步驟或資料欄位，不拿來代替論證。

## 歷史敘事規則

- 2026-08-13 以前可引用 commit 作為 committed history。
- 8/13 之後若證據來自 dirty worktree 或 QA artifacts，要說「後續工作階段／驗收」；不可暗示已提交或已部署。
- 後來出現 canonical admission，不代表 6 月的 evidence card 已經有 canonical authority。
- 後來證明 full text 是第一弱層時，可以寫「現在回頭看」，不能改寫早期 parser 判斷。
- PARTIAL、BLOCKED、FAILED 都保留。若原 verdict 被 post-closure audit supersede，只使用最終可辯護的 verdict。

## 證據與數字

- Public article 中先說意義，再決定數字是否值得出現。
- exact tests、SHA、artifact path、absolute path、job ID 留在 backstage。
- 若數字構成故事本身，可以使用，例如「0/10 新題通過」「HTTP 200 仍沒有 qualifying artifact」。
- fixture、replay、prior baseline 與 current live 必須清楚分開。
- `UNKNOWN` 不寫成 0；未檢查不寫成 `NOT_REPORTED`。
- 測試綠只證明被測 contract，不能替代 live content、rendered export 或 deployment acceptance。

## 程式碼與圖

- 程式碼以 5–30 行為原則，只保留理解架構所需的部分。
- 不是 exact historical code 時，標示「以下為簡化版」。
- 不貼 raw provider payload、credentials、private endpoint、auth cookie 或個人資料。
- 圖只在資料流、狀態、時間線或 before/after 比文字更清楚時使用。
- iThome 是否支援 Mermaid 不先假設；正式投稿優先使用已驗證圖片或純文字流程圖。
- 圖說需能獨立說明「輸入、轉換、輸出／阻擋」。

## 反 AI 文風檢查

刪除或重寫：

- 連續的一句一段
- 每節都用「首先／其次／最後」
- 大量粗體、emoji、口號、對稱排比
- 沒有主詞的抽象句，例如「值得注意的是」
- 空泛的價值宣告，例如「大幅提升效率」但沒有說明提升了哪個決策
- 文章末尾把前文換句話說一次

對每個段落問：它是否完成了一個思想，並讓下一段有因果上的必要？如果只是換句話說，就刪掉。

## READY gate

一篇文章只有在以下條件同時成立時才標示 READY：

1. 不知道 ResearchForge 的讀者也能理解問題。
2. 首段有具體張力，結尾自然連到下一篇。
3. 至少一個架構或工程選擇被說清楚，包括 trade-off。
4. public claims 全部出現在 `internal/ARTICLE-FACT-MAP.json`。
5. 沒有把 engineering pass 提升成 content/generalization pass。
6. 程式碼、圖片、連結與 Markdown 經預覽檢查。
7. 做過至少一次 structural edit，而不是只修字句。
8. secret scan 無命中，沒有 internal absolute paths／job IDs／cookies。
9. 文章讀起來不像 README、QA report、PR description 或 changelog。
10. 作者願意在不知道自己是作者的前提下把文章讀完。


# Day 24 Outline｜DOI 不等於全文，HTTP 200 也不等於拿到論文

- **Hook**：resolver 顯示 success、HTTP 回 200，最後卻沒有任何可分析 artifact。
- **Thesis**：bibliographic identity、route discovery、payload fetch、materialization、qualification、admission 是不同事件。
- **Narrative**：metadata success conflation → payload forensics → magic/MIME sniff → identity/structure qualification。
- **Technical core**：HTML landing vs article、PDF magic、JATS/TEI、scanned/OCR、wrong work/supplement rejection。
- **Code**：`artifactCreated` 與 `qualifyingFullText` 分開。
- **Transferable lesson**：資料管線的 success 必須對準產品真正要消費的 artifact，不對準 transport。
- **Fact boundary**：V1/V2 qualifying coverage僅 2/10；不把下載 byte 數當全文成功。
- **Ending**：有內容後還要決定能說到哪個等級。Day 25。


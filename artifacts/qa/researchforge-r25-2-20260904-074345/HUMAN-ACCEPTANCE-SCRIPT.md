# ResearchForge R25.2 Human Acceptance Testing Protocol
## Manual Verification Script for Operators and Quality Evaluators

This protocol guides a human tester through hands-on acceptance of ResearchForge R25.2 Dual-Mode features without technical jargon.

---

### Test Case HA-01: Scenario A — Generate Research Report from Topic
**Goal**: Verify that an operator can type an academic research topic, trigger autonomous research, watch real-time progress, review evidence cards, read a fully grounded report, and export the document.

1. **Access Application**:
   - Open browser at `http://127.0.0.1:22067/`.
   - Verify the landing page shows two distinct cards: **[建立研究報告]** (Scenario A) and **[驗證既有報告]** (Scenario B).
2. **Launch Scenario A**:
   - Click **[建立研究報告]**.
   - Input research topic: `塑膠微粒對海洋生物的影響`.
   - Select Depth: `深度研究` (Deep).
   - Click **[開始全自主研究產製]**.
3. **Inspect Real-Time Flow**:
   - Observe the 9-stage progress tracker:
     1. 解析研究意圖與子問題
     2. 檢索學術文獻 (Crossref, Semantic Scholar, OpenAlex)
     3. 正規化與品質准入審查
     4. 萃取實證並生成證據卡片
     5. 審查實證決策
     6. 規劃篇章報告計畫
     7. 撰寫篇章草稿
     8. 自我驗證引用與修復
     9. 完成可驗證報告
4. **Inspect Workspace**:
   - Verify 3-pane layout on Desktop/Tablet:
     - Left pane: Sub-questions and Admitted Scholarly Sources.
     - Middle pane: Generated Report with numbered citation bindings `[1]`, `[2]`, etc.
     - Right pane: **Citation & Evidence Inspector**.
   - Click any citation marker or source item. Observe the inspector updates with author, year, venue, DOI, evidence span, and verification status.
5. **Export Verification**:
   - Click **[匯出 Markdown]**, **[匯出 DOCX]**, **[匯出 PDF]**, and **[匯出 JSON 封包]**.
   - Confirm file downloads and opens cleanly.

---

### Test Case HA-02: Scenario B — Verify Existing Document
**Goal**: Verify that an operator can upload an unverified document, review claim extractions, inspect citation health, and audit each verdict.

1. **Access Scenario B**:
   - Go to `http://127.0.0.1:22067/research-project` and click tab **[既有報告審查 (Scenario B)]** (or click **[驗證既有報告]** on the home page).
2. **Load or Upload Report**:
   - Click **[載入標準測試報告]** (or upload `.md`, `.docx`, `.txt`).
   - Observe document parsed preview and character counts.
3. **Execute Verification**:
   - Click **[開始執行既有報告查核]**.
   - Observe real-time audit indicator.
4. **Evaluate Results**:
   - Verify overall Citation Health score breakdown (Coverage, Correctness, Sufficiency).
   - Review 5 claim cards displaying exact verdicts:
     - `SUPPORTED`: Valid claim with matched peer-reviewed DOI.
     - `PARTIALLY_SUPPORTED`: Claim with partial scope match and suggested correction.
     - `UNSUPPORTED`: Claim attributing unverified/retracted assertions.
     - `MISATTRIBUTED`: Claim citing an astronomy paper for marine biology.
     - `EXAGGERATED`: Overclaimed 100% assertion with suggested correction.
5. **Export Audit Report**:
   - Click **[匯出 Markdown 審查結果]**, **[匯出 DOCX 報告]**, and **[匯出 PDF 報告]**.

---

### Test Case HA-03: Honest Insufficient Evidence Handling
**Goal**: Verify the system states `INSUFFICIENT_EVIDENCE` honestly rather than inventing fake citations.

1. Enter an obscure pseudo-scientific topic: `量子力學意念驅動火星探測器生長藍藻機制`.
2. Run research.
3. Verify the system flags that scholarly evidence is inadequate, blocks ungrounded draft generation, and suggests refining keywords.

---

### Test Case HA-04: Provider Resilience and Graceful Fallback
**Goal**: Verify system behavior when a provider returns HTTP 429 rate limit.

1. Trigger research during OpenAlex/Semantic Scholar rate-limiting.
2. Confirm the UI logs a polite warning indicating automatic cascading to alternative providers (Crossref, institutional sources).
3. Confirm research proceeds without unhandled exceptions.

---

### Test Case HA-05: Malformed File and Attack Defense
**Goal**: Verify security and input validation.

1. Upload empty text or a corrupted ZIP file renamed to `.docx`.
2. Verify graceful rejection with `PARSE_DEGRADED` or `EMPTY_DOCUMENT` alert.
3. Confirm system does not crash or expose raw filesystem paths.

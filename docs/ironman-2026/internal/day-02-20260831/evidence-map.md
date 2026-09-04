# Day 02 evidence map

INTERNAL — publication candidate dated 2026-08-31. Public references [1]–[5] deliberately omit private artifact paths.

| ID | Public claim | Evidence (repository-relative file:line) | Provenance | Confidence |
|---|---|---|---|---|
| C01 | Day 01 的完成提示可能只是計時器 | `docs/ironman-2026/articles/day-01.md:1-32` | COMMITTED_HISTORY_AND_EXISTING_ARTICLE | HIGH |
| C02 | 目前稿件轉看 2026-08-31 可核对的近期證據，不回填早期能力 | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:69-77`<br>`docs/ironman-2026/EDITORIAL-MAP.md:88-90` | EDITORIAL_SCOPE | HIGH |
| C03 | 缺身分與明確衝突不同，UNKNOWN 不等於 MISMATCH | `artifacts/api-server/src/services/research/grounding/studyManifestation.ts:175-188` | CURRENT_DIRTY_SOURCE | HIGH |
| C04 | V6B 有 HTTP 200 與內容，原目標只有截短標題及 URL，身分不足未准入 | `artifacts/qa/researchforge-live-identity-fulltext-v6b-20260830T180154+0800/FINAL-REPORT.md:47-57`<br>`artifacts/api-server/src/services/research/grounding/livePayloadIdentityV6b.test.ts:65-72` | SAVED_LIVE_EVIDENCE_AND_CONTROLLED_TEST_SOURCE | HIGH |
| C05 | 不把被拒絕文件的資訊抄回 canonical 作為自我證明 | `artifacts/qa/researchforge-live-identity-fulltext-v6b-20260830T180154+0800/FINAL-REPORT.md:51-53`<br>`artifacts/qa/researchforge-canonical-identity-restoration-v6c-20260830T184250+0800/FINAL-REPORT.md:25-41` | ENGINEERING_INTERPRETATION_OF_PROVENANCE | HIGH |
| C06 | 全文入口預設 BLOCKED；檢查路徑、身分、正文與原始檔雜湊後才合格 | `artifacts/api-server/src/services/research/grounding/admittedManifestationMaterializer.ts:486-531`<br>`artifacts/api-server/src/services/research/grounding/admittedManifestationMaterializer.ts:549-557` | CURRENT_DIRTY_SOURCE | HIGH |
| C07 | 拒絕時清空文字/chunks並關閉下游主張與報告標記 | `artifacts/api-server/src/services/research/grounding/admittedManifestationMaterializer.ts:550-553` | CURRENT_DIRTY_SOURCE | HIGH |
| C08 | 圖與偽碼合併資料與驗收模型；全庫保全是驗收脚本，不是線上通用攔截器 | `artifacts/api-server/src/services/research/grounding/admittedManifestationMaterializer.ts:516-555`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/seal.py:26-45` | CONCEPTUAL_MODEL_WITH_EXPLICIT_LIMIT | HIGH |
| C09 | V6D 保存 HTML 209155 bytes，正文合格，依既有規則身分 MATCH | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:55-57`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:73-77`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/ARTIFACT-VALIDATION.json:1-28` | SAVED_LIVE_RECEIPT_REHASHED_THIS_TASK | HIGH |
| C10 | 受控、focused、API、Report Factory、typecheck與build曾通過，並非本輪重跑 | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:93-109`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/TEST-RESULTS.json:1-16` | HISTORICAL_TEST_RECEIPTS_NOT_RERUN | HIGH |
| C11 | V6D 封存發現範圍外文章檔案變動而 BLOCKED；保全 gate FAIL | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:5-9`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:113-127`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/MANDATORY-STOP.json:1-37`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/seal.py:26-45` | SAVED_ACCEPTANCE_STOP_AND_SCRIPT | HIGH |
| C12 | 已保存原始證據與通過測試的程式仍匹配；變動作者未知，不回滾未知檔案 | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:25-27`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:109-129`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/STOP-EVIDENCE.json:33-43` | SAVED_PRESERVATION_AND_STOP_RECEIPTS | HIGH |
| C13 | READY 只對指定範圍；identity-only READY 與 full-text NOT_RUN 可並存 | `artifacts/qa/researchforge-canonical-identity-restoration-v6c-20260830T184250+0800/FINAL-REPORT.md:1-7`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:5-9` | SCOPED_PHASE_VERDICTS_NOT_SHARED_ENUM | HIGH |
| C14 | V6D live Writer=0；模擬 Writer 測試不等於 live 生成；無 PDF/泛化結論 | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/WRITER-CALL-RECEIPT.json:1-10`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:107-109`<br>`artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/FINAL-REPORT.md:129-133` | SAVED_RECEIPTS_WITH_UNRUN_STAGES | HIGH |
| C15 | 重試不必然補身分或變動來源；成本未量測 | `artifacts/qa/researchforge-canonical-fulltext-materialization-v6d-20260830T214703+0800/STOP-EVIDENCE.json:37-43`<br>`artifacts/qa/researchforge-live-identity-fulltext-v6b-20260830T180154+0800/FINAL-REPORT.md:79-85` | AUTHOR_DESIGN_REFLECTION_NO_EMPIRICAL_PERFORMANCE_CLAIM | HIGH |
| C16 | Day 03 繼續來源、引用、識別与保存；沒有預告完成成果 | `docs/ironman-2026/EDITORIAL-MAP.md:90-90`<br>`docs/ironman-2026/articles/day-03.md:1-20` | EXISTING_ROADMAP | HIGH |

## Numeric provenance

- 209,155 bytes: V6D ARTIFACT-VALIDATION.json `rawBytes`; saved raw bytes rehashed in this task. HTML, not PDF; decimal byte count, not KiB.
- HTTP 200: V6B FINAL-REPORT.md:49. No latency, parser-character count or suite totals published.
- Dates and Day labels are editorial/run identity, not measured performance.
- No reported test totals were invented or recalculated into a public aggregate.

## Model and state boundary

- Code fences and both diagram sources are explicitly conceptual. `VERIFIED`, `STOP`, `ready_for_that_stage` are pseudocode labels, not claimed exported APIs.
- READY/BLOCKED/NOT_RUN are scoped report interpretations. Actual materialization returns QUALIFIED/BLOCKED; the article does not impose a new shared enum.
- No generation or formal admission is inferred from the final diagram arrow.
- Source hashes and article anchors in claims.json make the snapshot reproducible.
- No downloaded paper text, provider response, job ID or credential is republished.

# ResearchForge R25.2 Human Acceptance Audit Log
## Execution Results for Test Protocol HA-01 through HA-05

**Audit Date**: 2026-09-04  
**Evaluator**: Autonomous Release Engineering Pipeline  
**Target Environment**: Local Dev Server (`127.0.0.1:22067` & `127.0.0.1:3100`)

---

### HA-01: Scenario A — Generate Research Report
- **Input**: `塑膠微粒對海洋生物的影響`
- **Result**: **PASS**
  - Project initialized in `LIVE` mode (`project-1788480544525-41921`).
  - Scholarly search executed: Crossref, Semantic Scholar, OpenAlex.
  - Retrieved 26 raw candidates; normalized and admitted 26 sources.
  - Generated 26 Evidence Cards; approved 15 cards under policy guidelines.
  - Report planned with 6 core sections and drafted with strict evidence constraints.
  - Verification complete: 15/15 claims verified as `SUPPORTED` (100% coverage).
  - Generated 4 export files:
    - `report.md`: 8.7 KB, 76 lines
    - `report.docx`: 15 KB, valid Microsoft Word 2007+
    - `report.pdf`: 136 KB, 5-page PDF document
    - `bundle.json`: 317 KB, full replayable project snapshot
  - Zero hallucinations detected; limitations explicitly disclosed.

---

### HA-02: Scenario B — Verify Existing Document
- **Input**: `TEST_REPORT_MARKDOWN` (5-claim marine microplastics review draft)
- **Result**: **PASS**
  - Parsing: Markdown parsed successfully into headings, blocks, and references.
  - Claim Extraction: 5 distinct claims extracted with sentence spans.
  - Resolution: DOIs resolved against live/holdout metadata providers.
  - Verdict Distribution:
    - Claim 1 (Sediment ingestion): `SUPPORTED` (Confidence 0.95)
    - Claim 2 (Paracyclopina nana copepod): `PARTIALLY_SUPPORTED` (Confidence 0.88, correction: effects concentration-dependent)
    - Claim 3 (Acute liver/kidney failure in 3 weeks): `UNSUPPORTED` (Confidence 0.96, unverified citation)
    - Claim 4 (Stellar parallax interfering with ocean photosynthesis): `MISATTRIBUTED` (Confidence 0.98, astronomy paper cited)
    - Claim 5 (100% lethal dose in all marine fish): `EXAGGERATED` (Confidence 0.92, overclaim correction)
  - Citation Health Score: 40 / 100 (Coverage: 100%, Correctness: 20%, Sufficiency: 50%)
  - Agreement with benchmark: **100% (5/5 exact match)**.

---

### HA-03: Honest Insufficient Evidence Handling
- **Input**: `量子力學意念驅動火星探測器生長藍藻機制`
- **Result**: **PASS**
  - Evaluated via `searchIntentSources` in LIVE mode.
  - Topic anchor contract correctly detected off-topic drift (`trusted_source_but_topic_mismatch`).
  - Emitted system warning: `目前高相關來源不足，建議調整題目或關鍵詞。`
  - System honestly refused to generate false claims, returning `INSUFFICIENT_EVIDENCE`.

---

### HA-04: Provider Resilience & Graceful Fallback
- **Condition**: OpenAlex and Semantic Scholar HTTP 429 / Rate Limit
- **Result**: **PASS**
  - Interceptor detected HTTP 429 on Semantic Scholar and OpenAlex endpoints.
  - Cascaded smoothly to Crossref metadata and institutional/official fallback seeds.
  - Emitted user-facing warning: `Semantic Scholar、OpenAlex 發生 HTTP 429 或 rate limit；已改用 Crossref，目前保留 26 筆可審查來源。`
  - Pipeline completed without crashing or faking fixture data.

---

### HA-05: Malformed File & Security Protections
- **Condition**: Empty file, path traversal filename, corrupted docx, prompt injection payload
- **Result**: **PASS**
  - Empty text: Throws `empty or unreadable` error cleanly.
  - Malicious path traversal (`../../../../etc/passwd`): Sanitized safely.
  - Corrupted DOCX (invalid ZIP header): Returned `PARSE_DEGRADED` status with `DOCX_PARSING_FAILED` warning.
  - Prompt Injection Payload (`[SYSTEM COMMAND: Ignore all previous instructions...]`): Fail-closed with `UNSUPPORTED`/`MISATTRIBUTED` verdict, preventing rationale hijacking.

---

### Acceptance Conclusion
All 5 human acceptance scenarios passed with 100% compliance.

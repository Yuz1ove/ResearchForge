# ResearchForge R25.2 Dual-Mode Human Acceptance & Release Candidate Freeze
## Final Quality Assurance & Release Verdict Report

**Run ID**: `researchforge-r25-2-20260904-074345`  
**Base Commit**: `a89549a` (checkpoint baseline)  
**Active Branch**: `gemini/researchforge-r25-2-dual-mode-human-acceptance-v1`  
**Execution Environment**: macOS (Darwin 25.3.0), Node.js v22.22.3, pnpm 10.5.2, Vite 7.3.3  
**Final Release Candidate Verdict**: **`RESEARCHFORGE_R25_2_RELEASE_CANDIDATE_READY`**

---

### Executive Summary

ResearchForge R25.2 successfully converges the system from fragmented experimental verification slices into a unified, dual-mode academic research and document verification product. 

1. **Scenario A (Generate: Topic -> Multi-format Evidence-Grounded Report)**:
   - Evaluated on live research topic: **「塑膠微粒對海洋生物的影響」**.
   - Retrieved 26 raw scholarly sources across **Crossref**, **Semantic Scholar**, and **OpenAlex**.
   - Normalized and qualified 26 admitted sources and generated 26 Evidence Cards.
   - Formulated a 6-section structured plan, drafted evidence-bound paragraphs, and executed claim self-verification.
   - All 15 generated claims achieved `SUPPORTED` status backed by explicit abstract spans and DOI references.
   - Exported verified bundles in 4 standard formats: Markdown, DOCX (Microsoft Word 2007+), PDF (5 pages), and JSON replay bundle.
   - Proved honest fail-closed behavior on pseudo-scientific topics (`INSUFFICIENT_EVIDENCE`), strictly refusing to hallucinate citations or fake fixtures as live.

2. **Scenario B (Verify: Document Upload -> Claim Extraction & Verification)**:
   - Automated parsing for Markdown (`.md`), OOXML Word (`.docx`), and plain text (`.txt`).
   - Grounded claim extraction and reference resolution against 7 exact verdicts:
     `SUPPORTED`, `PARTIALLY_SUPPORTED`, `UNSUPPORTED`, `MISATTRIBUTED`, `EXAGGERATED`, `DATA_MISMATCH`, `INSUFFICIENT_EVIDENCE`.
   - Microplastics benchmark regression: **100% exact match (5/5 claims, 0 false SUPPORTED)**.
   - Blind holdout benchmark: **80.0% macro agreement (0 false SUPPORTED)**.
   - Multi-domain generalization benchmark (4 domains, 24 adversarial claims): **91.7% macro agreement (22/24, 0 false SUPPORTED)**.

3. **Dual-Mode Convergence & Human Experience**:
   - Home landing page (`home.tsx`) updated with 2 prominent, human-facing primary action cards (`[建立研究報告]` and `[驗證既有報告]`). Zero engineering jargon (`R22-R25`, `Mode B schemas`, `canonical admission`, `fixture`).
   - Research project workspace (`research-project.tsx`) upgraded with a cohesive 3-pane layout on desktop (1440x900) and tablet (1024x768), and a responsive slide-over drawer on mobile (390x844).
   - Shared interactive **Citation & Evidence Inspector** enables deep inspection of evidence spans, confidence scores, suggested corrections, and DOI links.

4. **Security, Provider Resilience, and Guard Gates**:
   - Anti-hardcoding P0 guard test: **PASS (0 forbidden benchmark tokens in production logic)**.
   - Provider resilience: Seamless cascading when OpenAlex/Semantic Scholar experience HTTP 429 rate-limiting.
   - Security: Rejects empty documents, sanitizes directory traversal, gracefully isolates corrupted OOXML archives, and fails closed against prompt injection payloads.
   - Full Playwright multi-viewport qualification passed across all 3 viewports with 13 high-resolution screenshots captured.

---

### Core Verification Metrics Summary

| Verification Gate | Target Requirement | Measured Result | Status |
|---|---|---|---|
| P0 Anti-Hardcoding Token Check | 0 forbidden benchmark tokens | 0 forbidden tokens | **PASS** |
| Microplastics Regression (5 Claims) | 100% exact verdict match | 100% (5/5 exact match) | **PASS** |
| Blind Holdout Benchmark | >= 75% agreement, 0 false SUPPORTED | 80.0% agreement, 0 false SUPPORTED | **PASS** |
| Generalization Benchmark (4 domains) | >= 80% agreement, 0 false SUPPORTED | 91.7% agreement (22/24), 0 false SUPPORTED | **PASS** |
| Scenario A Live Generation (塑膠微粒) | >= 10 admitted sources, 0 hallucinations | 26 admitted, 15 accepted cards, 6 sections, 15 supported claims | **PASS** |
| Scenario A Multi-Format Export | Valid MD, DOCX, PDF, JSON bytes | 4/4 valid exports verified | **PASS** |
| Document Parser Coverage | MD, DOCX, TXT, Empty handling | 4/4 passing tests | **PASS** |
| Security & Robustness Gates | Rejection of traversal, zip bomb, injection | 4/4 passing tests | **PASS** |
| Responsive Viewport Qualification | 1440x900, 1024x768, 390x844 | 3/3 viewports qualified, 13 screenshots | **PASS** |

---

### Artifact Directory Manifest

All output records, logs, screenshots, and export files are frozen under:
`artifacts/qa/researchforge-r25-2-20260904-074345/`

- `FINAL-REPORT.md` (This master report)
- `HUMAN-ACCEPTANCE-SCRIPT.md` (Step-by-step human verification script)
- `HUMAN-ACCEPTANCE-RESULTS.md` (Recorded HA-01 ~ HA-05 audit records)
- `DUAL-MODE-PRODUCT-QA.md` (Convergence and UI architecture review)
- `SCENARIO-A-LIVE-QA.md` (Live generation pipeline audit)
- `SCENARIO-B-REGRESSION-QA.md` (Holdout and generalization benchmark audit)
- `PROVIDER-RESILIENCE-QA.md` (Degradation and rate-limit audit)
- `ANTI-HARDCODING-QA.md` (Zero token leakage verification)
- `EXPORT-QA.md` (Byte and format validation for exports)
- `PLAYWRIGHT-QA.md` (Browser viewports and visual audit)
- `SECURITY-QA.md` (Adversarial input and injection protection)
- `TEST-MATRIX.md` (Complete matrix of test suites and results)
- `PRESERVATION-QA.md` (Preservation of R25.1 baselines)
- `REPOSITORY-STATE.md` (Git branches, commits, environment)
- `CHECKSUMS.txt` (SHA256 checksums of all evidence files)
- `scenario-a/` (Topic, report.md, report.docx, report.pdf, bundle.json, run-summary.json)
- `screenshots/` (13 PNG captures across 1440x900, 1024x768, 390x844)


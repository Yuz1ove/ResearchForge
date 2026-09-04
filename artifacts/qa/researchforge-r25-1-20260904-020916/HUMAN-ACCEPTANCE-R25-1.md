# ResearchForge R25.1 — Human Acceptance Candidate Verification Report

## 1. Executive Summary & Gate Verdict
- **Candidate Identifier**: `researchforge-r25-1-human-acceptance-v1`
- **Session Focus**: RESEARCHFORGE R25.1 — GENERALIZED EXISTING REPORT VERIFICATION
- **Overall Final Verdict**: **HUMAN ACCEPTANCE READY (CONDITIONAL GREEN)**
- **Audit Date**: 2026-09-04
- **Git HEAD**: `a89549a` (with generalized Mode B engine and UI upgrades)
- **Model Engine**: School LLM `azure/gpt-5.6-luna`

---

## 2. Core Gates Verification Status

| Gate | Description | Threshold | Measured Result | Verdict |
|---|---|---|---|---|
| **P0 Anti-Hardcoding** | Zero benchmark-specific tokens in production source files | 0 tokens | **0 tokens** | **PASS** |
| **Multi-Format Ingestion** | Ingest Markdown, OOXML DOCX via JSZip, PDF via Python worker | 3 formats + empty doc rejection | 4/4 passing unit tests | **PASS** |
| **Microplastics Regression** | Original 5-claim benchmark maintains exact verdicts | 5/5 exact match | **5/5 exact match** | **PASS** |
| **Flawed Report Health Score** | Flawed benchmark report must score < 60 | Health Score < 60 | **Score: 52 / 100** | **PASS** |
| **Blind Holdout Benchmark** | 10 claims across 4 unseen fields (Quantum, Battery, Neuro, Linguistics) | Agreement >= 75%, False SUPPORTED = 0 | **80.0% Agreement, 0 False SUPPORTED** | **PASS** |
| **Generalization Benchmark** | 24 claims across 4 domains with adversarial variants | Agreement >= 85%, False SUPPORTED = 0 | **91.7% Agreement (22/24), 0 False SUPPORTED** | **PASS** |
| **Mode B HTTP Live Server** | Scenario B verification through live HTTP server on port 3100 | HTTP 200, 5 claims, exports | **HTTP 200, All 5 conditions passed** | **PASS** |
| **Playwright UI Multi-Viewport** | Full UI testing across Desktop (1440x900), Tablet (1024x768), Mobile (390x844) | All 3 viewports pass with 5 claims & export buttons | **All 3 viewports PASSED** | **PASS** |
| **Real File Input Flow** | File drag-and-drop / file picker input in UI parses real files | Status BADGE READY, verified claims rendered | **PASSED (test-uploaded-report.md)** | **PASS** |
| **Typecheck Cleanliness** | `pnpm run typecheck` across all 9 workspaces | 0 type errors | **0 type errors (Exit 0)** | **PASS** |
| **Production Build Cleanliness** | Vite production bundle and api-server esbuild bundle | Clean build | **Both build in < 4s** | **PASS** |

---

## 3. Four Executive Review Questions

### Q1: P0 Hardcoding Elimination Proof
- **Verification**: `artifacts/api-server/src/services/research/existing-report-verification.guard.test.ts` scans all production source files for forbidden tokens (`Paracyclopina nana`, `10.1038/srep41323`, `Zhihao Yuan`, `Enda Cummins`, `10.1016/j.scitotenv.2022.153730`, `Stellar Parallax`, `10.1146/annurev-astro-081817-051833`).
- **Result**: Exactly **0 forbidden tokens** found. All claim extraction is completely syntactic (sentence boundaries, numeric assertions, citation markers), citation resolution queries live OpenAlex and Crossref APIs with fallback cascades, and claim verification uses School LLM `azure/gpt-5.6-luna`.

### Q2: Generalization & Blind Holdout Qualification Results
- **Generalization Benchmark (24 claims, 4 domains)**:
  - Environmental Science, CS/AI, Cognitive Psychology, Gravitational Waves/Physics.
  - Overall Macro Agreement: **91.7% (22/24)** (Exceeds >= 85% requirement).
  - False Positives for SUPPORTED: **0 (Zero)** (Strictly meets 0 tolerance).
- **Blind Holdout Benchmark (10 claims, 4 unseen fields)**:
  - Quantum Computing (`doi:10.1038/s41586-019-1666-5`), Solid-State Battery Materials (`doi:10.1016/j.ensm.2019.11.018`), Cortical Organoids (`doi:10.1038/s41593-019-0477-4`), Historical Linguistics (`doi:10.1146/annurev-linguist-030514-124812`).
  - Macro Agreement: **80.0% (8/10)**.
  - False Positives for SUPPORTED: **0 (Zero)**.

### Q3: Frontend File Input & Multi-Viewport Verification
- Real `<input type="file" accept=".pdf,.docx,.md,.txt">` and dropzone implemented with status badges (`PARSING`, `READY`, `ERROR`, `OCR_REQUIRED`).
- Playwright E2E browser qualification verified:
  - `desktop-1440` (1440x900): PASSED
  - `tablet-1024` (1024x768): PASSED
  - `mobile-390` (390x844): PASSED
  - File upload interactive flow verified with `test-uploaded-report.md`.
  - Screenshots recorded in `artifacts/qa/researchforge-r25-1-20260904-020916/screenshots/`.

### Q4: Scenario A Preservation Status
- Scenario A source code, query planners, and canonical admissions remain **100% pristine and unmodified**.
- Zero breaking changes to existing pipelines.
- Live OpenAlex anonymous IP credit exhaustion documented (HTTP 429 reset period ~5h without API key); Crossref and School LLM remain 100% operational.

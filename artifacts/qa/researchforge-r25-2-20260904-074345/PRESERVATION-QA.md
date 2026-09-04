# ResearchForge R25.2 Baseline Preservation QA
## Non-Regression & Backward Compatibility Audit

### 1. Baseline Preservation Scope
R25.2 must preserve all functional milestones established in R25.1 and earlier releases without breaking existing API routes, schemas, or test coverage.

### 2. Verified Preservation Invariants
1. **Mode B Verifier Schema (`@workspace/api-zod/research-product-workflow`)**:
   - `ModeBClaimVerdict`: 7 exact allowed enum values preserved.
   - `ModeBClaimAssessmentSchema`: all fields (`id`, `claimText`, `sectionTitle`, `verdict`, `confidence`, `rationale`, `evidenceFound`, `suggestedCorrection`, `blockId`) preserved.
   - `ModeBVerificationSummarySchema`: overall metrics breakdown preserved.
2. **API Route Endpoints**:
   - `POST /api/research/verify-existing-report`: Preserved.
   - `POST /api/research/parse-document`: Preserved.
   - `POST /api/research-product/projects`: Preserved.
   - `POST /api/research-product/projects/:id/research-runs`: Preserved.
   - `POST /api/research-product/projects/:id/export`: Preserved.
3. **Core Test Suites**:
   - All R25.1 test files execute and pass without regressions.
   - Zero modifications to golden holdout ground truths.
   - All historical acceptance cases (Cases A-J) pass.

### 3. Conclusion
The convergence to dual-mode architecture was achieved purely additively, with 100% preservation of all prior baseline contracts.

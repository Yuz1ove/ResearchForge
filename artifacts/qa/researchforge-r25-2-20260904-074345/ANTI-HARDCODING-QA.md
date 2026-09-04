# ResearchForge R25.2 Anti-Hardcoding QA
## P0 Zero Benchmark Token Leakage & Overfitting Guard Audit

### 1. Guard Objective
To prevent benchmark overfitting and ensure generalizable reasoning, production verification services must contain **zero** hardcoded keywords, author names, DOIs, or titles from benchmark test cases.

### 2. Guard Test Execution
- **Test File**: `artifacts/api-server/src/services/research/existing-report-verification.guard.test.ts`
- **Inspected Production Files**:
  - `artifacts/api-server/src/services/research/existing-report-verification.ts`
  - `artifacts/api-server/src/services/research/mode-b-claim-verifier.ts`
  - `artifacts/api-server/src/services/research/parsers/document-parser.ts`
  - `artifacts/api-server/src/services/research/citation-resolver.ts`
- **Forbidden Token List**:
  - Specific test authors: `Zhihao Yuan`, `Rajat Nag`, `Enda Cummins`
  - Benchmark DOIs: `10.1016/j.scitotenv.2022.153730`, `10.1038/srep41323`, `10.1146/annurev-astro-081817-051833`
  - Species tokens: `Paracyclopina nana`
  - Benchmark astronomical tokens: `Stellar Parallax`
  - Adversarial payload strings: `恆星視差`, `急性肝腎功能衰竭`, `東方景天`

### 3. Audit Results
```text
✔ Anti-Hardcoding Guard: Production verification logic contains ZERO benchmark tokens (0 forbidden tokens found)
```
- **Total forbidden tokens in production logic**: **0**.
- **Conclusion**: The claim verification logic in `mode-b-claim-verifier.ts` relies strictly on generalized semantic entailment prompts and normalized fact extractors.

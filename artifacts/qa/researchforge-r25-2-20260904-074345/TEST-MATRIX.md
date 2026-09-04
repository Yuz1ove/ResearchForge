# ResearchForge R25.2 Comprehensive Test Matrix
## Automated & Manual Verification Suite Inventory

| Test Suite / Scope | File / Location | Test Count | Pass Rate | False Positives | Status |
|---|---|---|---|---|---|
| P0 Anti-Hardcoding Guard | `src/services/research/existing-report-verification.guard.test.ts` | 1 | 100% (1/1) | 0 | **PASS** |
| Microplastics 5-Claim Regression | `src/services/research/existing-report-verification.test.ts` | 1 (5 claims) | 100% (5/5) | 0 | **PASS** |
| Blind Holdout Benchmark | `src/services/research/blind-holdout-benchmark.test.ts` | 1 (10 claims) | 80.0% (8/10) | 0 | **PASS** |
| Generalization Benchmark | `src/services/research/generalization-benchmark.test.ts` | 1 (24 claims) | 91.7% (22/24) | 0 | **PASS** |
| Document Parser Formats | `src/services/research/parsers/document-parser.test.ts` | 3 | 100% (3/3) | 0 | **PASS** |
| Input Security & Defense | `src/services/research/existing-report-security.test.ts` | 4 | 100% (4/4) | 0 | **PASS** |
| Product Workflow Cases A-J | `src/services/research/product-workflow.test.ts` | 17 | 100% (17/17) | 0 | **PASS** |
| Source Retrieval & Provider Cooldown | `src/services/source-retrieval.test.ts` | 22 | 100% (22/22) | 0 | **PASS** |
| Topic Anchor Contract Preservation | `src/services/topic-anchor-contract.test.ts` | 8 | 100% (8/8) | 0 | **PASS** |
| Scenario A LIVE Research Run | `src/cli/run-scenario-a-live.ts` | 1 (15 claims) | 100% (15/15) | 0 | **PASS** |
| Playwright Multi-Viewport Browser | `src/cli/run-qualification-screenshots.ts` | 3 viewports | 100% (3/3) | 0 | **PASS** |
| Human Acceptance Cases HA-01~05 | `HUMAN-ACCEPTANCE-RESULTS.md` | 5 | 100% (5/5) | 0 | **PASS** |
| TypeScript Workspace Typecheck | `pnpm run typecheck` | 4 packages | 100% (0 errors) | 0 | **PASS** |
| Production Bundle Build | `pnpm run build` | 8 packages | 100% (0 errors) | 0 | **PASS** |

**Total Assessed Claims**: 54 claims across 5 distinct academic domains  
**Overall False Positive `SUPPORTED` Rate**: **0.0%**

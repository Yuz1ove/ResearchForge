# ResearchForge repository historical reconnaissance

> Backstage only. This document is not a public iThome article.

Recon date: 2026-08-29 (Asia/Taipei)

## Repository identity and evidence boundary

- Repository: `/Users/Yuz1ove/Documents/報告工廠/Report-Builder-AI`
- Remote: `https://github.com/Yuz1ove/ResearchForge.git`
- Branch: `codex/paper-search-performance-v1-20260716`
- HEAD: `a89549a6e26a7ac3ae44ad52b5588101baf28b95`
- Git history: 97 commits, 2026-05-28 through 2026-08-13
- Branch refs observed: 30
- Worktree at recon: staged 0; many tracked modifications and untracked QA/source artifacts

The evidence boundary is important. Git proves the committed history through 2026-08-13. Later ResearchForge phases are evidenced by current source files and dated QA artifacts in the dirty worktree. Those phases must be described as later verified work sessions, not silently rewritten as committed history. No reset, clean, stash, restore, commit, push, merge, PR, or deployment was performed during this editorial reconnaissance.

## Development shape

The repository began as a React report-generator interface, then acquired a backend, shared contracts, academic-source adapters, evidence objects, durable research jobs, formal report composition, publication exporters, and finally fail-closed evidence admission and acquisition controls. The old `report-factory` package name is historical residue, not the current product name.

The most-changed tracked file is `artifacts/report-factory/src/pages/generator.tsx` (44 commits). It is also the strongest bug magnet (10 fix-associated commits). Other hotspot/bug-magnet intersections include:

- `artifacts/api-server/src/services/search-intent-planner.ts`
- `artifacts/report-factory/src/lib/generateReport.ts`
- `artifacts/report-factory/src/lib/sourceRecords.ts`
- `artifacts/api-server/src/services/source-retrieval.ts`
- `lib/api-zod/src/index.ts`
- `lib/api-spec/openapi.yaml`

This intersection matches the product story: most risk accumulated where topic intent, provider results, shared schemas, user review state, and generated prose met.

## Contributors and momentum

The no-merge shortlog identifies two contributors: Yuz1ove (79 commits) and Replit Agent (12 commits). Both appear within the repository's three-month lifetime, but the knowledge and product-decision bus factor is still concentrated in the project owner. Commit volume peaked in June (73), declined in July (22), and shows one large committed integration in August. That last number does not mean development stopped; dated, uncommitted QA evidence shows intensive work after the 8/13 integration.

No commit message contains `revert`, `hotfix`, `emergency`, or `rollback`. That does not imply a calm deployment history: a dense 2026-07-11 sequence of `fix:` commits repeatedly repaired Vercel function entrypoints, build output, ESM loading, frontend routing, and durable job behavior. Public narration should describe the observed sequence rather than infer emotions or incidents that are not recorded.

## High-confidence historical pivots

1. **Generator first.** The 2026-06-10 application emphasized modes, structures, styles, and exports.
2. **Citation foundation.** Commit `f0df507` introduced `/search-sources`, source retrieval, normalized records, review state, and shared API contracts.
3. **Search became a system.** Commit `16b0807` added keyword expansion, provider configuration, search preflight, and tests.
4. **Generation became evidence-gated.** The 6/17 commit cluster introduced relevance, authority, accepted-source synthesis, and generation readiness.
5. **Topic intent became explicit.** June and July work added topic understanding, bilingual query seeds, facets, exclusion terms, and search budgets.
6. **Runtime became durable.** Commit `3922d4a` separated browser waiting from durable grounding jobs and added PostgreSQL-backed deployment contracts.
7. **Report intelligence became a vertical slice.** Commit `a89549a` added canonical report planning, atomic facts, claim graphs, Writer checks, publication formats, and a large QA corpus.
8. **Green tests stopped being treated as content proof.** Later acceptance rounds repeatedly passed regression while blocking Writer or export on insufficient evidence.
9. **Generalization exposed the true weak layers.** New-topic cohorts failed at direct-study discovery, full-text acquisition, structured facts, or formal synthesis before prose quality could matter.
10. **Authority moved upstream.** `canonical-study-admission.ts` became the single owner of evidence eligibility; later V5 added a single execution-budget ledger checked before external side effects.

## Reading order for editorial work

For early history, start with `docs/learning-log-2026-06-10-to-2026-06-17.md`, then corroborate claims with git diffs. For architecture, use the 2026-06-18 audit and current source. For 8/13 onward, read each dated QA directory's machine-readable artifacts before its `FINAL-REPORT.md`; the report is a summary, not the sole evidence. For V4/V5, honor the post-closure override: the original V4 PARTIAL projection was superseded by a canonical-binding audit that made the defensible verdict BLOCKED.

## Editorial risks

- Do not imply that the current architecture existed in June.
- Do not call metadata, abstract text, or HTTP 200 a full-text artifact.
- Do not equate a passing Writer request with a publishable report.
- Do not use fixture/replay results as live generalization evidence.
- Do not publish internal IDs, absolute paths, credentials, or raw provider payloads.
- Do not convert `UNKNOWN` into zero or `NOT_REPORTED`.
- Do not call V5 content-ready: only its control-plane gates were READY; current qualifying-full-text coverage was 0/10.

## V1 reconstruction update

The preflight was repeated on 2026-08-30 before editorial writes. The raw author count is 85 commits by Yuz1ove and 12 by Replit Agent; the no-merge count used for bus-factor reporting is 79 and 12. The all-time small-repository recon produced no qualifying emergency/revert commit and no valid low-active-contributor ratio because both contributors appear in the three-month window.

The post-HEAD evidence endpoint is 2026-08-29. It includes the V6A controlled materialization matrix and one unavailable live canary, but no committed or deployed V6A implementation. The official event page could not be fetched in this session (HTTP 403), so current iThome category, schedule and registration details remain `UNKNOWN` and are intentionally absent from the frozen day facts.

The source ledger and day packets use four separate historical classes: `COMMITTED_GIT`, `BRANCH_LOCAL_GIT`, `DATED_QA_WORKTREE`, and `CURRENT_WORKTREE_SOURCE`. A later class cannot establish an earlier implementation date.

# ResearchForge Architecture Audit

Date: 2026-06-18

## Current Architecture

- Frontend app: `artifacts/report-factory`
- Backend app: `artifacts/api-server`
- Shared contracts: `lib/api-zod`, `lib/api-spec`, `lib/api-client-react`, `lib/db`
- Main user flow currently lives in `artifacts/report-factory/src/pages/generator.tsx`

The app is already a source-first research workspace, not a generic chat app. The current pipeline is:

`topic -> preflight/search planning -> /api/search-sources -> source review -> accepted sources -> evidence cards -> report draft -> report preview -> export`

## Key Files

### Search sources API

- `artifacts/api-server/src/routes/search-sources.ts`
- `artifacts/api-server/src/services/search-intent-planner.ts`
- `artifacts/api-server/src/services/source-retrieval.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-spec/openapi.yaml`

### Source card UI / source management

- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/report-factory/src/lib/sourceRecords.ts`
- `artifacts/report-factory/src/lib/sourceSummaries.ts`
- `artifacts/report-factory/src/lib/sourceAuthority.ts`
- `artifacts/report-factory/src/lib/sourceRelevance.ts`

### Accepted sources state / workspace

- `artifacts/report-factory/src/lib/reportWorkspace.ts`
- `artifacts/report-factory/src/lib/sourceDigest.ts`
- `artifacts/report-factory/src/lib/projectState.ts`

### Evidence card generation / display

- `artifacts/report-factory/src/lib/evidenceCards.ts`
- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/report-factory/src/lib/reportDraft.ts`

### Report generator / synthesis

- `artifacts/report-factory/src/lib/generateReport.ts`
- `artifacts/report-factory/src/lib/reportOutline.ts`
- `artifacts/report-factory/src/lib/reportDraft.ts`
- `artifacts/report-factory/src/lib/acceptedSourceSynthesis.ts`

### Orchestrator / workflow

- `artifacts/report-factory/src/lib/reportWorkspace.ts`
- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/report-factory/src/pages/report-preview.tsx`

### DOCX / export

- `artifacts/report-factory/src/lib/exportReport.ts`
- `artifacts/report-factory/src/pages/report-preview.tsx`

### Shared types / schemas

- `lib/api-zod/src/source-record.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/*`
- `artifacts/report-factory/src/lib/sourceRecords.ts`
- `artifacts/report-factory/src/lib/generateReport.ts`

## Current Data Flow

1. User enters topic and report settings in `generator.tsx`.
2. The frontend runs search preflight and calls `searchSources(...)`.
3. Search results are normalized with `normalizeSourceForReview`, `dedupeSourceRecords`, `applySourceRelevanceAssessments`, and `applySourceAuthorityAndLanguage`.
4. Source review state is stored in component state inside `generator.tsx`.
5. Accepted sources are derived with `acceptedSourceRecords(...)`.
6. Evidence cards are derived from accepted sources via `buildEvidenceCards(...)`.
7. Report readiness is computed by `generationReadiness(...)`.
8. A report workspace is created with `startReportWorkspaceNavigation(...)` and later rendered in `report-preview.tsx`.
9. Export uses `exportReport.ts` to produce TXT / Markdown / JSON / prompt package / DOCX.

## UI State Snapshot

- The generator is already split into steps: topic, search, manage, generate.
- Source cards are collapsible, but the right-side workflow still feels long and dense.
- Accepted sources are visible, but evidence cards are also exposed in debug mode and are too close to the main workflow.
- The generator still mixes source review, evidence display, readiness checks, and report generation in one long page.
- The report preview page is the cleanest place for draft/export output.

## Safe-to-Modify Files

- `artifacts/report-factory/src/lib/evidenceCards.ts`
- `artifacts/report-factory/src/lib/sourceDigest.ts`
- `artifacts/report-factory/src/lib/sourceSummaries.ts`
- `artifacts/report-factory/src/lib/sourceAuthority.ts`
- `artifacts/report-factory/src/lib/sourceRelevance.ts`
- `artifacts/report-factory/src/lib/reportDraft.ts`
- `artifacts/report-factory/src/lib/reportWorkspace.ts`
- `artifacts/report-factory/src/lib/exportReport.ts`
- `artifacts/report-factory/src/pages/report-preview.tsx`
- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/api-server/src/routes/search-sources.ts`

## Higher-Risk Files

- `artifacts/report-factory/src/lib/generateReport.ts`
- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/report-factory/src/pages/report-preview.tsx`
- `lib/api-zod/src/source-record.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-spec/openapi.yaml`

These files shape the app contract or the visible workflow, so changes here should stay small and well tested.

## Integration Strategy

1. Add a lightweight research workflow schema layer with Zod.
2. Keep accepted sources as the truth for report generation.
3. Generate evidence cards deterministically from accepted sources and keep them out of the normal main-flow UI.
4. Add a rule-based quality judge instead of a new LLM dependency.
5. Ground report sections in evidence-card IDs and accepted-source IDs.
6. Preserve DOCX export first, then extend Markdown/JSON/report preview around the section model.
7. Keep the visible UI focused on topic input, source review, evidence summary, report generation, and export.

## Notes

- Existing source-search and export behavior should be preserved.
- No new database or account system is required for this phase.
- Full-text parsing, vector search, persistent memory, and SSE can stay future work.

# AI Assistance Disclosure

ResearchForge used AI-based software as a development aid, as permitted for the CS50x Final Project. This document supplements the short comments placed in the major assisted source files.

## Tools used

- Replit Agent was used during earlier iterations for selected scaffolding, implementation drafts, refactoring, and tests.
- OpenAI ChatGPT and Codex were used for selected debugging, refactoring, test and type-check verification, documentation, and preparation of the final CS50 source package.

## Areas that received assistance

AI assistance was used in portions of the following areas. This list describes the scope of assistance; it does not mean that every line in these files was AI-generated.

- The multi-stage frontend workflow and report preview in `artifacts/report-factory/src/pages/`.
- Frontend source, evidence, workspace, and export utilities in `artifacts/report-factory/src/lib/`.
- Topic-aware query planning, provider retrieval, evidence grounding, and report writing in `artifacts/api-server/src/services/`.
- Automated tests used to check topic handling, source quality, evidence binding, citations, fallback behavior, and report output.
- README, architecture explanations, and submission preparation.

## Human direction and verification

The project owner supplied the product goal, official name, feature priorities, no-login scope, workflow direction, and final design decisions. AI responses were used as implementation suggestions rather than accepted as authoritative output.

Before packaging, the submitted working copy was checked with strict TypeScript type checking, 238 frontend tests, 341 backend tests, and a production build. Source-provider results and optional model output remain subject to the evidence and safety checks implemented in the application.

## Comment convention

Major assisted modules include a comment beginning with `AI assistance disclosure:` and refer back to this document. Generated files and routine UI primitives are not individually annotated because editing them would be misleading or would be overwritten by code generation. Historical handoff documents are retained as development records and may contain earlier product names.

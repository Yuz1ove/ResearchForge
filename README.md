# ResearchForge

#### Video Demo: https://youtu.be/sjvQUt-wrgM

#### Description:

ResearchForge is a full-stack research workspace that helps students turn an initial topic into a source-backed, reviewable report. Instead of beginning with a blank editor or immediately asking an AI model to write an answer, the application first clarifies the topic, plans search directions, retrieves academic sources, evaluates their relevance, exposes evidence to the user, and only then prepares a structured report draft. The central idea is that a report should be traceable to accepted evidence rather than generated from an unsupported prompt.

The application is designed primarily for Traditional Chinese users. Its source engine can construct bilingual queries and currently retrieves metadata from OpenAlex, Crossref, and Semantic Scholar. Search results are normalized into a shared source model so that records from different providers can be deduplicated and compared consistently. ResearchForge then gives each source a role, relevance assessment, authority signal, evidence summary, and review state. The user decides which sources to accept. Report readiness, section planning, claims, citations, and export are all derived from that reviewed set.

No registration or login is required. This was an intentional scope decision: the Final Project demonstrates a single-user research workflow, so effort was concentrated on source quality, evidence traceability, report generation, and error handling instead of account management. Temporary handoffs use browser session storage, while report workspaces use local storage. A database is optional for durable grounding jobs in a deployed environment, but the main demonstration can be understood without creating an account.

## Problem and goals

Generic writing tools often produce polished text before the user has inspected the evidence. That makes it difficult to know which claims are supported, which sources are merely related, and which details still need verification. ResearchForge addresses this with a staged workflow:

```text
topic or research question
→ topic clarification and bilingual search planning
→ academic provider retrieval
→ normalization, deduplication, and relevance filtering
→ source and evidence cards
→ explicit accept/reject review
→ report-readiness checks
→ evidence-bound outline and section drafting
→ citation and safety checks
→ preview, editing, and export
```

The project has four main goals:

1. Keep the original research topic visible throughout the workflow so that expanded queries do not drift away from the user's intent.
2. Make source selection inspectable instead of silently handing every result to a text generator.
3. Prevent unsupported claims and fabricated citations from entering the final draft.
4. Give the user a practical output that can be edited and exported as DOCX, Markdown, plain text, JSON, a research blueprint, or through the browser's print-to-PDF flow.

## How to use ResearchForge

The simplest starting point is `/generator`. The user enters a topic, and ResearchForge returns an initial paper set while it continues enriching results with longer summaries. The user can inspect titles, authors, years, providers, abstracts, and Traditional Chinese summaries, then continue into the deeper workspace.

The advanced flow is available at `/workspace`. It guides the user through topic clarification, research-direction selection, source search, source review, evidence sufficiency, and report generation. The application does not treat a successful API response as proof that a source is useful. Weak, off-topic, duplicate, metadata-only, or inaccessible sources are marked accordingly. The report button and status messages reflect whether the accepted evidence is sufficient for the requested report mode.

Generated reports open at `/reports/:reportId` (with `/preview/:reportId` kept as a compatible route). The preview screen preserves the relationship between report sections, evidence cards, accepted sources, and citation markers. The user can adjust text and presentation settings before exporting.

## Architecture and design choices

ResearchForge is a pnpm monorepo written mainly in TypeScript. The frontend uses React, Vite, Tailwind CSS, Radix UI, TanStack Query, Zod, and wouter. The backend uses Node.js, Express, Zod-based contracts, provider adapters, and optional PostgreSQL support through Drizzle ORM. Keeping frontend and backend in one workspace makes the shared API contracts type-safe while allowing each application to build and deploy independently.

The provider layer intentionally normalizes OpenAlex, Crossref, and Semantic Scholar responses into one `SourceRecord` shape. This adds code compared with rendering each provider response directly, but it avoids provider-specific logic spreading through the interface. It also makes deduplication, evidence evaluation, testing, and future provider additions more predictable.

Report generation is separated from source retrieval. The server first creates a topic-anchored search plan, normalizes results, extracts usable evidence, and runs sufficiency guards. The report writer then receives only the accepted source and evidence structures. This separation was chosen because an attractive paragraph is not useful if its claims cannot be traced back to a source.

The project also contains conservative fallbacks. External APIs can time out, rate-limit requests, omit abstracts, or block full-text extraction. ResearchForge records these degraded states and can prepare a limited evidence-bound draft where appropriate, but it avoids pretending that missing evidence is complete. Provider credentials and an OpenAI-compatible language model are optional configuration; the code still has deterministic planning, validation, and test paths.

## Repository and file guide

Some internal folders still use earlier names such as `report-factory` or `Report Factory AI`. The product was renamed several times during development. `ResearchForge` is the official project name; the older path names remain only to preserve package names, imports, deployment configuration, and iteration history.

### Root files and folders

- `README.md` is this CS50 project description, setup guide, design explanation, and file map.
- `AI_ASSISTANCE.md` documents where AI tools assisted development and how the submitted version was verified. Matching comments appear in the main assisted modules.
- `package.json` defines root type-check and build commands for the monorepo.
- `pnpm-workspace.yaml` lists the workspace packages, and `pnpm-lock.yaml` pins the dependency graph.
- `tsconfig.json` defines TypeScript project references; `tsconfig.base.json` contains strict compiler rules shared by all packages.
- `.env.example` documents optional environment configuration without including private keys. Real `.env` files must not be submitted.
- `vercel.json`, `.vercelignore`, `.replit`, and `.replitignore` contain deployment or development-environment configuration.
- `artifacts/` contains the applications that users and API clients run.
- `lib/` contains shared API schemas, generated client helpers, and optional database code.
- `docs/ResearchForge/` contains architecture notes, workflow documents, quality rules, handoffs, progress records, experiments, and archived design material.
- `scripts/` contains small workspace maintenance scripts.
- `python/` contains optional document-processing workers used by the source-extraction experiments.
- `tools/research/` contains developer-side research and diagnostic helpers.
- `attached_assets/` contains imported requirements and iteration notes used during development; several filenames retain earlier working names and are kept as historical inputs.

Generated or machine-local folders such as `node_modules/`, `dist/`, `output/`, `.local/`, `.tmp/`, test results, and secret environment files are not part of the source submission.

### Frontend: `artifacts/report-factory/`

- `src/main.tsx` initializes the React application and configures the API base URL.
- `src/App.tsx` defines the public routes and the route-transition shell.
- `src/pages/home.tsx`, `features.tsx`, and `faq.tsx` explain the product and its constraints.
- `src/pages/paper-search.tsx` implements the quick paper-search experience and transfers the selected topic into the advanced flow.
- `src/pages/generator.tsx` is the main multi-stage research workspace. It coordinates topic clarification, search requests, review state, evidence diagnostics, generation readiness, and report creation.
- `src/pages/report-preview.tsx` loads a saved report workspace, merges evidence-bound drafts, displays citations and warnings, and exposes editing and export controls.
- `src/lib/topicWorkflow.ts` validates the user's topic and produces research directions.
- `src/lib/sourceRecords.ts` defines the frontend source model, bibliography helpers, evidence status, review state, and export-readiness checks.
- `src/lib/evidenceCards.ts`, `sourceDigest.ts`, and `researchGrounding.ts` convert accepted sources into reviewable evidence structures.
- `src/lib/reportOutline.ts`, `reportDraft.ts`, `reportWorkspace.ts`, and `detailedReport.ts` build and persist the report model used by the preview screen.
- `src/lib/llmReportWriter.ts` calls the backend report-draft endpoint and handles traceable fallback behavior.
- `src/lib/exportReport.ts` produces plain text, Markdown, JSON, research blueprints, prompt packages, and DOCX output.
- `src/components/` contains reusable branding, layout, and accessible UI components.
- `src/lib/*.test.ts` contains focused tests for topic handling, source quality, evidence binding, report readiness, citations, output text, and storage handoffs.

### Prototype: `artifacts/mockup-sandbox/`

- This small Vite application preserves an early interface mockup used to compare layout ideas before the main workflow stabilized. It is not the production ResearchForge interface, but it documents the visual iteration process and remains a separate workspace package so it cannot affect the main application routes.

### Backend: `artifacts/api-server/`

- `src/index.ts` validates runtime configuration and starts the HTTP server.
- `src/app.ts` configures logging, CORS, request parsing, health information, routes, and 404 handling.
- `src/routes/` contains endpoints for topic expansion, keyword planning, source search, paper search, grounding jobs, LLM status, and report drafts.
- `src/services/source-provider-config.ts` defines the implemented academic providers and their timeouts, result limits, and optional credentials.
- `src/services/source-retrieval.ts` calls providers, retries selected failures, records provider health, and returns normalized raw candidates.
- `src/services/search-intent-planner.ts` is the main topic-aware planning pipeline. It anchors the topic, creates bilingual queries, coordinates providers, filters drift, scores candidates, and prepares evidence-card input.
- `src/services/source-summarizer.ts` creates source-linked summaries while distinguishing abstract, snippet, full-text, and metadata-only evidence.
- `src/services/research/grounding/` contains content extraction, claim extraction, evidence guards, job storage, and the end-to-end grounding pipeline.
- `src/services/report-writer.ts` creates report sections from accepted evidence and validates citation markers and prose structure.
- `src/services/llm-adapter.ts` and `llm-service.ts` isolate optional OpenAI-compatible model calls from the deterministic workflow.
- `src/config/` handles safe provider and CORS configuration.
- `src/**/*.test.ts` exercises routes, provider fallbacks, query planning, source normalization, evidence guards, grounding jobs, and report writing.
- `u-claw/` is a reserved integration directory and currently contains no submitted implementation files.

### Shared packages: `lib/`

- `api-zod/` is the shared source of truth for request, response, source, evidence, topic, grounding, and report-readiness schemas.
- `api-client-react/` exposes frontend API helpers and TanStack Query integration.
- `api-spec/` contains API client generation configuration.
- `db/` contains optional PostgreSQL and Drizzle setup for deployments that require durable grounding jobs. Authentication is not implemented.

## Development process and challenges

ResearchForge began under earlier working names, including AI Report Builder and Report Factory AI. Early versions focused on report structure and export. Later iterations moved the difficult work earlier in the pipeline: understanding the topic, preserving semantic anchors during query expansion, comparing provider results, extracting evidence, and deciding when a report is safe to generate. The legacy folder name records that history, while the interface and submission use the ResearchForge name.

The most difficult engineering problem was preventing topic drift. A short query can produce too few results, while an aggressive expansion can return impressive but irrelevant papers. The solution combines topic anchors, bilingual query groups, provider-specific retrieval, normalization, semantic and lexical relevance checks, source-role classification, and explicit review states. Another challenge was external-provider unreliability. Timeouts, rate limits, duplicate records, inaccessible full text, and incomplete metadata are represented as diagnostic states instead of being silently ignored.

I also debated whether to store everything in a database. For this Final Project, browser storage makes the no-login demonstration easier and keeps report preview responsive. Database support remains available only where durable server-side grounding jobs are required. This keeps the core workflow testable locally without turning account and deployment setup into a prerequisite.

## AI assistance and academic honesty

AI tools were used as development assistants during several iterations. Replit Agent and OpenAI ChatGPT/Codex helped draft or refactor selected frontend workflow code, backend research-pipeline code, tests, debugging changes, and documentation. They did not replace the project's product decisions or the evidence-quality rules. The repository marks major assisted modules with an `AI assistance disclosure` comment, and `AI_ASSISTANCE.md` gives a consolidated explanation.

The submitted version was independently checked with the repository's automated tests and strict TypeScript type checking. AI-produced suggestions were treated as drafts: integration decisions were made in the context of the existing architecture, and failing or unsupported behavior was revised or rejected. This disclosure is included to satisfy CS50's requirement that AI use be cited in code comments.

## Local setup

Requirements: Node.js, pnpm, and network access to the configured academic providers.

```bash
pnpm install --frozen-lockfile
```

Start the backend in one terminal:

```bash
PORT=3100 HOST=127.0.0.1 pnpm --filter @workspace/api-server run dev
```

Start the frontend in a second terminal:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3100 pnpm --filter @workspace/report-factory run dev
```

Open the Vite URL shown in the terminal, then visit `/generator` for quick paper search or `/workspace` for the full research workflow. Optional provider and model settings are documented in `.env.example`; never commit real API keys.

## Verification

The final working copy was verified with:

```bash
pnpm run typecheck
pnpm --filter @workspace/report-factory test
LLM_DISABLED=1 pnpm --filter @workspace/api-server test
pnpm run build
```

At README preparation time, all 238 frontend tests and all 341 backend tests pass, and strict TypeScript checking passes. The build command is also run before the clean CS50 submission package is created.

## Known limitations and future work

- Search quality still depends on provider availability and the metadata each provider exposes.
- Some publishers block full-text extraction or require login/payment, so ResearchForge may have only an abstract or metadata.
- OpenAI-compatible model enhancement requires separate credentials; deterministic fallbacks are intentionally more conservative.
- Durable multi-device report history would require deploying the database-backed job repository and designing user accounts, which are outside this Final Project's scope.
- Future work could add more specialized providers such as PubMed and Europe PMC, improve multilingual evidence extraction, and split the largest workflow modules into smaller state-machine components.

## License

MIT

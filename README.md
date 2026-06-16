# ResearchForge

ResearchForge is a literature-first report workspace for turning a rough research topic into a traceable, source-backed draft.

It is built for students and independent learners who need more than a generic writing tool: the core workflow starts with finding usable sources, filtering weak matches, reading evidence snippets, and only then moving toward a report.

## Why this project exists

Most report generators begin by writing. ResearchForge begins by checking whether the evidence is worth using.

The current development direction is simple:

```text
Research topic
→ source search
→ relevance filtering
→ evidence snippets
→ source summary
→ accepted source digest
→ structured report draft
→ export
```

## Current focus

ResearchForge is under active development. The main engineering focus is the source engine:

- topic-aware search intent planning
- relevance gates for weak or off-topic sources
- source authority and language handling
- evidence snippet extraction
- Traditional Chinese summaries for readable review
- accepted-source digest before report generation
- exportable report drafts

## Product workflow

1. Define a research topic.
2. Expand the topic into concrete research directions.
3. Search academic and institutional sources.
4. Review source cards with summaries and relevance notes.
5. Accept or reject sources.
6. Generate a structured draft only after enough usable sources are accepted.
7. Export to Word, PDF, Markdown, TXT, JSON, or a research blueprint.

## Tech stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, Radix UI
- Routing: wouter
- Data layer: TanStack Query, Zod
- Backend: Node.js API workspace
- Source providers: Crossref and Semantic Scholar integrations
- Export: DOCX, Markdown, TXT, JSON, print/PDF workflow

## Repository structure

```text
artifacts/
  api-server/        # source search and backend services
  report-factory/    # ResearchForge frontend and report workflow
lib/                 # shared workspace utilities
scripts/             # maintenance scripts
```

## Local development

Install dependencies with pnpm:

```bash
pnpm install
```

Run the API server:

```bash
PORT=3100 HOST=127.0.0.1 pnpm --filter @workspace/api-server run build
PORT=3100 HOST=127.0.0.1 pnpm --filter @workspace/api-server run start
```

Run the frontend:

```bash
pnpm --filter @workspace/report-factory run dev
```

Open the generator:

```text
http://localhost:22067/generator
```

## Quality checks

```bash
pnpm run typecheck
pnpm --filter @workspace/report-factory run test
pnpm --filter @workspace/report-factory run build
pnpm --filter @workspace/api-server run test
```

In sandboxed environments, the API server test may fail with a `listen EPERM` or `tsx IPC pipe EPERM` error. That is an environment issue, not necessarily an application failure.

## Development status

The project is currently private and experimental. The priority is correctness of the research pipeline over surface-level generation quality.

Short-term roadmap:

- improve source relevance for climate, health, media, and education topics
- prevent low-quality sources from entering the main report flow
- strengthen Traditional Chinese source summaries
- make report synthesis depend on accepted evidence rather than raw source cards
- keep the interface clean enough for students to verify sources quickly

## License

MIT

# ResearchForge

ResearchForge is a knowledge-first workspace for turning rough topics, notes, and source material into traceable reports, summaries, digests, and knowledge-base drafts.

It is built for students and independent learners who need more than a generic writing tool: the workflow starts by clarifying the topic, finding usable sources, filtering weak matches, reading evidence snippets, and only then moving toward structured content generation.

## Why this project exists

Most content generators begin by writing. ResearchForge begins by checking whether the evidence is worth using and how it should be organized for the intended output.

```text
Research topic
→ source search
→ relevance filtering
→ evidence snippets
→ source summary
→ accepted source digest
→ content structure
→ report / summary / knowledge-base draft
→ export
```

## Current focus

ResearchForge is under active development. The main engineering focus is the source engine and content workflow:

- topic-aware search intent planning
- relevance gates for weak or off-topic sources
- source authority and language handling
- evidence snippet extraction
- Traditional Chinese summaries for readable review
- accepted-source digest before report generation
- structured outputs for reports, summaries, digests, knowledge-base notes, and research blueprints
- exportable content drafts

## Product workflow

1. Define a topic, question, or source collection.
2. Expand the topic into concrete research or organization directions.
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

Core folders keep their original English names so we do not break workspace paths, imports, build scripts, or runtime assumptions.

```text
artifacts/
  api-server/        # API 服務 / source search backend
  report-factory/    # 前端介面 / report workflow
lib/                 # 共用型別、schema、workspace utilities
scripts/             # 維護與建置腳本
tools/               # 開發與研究輔助工具
python/              # Python 研究與實驗腳本
docs/ResearchForge/  # ResearchForge 文件整理區
```

中文資料夾導覽請見 [docs/ResearchForge/00_Project_Overview/ResearchForge_Folder_Guide.md](docs/ResearchForge/00_Project_Overview/ResearchForge_Folder_Guide.md)。

## Documentation index

`docs/ResearchForge/` is organized as:

- `00_Project_Overview/`
  - [ResearchForge_Architecture_Audit.md](docs/ResearchForge/00_Project_Overview/ResearchForge_Architecture_Audit.md)
  - [ResearchForge_Document_Reorganization_Report_2026-06-26.md](docs/ResearchForge/00_Project_Overview/ResearchForge_Document_Reorganization_Report_2026-06-26.md)
  - [ResearchForge_Folder_Guide.md](docs/ResearchForge/00_Project_Overview/ResearchForge_Folder_Guide.md)
  - [ResearchForge_Next_Steps.md](docs/ResearchForge/00_Project_Overview/ResearchForge_Next_Steps.md)
- `01_Main_Workflow/`
  - [ResearchForge_Research_Workflow.md](docs/ResearchForge/01_Main_Workflow/ResearchForge_Research_Workflow.md)
- `02_Source_Search/`
  - Reserved for source-search specific documentation
- `03_Evidence_Cards/`
  - Reserved for evidence-card and source-card documentation
- `04_Report_Generation/`
  - [ResearchForge_Quality_Rules.md](docs/ResearchForge/04_Report_Generation/ResearchForge_Quality_Rules.md)
- `05_UI_Branding/`
  - Reserved for UI and branding notes
- `06_Codex_Handoffs/`
  - [ResearchForge_Handoff_Main_Workflow.md](docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Handoff_Main_Workflow.md)
  - [ResearchForge_Handoff_Source_Quality.md](docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Handoff_Source_Quality.md)
  - [ResearchForge_Progress_Log.md](docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Progress_Log.md)
- `07_Experiment_Design/`
  - [ResearchForge_Open_Source_Inspirations.md](docs/ResearchForge/07_Experiment_Design/ResearchForge_Open_Source_Inspirations.md)
- `99_Archive/`
  - [ResearchForge_WIP_Data_Understanding_Flow.patch](docs/ResearchForge/99_Archive/ResearchForge_WIP_Data_Understanding_Flow.patch)

## Local development

Install dependencies with pnpm:

```bash
pnpm install
```

Run the backend API:

```bash
PORT=3100 HOST=127.0.0.1 pnpm --filter @workspace/api-server run dev
```

Run the frontend:

```bash
pnpm --filter @workspace/report-factory run dev
```

Open the paper search page:

```text
http://localhost:22067/generator
```

Enter a research keyword to see an initial eight-paper result set quickly. The
page then expands the search to as many as twelve papers and progressively
replaces source excerpts with longer, source-linked Traditional Chinese
summaries. The page uses `POST /api/paper-search` for retrieval and
`POST /api/paper-search/summaries` for four-paper summary batches.

Open the advanced report workspace:

```text
http://localhost:22067/workspace
```

## Quality checks

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

Note: the workspace does not provide a single root `pnpm dev` script, so frontend and backend are started separately during local verification.

## Development status

The project is currently private and experimental. The priority is correctness of the research pipeline and usefulness for source-backed content generation over surface-level generation quality.

Short-term roadmap:

- improve source relevance for climate, health, media, education, and general knowledge topics
- prevent low-quality sources from entering the main report flow
- strengthen Traditional Chinese source summaries
- make report synthesis depend on accepted evidence rather than raw source cards
- keep the interface clean enough for students to verify sources, claims, and content gaps quickly

## License

MIT

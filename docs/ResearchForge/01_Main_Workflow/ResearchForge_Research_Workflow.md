# Research Workflow

This repo is a source-driven research report tool. The workflow is intentionally narrow:

1. Define the topic.
2. Plan and run source search.
3. Review sources.
4. Accept or reject sources.
5. Derive evidence cards from accepted sources.
6. Draft section-based reports from evidence cards.
7. Run a deterministic quality check.
8. Export the report.

## Depth Modes

- `quick`: 3-5 sources, fast draft, lighter critique.
- `standard`: 6-10 sources, suitable default for school research.
- `deep`: 10-20 sources, stricter critique and fuller section coverage.

## Data Flow

`topic -> search results -> accepted sources -> evidence cards -> report sections -> quality report -> export`

## Core Objects

- `ResearchProject`: topic, report type, depth, status, timestamps.
- `ResearchSource`: review state, credibility, relevance, collapse state.
- `EvidenceCard`: claim, paraphrase, summary, citation text, section hints.
- `ReportSection`: section content, linked evidence cards, citations, warnings.
- `ResearchDraft`: assembled sections plus references and quality metadata.
- `QualityReport`: readiness, missing citations, unsupported claims, drift, overclaim warnings.

## UI Rules

- Sources are reviewable and collapsible.
- Accepted sources auto-collapse.
- Evidence cards should stay secondary to source review.
- The main page should show workflow state, not expose every internal derivation.

## Export Rules

- Export must preserve accepted-source grounding.
- DOCX export remains the primary preserved format.
- Markdown and JSON should carry the same report metadata when possible.


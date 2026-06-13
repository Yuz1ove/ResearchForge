# Research Writing Orchestrator V1

This module creates a deterministic research writing plan from a user topic. It does not call an LLM and does not generate the full report body.

## What It Does

- Classifies the input as `academic_research_report`, `applied_research`, or `software_project`.
- Protects normal research topics from being misclassified as software projects just because they mention terms like AI, website, data, system, or analysis.
- Detects likely research domains with simple keyword rules.
- Extracts likely independent variables, dependent variables, and context variables when the topic follows an `A 對 B 之影響` pattern.
- Produces research questions, hypotheses, section-by-section writing instructions, a source plan, a method plan, and a quality checklist.
- Marks missing evidence as `citation_needed`.

## What It Does Not Do Yet

- It does not generate a final report body.
- It does not search the web or retrieve sources.
- It does not create real citations, statistics, author names, article titles, DOI values, or URLs.
- It does not validate APA formatting beyond preserving the requested citation style in the plan.
- It does not decide final methodology quality; future Writer, Source, Citation, and Export modules should verify and enrich the plan.

## Main Import

```ts
import { runResearchWritingOrchestrator } from "./researchWritingOrchestrator.ts";

const plan = runResearchWritingOrchestrator({
  topic: "短影音使用對高中生注意力與睡眠品質之影響",
  reportType: "研究報告",
  audience: "高中生",
  language: "zh-Hant",
  expectedLength: "medium",
  sourceRequirement: "APA",
  outputFormat: ["markdown", "docx"],
  constraints: [],
});
```

The returned value is plain JSON-compatible data.

## Demo

From the `@workspace/report-factory` package:

```sh
pnpm run demo:orchestrator
```

The demo runs the six V1 test cases and prints the orchestrator output as formatted JSON.

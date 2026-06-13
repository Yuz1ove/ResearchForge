import type { ReportFactoryPluginManifest } from "./contract.ts";

export const builtInPlugins: readonly ReportFactoryPluginManifest[] = [
  {
    id: "research-writing-orchestrator-v1",
    name: "Research Writing Orchestrator V1",
    version: "1.0.0",
    kind: "orchestrator",
    status: "alpha",
    description: "Rule-based planner that classifies research requests and returns a structured writing plan.",
    capabilities: [
      {
        id: "plan-academic-research-report",
        description: "Create a section-by-section research writing plan from a topic and report type.",
        inputContract: "ResearchWritingOrchestratorInput",
        outputContract: "ResearchWritingPlan",
      },
      {
        id: "produce-structured-research-sections",
        description: "Normalize the research writing plan into report sections that can be exported.",
        inputContract: "ResearchWritingFlowInput",
        outputContract: "ResearchWritingFlowResult",
      },
    ],
    warnings: [
      "Does not generate full report body.",
      "Does not fabricate citations, statistics, author names, article titles, or URLs.",
    ],
  },
  {
    id: "source-retrieval-v1",
    name: "Source Retrieval V1",
    version: "1.0.0",
    kind: "source",
    status: "mock",
    description: "Placeholder contract for future source search and evidence retrieval modules.",
    capabilities: [
      {
        id: "retrieve-source-candidates",
        description: "Return source candidates for research claims without treating them as verified citations.",
        inputContract: "SourceSearchInput",
        outputContract: "SourceSearchResult",
      },
    ],
    warnings: ["Candidate sources must be reviewed before citation or export."],
  },
  {
    id: "citation-checker-v1",
    name: "Citation Checker V1",
    version: "1.0.0",
    kind: "citation",
    status: "planned",
    description: "Contract placeholder for citation validation and bibliography formatting.",
    capabilities: [
      {
        id: "validate-citation-metadata",
        description: "Check whether citation metadata is complete enough for a requested style.",
        inputContract: "CitationValidationInput",
        outputContract: "CitationValidationResult",
      },
    ],
    warnings: ["Must not invent missing citation metadata."],
  },
  {
    id: "export-pipeline-v1",
    name: "DOCX Export Plugin V1",
    version: "1.0.0",
    kind: "export",
    status: "alpha",
    description: "Adapter that accepts report-document-v1 and delegates DOCX generation to the existing exporter.",
    capabilities: [
      {
        id: "export-report-artifact",
        description: "Export a report-document-v1 artifact to DOCX.",
        inputContract: "DocxPluginInput",
        outputContract: "DocxPluginResult",
      },
    ],
    warnings: ["Uses the existing DOCX exporter; does not create citations or verify sources."],
  },
];

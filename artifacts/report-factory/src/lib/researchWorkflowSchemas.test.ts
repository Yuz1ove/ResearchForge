import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceCardSchema,
  QualityReportSchema,
  ResearchDraftSchema,
  ResearchProjectSchema,
  ResearchSourceSchema,
  ReportSectionSchema,
} from "../../../../lib/api-zod/src/research-workflow.ts";

test("research workflow schemas validate canonical records", () => {
  const project = ResearchProjectSchema.parse({
    id: "project-1",
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
    reportType: "研究報告",
    depth: "standard",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    status: "draft",
  });

  const source = ResearchSourceSchema.parse({
    id: "source-1",
    title: "Short-form video use and sleep",
    authors: ["Ada Lovelace"],
    year: 2024,
    url: "https://example.edu/article",
    doi: "10.1000/example",
    abstract: "Abstract text",
    provider: "Crossref",
    sourceType: "Crossref",
    relevanceScore: 0.84,
    credibilityScore: 0.9,
    accepted: true,
    rejected: false,
    collapsed: true,
    tags: ["sleep", "attention"],
    raw: { provider: "Crossref" },
  });

  const evidence = EvidenceCardSchema.parse({
    id: "evidence-1",
    sourceId: source.id,
    claim: "Short-form video use may relate to lower sleep quality.",
    quoteOrParaphrase: "Abstract-derived paraphrase.",
    summary: "Evidence summary",
    relevance: "sleep quality",
    confidence: 0.72,
    sectionHints: ["findings", "discussion"],
    citationText: "Ada Lovelace (2024)",
    pageOrLocation: "abstract",
    derivation: "abstract-derived",
    limitation: "No full text yet",
    createdAt: "2026-06-18T00:00:00.000Z",
  });

  const section = ReportSectionSchema.parse({
    id: "section-1",
    key: "findings",
    title: "主要發現",
    content: "The report grounded by accepted evidence.",
    evidenceCardIds: [evidence.id],
    citationIds: [source.id],
    warnings: [],
  });

  const quality = QualityReportSchema.parse({
    sourceCount: 1,
    acceptedSourceCount: 1,
    evidenceCardCount: 1,
    missingCitationWarnings: [],
    unsupportedClaimWarnings: [],
    overclaimWarnings: [],
    topicDriftWarnings: [],
    readiness: "preliminary",
  });

  const draft = ResearchDraftSchema.parse({
    id: "draft-1",
    projectId: project.id,
    sections: [section],
    references: ["Ada Lovelace (2024)"],
    qualityReport: quality,
    createdAt: "2026-06-18T00:00:00.000Z",
    exportStatus: "docx_ready",
  });

  assert.equal(draft.sections[0]?.evidenceCardIds[0], evidence.id);
  assert.equal(draft.qualityReport.readiness, "preliminary");
});

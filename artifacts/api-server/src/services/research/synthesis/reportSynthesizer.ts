import type {
  ResearchEvidenceCard,
  ResearchReportParagraph,
  ResearchSynthesizeReportRequest,
  ResearchSynthesizeReportResponse,
} from "@workspace/api-zod/research-tools";
import { normalizedSourceToSourceRecord } from "../normalizers/normalizeSource";
import { writeReportWithLlm } from "../../report-writer";

function mapEvidenceCard(card: ResearchEvidenceCard) {
  return {
    id: card.id,
    sourceId: card.sourceId,
    title: card.claimOrFinding,
    claim: card.claimOrFinding,
    evidence: card.keyEvidence,
    summary: card.translatedSummaryZh,
    relevance: card.relevanceReason,
    sourceType: "research",
    reliability: card.confidence,
    mainClaim: card.claimOrFinding,
    usableEvidence: card.keyEvidence,
    limitations: card.limitations,
    sectionTargets: [],
    sourceTitle: card.claimOrFinding,
    sourceProvider: "research-pipeline",
    doi: null,
    abstract: card.originalAbstract ?? null,
    provider: "research-pipeline",
    relevanceScore: card.relevanceScore,
    sourceQualityScore: card.sourceQualityScore,
    finalScore: card.relevanceScore * 0.65 + card.sourceQualityScore * 0.35,
    year: null,
    usableSections: card.usableSections,
    citationText: card.citationMarker,
    limitation: card.limitations[0] ?? null,
    derivation:
      card.evidenceBasis === "full-text-based"
        ? "fulltext-derived"
        : card.evidenceBasis === "metadata-only"
          ? "metadata-derived"
          : "abstract-derived",
    evidenceGrounding: card.evidenceBasis,
    summaryStructuredStatus: "success",
    llmSummaryStatus: "success",
  };
}

function paragraphsFromSections(
  sections: Array<{
    sectionId: string;
    title: string;
    prose: string;
    evidenceCardIds: string[];
    citationIds: string[];
    warnings?: string[];
  }>,
): ResearchReportParagraph[] {
  return sections.map((section, index) => ({
    id: `paragraph-${index + 1}`,
    sectionId: section.sectionId,
    sectionTitle: section.title,
    paragraphPurpose: section.title,
    text: section.prose,
    evidenceCardIds: section.evidenceCardIds,
    citationIds: section.citationIds,
    warnings: section.warnings ?? [],
  }));
}

export async function synthesizeResearchReport(
  input: ResearchSynthesizeReportRequest,
): Promise<ResearchSynthesizeReportResponse> {
  const result = await writeReportWithLlm({
    topic: input.topic,
    reportType: input.reportStyle,
    audience: "research-user",
    language: "zh-TW",
    generationMode: "formal",
    acceptedSources: input.acceptedSources.map(normalizedSourceToSourceRecord),
    evidenceCards: input.evidenceCards.map(mapEvidenceCard),
  });

  return {
    ok: result.ok,
    workflowId: input.queryPlan.workflowId,
    reportTitle: input.topic,
    paragraphs: paragraphsFromSections(result.sections),
    warnings: [result.warning].filter((item): item is string => Boolean(item)),
    llmStatus: result.llm_status,
  };
}

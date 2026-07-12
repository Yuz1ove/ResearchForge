import type {
  NormalizedSource,
  ParsedDocument,
  ResearchEvidenceBasis,
  ResearchEvidenceCard,
  ResearchQueryPlan,
} from "@workspace/api-zod/research-tools";

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function zhSummaryFromSource(source: NormalizedSource, parsed?: ParsedDocument): string {
  const text =
    cleanText(parsed?.abstract) ||
    cleanText(source.abstract) ||
    cleanText(parsed?.sections?.[0]?.text) ||
    cleanText(parsed?.fullText).slice(0, 220);
  if (!text) return "此來源目前僅具書目資訊，尚無可用摘要或全文內容。";
  return text;
}

function evidenceBasisFor(
  source: NormalizedSource,
  parsed?: ParsedDocument,
): ResearchEvidenceBasis {
  if (parsed?.extractionMethod === "tesseract" || parsed?.extractionMethod === "paddleocr") {
    return "ocr-based";
  }
  if (parsed?.fullText || parsed?.sections?.length) return "full-text-based";
  if (source.abstract || parsed?.abstract) return "abstract-based";
  return "metadata-only";
}

function confidenceFor(
  basis: ResearchEvidenceBasis,
): ResearchEvidenceCard["confidence"] {
  switch (basis) {
    case "full-text-based":
      return "high";
    case "ocr-based":
      return "medium";
    case "abstract-based":
      return "medium";
    default:
      return "low";
  }
}

function relevantSubtopic(
  source: NormalizedSource,
  plan: ResearchQueryPlan,
): string {
  const haystack = `${source.title} ${source.abstract ?? ""}`.toLowerCase();
  return (
    plan.researchSubtopics.find((subtopic) => {
      const zh = subtopic.labelZh.toLowerCase();
      const en = subtopic.labelEn?.toLowerCase();
      return haystack.includes(zh) || (en ? haystack.includes(en) : false);
    })?.labelZh ??
    plan.researchSubtopics[0]?.labelZh ??
    plan.normalizedTopic
  );
}

export function buildResearchEvidenceCards(input: {
  queryPlan: ResearchQueryPlan;
  acceptedSources: NormalizedSource[];
  parsedDocuments?: ParsedDocument[];
}): ResearchEvidenceCard[] {
  const parsedBySourceId = new Map(
    (input.parsedDocuments ?? []).map((document) => [document.sourceId, document]),
  );

  return input.acceptedSources.map((source, index) => {
    const parsed = parsedBySourceId.get(source.id);
    const evidenceBasis = evidenceBasisFor(source, parsed);
    const translatedSummaryZh = zhSummaryFromSource(source, parsed);
    const limitations: string[] = [];

    if (evidenceBasis === "metadata-only") limitations.push("僅有 metadata，不能產生具體研究主張。");
    if (evidenceBasis === "abstract-based") limitations.push("僅根據摘要整理，尚未讀取全文。");
    if (evidenceBasis === "ocr-based") limitations.push("OCR 結果可能有辨識誤差。");
    if (!source.doi) limitations.push("缺少 DOI。");
    if (!source.abstract && !parsed?.fullText) limitations.push("摘要缺失。");

    const researchSubtopic = relevantSubtopic(source, input.queryPlan);
    const keyEvidence =
      cleanText(parsed?.sections?.[0]?.text) ||
      cleanText(source.abstract) ||
      cleanText(source.title) ||
      "目前僅可確認來源標題與書目資訊。";

    return {
      id: `evidence-${source.id}-${index + 1}`,
      workflowId: input.queryPlan.workflowId,
      sourceId: source.id,
      citationMarker: `［${index + 1}］`,
      researchSubtopic,
      claimOrFinding:
        cleanText(source.title) ||
        `${researchSubtopic}相關來源`,
      ...(cleanText(parsed?.sections?.[0]?.heading)
        ? { methodOrData: cleanText(parsed?.sections?.[0]?.heading) }
        : {}),
      keyEvidence,
      usableSections: parsed?.sections?.map((section) => section.heading).filter(Boolean) ?? [],
      limitations,
      relevanceReason: `此來源與「${researchSubtopic}」及主題「${input.queryPlan.normalizedTopic}」有直接關聯。`,
      translatedSummaryZh,
      ...(cleanText(source.abstract) ? { originalAbstract: cleanText(source.abstract) } : {}),
      sourceQualityScore: source.sourceQualityScore ?? 0,
      relevanceScore: source.relevanceScore ?? 0,
      evidenceBasis,
      confidence: confidenceFor(evidenceBasis),
      warnings:
        limitations.length > 0
          ? limitations
          : undefined,
    };
  });
}

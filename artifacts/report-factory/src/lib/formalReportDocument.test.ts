import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { ReportPlan } from "@workspace/api-zod";
import { buildEvidenceCards } from "./evidenceCards.ts";
import { buildDetailedReportParagraphs } from "./detailedReport.ts";
import { buildDocxBlob, buildMarkdown, buildPrintHtml } from "./exportReport.ts";
import {
  buildFormalReportDocument,
  formalReportDocumentReaderText,
  formalReportSectionContent,
  formalReportSectionSequence,
  scanReaderFacingForbiddenTokens,
} from "./formalReportDocument.ts";
import type { ReportInput } from "./generateReport.ts";
import { createReportWorkspace, workspaceToGeneratedReport } from "./reportWorkspace.ts";
import type { ReportWorkspace } from "./reportWorkspace.ts";
import { DEFAULT_REPORT_PRESENTATION } from "./reportPresentation.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import { buildStructuredReportPlan } from "./structuredReportPlan.ts";

const nodeRequire = createRequire(import.meta.url);
const topic = "台灣 urban heat island 與校園綠覆率的關聯";
const workflowId = "wf-formal-document-test";
const topicHash = "topic-formal-document-test";
const evidenceHash = "a".repeat(64);

const input: ReportInput = {
  topic,
  reportType: "研究報告",
  academicLevel: "大學",
  targetAudience: "一般讀者",
  researchDepth: "standard",
  purpose: "正式證據綜合",
  domainOverride: "",
  mode: "直接生成完整報告",
  sourceRequirement: "需要，並生成參考文獻格式",
  citationFormat: "APA",
  chartRequirement: "需要",
  style: "學術研究風格",
  length: "一般報告",
  wordCount: "",
  formalTone: "需要",
  conversationalTone: "不需要",
  specifiedStructure: "",
  rubric: "",
  personalStyle: "",
  supplementalMaterials: "",
  outputLanguage: "繁體中文",
  rewriteSection: "",
  additionalInfo: "",
  acceptedSources: [],
};

function source(index: number, title: string, summary: string): SourceRecord {
  return {
    id: `source-${index}`,
    title,
    authors: [index === 1 ? "Lin, Y." : "Chen, M."],
    year: 2022 + index,
    abstract: `Source ${index} provides directly traceable observations about vegetation and urban thermal conditions.`,
    doi: `10.1000/formal-${index}`,
    url: `https://doi.org/10.1000/formal-${index}`,
    sourceType: index === 1 ? "OpenAlex" : "Crossref",
    reviewState: "accepted",
    publisher: "Evidence Press",
    containerTitle: "Urban Climate Evidence",
    accessedAt: null,
    sourceCategory: "journal_article",
    confidence: "高",
    usableSections: ["研究背景", "文獻探討", "數據分析", "結論"],
    reviewNotes: "可供追溯的測量結果。",
    relevanceLevel: "primary",
    evidenceGrounding: "abstract_grounded",
    workflowId,
    topic,
    normalizedTopic: topic,
    topicHash,
    queryPlanHash: "query-plan-formal-test",
    readableSummaryZhTw: summary,
    evidenceSummaryZhTw: summary,
    mainEvidencePointZhTw: summary,
    accessLevel: "abstract_only",
  };
}

function plan(kind: "complete_research_report" | "limited_evidence_brief"): ReportPlan {
  const section = (
    sectionId: string,
    title: string,
    canonicalSectionRole: NonNullable<ReportPlan["sections"][number]["canonicalSectionRole"]>,
  ): ReportPlan["sections"][number] => ({
    sectionId,
    title,
    goal: `以可追溯證據完成${title}`,
    requiredEvidenceTypes: ["abstract"],
    evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0"],
    plannedClaimIds: [],
    canonicalSectionRole,
  });
  return {
    workflowId,
    topicHash,
    title: `${topic}研究報告`,
    researchQuestion: "現有可追溯證據如何解釋台灣校園綠覆率與都市熱島現象的關聯？",
    evidenceSetHash: evidenceHash,
    evidenceSetVersion: "writer-evidence-set/v1",
    citationRegistryVersion: "canonical-citation-registry/v1",
    planBuildStatus: "plan_built",
    readinessStatus: kind === "complete_research_report" ? "ready_complete_report" : "ready_limited_report",
    centralAnswer: "現有研究共同支持綠覆與較低地表溫度的方向性關聯，但校園尺度、植被結構與微氣候情境必須一併解釋。",
    scope: "聚焦校園與都市地表溫度相關的觀測性證據，不推論未直接量測的因果效果。",
    subQuestions: [
      "綠覆率與地表溫度的關聯方向為何？",
      "哪些情境因素會限制研究間比較？",
    ],
    sections: [
      section("introduction", "研究背景", "background"),
      section("literature_review", "綠覆、地表溫度與空間尺度", "core_evidence"),
      section("findings", "校園情境中的主要證據", "core_evidence"),
      section("methodology", "證據來源與整理方法", "scope_method"),
      section("discussion", "跨來源綜合", "cross_source_synthesis"),
      section("limitations", "證據限制", "limitations"),
      section("conclusion", "結論", "conclusion"),
      section("references", "參考文獻", "references"),
    ],
    plannedClaims: [],
    evidenceGaps: ["台灣校園層級的長期量測資料仍不足。"],
    conclusionBoundary: "結論不得將跨地區關聯外推為台灣所有校園的因果效果。",
    compositionKind: kind,
    terminology: { UHI: "都市熱島", greenCoverage: "綠覆率" },
  };
}

function workspace(kind: "complete_research_report" | "limited_evidence_brief") {
  const sources = [
    source(1, "Vegetation cover and land surface temperature", "第一份研究指出，植被指標較高的區域通常呈現較低的地表溫度，但該結果是空間關聯而非因果實驗。"),
    source(2, "Campus greenery and thermal environments", "第二份研究顯示，校園樹冠、地表材料與建築排列會共同影響熱暴露，因此不能只用單一綠覆比例解釋。"),
  ];
  const cards = buildEvidenceCards(sources, [], { topic });
  const result = createReportWorkspace(input, sources, "short_research_report", "report-formal-test", {
    workflowId,
    topicHash,
    displayTitle: `${topic}研究報告`,
    evidenceCards: cards,
    reportPlan: plan(kind),
  });
  const bodyById: Record<string, string> = {
    introduction: "校園綠地不只是景觀要素，也可能透過遮蔭與蒸散作用改變日間熱環境 [source:1]。這使綠覆率與都市熱島的關係成為校園規劃中可被檢驗的研究問題。",
    literature_review: "空間觀測研究一致將植被指標與地表溫度放在同一分析框架，其中綠覆較高處通常對應較低熱負荷 {s1}。這類證據可支持關聯方向，卻不足以單獨排除土地使用、地形與建成環境的干擾。",
    findings: "校園情境的研究進一步指出，樹冠遮蔭、鋪面材料與建築排列會共同影響學生活動空間的熱暴露 citation_2。因此，綠覆率應視為綜合熱環境評估的其中一個指標，而不是單一決定因素。",
    methodology: "本報告依書目身分去重，並將可核對的摘要級內容與研究問題對應，只保留能建立來源關聯的敘述。",
    discussion: "兩份來源的共同點是綠地與較低熱負荷具有方向性關聯 [s1]，同時都暗示空間情境會改變觀察結果 source_2。差異在於一份聚焦大尺度地表指標，另一份則強調校園內部設計，因而需要分層解釋。",
    limitations: "現有來源主要來自摘要層級與觀測性分析，缺少台灣校園的長期、同一方法量測，也不能將地表溫度直接等同學生個人的熱暴露。",
    conclusion: "綜合現有證據，綠覆較高與較低地表溫度之間有一致的方向性關聯 [S1]，但校園層級的判斷必須同時納入樹冠、鋪面與建築形態 [S2]。因此，現階段可支持規劃上的測量與比較，卻不支持單一百分比必然導致固定降溫的因果聲稱。",
  };
  result.draft.sections = result.draft.sections.map((section) => ({
    ...section,
    body: bodyById[section.sectionId] ?? section.body,
    synthesizedProseZhTw: bodyById[section.sectionId] ?? section.synthesizedProseZhTw,
    supportingSourceIds: section.sectionId === "findings" ? ["source-2"] : ["source-1", "source-2"],
    citationIds: section.sectionId === "findings" ? ["source-2"] : ["source-1", "source-2"],
  }));
  result.llmDiagnostics = {
    reportGenerationProvider: "test-provider",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    warning: null,
    reportPlanStatus: "plan_built",
    readinessStatus: kind === "complete_research_report" ? "ready_complete_report" : "ready_limited_report",
    evidenceSetHash: evidenceHash,
    writerEvidenceSetHash: evidenceHash,
    filteredAfterPlanCount: 0,
    filteredEvidence: [],
  };
  return result;
}

function archivedShortVideoSleepWorkspace(): ReportWorkspace {
  const fixtureUrl = new URL(
    "../../../qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as ReportWorkspace;
}

function rendererFixtureReport(result: ReportWorkspace) {
  const report = workspaceToGeneratedReport(result);
  const formal = report.meta.formalReportDocument!;
  return {
    ...report,
    meta: {
      ...report.meta,
      formalReportDocument: {
        ...formal,
        integrity: {
          ...formal.integrity,
          status: "pass" as const,
          citationMappingIssues: [],
          sourceMentionIssues: [],
          repetitionIssues: [],
        },
      },
      citationIntegrity: {
        status: "pass" as const,
        unknownMarkers: [],
        ambiguousMarkers: [],
        rewrites: report.meta.citationIntegrity?.rewrites ?? [],
      },
      readerFacingAudit: {
        ...report.meta.readerFacingAudit,
        status: "pass" as const,
        forbiddenTokens: [],
      },
    },
  };
}

test("claim_citation_reference_identity", () => {
  const document = buildFormalReportDocument(workspace("limited_evidence_brief"));
  const readerText = formalReportDocumentReaderText(document);

  assert.equal(document.metadata.reportKind, "limited_evidence_brief");
  assert.equal(document.metadata.reportTypeLabel, "有限證據報告（Limited Evidence Brief）");
  assert.equal(document.integrity.status, "pass", JSON.stringify(document.integrity, null, 2));
  assert.equal(document.abstract.validation.status, "pass");
  assert.match(document.abstract.text, /直接性 C 級|可追溯/u);
  assert.doesNotMatch(document.abstract.text, /最重要的證據限制是：結論不得/u);
  assert.doesNotMatch(document.abstract.text, /：：/u);
  assert.equal(document.references.length, 2);
  assert.equal(document.metadata.acceptedSourceCount, 2);
  assert.equal(document.metadata.evidenceSourceCount, 2);
  assert.equal(document.metadata.citedSourceCount, document.references.length);
  const comparisonTable = document.appendix[0]?.tables.find((table) =>
    table.title.includes("證據用途與限制比較")
  );
  assert.equal(comparisonTable?.rows.length, document.references.length);
  assert.deepEqual(document.references.map((reference) => reference.marker), ["Chen, 2024", "Lin, 2023"]);
  assert.equal(document.crossSourceSynthesis.tables.length, 0);
  assert.equal(comparisonTable?.columns.length, 4);
  assert.doesNotMatch(document.abstract.text, /\[\d+\]|\[S\d+\]|\{s\d+\}/iu);
  assert.doesNotMatch(readerText, /\[S\d+\]|\{\{?s\d+\}?\}|\[source:\d+\]|\b(?:source|citation)_\d+\b/iu);
  assert.doesNotMatch(readerText, /\[\d+\]/u);
  assert.match(readerText, /Chen, 2024/u);
  assert.match(readerText, /Lin, 2023/u);
  assert.doesNotMatch(readerText, /[\u3400-\u9fff],/u);
  assert.deepEqual(scanReaderFacingForbiddenTokens(readerText), []);
  assert.ok(document.tableOfContents.length >= 10);
  assert.equal(document.appendix.length, 1);
  assert.deepEqual(document.integrity.sourceCountIssues, []);
  assert.deepEqual(document.integrity.tableIssues, []);
  assert.match(document.conclusion.blocks.find((block) => /直接回答是/u.test(block.text))?.text ?? "", /直接回答是/u);
  assert.match(document.conclusion.blocks.at(-1)?.text ?? "", /後續研究宜/u);
  assert.ok(document.conclusion.blocks.length >= 3);

  const identityWorkspace = workspace("limited_evidence_brief");
  identityWorkspace.input.topic = "校園綠地與熱環境";
  identityWorkspace.generationPayload.reportPlan!.title = identityWorkspace.input.topic;
  const identityClaimBySection = new Map([
    ["literature_review", "claim-source-1"],
    ["findings", "claim-source-2"],
  ]);
  identityWorkspace.generationPayload.reportPlan!.claimGraph = {
    researchQuestion: identityWorkspace.generationPayload.reportPlan!.researchQuestion,
    claims: [
      {
        claimId: "claim-source-1",
        claimType: "author_synthesis",
        readerFacingStatement: "綠覆較高處通常對應較低熱負荷。",
        supportingFacts: [],
        contradictingFacts: [],
        backgroundFacts: [],
        applicability: [],
        confidence: 1,
        citationIds: ["source-1", "source-2"],
        statisticalInterpretationIds: [],
        visualizable: false,
        visualId: null,
        evidenceDirectness: "C",
        limitations: [],
      },
      {
        claimId: "claim-source-2",
        claimType: "author_synthesis",
        readerFacingStatement: "樹冠、鋪面與建築排列共同影響校園熱暴露。",
        supportingFacts: [],
        contradictingFacts: [],
        backgroundFacts: [],
        applicability: [],
        confidence: 1,
        citationIds: ["source-2"],
        statisticalInterpretationIds: [],
        visualizable: false,
        visualId: null,
        evidenceDirectness: "C",
        limitations: [],
      },
    ],
    edges: [],
  };
  identityWorkspace.draft.sections = identityWorkspace.draft.sections.map((section) => {
    const claimId = identityClaimBySection.get(section.sectionId);
    return !claimId
      ? section
      : {
          ...section,
          paragraphClaims: [{
            paragraphId: `${section.sectionId}-claim-identity`,
            sectionId: section.sectionId,
            claimIds: [claimId],
            evidenceCardIds: section.evidenceCardIds,
            citationMarkers: section.citationMarkers,
            generatedTextZhTw: section.body,
            unsupportedSentences: [],
          }],
        };
  });

  const aligned = buildFormalReportDocument(identityWorkspace);
  assert.equal(aligned.integrity.status, "pass", JSON.stringify(aligned.integrity, null, 2));
  assert.equal(aligned.quality.blockExport, false);
  assert.equal(aligned.quality.dimensions.citation_precision.score, 100);
  assert.deepEqual(aligned.integrity.citationMappingIssues.filter((issue) =>
    issue.startsWith("claim_citation_reference_identity_mismatch:")
  ), []);

  const swappedWorkspace = structuredClone(identityWorkspace);
  swappedWorkspace.generationPayload.reportPlan!.claimGraph!.claims =
    swappedWorkspace.generationPayload.reportPlan!.claimGraph!.claims.map((claim) => ({
      ...claim,
      citationIds: claim.claimId === "claim-source-1"
        ? ["source-2"]
        : ["source-1", "source-2"],
    }));
  const swapped = buildFormalReportDocument(swappedWorkspace);
  assert.deepEqual(swapped.integrity.sourceCountIssues, []);
  assert.equal(swapped.integrity.status, "blocked");
  assert.equal(swapped.quality.blockExport, true);
  assert.deepEqual(swapped.quality.dimensions.citation_precision.failureLocations, [
    "claim:claim-source-1",
    "claim:claim-source-2",
  ]);
  assert.deepEqual(swapped.integrity.citationMappingIssues.filter((issue) =>
    issue.startsWith("claim_citation_reference_identity_mismatch:")
  ), [
    "claim_citation_reference_identity_mismatch:claim-source-1:declared=source-2:paragraph=ref-1+ref-2:referenced=source-1+source-2:unresolved_claim=none:unresolved_paragraph=none",
    "claim_citation_reference_identity_mismatch:claim-source-2:declared=source-1+source-2:paragraph=ref-2:referenced=source-2:unresolved_claim=none:unresolved_paragraph=none",
  ]);
});

test("table_overuse_gate", () => {
  const document = buildFormalReportDocument(archivedShortVideoSleepWorkspace());
  const bodySections = formalReportSectionSequence(document);
  const mainBodyTables = bodySections.flatMap((section) => section.tables);

  assert.ok(mainBodyTables.length <= 1);
  assert.equal(mainBodyTables.some((table) => table.rows.some((row) => row.some((cell) => cell.length >= 120))), false);
  assert.equal(mainBodyTables.some((table) => table.rows.length >= document.metadata.acceptedSourceCount), false);
  assert.ok(document.appendix.flatMap((section) => section.tables).length >= 1);
  assert.deepEqual(document.integrity.tableIssues, []);
});

test("short-video result visuals are placed in evidence-first main-body order with truthful Image2 fallback", () => {
  const document = buildFormalReportDocument(archivedShortVideoSleepWorkspace());
  const bodySections = formalReportSectionSequence(document);
  const bodyVisuals = bodySections.flatMap((section) => section.figures);
  const visualTypes = bodyVisuals.map((figure) => (figure as { visualType?: string }).visualType);

  assert.deepEqual(visualTypes, [
    "sleep_evidence_coverage",
    "correlation_structure",
    "prevalence_facets",
    "odds_ratio_forest",
    "statistical_mediation_path",
    "population_applicability_boundary",
  ]);
  for (const section of bodySections.filter((candidate) => candidate.figures.length > 0)) {
    assert.equal(section.content?.[0]?.nodeType, "paragraph");
    if (section.content?.[0]?.nodeType === "paragraph") {
      assert.equal(section.content[0].block.paragraphRole, "reading_guide");
    }
    assert.equal(section.content?.[1]?.nodeType, "figure");
  }
  assert.deepEqual(document.integrity.figureIssues, []);
  assert.equal(document.generatedConceptImages.length, 1);
  assert.equal(document.generatedConceptImages[0]?.provider, "Image2");
  assert.equal(document.generatedConceptImages[0]?.status, "fallback");
  assert.equal(document.generatedConceptImages[0]?.assetUri, null);
  assert.match(document.generatedConceptImages[0]?.limitationNote ?? "", /誠實記錄 fallback/u);
  assert.doesNotMatch(document.generatedConceptImages[0]?.prompt ?? "", /\d|%|\b(?:OR|RR|HR|CI)\b|r\s*=/iu);
  assert.deepEqual(document.references.map((reference) => reference.authorYear), [
    "Al-Garni et al., 2024",
    "Bozzola et al., 2022",
    "Jiang et al., 2024",
    "Mu et al., 2022",
    "Yang et al., 2026",
    "Zhu et al., 2024",
  ]);
});

test("figure_claim_adjacency_uses_exact_semantic_claims_and_native_or_canonical_paragraph_metadata", () => {
  const result = structuredClone(archivedShortVideoSleepWorkspace());
  const rebuiltPlan = buildStructuredReportPlan({
    workflowId: result.workflowId,
    topicHash: result.topicHash,
    title: result.input.topic,
    researchQuestion: result.generationPayload.researchTopic,
    evidenceCards: result.evidenceCards,
    academicSafetyReview: result.generationPayload.academicSafetyReview,
    writerEvidenceSet: result.generationPayload.writerEvidenceSet,
    targetedRetrievalAttempted: true,
  });
  assert.ok(rebuiltPlan, "the stable six-source fixture must rebuild a canonical plan");
  result.generationPayload.reportPlan = rebuiltPlan;
  const activePlan = result.generationPayload.reportPlan!;
  const factIds = new Set((activePlan.normalizedFacts ?? []).map((fact) => fact.factId));
  const existingClaims = activePlan.claimGraph?.claims ?? [];
  const claimTemplate = existingClaims[0]!;
  const semanticClaims = [
    {
      ...claimTemplate,
      claimId: "claim-live-coverage",
      claimType: "cross_source_shared_direction" as const,
      readerFacingStatement: "直接證據同時覆蓋高中或中學生、短影音或 TikTok 與睡眠結果。",
      supportingFacts: ["fact-1ubgihl-result-eg4ecs", "fact-54tok-result-1futg8w"].filter((id) => factIds.has(id)),
      backgroundFacts: [],
      citationIds: ["doi:10.1186/s40359-024-01865-9", "doi:10.2147/ijgm.s464457"],
      visualId: "evidence-visual-sleep-evidence-coverage",
    },
    {
      ...claimTemplate,
      claimId: "claim-live-prevalence",
      claimType: "direct_result" as const,
      readerFacingStatement: "兩項研究分別報告 31.06% 與 34.7% 的睡眠比例，兩者不可直接比較。",
      supportingFacts: ["fact-54tok-result-tas9id", "fact-1ubgihl-result-n2am50"].filter((id) => factIds.has(id)),
      backgroundFacts: [],
      citationIds: ["doi:10.1186/s40359-024-01865-9", "doi:10.2147/ijgm.s464457"],
      visualId: "evidence-visual-sleep-prevalence-facets",
    },
    {
      ...claimTemplate,
      claimId: "claim-live-or",
      claimType: "direct_result" as const,
      readerFacingStatement: "同一中學生模型分別報告 TikTok、使用時數與憂鬱症狀的 OR 及 95% CI。",
      supportingFacts: [
        "fact-1ubgihl-result-eg4ecs",
        "fact-1ubgihl-result-14ps02b",
        "fact-1ubgihl-result-fgccsn",
      ].filter((id) => factIds.has(id)),
      backgroundFacts: [],
      citationIds: ["doi:10.2147/ijgm.s464457"],
      visualId: "evidence-visual-sleep-odds-ratio-forest",
    },
    {
      ...claimTemplate,
      claimId: "claim-live-correlation",
      claimType: "direct_result" as const,
      readerFacingStatement: "同一高中生研究報告短影音成癮、睡眠品質與社交焦慮的三組相關係數。",
      supportingFacts: [
        "fact-54tok-result-1futg8w",
        "fact-54tok-result-1utxybx",
        "fact-54tok-result-1jjh6a",
      ].filter((id) => factIds.has(id)),
      backgroundFacts: [],
      citationIds: ["doi:10.1186/s40359-024-01865-9"],
      visualId: "evidence-visual-sleep-correlation-structure",
    },
    {
      ...claimTemplate,
      claimId: "claim-live-mechanism",
      claimType: "possible_mechanism" as const,
      readerFacingStatement: "社交焦慮是研究提出的統計中介路徑，不構成已證實因果機制。",
      supportingFacts: ["fact-17s5k85"].filter((id) => factIds.has(id)),
      backgroundFacts: [],
      citationIds: ["doi:10.3390/bs16071232"],
      visualId: "evidence-visual-sleep-statistical-mediation",
    },
    {
      ...claimTemplate,
      claimId: "claim-live-boundary",
      claimType: "applicability_boundary" as const,
      readerFacingStatement: "高中生、大學生、一般社群媒體與非睡眠結果的證據用途不可互換。",
      supportingFacts: Array.from(factIds),
      backgroundFacts: [],
      citationIds: result.acceptedSources.map((source) => source.id),
      visualId: "evidence-visual-sleep-applicability-boundary",
    },
  ];
  activePlan.claimGraph = {
    researchQuestion: activePlan.researchQuestion,
    claims: [...existingClaims, ...semanticClaims],
    edges: [],
  };
  const claimIdsBySection = new Map<string, string[]>([
    ["introduction", ["claim-live-coverage"]],
    ["literature_review", ["claim-live-correlation"]],
    ["findings", ["claim-live-prevalence", "claim-live-or"]],
    ["discussion", ["claim-live-mechanism"]],
    ["limitations", ["claim-live-boundary"]],
  ]);
  result.draft.sections = result.draft.sections.map((section) => {
    const nativeClaimIds = claimIdsBySection.get(section.sectionId) ?? [];
    const existingBindings = section.paragraphClaims ?? [];
    const paragraphs = existingBindings.length > 0
      ? existingBindings.map((binding) => binding.generatedTextZhTw)
      : section.body.split(/\n\s*\n/gu).map((paragraph) => paragraph.trim()).filter(Boolean);
    return {
      ...section,
      paragraphClaims: paragraphs.map((paragraph, index) => ({
        paragraphId: `${section.sectionId}-native-${index + 1}`,
        sectionId: section.sectionId,
        claimIds: nativeClaimIds,
        evidenceCardIds: section.evidenceCardIds,
        citationMarkers: section.citationMarkers,
        generatedTextZhTw: paragraph,
        unsupportedSentences: [],
      })),
    };
  });

  const document = buildFormalReportDocument(result);
  const visualSections = formalReportSectionSequence(document)
    .filter((section) => section.figures.length > 0);
  const expectedClaimByVisualType = new Map([
    ["sleep_evidence_coverage", "claim-live-coverage"],
    ["correlation_structure", "claim-live-correlation"],
    ["prevalence_facets", "claim-live-prevalence"],
    ["odds_ratio_forest", "claim-live-or"],
    ["statistical_mediation_path", "claim-live-mechanism"],
    ["population_applicability_boundary", "claim-live-boundary"],
  ]);

  assert.deepEqual(
    document.integrity.figureIssues,
    [],
    JSON.stringify(visualSections.map((section) => ({
      id: section.id,
      nodes: formalReportSectionContent(section).map((node) => node.nodeType === "paragraph"
        ? { type: "paragraph", claimIds: node.block.argumentClaimIds, text: node.block.text.slice(0, 40) }
        : { type: node.nodeType, claimId: node.nodeType === "figure" ? node.figure.argumentClaimId : null }),
    })), null, 2),
  );
  for (const section of visualSections) {
    const nodes = formalReportSectionContent(section);
    for (const [index, node] of nodes.entries()) {
      if (node.nodeType !== "figure" || !("visualId" in node.figure)) continue;
      const visualType = (node.figure as { visualType: string }).visualType;
      assert.equal(node.figure.argumentClaimId, expectedClaimByVisualType.get(visualType));
      const adjacent = [nodes[index - 1], nodes[index + 1]].filter(
        (candidate) => candidate?.nodeType === "paragraph",
      );
      assert.equal(adjacent.some((candidate) => candidate?.nodeType === "paragraph" &&
        candidate.block.argumentClaimIds?.includes(node.figure.argumentClaimId!)), true);
    }
  }
  assert.equal(new Set(
    visualSections.flatMap((section) => section.figures.map((figure) => figure.argumentClaimId)),
  ).size, 6, "the six visual arguments must not collapse onto one broad claim");

  const withoutNativeBindings = structuredClone(result);
  withoutNativeBindings.draft.sections = withoutNativeBindings.draft.sections.map((section) => ({
    ...section,
    paragraphClaims: [],
  }));
  withoutNativeBindings.llmDiagnostics = {
    ...withoutNativeBindings.llmDiagnostics!,
    writerDiagnostics: {
      ...withoutNativeBindings.llmDiagnostics!.writerDiagnostics!,
      fallbackSectionIds: [],
    },
  };
  withoutNativeBindings.generationPayload.reportPlan!.sections =
    withoutNativeBindings.generationPayload.reportPlan!.sections.map((section) => ({
      ...section,
      paragraphPlan: [],
    }));
  const blocked = buildFormalReportDocument(withoutNativeBindings);
  assert.equal(blocked.integrity.status, "blocked");
  assert.equal(blocked.integrity.figureIssues.some((issue) =>
    issue.startsWith("figure_not_adjacent_to_argument_claim:")
  ), true);

  const canonicalFallback = structuredClone(result);
  const fallbackSectionIds = [...claimIdsBySection.keys()];
  canonicalFallback.llmDiagnostics = {
    ...canonicalFallback.llmDiagnostics!,
    writerDiagnostics: {
      ...canonicalFallback.llmDiagnostics!.writerDiagnostics!,
      fallbackSectionIds,
    },
  };
  canonicalFallback.draft.sections = canonicalFallback.draft.sections.map((section) => ({
    ...section,
    paragraphClaims: (section.paragraphClaims ?? []).map((binding) => ({
      ...binding,
      claimIds: [],
    })),
  }));
  canonicalFallback.generationPayload.reportPlan!.sections =
    canonicalFallback.generationPayload.reportPlan!.sections.map((section) => {
      const rawParagraphCount = canonicalFallback.draft.sections
        .find((candidate) => candidate.sectionId === section.sectionId);
      const canonicalParagraphCount = rawParagraphCount?.paragraphClaims?.length ||
        rawParagraphCount?.body.split(/\n\s*\n/gu).map((paragraph) => paragraph.trim()).filter(Boolean).length || 0;
      const canonicalClaimIds = claimIdsBySection.get(section.sectionId) ?? [];
      const template = section.paragraphPlan?.[0];
      return !template || canonicalClaimIds.length === 0
        ? section
        : {
            ...section,
            paragraphPlan: Array.from({ length: canonicalParagraphCount }, (_, index) => ({
              ...template,
              paragraphId: `${section.sectionId}-canonical-${index + 1}`,
              supportedClaimIds: canonicalClaimIds,
            })),
          };
    });
  const fallbackDocument = buildFormalReportDocument(canonicalFallback);
  assert.deepEqual(fallbackDocument.integrity.figureIssues, []);
  assert.deepEqual(
    formalReportSectionSequence(fallbackDocument)
      .flatMap((section) => section.figures)
      .filter((figure) => "visualId" in figure)
      .map((figure) => [(figure as { visualType: string }).visualType, figure.argumentClaimId]),
    [...expectedClaimByVisualType.entries()],
  );
});

test("formal document blocks an analysis chapter that collapses to one short sentence", () => {
  const thinWorkspace = workspace("limited_evidence_brief");
  thinWorkspace.draft.sections = thinWorkspace.draft.sections.map((section) =>
    section.sectionId === "findings"
      ? {
          ...section,
          body: "校園研究只留下單句結果 [S2]。",
          synthesizedProseZhTw: "校園研究只留下單句結果 [S2]。",
          citationIds: ["source-2"],
          supportingSourceIds: ["source-2"],
        }
      : section,
  );

  const document = buildFormalReportDocument(thinWorkspace);

  assert.equal(document.integrity.status, "blocked");
  assert.equal(
    document.integrity.sectionCompletenessIssues.some((issue) =>
      issue.startsWith("analysis_section_collapsed:findings:"),
    ),
    true,
  );
});

test("formal document blocks a stated source count that exceeds its citation set", () => {
  const countMismatchWorkspace = workspace("limited_evidence_brief");
  countMismatchWorkspace.draft.sections = countMismatchWorkspace.draft.sections.map((section) =>
    section.sectionId === "discussion"
      ? {
          ...section,
          body: "四項研究共同指出綠地條件與較低熱負荷具有方向性關聯 [S1][S2]。",
          synthesizedProseZhTw: "四項研究共同指出綠地條件與較低熱負荷具有方向性關聯 [S1][S2]。",
          citationIds: ["source-1", "source-2"],
          supportingSourceIds: ["source-1", "source-2"],
        }
      : section,
  );

  const document = buildFormalReportDocument(countMismatchWorkspace);

  assert.equal(document.integrity.status, "blocked");
  assert.equal(
    document.integrity.citationMappingIssues.includes(
      "final_stated_source_count_exceeds_citations:4:2",
    ),
    true,
  );
});

test("complete and limited reports are explicit document variants", () => {
  const complete = buildFormalReportDocument(workspace("complete_research_report"));
  const limited = buildFormalReportDocument(workspace("limited_evidence_brief"));

  assert.equal(complete.metadata.reportKind, "evidence_synthesis_report");
  assert.equal(complete.metadata.reportTypeLabel, "學術證據綜合報告");
  assert.equal(limited.metadata.reportKind, "limited_evidence_brief");
  assert.equal(limited.metadata.reportTypeLabel, "有限證據報告（Limited Evidence Brief）");
  assert.match(complete.scopeAndMethod.blocks[2]?.text ?? "", /多個可比較主題/u);
  assert.ok(limited.scopeAndMethod.blocks.length >= 3);
  assert.ok(limited.tableOfContents.length >= 8);
  assert.match(limited.researchQuestion.title, /核心回答/u);
  assert.match(limited.limitations.title, /限制/u);
  assert.equal(limited.scopeAndMethod.figures.length, 0);
  assert.equal(limited.scopeAndMethod.tables.length, 0);
  assert.equal(limited.appendix[0]?.tables[0]?.specType, "table");
});

test("limited findings preserve source-grounded methods and numeric results", () => {
  const result = workspace("limited_evidence_brief");
  result.evidenceCards[0] = {
    ...result.evidenceCards[0]!,
    claimTextZhTw: "本研究以臺北市校園為研究場域。方法上使用 2018 至 2021 年月溫度資料與地理加權迴歸。結果顯示，綠視率較高與較低環境溫度呈顯著關聯，空間解析度為 0.01°。",
  };
  result.draft.sections = result.draft.sections.map((section) => section.sectionId === "literature_review"
    ? {
        ...section,
        body: "本研究以臺北市校園為研究場域。方法上使用 2018 至 2021 年月溫度資料與地理加權迴歸。結果顯示，綠視率較高與較低環境溫度呈顯著關聯，空間解析度為 0.01° [S1]。",
        synthesizedProseZhTw: "本研究以臺北市校園為研究場域。方法上使用 2018 至 2021 年月溫度資料與地理加權迴歸。結果顯示，綠視率較高與較低環境溫度呈顯著關聯，空間解析度為 0.01° [S1]。",
      }
    : section);
  const document = buildFormalReportDocument(result);
  const finding = document.analysisSections[0]?.blocks.find((block) => /地理加權迴歸/u.test(block.text))?.text ?? "";
  const comparisonRows = document.appendix[0]?.tables
    .find((table) => table.title.includes("證據用途與限制比較"))
    ?.rows ?? [];
  const tablePoint = comparisonRows.find((row) => row.some((cell) => /0\.01°/u.test(cell)))?.[2] ?? "";

  assert.match(finding, /地理加權迴歸/u);
  assert.match(finding, /0\.01°/u);
  assert.match(tablePoint, /結果顯示/u);
  assert.match(tablePoint, /0\.01°/u);
  assert.doesNotMatch(`${finding}\n${tablePoint}`, /…|\.\.\./u);
});

test("every accepted source receives an explicit usage status", () => {
  const result = workspace("limited_evidence_brief");
  result.acceptedSources.push(source(
    3,
    "General urban planning background",
    "此來源只提供一般都市規劃背景，沒有形成獨立且可驗證的正文主張。",
  ));
  const document = buildFormalReportDocument(result);

  assert.equal(document.sourceUsage.length, result.acceptedSources.length);
  assert.equal(document.sourceUsage.find((usage) => usage.sourceId === "source-3")?.status, "includedButNotUsed");
  assert.match(document.sourceUsage.find((usage) => usage.sourceId === "source-3")?.reason ?? "", /未形成|重複|直接性/u);
  assert.equal(document.appendix[0]?.tables[0]?.rows.length, result.acceptedSources.length);
});

test("formal report removes planning vocabulary and turns statement topics into questions", () => {
  const result = workspace("limited_evidence_brief");
  result.generationPayload.reportPlan = {
    ...result.generationPayload.reportPlan!,
    researchQuestion: "台灣 urban heat island 與校園綠覆率的關聯",
    scope: "使用已正規化且可追溯的主張，原文片段只供核對。",
    conclusionBoundary: "結論只能回收 ArgumentMap 與 DiscoursePlan 中已有的主張。",
  };
  const document = buildFormalReportDocument(result);
  const readerText = formalReportDocumentReaderText(document);

  assert.equal(
    document.metadata.researchQuestion,
    "現有證據如何解釋「臺灣都市熱島（urban heat island, UHI）與校園綠覆率的關聯」？",
  );
  assert.doesNotMatch(readerText, /ArgumentMap|DiscoursePlan|已正規化|原文片段只供核對/u);
  assert.deepEqual(scanReaderFacingForbiddenTokens(readerText), []);
});

test("unresolved source tokens fail closed and the affected paragraph is excluded", () => {
  const result = workspace("complete_research_report");
  result.draft.sections = result.draft.sections.map((section) => section.sectionId === "literature_review"
    ? { ...section, body: "這是無法解析的來源聲稱 {s99}。", synthesizedProseZhTw: "這是無法解析的來源聲稱 {s99}。" }
    : section);
  const document = buildFormalReportDocument(result);

  assert.equal(document.integrity.status, "blocked");
  assert.deepEqual(document.integrity.unknownCitationTokens, ["{s99}"]);
  assert.ok(document.integrity.excludedParagraphs >= 1);
  assert.doesNotMatch(formalReportDocumentReaderText(document), /s99/iu);
});

test("Markdown, DOCX, and print HTML consume the same formal document", async () => {
  const result = workspace("limited_evidence_brief");
  const report = rendererFixtureReport(result);
  const markdown = buildMarkdown(report, result.input);
  const html = buildPrintHtml(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docx = await buildDocxBlob(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string") ?? "";

  for (const output of [markdown, html, documentXml]) {
    assert.match(output, /研究問題與核心回答/u);
    assert.match(output, /參考文獻/u);
    assert.match(output, /結論/u);
    assert.match(output, /研究問題四要素的證據覆蓋與交集/u);
    assert.match(output, /Chen, 2024/u);
    assert.doesNotMatch(output, /\[\d+\]/u);
    assert.doesNotMatch(output, /\[S\d+\]|\{s\d+\}|source_\d+|citation_\d+/iu);
  }
  assert.match(markdown, /附錄：來源治理與逐來源核對/u);
  assert.match(markdown, /\| 來源 \| 研究脈絡／資料層級/u);
  assert.match(html, /class="rf-table"/u);
  assert.match(documentXml, /<w:tbl>/u);
});

test("docx_pdf_preview_content_parity", async () => {
  const result = archivedShortVideoSleepWorkspace();
  result.generationPayload.reportPlan = {
    ...result.generationPayload.reportPlan!,
    title: "短影音使用與高中生睡眠品質",
    originalTitle: "Short-form video use and sleep quality among high school students",
    titleLanguage: "zh-TW",
    keywords: ["短影音", "高中生", "睡眠品質", "社交焦慮", "證據綜合"],
  };
  const report = rendererFixtureReport(result);
  const document = report.meta.formalReportDocument!;
  const preview = buildDetailedReportParagraphs(result);
  const markdown = buildMarkdown(report, result.input);
  const html = buildPrintHtml(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docx = await buildDocxBlob(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string") ?? "";

  assert.equal(document.metadata.title, "短影音使用與高中生睡眠品質");
  assert.equal(document.metadata.subtitle, "Short-form video use and sleep quality among high school students");
  assert.deepEqual(document.abstract.keywords, ["短影音", "高中生", "睡眠品質", "社交焦慮", "證據綜合", "證據綜合"].filter((value, index, all) => all.indexOf(value) === index));

  const canonicalTokens = formalReportSectionSequence(document).flatMap((section) => [
    section.title,
    ...formalReportSectionContent(section).flatMap((node) =>
      node.nodeType === "figure" ? [node.figure.title]
        : node.nodeType === "table" ? [node.table.title]
          : [],
    ),
  ]);
  const previewTokens = preview.flatMap((paragraph) => [
    paragraph.title,
    ...(paragraph.orderedContent ?? []).flatMap((node) =>
      node.nodeType === "figure" ? [node.figure.title]
        : node.nodeType === "table" ? [node.table.title]
          : [],
    ),
  ]);
  assert.deepEqual(previewTokens, canonicalTokens);

  for (const output of [markdown, html, documentXml]) {
    let cursor = -1;
    for (const token of canonicalTokens) {
      const next = output.indexOf(token, cursor + 1);
      assert.ok(next > cursor, `canonical token must preserve order: ${token}`);
      cursor = next;
    }
    assert.match(output, /短影音使用與高中生睡眠品質/u);
    assert.match(output, /Short-form video use and sleep quality among high school students/u);
    assert.match(output, /關鍵詞：短影音、高中生、睡眠品質、社交焦慮、證據綜合/u);
  }
  assert.match(html, /p\.narrative \{ text-indent:2em; \}/u);
  assert.match(documentXml, /<w:ind w:firstLine="440"\/>/u);
});

test("six semantic visual families render from semanticData in HTML and DOCX", async () => {
  const result = archivedShortVideoSleepWorkspace();
  const report = rendererFixtureReport(result);
  const html = buildPrintHtml(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docx = await buildDocxBlob(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string") ?? "";
  const pngMedia = Object.keys(zip.files).filter((path) => /^word\/media\/[^/]+\.png$/u.test(path));

  assert.equal(pngMedia.length, 6, "DOCX must embed one deterministic PNG drawing per semantic visual");
  assert.equal((documentXml.match(/<w:drawing>/gu) ?? []).length, 6);
  assert.equal((documentXml.match(/圖形資料：/gu) ?? []).length, 6);
  assert.doesNotMatch(documentXml, /可核對的圖形資料（文字 fallback）/u);
  const semanticVisualRows = [
    "獨立面板",
    "95% 區間",
    "相關結構",
    "中介路徑",
    "證據範圍",
    "適用群體／情境",
  ];
  assert.ok(
    semanticVisualRows.every((label) => !new RegExp(`<w:t[^>]*>${label}</w:t>`, "u").test(documentXml)),
    "semantic drawings must not reappear as six extra body tables",
  );
  for (const path of pngMedia) {
    const bytes = await zip.file(path)!.async("uint8array");
    assert.ok(bytes.byteLength > 10_000, `${path} must be a rendered geometric fallback, not a 1x1 placeholder`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.ok(view.getUint32(16, false) > 100);
    assert.ok(view.getUint32(20, false) > 50);
  }

  for (const semanticClass of [
    "rf-semantic-table",
    "rf-proportion-panels",
    "rf-forest",
    "rf-semantic-graph",
  ]) {
    assert.match(html, new RegExp(`class="${semanticClass}"`, "u"));
  }
  for (const semanticText of [
    "證據範圍",
    "相關係數保留為 r",
    "各面板保留原研究",
    "OR 以 1 為基準線",
    "圖中省略未能完整核對的係數",
    "適用群體／情境",
  ]) {
    assert.match(html, new RegExp(semanticText, "u"));
  }
  for (const semanticText of [
    "圖形資料：",
    "相關係數保留為 r",
    "各面板保留原研究",
    "OR 以 1 為基準線",
    "圖中省略未能完整核對的係數",
    "各群體僅顯示證據可適用邊界",
  ]) assert.match(documentXml, new RegExp(semanticText, "u"));
});

test("unsupported location and method claims are excluded instead of reassigned to a nearby source", () => {
  const result = workspace("complete_research_report");
  result.draft.sections = result.draft.sections.map((section) => section.sectionId === "introduction"
    ? {
        ...section,
        body: "印度校園案例以 UAV 與 ENVI-met 證明綠覆率固定降低 8°C [S1]。",
        synthesizedProseZhTw: "印度校園案例以 UAV 與 ENVI-met 證明綠覆率固定降低 8°C [S1]。",
        citationIds: ["source-1"],
        supportingSourceIds: ["source-1"],
      }
    : section);
  const document = buildFormalReportDocument(result);
  const readerText = formalReportDocumentReaderText(document);

  assert.doesNotMatch(readerText, /印度|UAV|ENVI-met|8°C/u);
  assert.ok(document.integrity.citationMappingIssues.some((issue) =>
    /unsupported_(?:citation|number|location|method)/u.test(issue),
  ));
});

test("complete DOCX uses a readable static TOC, page fields, and DOI hyperlinks", async () => {
  const result = workspace("complete_research_report");
  const report = workspaceToGeneratedReport(result);
  const html = buildPrintHtml(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const blob = await buildDocxBlob(report, result.input, DEFAULT_REPORT_PRESENTATION);
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string") ?? "";
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("string") ?? "";
  const footerXml = await zip.file("word/footer1.xml")?.async("string") ?? "";

  assert.doesNotMatch(documentXml, /TOC \\h \\o/u);
  assert.match(documentXml, />01　摘要與關鍵詞</u);
  assert.match(documentXml, />09　參考文獻</u);
  assert.match(relationshipsXml, /Target="https:\/\/doi\.org\/10\.1000\/formal-1"/u);
  assert.match(footerXml, />PAGE</u);
  assert.match(footerXml, />NUMPAGES</u);
  assert.match(html, /href="#rf-section-1"/u);
  assert.match(html, /class="doi-link" href="https:\/\/doi\.org\/10\.1000\/formal-1"/u);
});

test("directness counts use canonical facts and source-card drift blocks integrity", () => {
  const result = workspace("limited_evidence_brief");
  result.acceptedSources[0]!.researchDirectnessTier = "A";
  result.evidenceCards = result.evidenceCards.map((card) => card.sourceId === "source-1"
    ? { ...card, evidenceDirectnessTier: "B" as const }
    : card);

  const document = buildFormalReportDocument(result);
  const readerText = formalReportDocumentReaderText(document);
  assert.match(readerText, /A 級直接證據 0 筆、B 級近直接證據 1 筆/u);
  assert.equal(document.integrity.status, "blocked");
  assert.ok(document.integrity.factIssues.some((issue) =>
    issue === "directness_classification_drift:source-1:source=A:fact=B"
  ));
});

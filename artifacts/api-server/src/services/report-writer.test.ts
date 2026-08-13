import assert from "node:assert/strict";
import test from "node:test";
import type { ReportPlan } from "@workspace/api-zod";
import type { SourceRecord } from "@workspace/api-zod/source-record";
import { canonicalizeCitationMarkersInText } from "./citation-markers";
import {
  auditDocumentEditorialPass,
  auditClaimCitationEntailment,
  detectSourceEchoIssues,
  forbiddenInstructionTextMatches,
  paragraphClaimsForSection,
  validateTeachBackOutput,
  writeReportWithLlm,
  type ReportWriterEvidenceCard,
  type ReportWriterSection,
} from "./report-writer";

process.env.SCHOOL_LLM_RATE_LIMIT_MAX ??= "1000";

function editorialSection(prose: string): ReportWriterSection {
  return {
    sectionId: "discussion",
    title: "討論",
    prose,
    evidenceCardIds: ["evidence-1", "evidence-2"],
    citationIds: ["source-1", "source-2"],
  };
}

test("document editorial audit accepts flow edits but locks citations and protected facts", () => {
  const before = [editorialSection("研究 A 於 2024 年使用 Landsat-8，結果顯示綠覆與較低地表溫度相關[S1]。研究 B 的校園觀察則指出此關聯受鋪面影響[S2]。")];
  const improved = [editorialSection("研究 A 於 2024 年使用 Landsat-8，結果顯示綠覆與較低地表溫度相關[S1]；相較之下，研究 B 的校園觀察指出此關聯仍受鋪面影響[S2]。")];
  assert.deepEqual(auditDocumentEditorialPass(before, improved), { passed: true, issues: [] });

  const citationChanged = [editorialSection("研究 A 於 2024 年使用 Landsat-8，結果顯示綠覆與較低地表溫度相關[S2]。研究 B 的校園觀察則指出此關聯受鋪面影響[S1]。")];
  assert.equal(auditDocumentEditorialPass(before, citationChanged).passed, false);

  const factAdded = [editorialSection("研究 A 於 2024 年使用 Landsat-8，結果顯示綠覆與較低地表溫度相關 8%[S1]。研究 B 的校園觀察則指出此關聯受鋪面影響[S2]。")];
  assert.equal(auditDocumentEditorialPass(before, factAdded).passed, false);

  const factRemoved = [editorialSection("研究 A 使用 Landsat-8，結果顯示綠覆與較低地表溫度相關[S1]。研究 B 的校園觀察則指出此關聯受鋪面影響[S2]。")];
  assert.equal(auditDocumentEditorialPass(before, factRemoved).passed, false);

  const templateAdded = [editorialSection("第一項發現是：研究 A 於 2024 年使用 Landsat-8，結果顯示綠覆與較低地表溫度相關[S1]。研究 B 的校園觀察則指出此關聯受鋪面影響[S2]。")];
  assert.equal(auditDocumentEditorialPass(before, templateAdded).passed, false);
});

test("document editorial audit requires repetition to improve before reporting applied", () => {
  const repeated = [editorialSection([
    "2024年針對1236人的橫斷式研究顯示，短影音使用與較差睡眠品質呈具條件性的關聯[S1]。",
    "換言之，2024年同一項1236人的橫斷式研究亦指出，短影音暴露和較差睡眠品質具有受限關聯[S2]。",
    "橫斷式研究不能證明因果。",
  ].join(""))];
  const repetitionUnchanged = [editorialSection([
    "2024年針對1236人的橫斷式研究顯示，短影音使用與較差睡眠品質呈具條件性的關聯[S1]。",
    "換言之，2024年同一項1236人的橫斷式研究亦指出，短影音暴露和較差睡眠品質具有受限關聯[S2]。",
    "橫斷式研究只能支持關聯解讀。",
  ].join(""))];
  const unchangedAudit = auditDocumentEditorialPass(repeated, repetitionUnchanged);
  assert.equal(unchangedAudit.passed, false);
  assert.ok(unchangedAudit.issues.some((issue) =>
    issue.startsWith("document_repetition_not_improved:")
  ));

  const repetitionRemoved = [editorialSection([
    "2024年針對1236人的橫斷式研究顯示，短影音使用與較差睡眠品質呈具條件性的關聯[S1][S2]。",
    "橫斷式研究不能證明因果。",
  ].join(""))];
  assert.deepEqual(auditDocumentEditorialPass(repeated, repetitionRemoved), {
    passed: true,
    issues: [],
  });
});

function source(index: number, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: `source-${index}`,
    title: `薯條營養研究 ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "此來源討論薯條的營養成分、鈉含量、油炸條件與食品安全風險，摘要足以支撐報告段落。",
    doi: `10.1000/fries-${index}`,
    url: `https://doi.org/10.1000/fries-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    relevanceLevel: index === 1 ? "primary" : "secondary",
    evidenceGrounding: "abstract_grounded",
    ...overrides,
  };
}

function knowledgePlan(): ReportPlan {
  return {
    workflowId: "writer-safe",
    topicHash: "safe-topic",
    title: "高中生短影音使用與睡眠品質的關聯",
    originalTitle: "Short-form video use and sleep quality among high school students",
    titleLanguage: "zh-TW",
    researchQuestion: "高中生短影音使用與睡眠品質有何關聯？",
    sections: [{
      sectionId: "findings",
      title: "主要發現",
      goal: "綜合主要發現",
      requiredEvidenceTypes: ["finding"],
      evidenceCardIds: ["evidence-1"],
      plannedClaimIds: ["planned-1"],
    }],
    plannedClaims: [{
      claimId: "planned-1",
      claimText: "短影音使用與較差睡眠品質呈具條件性的關聯。",
      sectionId: "findings",
      supportingEvidenceIds: ["evidence-1"],
      supportingSourceKeys: ["source-1"],
      evidenceStrength: "moderate",
      scope: "abstract_only_supported",
      limitations: ["橫斷式研究不能證明因果。"],
      agreementStatus: "single_source",
      allowedCitationKeys: ["source-1"],
      wordingStrength: "tentative",
      normalizedFactIds: ["fact-1"],
      synthesisClusterIds: ["cluster-1"],
      claimGraphId: "claim-1",
    }],
    evidenceGaps: [],
    normalizedFacts: [{
      factId: "fact-1",
      evidenceId: "evidence-1",
      sourceId: "source-1",
      canonicalSourceId: "source-1",
      sourceType: "journal_article",
      evidenceLevel: "direct",
      sourceAccessLevel: "complete_abstract",
      sectionType: "abstract",
      claimTextZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
      population: "高中生",
      ageGroup: "高中生",
      sampleSize: 1236,
      geography: null,
      studySetting: null,
      studyDesign: "橫斷式研究",
      exposureConcept: "短影音使用",
      exposureMeasure: null,
      outcomeConcept: "睡眠品質分數",
      outcomeMeasure: null,
      statisticType: "odds_ratio",
      value: 1.33,
      lowerCI: 1.01,
      upperCI: 1.77,
      pValue: null,
      unit: "OR",
      direction: "positive",
      mediator: null,
      moderator: null,
      confounders: null,
      adjustmentStatus: null,
      evidenceDirectness: "A",
      sourceSpan: "RAW_SUPPORT_SPAN_SECRET",
      certainty: "高",
      confidence: 0.8,
      authorInterpretation: null,
      authorLimitations: null,
      extractionConfidence: 0.8,
      verificationStatus: "verified",
      evidenceFunction: "support",
      location: null,
      setting: null,
      exposure: "短影音使用",
      outcome: "睡眠品質分數",
      method: "橫斷式研究",
      numericalResults: [{ rawText: "RAW_NUMERIC_SENTENCE_SECRET", measure: "OR", value: 1.33, unit: "OR", statisticType: "odds_ratio", lowerCI: 1.01, upperCI: 1.77, pValue: null, uncertainty: null }],
      associationDirection: "positive",
      uncertainty: "橫斷式研究不能證明因果。",
      directness: "A",
      applicability: "高中生",
      locator: "abstract",
      themeKey: "relationship:short_video:sleep_quality",
      conceptAxes: ["exposure:short_video", "outcome:sleep_quality"],
      comparabilityKey: "population=high_school|exposure=short_video|outcome=sleep_quality",
      limitations: ["橫斷式研究不能證明因果。"],
      supportingEvidenceIds: ["evidence-1"],
      supportingSourceIds: ["source-1"],
      writerEligible: true,
    }],
    synthesisClusters: [{
      clusterId: "cluster-1",
      clusterPurpose: "relationship",
      themeKey: "relationship:short_video:sleep_quality",
      label: "短影音與睡眠品質",
      conceptAxes: ["exposure:short_video", "outcome:sleep_quality"],
      factIds: ["fact-1"],
      evidenceIds: ["evidence-1"],
      sourceIds: ["source-1"],
      sharedFindingZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
      agreementStatus: "single_source",
      associationDirections: ["positive"],
      comparabilityKeys: ["population=high_school|exposure=short_video|outcome=sleep_quality"],
      numericAggregationAllowed: false,
      comparabilityStatus: "not_comparable",
      comparabilityReasons: ["single_source_only"],
      conflictPoints: [],
      limitations: ["橫斷式研究不能證明因果。"],
    }],
    claimGraph: {
      researchQuestion: "高中生短影音使用與睡眠品質有何關聯？",
      claims: [{
        claimId: "claim-1",
        claimType: "direct_result",
        readerFacingStatement: "短影音使用與較差睡眠品質呈具條件性的關聯。",
        supportingFacts: ["fact-1"],
        contradictingFacts: [],
        backgroundFacts: [],
        applicability: ["高中生"],
        confidence: 0.8,
        citationIds: ["source-1"],
        statisticalInterpretationIds: ["stat-1"],
        visualizable: true,
        visualId: "visual-1",
        evidenceDirectness: "A",
        limitations: ["橫斷式研究不能證明因果。"],
      }],
      edges: [],
    },
    knowledgeModel: {
      researchQuestion: "高中生短影音使用與睡眠品質有何關聯？",
      nodes: [
        { nodeId: "concept-exposure", nodeType: "exposure", normalizedLabel: "短影音使用", aliases: ["短影音使用"], supportingFactIds: ["fact-1"] },
        { nodeId: "concept-outcome", nodeType: "outcome", normalizedLabel: "睡眠品質", aliases: ["睡眠品質分數"], supportingFactIds: ["fact-1"] },
      ],
      edges: [{
        edgeId: "relation-1",
        fromNodeId: "concept-exposure",
        toNodeId: "concept-outcome",
        relationshipType: "association",
        supportingFactIds: ["fact-1"],
        contradictingFactIds: [],
        evidenceBasis: "statistical_association",
        evidenceStrength: "weak",
        applicablePopulations: ["高中生"],
        applicableSettings: [],
        causalInterpretationAllowed: false,
        uncertainty: ["橫斷研究無法確認時間先後。"],
      }],
      evidenceGaps: ["缺少縱貫追蹤。"],
    },
    heterogeneityAnalysis: {
      comparisons: [],
      dominantDifferenceSources: [],
      synthesisBoundary: "單一來源不得宣稱跨研究共識。",
    },
    statisticalInterpretations: [{
      interpretationId: "stat-1",
      factId: "fact-1",
      sourceId: "source-1",
      statisticType: "odds_ratio",
      technicalExplanation: "勝算比為 1.33，它不等同風險增加百分比。",
      readerExplanation: "這是勝算的相對差異，不是風險增加 33%。",
      supportedConclusion: "可描述該樣本的關聯方向。",
      unsupportedConclusion: "不能宣稱因果。",
      causalInterpretationAllowed: false,
      visualizable: true,
      recommendedVisual: "forest_plot",
      nullValue: 1,
      precisionStatus: "precise",
      crossStudyComparability: "NOT_COMPARABLE",
      warnings: ["勝算比不得改寫為風險增加百分比。"],
    }],
    contradictionAnalysis: [{
      claimId: "claim-1",
      status: "single_source",
      supportingFactIds: ["fact-1"],
      counterFactIds: [],
      nullFactIds: [],
      primaryExplanation: "目前只有單一來源。",
      alternativeExplanations: ["反向因果仍無法排除。"],
      unresolvedPossibilities: ["未控制混雜因素。"],
      discriminatingStudy: "縱貫且充分調整混雜的多地點研究。",
    }],
    audienceProfile: {
      profileId: "high_school_report",
      terminologyExplanation: "guided",
      sentenceLength: "medium",
      statisticalDetail: "foundational",
      methodDepth: "foundational",
      visualComplexity: "guided",
      citationDensity: "moderate",
      limitationDepth: "explained",
      includePracticalRecommendations: true,
      showEvidenceGrades: false,
      summaryTargetWords: 280,
      bodyTargetWords: 2800,
    },
    reportArchetype: {
      archetypeId: "limited_evidence_report",
      questionType: "research_inventory",
      rationale: "全文證據不足，誠實降級。",
      sectionBlueprint: ["研究問題", "可核對證據", "限制"],
      evidenceRequirements: ["至少一筆可追溯事實"],
      visualRequirements: ["證據缺口圖"],
      comparisonMethod: "只比較方向。",
      conclusionForm: "說明能回答與不能回答的部分。",
      minimumConditionsMet: false,
      downgradedFrom: "literature_review",
    },
    narrativePasses: [
      { pass: "teach_back", objective: "理解關係", inputClaimIds: ["claim-1"], inputFactIds: ["fact-1"], outputConstraints: ["不按來源順序"], citationMode: "deferred" },
      { pass: "academic_reconstruction", objective: "重建論證", inputClaimIds: ["claim-1"], inputFactIds: ["fact-1"], outputConstraints: ["精確引用"], citationMode: "claim_entailment" },
    ],
  };
}

test("report writer sends canonical facts and source identities to the LLM and returns formal Chinese sections", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      reportType: "研究報告",
      audience: "高中",
      language: "繁體中文",
      generationMode: "preliminary",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        assert.equal(request.model, "test-model");
        const userMessage = request.messages.find(
          (message: { role: string }) => message.role === "user",
        );
        assert.match(userMessage.content, /薯條/);
        assert.match(userMessage.content, /synthesis-evidence-packet\/v2/u);
        assert.match(userMessage.content, /"sourceIdentityColumns":\["sourceId","canonicalSourceIdentity","authors","year"\]/u);
        assert.match(userMessage.content, /\["Ada Lovelace"\],2024/u);
        assert.match(userMessage.content, /"normalizedFacts":/u);
        assert.doesNotMatch(userMessage.content, /Baseline sections|Normalized report input/u);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本初步報告根據已接受來源整理薯條的營養、鈉含量與食品安全議題，並明確標示主要來源仍需補強[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究背景與問題意識",
                        prose:
                          "薯條作為常見速食配餐，可從熱量、脂肪、鈉含量與油炸加工條件切入，適合以食品標示與公共衛生資料進行保守分析[S1][S2]。",
                        evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0"],
                        citationIds: ["source-1", "source-2"],
                      },
                      {
                        sectionId: "findings",
                        title: "三、主要發現",
                        prose:
                          "目前來源可支持薯條營養成分與油炸風險的初步討論，但仍不足以推出精確攝取量或因果結論[S2][S3]。",
                        evidenceCardIds: ["evidence:source-2:0", "evidence:source-3:0"],
                        citationIds: ["source-2", "source-3"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.llm_status, "success");
  assert.equal(result.fallback_used, false);
  assert.equal(result.reportGenerationProvider, "openai-compatible");
  assert.equal(result.reportGenerationModel, "test-model");
  assert.equal(result.reportGenerationStatus, "success");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.sections.length, 9);
  assert.equal(
    result.sections.every((section) => {
      const paragraphs = section.prose.split(/\n{2,}/u).filter(Boolean);
      return paragraphs.length >= 2 && paragraphs.length <= 4 &&
        section.paragraphClaims?.length === paragraphs.length;
    }),
    true,
  );
  assert.match(result.sections[0]?.prose ?? "", /初步報告/);
  assert.deepEqual(
    result.sections.map((section) => section.sectionId),
    [
      "abstract",
      "introduction",
      "research_question",
      "literature_review",
      "methodology",
      "findings",
      "discussion",
      "limitations",
      "conclusion",
    ],
  );
  assert.match(
    result.sections.find((section) => section.sectionId === "methodology")?.prose ?? "",
    /已納入且可追溯的資料/u,
  );
  assert.doesNotMatch(
    result.sections.map((section) => section.prose).join("\n"),
    /\bevidence[_\s-]*cards?\b|\bmetadata(?:[_\s-]*only)?\b|\bpeer[_\s-]*reviewed[_\s-]*evidence\b|\baccepted[_\s-]*sources?\b|\bacceptedSourceCount\b|\bprovider(?:[_\s-]*status)?\b|\bprompt(?:[_\s-]*payload)?\b|\b(?:evidenceIds?|evidenceCardIds?|citationIds?|supportSpans?|workflowId|jobId|topicHash)\b|已接受來源|證據卡|同儕審查證據|來源供應商|提示詞/iu,
  );
});

test("writer_does_not_receive_raw_abstracts", async () => {
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const evidenceCard: ReportWriterEvidenceCard = {
    id: "evidence-1",
    evidenceId: "evidence-1",
    sourceId: "source-1",
    canonicalSourceKey: "source-1",
    citationKey: "source-1",
    claim: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    claimTextZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    evidence: "RAW_EVIDENCE_SECRET",
    summary: "短影音使用與睡眠品質的正規化摘要。",
    relevance: "短影音與睡眠品質",
    sourceTitle: "RAW_SOURCE_TITLE_SECRET",
    sourceProvider: "OpenAlex",
    year: 2025,
    usableSections: ["findings"],
    citationText: "[S1]",
    citationMarker: "[S1]",
    limitation: "橫斷式研究不能證明因果。",
    supportSpan: "RAW_SUPPORT_SPAN_SECRET HIDDEN_LONG_SOURCE_ORDER_FINGERPRINT",
    abstract: "RAW_ABSTRACT_SECRET",
    exactResult: "RAW_EXACT_RESULT_SECRET OR=1.33",
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
    evidenceDirectnessTier: "A",
  };
  const result = await writeReportWithLlm(
    {
      topic: "高中生短影音使用與睡眠品質",
      acceptedSources: [source(1, { id: "source-1", abstract: "RAW_ABSTRACT_SECRET" })],
      evidenceCards: [evidenceCard],
      requestedSectionIds: ["findings"],
      reportPlan: knowledgePlan(),
    },
    {
      llm: { baseUrl: "https://llm.example/v1", model: "test-model", apiKey: "test-key" },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        requests.push(request);
        const system = request.messages.find((message) => message.role === "system")?.content ?? "";
        const content = /teach-back reasoner/u.test(system)
          ? JSON.stringify({ sectionUnderstandings: [{ sectionId: "global_synthesis", teachBack: "暴露與睡眠結果存在受限關聯，且不能由橫斷資料推論因果。" }] })
          : JSON.stringify({ sections: [{
              sectionId: "findings",
              title: "主要發現",
              prose: "現有事實支持短影音使用與較差睡眠品質之間存在受限關聯。\n\n由於研究設計為橫斷式，結果不能解釋為因果效果。",
              evidenceCardIds: ["evidence-1"],
              citationIds: ["source-1"],
            }] });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      },
    },
  );

  assert.equal(result.ok, true);
  assert.ok(requests.length >= 2);
  const teachBackPayload = requests[0]!.messages.map((message) => message.content).join("\n");
  const reconstructionPayload = requests[1]!.messages.map((message) => message.content).join("\n");
  assert.match(teachBackPayload, /teach-back-packet\/v1/u);
  assert.doesNotMatch(teachBackPayload, /sourceIdentityRegistry|citationIds|authors|sourceId|evidenceId/u);
  assert.match(reconstructionPayload, /Validated teach-back to reconstruct academically/u);
  assert.match(reconstructionPayload, /"reportIntelligence"/u);
  assert.match(reconstructionPayload, /"audienceProfile"/u);
  assert.match(reconstructionPayload, /"statisticalInterpretations"/u);
  assert.match(reconstructionPayload, /"heterogeneity"/u);
  assert.match(reconstructionPayload, /"contradictions"/u);
  assert.match(reconstructionPayload, /"knowledgeModel"/u);
  assert.equal(
    (reconstructionPayload.match(/"claimGraph"/gu) ?? []).length,
    1,
    "academic reconstruction receives one scoped claim graph, not duplicated full-plan copies",
  );
  assert.ok(
    reconstructionPayload.length < 30_000,
    `scoped reconstruction fixture unexpectedly expanded to ${reconstructionPayload.length} characters`,
  );
  for (const payload of [teachBackPayload, reconstructionPayload]) {
    assert.doesNotMatch(payload, /RAW_ABSTRACT_SECRET|RAW_SUPPORT_SPAN_SECRET|HIDDEN_LONG_SOURCE_ORDER_FINGERPRINT|RAW_EXACT_RESULT_SECRET|RAW_NUMERIC_SENTENCE_SECRET|RAW_SOURCE_TITLE_SECRET/u);
    assert.doesNotMatch(payload, /"(?:sourceSpan|rawText|supportSpan|abstract|snippet)"\s*:/u);
  }
});

test("canonical prompt packets preserve more than six identity and evidence bindings", async () => {
  const bindingCount = 8;
  const indexes = Array.from({ length: bindingCount }, (_, index) => index + 1);
  const factIds = indexes.map((index) => `fact-${index}`);
  const evidenceIds = indexes.map((index) => `evidence-${index}`);
  const sourceIds = indexes.map((index) => `source-${index}`);
  const graphClaimIds = indexes.map((index) => `claim-${index}`);
  const plannedClaimIds = indexes.map((index) => `planned-${index}`);
  const plan = knowledgePlan();
  const baseFact = plan.normalizedFacts![0]!;
  const baseCluster = plan.synthesisClusters![0]!;
  const baseGraphClaim = plan.claimGraph!.claims[0]!;
  const basePlannedClaim = plan.plannedClaims[0]!;

  plan.sections = [{
    ...plan.sections[0]!,
    sectionId: "literature_review",
    title: "文獻探討",
    evidenceCardIds: evidenceIds,
    plannedClaimIds,
  }];
  plan.normalizedFacts = indexes.map((index) => ({
    ...baseFact,
    factId: `fact-${index}`,
    evidenceId: `evidence-${index}`,
    sourceId: `source-${index}`,
    canonicalSourceId: `source-${index}`,
    supportingEvidenceIds: index === 1 ? evidenceIds : [`evidence-${index}`],
    supportingSourceIds: index === 1 ? sourceIds : [`source-${index}`],
  }));
  plan.synthesisClusters = [{
    ...baseCluster,
    factIds,
    evidenceIds,
    sourceIds,
  }];
  plan.claimGraph = {
    ...plan.claimGraph!,
    claims: indexes.map((index) => ({
      ...baseGraphClaim,
      claimId: `claim-${index}`,
      supportingFacts: index === 1 ? factIds : [`fact-${index}`],
      contradictingFacts: index === 1 ? factIds : [],
      backgroundFacts: index === 1 ? factIds : [],
      citationIds: index === 1 ? sourceIds : [`source-${index}`],
    })),
    edges: indexes.map((index) => ({
      fromClaimId: `claim-${index}`,
      toClaimId: `claim-${index === bindingCount ? 1 : index + 1}`,
      relationship: "qualifies" as const,
    })),
  };
  plan.plannedClaims = indexes.map((index) => ({
    ...basePlannedClaim,
    claimId: `planned-${index}`,
    claimGraphId: `claim-${index}`,
    sectionId: "literature_review",
    supportingEvidenceIds: index === 1 ? evidenceIds : [`evidence-${index}`],
    supportingSourceKeys: index === 1 ? sourceIds : [`source-${index}`],
    allowedCitationKeys: index === 1 ? sourceIds : [`source-${index}`],
    normalizedFactIds: index === 1 ? factIds : [`fact-${index}`],
  }));
  plan.narrativePasses = [
    {
      pass: "teach_back",
      objective: "理解完整關係圖",
      inputClaimIds: graphClaimIds,
      inputFactIds: factIds,
      outputConstraints: ["不按來源順序"],
      citationMode: "deferred",
    },
    {
      pass: "academic_reconstruction",
      objective: "依完整綁定重建論證",
      inputClaimIds: graphClaimIds,
      inputFactIds: factIds,
      outputConstraints: ["精確引用"],
      citationMode: "claim_entailment",
    },
  ];

  const evidenceCards: ReportWriterEvidenceCard[] = indexes.map((index) => ({
    id: `evidence-${index}`,
    evidenceId: `evidence-${index}`,
    sourceId: `source-${index}`,
    canonicalSourceKey: `source-${index}`,
    citationKey: `source-${index}`,
    claimIds: [`planned-${index}`],
    claim: "短影音使用與睡眠品質呈現受限關聯。",
    claimTextZhTw: "短影音使用與睡眠品質呈現受限關聯。",
    evidence: `RAW_EVIDENCE_SECRET_${index}`,
    summary: `CARD_SUMMARY_SECRET_${index}`,
    relevance: "短影音與睡眠品質",
    sourceTitle: `RAW_SOURCE_TITLE_SECRET_${index}`,
    sourceProvider: "OpenAlex",
    year: 2025,
    usableSections: ["literature_review"],
    citationText: `[S${index}]`,
    citationMarker: `[S${index}]`,
    limitation: "橫斷式研究不能證明因果。",
    supportSpan: `RAW_SUPPORT_SPAN_SECRET_${index}`,
    abstract: `RAW_ABSTRACT_SECRET_${index}`,
    exactResult: `RAW_EXACT_RESULT_SECRET_${index}`,
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
    evidenceDirectnessTier: "A",
  }));
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  await writeReportWithLlm({
    topic: "高中生短影音使用與睡眠品質",
    acceptedSources: indexes.map((index) => source(index, {
      id: `source-${index}`,
      title: `RAW_SOURCE_TITLE_SECRET_${index}`,
      abstract: `RAW_ABSTRACT_SECRET_${index}`,
    })),
    evidenceCards,
    requestedSectionIds: ["literature_review"],
    reportPlan: plan,
  }, {
    llm: { baseUrl: "https://llm.example/v1", model: "test-model", apiKey: "test-key" },
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      requests.push(request);
      const system = request.messages.find((message) => message.role === "system")?.content ?? "";
      const content = /teach-back reasoner/u.test(system)
        ? JSON.stringify({ sectionUnderstandings: [{
            sectionId: "global_synthesis",
            teachBack: "多項事實共同顯示暴露與睡眠結果存在受限關聯，差異、機制與適用邊界仍須一併解釋。",
          }] })
        : JSON.stringify({ sections: [{
            sectionId: "literature_review",
            title: "文獻探討",
            prose: "現有事實共同支持短影音使用與睡眠品質之間存在受限關聯。\n\n由於資料為橫斷式，關聯方向仍不能解釋為因果效果。",
            evidenceCardIds: evidenceIds,
            citationIds: sourceIds,
          }] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    },
  });

  assert.ok(requests.length >= 2);
  const userContent = (requestIndex: number) =>
    requests[requestIndex]!.messages.find((message) => message.role === "user")?.content ?? "";
  const parsePacketAfter = (content: string, marker: string): Record<string, unknown> => {
    const markerIndex = content.indexOf(marker);
    assert.notEqual(markerIndex, -1, `missing packet marker: ${marker}`);
    return JSON.parse(content.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
  };
  const rowAsRecord = (columns: unknown, row: unknown): Record<string, unknown> => {
    assert.ok(Array.isArray(columns));
    assert.ok(Array.isArray(row));
    return Object.fromEntries(columns.map((column, index) => [String(column), row[index]]));
  };

  const teachBackPayload = userContent(0);
  const reconstructionPayload = userContent(1);
  const teachBackPacket = parsePacketAfter(teachBackPayload, "De-identified knowledge packet:");
  const teachBackGraph = teachBackPacket.claimGraph as Record<string, unknown>;
  const teachBackClaims = teachBackGraph.claims as unknown[];
  const teachBackFirstClaim = rowAsRecord(
    teachBackGraph.claimColumns,
    teachBackClaims[0],
  );
  assert.equal((teachBackPacket.normalizedFacts as unknown[]).length, bindingCount);
  assert.equal(teachBackClaims.length, bindingCount);
  assert.deepEqual(teachBackFirstClaim.supportingFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.deepEqual(teachBackFirstClaim.contradictingFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.deepEqual(teachBackFirstClaim.backgroundFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.equal((teachBackGraph.edges as unknown[]).length, bindingCount);
  assert.deepEqual(
    (teachBackPacket.narrativePass as Record<string, unknown>).inputClaimRefs,
    graphClaimIds.map((_, index) => `C${index + 1}`),
  );
  assert.deepEqual(
    (teachBackPacket.narrativePass as Record<string, unknown>).inputFactRefs,
    factIds.map((_, index) => `F${index + 1}`),
  );

  const reconstructionPacket = parsePacketAfter(
    reconstructionPayload,
    "Canonical thematic synthesis packet (facts, clusters, claim bindings, and source identity registry):",
  );
  const reconstructionGraph = reconstructionPacket.claimGraph as Record<string, unknown>;
  const reconstructionFirstClaim = rowAsRecord(
    reconstructionGraph.claimColumns,
    (reconstructionGraph.claims as unknown[])[0],
  );
  const reconstructionFirstFact = rowAsRecord(
    reconstructionPacket.factColumns,
    (reconstructionPacket.normalizedFacts as unknown[])[0],
  );
  const reconstructionFirstCluster = rowAsRecord(
    reconstructionPacket.clusterColumns,
    (reconstructionPacket.synthesisClusters as unknown[])[0],
  );
  const reconstructionFirstPlannedClaim = rowAsRecord(
    reconstructionPacket.plannedClaimColumns,
    (reconstructionPacket.plannedClaims as unknown[])[0],
  );
  assert.deepEqual(reconstructionFirstFact.supportingEvidenceIds, evidenceIds);
  assert.deepEqual(reconstructionFirstFact.supportingSourceIds, sourceIds);
  assert.deepEqual(reconstructionFirstClaim.supportingFactRefs, factIds);
  assert.deepEqual(reconstructionFirstClaim.contradictingFactRefs, factIds);
  assert.deepEqual(reconstructionFirstClaim.backgroundFactRefs, factIds);
  assert.deepEqual(reconstructionFirstClaim.citationIds, sourceIds);
  assert.deepEqual(reconstructionFirstCluster.factIds, factIds);
  assert.deepEqual(reconstructionFirstCluster.evidenceIds, evidenceIds);
  assert.deepEqual(reconstructionFirstCluster.sourceIds, sourceIds);
  assert.deepEqual(reconstructionFirstPlannedClaim.factIds, factIds);
  assert.deepEqual(reconstructionFirstPlannedClaim.evidenceIds, evidenceIds);
  assert.deepEqual(reconstructionFirstPlannedClaim.sourceKeys, sourceIds);
  assert.deepEqual(reconstructionFirstPlannedClaim.citationKeys, sourceIds);
  assert.equal((reconstructionGraph.edges as unknown[]).length, bindingCount);
  assert.equal((reconstructionPacket.sourceIdentityRegistry as unknown[]).length, bindingCount);
  assert.deepEqual(
    (reconstructionPacket.narrativePasses as Array<Record<string, unknown>>)[0]!.inputClaimIds,
    graphClaimIds,
  );
  assert.deepEqual(
    (reconstructionPacket.narrativePasses as Array<Record<string, unknown>>)[0]!.inputFactIds,
    factIds,
  );

  assert.ok(teachBackPayload.length < 20_000, `teach-back prompt expanded to ${teachBackPayload.length}`);
  assert.ok(reconstructionPayload.length < 45_000, `reconstruction prompt expanded to ${reconstructionPayload.length}`);
  for (const payload of [teachBackPayload, reconstructionPayload]) {
    assert.doesNotMatch(payload, /RAW_(?:ABSTRACT|EVIDENCE|EXACT_RESULT|SOURCE_TITLE|SUPPORT_SPAN)_SECRET|CARD_SUMMARY_SECRET/u);
    assert.doesNotMatch(payload, /"(?:sourceSpan|rawText|supportSpan|abstract|snippet|summary)"\s*:/u);
  }

  const previousLlmProvider = process.env.LLM_PROVIDER;
  const ollamaRequests: Array<Record<string, unknown>> = [];
  process.env.LLM_PROVIDER = "ollama";
  try {
    await writeReportWithLlm({
      topic: "高中生短影音使用與睡眠品質",
      acceptedSources: indexes.map((index) => source(index, {
        id: `source-${index}`,
        title: `RAW_SOURCE_TITLE_SECRET_${index}`,
        abstract: `RAW_ABSTRACT_SECRET_${index}`,
      })),
      evidenceCards,
      requestedSectionIds: ["literature_review"],
      reportPlan: plan,
    }, {
      llm: { baseUrl: "http://127.0.0.1:11434", model: "test-model" },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        ollamaRequests.push(request);
        const messages = request.messages as Array<{ role: string; content: string }>;
        const system = messages.find((message) => message.role === "system")?.content ?? "";
        const content = /teach-back reasoner/u.test(system)
          ? JSON.stringify({ sectionUnderstandings: [{
              sectionId: "global_synthesis",
              teachBack: "多項事實共同顯示暴露與睡眠結果存在受限關聯，差異、機制與適用邊界仍須一併解釋。",
            }] })
          : JSON.stringify({ sections: [{
              sectionId: "literature_review",
              title: "文獻探討",
              prose: "現有事實共同支持短影音使用與睡眠品質之間存在受限關聯。\n\n由於資料為橫斷式，關聯方向仍不能解釋為因果效果。",
              evidenceCardIds: evidenceIds,
              citationIds: sourceIds,
            }] });
        return new Response(JSON.stringify({
          model: "test-model",
          message: { role: "assistant", content },
          done: true,
        }));
      },
    });
  } finally {
    if (previousLlmProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousLlmProvider;
  }

  assert.ok(ollamaRequests.length >= 2);
  for (const request of ollamaRequests.slice(0, 2)) {
    assert.equal(request.stream, false);
    assert.equal(request.think, false);
    assert.equal(request.format, "json");
  }
  const localReconstructionPayload = (
    ollamaRequests[1]!.messages as Array<{ role: string; content: string }>
  ).find((message) => message.role === "user")?.content ?? "";
  const localPacket = parsePacketAfter(
    localReconstructionPayload,
    "Canonical reconstruction packet:",
  );
  const localFirstClaim = rowAsRecord(
    localPacket.claimColumns,
    (localPacket.claims as unknown[])[0],
  );
  const localFirstSectionBinding = (
    localPacket.sectionBindings as Array<Record<string, unknown>>
  )[0]!;
  assert.equal((localPacket.facts as unknown[]).length, bindingCount);
  assert.deepEqual(localFirstClaim.supportingFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.deepEqual(localFirstClaim.contradictingFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.deepEqual(localFirstClaim.backgroundFactRefs, factIds.map((_, index) => `F${index + 1}`));
  assert.deepEqual(localFirstClaim.citationIds, sourceIds);
  assert.equal((localPacket.edges as unknown[]).length, bindingCount);
  assert.deepEqual(localFirstSectionBinding.claimRefs, graphClaimIds.map((_, index) => `C${index + 1}`));
  assert.deepEqual(localFirstSectionBinding.evidenceCardIds, evidenceIds);
  assert.deepEqual(localFirstSectionBinding.citationIds, sourceIds);
  assert.deepEqual(
    (localPacket.narrativePasses as Array<Record<string, unknown>>)[0]!.inputClaimRefs,
    graphClaimIds.map((_, index) => `C${index + 1}`),
  );
  assert.deepEqual(
    (localPacket.narrativePasses as Array<Record<string, unknown>>)[0]!.inputFactRefs,
    factIds.map((_, index) => `F${index + 1}`),
  );
  assert.ok(
    localReconstructionPayload.length < 35_000,
    `local reconstruction prompt expanded to ${localReconstructionPayload.length}`,
  );
  assert.doesNotMatch(localReconstructionPayload, /RAW_(?:ABSTRACT|EVIDENCE|EXACT_RESULT|SOURCE_TITLE|SUPPORT_SPAN)_SECRET|CARD_SUMMARY_SECRET/u);
  assert.doesNotMatch(localReconstructionPayload, /"(?:sourceSpan|rawText|supportSpan|abstract|snippet|summary)"\s*:/u);
});

test("teach_back_output_schema_validated", () => {
  const valid = validateTeachBackOutput(JSON.stringify({
    sectionUnderstandings: [{
      sectionId: "findings",
      teachBack: "短影音暴露與睡眠品質呈現具條件的關聯，橫斷資料不能證明因果。",
    }],
  }), ["findings"], ["Ada Lovelace", "source-1"]);
  assert.deepEqual(JSON.parse(valid), {
    sectionUnderstandings: [{
      sectionId: "findings",
      teachBack: "短影音暴露與睡眠品質呈現具條件的關聯，橫斷資料不能證明因果。",
    }],
  });
  assert.throws(() => validateTeachBackOutput(JSON.stringify({
    sectionUnderstandings: [{ sectionId: "discussion", teachBack: "這是簡體中文結論，並且引用 source-1。" }],
  }), ["findings"], ["source-1"]), /teach_back_/u);
  assert.throws(() => validateTeachBackOutput(JSON.stringify({
    sectionUnderstandings: [{
      sectionId: "findings",
      teachBack: "短影音暴露與睡眠品質呈現具條件的關聯，詳見 DOI 10.1000/leak。",
    }],
  }), ["findings"]), /teach_back_identity_leak/u);
  assert.throws(() => validateTeachBackOutput(JSON.stringify({
    sectionUnderstandings: [{
      sectionId: "findings",
      teachBack: "短影音暴露與睡眠品質呈現具條件的關聯。",
      citationIds: ["source-1"],
    }],
  }), ["findings"]), /teach_back_invalid_schema/u);
});

test("teach_back_output_schema_recovers_one_fenced_json_object", () => {
  const content = [
    "```json",
    JSON.stringify({
      sectionUnderstandings: [{
        sectionId: "findings",
        teachBack: "短影音暴露與睡眠品質呈現受限關聯，且橫斷資料不能證明因果。",
      }],
    }),
    "```",
  ].join("\n");
  const validated = JSON.parse(validateTeachBackOutput(content, ["findings"]));
  assert.equal(validated.sectionUnderstandings[0].sectionId, "findings");
});

test("invalid_teach_back_fails_closed", async () => {
  const evidenceCard: ReportWriterEvidenceCard = {
    id: "evidence-1",
    evidenceId: "evidence-1",
    sourceId: "source-1",
    canonicalSourceKey: "source-1",
    citationKey: "source-1",
    claim: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    claimTextZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    evidence: "可核對證據。",
    summary: "短影音使用與睡眠品質的正規化摘要。",
    relevance: "短影音與睡眠品質",
    sourceTitle: "來源身分不可進入 teach-back",
    sourceProvider: "OpenAlex",
    year: 2025,
    usableSections: ["findings"],
    citationText: "[S1]",
    citationMarker: "[S1]",
    limitation: "橫斷式研究不能證明因果。",
    supportSpan: "Short-form video use was associated with poorer sleep quality.",
  };
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const result = await writeReportWithLlm({
    topic: "高中生短影音使用與睡眠品質",
    acceptedSources: [source(1, { id: "source-1" })],
    evidenceCards: [evidenceCard],
    requestedSectionIds: ["findings"],
    reportPlan: knowledgePlan(),
  }, {
    llm: { baseUrl: "https://llm.example/v1", model: "test-model", apiKey: "test-key" },
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      requests.push(request);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        sectionUnderstandings: [{
          sectionId: "global_synthesis",
          teachBack: "根據來源 source-1 與引用 [S1]，這項研究顯示睡眠品質變差。",
        }],
      }) } }] }));
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.reportGenerationStatus, "failed");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) =>
    request.messages.some((message) => /teach-back reasoner/u.test(message.content)),
  ));
});

test("paragraph_claims_bind_marker_free_prose_semantically", () => {
  const evidenceById = new Map([
    ["evidence-sleep", {
      id: "evidence-sleep", sourceId: "source-sleep", citationText: "[S1]",
      citationMarker: "[S1]", claimTextZhTw: "短影音使用與較差睡眠品質呈正向關聯。",
      mainClaimZhTw: "短影音使用與較差睡眠品質呈正向關聯。",
      claimIds: ["claim-sleep"],
    }],
    ["evidence-anxiety", {
      id: "evidence-anxiety", sourceId: "source-anxiety", citationText: "[S2]",
      citationMarker: "[S2]", claimTextZhTw: "短影音使用與焦慮症狀呈正向關聯。",
      mainClaimZhTw: "短影音使用與焦慮症狀呈正向關聯。",
      claimIds: ["claim-anxiety"],
    }],
  ]);
  const bindings = paragraphClaimsForSection({
    sectionId: "findings",
    prose: "短影音使用與較差睡眠品質呈正向關聯。\n\n短影音使用與焦慮症狀呈正向關聯。",
    evidenceCardIds: ["evidence-sleep", "evidence-anxiety"],
    evidenceById: evidenceById as never,
    plannedClaimIds: ["claim-sleep", "claim-anxiety"],
  });

  assert.deepEqual(bindings.map((binding) => binding.evidenceCardIds), [
    ["evidence-sleep"],
    ["evidence-anxiety"],
  ]);
  assert.deepEqual(bindings.map((binding) => binding.claimIds), [
    ["claim-sleep"],
    ["claim-anxiety"],
  ]);
});

test("no_source_order_narrative", () => {
  const prose = "第一項研究指出短影音與睡眠相關。另一項研究發現相同方向。";
  const issues = detectSourceEchoIssues([{ sectionId: "findings", prose, paragraphClaims: [{
    paragraphId: "p-1", sectionId: "findings", claimIds: ["c-1"],
    evidenceCardIds: ["evidence-1", "evidence-2"], citationMarkers: [],
    generatedTextZhTw: prose, unsupportedSentences: [],
  }] }]);
  assert.ok(issues.some((issue) => issue.code === "SOURCE_LED_PARAGRAPH"));
  assert.ok(issues.some((issue) => issue.code === "PAPER_BY_PAPER_STITCHING"));
  assert.deepEqual(detectSourceEchoIssues([{ sectionId: "findings", prose:
    "現有證據共同指出短影音使用與睡眠品質存在受限關聯[S1][S2]；量測差異使效果量不宜合併。" }]), []);
});

function sourceEchoCard(input: {
  id: string;
  sourceId: string;
  supportSpan: string;
  claimTextZhTw: string;
}): ReportWriterEvidenceCard {
  return {
    id: input.id,
    evidenceId: input.id,
    sourceId: input.sourceId,
    claim: input.claimTextZhTw,
    claimTextZhTw: input.claimTextZhTw,
    evidence: "writer output 後才可用的本地證據指紋",
    summary: input.claimTextZhTw,
    relevance: "source echo audit",
    sourceTitle: `不參與指紋的來源標題 ${input.id}`,
    sourceProvider: "OpenAlex",
    year: 2025,
    usableSections: ["findings"],
    citationText: `[${input.sourceId}]`,
    supportSpan: input.supportSpan,
    limitation: null,
  };
}

test("anonymous paraphrase preserving one abstract's information order is source-led", () => {
  const card = sourceEchoCard({
    id: "evidence-order",
    sourceId: "source-order",
    supportSpan: [
      "夜間短影音暴露壓縮就寢前的緩衝時間。",
      "社交焦慮連結短影音暴露與睡眠結果。",
      "睡眠品質惡化是最終觀察結果。",
    ].join(""),
    claimTextZhTw: "夜間短影音、社交焦慮與睡眠品質之間存在受限關聯。",
  });
  const prose = [
    "夜間短影音使用壓縮了就寢前的緩衝時間。",
    "社交焦慮在短影音暴露與睡眠結果之間形成連結。",
    "睡眠品質惡化則構成最終觀察結果。",
  ].join("");
  const issues = detectSourceEchoIssues([{
    sectionId: "findings",
    prose,
    evidenceCardIds: [card.id],
    paragraphClaims: [{
      paragraphId: "p-order",
      sectionId: "findings",
      claimIds: ["claim-order"],
      evidenceCardIds: [card.id],
      citationMarkers: [],
      generatedTextZhTw: prose,
      unsupportedSentences: [],
    }],
  }], new Map([[card.id, card]]));
  assert.ok(issues.some((issue) => issue.code === "SOURCE_LED_PARAGRAPH"));
});

test("no_paper_by_paper_stitching", () => {
  const cards = [
    sourceEchoCard({ id: "evidence-bedtime", sourceId: "source-bedtime", supportSpan: "夜間短影音使用與延後就寢時點相關。", claimTextZhTw: "夜間短影音使用與就寢延後相關。" }),
    sourceEchoCard({ id: "evidence-anxiety", sourceId: "source-anxiety", supportSpan: "社交焦慮與入睡困難呈正向關聯。", claimTextZhTw: "社交焦慮與入睡困難相關。" }),
    sourceEchoCard({ id: "evidence-duration", sourceId: "source-duration", supportSpan: "高頻使用者的睡眠時長較短。", claimTextZhTw: "高頻使用與較短睡眠時長相關。" }),
  ];
  const prose = "夜間短影音使用與就寢延後相關。社交焦慮與入睡困難呈正向關聯。高頻使用者的睡眠時長較短。";
  const issues = detectSourceEchoIssues([{
    sectionId: "literature_review",
    prose,
    evidenceCardIds: cards.map((card) => card.id),
    paragraphClaims: [{
      paragraphId: "p-three-sources",
      sectionId: "literature_review",
      claimIds: ["claim-bedtime", "claim-anxiety", "claim-duration"],
      evidenceCardIds: cards.map((card) => card.id),
      citationMarkers: [],
      generatedTextZhTw: prose,
      unsupportedSentences: [],
    }],
  }], new Map(cards.map((card) => [card.id, card])));
  assert.ok(issues.some((issue) => issue.code === "PAPER_BY_PAPER_STITCHING"));
});

test("cross-source thematic synthesis is not mistaken for source stitching", () => {
  const prose = [
    "就寢時點、入睡困難與睡眠時長共同界定睡眠結果的多個面向。",
    "這些面向須依暴露定義與族群差異同時解釋。",
    "因此可綜合關係方向，但不應把異質結果合併為單一效果量。",
  ].join("");
  const issues = detectSourceEchoIssues([{
    sectionId: "discussion",
    prose,
    evidenceCardIds: ["evidence-bedtime", "evidence-anxiety", "evidence-duration"],
    paragraphClaims: [{
      paragraphId: "p-synthesis",
      sectionId: "discussion",
      claimIds: ["claim-synthesis"],
      evidenceCardIds: ["evidence-bedtime", "evidence-anxiety", "evidence-duration"],
      citationMarkers: [],
      generatedTextZhTw: prose,
      unsupportedSentences: [],
    }],
  }]);
  assert.deepEqual(issues, []);
});

test("no_blanket_citation_clusters", () => {
  const paragraphs = [
    "短影音暴露概念需要先區分使用時數與成癮傾向。",
    "睡眠結果也包含分數與睡眠不佳比例。",
    "兩類量測不能直接合併效果量。",
  ];
  const issues = detectSourceEchoIssues([{ sectionId: "discussion", prose: paragraphs.join("\n\n"),
    paragraphClaims: paragraphs.map((generatedTextZhTw, index) => ({
      paragraphId: `p-${index + 1}`, sectionId: "discussion", claimIds: ["c-1"],
      evidenceCardIds: ["evidence-1", "evidence-2"], citationMarkers: [],
      generatedTextZhTw, unsupportedSentences: [],
    })),
  }]);
  assert.ok(issues.some((issue) => issue.code === "BLANKET_CITATION_CLUSTER"));
});

test("claim_citation_entailment", () => {
  const plan = knowledgePlan();
  assert.deepEqual(auditClaimCitationEntailment(plan, [{
    sectionId: "findings",
    citationIds: ["source-1"],
    paragraphClaims: [{
      paragraphId: "p-1",
      sectionId: "findings",
      claimIds: ["planned-1"],
      evidenceCardIds: ["evidence-1"],
      citationMarkers: ["[S1]"],
      generatedTextZhTw: "受限關聯。",
      unsupportedSentences: [],
    }],
  }]), []);
  const mismatched = structuredClone(plan);
  mismatched.normalizedFacts![0]!.sourceId = "source-2";
  assert.ok(auditClaimCitationEntailment(mismatched, [{
    sectionId: "findings",
    citationIds: ["source-2"],
    paragraphClaims: [{
      paragraphId: "p-1",
      sectionId: "findings",
      claimIds: ["planned-1"],
      evidenceCardIds: ["evidence-1"],
      citationMarkers: ["[S2]"],
      generatedTextZhTw: "受限關聯。",
      unsupportedSentences: [],
    }],
  }]).some((issue) => issue.startsWith("CLAIM_CITATION_NOT_ENTAILED")));
});

test("sentence-level entailment blocks an unsupported second sentence hidden in a grounded paragraph", () => {
  const plan = knowledgePlan();
  const prose = [
    "短影音使用與較差睡眠品質呈具條件性的關聯。",
    "短影音使用已證實能提升數學成績。",
  ].join("");
  const issues = auditClaimCitationEntailment(plan, [{
    sectionId: "findings",
    citationIds: ["source-1"],
    paragraphClaims: [{
      paragraphId: "findings-p1",
      sectionId: "findings",
      claimIds: ["planned-1"],
      evidenceCardIds: ["evidence-1"],
      citationMarkers: [],
      generatedTextZhTw: prose,
      // This reproduces the old paragraph-level masking failure: any one
      // card+claim binding used to clear the whole paragraph.
      unsupportedSentences: [],
    }],
  }]);

  assert.ok(issues.some((issue) =>
    issue.startsWith("SENTENCE_CLAIM_NOT_ENTAILED:findings:findings-p1:") &&
    issue.includes("數學成績")
  ));
});

test("canonical writer post-edit validation fails closed on one unsupported sentence in a grounded paragraph", async () => {
  const evidenceCard: ReportWriterEvidenceCard = {
    id: "evidence-1",
    evidenceId: "evidence-1",
    sourceId: "source-1",
    canonicalSourceKey: "source-1",
    citationKey: "source-1",
    claimIds: ["planned-1"],
    claim: "短影音使用與較差睡眠品質呈具條件性的關聯；另與較佳數學成績相關。",
    claimTextZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯；另與較佳數學成績相關。",
    evidence: "可核對證據。",
    summary: "短影音使用與睡眠品質的正規化摘要。",
    relevance: "短影音與睡眠品質",
    sourceTitle: "短影音與睡眠研究",
    sourceProvider: "OpenAlex",
    year: 2025,
    usableSections: ["findings"],
    citationText: "[S1]",
    citationMarker: "[S1]",
    limitation: "橫斷式研究不能證明因果。",
    supportSpan: "Short-form video use was associated with poorer sleep quality and better mathematics achievement.",
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
    evidenceDirectnessTier: "A",
  };
  const result = await writeReportWithLlm({
    topic: "高中生短影音使用與睡眠品質",
    acceptedSources: [source(1, { id: "source-1" })],
    evidenceCards: [evidenceCard],
    requestedSectionIds: ["findings"],
    reportPlan: knowledgePlan(),
  }, {
    llm: { baseUrl: "https://llm.example/v1", model: "test-model", apiKey: "test-key" },
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const system = request.messages.find((message) => message.role === "system")?.content ?? "";
      const content = /teach-back reasoner/u.test(system)
        ? JSON.stringify({ sectionUnderstandings: [{
            sectionId: "global_synthesis",
            teachBack: "短影音使用與睡眠結果存在受限關聯，橫斷資料不能證明因果。",
          }] })
        : JSON.stringify({ sections: [{
            sectionId: "findings",
            title: "主要發現",
            prose: "短影音使用與較差睡眠品質呈具條件性的關聯。短影音使用與較佳數學成績相關。",
            evidenceCardIds: ["evidence-1"],
            citationIds: ["source-1"],
          }] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.writerDiagnostics?.postEditValidation?.status, "blocked");
  assert.ok(result.writerDiagnostics?.postEditValidation?.issues.some((issue) =>
    issue.startsWith("SENTENCE_CLAIM_NOT_ENTAILED:findings:") && issue.includes("數學成績")
  ));
});

test("model prose keeps citations structural while the internal verifier receives canonical bindings", async () => {
  let systemPrompt = "";
  let userPrompt = "";
  const markerFreeProse =
    "現有可追溯資料顯示，薯條的熱量、脂肪與鈉含量需與油炸條件一併解釋，才能形成範圍受限的食品安全判斷。";
  const result = await writeReportWithLlm(
    {
      topic: "薯條營養與加工條件",
      acceptedSources: [source(1), source(2), source(3)],
      requestedSectionIds: ["findings"],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        systemPrompt = request.messages.find((message) => message.role === "system")?.content ?? "";
        userPrompt = request.messages.find((message) => message.role === "user")?.content ?? "";
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                sections: [{
                  sectionId: "findings",
                  title: "主要發現",
                  prose: `${markerFreeProse}\n\n此結果僅適用於現有摘要所直接揭露的營養與加工條件，不能延伸為特定疾病的因果結論。`,
                  evidenceCardIds: ["evidence:source-1:0"],
                  citationIds: ["source-1"],
                }],
              }),
            },
          }],
        }));
      },
    },
  );

  assert.match(`${systemPrompt}\n${userPrompt}`, /do not emit \{s2\}.*citation token in prose/iu);
  assert.doesNotMatch(markerFreeProse, /\[S\d+\]|\{s\d+\}/iu);
  assert.equal(result.ok, true);
  assert.match(result.sections[0]?.prose ?? "", /\[S1\]/u);
  assert.deepEqual(result.sections[0]?.citationIds, ["source-1", "source-2", "source-3"]);
  assert.deepEqual(result.sections[0]?.evidenceCardIds, [
    "evidence:source-1:0",
    "evidence:source-2:0",
    "evidence:source-3:0",
  ]);
});

test("deterministic section roles keep evidence in findings without copying it into discussion or conclusion", async () => {
  const acceptedSources = [1, 2, 3].map((index) => source(index, {
    title: `青少年睡眠研究 ${index}`,
    abstract: "研究檢視睡眠時間與注意力表現的關聯。",
  }));
  const directFinding = "較短睡眠時間與較差的青少年注意力表現相關";
  const result = await writeReportWithLlm(
    {
      topic: "青少年睡眠時間與注意力表現",
      acceptedSources,
      evidenceCards: acceptedSources.map((item, index) => ({
        id: `sleep-evidence-${index + 1}`,
        sourceId: item.id,
        claim: directFinding,
        claimTextZhTw: directFinding,
        evidencePointZhTw: directFinding,
        evidence: "shorter sleep duration was associated with poorer adolescent attention",
        summary: directFinding,
        relevance: "睡眠與注意力",
        sourceTitle: item.title,
        sourceProvider: "Crossref",
        provider: "Crossref",
        year: item.year,
        citationText: `Lovelace（2024）[S${index + 1}]`,
        citationMarker: `[S${index + 1}]`,
        sectionTargets: ["literature_review", "findings", "discussion", "conclusion"],
        usableSections: ["文獻探討", "研究發現", "討論", "結論"],
        sourceAccessLevel: "full_text",
        evidenceType: "finding",
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        isPeerReviewed: true,
        limitation: index === 0 ? "研究情境與樣本範圍有限" : null,
        limitations: index === 0 ? ["研究情境與樣本範圍有限"] : [],
      })),
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );

  const findings = result.sections.find((section) => section.sectionId === "findings")?.prose ?? "";
  const discussion = result.sections.find((section) => section.sectionId === "discussion")?.prose ?? "";
  const conclusion = result.sections.find((section) => section.sectionId === "conclusion")?.prose ?? "";
  assert.match(findings, /較短睡眠時間與較差的青少年注意力/u);
  assert.doesNotMatch(discussion, /較短睡眠時間與較差的青少年注意力/u);
  assert.doesNotMatch(conclusion, /較短睡眠時間與較差的青少年注意力/u);
  assert.match(discussion, /一致性|差異|適用邊界/u);
  assert.match(conclusion, /現階段可回答/u);

  const fingerprintsBySection = [findings, discussion, conclusion].map((prose) =>
    prose
      .split(/(?<=[。！？!?])/u)
      .map((sentence) => sentence.replace(/[\uff3b\[]\s*S\d+\s*[］\]]/giu, "").replace(/[\s\p{P}\p{S}]+/gu, ""))
      .filter((fingerprint) => fingerprint.length >= 14),
  );
  assert.equal(
    fingerprintsBySection.some((sentences, index) =>
      sentences.some((sentence) =>
        fingerprintsBySection.some((other, otherIndex) =>
          otherIndex !== index && other.includes(sentence),
        ),
      ),
    ),
    false,
  );
});

test("whole_document_editor_removes_repetition", async () => {
  const repeatedFinding =
    "2024年針對1236人的橫斷式研究顯示，短影音使用與較差睡眠品質呈具條件性的關聯。";
  const nearDuplicateFinding =
    "換言之，2024年同一項1236人的橫斷式研究亦指出，短影音暴露和較差睡眠品質具有受限關聯。";
  const evidenceBoundary = "研究設計的限制仍需納入解讀。";
  const initialProse = `${repeatedFinding}${nearDuplicateFinding}\n\n${evidenceBoundary}`;
  const editedProse = [
    `${repeatedFinding.replace(/。$/u, "")}[S1]。`,
    `${evidenceBoundary.replace(/。$/u, "")}[S1]。`,
  ].join("\n\n");
  const plan = knowledgePlan();
  plan.plannedClaims[0]!.claimText = repeatedFinding;
  plan.normalizedFacts![0]!.claimTextZhTw = repeatedFinding;
  plan.claimGraph!.claims[0]!.readerFacingStatement = repeatedFinding;
  plan.synthesisClusters![0]!.sharedFindingZhTw = repeatedFinding;
  const acceptedSource = source(1, {
    id: "source-1",
    title: "高中生短影音與睡眠品質研究",
    abstract: repeatedFinding,
  });
  const evidenceCard: ReportWriterEvidenceCard = {
    id: "evidence-1",
    evidenceId: "evidence-1",
    sourceId: "source-1",
    canonicalSourceKey: "source-1",
    citationKey: "source-1",
    claimIds: ["planned-1"],
    claim: repeatedFinding,
    claimTextZhTw: repeatedFinding,
    mainClaimZhTw: repeatedFinding,
    evidencePointZhTw: repeatedFinding,
    evidence: repeatedFinding,
    summary: repeatedFinding,
    relevance: "高中生短影音使用與睡眠品質",
    sourceTitle: acceptedSource.title,
    sourceProvider: "Crossref",
    provider: "Crossref",
    year: 2024,
    citationText: "Lovelace（2024）[S1]",
    citationMarker: "[S1]",
    usableSections: ["findings"],
    sectionTargets: ["findings"],
    sourceAccessLevel: "complete_abstract",
    evidenceType: "finding",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    isPeerReviewed: true,
    limitation: "橫斷式研究不能證明因果。",
    limitations: ["橫斷式研究不能證明因果。"],
    studyDesign: "橫斷式研究",
    dataScope: "1236人",
  };
  let editorSystemPrompt = "";
  let editorUserPrompt = "";
  const result = await writeReportWithLlm(
    {
      topic: "高中生短影音使用與睡眠品質",
      acceptedSources: [acceptedSource],
      evidenceCards: [evidenceCard],
      requestedSectionIds: ["findings"],
      reportPlan: plan,
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const system = request.messages.find((message) => message.role === "system")?.content ?? "";
        const user = request.messages.find((message) => message.role === "user")?.content ?? "";
        let content: string;
        if (/teach-back reasoner/u.test(system)) {
          content = JSON.stringify({ sectionUnderstandings: [{
            sectionId: "global_synthesis",
            teachBack: "短影音使用與較差睡眠品質存在受限關聯，研究設計限制仍需納入解讀。",
          }] });
        } else if (/document-level academic editor/u.test(system)) {
          editorSystemPrompt = system;
          editorUserPrompt = user;
          content = JSON.stringify({ sections: [{
            sectionId: "findings",
            title: "主要發現",
            prose: editedProse,
          }] });
        } else {
          content = JSON.stringify({ sections: [{
            sectionId: "findings",
            title: "主要發現",
            prose: initialProse,
            evidenceCardIds: ["evidence-1"],
            citationIds: ["source-1"],
          }] });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      },
    },
  );

  assert.match(editorSystemPrompt, /document-level academic editor/u);
  assert.match(editorSystemPrompt, /repetition/u);
  assert.ok(editorUserPrompt.includes(repeatedFinding.replace(/。$/u, "")));
  assert.ok(editorUserPrompt.includes(nearDuplicateFinding.replace(/。$/u, "")));
  assert.equal(result.writerDiagnostics?.editorialPass?.status, "applied");
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0]?.prose, editedProse);
  assert.equal((result.sections[0]?.prose.match(/短影音使用與較差睡眠品質/gu) ?? []).length, 1);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /短影音暴露和較差睡眠品質/u);
  assert.deepEqual(result.sections[0]?.citationIds, ["source-1"]);
  assert.match(result.sections[0]?.prose ?? "", /2024年/u);
  assert.match(result.sections[0]?.prose ?? "", /1236人/u);
  assert.match(result.sections[0]?.prose ?? "", /橫斷式研究/u);
});

test("discussion states the Taiwan-campus extrapolation limit when direct local evidence is absent", async () => {
  const acceptedSources = [1, 2].map((index) => source(index, {
    title: `International adolescent media study ${index}`,
    abstract: "國外青少年樣本顯示夜間螢幕使用與睡眠結果有關。",
  }));
  const result = await writeReportWithLlm(
    {
      topic: "短影音使用對台灣高中校園學生睡眠品質的影響",
      acceptedSources,
      evidenceCards: acceptedSources.map((item, index) => ({
        id: `international-media-${index + 1}`,
        sourceId: item.id,
        claim: "國外青少年的夜間螢幕使用與睡眠結果有關。",
        evidence: "night-time screen use was associated with adolescent sleep outcomes",
        summary: "國外青少年螢幕使用與睡眠的關聯。",
        relevance: "青少年睡眠",
        sourceTitle: item.title,
        sourceProvider: "Crossref",
        provider: "Crossref",
        year: item.year,
        citationText: `Lovelace（2024）[S${index + 1}]`,
        citationMarker: `[S${index + 1}]`,
        sectionTargets: ["findings", "discussion", "conclusion"],
        usableSections: ["研究發現", "討論", "結論"],
        sourceAccessLevel: "abstract_only",
        evidenceType: "finding",
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        isPeerReviewed: true,
        limitation: "樣本來自國外一般族群",
        limitations: ["樣本來自國外一般族群"],
      })),
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );

  const discussion = result.sections.find((section) => section.sectionId === "discussion")?.prose ?? "";
  assert.match(
    discussion,
    /未直接涵蓋台灣校園樣本或本地制度情境/u,
  );
  assert.match(discussion, /不能把其他地區或一般族群的結果直接外推到台灣校園/u);
});

test("report writer skips LLM generation below the accepted-source minimum", async () => {
  const result = await writeReportWithLlm({
    topic: "可樂",
    acceptedSources: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "insufficient_sources");
  assert.equal(result.llm_status, "skipped");
  assert.match(result.warning ?? "", /accepted_evidence_cards_missing/);
  assert.equal(result.sections.length, 0);
  assert.equal(result.sectionPlan?.length, 9);
  assert.equal(result.reportGenerationProvider, "ollama");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
});

test("report writer excludes unaccepted manual-review sources even when evidence cards exist", async () => {
  const workflowId = "wf-hiv-writer-test";
  const topicHash = "topic-hiv-writer-test";
  const acceptedSources = [1, 2, 3].map((index) =>
    source(index, {
      workflowId,
      topicHash,
      recommendationBucket: "manual_review",
      acceptedByUser: false,
      userDecision: "pending",
      relevanceLevel: "secondary",
    }),
  );
  const result = await writeReportWithLlm({
    workflowId,
    topicHash,
    topic: "愛滋病潛在風險與造成影響",
    acceptedSources,
    evidenceCards: acceptedSources.map((item, index) => ({
      id: `evidence:${item.id}:0`,
      sourceId: item.id ?? `source-${index + 1}`,
      workflowId,
      topicHash,
      claim: "HIV/AIDS 風險因素證據",
      evidence: "摘要提到傳染途徑與公共衛生影響。",
      summary: "可支撐風險與影響討論。",
      relevance: "HIV/AIDS",
      sourceTitle: item.title,
      sourceProvider: item.sourceType,
      year: item.year ?? null,
      usableSections: ["研究背景"],
      citationText: "Lovelace（2024）",
      limitation: null,
    })),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "insufficient_sources");
  assert.equal(result.sections.length, 0);
});

test("report writer keeps evidence-grounded deterministic sections on empty model output", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
        ),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "error");
  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "failed");
  assert.equal(result.reportGenerationStatus, "failed");
  assert.equal(result.fallbackUsed, true);
  assert.match(result.fallbackReason ?? "", /LLM report writer fallback/);
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections.every((section) => section.prose.trim().length > 0), true);
  assert.equal(
    result.sections.every((section) => {
      const paragraphCount = section.prose.split(/\n{2,}/u).filter(Boolean).length;
      return paragraphCount >= 2 && paragraphCount <= 4;
    }),
    true,
  );
  assert.equal(result.sections.some((section) => section.evidenceCardIds.length > 0), true);
  assert.equal(
    result.sections
      .flatMap((section) => section.evidenceCardIds)
      .every((id) => /^evidence:source-[123]:0$/u.test(id)),
    true,
  );
  assert.equal(result.sectionPlan?.length, 9);
});

test("report writer provider failure keeps deterministic sections while reporting ok false", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "unavailable");
  assert.equal(result.llm_status, "failed");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.actualModel, null);
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections.some((section) => section.evidenceCardIds.length > 0), true);
  assert.match(result.fallbackReason ?? "", /provider-failure/u);
  assert.equal(
    result.sections
      .flatMap((section) => section.evidenceCardIds)
      .every((id) => /^evidence:source-[123]:0$/u.test(id)),
    true,
  );
});

test("deterministic writer keeps raw English abstracts in trace data and out of zh-TW sections", async () => {
  const rawAbstract =
    "Abstract The aim is to evaluate the mutual influences between sleep duration and adolescent risk behaviours. `This review explores the issue of sleep deprivation among children and adolescents in Japan.`";
  const result = await writeReportWithLlm(
    {
      topic: "睡眠不足與青少年注意力",
      language: "繁體中文",
      acceptedSources: [1, 2, 3].map((index) => source(index, {
        title: `Sleep deprivation review ${index}`,
        abstract: rawAbstract,
      })),
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );
  const readerText = result.sections.map((section) => section.prose).join(" ");

  assert.equal(result.sections.length, 9);
  assert.doesNotMatch(readerText, /Abstract\s+The aim|This review explores|`/iu);
  assert.match(readerText, /尚未完成可驗證的繁中重點整理/u);
});

test("deterministic writer rejects an Abstract label glued directly to Chinese prose", async () => {
  const gluedRawAbstract =
    "研究脈絡受限於Abstract The aim is to evaluate sleep duration and adolescent attention.";
  const result = await writeReportWithLlm(
    {
      topic: "睡眠不足與青少年注意力",
      language: "繁體中文",
      acceptedSources: [1, 2, 3].map((index) => source(index, {
        title: `Sleep duration study ${index}`,
        abstract: gluedRawAbstract,
      })),
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );
  const readerText = result.sections.map((section) => section.prose).join(" ");

  assert.equal(result.sections.length, 9);
  assert.doesNotMatch(readerText, /Abstract\s+The aim/iu);
  assert.match(readerText, /尚未完成可驗證的繁中重點整理/u);
});

test("deterministic writer keeps Japanese source prose out of zh-TW sections", async () => {
  const japaneseAbstract =
    "雨滴のモデルとして異なる半径の球を用い，終端速度の理論値と測定値が概ね一致した。";
  const result = await writeReportWithLlm(
    {
      topic: "雨滴的終端速度",
      language: "繁體中文",
      acceptedSources: [1, 2, 3].map((index) => source(index, {
        title: `Raindrop terminal velocity ${index}`,
        abstract: japaneseAbstract,
      })),
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("provider offline");
      },
    },
  );
  const readerText = result.sections.map((section) => section.prose).join(" ");

  assert.doesNotMatch(readerText, /\u306eモデル|用い|一致し/u);
  assert.match(readerText, /尚未完成可驗證的繁中重點整理/u);
});

test("report writer prompt path prefers zh-TW evidence summaries over raw English abstracts", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "過氯酸鈉的操作條件、儲存方式與實驗安全風險",
      acceptedSources: [
        source(1, {
          title: "Sodium perchlorate - PubChem Compound Summary",
          abstract:
            "PubChem records sodium perchlorate (NaClO4) as an oxidizing inorganic salt and provides identity, physical properties, safety information, and laboratory handling references for the compound.",
          abstractZhTw:
            "PubChem 將過氯酸鈉列為無機氧化鹽，並整理其身分資訊、物理性質與安全資料。",
          readableSummaryZhTw:
            "此來源可用來確認過氯酸鈉的化學身分、基本性質與安全資料，是實驗操作與危害辨識的官方基礎來源。",
          mainEvidencePointZhTw:
            "PubChem 提供過氯酸鈉的化學身分與安全資訊，可支撐操作條件與危害辨識分析。",
          sourceRelevanceReasonZhTw:
            "直接對應過氯酸鈉本體，且內容涵蓋安全資料，與主題高度相關。",
        }),
        source(2, {
          title: "SODIUM PERCHLORATE - NOAA CAMEO Chemicals",
          abstract:
            "CAMEO Chemicals describes sodium perchlorate as a white crystalline oxidizer that can accelerate burning of combustible materials and notes fire, heat, and reactivity hazards relevant to storage and emergency response.",
          abstractZhTw:
            "CAMEO 指出過氯酸鈉是白色結晶氧化劑，涉及火災、受熱與反應性危害。",
          readableSummaryZhTw:
            "此來源可直接支撐過氯酸鈉的儲存、相容性與緊急應變風險分析。",
          mainEvidencePointZhTw:
            "CAMEO 明確指出過氯酸鈉具有氧化性與受熱反應風險。",
          sourceRelevanceReasonZhTw:
            "直接命中過氯酸鈉的危害與儲存風險，是主題核心安全來源。",
        }),
        source(3, {
          title: "Sodium perchlorate - ECHA CHEM Dossier",
          abstract:
            "The ECHA chemicals dossier for sodium perchlorate provides identity data together with EU chemicals classification and labelling context that supports hazard review and handling-risk assessment.",
          abstractZhTw:
            "ECHA 提供過氯酸鈉的物質身分、分類與標示資訊，可補強危害審查。",
          readableSummaryZhTw:
            "此來源可補強過氯酸鈉在法規與危害分類上的判讀。",
          mainEvidencePointZhTw:
            "ECHA 提供過氯酸鈉的分類與標示資訊，可支撐風險評估。",
          sourceRelevanceReasonZhTw:
            "直接對應過氯酸鈉本體，並補充分類與標示資訊。",
        }),
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const prompt = request.messages.map((message) => message.content).join("\n");
        assert.doesNotMatch(
          prompt,
          /PubChem records sodium perchlorate|CAMEO Chemicals describes|The ECHA chemicals dossier/u,
        );
        assert.doesNotMatch(prompt, /supportSpans?:/u);
        assert.match(prompt, /normalizedSummaryZhTw|normalized_summary_zh_tw/u);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本報告整理過氯酸鈉的化學身分、氧化性、分類與標示資訊，並只根據已接受來源保留安全限制[S1][S2][S3]。",
                        evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0", "evidence:source-3:0"],
                        citationIds: ["source-1", "source-2", "source-3"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    },
  );

  const abstract = result.sections.find((section) => section.sectionId === "abstract")?.prose ?? "";
  assert.match(abstract, /過氯酸鈉/u);
  assert.doesNotMatch(abstract, /PubChem records sodium perchlorate|CAMEO Chemicals describes|The ECHA chemicals dossier/u);
  assert.match(abstract, /化學身分|氧化性|分類與標示/u);
});

test("report writer blocks official background evidence from scholarly synthesis sections", async () => {
  const officialSource = source(1, {
    id: "official-background",
    title: "Why Is the Sky Blue?",
    doi: null,
    url: "https://spaceplace.nasa.gov/blue-sky/",
    sourceType: "Official Source",
    provider: "NASA",
    sourceKind: "web",
    isPeerReviewed: false,
    recommendationBucket: "official_background",
    sourceRole: "official_background_explanation",
    retrievalMode: "trusted_seed",
    usableSections: ["研究背景"],
  });
  const scholarlySource = source(2, {
    id: "scholarly-rayleigh",
    title: "Rayleigh scattering and sunset color",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    retrievalMode: "live_provider",
  });

  const result = await writeReportWithLlm(
    {
      topic: "夕陽顏色與瑞利散射",
      acceptedSources: [officialSource, scholarlySource],
      evidenceCards: [
        {
          id: "evidence-official",
          sourceId: officialSource.id,
          claim: "NASA 說明天空顏色與光散射的基本概念。",
          evidence: "NASA explainer describes basic Rayleigh scattering.",
          summary: "官方背景說明。",
          relevance: "研究背景",
          sourceTitle: officialSource.title,
          sourceProvider: "NASA",
          doi: null,
          abstract: officialSource.abstract,
          provider: "NASA",
          relevanceScore: 80,
          sourceQualityScore: 70,
          finalScore: 75,
          year: officialSource.year,
          usableSections: ["研究背景"],
          citationText: "NASA（2024）",
          limitation: "非同行評審論文",
          limitations: ["非同行評審論文", "official explainer only"],
          sectionTargets: ["introduction", "literature_review", "discussion", "conclusion"],
          recommendationBucket: "official_background",
          sourceRole: "official_background_explanation",
          retrievalMode: "trusted_seed",
          isPeerReviewed: false,
        },
        {
          id: "evidence-scholarly",
          sourceId: scholarlySource.id,
          claim: "同行評審文獻討論瑞利散射對天空顏色的影響。",
          evidence: "Journal abstract discusses wavelength-dependent scattering.",
          summary: "學術摘要。",
          relevance: "文獻探討",
          sourceTitle: scholarlySource.title,
          sourceProvider: "Crossref",
          doi: scholarlySource.doi,
          abstract: scholarlySource.abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: scholarlySource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "discussion"],
          recommendationBucket: "scholarly_recommended",
          sourceRole: "core_scholarly_evidence",
          retrievalMode: "live_provider",
          isPeerReviewed: true,
        },
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "introduction",
                        title: "一、研究背景與動機",
                        prose:
                          "NASA 官方說明可用來界定天空顏色與光散射的背景概念，但不作為學術因果結論[S1]。",
                        evidenceCardIds: ["evidence-official"],
                        citationIds: ["official-background"],
                      },
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose:
                          "同行評審文獻可支撐瑞利散射與波長相依散射的學術討論[S2]。",
                        evidenceCardIds: ["evidence-scholarly", "evidence-official"],
                        citationIds: ["scholarly-rayleigh", "official-background"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  const introduction = result.sections.find((section) => section.sectionId === "introduction");
  const literatureReview = result.sections.find((section) => section.sectionId === "literature_review");
  const discussion = result.sections.find((section) => section.sectionId === "discussion");
  const conclusion = result.sections.find((section) => section.sectionId === "conclusion");

  assert.equal(introduction?.evidenceCardIds.includes("evidence-official"), true);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(discussion?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(conclusion?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-scholarly"), true);
});

test("report writer extracts JSON from markdown fences and filters unaccepted citations", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "```json",
                    JSON.stringify({
                      sections: [
                        {
                          sectionId: "abstract",
                          title: "摘要",
                          prose:
                            "本段只根據已接受薯條來源整理營養與食品安全限制，不加入未提供來源[S1]。",
                          evidenceCardIds: ["evidence:source-1:0"],
                          citationIds: ["source-1", "unaccepted-source"],
                        },
                        {
                          sectionId: "introduction",
                          title: "一、研究背景",
                          prose:
                            "薯條可由營養標示、油炸條件與飲食情境切入，正文需要保留可追溯引用[S2]。",
                          evidenceCardIds: ["evidence:source-2:0", "unknown-evidence"],
                          citationIds: ["source-2", "source-99"],
                        },
                        {
                          sectionId: "findings",
                          title: "三、主要發現",
                          prose:
                            "已接受來源足以支持初步整理，但不能捏造 DOI、作者或全文沒有提供的數據[S3]。",
                          evidenceCardIds: ["evidence:source-3:0"],
                          citationIds: ["source-3"],
                        },
                      ],
                    }),
                    "```",
                  ].join("\n"),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.deepEqual(result.sections[0]?.citationIds, ["source-1"]);
  assert.deepEqual(result.sections[1]?.evidenceCardIds, ["evidence:source-2:0"]);
  assert.equal(
    result.sections.some((section) => section.citationIds.includes("unaccepted-source")),
    false,
  );
  assert.equal(
    result.sections.some((section) => section.citationIds.includes("source-99")),
    false,
  );
});

test("report writer rejects instruction-like prose from model sections", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本段應討論薯條的營養成分與食品安全議題，並建議寫出後續可補充的方向[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sections.length, 9);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /本段應|建議寫|可再補充/u);
  assert.match(result.sections[0]?.prose ?? "", /薯條/u);
});

test("forbiddenInstructionTextMatches detects report-writer placeholder language", () => {
  const matches = forbiddenInstructionTextMatches("本段應探討研究背景，TODO：建議加入更多資料。");

  assert.equal(matches.some((match) => /本段應/u.test(match)), true);
  assert.equal(matches.some((match) => /TODO/u.test(match)), true);
  assert.equal(forbiddenInstructionTextMatches("現有來源顯示主題可分為背景、方法與限制三個層面。").length, 0);
});

test("report writer excludes metadata-only evidence from literature review claims", async () => {
  const metadataSource = source(1, {
    id: "metadata-only-rayleigh",
    title: "Metadata-only Rayleigh scattering record",
    abstract: null,
    accessLevel: "metadata_only",
    extractionStatus: "skipped",
    extractionMethod: "metadata_only",
    sourceUseLevel: "metadata_context_only",
    evidenceGrounding: "metadata_only",
  });
  const scholarlySource = source(2, {
    id: "fulltext-rayleigh",
    title: "Full text Rayleigh scattering study",
    accessLevel: "full_text",
    extractionStatus: "success",
    extractionMethod: "html_readability",
    sourceUseLevel: "citable_full_text",
    evidenceGrounding: "snippet_grounded",
  });

  const result = await writeReportWithLlm(
    {
      topic: "夕陽顏色與瑞利散射",
      acceptedSources: [metadataSource, scholarlySource, source(3)],
      evidenceCards: [
        {
          id: "evidence-metadata",
          sourceId: metadataSource.id,
          claim: "metadata 標題可直接支持瑞利散射文獻探討。",
          evidence: "Metadata-only Rayleigh scattering record",
          summary: "metadata-only record",
          relevance: "文獻探討",
          sourceTitle: metadataSource.title,
          sourceProvider: "OpenAlex",
          doi: metadataSource.doi,
          abstract: null,
          provider: "OpenAlex",
          relevanceScore: 80,
          sourceQualityScore: 70,
          finalScore: 75,
          year: metadataSource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: "metadata_only",
          limitations: ["metadata_only"],
          sectionTargets: ["literature_review", "discussion"],
          sourceAccessLevel: "metadata_only",
          source_access_level: "metadata_only",
          evidenceType: "background",
          evidence_type: "background",
          trace: { extraction_method: "metadata_only" },
          isPeerReviewed: true,
        },
        {
          id: "evidence-fulltext",
          sourceId: scholarlySource.id,
          claim: "全文片段說明瑞利散射會依波長改變觀測到的夕陽顏色。",
          evidence: "Rayleigh scattering is wavelength dependent and affects sunset color observations.",
          summary: "full-text evidence",
          relevance: "文獻探討",
          sourceTitle: scholarlySource.title,
          sourceProvider: "Crossref",
          doi: scholarlySource.doi,
          abstract: scholarlySource.abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: scholarlySource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "discussion"],
          sourceAccessLevel: "full_text",
          source_access_level: "full_text",
          evidenceType: "finding",
          evidence_type: "finding",
          sourceLocation: "Findings",
          source_location: "Findings",
          trace: { extraction_method: "html_readability" },
          isPeerReviewed: true,
        },
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose:
                          "文獻探討僅能依可追溯全文片段說明瑞利散射與夕陽顏色的關係，不把 metadata 標題當成學術證據[S2]。",
                        evidenceCardIds: ["evidence-metadata", "evidence-fulltext"],
                        citationIds: ["metadata-only-rayleigh", "fulltext-rayleigh"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  const literatureReview = result.sections.find((section) => section.sectionId === "literature_review");

  assert.equal(result.ok, true);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-metadata"), false);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-fulltext"), true);
});

test("report writer accepts partial usable sections and citation-only references", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本段先整理薯條議題的營養與食品安全脈絡，內容仍以已接受來源可支持的範圍為限[S1]。",
                        evidenceCardIds: [],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "discussion",
                        title: "討論",
                        prose:
                          "現有來源可支撐初步比較，但仍不足以推出全文沒有提供的精確攝取量或因果結論[S2]。",
                        evidenceCardIds: ["evidence:source-2:0"],
                        citationIds: ["source-2"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.citationIds[0], "source-1");
  assert.equal(result.sections[0]?.evidenceCardIds.length > 0, true);
  assert.match(result.warning ?? "", /completed 2\/9 sections/);
  assert.equal(result.writerDiagnostics?.modelCompletedSections, 2);
  assert.equal(result.writerDiagnostics?.fallbackSections, 7);
});

test("report writer keeps cited prose while pruning one uncited assertive sentence", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "discussion",
                        title: "討論",
                        prose:
                          "摘要資料可支持比較薯條的鈉含量與油炸條件，但結論仍受來源範圍限制[S1]。這證明薯條一定造成所有慢性疾病。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  const discussion = result.sections.find((section) => section.sectionId === "discussion");
  assert.equal(result.ok, true);
  assert.match(discussion?.prose ?? "", /鈉含量與油炸條件/u);
  assert.doesNotMatch(discussion?.prose ?? "", /所有慢性疾病/u);
  assert.equal(
    discussion?.warnings?.includes("uncited_assertive_sentences_removed"),
    true,
  );
});

test("report writer recovers sectioned freeform prose when the local LLM skips JSON", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "飛機",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "摘要",
                    "本報告先整理飛機相關材料、結構與風險面向，內容僅限於已接受來源可支持的資訊[S1]。",
                    "",
                    "一、研究動機",
                    "飛機議題可從材料、結構與安全監測切入，適合做為高中研究報告的初步主題[S1]。",
                    "",
                    "二、研究問題",
                    "目前可先追問飛機材料演進如何影響結構安全，以及監測技術如何支撐維護判斷[S1]。",
                    "",
                    "三、文獻探討",
                    "現有來源集中在結構壽命預測、複合材料與結構健康監測，已形成可整理的共同主軸[S2]。",
                    "",
                    "五、討論",
                    "目前資料能支持初步整理，但仍需要更多全文或官方資料補足在地案例與量化證據[S2]。",
                    "",
                    "六、結論與建議",
                    "整體而言，飛機研究可沿著結構材料與安全監測兩條主線繼續深化[S3]。",
                  ].join("\n"),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.sectionId, "abstract");
  assert.match(result.sections[0]?.prose ?? "", /飛機相關材料/);
  assert.match(result.warning ?? "", /freeform fallback parsing/);
  assert.doesNotMatch(
    result.sections.find((section) => section.sectionId === "research_question")?.prose ?? "",
    /目前可先追問/u,
  );
});

test("report writer retries with a compact prompt when the first local response is unusable", async () => {
  let requestCount = 0;

  const result = await writeReportWithLlm(
    {
      topic: "飛機",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "The",
                  },
                },
              ],
            }),
          );
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本摘要先依已接受來源整理飛機研究的材料、結構與監測面向，並保留來源限制說明[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究動機",
                        prose:
                          "飛機研究可從結構安全、複合材料與健康監測切入，適合作為後續延伸的研究主題[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "findings",
                        title: "四、資料與證據整理",
                        prose:
                          "現有來源集中說明複合材料、壽命預測與結構監測的角色，可支撐初步整理[S2]。",
                        evidenceCardIds: ["evidence:source-2:0"],
                        citationIds: ["source-2"],
                      },
                      {
                        sectionId: "conclusion",
                        title: "六、結論與建議",
                        prose:
                          "後續若要深化飛機主題，建議再補足近年案例與官方資料，以提升報告完整度[S3]。",
                        evidenceCardIds: ["evidence:source-3:0"],
                        citationIds: ["source-3"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    },
  );

  // The unsupported conclusion is now repaired independently instead of being
  // accepted solely because it carries a marker, so one additional scoped
  // request is expected beyond the earlier compact-retry contract.
  assert.equal(requestCount, 11);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.writerDiagnostics?.repairedSections, 2);
  assert.deepEqual(result.writerDiagnostics?.repairedSectionIds, ["abstract", "introduction"]);
  assert.match(result.warning ?? "", /受控 repair/);
});

test("report writer recovers complete sections from truncated JSON output", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "飛機",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `{
"sections":[
{"sectionId":"abstract","title":"摘要","prose":"本摘要先整理飛機材料與安全監測的研究主線，並保留來源限制說明。","evidenceCardIds":["evidence:source-1:0"],"citationIds":["source-1"]},
{"sectionId":"introduction","title":"一、研究動機","prose":"飛機主題可從結構安全、材料演進與健康監測切入，作為後續研究起點。","evidenceCardIds":["evidence:source-2:0"],"citationIds":["source-2"]},
{"sectionId":"findings","title":"四、資料與證據整理","prose":"目前來源集中於複合材料、壽命預測與監測技術，可支撐初步整理。","evidenceCardIds":["evidence:source-3:0"],"citationIds":["source-3"]},
{"sectionId":"discussion","title":"五、討論","prose":"若要深化此主題，仍需補足近年案例與更完整的全文證據。","evidenceCardIds":["evidence:source-1:0"],"citationIds":["source-1"]}`,
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.sectionId, "abstract");
  assert.match(result.warning ?? "", /truncated JSON/);
});

test("report writer marks gyroscope theory gaps when accepted evidence is mostly engineering applications", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "陀螺的角動量、扭矩與旋轉穩定性原理",
      acceptedSources: [
        source(1, {
          id: "gyro-1",
          title: "Orientation Estimation with Gyroscope and Accelerometer Fusion",
          abstract:
            "This study focuses on orientation estimation, sensor fusion, and IMU drift correction for mobile devices. It explains how gyroscope measurements improve attitude tracking but does not derive classical spinning top torque equations.",
        }),
        source(2, {
          id: "gyro-2",
          title: "Micromachined Gyroscope Design for Navigation Sensors",
          abstract:
            "The paper reviews micromachined gyroscope structures, sensitivity, and navigation-oriented signal processing. It emphasizes sensing applications rather than rigid body dynamics or spinning top precession theory.",
        }),
        source(3, {
          id: "gyro-3",
          title: "Sensor Fusion Methods for Inertial Measurement Units",
          abstract:
            "This review summarizes sensor fusion approaches, attitude estimation, and inertial measurement applications across robotics and navigation systems.",
        }),
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
        ),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections.some((section) => section.evidenceCardIds.length > 0), true);
  assert.equal(result.sectionPlan?.length, 9);
  assert.equal(
    result.sectionPlan?.some((section) => section.needsMoreEvidence),
    true,
  );
});

test("report writer paragraphClaims reject unsupported assertive model prose", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "睡眠時間與青少年學習記憶表現",
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: [
        {
          id: "evidence-sleep-1",
          sourceId: "source-1",
          claimIds: ["claim-sleep-1"],
          claim: "較短睡眠時間與較差的青少年記憶表現相關。",
          claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          mainClaimZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          evidence:
            "shorter sleep duration was associated with poorer adolescent memory performance",
          supportSpans: [
            {
              claimId: "claim-sleep-1",
              text: "shorter sleep duration was associated with poorer adolescent memory performance",
            },
          ],
          summary: "睡眠時間與記憶表現的關聯。",
          relevance: "文獻探討",
          sourceTitle: "Sleep duration and adolescent memory performance",
          sourceProvider: "Crossref",
          sourceAccessLevel: "full_text",
          extractionStatus: "text_extracted",
          evidenceType: "finding",
          citationMarker: "[S1]",
          doi: "10.1000/fries-1",
          abstract: source(1).abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: 2024,
          usableSections: ["文獻探討", "數據分析"],
          citationText: "Ada Lovelace（2024）[S1]",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "findings", "discussion"],
          recommendationBucket: "scholarly_recommended",
        },
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose: "研究證實睡眠時間必然提升所有青少年的記憶表現。",
                        evidenceCardIds: ["evidence-sleep-1"],
                        citationIds: ["source-1"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  const literatureReview = result.sections.find(
    (section) => section.sectionId === "literature_review",
  );
  assert.ok(literatureReview);
  assert.doesNotMatch(literatureReview.prose, /必然提升所有/u);
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.unsupportedSentences),
    [],
  );
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.claimIds),
    ["claim-sleep-1"],
  );
});

test("report writer canonicalizes bare and fullwidth inline citation markers", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "短影音使用時間與高中生睡眠品質",
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: [
        {
          id: "evidence-video-1",
          sourceId: "source-1",
          claimIds: ["claim-video-1"],
          claim: "螢幕媒體使用與學生睡眠結果有關。",
          claimTextZhTw: "螢幕媒體使用與學生睡眠結果有關。",
          mainClaimZhTw: "螢幕媒體使用與學生睡眠結果有關。",
          evidence:
            "screen-based media device access or use was associated with sleep outcomes",
          supportSpans: [
            {
              claimId: "claim-video-1",
              text: "screen-based media device access or use was associated with sleep outcomes",
            },
          ],
          summary: "螢幕媒體使用與睡眠結果的關聯。",
          relevance: "文獻探討",
          sourceTitle: "Screen-based media and sleep outcomes",
          sourceProvider: "Crossref",
          sourceAccessLevel: "full_text",
          extractionStatus: "text_extracted",
          evidenceType: "finding",
          citationMarker: "［S1］",
          abstract: source(1).abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: 2024,
          usableSections: ["文獻探討", "數據分析"],
          citationText: "Ada Lovelace（2024）[S1]",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "findings", "discussion"],
          recommendationBucket: "scholarly_recommended",
        },
      ],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose: "研究指出螢幕媒體使用與學生睡眠結果有關 s１。另一項可追溯敘述也指向相同關聯［Ｓ1］。",
                        evidenceCardIds: ["evidence-video-1"],
                        citationIds: ["source-1"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  const literatureReview = result.sections.find(
    (section) => section.sectionId === "literature_review",
  );
  assert.ok(literatureReview);
  assert.equal((literatureReview.prose.match(/\[S1\]/gu) ?? []).length, 2);
  assert.doesNotMatch(literatureReview.prose, /(?:^|\s)s１|［Ｓ1］/iu);
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.unsupportedSentences),
    [],
  );
});

test("citation marker normalization preserves scientific S labels", () => {
  assert.equal(
    canonicalizeCitationMarkersInText(
      "補充資料見 Table S1。S1 protein 仍是研究對象。附圖 S2。這一句才是來源 s１。",
    ),
    "補充資料見 Table S1。S1 protein 仍是研究對象。附圖 S2。這一句才是來源 [S1]。",
  );
});

test("source-specific sentences do not retain every section citation marker", async () => {
  const claims = [
    "廣州研究發現距綠地距離與較低地表溫度相關。",
    "Hawassa 研究發現 NDVI 與地表溫度呈負相關。",
    "大理市研究發現 core、branch 與 islet 指標與熱島強度呈負相關。",
    "西安研究發現公園面積與冷卻效果呈正相關。",
  ];
  const acceptedSources = claims.map((abstract, index) => source(index + 1, {
    title: `Urban green-space evidence ${index + 1}`,
    abstract,
  }));
  const evidenceCards = acceptedSources.map((item, index) => ({
    id: `green-evidence-${index + 1}`,
    sourceId: item.id,
    claim: claims[index]!,
    claimText: claims[index]!,
    evidence: claims[index]!,
    supportSpan: claims[index]!,
    supportSpans: [{ claimId: `green-claim-${index + 1}`, text: claims[index]! }],
    summary: claims[index]!,
    relevance: "都市綠地與地表溫度",
    sourceTitle: item.title,
    sourceProvider: "Crossref",
    sourceAccessLevel: "abstract_only",
    extractionStatus: "abstract_extracted",
    evidenceType: "finding",
    citationMarker: `[S${index + 1}]`,
    citationText: `Researcher ${index + 1}（2024）[S${index + 1}]`,
    provider: "Crossref",
    doi: item.doi,
    abstract: item.abstract,
    year: item.year,
    relevanceScore: 92,
    sourceQualityScore: 88,
    finalScore: 90,
    usableSections: ["主要發現"],
    sectionTargets: ["findings"],
    recommendationBucket: "scholarly_recommended" as const,
    sourceRole: "core_scholarly_evidence",
    isPeerReviewed: true,
    acceptedByUser: true,
    userDecision: "accepted_as_manual_review" as const,
    extractionMethod: "manual_review" as const,
    needsReview: false,
    needsManualReview: false,
    governanceFlags: ["exact_support_span_verified"],
    limitation: "研究場域不同。",
    limitations: ["研究場域不同。"],
  }));

  const result = await writeReportWithLlm(
    {
      topic: "都市綠地形態與地表溫度之關聯",
      acceptedSources,
      evidenceCards,
      requestedSectionIds: ["findings"],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              sections: [{
                sectionId: "findings",
                title: "主要發現",
                prose: `${claims[2]!.replace(/。$/u, "")}[S1][S2][S3][S4]。\n\n四項研究的場域與指標不同，數值不宜直接合併。`,
                evidenceCardIds: evidenceCards.map((card) => card.id),
                citationIds: acceptedSources.map((item) => item.id),
              }],
            }),
          },
        }],
      })),
    },
  );

  const finding = result.sections.find((section) => section.sectionId === "findings");
  assert.ok(finding);
  const sourceSpecificSentence = finding.prose
    .split(/(?<=。)/u)
    .find((sentence) => sentence.includes("大理市研究")) ?? "";
  assert.deepEqual(
    canonicalizeCitationMarkersInText(sourceSpecificSentence).match(/\[S\d+\]/gu),
    ["[S3]"],
  );
});

test("cross-language repair keeps substantive introduction literature and discussion evidence-bound", async () => {
  const supports = [
    "Using Landsat 8 imagery, the study derived NDVI, land surface temperature (LST), and urban heat island (UHI) patterns to prioritize green infrastructure.",
    "Multitemporal remote sensing and NDVI analysis in Zagreb found that urban morphology and construction types shaped land surface temperature variation and green-area cooling.",
    "ENVI-met simulations used sky view factor (SVF) to compare green roof vegetation coverage across closed, semi-open, and open urban spaces.",
    "Taiwan ReAnalysis Downscaling data (TReAD) and GIS were used to calculate urban heat island intensity (UHII) under Taiwan topographic conditions.",
  ];
  const acceptedSources = supports.map((abstract, index) =>
    source(index + 1, {
      title: `Urban heat evidence ${index + 1}`,
      abstract,
      doi: `10.1000/uhi-${index + 1}`,
      url: `https://doi.org/10.1000/uhi-${index + 1}`,
    })
  );
  const evidenceCards = acceptedSources.map((item, index) => ({
    id: `uhi-evidence-${index + 1}`,
    sourceId: item.id,
    claim: supports[index]!,
    claimText: supports[index]!,
    evidence: supports[index]!,
    supportSpan: supports[index]!,
    supportSpans: [{ claimId: `uhi-claim-${index + 1}`, text: supports[index]! }],
    summary: supports[index]!,
    relevance: "都市熱島與綠地調適",
    sourceTitle: item.title,
    sourceProvider: "Crossref",
    sourceAccessLevel: "abstract_only",
    extractionStatus: "abstract_extracted",
    evidenceType: "finding",
    citationMarker: `[S${index + 1}]`,
    citationText: `Researcher ${index + 1}（2024）[S${index + 1}]`,
    provider: "Crossref",
    doi: item.doi,
    abstract: item.abstract,
    year: item.year,
    relevanceScore: 92,
    sourceQualityScore: 88,
    finalScore: 90,
    usableSections: ["研究背景", "文獻探討", "討論"],
    sectionTargets: ["introduction", "literature_review", "discussion"],
    recommendationBucket: "scholarly_recommended" as const,
    sourceRole: "core_scholarly_evidence",
    isPeerReviewed: true,
    acceptedByUser: true,
    userDecision: "accepted_as_manual_review" as const,
    extractionMethod: "manual_review" as const,
    needsReview: false,
    needsManualReview: false,
    governanceFlags: ["exact_support_span_verified"],
    limitation: "來源目前依摘要整理，且沒有直接涵蓋台灣校園樣本。",
    limitations: ["來源目前依摘要整理，且沒有直接涵蓋台灣校園樣本。"],
  }));

  const repairedProse: Record<string, string> = {
    introduction: [
      "Chennai 研究以 Landsat 8 與 NDVI 辨識綠地不足和 urban heat island 的空間關係，因而提供研究背景的可觀察起點[S1]。",
      "Zagreb 的 remote sensing 與 NDVI 長期分析則顯示 urban morphology 是解釋熱環境差異時必須納入的情境[S2]。",
    ].join("\n\n"),
    literature_review: [
      "方法上，Chennai 研究同時使用 Landsat 8、NDVI 與 land surface temperature 來界定綠地介入的空間優先順序[S1]。",
      "Zagreb 的 multitemporal remote sensing 結果把 NDVI 與 urban morphology 並置，說明綠地降溫效果會隨城市型態而有差異[S2]。",
      "另一條文獻路徑以 ENVI-met 和 sky view factor（SVF）比較 green roof 情境，顯示研究尺度和空間類型不能直接互換[S3]。",
    ].join("\n\n"),
    discussion: [
      "跨來源比較時，Chennai 的 Landsat 8、NDVI 與 Zagreb 的 remote sensing、urban morphology 都支持必須把綠地與空間條件一起解釋，但兩者的分析尺度不同[S1][S2]。",
      "相較之下，ENVI-met 與 sky view factor（SVF）比較的是 green roof 情境，這種差異限制了將建築尺度結果直接應用到校園綠覆率的範圍[S3]。",
      "目前資料未直接涵蓋台灣校園樣本或本地制度情境，因此不能把其他地區或一般族群的結果直接外推到台灣校園。",
    ].join("\n\n"),
  };

  const result = await writeReportWithLlm(
    {
      topic: "台灣 urban heat island 與校園綠覆率的關聯",
      acceptedSources,
      evidenceCards,
      requestedSectionIds: ["introduction", "literature_review", "discussion"],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const system = request.messages.find((message) => message.role === "system")?.content ?? "";
        const user = request.messages.find((message) => message.role === "user")?.content ?? "";
        const retry = /Return exactly one JSON object/u.test(system);
        const requestedIds = ["introduction", "literature_review", "discussion"].filter((id) =>
          user.includes(id)
        );
        const sections = requestedIds.map((sectionId) => ({
          sectionId,
          title: sectionId,
          prose: retry
            ? repairedProse[sectionId]
            : `校園綠覆率必然每增加 10% 就使氣溫降低 5°C[S1]。\n\n綜合以上摘錄，共同部分可組成本節主軸，差異或未覆蓋處則留待後續檢驗。`,
          evidenceCardIds: evidenceCards.map((card) => card.id),
          citationIds: evidenceCards.map((card) => card.sourceId),
        }));
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ sections }) } }],
        }));
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sections.length, 3);
  assert.equal(result.writerDiagnostics?.fallbackSections, 0);
  assert.deepEqual(
    result.writerDiagnostics?.repairedSectionIds,
    ["introduction", "literature_review", "discussion"],
  );
  const readerText = result.sections.map((section) => section.prose).join("\n");
  assert.doesNotMatch(
    readerText,
    /綜合以上摘錄|目前來源尚不足以支持此結論|目前缺少足以支撐進一步實質判斷/u,
  );
  assert.doesNotMatch(readerText, /10%|5°C|必然每增加/u);
  assert.match(readerText, /Landsat 8.*NDVI/u);
  assert.match(readerText, /ENVI-met.*sky view factor/u);
  assert.match(
    result.sections.find((section) => section.sectionId === "discussion")?.prose ?? "",
    /不能把其他地區或一般族群的結果直接外推到台灣校園/u,
  );

  const evidenceIdByMarker = new Map(
    evidenceCards.map((card) => [card.citationMarker, card.id] as const),
  );
  const fingerprints = new Set<string>();
  for (const section of result.sections) {
    assert.ok(section.prose.split(/\n{2,}/u).filter(Boolean).length >= 2);
    const markers = canonicalizeCitationMarkersInText(section.prose).match(/\[S\d+\]/gu) ?? [];
    assert.ok(new Set(markers).size >= 2);
    for (const marker of markers) {
      const evidenceId = evidenceIdByMarker.get(marker);
      assert.ok(evidenceId, `unknown marker ${marker}`);
      assert.ok(section.evidenceCardIds.includes(evidenceId), `${marker} is not bound in ${section.sectionId}`);
    }
    for (const sentence of section.prose.split(/(?<=[。！？])/u)) {
      const fingerprint = sentence
        .replace(/\[S\d+\]/gu, "")
        .replace(/[\s\p{P}\p{S}]+/gu, "")
        .toLowerCase();
      if (fingerprint.length < 14) continue;
      assert.equal(fingerprints.has(fingerprint), false, `duplicate sentence in ${section.sectionId}`);
      fingerprints.add(fingerprint);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import type {
  ClaimCandidate,
  SourceCandidate,
} from "@workspace/api-zod/research-grounding";
import {
  acceptedClaimCandidates,
  capClaimCandidatesBySource,
  extractClaimsFromChunk,
  extractClaimsForSources,
} from "./claimExtractionService";
import {
  cleanExtractedTextChunk,
  scoreEvidenceRelevance,
} from "./evidencePipelineGuards";

function source(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: "source-1",
    workflowId: "wf-test",
    topicHash: "topic-hash",
    queryUsed: "sleep memory adolescents",
    queryIntent: "exact",
    provider: "openalex",
    title: "Sleep duration and adolescent memory performance",
    sourceType: "paper",
    isPeerReviewed: true,
    accessLevel: "full_text",
    extractionStatus: "text_extracted",
    extractionMethod: "html_readability",
    extractionMode: "html",
    canUseForClaims: true,
    canUseForReport: true,
    relevanceScore: 0.86,
    sourceQualityScore: 0.82,
    evidencePoints: [],
    limitations: [],
    usableSections: ["literature_review"],
    citationMarker: "[S1]",
    retrievalMode: "live_provider",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    reviewStatus: "accepted",
    dedupeKey: "source-1",
    createdAt: "2026-07-03T00:00:00.000Z",
    retrievedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

const chunk = {
  chunk_id: "source-1:chunk:1",
  text: "A longitudinal study found that shorter sleep duration was associated with poorer adolescent memory performance after adjustment for baseline learning measures.",
  source_location: "Results",
  section_heading: "Results",
  char_start: 0,
  char_end: 147,
};

test("extractClaimsFromChunk accepts strict JSON LLM claim candidates", async () => {
  const calls: string[] = [];
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      now: () => "2026-07-03T00:00:00.000Z",
      requestLlm: async (request) => {
        calls.push(request.featureName ?? "");
        return {
          content: JSON.stringify({
            claims: [
              {
                claimTextOriginal:
                  "Shorter sleep duration was associated with poorer adolescent memory performance.",
                claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
                claimType: "finding",
                supportSpanText:
                  "shorter sleep duration was associated with poorer adolescent memory performance",
                confidence: 0.83,
                relevanceToTopic: 0.91,
                usableSections: ["literature_review", "analysis", "discussion"],
                limitations: ["observational association"],
              },
            ],
          }),
          provider: "mock",
          model: "mock-model",
          baseUrl: "https://mock.invalid/v1",
          endpoint: "https://mock.invalid/v1/chat/completions",
          timeoutMs: 1000,
        };
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]?.status, "accepted");
  assert.equal(claims[0]?.extractionMode, "llm");
  assert.equal(claims[0]?.modelName, "mock-model");
  assert.equal(claims[0]?.claimType, "finding");
});

test("extractClaimsFromChunk supports a bounded independent feature bucket and output budget", async () => {
  const requests: Array<{
    featureName: string | undefined;
    maxTokens: number | undefined;
    timeoutMs: number | undefined;
  }> = [];
  await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-selected-source-qa",
    },
    {
      enableLlm: true,
      llmFeatureName: "research_grounding_selected_claim_extraction",
      llmMaxTokens: 1_600,
      llmTimeoutMs: 20_000,
      requestLlm: async (request) => {
        requests.push({
          featureName: request.featureName,
          maxTokens: request.maxTokens,
          timeoutMs: request.llm?.timeoutMs,
        });
        return {
          content: '{"claims":[]}',
          provider: "mock",
          model: "mock-model",
          baseUrl: "https://mock.invalid/v1",
          endpoint: "https://mock.invalid/v1/chat/completions",
          timeoutMs: 20_000,
        };
      },
    },
  );

  assert.deepEqual(requests, [
    {
      featureName: "research_grounding_selected_claim_extraction",
      maxTokens: 1_600,
      timeoutMs: 20_000,
    },
  ]);
});

test("extractClaimsFromChunk returns an empty list when LLM finds no supported claims", async () => {
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: '{"claims":[]}',
        provider: "mock",
        model: "mock-model",
        baseUrl: "https://mock.invalid/v1",
        endpoint: "https://mock.invalid/v1/chat/completions",
        timeoutMs: 1000,
      }),
    },
  );

  assert.deepEqual(claims, []);
});

test("extractClaimsFromChunk retries malformed JSON once and then uses rule fallback", async () => {
  let calls = 0;
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => {
        calls += 1;
        return {
          content: "not-json",
          provider: "mock",
          model: "mock-model",
          baseUrl: "https://mock.invalid/v1",
          endpoint: "https://mock.invalid/v1/chat/completions",
          timeoutMs: 1000,
        };
      },
    },
  );

  assert.equal(calls, 2);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]?.extractionMode, "rule_fallback");
  assert.equal(claims[0]?.structuredStudyFact?.studyDesign, "longitudinal_observational");
  assert.equal(claims[0]?.structuredStudyFact?.effectDirection, "negative");
  assert.deepEqual(claims[0]?.structuredStudyFact?.covariates, ["baseline learning measures"]);
});

test("extractClaimsForSources attaches one source-level Study Fact V2 envelope before Writer admission", async () => {
  const methods = "A cross-sectional survey included N=420 students and used adjusted regression analysis to evaluate sleep duration and academic performance.";
  const results = "Longer sleep duration was positively associated with academic performance (OR=1.62, 95% CI 1.20–2.18, p<0.01).";
  const candidate = source({
    extractedSections: [
      { heading: "Methods", text: methods, confidence: 0.9 },
      { heading: "Results", text: results, confidence: 0.9 },
    ],
    extractedChunks: [
      { chunk_id: "source-1:methods", text: methods, source_location: "Methods", section_heading: "Methods" },
      { chunk_id: "source-1:results", text: results, source_location: "Results", section_heading: "Results" },
    ],
    fullTextCharCount: methods.length + results.length,
  });
  const claims = await extractClaimsForSources({
    topic: "sleep duration and academic performance",
    workflowId: "wf-study-fact-v2",
    sources: [candidate],
  }, { enableLlm: false, maxChunksPerSource: 2 });
  const accepted = claims.find((claim) => claim.status === "accepted" && claim.structuredStudyFact);
  assert.ok(accepted?.structuredStudyFact);
  const envelope = (accepted?.structuredStudyFact as typeof accepted.structuredStudyFact & { studyFactV2?: Record<string, unknown> }).studyFactV2;
  assert.equal(envelope?.studyType, "OBSERVATIONAL_CROSS_SECTIONAL");
  assert.equal(envelope?.extractionVersion, "researchforge-study-fact-v2.0.0");
  assert.ok(Array.isArray(envelope?.quantitativeFacts));
});

test("stage-1 structured facts require exact per-field provenance before stage-2 claim admission", async () => {
  const support = "shorter sleep duration was associated with poorer adolescent memory performance";
  const claims = await extractClaimsFromChunk(
    { topic: "sleep duration and adolescent memory", source: source(), chunk, sourceIndex: 0, workflowId: "wf-facts" },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: JSON.stringify({ claims: [{
          claimTextOriginal: "Shorter sleep duration was associated with poorer adolescent memory performance.",
          claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          claimType: "finding",
          supportSpanText: support,
          confidence: 0.9,
          relevanceToTopic: 0.9,
          usableSections: ["analysis"],
          limitations: ["observational association"],
          structuredStudyFact: {
            studyDesign: "longitudinal_observational",
            studyDesignExplicit: true,
            population: "adolescents",
            exposure: "shorter sleep duration",
            outcome: "poorer memory performance",
            effectDirection: "negative",
            effectDirectionConfidence: 0.9,
            adjustedOrUnadjusted: "adjusted",
            covariates: ["baseline learning measures"],
            confounders: [], moderators: [], mediators: [], subgroups: [],
            primaryResult: support, secondaryResults: [], limitations: [], authorCautions: [], quantitativeFacts: [],
            fieldProvenance: Object.fromEntries([
              "studyDesign", "population", "exposure", "outcome", "effectDirection",
              "effectDirectionConfidence", "adjustedOrUnadjusted", "covariates", "primaryResult",
            ].map((field) => [field, { sourceSpanText: chunk.text, sectionOrLocation: "Results", page: null, confidence: 0.9, extractionMethod: "llm_structured_fact" }])),
            evidenceConfidence: 0.9,
            extractionMethod: "llm_structured_fact",
          },
        }] }),
        provider: "mock", model: "mock-model", baseUrl: "https://mock.invalid/v1",
        endpoint: "https://mock.invalid/v1/chat/completions", timeoutMs: 1000,
      }),
    },
  );
  const fact = claims[0]?.structuredStudyFact;
  assert.equal(fact?.studyDesign, "longitudinal_observational");
  assert.equal(fact?.population, "adolescents");
  assert.equal(fact?.effectDirection, "negative");
  assert.equal(fact?.fieldProvenance.outcome?.sourceId, "source-1");
});

test("structured extraction drops unsupported fields and never treats a covariate as a moderator", async () => {
  const claims = await extractClaimsFromChunk(
    { topic: "sleep duration and adolescent memory", source: source({ title: "Randomized controlled trial of sleep" }), chunk, sourceIndex: 0, workflowId: "wf-adversarial" },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: JSON.stringify({ claims: [{
          claimTextOriginal: "Shorter sleep duration was associated with poorer adolescent memory performance.",
          claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          claimType: "finding", supportSpanText: "shorter sleep duration was associated with poorer adolescent memory performance",
          confidence: 0.9, relevanceToTopic: 0.9, usableSections: ["analysis"], limitations: [],
          structuredStudyFact: {
            studyDesign: "randomized_controlled_trial", studyDesignExplicit: true,
            population: "adults", exposure: null, outcome: null, effectDirection: "unclear",
            effectDirectionConfidence: null, adjustedOrUnadjusted: "unknown",
            covariates: ["baseline learning measures"], confounders: [],
            moderators: [{ factor: "baseline learning measures", role: "covariate", effect: null, provenance: { sourceSpanText: chunk.text, sectionOrLocation: "Results", page: null, confidence: 0.8, extractionMethod: "llm_structured_fact" } }],
            mediators: [], subgroups: [], primaryResult: chunk.text, secondaryResults: [], limitations: [], authorCautions: [], quantitativeFacts: [],
            fieldProvenance: {
              studyDesign: { sourceSpanText: "text not present in the source", sectionOrLocation: "Title", page: null, confidence: 0.8, extractionMethod: "llm_structured_fact" },
              population: { sourceSpanText: "text not present in the source", sectionOrLocation: "Abstract", page: null, confidence: 0.8, extractionMethod: "llm_structured_fact" },
              covariates: { sourceSpanText: chunk.text, sectionOrLocation: "Results", page: null, confidence: 0.8, extractionMethod: "llm_structured_fact" },
              primaryResult: { sourceSpanText: chunk.text, sectionOrLocation: "Results", page: null, confidence: 0.8, extractionMethod: "llm_structured_fact" },
            }, evidenceConfidence: 0.8, extractionMethod: "llm_structured_fact",
          },
        }] }), provider: "mock", model: "mock-model", baseUrl: "https://mock.invalid/v1", endpoint: "https://mock.invalid/v1/chat/completions", timeoutMs: 1000,
      }),
    },
  );
  const fact = claims[0]?.structuredStudyFact;
  assert.equal(fact?.studyDesign, "unknown");
  assert.equal(fact?.population, null);
  assert.deepEqual(fact?.covariates, ["baseline learning measures"]);
  assert.deepEqual(fact?.moderators, []);
});

test("p-value alone does not manufacture effect direction and title does not manufacture design", async () => {
  const pChunk = { ...chunk, text: "The association had p = 0.01 after adjustment for age and sex." };
  const claims = await extractClaimsFromChunk(
    { topic: "an unfamiliar association", source: source({ title: "A randomized controlled trial" }), chunk: pChunk, sourceIndex: 0, workflowId: "wf-pvalue" },
    { enableLlm: false },
  );
  assert.equal(claims[0]?.structuredStudyFact?.effectDirection, "unclear");
  assert.equal(claims[0]?.structuredStudyFact?.studyDesign, "unknown");
  assert.deepEqual(claims[0]?.structuredStudyFact?.covariates, ["age", "sex"]);
});

test("extractClaimsFromChunk rejects claims without supportSpanText", async () => {
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: JSON.stringify({
          claims: [
            {
              claimTextOriginal: "Sleep affects memory.",
              claimTextZhTw: "睡眠會影響記憶。",
              claimType: "finding",
              confidence: 0.8,
              relevanceToTopic: 0.8,
            },
          ],
        }),
        provider: "mock",
        model: "mock-model",
        baseUrl: "https://mock.invalid/v1",
        endpoint: "https://mock.invalid/v1/chat/completions",
        timeoutMs: 1000,
      }),
    },
  );

  assert.equal(claims[0]?.status, "rejected");
  assert.equal(claims[0]?.rejectionReason, "missing_support_span");
});

test("metadata-only and failed extraction sources cannot produce accepted claims", async () => {
  const metadataClaims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source({
        accessLevel: "metadata_only",
        extractionStatus: "metadata_only",
        extractionMode: "metadata_only",
        canUseForClaims: false,
      }),
      chunk: {
        ...chunk,
        text: "Sleep duration and adolescent memory performance",
      },
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );
  const failedClaims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source({
        accessLevel: "failed_extraction",
        extractionStatus: "extraction_failed",
        extractionMode: "failed",
        canUseForClaims: false,
      }),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );

  assert.notEqual(metadataClaims[0]?.status, "accepted");
  assert.notEqual(failedClaims[0]?.status, "accepted");
});

test("acceptedClaimCandidates dedupes duplicate supported claims", () => {
  const base = {
    claimId: "claim-1",
    sourceId: "source-1",
    chunkId: "chunk-1",
    claimTextOriginal:
      "Shorter sleep duration was associated with poorer adolescent memory performance.",
    claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
    claimType: "finding" as const,
    supportSpanText:
      "shorter sleep duration was associated with poorer adolescent memory performance",
    citationMarker: "[S1]",
    confidence: 0.8,
    relevanceToTopic: 0.8,
    sourceQualityScore: 0.8,
    usableSections: ["literature_review" as const],
    limitations: [],
    extractionMode: "llm" as const,
    status: "accepted" as const,
    createdAt: "2026-07-03T00:00:00.000Z",
  };

  const deduped = acceptedClaimCandidates([
    base,
    { ...base, claimId: "claim-2", confidence: 0.7 },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.claimId, "claim-1");
});

test("boilerplate cleaning rejects navigation and moved notices before evidence extraction", async () => {
  const noisyChunk = {
    ...chunk,
    chunk_id: "source-1:chunk:boilerplate",
    text: [
      "Skip to main content",
      "SpringerOpen journals have moved to Springer Nature Link",
      "Browse Subject Areas",
      "Privacy policy",
    ].join("\n"),
  };
  const cleaned = cleanExtractedTextChunk({
    topic: "鋰電池在生活中的運用與原理",
    source: source({ title: "Lithium-ion battery applications" }),
    chunk: noisyChunk,
  });
  const claims = await extractClaimsFromChunk(
    {
      topic: "鋰電池在生活中的運用與原理",
      source: source({ title: "Lithium-ion battery applications" }),
      chunk: noisyChunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );

  assert.equal(cleaned.accepted, false);
  assert.equal(claims[0]?.status, "rejected");
  assert.match(claims[0]?.rejectionReason ?? "", /boilerplate|empty|rejected/u);
});

test("topic relevance accepts lithium sources and rejects healthcare or deep sea drift", () => {
  const topic = "鋰電池在生活中的運用與原理";
  const lithiumApp = scoreEvidenceRelevance({
    topic,
    title: "Lithium-ion battery applications in phones and electric vehicles",
    body: "Lithium-ion batteries have high energy density and are used in mobile phones, laptops, and electric vehicles.",
    source: source({
      title: "Lithium-ion battery applications in phones and electric vehicles",
      doi: "10.1000/lib",
    }),
  });
  const lithiumPrinciple = scoreEvidenceRelevance({
    topic,
    title: "Lithium-ion battery charge discharge principle",
    body: "Charge and discharge depend on lithium ions moving between cathode, anode, and electrolyte.",
    source: source({
      title: "Lithium-ion battery charge discharge principle",
      doi: "10.1000/principle",
    }),
  });
  const healthcare = scoreEvidenceRelevance({
    topic,
    title: "Big data in healthcare: management, analysis and future prospects",
    body: "This article discusses healthcare management and analytics platforms.",
    source: source({
      title:
        "Big data in healthcare: management, analysis and future prospects",
    }),
  });
  const deepSea = scoreEvidenceRelevance({
    topic,
    title: "PLOS deep sea wilderness conservation",
    body: "Deep sea wilderness areas are discussed as conservation priorities.",
    source: source({ title: "PLOS deep sea wilderness conservation" }),
  });

  assert.equal(lithiumApp.accepted, true);
  assert.equal(lithiumPrinciple.accepted, true);
  assert.equal(healthcare.accepted, false);
  assert.equal(deepSea.accepted, false);
  assert.match(healthcare.reason, /rejected/u);
});

test("topic relevance rejects generic land-use drift for green roof heat-island topics", () => {
  const topic = "都市綠屋頂是否能降低熱島效應";
  const greenRoof = scoreEvidenceRelevance({
    topic,
    title: "Green roofs and urban heat island mitigation",
    body: "Green roofs can reduce roof surface temperature and contribute to urban heat island mitigation in dense cities.",
    source: source({
      title: "Green roofs and urban heat island mitigation",
      doi: "10.1000/green-roof",
    }),
  });
  const landUseDrift = scoreEvidenceRelevance({
    topic,
    title:
      "Global land use changes are four times greater than previously estimated",
    body: "Quantifying the dynamics of land use change is critical for food security, climate change, and biodiversity loss.",
    source: source({
      title:
        "Global land use changes are four times greater than previously estimated",
      doi: "10.1000/land-use",
    }),
  });
  const districtHeatingDrift = scoreEvidenceRelevance({
    topic,
    title: "International review of district heating and cooling",
    body: "This review presents the current position for district heating and cooling in the world.",
    source: source({
      title: "International review of district heating and cooling",
      doi: "10.1000/district-heating",
    }),
  });

  assert.equal(greenRoof.accepted, true);
  assert.equal(landUseDrift.accepted, false);
  assert.equal(districtHeatingDrift.accepted, false);
  assert.match(landUseDrift.reason, /low topic relevance/u);
});

test("topic relevance requires plankton overlap for microplastic plankton topics", () => {
  const topic = "塑膠微粒對海洋浮游生物的影響";
  const planktonEvidence = scoreEvidenceRelevance({
    topic,
    title: "Microplastic ingestion by marine zooplankton",
    body: "Marine zooplankton can ingest microplastics, which may affect feeding behavior and planktonic food webs.",
    source: source({
      title: "Microplastic ingestion by marine zooplankton",
      doi: "10.1000/microplastic-plankton",
    }),
  });
  const humanSeafoodDrift = scoreEvidenceRelevance({
    topic,
    title: "Microplastics in Seafood and the Implications for Human Health",
    body: "This review describes microplastics in seafood and possible implications for human health.",
    source: source({
      title: "Microplastics in Seafood and the Implications for Human Health",
      doi: "10.1000/microplastic-seafood",
    }),
  });

  assert.equal(planktonEvidence.accepted, true);
  assert.equal(humanSeafoodDrift.accepted, false);
  assert.match(
    humanSeafoodDrift.reason,
    /missing_microplastic_plankton_overlap/u,
  );
});

test("topic relevance rejects attention-only NLP drift for caffeine attention topics", () => {
  const topic = "咖啡因攝取與注意力表現的關係";
  const caffeineAttention = scoreEvidenceRelevance({
    topic,
    title: "Caffeine and sustained attention performance",
    body: "Caffeine intake can improve vigilance and sustained attention in some experimental tasks.",
    source: source({
      title: "Caffeine and sustained attention performance",
      doi: "10.1000/caffeine-attention",
    }),
  });
  const nlpAttention = scoreEvidenceRelevance({
    topic,
    title: "Attention Is All You Need",
    body: "The dominant sequence transduction models use attention mechanisms in neural machine translation.",
    source: source({
      title: "Attention Is All You Need",
      doi: "10.1000/attention-nlp",
    }),
  });

  assert.equal(caffeineAttention.accepted, true);
  assert.equal(nlpAttention.accepted, false);
  assert.match(nlpAttention.reason, /missing_caffeine_requested_outcome_overlap/u);
});

test("multi-outcome caffeine topics admit a sleep result without pretending it also measured attention", () => {
  const result = scoreEvidenceRelevance({
    topic: "咖啡因攝取對高中生注意力與睡眠的影響",
    title: "Caffeine consuming children and adolescents show altered sleep behavior",
    body: "Regular caffeine consumption was associated with shorter sleep duration among adolescents.",
    source: source({ title: "Caffeine consuming children and adolescents show altered sleep behavior", doi: "10.1000/caffeine-sleep" }),
  });
  assert.equal(result.accepted, true);
});

test("topic relevance rejects clinical documentation drift for generative AI writing-learning topics", () => {
  const topic = "生成式 AI 對高中寫作學習的影響";
  const writingLearning = scoreEvidenceRelevance({
    topic,
    title: "Generative AI feedback in student writing instruction",
    body: "Generative AI writing feedback can shape students' revision strategies and writing learning in secondary education.",
    source: source({
      title: "Generative AI feedback in student writing instruction",
      doi: "10.1000/generative-ai-writing",
    }),
  });
  const clinicalDocumentation = scoreEvidenceRelevance({
    topic,
    title:
      "Harnessing Generative AI for Patient-Centric Clinical Note Generation",
    body: "Generative AI can draft clinical notes and help healthcare professionals focus on direct patient care.",
    source: source({
      title:
        "Harnessing Generative AI for Patient-Centric Clinical Note Generation",
      doi: "10.1000/clinical-ai-notes",
    }),
  });
  const healthcareEducation = scoreEvidenceRelevance({
    topic,
    title: "Generative AI in healthcare education",
    body: "Generative artificial intelligence can be used ethically to enhance healthcare workforce competence.",
    source: source({
      title: "Generative AI in healthcare education",
      doi: "10.1000/healthcare-ai-education",
    }),
  });

  assert.equal(writingLearning.accepted, true);
  assert.equal(clinicalDocumentation.accepted, false);
  assert.equal(healthcareEducation.accepted, false);
  assert.match(
    clinicalDocumentation.reason,
    /missing_generative_ai_writing_learning_overlap/u,
  );
});

test("rule fallback extracts conservative lithium application and principle claims", async () => {
  const lithiumSource = source({
    title: "Lithium-ion battery applications and charge discharge principle",
    doi: "10.1000/lithium",
    relevanceScore: 0.92,
  });
  const lithiumChunk = {
    ...chunk,
    chunk_id: "lithium:chunk:1",
    text: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。其充放电过程依赖锂离子在正负极之间迁移。",
  };

  const claims = await extractClaimsFromChunk(
    {
      topic: "鋰電池在生活中的運用與原理",
      source: lithiumSource,
      chunk: lithiumChunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );

  assert.equal(claims.length >= 2, true);
  assert.equal(
    claims.every((claim) => claim.status === "accepted"),
    true,
  );
  assert.equal(
    claims.every((claim) => claim.extractionMode === "rule_fallback"),
    true,
  );
  assert.ok(
    claims.some((claim) =>
      claim.supportSpanText?.includes("锂离子电池因能量密度高"),
    ),
  );
  assert.ok(
    claims.some((claim) =>
      claim.supportSpanText?.includes("充放电过程依赖锂离子"),
    ),
  );
  assert.equal(
    claims.every((claim) => claim.confidence <= 0.55),
    true,
  );
});

test("global claim cap preserves source diversity instead of favoring early chunks", () => {
  const claim = (sourceId: string, index: number) =>
    ({
      claimId: `${sourceId}-${index}`,
      sourceId,
    }) as ClaimCandidate;
  const capped = capClaimCandidatesBySource(
    [
      ...Array.from({ length: 6 }, (_, index) => claim("source-1", index)),
      ...Array.from({ length: 3 }, (_, index) => claim("source-2", index)),
      ...Array.from({ length: 3 }, (_, index) => claim("source-3", index)),
    ],
    ["source-1", "source-2", "source-3"],
    6,
  );
  assert.deepEqual(
    capped.map((item) => item.claimId),
    ["source-1-0", "source-2-0", "source-3-0", "source-1-1", "source-2-1", "source-3-1"],
  );
});

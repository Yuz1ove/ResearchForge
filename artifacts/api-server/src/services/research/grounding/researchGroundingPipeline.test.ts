import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import type { ClaimCandidate, SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  analyzeTopicInput,
  academicRetryQueryExpansion,
  buildGroundingEvidenceCards,
  buildSourceCandidates,
  buildGroundingQueryPlan,
  buildSeedQueryPlan,
  collectLexicalSignals,
  classifySourceCandidate,
  compareTitleSemantics,
  findLegacyGenericTraces,
  parseResearchTitleSentence,
  reviewAcademicSafety,
  runResearchGroundingPipeline,
  suppressLegacyGenericOutput,
} from "./researchGroundingPipeline";
import { normalizeResearchTopic } from "./normalizeResearchTopic";
import { parseResearchInput } from "@workspace/api-zod/research-intent";

function sourceRecord(input: Partial<SourceRecord> & { id: string; title: string }): SourceRecord {
  return {
    id: input.id,
    title: input.title,
    authors: input.authors ?? ["A. Researcher"],
    year: input.year ?? 2024,
    abstract: input.abstract ?? null,
    doi: input.doi ?? null,
    url: input.url ?? null,
    sourceType: input.sourceType ?? "OpenAlex",
    reviewState: input.reviewState ?? "pending",
    publisher: input.publisher ?? null,
    containerTitle: input.containerTitle ?? "Journal of Testing",
    accessedAt: input.accessedAt ?? null,
    provider: input.provider ?? input.sourceType ?? "OpenAlex",
    queryUsed: input.queryUsed ?? null,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    dedupeKey: input.dedupeKey ?? input.id,
    sourceKind: input.sourceKind ?? "journal",
    citationCount: input.citationCount ?? 42,
    isOpenAccess: input.isOpenAccess ?? true,
    isPeerReviewed: input.isPeerReviewed ?? true,
    sourceQualityScore: input.sourceQualityScore ?? null,
    relevanceScore: input.relevanceScore ?? null,
    workflowId: input.workflowId ?? null,
    topicHash: input.topicHash ?? null,
    queryPlanHash: input.queryPlanHash ?? null,
  };
}

function classifyFixture(
  overrides: Partial<Parameters<typeof classifySourceCandidate>[0]>,
) {
  return classifySourceCandidate(
    {
      sourceId: "fixture-source",
      provider: "openalex",
      retrievalMode: "live_provider",
      title: "Rayleigh scattering and sunset color",
      venue: "Atmospheric Optics",
      doi: "10.1000/rayleigh",
      url: "https://doi.org/10.1000/rayleigh",
      abstractOriginal:
        "Rayleigh scattering explains wavelength-dependent sky and sunset color.",
      sourceType: "paper",
      isPeerReviewed: true,
      relevanceScore: 0.92,
      sourceQualityScore: 0.9,
      reviewStatus: "accepted",
      ...overrides,
    },
    "sunset color wavelength Rayleigh scattering",
    {
      negativeKeywords: ["wallpaper", "photography"],
      excludedDriftTerms: ["wallpaper", "photography"],
    },
  );
}

function sourceCandidateFixture(
  overrides: Partial<SourceCandidate> & { sourceId: string; title: string },
): SourceCandidate {
  const { sourceId, title, ...rest } = overrides;
  return {
    sourceId,
    workflowId: "wf-test",
    topicHash: "topic-hash",
    queryUsed: "sunset color wavelength Rayleigh scattering",
    queryIntent: "academic",
    provider: "openalex",
    title,
    authors: ["A. Researcher"],
    year: 2024,
    venue: "Atmospheric Optics",
    doi: "10.1000/rayleigh",
    url: "https://doi.org/10.1000/rayleigh",
    abstractOriginal:
      "Rayleigh scattering explains wavelength-dependent sky and sunset color.",
    sourceType: "paper",
    isPeerReviewed: true,
    relevanceScore: 0.92,
    sourceQualityScore: 0.9,
    retrievalMode: "live_provider",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    reviewStatus: "accepted",
    evidencePoints: ["Rayleigh scattering explains sunset color."],
    limitations: [],
    usableSections: ["literature_review", "findings", "discussion"],
    citationMarker: "[1]",
    dedupeKey: sourceId,
    createdAt: "2026-01-01T00:00:00.000Z",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}

test("classifySourceCandidate bucket fixtures preserve source governance boundaries", () => {
  assert.equal(
    classifyFixture({ provider: "openalex" }).recommendationBucket,
    "scholarly_recommended",
  );
  assert.equal(
    classifyFixture({ provider: "crossref" }).recommendationBucket,
    "scholarly_recommended",
  );
  assert.equal(
    classifyFixture({
      provider: "web",
      retrievalMode: "trusted_seed",
      title: "Why Is the Sky Blue?",
      venue: "NASA Space Place",
      doi: "",
      url: "https://spaceplace.nasa.gov/blue-sky/",
      sourceType: "official",
      isPeerReviewed: false,
      rawProviderPayload: { publisher: "NASA" },
    }).recommendationBucket,
    "official_background",
  );
  assert.equal(
    classifyFixture({
      provider: "web",
      retrievalMode: "trusted_seed",
      title: "NOAA / UCAR atmospheric background",
      venue: "UCAR Learning Zone",
      doi: "",
      url: "https://scied.ucar.edu/learning-zone/atmosphere",
      sourceType: "education",
      isPeerReviewed: false,
      rawProviderPayload: { publisher: "NOAA UCAR" },
    }).recommendationBucket,
    "official_background",
  );
  assert.notEqual(
    classifyFixture({
      provider: "web",
      retrievalMode: "live_provider",
      title: "Sunset color blog with many keywords",
      venue: "Personal Blog",
      doi: "",
      url: "https://blog.example/sunset-color",
      sourceType: "web",
      isPeerReviewed: false,
      sourceQualityScore: 0.6,
    }).recommendationBucket,
    "scholarly_recommended",
  );
  assert.equal(
    classifyFixture({
      title: "Sunset wallpaper photography collection",
      abstractOriginal: "Beautiful sunset wallpaper photography.",
      relevanceScore: 0.1,
    }).recommendationBucket,
    "rejected",
  );
  assert.equal(
    classifyFixture({
      provider: "semanticScholar",
      doi: "",
      venue: "arXiv",
      sourceType: "paper",
      isPeerReviewed: false,
      rawProviderPayload: { publicationType: "preprint" },
    }).recommendationBucket,
    "manual_review",
  );
  assert.notEqual(
    classifyFixture({
      provider: "web",
      retrievalMode: "trusted_seed",
      title: "NASA sunset wallpaper",
      venue: "NASA",
      doi: "",
      sourceType: "official",
      isPeerReviewed: false,
      rawProviderPayload: { publisher: "NASA" },
    }).recommendationBucket,
    "official_background",
  );
});

test("classifySourceCandidate keeps manual review accepted decisions separate from bucket", () => {
  const candidate = {
    ...classifyFixture({
      provider: "web",
      retrievalMode: "live_provider",
      title: "Sunset color expert blog",
      venue: "Personal Blog",
      doi: "",
      sourceType: "web",
      isPeerReviewed: false,
      sourceQualityScore: 0.6,
    }),
    acceptedByUser: true,
    userDecision: "accepted_as_manual_review" as const,
    acceptedAs: "manual_review",
  };

  assert.equal(candidate.recommendationBucket, "manual_review");
  assert.equal(candidate.acceptedByUser, true);
  assert.equal(candidate.userDecision, "accepted_as_manual_review");
  assert.notEqual(candidate.recommendationBucket, "scholarly_recommended");
});

test("buildGroundingEvidenceCards keeps accepted source governance and excludes review-only manual sources", () => {
  const official = sourceCandidateFixture({
    sourceId: "official-1",
    provider: "web",
    retrievalMode: "trusted_seed",
    title: "NASA atmospheric optics background",
    venue: "NASA",
    doi: "",
    url: "https://science.nasa.gov/atmosphere",
    sourceType: "official",
    reviewStatus: "accepted" as const,
    abstractOriginal: "",
    abstractZh: "",
    isPeerReviewed: false,
    recommendationBucket: "official_background" as const,
    sourceRole: "official_background_explanation" as const,
    sourceQualityScore: 0.8,
    limitations: [],
    rawProviderPayload: { publisher: "NASA" },
  });
  const manualAccepted = sourceCandidateFixture({
    sourceId: "manual-accepted",
    provider: "web",
    retrievalMode: "live_provider",
    title: "Expert explainer on atmospheric optics",
    venue: "Expert Blog",
    doi: "",
    sourceType: "web",
    isPeerReviewed: false,
    sourceQualityScore: 0.6,
    recommendationBucket: "manual_review" as const,
    sourceRole: "weak_or_uncertain" as const,
    reviewStatus: "accepted" as const,
    acceptedByUser: true,
    userDecision: "accepted_as_manual_review" as const,
    acceptedAs: "manual_review",
  });
  const manualReviewOnly = {
    ...manualAccepted,
    sourceId: "manual-review-only",
    dedupeKey: "manual-review-only",
    reviewStatus: "review" as const,
    acceptedByUser: false,
    userDecision: "pending" as const,
    acceptedAs: undefined,
  };

  const cards = buildGroundingEvidenceCards({
    workflowId: "wf-evidence-governance",
    topicHash: "topic-hash",
    acceptedSources: [official, manualAccepted, manualReviewOnly],
    safetyReview: reviewAcademicSafety({ topic: "夕陽顏色與瑞利散射" }),
  });

  assert.equal(cards.some((card) => card.sourceId === "official-1"), false);
  assert.equal(cards.some((card) => card.sourceId === "manual-accepted"), true);
  assert.equal(cards.some((card) => card.sourceId === "manual-review-only"), false);
  assert.equal(cards.every((card) => card.source_access_level !== "metadata_only"), true);
});

test("buildGroundingEvidenceCards does not turn metadata-only titles into evidence cards", () => {
  const metadataOnly = sourceCandidateFixture({
    sourceId: "metadata-only",
    title: "Rayleigh scattering metadata record",
    abstractOriginal: "",
    abstractZh: "",
    accessLevel: "metadata_only",
    extractionStatus: "skipped",
    extractionMethod: "metadata_only",
    sourceUseLevel: "metadata_context_only",
    evidencePoints: [],
    limitations: ["NO_READABLE_BODY"],
  });

  const cards = buildGroundingEvidenceCards({
    workflowId: "wf-metadata-only",
    topicHash: "topic-hash",
    acceptedSources: [metadataOnly],
    safetyReview: reviewAcademicSafety({ topic: "夕陽顏色與瑞利散射" }),
  });

  assert.equal(cards.length, 0);
});

test("buildGroundingEvidenceCards caps abstract-only sources at two abstract evidence cards", () => {
  const abstractOnly = sourceCandidateFixture({
    sourceId: "abstract-only",
    title: "Abstract-only Rayleigh scattering study",
    abstractOriginal:
      "Rayleigh scattering provides a wavelength-dependent mechanism for sky and sunset color in long atmospheric paths. The abstract also notes that aerosols and clouds can modify observed color and limit a single-factor explanation. A third sentence should not become a third evidence card for abstract-only access.",
    accessLevel: "abstract_only",
    extractionStatus: "skipped",
    extractionMethod: "abstract_only",
    sourceUseLevel: "citable_abstract",
  });

  const cards = buildGroundingEvidenceCards({
    workflowId: "wf-abstract-only",
    topicHash: "topic-hash",
    acceptedSources: [abstractOnly],
    safetyReview: reviewAcademicSafety({ topic: "夕陽顏色與瑞利散射" }),
  });

  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.source_access_level), ["abstract_only", "abstract_only"]);
  assert.deepEqual(cards.map((card) => card.source_location), ["abstract", "abstract"]);
  assert.equal(cards.every((card) => card.confidence <= 0.55), true);
});

test("buildGroundingEvidenceCards turns extracted full-text chunks into traceable evidence cards", () => {
  const fullText = sourceCandidateFixture({
    sourceId: "fulltext-rayleigh",
    title: "Full text Rayleigh scattering study",
    accessLevel: "full_text",
    extractionStatus: "success",
    extractionMethod: "html_readability",
    sourceUseLevel: "citable_full_text",
    contentHash: "content-hash-123",
    extractedChunks: [
      {
        chunk_id: "fulltext-rayleigh:chunk:1",
        text:
          "Rayleigh scattering is a wavelength-dependent mechanism that preferentially removes short-wavelength light from the direct solar beam during long atmospheric paths.",
        source_location: "Mechanism",
        section_heading: "Mechanism",
        char_start: 0,
        char_end: 155,
      },
      {
        chunk_id: "fulltext-rayleigh:chunk:2",
        text:
          "The method compares clear-sky atmospheric-path observations with spectral attenuation patterns to separate scattering effects from local aerosol changes.",
        source_location: "Method",
        section_heading: "Method",
        char_start: 156,
        char_end: 302,
      },
      {
        chunk_id: "fulltext-rayleigh:chunk:3",
        text:
          "The results show a stronger red-orange component near sunset when shorter wavelengths are scattered out of the observer's direct line of sight.",
        source_location: "Findings",
        section_heading: "Findings",
        char_start: 303,
        char_end: 447,
      },
    ],
  });

  const cards = buildGroundingEvidenceCards({
    workflowId: "wf-fulltext",
    topicHash: "topic-hash",
    acceptedSources: [fullText],
    safetyReview: reviewAcademicSafety({ topic: "夕陽顏色與瑞利散射" }),
  });

  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.source_access_level), ["full_text", "full_text", "full_text"]);
  assert.equal(cards[0]?.citation_marker, "[S1]");
  assert.equal(cards[0]?.chunkId, "fulltext-rayleigh:chunk:1");
  assert.match(cards[0]?.quoted_text ?? "", /wavelength-dependent mechanism/u);
  assert.equal(cards[0]?.trace?.content_hash, "content-hash-123");
  assert.equal(cards.some((card) => card.evidence_type === "method"), true);
  assert.equal(cards.some((card) => card.evidence_type === "finding"), true);
});

test("buildGroundingEvidenceCards augments scarce accepted claims with reviewed support-span cards", () => {
  const supportSpan =
    "Rayleigh scattering is a wavelength-dependent mechanism that preferentially removes short-wavelength light from the direct solar beam during long atmospheric paths.";
  const fullText = sourceCandidateFixture({
    sourceId: "fulltext-rayleigh-claims",
    title: "Full text Rayleigh scattering study",
    accessLevel: "full_text",
    extractionStatus: "success",
    extractionMethod: "html_readability",
    sourceUseLevel: "citable_full_text",
    extractedChunks: [
      {
        chunk_id: "fulltext-rayleigh-claims:chunk:1",
        text: supportSpan,
        source_location: "Mechanism",
        section_heading: "Mechanism",
        char_start: 0,
        char_end: supportSpan.length,
      },
      {
        chunk_id: "fulltext-rayleigh-claims:chunk:2",
        text:
          "The results show a stronger red-orange component near sunset when shorter wavelengths are scattered out of the observer's direct line of sight.",
        source_location: "Findings",
        section_heading: "Findings",
        char_start: supportSpan.length + 1,
        char_end: supportSpan.length + 145,
      },
    ],
  });
  const claim: ClaimCandidate = {
    claimId: "claim-rayleigh-1",
    sourceId: fullText.sourceId,
    chunkId: "fulltext-rayleigh-claims:chunk:1",
    workflowId: "wf-claim-augment",
    claimTextOriginal: supportSpan,
    claimTextZhTw: supportSpan,
    claimType: "mechanism",
    supportSpanText: supportSpan,
    supportSpanStartOffset: 0,
    supportSpanEndOffset: supportSpan.length,
    sectionHeading: "Mechanism",
    citationMarker: "[S1]",
    confidence: 0.82,
    relevanceToTopic: 0.84,
    sourceQualityScore: 0.9,
    usableSections: ["literature_review", "analysis"],
    limitations: [],
    extractionMode: "llm",
    status: "accepted",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const cards = buildGroundingEvidenceCards({
    workflowId: "wf-claim-augment",
    topicHash: "topic-hash",
    topic: "Rayleigh scattering sunset color",
    acceptedSources: [fullText],
    claimCandidates: [claim],
    safetyReview: reviewAcademicSafety({ topic: "Rayleigh scattering sunset color" }),
  });

  assert.equal(cards.length >= 2, true);
  assert.equal(cards.some((card) => card.extractionMethod === "llm_structured_extract"), true);
  assert.equal(cards.some((card) => card.extractionMethod === "rule_fallback_claim_extraction"), true);
  assert.equal(cards.every((card) => Boolean(card.supportSpan)), true);
  assert.equal(
    cards.filter((card) => card.extractionMethod === "rule_fallback_claim_extraction").every((card) => card.needsReview),
    true,
  );
});

test("classifySourceCandidate applies CORE adapter contract conservatively", () => {
  assert.equal(
    classifyFixture({
      provider: "core",
      retrievalMode: "supplemental_fulltext_or_repository",
      doi: "10.1000/core-rayleigh",
      venue: "Journal of Atmospheric Optics",
      sourceType: "paper",
      isPeerReviewed: true,
    }).recommendationBucket,
    "scholarly_recommended",
  );
  assert.equal(
    classifyFixture({
      provider: "core",
      retrievalMode: "supplemental_fulltext_or_repository",
      doi: "",
      venue: "",
      sourceType: "paper",
      isPeerReviewed: false,
      relevanceScore: 0.95,
      sourceQualityScore: 0.8,
    }).recommendationBucket,
    "manual_review",
  );
});

function mockedGroundingSearchResult(
  input: {
    topic: string;
    originalTopic?: string;
    workflowId?: string;
    querySeedZh?: string[];
    querySeedEn?: string[];
  },
  sources: SourceRecord[],
  concepts: {
    primaryConcepts: string[];
    mustHaveTerms: string[];
  },
) {
  const querySeedZh = input.querySeedZh ?? [];
  const querySeedEn = input.querySeedEn ?? [];
  const providerGroups = [
    {
      ok: true,
      provider: "OpenAlex",
      query: querySeedEn[0] ?? input.topic,
      results: sources,
      error_type: null,
      error_message: null,
    },
  ];
  return {
    ok: true,
    topic: input.topic,
    workflowId: input.workflowId ?? "wf-mocked-search",
    topicHash: "topic-hash",
    queryPlanHash: "query-plan-hash",
    searchIntent: {
      primaryConcepts: concepts.primaryConcepts,
      contextConcepts: [],
      outcomeConcepts: [],
      populationConcepts: [],
      lowWeightTerms: [],
      mustHaveTerms: concepts.mustHaveTerms,
      plannerStatus: "rule_fallback",
      fallbackUsed: false,
    },
    queries: {
      coreConcepts: concepts.primaryConcepts,
      chinese: querySeedZh,
      english: querySeedEn,
      highPrecision: querySeedEn.slice(0, 2),
      broad: querySeedEn.slice(0, 2),
      coreEnglishAcademic: querySeedEn,
      academicSynonyms: [],
      education: [],
      chineseSupplemental: querySeedZh,
      fallbackRelaxed: querySeedEn.slice(0, 2),
      phases: [],
    },
    results: sources,
    sources,
    provider_status: providerGroups,
    warnings: [],
    planner: {
      normalizedTopic: input.topic,
      primaryConcepts: concepts.primaryConcepts,
      contextConcepts: [],
      outcomeConcepts: [],
      populationConcepts: [],
      lowWeightTerms: [],
      mustHaveTerms: concepts.mustHaveTerms,
      shouldHaveTerms: [],
      penaltyTerms: [],
      negativeTerms: [],
      chineseQueries: querySeedZh,
      englishQueries: querySeedEn,
      reasoningNotes: [],
      plannerStatus: "rule_fallback",
      fallbackUsed: false,
    },
    searchTrace: {
      workflowId: input.workflowId ?? "wf-mocked-search",
      topic: input.topic,
      originalTopic: input.originalTopic ?? input.topic,
      activeResearchTopic: input.topic,
      canonicalEnglishTopic: querySeedEn[0] ?? "",
      normalizedTopic: input.topic,
      topicHash: "topic-hash",
      queryPlanHash: "query-plan-hash",
      providerQueries: [querySeedEn[0] ?? input.topic],
      candidateCount: sources.length,
      dedupedCount: sources.length,
      acceptedCount: sources.length,
      rejectedCount: 0,
      sourceDecisions: [],
    },
    diagnostics: {
      original_topic: input.originalTopic ?? input.topic,
      active_research_topic: input.topic,
      canonical_english_topic: querySeedEn[0] ?? "",
      core_concepts: concepts.primaryConcepts,
      english_queries: querySeedEn,
      chinese_queries: querySeedZh,
      fallback_relaxed_queries: querySeedEn.slice(0, 2),
      provider_search_results_count: sources.length,
      filtered_results_count: 0,
      rejection_reasons: {},
      provider_status: providerGroups.map((group) => ({
        provider: group.provider,
        query: group.query,
        ok: group.ok,
        result_count: group.results.length,
        error_type: group.error_type,
        error_message: group.error_message,
      })),
      warnings: [],
      retrieved_count: sources.length,
      deduped_count: sources.length,
      rejected_count: 0,
      candidate_count: sources.length,
      displayed_count: sources.length,
      primary_candidate_count: sources.length,
    },
    llm_status: "skipped",
    keyword_expansion: {
      normalized_topic: input.topic,
      domains: ["academic"],
      search_queries: querySeedEn,
      english_queries: querySeedEn,
      chinese_queries: querySeedZh,
      preferred_source_types: ["journal"],
      avoid_source_types: [],
      reasoning_notes: [],
      fallback_used: false,
      llm_status: "skipped",
    },
    groups: providerGroups,
    status: "ok",
    queryCount: querySeedEn.length,
  } as any;
}

function academicSourceSet(
  topicTerms: {
    query: string;
    titlePrefix: string;
    abstractTerms: string;
  },
  count = 6,
): SourceRecord[] {
  return Array.from({ length: count }, (_, index) =>
    sourceRecord({
      id: `${topicTerms.titlePrefix}-${index + 1}`,
      title: `${topicTerms.titlePrefix} ${index + 1}: ${topicTerms.query}`,
      abstract: `${topicTerms.abstractTerms} This metadata record includes the core concepts, academic context, DOI, wavelength, atmospheric scattering, student writing, citation accuracy, or source attribution as applicable.`,
      doi: `10.1000/${topicTerms.titlePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
      url: `https://doi.org/10.1000/${topicTerms.titlePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
      queryUsed: topicTerms.query,
      relevanceScore: 92 - index,
      sourceQualityScore: 88,
      sourceType: index % 2 === 0 ? "OpenAlex" : "Crossref",
      provider: index % 2 === 0 ? "OpenAlex" : "Crossref",
      sourceKind: "journal",
      isOpenAccess: true,
    }),
  );
}

function sunsetOfficialBackgroundSources(): SourceRecord[] {
  return [
    sourceRecord({
      id: "trusted:nasa-space-place-blue-sky",
      title: "Why Is the Sky Blue?",
      authors: ["NASA Space Place"],
      year: null,
      abstract:
        "NASA Space Place explains that sunlight is scattered by gases and particles in Earth's atmosphere, with shorter blue wavelengths scattering more strongly than longer red wavelengths.",
      doi: null,
      url: "https://spaceplace.nasa.gov/blue-sky/",
      sourceType: "Official Source",
      provider: "NASA",
      publisher: "NASA",
      containerTitle: "NASA Space Place",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 88,
      sourceQualityScore: 84,
    }),
    sourceRecord({
      id: "trusted:ucar-appearance-of-sky",
      title: "The Appearance of the Sky",
      authors: ["UCAR Center for Science Education"],
      year: null,
      abstract:
        "UCAR describes how Rayleigh scattering by atmospheric molecules separates sunlight into wavelengths and how aerosols can increase colorful skies near sunrise and sunset.",
      doi: null,
      url: "https://scied.ucar.edu/learning-zone/atmosphere/appearance-sky",
      sourceType: "Institutional Source",
      provider: "UCAR",
      publisher: "UCAR Center for Science Education",
      containerTitle: "UCAR Learning Zone",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 86,
      sourceQualityScore: 84,
    }),
    sourceRecord({
      id: "trusted:noaa-gml-red-sky",
      title: "Red Sky in the Morning",
      authors: ["NOAA Global Monitoring Laboratory"],
      year: null,
      abstract:
        "NOAA GML explains that shorter blue wavelengths and longer red wavelengths scatter differently in clean air and aerosol-rich air, changing sky and sunset colors.",
      doi: null,
      url: "https://gml.noaa.gov/grad/about/redsky/",
      sourceType: "Official Source",
      provider: "NOAA",
      publisher: "NOAA Global Monitoring Laboratory",
      containerTitle: "NOAA GML",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 85,
      sourceQualityScore: 84,
    }),
    sourceRecord({
      id: "trusted:noaa-nesdis-sky-blue",
      title: "Why Is the Sky Blue?",
      authors: ["NOAA NESDIS"],
      year: null,
      abstract:
        "NOAA NESDIS gives visible-light wavelength context for explaining atmospheric scattering and sky color.",
      doi: null,
      url: "https://www.nesdis.noaa.gov/about/k-12-education/atmosphere/why-the-sky-blue",
      sourceType: "Official Source",
      provider: "NOAA",
      publisher: "NOAA NESDIS",
      containerTitle: "NOAA K-12 Education",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 84,
      sourceQualityScore: 82,
    }),
    sourceRecord({
      id: "trusted:nasa-giss-aerosols-atmosphere",
      title: "Aerosols in the Atmosphere",
      authors: ["NASA Goddard Institute for Space Studies"],
      year: 1997,
      abstract:
        "NASA GISS educational material explains that sunsets and sunrises appear reddish because shorter blue wavelengths are removed by scattering over a long atmospheric path.",
      doi: null,
      url: "https://www.giss.nasa.gov/edu/icp/research/ppa/1997/reyes/",
      sourceType: "Official Source",
      provider: "NASA GISS",
      publisher: "NASA GISS",
      containerTitle: "NASA GISS Education",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 84,
      sourceQualityScore: 82,
    }),
  ];
}

test("normalizeResearchTopic rewrites sunset wavelength topic into bilingual atmospheric optics queries", () => {
  const normalized = normalizeResearchTopic("探討夕陽餘暉之光波長關係", "zh-TW");

  assert.equal(normalized.originalQuery, "探討夕陽餘暉之光波長關係");
  assert.ok(normalized.zhAcademicQuery[0]?.includes("瑞利散射"));
  assert.ok(normalized.enAcademicQuery.some((query) => /Rayleigh scattering/i.test(query)));
  assert.ok(normalized.enAcademicQuery.some((query) => /sunset color/i.test(query)));
  assert.ok(normalized.enAcademicQuery.some((query) => /atmospheric scattering/i.test(query)));
  assert.ok(normalized.enAcademicQuery.some((query) => /wavelength/i.test(query)));
  assert.ok(normalized.negativeKeywords.includes("photography"));
});

test("normalizeResearchTopic rewrites panda terminology topic into bilingual taxonomy and naming queries", () => {
  const normalized = normalizeResearchTopic("熊貓與貓熊的關係", "zh-TW");

  assert.equal(normalized.originalQuery, "熊貓與貓熊的關係");
  assert.equal(normalized.displayTitle, "熊貓與貓熊的關係");
  assert.match(normalized.normalizedTopicZh ?? "", /熊貓與貓熊名稱差異/u);
  assert.ok(normalized.zhAcademicQuery.some((query) => /熊貓 貓熊 名稱 差異/u.test(query)));
  assert.ok(normalized.zhAcademicQuery.some((query) => /大熊貓 小熊貓 分類 關係/u.test(query)));
  assert.ok(normalized.enAcademicQuery.length >= 3);
  assert.ok(
    normalized.enAcademicQuery.some((query) =>
      /giant panda red panda taxonomy naming history/i.test(query),
    ),
  );
  assert.ok(
    normalized.enAcademicQuery.some((query) =>
      /panda cat-bear Chinese terminology/i.test(query),
    ),
  );
  assert.ok(
    normalized.enAcademicQuery.some((query) =>
      /Ailuropoda melanoleuca.*Ailurus fulgens/i.test(query),
    ),
  );
  assert.ok(normalized.keywordSet.some((term) => /giant panda/i.test(term)));
  assert.ok(normalized.keywordSet.some((term) => /red panda/i.test(term)));
  assert.ok(normalized.keywordSet.some((term) => /分類學/u.test(term)));
});

test("normalizeResearchTopic expands common Chinese Step 2 topics into bilingual academic queries", () => {
  const cases: Array<{
    topic: string;
    expectedZh: RegExp;
    expectedEn: RegExp;
    expectedTerms: RegExp[];
    expectedNegative?: RegExp;
  }> = [
    {
      topic: "風箏飛行原理",
      expectedZh: /風箏 空氣動力學 升力 阻力/u,
      expectedEn: /kite aerodynamics lift drag tethered flight/i,
      expectedTerms: [/aerodynamics/i, /lift/i, /drag/i, /tethered flight/i],
      expectedNegative: /toy shopping/i,
    },
    {
      topic: "我想了解風箏為什麼可以飛起來，以及風速和拉力會怎麼影響飛行穩定",
      expectedZh: /風箏 風速 拉力 飛行穩定/u,
      expectedEn: /kite flight mechanics wind speed stability/i,
      expectedTerms: [/line tension/i, /wind speed/i, /flight stability/i],
      expectedNegative: /kite festival travel/i,
    },
    {
      topic: "鳥類與其餵食方式",
      expectedZh: /鳥類 覓食行為 食性/u,
      expectedEn: /bird feeding behavior avian foraging ecology/i,
      expectedTerms: [/avian/i, /foraging/i, /feeding ecology/i, /trophic/i],
    },
    {
      topic: "牙菌斑的產生及對應治療方式",
      expectedZh: /牙菌斑 產生 對應治療方式/u,
      expectedEn: /dental plaque formation treatment oral biofilm/i,
      expectedTerms: [/牙菌斑/u, /口腔生物膜/u, /dental plaque/i, /oral biofilm/i],
    },
    {
      topic: "狗的護食行為與教育方式",
      expectedZh: /狗 護食 行為 教育方式/u,
      expectedEn: /dog resource guarding food aggression behavior modification/i,
      expectedTerms: [/狗/u, /犬/u, /護食/u, /resource guarding/i, /food aggression/i],
      expectedNegative: /dog food product|guard dog|police dog/i,
    },
  ];

  for (const item of cases) {
    const normalized = normalizeResearchTopic(item.topic, "zh-TW");
    assert.equal(normalized.originalQuery, item.topic);
    assert.equal(normalized.displayTitle, item.topic);
    assert.match(normalized.zhAcademicQuery.join(" "), item.expectedZh);
    assert.match(normalized.enAcademicQuery.join(" "), item.expectedEn);
    for (const expectedTerm of item.expectedTerms) {
      assert.match(normalized.keywordSet.join(" "), expectedTerm);
    }
    if (item.expectedNegative) {
      assert.match(normalized.negativeKeywords.join(" "), item.expectedNegative);
    }
  }
});

test("runResearchGroundingPipeline preserves raw Chinese topics while routing reviewable Step 2 sources", async () => {
  const cases: Array<{
    topic: string;
    normalizedHint?: string;
    selectedDomain: string;
    titlePrefix: string;
    abstractTerms: string;
    primaryConcepts: string[];
    mustHaveTerms: string[];
    expectedZh: RegExp;
    expectedEn: RegExp;
    expectedDomain: RegExp;
    expectedBucket?: RegExp;
  }> = [
    {
      topic: "風箏飛行原理",
      normalizedHint: "風箏飛行原理的核心技術原理、資料流程與應用場景",
      selectedDomain: "natural_science",
      titlePrefix: "Kite Aerodynamics",
      abstractTerms:
        "Kite aerodynamics, lift, drag, tethered flight, line tension, wind speed, flight stability and wind tunnel evidence.",
      primaryConcepts: ["kite", "aerodynamics", "lift", "drag", "tethered flight"],
      mustHaveTerms: ["kite", "aerodynamics", "lift"],
      expectedZh: /風箏 空氣動力學 升力 阻力/u,
      expectedEn: /kite aerodynamics lift drag tethered flight/i,
      expectedDomain: /physics|aerodynamics|natural/i,
    },
    {
      topic: "鳥類與其餵食方式",
      selectedDomain: "life_science",
      titlePrefix: "Avian Feeding Ecology",
      abstractTerms:
        "Bird feeding behavior, avian foraging ecology, diet, trophic ecology, feeding strategies and adaptation.",
      primaryConcepts: ["bird feeding behavior", "avian", "foraging", "diet", "trophic ecology"],
      mustHaveTerms: ["bird", "avian", "feeding"],
      expectedZh: /鳥類 覓食行為 食性/u,
      expectedEn: /bird feeding behavior avian foraging ecology/i,
      expectedDomain: /environmental|biology|ecology|life/i,
    },
    {
      topic: "牙菌斑的產生及對應治療方式",
      selectedDomain: "dentistry",
      titlePrefix: "Dental Plaque Oral Biofilm",
      abstractTerms:
        "Dental plaque formation, oral biofilm, periodontal disease treatment, plaque control, chlorhexidine, scaling and oral hygiene.",
      primaryConcepts: ["dental plaque", "oral biofilm", "periodontal disease", "plaque control"],
      mustHaveTerms: ["dental plaque", "oral biofilm", "treatment"],
      expectedZh: /牙菌斑 產生 對應治療方式/u,
      expectedEn: /dental plaque formation treatment oral biofilm/i,
      expectedDomain: /oral health|dentistry|biomedical/i,
      expectedBucket: /oral_biofilm_formation|plaque_control_treatment/,
    },
    {
      topic: "狗的護食行為與教育方式",
      selectedDomain: "animal_behavior",
      titlePrefix: "Canine Resource Guarding",
      abstractTerms:
        "Canine resource guarding, food aggression, positive reinforcement, behavior modification, desensitization, counterconditioning and veterinary behavior.",
      primaryConcepts: ["dog", "canine", "resource guarding", "food aggression", "behavior modification"],
      mustHaveTerms: ["dog", "canine", "resource guarding", "food aggression"],
      expectedZh: /狗 護食 行為 教育方式/u,
      expectedEn: /dog resource guarding food aggression behavior modification/i,
      expectedDomain: /animal behavior|veterinary behavior/i,
      expectedBucket: /canine_resource_guarding_behavior|behavior_modification_training/,
    },
  ];

  for (const item of cases) {
    const capturedInputs: Array<{
      topic: string;
      originalTopic?: string;
      querySeedZh?: string[];
      querySeedEn?: string[];
      mustIncludeTerms?: string[];
      excludeTerms?: string[];
    }> = [];
    const sources = academicSourceSet(
      {
        query: item.primaryConcepts.join(" "),
        titlePrefix: item.titlePrefix,
        abstractTerms: item.abstractTerms,
      },
      8,
    );

    const result = await runResearchGroundingPipeline(
      {
        workflowId: `wf-${item.titlePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        originalTopic: item.topic,
        topic: item.topic,
        normalizedTopic: item.normalizedHint,
        selectedDomain: item.selectedDomain,
        researchQuestion: item.normalizedHint ?? item.topic,
        reportType: "研究報告",
        audience: "高中",
        searchProfile: "standard",
        debugTrace: true,
      },
      {
        searchHandler: async (input) => {
          capturedInputs.push({
            topic: input.topic,
            originalTopic: input.originalTopic,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
            mustIncludeTerms: input.mustIncludeTerms,
            excludeTerms: input.excludeTerms,
          });
          return mockedGroundingSearchResult(
            {
              topic: input.topic,
              originalTopic: input.originalTopic,
              workflowId: input.workflowId,
              querySeedZh: input.querySeedZh,
              querySeedEn: input.querySeedEn,
            },
            sources,
            {
              primaryConcepts: item.primaryConcepts,
              mustHaveTerms: item.mustHaveTerms,
            },
          );
        },
      },
    );

    const firstInput = capturedInputs[0]!;
    assert.equal(firstInput.topic, item.topic);
    assert.equal(firstInput.originalTopic, item.topic);
    assert.equal(result.originalTopic, item.topic);
    assert.equal(result.normalizedTopic, item.topic);
    assert.doesNotMatch(result.normalizedTopic, /核心技術|資料流程|應用場景/u);
    assert.match((firstInput.querySeedZh ?? []).join(" "), item.expectedZh);
    assert.match((firstInput.querySeedEn ?? []).join(" "), item.expectedEn);
    assert.doesNotMatch(
      (firstInput.querySeedEn ?? []).slice(0, 5).join(" "),
      /scientific method|experimental design|variables|scientific mechanism|observation evidence|research limitation/i,
    );
    for (const term of item.mustHaveTerms) {
      assert.match((firstInput.mustIncludeTerms ?? []).join(" "), new RegExp(term, "i"));
    }
    assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, true);
    assert.ok((result.groundingDiagnostics?.candidateCount ?? 0) >= 8);
    assert.equal(result.diagnosticTrace?.step1_input.rawTopic, item.topic);
    assert.match(
      result.diagnosticTrace?.step2_normalization.normalizedTopicEn ?? "",
      item.expectedEn,
    );
    assert.match(
      result.diagnosticTrace?.step2_normalization.detectedDomain ?? "",
      item.expectedDomain,
    );
    const reviewableCandidates =
      result.sourceCandidates?.filter((candidate) => candidate.reviewStatus !== "rejected") ?? [];
    assert.ok(reviewableCandidates.length >= 3);
    if (item.expectedBucket) {
      assert.ok(
        reviewableCandidates.some((candidate) =>
          item.expectedBucket!.test(candidate.sourceBucket ?? ""),
        ),
        `expected a candidate bucket matching ${item.expectedBucket}`,
      );
    }
    assert.equal(result.diagnosticTrace?.step8_nextStepDecision.canProceedToSourceReview, true);
    assert.notEqual(result.diagnosticTrace?.step8_nextStepDecision.workflowStatus, "empty");
  }
});

test("topic-specific source buckets reject dental and dog behavior drift despite provider scores", async () => {
  const cases = [
    {
      topic: "牙菌斑的產生及對應治療方式",
      workflowId: "wf-dental-plaque-drift",
      source: sourceRecord({
        id: "dental-clinic-ad",
        title: "Tooth whitening advertisement and dental clinic marketing",
        abstract:
          "A cosmetic dentistry product shopping page about whitening packages, clinic coupons, marketing conversion, and appointment booking.",
        queryUsed: "dental plaque oral biofilm periodontal disease plaque control",
        sourceType: "OpenAlex",
        provider: "OpenAlex",
        relevanceScore: 96,
        sourceQualityScore: 90,
      }),
      primaryConcepts: ["dental plaque", "oral biofilm", "periodontal disease", "plaque control"],
      mustHaveTerms: ["dental plaque", "oral biofilm", "plaque control"],
    },
    {
      topic: "狗的護食行為與教育方式",
      workflowId: "wf-dog-resource-guarding-drift",
      source: sourceRecord({
        id: "guard-dog-food-product",
        title: "Guard dog police training and dog food product review",
        abstract:
          "This article reviews guard dog patrol training, police dog equipment, dog food product ingredients, and shopping comparisons without resource guarding or behavior modification evidence.",
        queryUsed: "dog resource guarding food aggression behavior modification",
        sourceType: "Crossref",
        provider: "Crossref",
        relevanceScore: 94,
        sourceQualityScore: 88,
      }),
      primaryConcepts: ["dog", "canine", "resource guarding", "food aggression", "behavior modification"],
      mustHaveTerms: ["dog", "resource guarding", "food aggression"],
    },
  ];

  for (const item of cases) {
    const topicAnalysis = analyzeTopicInput({
      topic: item.topic,
      workflowId: item.workflowId,
    });
    const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
    const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
    const queryPlan = buildGroundingQueryPlan({
      topicAnalysis,
      seedQueryPlan,
      lexicalSignals,
    });
    const result = buildSourceCandidates({
      workflowId: item.workflowId,
      topicHash: topicAnalysis.topicHash,
      queryPlan,
      parsedInput: parseResearchInput(item.topic),
      searchResult: {
        ...mockedGroundingSearchResult(
          {
            topic: item.topic,
            originalTopic: item.topic,
            workflowId: item.workflowId,
            querySeedZh: queryPlan.bilingualQueries.zh,
            querySeedEn: queryPlan.bilingualQueries.en,
          },
          [item.source],
          {
            primaryConcepts: item.primaryConcepts,
            mustHaveTerms: item.mustHaveTerms,
          },
        ),
        candidateSources: [item.source],
        fallbackReviewSources: [],
        rejectedSources: [],
      } as any,
    });

    const candidate = result.sourceCandidates.find(
      (source) => source.sourceId === item.source.id,
    );
    assert.equal(candidate?.reviewStatus, "rejected");
    assert.equal(candidate?.recommendationBucket, "rejected");
    assert.ok(
      ["excluded_drift_term_match", "off_topic_bucket", "missing_core_concept", "low_topic_relevance"].includes(
        candidate?.rejectionReason ?? "",
      ),
      `unexpected rejection reason ${candidate?.rejectionReason}`,
    );
  }
});

test("runResearchGroundingPipeline emits diagnostic trace for panda topic with provider success and empty provider", async () => {
  const pandaSources = [
    sourceRecord({
      id: "panda-taxonomy-1",
      title: "Comparative genomics reveals convergent evolution between the bamboo-eating giant and red pandas",
      year: 2017,
      abstract:
        "Comparative genomics examines giant panda Ailuropoda melanoleuca and red panda Ailurus fulgens, including bamboo feeding, phylogeny, taxonomy and convergent evolution.",
      doi: "10.1073/pnas.panda-genomics",
      url: "https://doi.org/10.1073/pnas.panda-genomics",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      containerTitle: "Proceedings of the National Academy of Sciences",
      sourceKind: "journal",
      isPeerReviewed: true,
      relevanceScore: 26,
      sourceQualityScore: 91,
    }),
    sourceRecord({
      id: "panda-taxonomy-2",
      title: "Earliest giant panda false thumb suggests conflicting demands for locomotion and feeding",
      year: 2022,
      abstract:
        "The fossil and morphology study discusses giant panda evolution, taxonomy, Ursidae, bamboo feeding and the false thumb trait in Ailuropoda.",
      doi: "10.1038/s41598-panda-thumb",
      url: "https://doi.org/10.1038/s41598-panda-thumb",
      sourceType: "Crossref",
      provider: "OpenAlex",
      containerTitle: "Scientific Reports",
      sourceKind: "journal",
      isPeerReviewed: true,
      relevanceScore: 22,
      sourceQualityScore: 88,
    }),
    sourceRecord({
      id: "panda-taxonomy-3",
      title: "The primitive giant panda Kretzoiarctos beatrix from the late Miocene of Spain",
      year: 2012,
      abstract:
        "Kretzoiarctos beatrix is interpreted as a primitive giant panda relative, supporting Ailuropoda taxonomy, fossil history and Ursidae classification.",
      doi: "10.1371/journal.pone.panda-kretzoiarctos",
      url: "https://doi.org/10.1371/journal.pone.panda-kretzoiarctos",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      containerTitle: "PLOS ONE",
      sourceKind: "journal",
      isPeerReviewed: true,
      relevanceScore: 23,
      sourceQualityScore: 88,
    }),
    sourceRecord({
      id: "panda-taxonomy-4",
      title: "Red panda phylogeny and Ailurus fulgens classification in Ailuridae",
      year: 2020,
      abstract:
        "Ailurus fulgens red panda taxonomy distinguishes Ailuridae from Ursidae and from the giant panda Ailuropoda melanoleuca.",
      doi: "10.1000/red-panda-phylogeny",
      url: "https://doi.org/10.1000/red-panda-phylogeny",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      containerTitle: "Mammalian Biology",
      sourceKind: "journal",
      isPeerReviewed: true,
      relevanceScore: 24,
      sourceQualityScore: 86,
    }),
    sourceRecord({
      id: "panda-taxonomy-5",
      title: "Giant panda classification places Ailuropoda melanoleuca within Ursidae",
      year: 2021,
      abstract:
        "The review discusses giant panda taxonomy, Ailuropoda melanoleuca, Ursidae, and comparison with red panda Ailurus fulgens in Ailuridae.",
      doi: "10.1000/giant-panda-ursidae-review",
      url: "https://doi.org/10.1000/giant-panda-ursidae-review",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      containerTitle: "Zoological Systematics",
      sourceKind: "journal",
      isPeerReviewed: true,
      relevanceScore: 25,
      sourceQualityScore: 86,
    }),
    sourceRecord({
      id: "panda-background-1",
      title: "Giant panda and red panda naming in Chinese terminology",
      authors: ["Smithsonian National Zoo"],
      year: 2024,
      abstract:
        "This explainer distinguishes the giant panda Ailuropoda melanoleuca from the red panda Ailurus fulgens and discusses panda naming history, cat-bear wording and Chinese terminology.",
      doi: null,
      url: "https://nationalzoo.si.edu/animals/giant-panda",
      sourceType: "Institutional Source",
      provider: "OpenAlex",
      publisher: "Smithsonian",
      containerTitle: null,
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 64,
      sourceQualityScore: 62,
    }),
    sourceRecord({
      id: "panda-offtopic-vaquita",
      title: "Vaquita genome reveals marine mammal conservation history",
      abstract: "Vaquita conservation genomics and population bottlenecks in marine mammals.",
      doi: "10.1000/vaquita-genome",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      sourceKind: "journal",
      relevanceScore: 3,
      sourceQualityScore: 86,
    }),
    sourceRecord({
      id: "panda-offtopic-polar-bear",
      title: "Polar bear faecal microbiota varies by Arctic diet",
      abstract: "Polar bear fecal microbiota and Arctic dietary ecology across seasonal diet shifts.",
      doi: "10.1000/polar-bear-microbiota",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      sourceKind: "journal",
      relevanceScore: 4,
      sourceQualityScore: 84,
    }),
    sourceRecord({
      id: "panda-offtopic-deep-learning",
      title: "Deep learning as a tool for ecology and evolution",
      abstract: "General machine learning methods for ecology and evolution across biodiversity datasets.",
      doi: "10.1000/deep-learning-ecology",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      sourceKind: "journal",
      relevanceScore: 2,
      sourceQualityScore: 82,
    }),
    sourceRecord({
      id: "panda-offtopic-sign-language",
      title: "Sign language lexical comprehension in bilingual adults",
      abstract: "Language comprehension and psycholinguistics in bilingual adult lexical processing.",
      doi: "10.1000/sign-language-comprehension",
      sourceType: "OpenAlex",
      provider: "OpenAlex",
      sourceKind: "journal",
      relevanceScore: 2,
      sourceQualityScore: 82,
    }),
  ];
  const calls: Array<{ querySeedZh?: string[]; querySeedEn?: string[] }> = [];

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-panda-diagnostic",
      topic: "熊貓與貓熊的關係",
      querySeedZh: ["背景脈絡", "主要類型", "核心特徵", "大熊貓 小熊貓 分類 關係"],
      querySeedEn: ["background context", "core features", "giant panda red panda taxonomy"],
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
      debugTrace: true,
    },
    {
      searchHandler: async (input) => {
        calls.push({
          querySeedZh: input.querySeedZh,
          querySeedEn: input.querySeedEn,
        });
        const base = mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          pandaSources,
          {
            primaryConcepts: [
              "giant panda",
              "red panda",
              "Chinese terminology",
              "taxonomy",
            ],
            mustHaveTerms: ["giant panda", "red panda", "panda"],
          },
        );
        return {
          ...base,
          candidateSources: [],
          fallbackReviewSources: pandaSources,
          rejectedSources: [],
          sources: pandaSources,
          scoredSources: pandaSources,
          provider_status: [
            {
              ok: true,
              provider: "OpenAlex",
              query: input.querySeedEn?.[0] ?? input.topic,
              results: pandaSources,
              raw_count: pandaSources.length,
              error_type: null,
              error_message: null,
              latency_ms: 120,
            },
            {
              ok: true,
              provider: "Crossref",
              query: input.querySeedEn?.[1] ?? input.topic,
              results: [],
              raw_count: 0,
              error_type: null,
              error_message: null,
              latency_ms: 95,
            },
          ],
          diagnostics: {
            ...base.diagnostics,
            raw_provider_count: pandaSources.length,
            normalize_attempt_count: pandaSources.length,
            normalized_valid_count: pandaSources.length,
            normalized_invalid_count: 0,
            provider_search_results_count: pandaSources.length,
            retrieved_count: pandaSources.length,
            deduped_count: pandaSources.length,
            scored_count: pandaSources.length,
            candidate_count: 0,
            fallback_review_count: pandaSources.length,
            displayed_count: pandaSources.length,
            provider_status: [
              {
                provider: "OpenAlex",
                query: input.querySeedEn?.[0] ?? input.topic,
                ok: true,
                result_count: pandaSources.length,
                raw_count: pandaSources.length,
                normalize_attempt_count: pandaSources.length,
                normalized_valid_count: pandaSources.length,
                normalized_invalid_count: 0,
                error_type: null,
                error_message: null,
                latency_ms: 120,
              },
              {
                provider: "Crossref",
                query: input.querySeedEn?.[1] ?? input.topic,
                ok: true,
                result_count: 0,
                raw_count: 0,
                normalize_attempt_count: 0,
                normalized_valid_count: 0,
                normalized_invalid_count: 0,
                error_type: null,
                error_message: null,
                latency_ms: 95,
              },
            ],
          },
        } as any;
      },
    },
  );

  const firstCall = calls[0]!;
  assert.ok((firstCall.querySeedEn ?? []).length >= 2);
  assert.ok((firstCall.querySeedZh ?? []).length >= 1);
  assert.match((firstCall.querySeedEn ?? []).join(" "), /giant panda red panda taxonomy naming history/i);
  assert.doesNotMatch((firstCall.querySeedEn ?? []).join(" "), /background context|core features/i);
  assert.doesNotMatch((firstCall.querySeedZh ?? []).join(" "), /背景脈絡|主要類型|核心特徵/u);
  assert.notEqual(result.status, "failed");
  assert.ok(result.status === "source_review_needs_manual" || result.status === "source_review_ready");
  assert.equal(result.diagnosticTrace?.step2_normalization.detectedDomain.includes("unknown"), false);
  assert.equal(result.diagnosticTrace?.step5_normalizedSources.rawTotal, pandaSources.length * calls.length);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.acceptedSources ?? 0) >= 3);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.rejectedSources ?? 0) >= 3);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.bucketCounts?.taxonomy_distinction ?? 0) >= 3);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.bucketCounts?.terminology_usage ?? 0) >= 1);
  assert.equal(result.diagnosticTrace?.step7_bucketSummary.backgroundSourceNeeded, false);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.fallbackReviewSources ?? 0) > 0);
  assert.equal(result.diagnosticTrace?.step8_nextStepDecision.canProceedToSourceReview, true);
  assert.ok(["completed", "partial"].includes(result.diagnosticTrace?.step8_nextStepDecision.workflowStatus ?? ""));
  assert.ok(
    (result.diagnosticTrace?.step3_queryPlan.bilingualQueries.filter((query) => query.lang === "en").length ?? 0) >= 3,
  );
  assert.ok(
    (result.diagnosticTrace?.step3_queryPlan.bilingualQueries.filter((query) => query.lang === "zh").length ?? 0) >= 2,
  );
  assert.equal(
    result.diagnosticTrace?.step4_providerExecution.some(
      (provider) => provider.provider === "OpenAlex" && provider.status === "success",
    ),
    true,
  );
  assert.equal(
    result.diagnosticTrace?.step4_providerExecution.some(
      (provider) => provider.provider === "Crossref" && provider.status === "empty",
    ),
    true,
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.classifiedQueries?.some(
      (query) => query.query === "background context" && query.classification === "outlineHint",
    ),
    true,
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.openalex?.some(
      (query) => /background context|core features/i.test(query),
    ),
    false,
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.openalex?.some(
      (query) => /^(Taiwan|Taiwanese)$/i.test(query),
    ),
    false,
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.openalex?.some(
      (query) => /最值得先釐清的研究問題/u.test(query),
    ),
    false,
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.web?.some(
      (query) => /背景脈絡|主要類型|核心特徵|形成過程|使用方式|background context|core features/i.test(query),
    ),
    false,
  );
  const offTopicScoring = result.diagnosticTrace?.step6_scoring.filter((source) =>
    /vaquita|polar bear|deep learning|sign language/i.test(source.title),
  ) ?? [];
  assert.equal(offTopicScoring.length, 4);
  assert.equal(offTopicScoring.every((source) => source.bucket === "off_topic"), true);
  assert.equal(offTopicScoring.every((source) => source.decision === "rejected"), true);
  assert.equal(offTopicScoring.every((source) => source.sourceUseCase === "rejected"), true);
  assert.equal(
    offTopicScoring.some((source) => source.finalBucket === "accepted"),
    false,
  );
  assert.equal(
    result.diagnosticTrace?.step6_scoring.every((source) => source.scoringNotes.length > 0),
    true,
  );
});

test("runResearchGroundingPipeline routes jade pendant topic to humanities buckets", async () => {
  const jadeSources = [
    ...academicSourceSet(
      {
        query: "Chinese jade pendant archaeology material culture",
        titlePrefix: "Chinese jade pendant archaeology",
        abstractTerms:
          "Chinese jade pendant, jade ornament, archaeology, ritual, burial, material culture, craftsmanship and symbolism in ancient China are discussed.",
      },
      5,
    ),
    sourceRecord({
      id: "trusted:british-museum-chinese-jade-test",
      title: "Chinese jade",
      authors: ["British Museum"],
      year: null,
      abstract:
        "The museum introduces Chinese jade objects, workmanship, historical forms, ornaments, pendants and material-culture background.",
      doi: null,
      url: "https://www.britishmuseum.org/collection/galleries/chinese-jade",
      sourceType: "Institutional Source",
      provider: "British Museum",
      publisher: "British Museum",
      containerTitle: "British Museum Collection Galleries",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 82,
      sourceQualityScore: 82,
    }),
  ];

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-jade-routing",
      topic: "玉佩在古代中國的象徵意義",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
      debugTrace: true,
    },
    {
      searchHandler: async (input) =>
        mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          jadeSources,
          {
            primaryConcepts: ["jade pendant", "archaeology", "material culture", "symbolism"],
            mustHaveTerms: ["jade pendant", "Chinese jade", "archaeology"],
          },
        ),
    },
  );

  const bucketCounts = result.diagnosticTrace?.step7_bucketSummary.bucketCounts ?? {};
  assert.ok((bucketCounts.archaeology_history_culture ?? 0) >= 3);
  assert.equal(bucketCounts.biomedical ?? 0, 0);
  assert.equal(bucketCounts.physics_atmospheric_optics ?? 0, 0);
  assert.ok(
    result.sourceCandidates?.some(
      (source) =>
        source.sourceBucket === "general_background" ||
        source.sourceUseCase === "background_context" ||
        source.sourceType === "official",
    ),
  );
});

test("runResearchGroundingPipeline routes HIV immune-system topic to biomedical bucket", async () => {
  const hivSources = academicSourceSet(
    {
      query: "HIV immune system CD4 T cells viral replication pathogenesis",
      titlePrefix: "HIV immune system mechanism",
      abstractTerms:
        "HIV, AIDS, human immunodeficiency virus, CD4 T cell depletion, immune system attack, viral replication, pathogenesis and antiretroviral therapy are discussed.",
    },
    6,
  );

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-hiv-routing",
      topic: "愛滋病病毒如何攻擊免疫系統",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
      debugTrace: true,
    },
    {
      searchHandler: async (input) =>
        mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          hivSources,
          {
            primaryConcepts: ["HIV", "immune system", "CD4 T cells", "viral replication"],
            mustHaveTerms: ["HIV", "immune system", "CD4"],
          },
        ),
    },
  );

  const bucketCounts = result.diagnosticTrace?.step7_bucketSummary.bucketCounts ?? {};
  assert.ok((bucketCounts.biomedical ?? 0) >= 5);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.acceptedSources ?? 0) >= 3);
  assert.equal(
    result.sourceCandidates?.every((source) => source.sourceBucket !== "off_topic"),
    true,
  );
  assert.doesNotMatch(
    [...(result.warnings ?? []), ...(result.groundingDiagnostics?.readinessWarnings ?? [])].join(" "),
    /缺少愛滋病研究/u,
  );
});

test("runResearchGroundingPipeline foregrounds sunset metadata candidates from bilingual rewrite", async () => {
  const sources = [
    ...academicSourceSet(
      {
        query: "Rayleigh scattering sunset red light",
        titlePrefix: "Sunset atmospheric optics",
        abstractTerms:
          "Rayleigh scattering, Mie scattering, sunset color, red light, atmospheric scattering, wavelength, sky color, and twilight color are discussed.",
      },
      7,
    ),
    sourceRecord({
      id: "sunset-offtopic-travel",
      title: "Best sunset travel photography spots",
      abstract: "Tourism itinerary and camera composition advice for travel photography.",
      doi: null,
      sourceType: "Authoritative Media",
      provider: "OpenAlex",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 15,
      sourceQualityScore: 35,
    }),
    sourceRecord({
      id: "sunset-offtopic-poem",
      title: "Poems about red sunsets",
      abstract: "Literary analysis of sunset imagery in poetry and travel writing.",
      doi: null,
      sourceType: "Authoritative Media",
      provider: "OpenAlex",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 12,
      sourceQualityScore: 30,
    }),
  ];
  let receivedEnglishQueries: string[] = [];

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-sunset",
      topic: "探討夕陽餘暉之光波長關係",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
      querySeedEn: ["sunset travel photography", "Rayleigh scattering sunset red light"],
      debugTrace: true,
    },
    {
      searchHandler: async (input) => {
        receivedEnglishQueries = input.querySeedEn ?? [];
        assert.ok(receivedEnglishQueries.some((query) => /Rayleigh scattering/i.test(query)));
        assert.ok(receivedEnglishQueries.some((query) => /sunset color/i.test(query)));
        assert.notDeepEqual(receivedEnglishQueries, ["探討夕陽餘暉之光波長關係"]);
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: [
              "sunset color",
              "wavelength",
              "Rayleigh scattering",
              "atmospheric scattering",
            ],
            mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
          },
        );
      },
    },
  );

  assert.ok(receivedEnglishQueries.length >= 5);
  assert.equal(receivedEnglishQueries.some((query) => /travel|photography|poem/i.test(query)), false);
  assert.ok((result.highConfidenceCandidateSources?.length ?? 0) >= 5);
  assert.ok((result.diagnosticTrace?.step7_bucketSummary.bucketCounts?.physics_atmospheric_optics ?? 0) >= 5);
  assert.ok(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.openalex?.some((query) =>
      /Rayleigh scattering|wavelength|Mie scattering/i.test(query),
    ),
  );
  assert.equal(
    result.diagnosticTrace?.step3_queryPlan.selectedQueriesByProvider?.openalex?.some((query) =>
      /travel|photography|poem/i.test(query),
    ),
    false,
  );
  assert.equal(
    result.diagnosticTrace?.step6_scoring
      .filter((source) => /travel photography|poems/i.test(source.title))
      .every((source) => source.decision === "rejected"),
    true,
  );
  assert.ok((result.groundingDiagnostics?.firstCandidateLatencyMs ?? 0) <= 6000);
  assert.ok((result.groundingDiagnostics?.foregroundLatencyMs ?? 0) <= 12000);
  assert.notEqual(
    (result.highConfidenceCandidateSources?.length ?? 0) +
      (result.fallbackReviewSources?.length ?? 0) +
      (result.rejectedSources?.length ?? 0),
    0,
  );
});

test("trusted fallback seeds classify as official background when scholarly providers fail", async () => {
  const seedSources = sunsetOfficialBackgroundSources();

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-sunset-trusted-fallback",
      topic: "探討夕陽餘暉之光波長關係",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => ({
        ...mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          seedSources,
          {
            primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
            mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
          },
        ),
        candidateSources: [],
        fallbackReviewSources: [],
        rejectedSources: [],
        sources: seedSources,
        scoredSources: seedSources,
        provider_status: [
          {
            ok: false,
            provider: "OpenAlex",
            query: "sunset color wavelength Rayleigh scattering",
            results: [],
            raw_count: 0,
            error_type: "server_error",
            error_message: "OpenAlex returned HTTP 503",
            latency_ms: 420,
          },
          {
            ok: false,
            provider: "Crossref",
            query: "sunset color wavelength Rayleigh scattering",
            results: [],
            raw_count: 0,
            error_type: "timeout",
            error_message: "Crossref request timed out",
            latency_ms: 4000,
          },
        ],
        diagnostics: {
          ...mockedGroundingSearchResult(
            {
              topic: input.topic,
              originalTopic: input.originalTopic,
              workflowId: input.workflowId,
              querySeedZh: input.querySeedZh,
              querySeedEn: input.querySeedEn,
            },
            seedSources,
            {
              primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
              mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
            },
          ).diagnostics,
          provider_search_results_count: 0,
          raw_provider_count: 0,
          provider_status: [
            {
              provider: "OpenAlex",
              query: "sunset color wavelength Rayleigh scattering",
              ok: false,
              result_count: 0,
              error_type: "server_error",
              error_message: "OpenAlex returned HTTP 503",
              latency_ms: 420,
            },
            {
              provider: "Crossref",
              query: "sunset color wavelength Rayleigh scattering",
              ok: false,
              result_count: 0,
              error_type: "timeout",
              error_message: "Crossref request timed out",
              latency_ms: 4000,
            },
          ],
          provider_health: [
            {
              provider: "openalex",
              status: "degraded",
              recentFailureCount: 3,
              recentTimeoutCount: 0,
              lastFailureAt: "2026-07-02T00:00:00.000Z",
              lastErrorCode: "server_error",
            },
            {
              provider: "crossref",
              status: "degraded",
              recentFailureCount: 3,
              recentTimeoutCount: 3,
              lastFailureAt: "2026-07-02T00:00:00.000Z",
              lastErrorCode: "timeout",
            },
          ],
        },
      } as any),
    },
  );

  assert.equal(result.groundingDiagnostics?.scholarlyRecommendedCount, 0);
  assert.equal((result.groundingDiagnostics?.officialBackgroundCount ?? 0) >= 3, true);
  assert.equal(result.status, "source_review_needs_manual");
  assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, true);
  assert.equal(result.academicRetry?.count, 2);
  assert.equal(result.academicRetry?.exhausted, true);
  assert.equal(result.groundingDiagnostics?.academicRetry?.exhausted, true);
  assert.equal(result.groundingDiagnostics?.sourceQualitySummary?.academicEnough, false);
  assert.match(
    (result.academicRetry?.retryQueries ?? []).join(" "),
    /Rayleigh scattering|atmospheric optics|sunset spectrum/i,
  );
  assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, true);
  assert.equal(result.groundingDiagnostics?.canProceedToAcademicDraft, false);
  assert.equal(result.groundingDiagnostics?.canProceedToBackgroundDraft, true);
  assert.match(result.groundingDiagnostics?.readinessReason ?? "", /自動學術延伸查詢/);
  assert.equal(
    result.groundingDiagnostics?.sourceRetrieval?.attemptedProviders?.includes("OpenAlex"),
    true,
  );
  assert.equal(
    result.groundingDiagnostics?.sourceRetrieval?.attemptedProviders?.includes("Crossref"),
    true,
  );
  assert.equal(
    result.groundingDiagnostics?.sourceRetrieval?.degradedProviders?.includes("openalex"),
    true,
  );
  assert.equal(
    result.groundingDiagnostics?.sourceRetrieval?.degradedProviders?.includes("crossref"),
    true,
  );
  assert.equal(result.groundingDiagnostics?.sourceRetrieval?.fallbackReason, "trusted_seed_fallback");
  assert.equal(result.groundingDiagnostics?.sourceRetrieval?.scholarlyMinimumMet, false);
  assert.equal(result.groundingDiagnostics?.sourceRetrieval?.officialBackgroundMinimumMet, true);
  assert.notEqual(result.groundingDiagnostics?.finalUiState, "provider_failed");
  assert.notEqual(result.groundingDiagnostics?.finalUiState, "no_raw_results_retry_with_english_relaxed_queries");
  assert.equal(
    result.sourceCandidates?.every((source) => source.retrievalMode === "trusted_seed"),
    true,
  );
  assert.equal(
    result.sourceCandidates?.every(
      (source) => source.recommendationBucket === "official_background",
    ),
    true,
  );
  assert.match(result.groundingDiagnostics?.userVisibleStatus ?? "", /自動嘗試 2 輪學術延伸查詢/);
  assert.equal(
    result.sourceCandidates?.every((source) => source.reviewStatus !== "accepted"),
    true,
  );
  assert.equal(
    result.evidenceCards?.length ?? 0,
    0,
  );
  assert.equal(
    result.reportPlan?.evidenceGaps.some((gap) => /accepted evidence cards below/.test(gap)),
    true,
  );
  assert.equal(
    result.reportSections?.some((section) =>
      section.evidenceGaps.some((gap) => /insufficient_evidence_cards|缺少同行評審/.test(gap)),
    ),
    true,
  );
});

test("academic retry expands sunset wavelength queries and recovers scholarly sources", async () => {
  const seedSources = sunsetOfficialBackgroundSources();
  const calls: Array<{ topic: string; querySeedEn?: string[]; querySeedZh?: string[] }> = [];

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-sunset-academic-retry",
      topic: "太陽餘暉所產生之光波波長研究",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        calls.push({
          topic: input.topic,
          querySeedEn: input.querySeedEn,
          querySeedZh: input.querySeedZh,
        });
        if (calls.length === 1) {
          return {
            ...mockedGroundingSearchResult(
              {
                topic: input.topic,
                originalTopic: input.originalTopic,
                workflowId: input.workflowId,
                querySeedZh: input.querySeedZh,
                querySeedEn: input.querySeedEn,
              },
              seedSources,
              {
                primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
                mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
              },
            ),
            candidateSources: [],
            fallbackReviewSources: seedSources,
            rejectedSources: [],
            sources: seedSources,
            scoredSources: seedSources,
          } as any;
        }

        const retryQuery =
          input.querySeedEn?.find((query) => /Rayleigh scattering|atmospheric optics/i.test(query)) ??
          input.topic;
        const sources = academicSourceSet(
          {
            query: retryQuery,
            titlePrefix: "Sunset Wavelength",
            abstractTerms:
              "Sunset color wavelength Rayleigh scattering atmospheric optics spectral irradiance aerosol optical depth",
          },
          6,
        );
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
            mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
          },
        ) as any;
      },
    },
  );

  const retryQueries = calls.slice(1).flatMap((call) => [
    ...(call.querySeedEn ?? []),
    ...(call.querySeedZh ?? []),
  ]);
  assert.equal(result.status, "source_review_ready");
  assert.equal(result.academicRetry?.count, 1);
  assert.equal(result.academicRetry?.exhausted, false);
  assert.equal(result.sourceQualitySummary?.academicEnough, true);
  assert.equal((result.sourceQualitySummary?.peerReviewedOrDoiCount ?? 0) >= 3, true);
  assert.match(retryQueries.join(" "), /Rayleigh scattering/);
  assert.match(retryQueries.join(" "), /atmospheric optics/);
  assert.match(retryQueries.join(" "), /sunset spectrum|spectral irradiance/);
});

test("academicRetryQueryExpansion covers requested Chinese topic families", async () => {
  const cases: Array<{ topic: string; expected: RegExp }> = [
    {
      topic: "太陽餘暉所產生之光波波長研究",
      expected: /Rayleigh scattering.*atmospheric optics|spectral irradiance.*atmospheric scattering/i,
    },
    {
      topic: "校園噪音對高中生專注力的影響",
      expected: /noise exposure.*attention.*adolescents.*school environment.*cognitive performance/i,
    },
    {
      topic: "咖啡因攝取對青少年睡眠品質的影響",
      expected: /caffeine intake.*adolescents.*sleep quality.*circadian rhythm.*systematic review/i,
    },
    {
      topic: "太陽帆推進技術的物理原理、太空任務應用與限制",
      expected: /solar sail propulsion radiation pressure|IKAROS LightSail NEA Scout solar sail/i,
    },
    {
      topic: "玉佩在漢代禮制中的文化功能",
      expected: /Han dynasty jade pendant ritual culture archaeology material culture/i,
    },
    {
      topic: "月兔神話在東亞文化傳播中的變形",
      expected: /moon rabbit myth East Asia folklore transmission comparative mythology/i,
    },
  ];

  for (const item of cases) {
    const parsedInput = parseResearchInput(item.topic);
    const topicAnalysis = analyzeTopicInput({
      topic: item.topic,
      workflowId: `wf-${item.topic.length}`,
      parsedInput,
    });
    const titleParse = parseResearchTitleSentence(item.topic);
    const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis, titleParse, parsedInput });
    const lexicalSignals = await collectLexicalSignals({
      topicAnalysis,
      titleParse,
      adapters: [],
    });
    const queryPlan = buildGroundingQueryPlan({
      topicAnalysis,
      seedQueryPlan,
      lexicalSignals,
      titleParse,
    });
    const normalizedSearchTopic =
      seedQueryPlan.normalizedResearchTopic ??
      normalizeResearchTopic(item.topic, topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW");
    const expansion = academicRetryQueryExpansion({
      base: {
        workflowId: topicAnalysis.workflowId,
        topic: item.topic,
        reportType: "研究報告",
        audience: "高中",
        searchProfile: "standard",
      },
      topicAnalysis,
      normalizedSearchTopic,
      queryPlan,
    });

    assert.match(expansion.retryQueries.join(" "), item.expected);
    if (/月兔/.test(item.topic)) {
      assert.equal(expansion.excludeTerms.includes("myth"), false);
    }
  }
});

test("solar-panel roughness query plan preserves photovoltaic evidence concepts", async () => {
  const topic = "不同表面粗糙度如何影響太陽能板的光反射與發電效率";
  const parsedInput = parseResearchInput(topic);
  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-solar-panel-roughness",
    parsedInput,
  });
  const titleParse = parseResearchTitleSentence(topic);
  const seedQueryPlan = buildSeedQueryPlan({
    topicAnalysis,
    titleParse,
    parsedInput,
    querySeedZh: [
      "太陽能板 表面粗糙度 光反射 發電效率",
      "太陽能板 表面結構 抗反射設計 性能比較",
    ],
    querySeedEn: [
      "solar panel surface roughness optical reflectance power conversion efficiency",
      "photovoltaic surface texture anti-reflection power output",
    ],
  });
  const lexicalSignals = await collectLexicalSignals({
    topicAnalysis,
    titleParse,
    adapters: [],
  });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
    titleParse,
  });
  const queryText = [
    ...queryPlan.bilingualQueries.en,
    ...queryPlan.providerQueries.openalex,
    ...queryPlan.providerQueries.crossref,
    ...(queryPlan.providerQueries.semanticScholar ?? []),
  ].join(" ");

  assert.match(queryText, /solar panel|photovoltaic/i);
  assert.match(queryText, /surface roughness|surface texture/i);
  assert.match(queryText, /reflectance|anti-reflection/i);
  assert.match(queryText, /power conversion efficiency|power output/i);
  assert.equal(queryPlan.domain, "energy / photovoltaic engineering");
  assert.doesNotMatch(queryText, /data governance|social impact|information retrieval/i);
  assert.equal(
    queryPlan.providerQueries.openalex.some((query) =>
      /^(formation|development|optics|optical|optics formation(?: review| systematic review)?)$/i.test(query),
    ),
    false,
  );
});

test("evidence-card acceptance topics keep provider and retry queries topic anchored", async () => {
  const cases: Array<{
    topic: string;
    querySeedZh: string[];
    querySeedEn: string[];
    expectedDomain: RegExp;
    expected: RegExp;
    forbidden: RegExp;
  }> = [
    {
      topic: "不同表面粗糙度如何影響太陽能板的光反射與發電效率",
      querySeedZh: ["太陽能板 表面粗糙度 光反射 發電效率"],
      querySeedEn: [
        "solar panel surface roughness optical reflectance power conversion efficiency",
        "optics formation",
        "formation development",
      ],
      expectedDomain: /photovoltaic engineering/i,
      expected: /solar panel|photovoltaic/i,
      forbidden: /optics formation|formation development|data governance|social impact/i,
    },
    {
      topic: "睡眠不足對青少年工作記憶與注意力表現的影響",
      querySeedZh: ["睡眠不足 青少年 工作記憶 注意力 認知表現"],
      querySeedEn: [
        "sleep deprivation adolescents working memory attention cognitive performance",
        "sleep deprivation",
        "working memory",
      ],
      expectedDomain: /adolescent cognition/i,
      expected: /sleep deprivation.*working memory|sleep restriction.*attention/i,
      forbidden: /dental|oral biofilm|periodontal|^sleep deprivation$|^working memory$/i,
    },
    {
      topic: "海岸人工夜間照明對海龜幼體入海行為的影響",
      querySeedZh: ["海龜幼體 入海定向 人工夜間照明 光害"],
      querySeedEn: [
        "sea turtle hatchling orientation artificial light at night",
        "sea turtle",
        "habitat fragmentation",
      ],
      expectedDomain: /sea turtle hatchling orientation/i,
      expected: /sea turtle.*hatchling|artificial light/i,
      forbidden: /habitat fragmentation|population distribution|conservation corridor|^sea turtle$/i,
    },
    {
      topic: "同儕回饋對高中生第二語言寫作修訂品質的影響",
      querySeedZh: ["同儕回饋 第二語言寫作 修訂品質 高中生"],
      querySeedEn: [
        "peer feedback second language writing revision quality",
        "peer review",
        "student engagement",
      ],
      expectedDomain: /writing education|applied linguistics/i,
      expected: /peer feedback.*second language writing|L2 writing.*revision/i,
      forbidden: /student engagement|generative AI|artificial intelligence|^peer review$/i,
    },
    {
      topic: "活性碳濾材對室內甲醛移除效率的影響因素",
      querySeedZh: ["活性碳 甲醛 吸附 室內空氣 移除效率"],
      querySeedEn: [
        "activated carbon formaldehyde adsorption indoor air removal efficiency",
        "chemistry experiment analysis peer reviewed",
      ],
      expectedDomain: /adsorption engineering|indoor air/i,
      expected: /activated carbon.*formaldehyde|formaldehyde.*adsorption/i,
      forbidden: /chemistry experiment analysis|laboratory experiment spectroscopy/i,
    },
  ];

  for (const item of cases) {
    const parsedInput = parseResearchInput(item.topic);
    const topicAnalysis = analyzeTopicInput({
      topic: item.topic,
      workflowId: `wf-anchor-${item.topic.length}`,
      parsedInput,
    });
    const titleParse = parseResearchTitleSentence(item.topic);
    const seedQueryPlan = buildSeedQueryPlan({
      topicAnalysis,
      titleParse,
      parsedInput,
      querySeedZh: item.querySeedZh,
      querySeedEn: item.querySeedEn,
    });
    const lexicalSignals = await collectLexicalSignals({
      topicAnalysis,
      titleParse,
      adapters: [],
    });
    const queryPlan = buildGroundingQueryPlan({
      topicAnalysis,
      seedQueryPlan,
      lexicalSignals,
      titleParse,
    });
    const normalizedSearchTopic =
      seedQueryPlan.normalizedResearchTopic ??
      normalizeResearchTopic(item.topic, topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW");
    const expansion = academicRetryQueryExpansion({
      base: {
        workflowId: topicAnalysis.workflowId,
        topic: item.topic,
        reportType: "研究報告",
        audience: "高中",
        searchProfile: "standard",
      },
      topicAnalysis,
      normalizedSearchTopic,
      queryPlan,
    });
    const providerText = [
      ...queryPlan.providerQueries.openalex,
      ...queryPlan.providerQueries.crossref,
      ...queryPlan.providerQueries.core,
      ...(queryPlan.providerQueries.semanticScholar ?? []),
    ].join("\n");
    const retryText = expansion.retryQueries.join("\n");

    assert.match(queryPlan.domain ?? "", item.expectedDomain);
    assert.match(`${providerText}\n${retryText}`, item.expected);
    assert.doesNotMatch(providerText, item.forbidden);
    assert.doesNotMatch(retryText, item.forbidden);
  }
});

test("initial grounding search seeds use topic anchors for direct Step 1 photovoltaic search", async () => {
  const capturedInputs: Array<{ querySeedEn?: string[]; querySeedZh?: string[]; canonicalTopicEn?: string }> = [];
  await runResearchGroundingPipeline(
    {
      workflowId: "wf-direct-solar-panel-roughness",
      topic: "不同表面粗糙度如何影響太陽能板的光反射與發電效率",
      originalTopic: "不同表面粗糙度如何影響太陽能板的光反射與發電效率",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
      selectedDomain: "technology_engineering_application",
    },
    {
      searchHandler: async (input) => {
        capturedInputs.push({
          querySeedEn: input.querySeedEn,
          querySeedZh: input.querySeedZh,
          canonicalTopicEn: input.canonicalTopicEn,
        });
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          [],
          {
            primaryConcepts: input.querySeedEn ?? [],
            mustHaveTerms: input.mustIncludeTerms ?? [],
          },
        );
      },
      lexiconAdapters: [],
    },
  );

  const firstInput = capturedInputs[0];
  assert.ok(firstInput, "initial search input should be captured");
  const enText = (firstInput.querySeedEn ?? []).join("\n");
  assert.match(enText, /surface roughness.*photovoltaic|photovoltaic.*surface|surface texturing.*solar cells/i);
  assert.doesNotMatch(enText, /(?:^|\n)(formation|development)(?:\n|$)|optics formation/i);
  assert.match(firstInput.canonicalTopicEn ?? "", /solar panel|photovoltaic/i);
});

test("runResearchGroundingPipeline accepts natural-science solar sail normalization and query seeds", async () => {
  const capturedInputs: Array<{
    topic: string;
    originalTopic?: string;
    domainHints?: string[];
    querySeedZh?: string[];
    querySeedEn?: string[];
    excludeTerms?: string[];
  }> = [];
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-solar-sail",
      originalTopic: "太陽帆與其利用價值",
      topic: "太陽帆推進技術的物理原理、太空任務應用與限制",
      normalizedTopic: "太陽帆推進技術的物理原理、太空任務應用與限制",
      selectedDomain: "natural_science",
      researchQuestion: "太陽帆如何利用太陽輻射壓進行航天推進，其在深空任務中的應用價值與限制為何？",
      bilingualQueries: {
        zh: [
          "太陽帆 輻射壓 推進 原理",
          "太陽帆 航天任務 應用 價值",
          "太陽帆 深空探測 優勢 限制",
        ],
        en: [
          "solar sail propulsion radiation pressure",
          "solar sail spacecraft mission applications",
          "solar sailing deep space exploration limitations",
          "IKAROS LightSail NEA Scout solar sail",
        ],
      },
      excludeTerms: ["sailboat", "sailing sport", "solar panel only", "astrology", "science fiction only"],
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        capturedInputs.push({
          topic: input.topic,
          originalTopic: input.originalTopic,
          domainHints: input.domainHints,
          querySeedZh: input.querySeedZh,
          querySeedEn: input.querySeedEn,
          excludeTerms: input.excludeTerms,
        });
        const sources = academicSourceSet(
          {
            query: "solar sail propulsion radiation pressure",
            titlePrefix: "Solar sail propulsion",
            abstractTerms:
              "Solar sail propulsion uses solar radiation pressure for spacecraft missions, deep space exploration, IKAROS, LightSail, NEA Scout, trajectory control, and mission limitations.",
          },
          6,
        );
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: ["solar sail propulsion", "radiation pressure", "spacecraft mission"],
            mustHaveTerms: ["solar sail", "radiation pressure"],
          },
        );
      },
    },
  );

  const firstInput = capturedInputs[0]!;
  const allZh = (firstInput.querySeedZh ?? []).join(" ");
  const allEn = (firstInput.querySeedEn ?? []).join(" ");

  assert.equal(result.originalTopic, "太陽帆與其利用價值");
  assert.equal(result.normalizedTopic, "太陽帆與其利用價值");
  assert.equal(result.groundingDiagnostics?.selectedDomain, "natural_science");
  assert.equal(
    result.groundingDiagnostics?.researchQuestion,
    "太陽帆如何利用太陽輻射壓進行航天推進，其在深空任務中的應用價值與限制為何？",
  );
  assert.equal(firstInput.topic, "太陽帆與其利用價值");
  assert.equal(firstInput.originalTopic, "太陽帆與其利用價值");
  assert.ok(firstInput.domainHints?.includes("natural_science"));
  assert.match(allZh, /太陽帆 輻射壓 推進 原理/);
  assert.match(allZh, /太陽帆 航天任務 應用 價值/);
  assert.match(allZh, /太陽帆 深空探測 優勢 限制/);
  assert.match(allEn, /solar sail propulsion radiation pressure/);
  assert.match(allEn, /solar sail spacecraft mission applications/);
  assert.match(allEn, /solar sailing deep space exploration limitations/);
  assert.match(allEn, /IKAROS LightSail NEA Scout solar sail/);
  assert.doesNotMatch(allEn, /artificial intelligence|generative AI|AI tutoring|AI in education/i);
  assert.ok(firstInput.excludeTerms?.includes("sailboat"));
  assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, true);
  assert.ok((result.sourceCandidates?.length ?? 0) >= 4);
});

test("runResearchGroundingPipeline generates bilingual AI writing queries with traceable DOI or URL sources", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-ai-writing",
      topic: "AI 對高中生寫作能力的影響",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        assert.ok((input.querySeedZh ?? []).some((query) => /高中生|寫作/u.test(query)));
        assert.ok((input.querySeedEn ?? []).some((query) => /generative AI|writing ability|AI literacy/i.test(query)));
        const sources = academicSourceSet(
          {
            query: "generative AI writing ability high school students",
            titlePrefix: "Generative AI student writing",
            abstractTerms:
              "Generative AI, education, writing ability, AI literacy, secondary students, and writing instruction are discussed.",
          },
          6,
        );
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: ["generative AI", "writing ability", "AI literacy", "education"],
            mustHaveTerms: ["generative AI", "writing ability"],
          },
        );
      },
    },
  );

  const traceable = result.sourceCandidates?.filter((source) => source.doi || source.url) ?? [];
  assert.ok(traceable.length >= 5);
});

test("runResearchGroundingPipeline expands English RAG citation accuracy topic without Chinese translation requirement", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-rag-citations",
      topic: "retrieval augmented generation citation accuracy",
      reportType: "研究報告",
      audience: "大學",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        assert.equal((input.querySeedZh ?? []).length, 0);
        assert.ok((input.querySeedEn ?? []).some((query) => /citation accuracy/i.test(query)));
        assert.ok((input.querySeedEn ?? []).some((query) => /source attribution|faithfulness|factuality/i.test(query)));
        return mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          academicSourceSet(
            {
              query: "retrieval augmented generation citation accuracy",
              titlePrefix: "RAG citation accuracy",
              abstractTerms:
                "Retrieval augmented generation, citation accuracy, source attribution, faithfulness, factuality, and hallucination evaluation are discussed.",
            },
            5,
          ),
          {
            primaryConcepts: ["retrieval augmented generation", "citation accuracy", "source attribution"],
            mustHaveTerms: ["retrieval augmented generation", "citation accuracy"],
          },
        );
      },
    },
  );

  assert.ok((result.groundingDiagnostics?.firstCandidateLatencyMs ?? 0) <= 6000);
  assert.ok((result.sourceCandidates?.length ?? 0) > 0);
  assert.equal((result.groundingDiagnostics?.scholarlyRecommendedCount ?? 0) >= 5, true);
  assert.equal(result.groundingDiagnostics?.officialBackgroundCount ?? 0, 0);
  assert.equal(
    result.sourceCandidates
      ?.filter((source) => source.recommendationBucket === "scholarly_recommended")
      .every((source) => Boolean(source.doi || source.venue || source.isPeerReviewed)),
    true,
  );
});

test("mixed source classification separates NASA, DOI journal, and wallpaper drift", async () => {
  const topic = "探討夕陽餘暉之光波長關係";
  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-mixed-classification",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const nasa = sunsetOfficialBackgroundSources()[0]!;
  const journal = sourceRecord({
    id: "doi:10.1000/rayleigh-sunset",
    title: "Rayleigh scattering and wavelength dependent sunset color",
    abstract:
      "This journal article analyzes Rayleigh scattering, wavelength dependence, atmospheric path length, and sunset red light.",
    doi: "10.1000/rayleigh-sunset",
    url: "https://doi.org/10.1000/rayleigh-sunset",
    sourceType: "OpenAlex",
    provider: "OpenAlex",
    sourceKind: "journal",
    isPeerReviewed: true,
    relevanceScore: 91,
    sourceQualityScore: 88,
  });
  const wallpaper = sourceRecord({
    id: "wallpaper-sunset",
    title: "Beautiful sunset wallpaper photography collection",
    abstract: "A travel photography wallpaper page with scenic sunset images.",
    doi: null,
    url: "https://example.com/sunset-wallpaper",
    sourceType: "Authoritative Media",
    provider: "Web",
    sourceKind: "web",
    isPeerReviewed: false,
    relevanceScore: 78,
    sourceQualityScore: 30,
  });
  const result = buildSourceCandidates({
    workflowId: "wf-mixed-classification",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput: parseResearchInput(topic),
    searchResult: mockedGroundingSearchResult(
      {
        topic,
        originalTopic: topic,
        workflowId: "wf-mixed-classification",
        querySeedZh: queryPlan.bilingualQueries.zh,
        querySeedEn: queryPlan.bilingualQueries.en,
      },
      [nasa, journal, wallpaper],
      {
        primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
        mustHaveTerms: ["sunset color", "wavelength", "Rayleigh scattering"],
      },
    ),
  });

  const nasaCandidate = result.sourceCandidates.find((source) => source.sourceId === nasa.id);
  const journalCandidate = result.sourceCandidates.find((source) => source.sourceId === journal.id);
  const wallpaperCandidate = result.sourceCandidates.find((source) => source.sourceId === wallpaper.id);

  assert.equal(nasaCandidate?.recommendationBucket, "official_background");
  assert.equal(nasaCandidate?.retrievalMode, "trusted_seed");
  assert.equal(journalCandidate?.recommendationBucket, "scholarly_recommended");
  assert.equal(wallpaperCandidate?.recommendationBucket, "rejected");
  assert.equal(wallpaperCandidate?.reviewStatus, "rejected");
});

test("runResearchGroundingPipeline keeps OpenAlex and Crossref candidates reviewable when CORE times out", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-core-timeout",
      topic: "探討夕陽餘暉之光波長關係",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        const sources = academicSourceSet(
          {
            query: "sunset color wavelength",
            titlePrefix: "Sunset wavelength metadata",
            abstractTerms:
              "Sunset color, wavelength, Rayleigh scattering, and atmospheric scattering are discussed.",
          },
          5,
        );
        const searchResult = mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
            mustHaveTerms: ["sunset color", "wavelength"],
          },
        );
        return {
          ...searchResult,
          provider_status: [
            ...(searchResult.provider_status ?? []),
            {
              ok: false,
              provider: "CORE",
              query: "sunset color wavelength",
              results: [],
              raw_count: 0,
              error_type: "timeout",
              error_message: "CORE request timed out",
              latency_ms: 6000,
            },
          ],
          diagnostics: {
            ...searchResult.diagnostics,
            provider_status: [
              ...(searchResult.diagnostics.provider_status ?? []),
              {
                provider: "CORE",
                query: "sunset color wavelength",
                ok: false,
                result_count: 0,
                error_type: "timeout",
                error_message: "CORE request timed out",
                latency_ms: 6000,
              },
            ],
          },
        } as any;
      },
    },
  );

  assert.ok(result.providerErrors?.some((error) => error.provider === "CORE"));
  assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, true);
});

test("runResearchGroundingPipeline reports stale cache without clearing source candidates", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-stale-cache",
      topic: "探討夕陽餘暉之光波長關係",
      reportType: "研究報告",
      audience: "高中",
      searchProfile: "standard",
    },
    {
      searchHandler: async (input) => {
        const sources = academicSourceSet(
          {
            query: "sunset color wavelength",
            titlePrefix: "Stale sunset cache",
            abstractTerms:
              "Stale cached metadata still contains sunset color, wavelength, Rayleigh scattering, and atmospheric scattering.",
          },
          5,
        );
        const searchResult = mockedGroundingSearchResult(
          {
            topic: input.topic,
            originalTopic: input.originalTopic,
            workflowId: input.workflowId,
            querySeedZh: input.querySeedZh,
            querySeedEn: input.querySeedEn,
          },
          sources,
          {
            primaryConcepts: ["sunset color", "wavelength", "Rayleigh scattering"],
            mustHaveTerms: ["sunset color", "wavelength"],
          },
        );
        return {
          ...searchResult,
          diagnostics: {
            ...searchResult.diagnostics,
            cache_hit: true,
            cache_status: "refresh_failed_using_stale",
          },
        } as any;
      },
    },
  );

  assert.equal(result.groundingDiagnostics?.cacheStatus, "refresh_failed_using_stale");
  assert.ok((result.sourceCandidates?.length ?? 0) > 0);
});

test("parseResearchTitleSentence extracts independent and dependent variables", () => {
  const parsed = parseResearchTitleSentence("不同溫度對牛奶變質速度的影響");
  assert.equal(parsed.sentenceType, "effect_of_x_on_y");
  assert.deepEqual(parsed.independentVariables, ["不同溫度"]);
  assert.deepEqual(parsed.dependentVariables, ["牛奶變質速度"]);
  assert.deepEqual(parsed.relation, ["影響"]);
  assert.equal(parsed.confidence >= 0.9, true);
});

test("compareTitleSemantics blocks semantic drift for over-broadened polished titles", () => {
  const original = parseResearchTitleSentence("不同溫度對牛奶變質速度的影響");
  const allowed = parseResearchTitleSentence("不同保存溫度對牛奶變質速度之影響");
  const blocked = parseResearchTitleSentence("牛奶保存條件與品質變化之探討");

  assert.equal(compareTitleSemantics(original, allowed).isSemanticallyEquivalent, true);
  const blockedComparison = compareTitleSemantics(original, blocked);
  assert.equal(blockedComparison.isSemanticallyEquivalent, false);
  assert.equal(
    blockedComparison.changedFields.includes("relation") ||
      /parser confidence below 0.6/i.test(blockedComparison.reason),
    true,
  );
});

test("analyzeTopicInput stops nonsense topics early", () => {
  const analysis = analyzeTopicInput({
    topic: "？？？？？",
    workflowId: "wf-nonsense",
  });
  assert.equal(analysis.isNonsenseInput, true);
  assert.equal(analysis.topicCompleteness?.level, "nonsense_input");
});

test("analyzeTopicInput rejects mixed short alnum or bopomofo garbage", () => {
  const alnum = analyzeTopicInput({
    topic: "hoeo2f2",
    workflowId: "wf-nonsense-alnum",
  });
  const bopomofo = analyzeTopicInput({
    topic: "ㄅㄆㄇabc999",
    workflowId: "wf-nonsense-bopomofo",
  });

  assert.equal(alnum.isNonsenseInput, true);
  assert.equal(alnum.topicCompleteness?.level, "nonsense_input");
  assert.equal(bopomofo.isNonsenseInput, true);
  assert.equal(bopomofo.topicCompleteness?.level, "nonsense_input");
});

test("analyzeTopicInput rejects generic report requests and ascii keyword garbage", () => {
  const generic = analyzeTopicInput({
    topic: "幫我做一份報告",
    workflowId: "wf-generic-report",
  });
  const asciiGarbage = analyzeTopicInput({
    topic: "asdf qwer zzz",
    workflowId: "wf-ascii-garbage",
  });

  assert.equal(generic.isNonsenseInput, true);
  assert.equal(generic.topicCompleteness?.level, "nonsense_input");
  assert.match(generic.topicCompleteness?.reason ?? "", /missing_research_subject/);
  assert.equal(asciiGarbage.isNonsenseInput, true);
  assert.equal(asciiGarbage.topicCompleteness?.level, "nonsense_input");
  assert.match(asciiGarbage.topicCompleteness?.reason ?? "", /ascii_garbage/);
});

test("paleontology algae topics keep microfossil and paleoenvironment queries", async () => {
  const topic = "化石與藻類的關係";
  const topicAnalysis = analyzeTopicInput({
    topic: `${topic} 化石紀錄 藻類 微化石 古環境 沉積環境`,
    workflowId: "wf-paleo-algae",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const allQueries = [
    ...queryPlan.primaryQueries,
    ...queryPlan.secondaryQueries,
    ...queryPlan.providerQueries.openalex,
    ...queryPlan.providerQueries.crossref,
    ...(queryPlan.providerQueries.semanticScholar ?? []),
  ].join(" ");

  assert.match(allQueries, /algal microfossils|microfossils/i);
  assert.match(allQueries, /paleoenvironment|sedimentary environment/i);
  assert.equal(/habitat ecology|conservation distribution/i.test(allQueries), false);
});

test("paleontology algae candidates require source evidence before becoming review sources", async () => {
  const topic = "化石與藻類的關係 化石紀錄 藻類 微化石 古環境 沉積環境";
  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-paleo-algae-sources",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const softTissue = sourceRecord({
    id: "soft-tissue",
    title: "Preservation of Soft Tissues in Dinosaur Fossils",
    abstract:
      "This review discusses reports of protein and soft tissue preservation in dinosaur fossils.",
    queryUsed: "algae fossil preservation paleoecology",
    sourceType: "OpenAlex",
    provider: "OpenAlex",
    relevanceScore: 70,
    sourceQualityScore: 86,
  });
  const algalMicrofossils = sourceRecord({
    id: "algal-microfossils",
    title: "Algal microfossils and paleoenvironmental reconstruction",
    abstract:
      "Algal microfossils preserved in sedimentary deposits are used to reconstruct paleoenvironmental conditions.",
    queryUsed: "algal microfossils fossil record paleoenvironment",
    sourceType: "OpenAlex",
    provider: "OpenAlex",
    relevanceScore: 82,
    sourceQualityScore: 88,
  });

  const result = buildSourceCandidates({
    workflowId: "wf-paleo-algae-sources",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput: parseResearchInput(topic),
    searchResult: {
      topic,
      workflowId: "wf-paleo-algae-sources",
      topicHash: topicAnalysis.topicHash,
      queryPlanHash: "query-plan-hash",
      searchIntent: {
        primaryConcepts: ["化石", "藻類", "微化石", "古環境"],
        contextConcepts: ["沉積環境"],
        outcomeConcepts: [],
        populationConcepts: [],
        lowWeightTerms: [],
        mustHaveTerms: ["藻類", "微化石"],
        plannerStatus: "rule_fallback",
        fallbackUsed: false,
      },
      queries: {
        coreConcepts: ["化石", "藻類", "微化石"],
        chinese: [topic],
        english: ["algal microfossils fossil record paleoenvironment"],
        highPrecision: ["algal microfossils fossil record paleoenvironment"],
        broad: ["algae fossil preservation paleoecology"],
        coreEnglishAcademic: ["algal microfossils fossil record paleoenvironment"],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [topic],
        fallbackRelaxed: ["algae fossil preservation"],
	        phases: [],
	      },
	      scoredSources: [softTissue, algalMicrofossils],
	      candidateSources: [algalMicrofossils],
	      rejectedSources: [softTissue],
	      fallbackReviewSources: [],
	      provider_status: [
	        {
	          ok: true,
          provider: "OpenAlex",
          query: "algal microfossils fossil record paleoenvironment",
          results: [softTissue, algalMicrofossils],
          error_type: null,
          error_message: null,
        },
      ],
    } as any,
  });

  const softCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "soft-tissue",
  );
  const algalCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "algal-microfossils",
  );

  assert.equal(softCandidate?.reviewStatus, "rejected");
  assert.equal(softCandidate?.rejectionReason, "missing_core_concept");
  assert.match(softCandidate?.abstractZh ?? "", /未顯示藻類、微化石/);
  assert.equal(/可辨識的證據面向包括.*藻類化石/.test(softCandidate?.abstractZh ?? ""), false);
  assert.notEqual(algalCandidate?.reviewStatus, "rejected");
  assert.match(algalCandidate?.abstractZh ?? "", /微化石|藻類化石|古環境/);
});

test("astronomy education candidates require astronomy source evidence", async () => {
  const topic = "星星距離我們多遠在科學教育、博物館展示與大眾理解中的角色 天文學 恆星距離 視差 光年 科學教育 博物館展示 大眾理解";
  const parsedInput = parseResearchInput(topic);
  assert.equal(parsedInput.domain, "physics");
  assert.equal(parsedInput.researchIntent, "practical_application");
  assert.match(parsedInput.queryPlan.enQueries.join(" "), /astronomy|stellar distance|parallax|light year/i);

  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-astronomy-education",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const genericEducation = sourceRecord({
    id: "generic-education",
    title: "Enhancing Student Motivation and Learning Outcomes through Physical Education",
    abstract:
      "This quasi-experimental study examines student motivation and learning outcomes in secondary school physical education.",
    queryUsed: "stellar distance parallax light year astronomy education",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 76,
    sourceQualityScore: 84,
  });
  const astronomyEducation = sourceRecord({
    id: "astronomy-education",
    title: "Teaching astronomical distances with parallax and light-year models in museum exhibitions",
    abstract:
      "The study examines astronomy education materials that use stellar parallax, light-year scales, and museum exhibition design to improve public understanding of astronomical distance.",
    queryUsed: "stellar distance parallax light year astronomy education",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 82,
    sourceQualityScore: 88,
  });

  const result = buildSourceCandidates({
    workflowId: "wf-astronomy-education",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput,
    searchResult: {
      topic,
      workflowId: "wf-astronomy-education",
      topicHash: topicAnalysis.topicHash,
      queryPlanHash: "query-plan-hash",
      searchIntent: {
        primaryConcepts: ["stellar distance", "parallax", "light year", "astronomy education"],
        contextConcepts: ["museum exhibition", "public understanding"],
        outcomeConcepts: [],
        populationConcepts: [],
        lowWeightTerms: [],
        mustHaveTerms: ["astronomy", "parallax", "light year"],
        plannerStatus: "rule_fallback",
        fallbackUsed: false,
      },
      queries: {
        coreConcepts: ["stellar distance", "astronomy education"],
        chinese: [topic],
        english: ["stellar distance parallax light year astronomy education"],
        highPrecision: ["stellar distance parallax light year astronomy education"],
        broad: ["astronomy museum exhibition science education learning"],
        coreEnglishAcademic: ["stellar distance parallax light year astronomy education"],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [topic],
        fallbackRelaxed: ["astronomy education"],
	        phases: [],
	      },
	      scoredSources: [genericEducation, astronomyEducation],
	      candidateSources: [astronomyEducation],
	      rejectedSources: [genericEducation],
	      fallbackReviewSources: [],
	      provider_status: [
	        {
	          ok: true,
          provider: "Crossref",
          query: "stellar distance parallax light year astronomy education",
          results: [genericEducation, astronomyEducation],
          error_type: null,
          error_message: null,
        },
      ],
    } as any,
  });

  const genericCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "generic-education",
  );
  const astronomyCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "astronomy-education",
  );

  assert.equal(genericCandidate?.reviewStatus, "rejected");
  assert.equal(genericCandidate?.rejectionReason, "missing_core_concept");
  assert.match(genericCandidate?.abstractZh ?? "", /未顯示天文、恆星距離/);
  assert.notEqual(astronomyCandidate?.reviewStatus, "rejected");
  assert.match(astronomyCandidate?.abstractZh ?? "", /天文距離|天文教育|光年|視差/);
});

test("agricultural waste pollution candidates require agricultural pollution evidence", async () => {
  const topic = "農業廢料可能造成的污染 農業廢棄物 污染 水質 土壤 富營養化 廢棄物管理 環境影響";
  const parsedInput = parseResearchInput(topic);
  assert.equal(parsedInput.domain, "environment");
  assert.equal(parsedInput.researchIntent, "evaluate_impact");
  assert.match(parsedInput.queryPlan.enQueries.join(" "), /agricultural waste|runoff|eutrophication/i);

  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-agricultural-waste-pollution",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const salmonellaFoodSafety = sourceRecord({
    id: "salmonella-food-safety",
    title: "Salmonella food safety and foodborne illness outbreaks",
    abstract:
      "This review discusses Salmonella contamination in poultry, food safety prevention, and foodborne illness outbreaks.",
    queryUsed: "agricultural waste pollution water soil contamination",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 76,
    sourceQualityScore: 84,
  });
  const agriculturalWaste = sourceRecord({
    id: "agricultural-waste-pollution",
    title: "Agricultural waste and runoff impacts on water quality and soil contamination",
    abstract:
      "Agricultural residues, manure waste, and nutrient runoff contribute to water pollution, soil contamination, and eutrophication; waste management and pollution control can reduce environmental impacts.",
    queryUsed: "agricultural waste pollution water soil contamination",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 84,
    sourceQualityScore: 88,
  });

  const result = buildSourceCandidates({
    workflowId: "wf-agricultural-waste-pollution",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput,
    searchResult: {
      topic,
      workflowId: "wf-agricultural-waste-pollution",
      topicHash: topicAnalysis.topicHash,
      queryPlanHash: "query-plan-hash",
      searchIntent: {
        primaryConcepts: ["agricultural waste", "agricultural pollution", "water pollution"],
        contextConcepts: ["runoff", "soil contamination", "eutrophication"],
        outcomeConcepts: ["environmental impact"],
        populationConcepts: [],
        lowWeightTerms: [],
        mustHaveTerms: ["agricultural waste", "農業廢棄物"],
        plannerStatus: "rule_fallback",
        fallbackUsed: false,
      },
      queries: {
        coreConcepts: ["農業廢棄物", "污染", "水質", "土壤"],
        chinese: [topic],
        english: ["agricultural waste pollution water soil contamination"],
        highPrecision: ["agricultural waste pollution water soil contamination"],
        broad: ["agricultural runoff nutrient pollution eutrophication"],
        coreEnglishAcademic: ["agricultural waste pollution water soil contamination"],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [topic],
        fallbackRelaxed: ["agricultural waste pollution"],
	        phases: [],
	      },
	      scoredSources: [salmonellaFoodSafety, agriculturalWaste],
	      candidateSources: [agriculturalWaste],
	      rejectedSources: [salmonellaFoodSafety],
	      fallbackReviewSources: [],
	      provider_status: [
	        {
	          ok: true,
          provider: "Crossref",
          query: "agricultural waste pollution water soil contamination",
          results: [salmonellaFoodSafety, agriculturalWaste],
          error_type: null,
          error_message: null,
        },
      ],
    } as any,
  });

  const salmonellaCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "salmonella-food-safety",
  );
  const agriculturalCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "agricultural-waste-pollution",
  );

  assert.equal(salmonellaCandidate?.reviewStatus, "rejected");
  assert.equal(salmonellaCandidate?.rejectionReason, "missing_core_concept");
  assert.match(salmonellaCandidate?.abstractZh ?? "", /未顯示農業廢棄物/);
  assert.notEqual(agriculturalCandidate?.reviewStatus, "rejected");
  assert.match(agriculturalCandidate?.abstractZh ?? "", /農業廢棄物|水土污染/);
});

test("AI work impact candidates require AI and workplace evidence", async () => {
  const topic = "AI發展對於工作的本質影響 人工智慧 工作本質 勞動市場 職務變遷 組織管理 社會影響";
  const parsedInput = parseResearchInput(topic);
  assert.equal(parsedInput.researchIntent, "evaluate_impact");
  assert.match(parsedInput.queryPlan.enQueries.join(" "), /artificial intelligence|labor market|work transformation/i);

  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-ai-work-impact",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const brandStrategy = sourceRecord({
    id: "ai-brand-strategy",
    title: "AI brand strategy and consumer preference in digital markets",
    abstract:
      "This article examines AI-assisted brand strategy, consumer preference, and market positioning for digital products.",
    queryUsed: "artificial intelligence impact on work labor market jobs",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 76,
    sourceQualityScore: 84,
  });
  const aiWork = sourceRecord({
    id: "ai-work-impact",
    title: "Artificial intelligence, task automation, and labor market transformation",
    abstract:
      "The study evaluates how artificial intelligence and generative AI change work tasks, employment, skills demand, workplace practices, and organizational management.",
    queryUsed: "artificial intelligence impact on work labor market jobs",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 84,
    sourceQualityScore: 88,
  });

  const result = buildSourceCandidates({
    workflowId: "wf-ai-work-impact",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput,
    searchResult: {
      topic,
      workflowId: "wf-ai-work-impact",
      topicHash: topicAnalysis.topicHash,
      queryPlanHash: "query-plan-hash",
      searchIntent: {
        primaryConcepts: ["artificial intelligence", "future of work", "labor market"],
        contextConcepts: ["task automation", "skills demand", "workplace"],
        outcomeConcepts: ["job transformation", "employment"],
        populationConcepts: ["workers"],
        lowWeightTerms: [],
        mustHaveTerms: ["AI", "work", "labor market"],
        plannerStatus: "rule_fallback",
        fallbackUsed: false,
      },
      queries: {
        coreConcepts: ["人工智慧", "工作本質", "勞動市場"],
        chinese: [topic],
        english: ["artificial intelligence impact on work labor market jobs"],
        highPrecision: ["artificial intelligence impact on work labor market jobs"],
        broad: ["AI automation employment skills task transformation"],
        coreEnglishAcademic: ["artificial intelligence impact on work labor market jobs"],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [topic],
        fallbackRelaxed: ["AI future of work"],
	        phases: [],
	      },
	      scoredSources: [brandStrategy, aiWork],
	      candidateSources: [aiWork],
	      rejectedSources: [brandStrategy],
	      fallbackReviewSources: [],
	      provider_status: [
	        {
	          ok: true,
          provider: "Crossref",
          query: "artificial intelligence impact on work labor market jobs",
          results: [brandStrategy, aiWork],
          error_type: null,
          error_message: null,
        },
      ],
    } as any,
  });

  const brandCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "ai-brand-strategy",
  );
  const workCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "ai-work-impact",
  );

  assert.equal(brandCandidate?.reviewStatus, "rejected");
  assert.equal(brandCandidate?.rejectionReason, "missing_core_concept");
  assert.match(brandCandidate?.abstractZh ?? "", /未同時顯示 AI、工作/);
  assert.notEqual(workCandidate?.reviewStatus, "rejected");
  assert.match(workCandidate?.abstractZh ?? "", /AI 與工作/);
});

test("cola health candidates require beverage health evidence", async () => {
  const topic = "可樂中的成分與攝取習慣對健康的影響 可樂 含糖飲料 糖分 咖啡因 攝取習慣 健康風險";
  const parsedInput = parseResearchInput(topic);
  assert.equal(parsedInput.researchIntent, "evaluate_impact");
  assert.match(parsedInput.queryPlan.enQueries.join(" "), /cola|soft drink|sugar-sweetened/i);

  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-cola-health",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const microplastics = sourceRecord({
    id: "microplastics-health",
    title: "Potential health impact of microplastics exposure",
    abstract:
      "This review discusses microplastic pollution, human exposure, toxicity, and environmental pathways in air, water, and marine systems.",
    queryUsed: "cola sugar caffeine consumption health effects",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 82,
    sourceQualityScore: 88,
  });
  const sugaryDrinks = sourceRecord({
    id: "sugary-drinks-health",
    title: "Sugar-sweetened beverage consumption and adolescent metabolic health",
    abstract:
      "This cohort study examines soft drink and sugar-sweetened beverage intake, added sugar exposure, obesity, dental caries, and metabolic health outcomes among adolescents.",
    queryUsed: "sugar-sweetened beverages consumption obesity metabolic health review",
    sourceType: "Crossref",
    provider: "Crossref",
    relevanceScore: 86,
    sourceQualityScore: 88,
  });

  const result = buildSourceCandidates({
    workflowId: "wf-cola-health",
    topicHash: topicAnalysis.topicHash,
    queryPlan,
    parsedInput,
    searchResult: {
      topic,
      workflowId: "wf-cola-health",
      topicHash: topicAnalysis.topicHash,
      queryPlanHash: "query-plan-hash",
      searchIntent: {
        primaryConcepts: ["cola", "soft drink", "sugar-sweetened beverage", "含糖飲料"],
        contextConcepts: ["consumption", "dietary intake", "攝取習慣"],
        outcomeConcepts: ["sugar", "caffeine", "health", "obesity", "dental caries"],
        populationConcepts: ["adolescents"],
        lowWeightTerms: [],
        mustHaveTerms: ["cola", "sugar", "health", "可樂", "健康"],
        plannerStatus: "rule_fallback",
        fallbackUsed: false,
      },
	      queries: {
	        coreConcepts: ["可樂", "含糖飲料", "糖分", "咖啡因", "健康"],
	        chinese: [topic],
	        english: ["cola sugar caffeine consumption health effects"],
        highPrecision: ["sugar-sweetened beverages consumption obesity metabolic health review"],
        broad: ["soft drink consumption health effects"],
        coreEnglishAcademic: ["cola sugar caffeine consumption health effects"],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [topic],
	        fallbackRelaxed: ["cola health"],
	        phases: [],
	      },
	      scoredSources: [microplastics, sugaryDrinks],
	      candidateSources: [sugaryDrinks],
	      rejectedSources: [microplastics],
	      fallbackReviewSources: [],
	      provider_status: [
	        {
	          ok: true,
          provider: "Crossref",
          query: "cola sugar caffeine consumption health effects",
          results: [microplastics, sugaryDrinks],
          error_type: null,
          error_message: null,
        },
      ],
    } as any,
  });

  const microplasticCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "microplastics-health",
  );
  const sugaryDrinkCandidate = result.sourceCandidates.find(
    (candidate) => candidate.sourceId === "sugary-drinks-health",
  );

  assert.equal(microplasticCandidate?.reviewStatus, "rejected");
  assert.equal(microplasticCandidate?.rejectionReason, "low_topic_relevance");
  assert.match(microplasticCandidate?.abstractZh ?? "", /未同時顯示可樂／含糖飲料/);
  assert.notEqual(sugaryDrinkCandidate?.reviewStatus, "rejected");
  assert.match(sugaryDrinkCandidate?.abstractZh ?? "", /含糖飲料|糖分與咖啡因|健康風險/);
});

test("cola health query plan ignores broad life-environment wording drift", async () => {
  const topic = "可樂中的成分與攝取習慣對健康的影響 生命環境 生態影響 健康風險 管理";
  const topicAnalysis = analyzeTopicInput({
    topic,
    workflowId: "wf-cola-health-domain-hint",
  });
  const seedQueryPlan = buildSeedQueryPlan({ topicAnalysis });
  const lexicalSignals = await collectLexicalSignals({ topicAnalysis });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
  });
  const queryText = [
    ...queryPlan.primaryQueries,
    ...queryPlan.secondaryQueries,
    ...queryPlan.bilingualQueries.zh,
    ...queryPlan.bilingualQueries.en,
  ].join(" ");

  assert.match(queryText, /cola sugar caffeine|soft drink consumption|sugar-sweetened beverages/i);
  assert.doesNotMatch(queryText, /microplastics human health|微塑膠 人體健康|Salmonella food safety/i);
  assert.match(queryPlan.excludedDriftTerms.join(" "), /microplastics human health|Salmonella food safety/);
});

test("parseResearchTitleSentence recognizes compact mechanism titles", () => {
  const parsed = parseResearchTitleSentence("銅綠生成機制");
  assert.equal(parsed.sentenceType, "mechanism");
  assert.deepEqual(parsed.subject, ["銅綠"]);
  assert.deepEqual(parsed.relation, ["機制"]);
  assert.equal(parsed.confidence >= 0.8, true);
});

test("reviewAcademicSafety keeps gray academic topics searchable but restricted", () => {
  const review = reviewAcademicSafety({
    topic: "毒品成癮與青少年犯罪關係",
  });
  assert.equal(review.academicIntent, true);
  assert.equal(review.allowedUse, "restricted_academic_summary");
  assert.equal(review.riskCategories.includes("drugs"), true);
  assert.equal(review.riskCategories.includes("crime"), true);
});

test("reviewAcademicSafety keeps medium-risk academic topics in restricted summary mode", () => {
  const topics = [
    "性教育對青少年保護的影響",
    "犯罪心理學與再犯風險",
    "藥物濫用的公共衛生影響",
    "校園霸凌與心理健康",
    "網路詐騙防治策略",
  ];
  for (const topic of topics) {
    const review = reviewAcademicSafety({ topic });
    assert.equal(review.allowedUse, "restricted_academic_summary");
    assert.equal(review.academicIntent, true);
  }
});

test("runResearchGroundingPipeline blocks dangerous actionable topics before any source search", async () => {
  let searchCalled = false;

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-blocked",
      topic: "安非他命製作",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async () => {
        searchCalled = true;
        throw new Error("search should not be called for blocked topics");
      },
    },
  );

  assert.equal(searchCalled, false);
  assert.equal(result.status, "partial");
  assert.equal(result.parsedInput?.nextAction, "block");
  assert.equal(result.parsedInput?.safetyCategory, "illegal_drug_manufacturing");
  assert.equal(result.warnings.some((warning) => warning.includes("非法藥物製造")), true);
});

test("runResearchGroundingPipeline returns topic options for ambiguous short inputs without searching", async () => {
  let searchCalled = false;

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-clarify",
      topic: "鵝",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async () => {
        searchCalled = true;
        throw new Error("search should not be called before clarification");
      },
    },
  );

  assert.equal(searchCalled, false);
  assert.equal(result.status, "partial");
  assert.equal(result.parsedInput?.nextAction, "show_topic_options");
  assert.equal((result.researchCandidates?.length ?? 0) > 0, true);
  assert.equal(
    result.warnings.some((warning) => warning.includes("主題仍偏短或多義")),
    true,
  );
});

test("runResearchGroundingPipeline searches generic meaningful topics without forcing topic options", async () => {
  let searchCalled = false;

  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-generic-topic",
      topic: "少子化與高齡化的應對方式",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async (input) => {
        searchCalled = true;
        const querySeedZh = input.querySeedZh ?? [];
        const querySeedEn = input.querySeedEn ?? [];
        assert.match(input.originalTopic ?? input.topic, /少子化|高齡化/);
        assert.equal(
          querySeedEn.some((query) => /low fertility|population aging|policy response/i.test(query)),
          true,
        );
        const good = sourceRecord({
          id: "generic-aging-1",
          title: "Policy responses to low fertility and population aging",
          abstract:
            "This review discusses low fertility, population aging, policy responses, family support, and long-term care adaptation strategies.",
          queryUsed: querySeedEn[0] ?? "low fertility population aging policy response",
          relevanceScore: 90,
          sourceQualityScore: 84,
          sourceType: "OpenAlex",
          provider: "OpenAlex",
        });

        return {
          ok: true,
          topic: input.topic,
          workflowId: input.workflowId ?? "wf-generic-topic",
          topicHash: "topic-hash",
          queryPlanHash: "query-plan-hash",
          searchIntent: {
            primaryConcepts: ["少子化", "高齡化", "low fertility", "population aging"],
            contextConcepts: ["policy response"],
            outcomeConcepts: ["應對方式"],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["少子化", "高齡化"],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          queries: {
            coreConcepts: ["少子化", "高齡化", "應對方式"],
            chinese: querySeedZh,
            english: querySeedEn,
            highPrecision: querySeedZh.slice(0, 1),
            broad: querySeedEn.slice(0, 2),
            coreEnglishAcademic: querySeedEn,
            academicSynonyms: [],
            education: [],
            chineseSupplemental: querySeedZh.slice(1, 3),
            fallbackRelaxed: querySeedEn.slice(0, 2),
            phases: [],
          },
          results: [good],
          sources: [good],
          provider_status: [
            {
              ok: true,
              query: querySeedEn[0] ?? "low fertility population aging policy response",
              provider: "OpenAlex",
              results: [good],
              error_type: null,
              error_message: null,
            },
          ],
          planner: {
            normalizedTopic: input.topic,
            primaryConcepts: ["少子化", "高齡化", "low fertility", "population aging"],
            contextConcepts: ["policy response"],
            outcomeConcepts: ["應對方式"],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["少子化", "高齡化"],
            shouldHaveTerms: [],
            penaltyTerms: [],
            negativeTerms: [],
            chineseQueries: querySeedZh,
            englishQueries: querySeedEn,
            reasoningNotes: [],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          warnings: [],
        } as any;
      },
    },
  );

  assert.equal(searchCalled, true);
  assert.notEqual(result.parsedInput?.nextAction, "show_topic_options");
  assert.equal((result.sourceCandidates?.length ?? 0) > 0, true);
  assert.equal(Boolean(result.reportDraft), true);
});

test("runResearchGroundingPipeline keeps accepted evidence cards source-grounded", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-grounding",
      topic: "咖啡因對心率變化的影響",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async (input) => {
        const good = sourceRecord({
          id: "openalex-1",
          title: "咖啡因對心率變化的影響：系統性回顧",
          abstract: "本研究回顧指出，咖啡因攝取與心率短期上升之間存在可觀察關聯。",
          queryUsed: input.topic,
          relevanceScore: 92,
          sourceQualityScore: 86,
          sourceType: "OpenAlex",
          provider: "OpenAlex",
        });
        const review = sourceRecord({
          id: "crossref-2",
          title: "Caffeine and subjective alertness in students",
          abstract: "This paper discusses caffeine, alertness, and study habits.",
          queryUsed: input.topic,
          relevanceScore: 58,
          sourceQualityScore: 78,
          sourceType: "Crossref",
          provider: "Crossref",
        });
        const bad = sourceRecord({
          id: "core-3",
          title: "Bridge structure load comparison",
          abstract: "Engineering discussion unrelated to caffeine or heart rate.",
          queryUsed: input.topic,
          relevanceScore: 22,
          sourceQualityScore: 72,
          sourceType: "Institutional Source",
          provider: "Institutional Source",
        });

        return {
          ok: true,
          topic: input.topic,
          workflowId: input.workflowId ?? "wf-grounding",
          topicHash: "topic-hash",
          queryPlanHash: "query-plan-hash",
          searchIntent: {
            primaryConcepts: ["咖啡因", "心率"],
            contextConcepts: [],
            outcomeConcepts: ["心率變化"],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["咖啡因", "心率"],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          queries: {
            coreConcepts: ["咖啡因", "心率變化"],
            chinese: [input.topic],
            english: ["caffeine heart rate change"],
            highPrecision: [input.topic],
            broad: ["咖啡因 心率"],
            coreEnglishAcademic: ["caffeine heart rate change"],
            academicSynonyms: [],
            education: [],
            chineseSupplemental: [input.topic],
            fallbackRelaxed: ["caffeine heart rate"],
            phases: [],
          },
          results: [good, review, bad],
          sources: [good, review, bad],
          scoredSources: [good, review, bad],
          candidateSources: [good, review],
          rejectedSources: [bad],
          fallbackReviewSources: [],
          provider_status: [
            {
              ok: true,
              provider: "OpenAlex",
              query: input.topic,
              results: [good],
              error_type: null,
              error_message: null,
            },
            {
              ok: true,
              provider: "Crossref",
              query: "caffeine heart rate change",
              results: [review],
              error_type: null,
              error_message: null,
            },
            {
              ok: true,
              provider: "Institutional Source",
              query: "caffeine heart rate",
              results: [bad],
              error_type: null,
              error_message: null,
            },
          ],
          warnings: [],
          planner: {
            normalizedTopic: input.topic,
            primaryConcepts: ["咖啡因", "心率"],
            contextConcepts: [],
            outcomeConcepts: ["心率變化"],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["咖啡因", "心率"],
            shouldHaveTerms: [],
            penaltyTerms: [],
            negativeTerms: [],
            chineseQueries: [input.topic],
            englishQueries: ["caffeine heart rate change"],
            reasoningNotes: [],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          searchTrace: {
            workflowId: input.workflowId ?? "wf-grounding",
            topic: input.topic,
            originalTopic: input.originalTopic ?? input.topic,
            activeResearchTopic: input.topic,
            canonicalEnglishTopic: "caffeine heart rate change",
            normalizedTopic: input.topic,
            topicHash: "topic-hash",
            queryPlanHash: "query-plan-hash",
            providerQueries: [input.topic],
            candidateCount: 3,
            dedupedCount: 3,
            acceptedCount: 1,
            rejectedCount: 1,
            sourceDecisions: [],
          },
          diagnostics: {
            original_topic: input.originalTopic ?? input.topic,
            active_research_topic: input.topic,
            canonical_english_topic: "caffeine heart rate change",
            core_concepts: ["咖啡因", "心率"],
            english_queries: ["caffeine heart rate change"],
            chinese_queries: [input.topic],
            fallback_relaxed_queries: ["caffeine heart rate"],
            provider_search_results_count: 3,
            filtered_results_count: 0,
            rejection_reasons: {},
            provider_status: [],
            recall_pool: {
              rawCount: 3,
              dedupedCount: 3,
              byLanguage: { zh: 1, en: 2, mixed: 0 },
              byIntent: { general: 3 },
              bySourceApi: {
                OpenAlex: 1,
                Crossref: 1,
                "Institutional Source": 1,
              },
            },
            total_results: 3,
            deduped_results: 3,
            llm_summary_attempted: false,
            llm_summary_completed: false,
            retrieved_count: 3,
            deduped_count: 3,
            rejected_count: 1,
            candidate_count: 2,
            displayed_count: 3,
            primary_candidate_count: 1,
            warnings: [],
          },
          llm_status: "skipped",
          keyword_expansion: {
            normalized_topic: input.topic,
            domains: ["health"],
            search_queries: [input.topic],
            english_queries: ["caffeine heart rate change"],
            chinese_queries: [input.topic],
            preferred_source_types: ["journal"],
            avoid_source_types: [],
            reasoning_notes: [],
            fallback_used: false,
            llm_status: "skipped",
          },
          groups: [],
          status: "ok",
          queryCount: 3,
          low_confidence_results: false,
        };
      },
    },
  );

  assert.equal(result.status, "waiting_for_review");
  assert.equal(result.groundingDiagnostics?.canProceedToSourceReview, false);
  assert.equal(result.sourceCandidates?.some((item) => item.reviewStatus === "accepted"), true);
  assert.equal(result.sourceCandidates?.some((item) => item.reviewStatus === "review"), true);
  assert.equal(
    result.candidateSources?.every(
      (item) =>
        item.confidenceTier !== "fallback" &&
        item.reviewStatus !== "rejected" &&
        !item.lowConfidence &&
        !item.needsReview,
    ),
    true,
  );
  assert.equal(
    result.sourceCandidates?.some((item) => /中文摘要：/.test(item.abstractZh ?? "")),
    true,
  );
  assert.equal(
    result.fallbackReviewSources?.every(
      (item) =>
        item.confidenceTier === "fallback" ||
        item.lowConfidence === true ||
        item.needsReview === true,
    ),
    true,
  );
  assert.equal((result.evidenceCards?.length ?? 0) >= 1, true);
  assert.equal(
    result.groundingDiagnostics?.claimExtraction?.evidenceCardCount,
    result.evidenceCards?.length ?? 0,
  );
  assert.equal(
    (result.groundingDiagnostics?.claimExtraction?.evidenceCardsWithSupportSpan ?? 0) >= 1,
    true,
  );
  assert.equal(result.evidenceCards?.some((card) => card.sourceId === "openalex-1"), true);
  assert.equal(
    result.evidenceCards?.every((card) =>
      result.sourceCandidates?.some(
        (source) => source.sourceId === card.sourceId && source.reviewStatus === "accepted",
      ),
    ),
    true,
  );
});

test("runResearchGroundingPipeline promotes top candidates to review when all initial scores are rejected", async () => {
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-review-fallback",
      topic: "咖啡因對心率變化的影響",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async (input) => {
        const sources = Array.from({ length: 24 }, (_, index) =>
          sourceRecord({
            id: `candidate-${index + 1}`,
            title: `Student alertness study ${index + 1}`,
            abstract: "This study discusses caffeine intake patterns in students.",
            queryUsed: "caffeine heart rate change",
            sourceType: index % 2 === 0 ? "Crossref" : "OpenAlex",
            provider: index % 2 === 0 ? "Crossref" : "OpenAlex",
            citationCount: 2 + index,
          }),
        );

        return {
          ok: true,
          topic: input.topic,
          workflowId: input.workflowId ?? "wf-review-fallback",
          topicHash: "topic-hash",
          queryPlanHash: "query-plan-hash",
          searchIntent: {
            primaryConcepts: ["咖啡因", "心率"],
            contextConcepts: ["heart rate change"],
            outcomeConcepts: [],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["咖啡因"],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          queries: {
            coreConcepts: ["咖啡因", "心率變化"],
            chinese: [input.topic],
            english: ["caffeine heart rate change"],
            highPrecision: ["caffeine heart rate change"],
            broad: ["caffeine heart rate"],
            coreEnglishAcademic: ["caffeine heart rate change"],
            academicSynonyms: [],
            education: [],
            chineseSupplemental: [input.topic],
            fallbackRelaxed: ["caffeine heart rate"],
            phases: [],
          },
          results: sources,
          sources,
          scoredSources: sources,
          candidateSources: sources.slice(0, 10).map((source) => ({
            ...source,
            lowConfidence: true,
            needsReview: true,
            rejectionReason: "low_topic_relevance",
          })),
          rejectedSources: sources.slice(10),
          fallbackReviewSources: sources.slice(0, 10).map((source) => ({
            ...source,
            lowConfidence: true,
            needsReview: true,
            rejectionReason: "low_topic_relevance",
          })),
          provider_status: [
            {
              ok: true,
              provider: "Crossref",
              query: "caffeine heart rate change",
              results: sources.filter((_, index) => index % 2 === 0),
              error_type: null,
              error_message: null,
            },
            {
              ok: true,
              provider: "OpenAlex",
              query: "caffeine heart rate change",
              results: sources.filter((_, index) => index % 2 === 1),
              error_type: null,
              error_message: null,
            },
          ],
          warnings: [],
          planner: {
            normalizedTopic: input.topic,
            primaryConcepts: ["咖啡因", "心率"],
            contextConcepts: ["heart rate change"],
            outcomeConcepts: [],
            populationConcepts: [],
            lowWeightTerms: [],
            mustHaveTerms: ["咖啡因"],
            shouldHaveTerms: [],
            penaltyTerms: [],
            negativeTerms: [],
            chineseQueries: [input.topic],
            englishQueries: ["caffeine heart rate change"],
            reasoningNotes: [],
            plannerStatus: "rule_fallback",
            fallbackUsed: false,
          },
          searchTrace: {
            workflowId: input.workflowId ?? "wf-review-fallback",
            topic: input.topic,
            originalTopic: input.originalTopic ?? input.topic,
            activeResearchTopic: input.topic,
            canonicalEnglishTopic: "caffeine heart rate change",
            normalizedTopic: input.topic,
            topicHash: "topic-hash",
            queryPlanHash: "query-plan-hash",
            providerQueries: ["caffeine heart rate change"],
            candidateCount: sources.length,
            dedupedCount: sources.length,
            acceptedCount: 0,
            rejectedCount: sources.length,
            sourceDecisions: [],
          },
          diagnostics: {
            original_topic: input.originalTopic ?? input.topic,
            active_research_topic: input.topic,
            canonical_english_topic: "caffeine heart rate change",
            core_concepts: ["咖啡因", "心率"],
            english_queries: ["caffeine heart rate change"],
            chinese_queries: [input.topic],
            fallback_relaxed_queries: ["caffeine heart rate"],
            provider_search_results_count: sources.length,
            filtered_results_count: 0,
            rejection_reasons: {},
            provider_status: [],
            warnings: [],
            retrieved_count: sources.length,
            deduped_count: sources.length,
            rejected_count: sources.length,
            candidate_count: sources.length,
            displayed_count: sources.length,
            primary_candidate_count: 0,
          },
          llm_status: "skipped",
          keyword_expansion: {
            normalized_topic: input.topic,
            domains: ["health"],
            search_queries: [input.topic],
            english_queries: ["caffeine heart rate change"],
            chinese_queries: [input.topic],
            preferred_source_types: ["journal"],
            avoid_source_types: [],
            reasoning_notes: [],
            fallback_used: false,
            llm_status: "skipped",
          },
          groups: [],
          status: "ok",
          queryCount: 1,
          low_confidence_results: false,
        };
      },
    },
  );

  const reviewCount = result.sourceCandidates?.filter((source) => source.reviewStatus === "review").length ?? 0;
  assert.equal(reviewCount > 0, true);
  assert.equal(
    result.sourceCandidates
      ?.filter((source) => source.reviewStatus === "review")
      .some((source) => /不建議採用/.test(source.abstractZh ?? "")),
    false,
  );
  assert.equal(
    result.warnings?.some((warning) => warning.includes("提升為 review")),
    false,
  );
  assert.equal(
    (result.groundingDiagnostics?.fallbackReviewCount ?? 0) > 0,
    true,
  );
  assert.equal(
    result.groundingDiagnostics?.canProceedToSourceReview,
    true,
  );
});

test("runResearchGroundingPipeline keeps normal science keyword topics searchable", async () => {
  const cases = [
    {
      topic: "皂化反應",
      queryPattern: /saponification reaction|alkaline hydrolysis/i,
      title: "Saponification reaction and alkaline hydrolysis of esters",
      abstract:
        "This review explains saponification reaction, alkaline hydrolysis of esters, triglyceride hydrolysis, soap formation, glycerol, and fatty acid salts.",
      primaryConcepts: ["saponification reaction", "alkaline hydrolysis", "ester hydrolysis"],
    },
    {
      topic: "氧化還原反應",
      queryPattern: /redox reaction|oxidation-reduction/i,
      title: "Redox reaction and oxidation-reduction electron transfer",
      abstract:
        "This review explains redox reaction, oxidation-reduction chemistry, electron transfer, oxidation state, oxidizing agent, and reducing agent.",
      primaryConcepts: ["redox reaction", "oxidation-reduction reaction", "electron transfer"],
    },
  ];

  for (const item of cases) {
    const result = await runResearchGroundingPipeline(
      {
        workflowId: `wf-${item.topic}`,
        topic: item.topic,
        reportType: "研究報告",
        audience: "高中",
      },
      {
        searchHandler: async (input) => {
          const querySeedEn = input.querySeedEn ?? [];
          assert.match(querySeedEn.join(" "), item.queryPattern);
          const sources = Array.from({ length: 12 }, (_, index) =>
            sourceRecord({
              id: `${item.topic}-${index + 1}`,
              title: `${item.title} ${index + 1}`,
              abstract: item.abstract,
              queryUsed: querySeedEn[0] ?? item.title,
              sourceType: "Crossref",
              provider: "Crossref",
              doi: `10.1000/${encodeURIComponent(item.topic)}-${index + 1}`,
              citationCount: 10 + index,
            }),
          );
          return mockedGroundingSearchResult(input, sources, {
            primaryConcepts: item.primaryConcepts,
            mustHaveTerms: item.primaryConcepts.slice(0, 2),
          });
        },
      },
    );
    const candidateCount = result.sourceCandidates?.filter((source) => source.reviewStatus !== "rejected").length ?? 0;
    assert.equal(candidateCount >= 10, true, item.topic);
    assert.equal(
      result.warnings?.some((warning) => warning.includes("主題仍偏短或多義")),
      false,
      item.topic,
    );
  }
});

test("runResearchGroundingPipeline searches protein muscle growth with English academic queries and candidates", async () => {
  let searchCalled = false;
  const topic = "蛋白質如何幫助人類增長肌肉";
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-protein-muscle",
      topic,
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async (input) => {
        searchCalled = true;
        const querySeedEn = input.querySeedEn ?? [];
        const queryText = querySeedEn.join(" ");
        assert.match(queryText, /protein intake/i);
        assert.match(queryText, /muscle hypertrophy/i);
        assert.match(queryText, /muscle protein synthesis/i);
        const sources = Array.from({ length: 12 }, (_, index) =>
          sourceRecord({
            id: `protein-muscle-${index + 1}`,
            title: `Protein intake and muscle hypertrophy review ${index + 1}`,
            abstract:
              "This review examines dietary protein intake, amino acids, leucine, resistance training, muscle protein synthesis, muscle growth, and skeletal muscle hypertrophy.",
            queryUsed: querySeedEn[0] ?? "protein intake muscle hypertrophy",
            sourceType: index % 2 === 0 ? "OpenAlex" : "Semantic Scholar",
            provider: index % 2 === 0 ? "OpenAlex" : "Semantic Scholar",
            doi: `10.1000/protein-muscle-${index + 1}`,
            citationCount: 20 + index,
          }),
        );

        return mockedGroundingSearchResult(input, sources, {
          primaryConcepts: ["protein intake", "muscle hypertrophy", "muscle protein synthesis"],
          mustHaveTerms: ["protein intake", "muscle hypertrophy"],
        });
      },
    },
  );

  const candidateCount = result.sourceCandidates?.filter((source) => source.reviewStatus !== "rejected").length ?? 0;
  assert.equal(searchCalled, true);
  assert.equal(result.parsedInput?.domain, "biology");
  assert.equal(candidateCount >= 10, true);
  assert.equal(
    result.warnings?.some((warning) => warning.includes("主題仍偏短或多義")),
    false,
  );
  assert.equal(result.groundingDiagnostics?.candidateCount, candidateCount);
});

test("runResearchGroundingPipeline searches tea organ health with English academic queries and candidates", async () => {
  let searchCalled = false;
  const topic = "茶葉對於器官的健康影響";
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-tea-organ-health",
      topic,
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async (input) => {
        searchCalled = true;
        const querySeedEn = input.querySeedEn ?? [];
        const queryText = querySeedEn.join(" ");
        assert.match(queryText, /tea polyphenols/i);
        assert.match(queryText, /catechins/i);
        assert.match(queryText, /EGCG/i);
        assert.match(queryText, /liver/i);
        assert.match(queryText, /kidney/i);
        assert.match(queryText, /cardiovascular health/i);
        const sources = Array.from({ length: 12 }, (_, index) =>
          sourceRecord({
            id: `tea-organ-${index + 1}`,
            title: `Green tea polyphenols catechins and organ health review ${index + 1}`,
            abstract:
              "This systematic review discusses tea polyphenols, catechins, EGCG, liver, kidney, cardiovascular health, metabolism, and organ health effects.",
            queryUsed: querySeedEn[0] ?? "tea polyphenols catechins liver kidney cardiovascular health",
            sourceType: index % 2 === 0 ? "Crossref" : "OpenAlex",
            provider: index % 2 === 0 ? "Crossref" : "OpenAlex",
            doi: `10.1000/tea-organ-${index + 1}`,
            citationCount: 30 + index,
          }),
        );

        return mockedGroundingSearchResult(input, sources, {
          primaryConcepts: ["tea polyphenols", "catechins", "EGCG", "organ health"],
          mustHaveTerms: ["tea", "organ health"],
        });
      },
    },
  );

  const candidateCount = result.sourceCandidates?.filter((source) => source.reviewStatus !== "rejected").length ?? 0;
  assert.equal(searchCalled, true);
  assert.equal(result.parsedInput?.domain, "medicine");
  assert.equal(candidateCount >= 10, true);
  assert.equal(
    result.warnings?.some((warning) => warning.includes("主題仍偏短或多義")),
    false,
  );
  assert.equal(result.groundingDiagnostics?.candidateCount, candidateCount);
});

test("runResearchGroundingPipeline does not call providers for nonsense input", async () => {
  let searchCalled = false;
  const result = await runResearchGroundingPipeline(
    {
      workflowId: "wf-nonsense-no-search",
      topic: "hoeo2f2",
      reportType: "研究報告",
      audience: "高中",
    },
    {
      searchHandler: async () => {
        searchCalled = true;
        throw new Error("provider should not be called");
      },
    },
  );

  assert.equal(searchCalled, false);
  assert.equal(result.parsedInput?.inputType, "invalid");
  assert.equal(result.groundingDiagnostics?.finalUiState, "invalid_input");
  assert.equal(result.warnings?.[0], "查無可辨識研究主題，請改用具體且有語意的關鍵詞。");
});

test("legacy generic detector traces and suppresses banned output fields", () => {
  const traces = findLegacyGenericTraces({
    researchCandidates: ["太陽能板如何形成並產生作用：原理、應用與限制"],
    reportSections: [
      {
        sectionId: "discussion",
        title: "討論",
        synthesizedProse: "生活連結與資料策略。",
        citationMarkers: [],
        evidenceCardIds: [],
        evidenceGaps: [],
      },
    ],
    reportDraft: "討論\n生活連結與資料策略。",
  });
  const sanitized = suppressLegacyGenericOutput({
    researchCandidates: ["太陽能板如何形成並產生作用：原理、應用與限制"],
    reportSections: [
      {
        sectionId: "discussion",
        title: "討論",
        synthesizedProse: "生活連結與資料策略。",
        citationMarkers: [],
        evidenceCardIds: [],
        evidenceGaps: [],
      },
    ],
    reportDraft: "討論\n生活連結與資料策略。",
  });

  assert.equal(traces.some((trace) => trace.path === "researchCandidates[0]"), true);
  assert.equal(
    traces.some((trace) => trace.path === "reportSections[0].synthesizedProse"),
    true,
  );
  assert.deepEqual(sanitized.researchCandidates, []);
  assert.match(sanitized.reportDraft, /目前資料不足/);
  assert.equal(sanitized.warnings.length > 0, true);
});

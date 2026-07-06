import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import {
  readGroundingJob,
  scheduleGroundingJob,
} from "./researchGroundingJobStore";

function sourceRecord(): SourceRecord {
  return {
    id: "openalex-job-1",
    title: "咖啡因對心率變化的影響",
    authors: ["A. Researcher"],
    year: 2024,
    abstract: "摘要指出咖啡因攝取與心率變化存在短期相關。",
    doi: "10.1000/job-test",
    url: "https://doi.org/10.1000/job-test",
    sourceType: "OpenAlex",
    reviewState: "pending",
    publisher: null,
    containerTitle: "Testing Journal",
    accessedAt: null,
    provider: "OpenAlex",
    queryUsed: "咖啡因對心率變化的影響",
    retrievedAt: new Date().toISOString(),
    dedupeKey: "10.1000/job-test",
    sourceKind: "journal",
    citationCount: 12,
    isOpenAccess: true,
    isPeerReviewed: true,
    relevanceScore: 91,
    sourceQualityScore: 84,
  };
}

test("scheduleGroundingJob returns queued job and later stores completed result", async () => {
  const created = scheduleGroundingJob(
    {
      workflowId: "wf-store-test",
      topic: "咖啡因對心率變化的影響",
    },
    {
      searchHandler: async (input) => ({
        ok: true,
        topic: input.topic,
        workflowId: input.workflowId ?? "wf-store-test",
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
        results: [sourceRecord()],
        sources: [sourceRecord()],
        scoredSources: [sourceRecord()],
        candidateSources: [sourceRecord()],
        rejectedSources: [],
        fallbackReviewSources: [],
        provider_status: [
          {
            ok: true,
            provider: "OpenAlex",
            query: input.topic,
            results: [sourceRecord()],
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
          workflowId: input.workflowId ?? "wf-store-test",
          topic: input.topic,
          originalTopic: input.originalTopic ?? input.topic,
          activeResearchTopic: input.topic,
          canonicalEnglishTopic: "caffeine heart rate change",
          normalizedTopic: input.topic,
          topicHash: "topic-hash",
          queryPlanHash: "query-plan-hash",
          providerQueries: [input.topic],
          candidateCount: 1,
          dedupedCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
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
          provider_search_results_count: 1,
          filtered_results_count: 0,
          rejection_reasons: {},
          recall_pool: {
            rawCount: 1,
            dedupedCount: 1,
            byLanguage: { zh: 1, en: 0, mixed: 0 },
            byIntent: { general: 1 },
            bySourceApi: { OpenAlex: 1 },
          },
          retrieved_count: 1,
          deduped_count: 1,
          rejected_count: 0,
          candidate_count: 1,
          displayed_count: 1,
          primary_candidate_count: 1,
          provider_status: [],
          warnings: [],
          total_results: 1,
          deduped_results: 1,
          llm_summary_attempted: false,
          llm_summary_completed: false,
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
      }),
    },
  );

  assert.equal(created.status, "queued");
  assert.equal(created.topicHash.length > 0, true);

  await new Promise((resolve) => setTimeout(resolve, 30));
  const stored = readGroundingJob(created.jobId);
  assert.equal(stored?.status, "completed");
  assert.equal((stored?.sourceCandidates?.length ?? 0) >= 1, true);
});

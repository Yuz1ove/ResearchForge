import type {
  ResearchQueryPlan,
  ResearchQueryPlanRequest,
} from "@workspace/api-zod/research-tools";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import {
  buildSearchIntentQueries,
  planSearchIntent,
  queryPlanHashForSearch,
  type SearchIntentPlannerInput,
} from "../../search-intent-planner";
import { createWorkflowId, stableQueryHash, topicHashForWorkflow } from "../workflow/workflowIds";

function requiredSourceTypesForDomain(domain?: string): ResearchQueryPlan["requiredSourceTypes"] {
  switch (domain) {
    case "health":
    case "health_medical":
      return ["journal", "government", "dataset", "web"];
    case "environment":
    case "social_policy":
      return ["journal", "government", "dataset", "web"];
    case "technology":
    case "technology_engineering":
      return ["journal", "conference", "preprint", "web"];
    default:
      return ["journal", "conference", "government", "web"];
  }
}

function searchIntentForDomain(domain?: string): ResearchQueryPlan["searchIntent"] {
  switch (domain) {
    case "health":
    case "health_medical":
    case "natural_science":
    case "biology_ecology":
      return "science_report";
    case "social_policy":
    case "education_psychology":
      return "social_report";
    case "technology":
    case "technology_engineering":
      return "academic_report";
    default:
      return "general_report";
  }
}

export async function buildResearchQueryPlan(
  request: ResearchQueryPlanRequest,
): Promise<ResearchQueryPlan> {
  const deterministicUnderstanding = understandTopic(request.topic);
  const workflowId = createWorkflowId();
  const topicHash = topicHashForWorkflow(request.topic);

  if (deterministicUnderstanding.topicKind === "unknown_or_noise") {
    const queryHash = stableQueryHash({
      topicHash,
      topic: request.topic.trim(),
      status: "unknown_or_noise",
    });
    return {
      workflowId,
      topicHash,
      queryHash,
      queryPlanHash: queryHash,
      originalTopic: request.topic.trim(),
      normalizedTopic: request.topic.trim(),
      language: "unknown",
      zhQueries: [],
      enQueries: [],
      researchSubtopics: [],
      requiredSourceTypes: ["journal", "web"],
      excludedDriftTerms: deterministicUnderstanding.excludedDriftTerms,
      searchIntent: "general_report",
      qualityWarnings: ["查無可用研究主題，請輸入具體研究問題。"],
      diagnostics: {
        plannerStatus: "skipped",
        fallbackUsed: false,
        originalTopic: request.topic.trim(),
        primaryConcepts: [],
        contextConcepts: [],
        reasoningNotes: ["Detected unknown_or_noise before planner execution."],
      },
    };
  }

  const plannerInput: SearchIntentPlannerInput = {
    topic: request.topic,
    reportType: request.reportType,
    audience: request.audience,
    language: request.language,
    sourceMode: request.sourceMode,
  };
  const planner = await planSearchIntent(plannerInput);
  const querySet = buildSearchIntentQueries(planner);
  const topicHashForPlan = topicHashForWorkflow(planner.normalizedTopic);
  const queryHash = stableQueryHash({
    zh: querySet.chinese,
    en: querySet.english,
    topicHash: topicHashForPlan,
  });

  const researchSubtopics =
    planner.narrowedResearchQuestions?.map((question, index) => ({
      id: `${topicHashForPlan}-subtopic-${index + 1}`,
      labelZh: question.title,
      ...(question.researchAngle ? { labelEn: question.researchAngle } : {}),
      purpose: question.whyResearchable,
      requiredEvidenceType: "review" as const,
    })) ??
    planner.primaryConcepts.slice(0, 4).map((concept, index) => ({
      id: `${topicHashForPlan}-concept-${index + 1}`,
      labelZh: concept,
      purpose: "對應後續來源搜尋與證據整理",
      requiredEvidenceType: "background" as const,
    }));

  return {
    workflowId,
    topicHash: topicHashForPlan,
    queryHash,
    queryPlanHash: queryPlanHashForSearch(planner, querySet),
    originalTopic: request.topic.trim(),
    normalizedTopic: planner.normalizedTopic,
    language:
      request.language?.startsWith("zh")
        ? "zh"
        : request.language?.startsWith("en")
          ? "en"
          : querySet.chinese.length && querySet.english.length
            ? "mixed"
            : querySet.chinese.length
              ? "zh"
              : querySet.english.length
                ? "en"
                : "unknown",
    zhQueries: querySet.chinese,
    enQueries: querySet.english,
    researchSubtopics,
    requiredSourceTypes: requiredSourceTypesForDomain(
      planner.topicUnderstanding?.domain ?? planner.topicType,
    ),
    excludedDriftTerms:
      planner.excludedDriftTerms ??
      planner.penaltyTerms ??
      planner.negativeTerms ??
      [],
    searchIntent: searchIntentForDomain(
      planner.topicUnderstanding?.domain ?? planner.topicType,
    ),
    qualityWarnings:
      planner.topicUnderstanding?.topicKind === "unknown_or_noise"
        ? ["查無可用研究主題，請輸入具體研究問題。"]
        : planner.reasoningNotes.filter(Boolean),
    diagnostics: {
      plannerStatus: planner.plannerStatus,
      fallbackUsed: planner.fallbackUsed,
      ...(planner.originalTopic ? { originalTopic: planner.originalTopic } : {}),
      ...(planner.activeResearchTopic
        ? { activeResearchTopic: planner.activeResearchTopic }
        : {}),
      ...(planner.canonicalEnglishTopic
        ? { canonicalEnglishTopic: planner.canonicalEnglishTopic }
        : {}),
      ...(planner.primaryConcepts.length
        ? { primaryConcepts: planner.primaryConcepts }
        : {}),
      ...(planner.contextConcepts.length
        ? { contextConcepts: planner.contextConcepts }
        : {}),
      ...(planner.reasoningNotes.length
        ? { reasoningNotes: planner.reasoningNotes }
        : {}),
    },
  };
}

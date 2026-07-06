import type {
  HiddenResearchPlan,
  TitleCandidateStyle,
  TopicExpansionDiagnostics,
  TopicExpansionResponse,
} from "@workspace/api-zod/topic-expansion";
import type { TopicExpansionCard } from "./generateReport";

export type SelectedTitleSearchSeed = {
  originalTopic: string;
  selectedTitle: string;
  hiddenResearchPlan: HiddenResearchPlan | null;
  researchObject?: string;
  variableOrAngle?: string;
  rationale?: string;
  keywordsZh?: string[];
  keywordsEn?: string[];
  querySeeds?: {
    zh: string[];
    en: string[];
  };
};

export type SelectedTitleSearchPayload = {
  displayTitle: string;
  canonicalTopicZh: string;
  canonicalTopicEn: string;
  querySeedZh: string[];
  querySeedEn: string[];
  subtopics: Array<{
    id: string;
    titleZh: string;
    titleEn?: string;
    queryZh: string[];
    queryEn: string[];
    mustIncludeTerms: string[];
    excludeTerms: string[];
    expectedSourceTypes: string[];
  }>;
  mustIncludeTerms: string[];
  excludeTerms: string[];
  domainHints: string[];
  selectedResearchPlanId: string;
};

const LEGACY_VISIBLE_TERMS = [
  "科學定義與量測方法",
  "形成機制、應用場景與限制條件",
  "背景脈絡、主要類型與核心特徵",
  "爭議、限制與後續發展趨勢",
];

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function fallbackMustIncludeTerms(payload: {
  selectedTitle: string;
  querySeedZh: string[];
  querySeedEn: string[];
}): string[] {
  return uniqueStrings([
    payload.selectedTitle,
    ...payload.querySeedZh.slice(0, 2),
    ...payload.querySeedEn.slice(0, 2),
  ]).slice(0, 6);
}

export function titleStyleBadgeLabel(style?: TitleCandidateStyle): string {
  switch (style) {
    case "academic":
      return "正式";
    case "poetic_academic":
      return "亮眼";
    case "narrative":
      return "敘事";
    case "question":
      return "提問";
    case "contrast":
      return "對照";
    case "practical":
      return "實用";
    default:
      return "題目";
  }
}

export function hasLegacyVisibleTitleTemplate(text: string): boolean {
  return LEGACY_VISIBLE_TERMS.some((term) => text.includes(term));
}

export function topicExpansionToTitleCards(
  result: TopicExpansionResponse,
): TopicExpansionCard[] {
  if (
    result.inputKind === "gibberish" ||
    result.sourceStrategy.includes("invalid-topic") ||
    result.expandedTopic.startsWith("查無結果")
  ) {
    return [];
  }

  if ((result.titleCandidates?.length ?? 0) > 0) {
    return result.titleCandidates!.map((candidate) => ({
      title: candidate.title,
      angle: titleStyleBadgeLabel(candidate.style),
      style: candidate.style,
      displayOnly: candidate.displayOnly,
      reason: candidate.rationale ?? "",
      researchObject: candidate.researchObject,
      variableOrAngle: candidate.variableOrAngle,
      rationale: candidate.rationale,
      keywordsZh: candidate.keywordsZh ?? [],
      keywordsEn: candidate.keywordsEn ?? [],
      querySeeds: candidate.querySeeds
        ? {
            zh: candidate.querySeeds.zh ?? [],
            en: candidate.querySeeds.en ?? [],
          }
        : undefined,
      hiddenResearchPlan: result.hiddenResearchPlan ?? null,
    }));
  }

  if (result.directions?.length) {
    return result.directions.map((direction) => ({
      title: direction.title,
      angle: direction.category || "題目",
      reason: "",
      hiddenResearchPlan: result.hiddenResearchPlan ?? null,
    }));
  }

  return result.researchQuestions.map((question) => ({
    title: question,
    angle: "題目",
    reason: "",
    hiddenResearchPlan: result.hiddenResearchPlan ?? null,
  }));
}

export function createSelectedTitleSearchSeed(
  originalTopic: string,
  selectedTitle: string,
  hiddenResearchPlan: HiddenResearchPlan | null | undefined,
  candidate?: {
    researchObject?: string;
    variableOrAngle?: string;
    rationale?: string;
    keywordsZh?: string[];
    keywordsEn?: string[];
    querySeeds?: {
      zh: string[];
      en: string[];
    };
  } | null,
): SelectedTitleSearchSeed {
  return {
    originalTopic: originalTopic.trim(),
    selectedTitle: selectedTitle.trim(),
    hiddenResearchPlan: hiddenResearchPlan ?? null,
    researchObject: candidate?.researchObject?.trim() || undefined,
    variableOrAngle: candidate?.variableOrAngle?.trim() || undefined,
    rationale: candidate?.rationale?.trim() || undefined,
    keywordsZh: uniqueStrings(candidate?.keywordsZh ?? []).slice(0, 8),
    keywordsEn: uniqueStrings(candidate?.keywordsEn ?? []).slice(0, 8),
    querySeeds: candidate?.querySeeds
      ? {
          zh: uniqueStrings(candidate.querySeeds.zh ?? []).slice(0, 6),
          en: uniqueStrings(candidate.querySeeds.en ?? []).slice(0, 6),
        }
      : undefined,
  };
}

export function buildSelectedTitleSearchPayload(input: {
  seed: SelectedTitleSearchSeed;
  diagnostics?: TopicExpansionDiagnostics | null;
}): SelectedTitleSearchPayload {
  const { seed, diagnostics } = input;
  const hidden = seed.hiddenResearchPlan;
  const querySeedZh = seed.querySeeds?.zh?.length
    ? seed.querySeeds.zh
    : hidden?.querySeedZh ?? [];
  const querySeedEn = seed.querySeeds?.en?.length
    ? seed.querySeeds.en
    : hidden?.querySeedEn ?? [];
  const canonicalTopicZh =
    hidden?.canonicalTopicZh?.trim() || seed.selectedTitle || seed.originalTopic;
  const canonicalTopicEn =
    hidden?.canonicalTopicEn?.trim() ||
    diagnostics?.canonicalEnglishTopic?.trim() ||
    querySeedEn.find((query) => /[A-Za-z]/.test(query)) ||
    "";
  const mustIncludeTerms = uniqueStrings([
    ...(seed.keywordsZh ?? []),
    ...(seed.keywordsEn ?? []),
    ...(hidden?.mustIncludeTerms ?? []),
    ...fallbackMustIncludeTerms({
      selectedTitle: canonicalTopicZh,
      querySeedZh,
      querySeedEn,
    }),
  ]).slice(0, 8);
  const excludeTerms = uniqueStrings(hidden?.excludeTerms ?? []).slice(0, 8);
  const subtopics =
    hidden?.subtopics?.length
      ? hidden.subtopics.map((subtopic) => ({
          id: subtopic.id,
          titleZh: subtopic.titleZh,
          ...(subtopic.titleEn ? { titleEn: subtopic.titleEn } : {}),
          queryZh: subtopic.queryZh,
          queryEn: subtopic.queryEn,
          mustIncludeTerms: subtopic.mustIncludeTerms ?? [],
          excludeTerms: subtopic.excludeTerms ?? [],
          expectedSourceTypes: subtopic.expectedSourceTypes ?? [],
        }))
      : [
          {
            id: "selected-title",
            titleZh: canonicalTopicZh,
            ...(canonicalTopicEn ? { titleEn: canonicalTopicEn } : {}),
            queryZh: querySeedZh,
            queryEn: querySeedEn,
            mustIncludeTerms,
            excludeTerms,
            expectedSourceTypes: [],
          },
        ];

  return {
    displayTitle: seed.selectedTitle,
    canonicalTopicZh,
    canonicalTopicEn,
    querySeedZh,
    querySeedEn,
    subtopics,
    mustIncludeTerms,
    excludeTerms,
    domainHints: uniqueStrings([
      ...(hidden?.domainHints ?? []),
      ...((hidden?.possibleDomains ?? []) as string[]),
      diagnostics?.topicDomain,
      ...(diagnostics?.secondaryDomains ?? []),
    ]).slice(0, 8),
    selectedResearchPlanId:
      hidden?.selectedResearchPlanId?.trim() || `selected-title:${seed.selectedTitle}`,
  };
}

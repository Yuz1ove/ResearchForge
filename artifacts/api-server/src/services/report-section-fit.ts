export const CANONICAL_REPORT_SECTION_IDS = [
  "abstract",
  "introduction",
  "research_question",
  "literature_review",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
] as const;

export type CanonicalReportSectionId = typeof CANONICAL_REPORT_SECTION_IDS[number];

const SECTION_FIT_ALIASES: Record<string, CanonicalReportSectionId[]> = {
  abstract: ["abstract"],
  summary: ["abstract"],
  摘要: ["abstract"],
  introduction: ["introduction"],
  intro: ["introduction"],
  導論: ["introduction"],
  引言: ["introduction"],
  research_question: ["research_question"],
  research_questions: ["research_question"],
  question: ["research_question"],
  研究問題: ["research_question"],
  研究问题: ["research_question"],
  研究目的: ["research_question"],
  literature_review: ["literature_review"],
  literature: ["literature_review"],
  文獻回顧: ["literature_review"],
  文献回顾: ["literature_review"],
  methodology: ["methodology"],
  method: ["methodology"],
  methods: ["methodology"],
  methods_context: ["methodology"],
  findings: ["findings"],
  finding: ["findings"],
  results: ["findings"],
  result: ["findings"],
  evidence_synthesis: ["findings"],
  主要發現: ["findings"],
  主要发现: ["findings"],
  研究發現: ["findings"],
  研究发现: ["findings"],
  discussion: ["discussion"],
  discussion_claim: ["discussion"],
  討論: ["discussion"],
  讨论: ["discussion"],
  limitations: ["limitations"],
  limitation: ["limitations"],
  evidence_boundary: ["limitations"],
  限制: ["limitations"],
  研究限制: ["limitations"],
  conclusion: ["conclusion"],
  conclusion_claim: ["conclusion"],

  // Workflow labels intentionally expand to every report section they can support.
  background: ["abstract", "introduction", "research_question"],
  background_or_definition: ["abstract", "introduction", "research_question"],
  concept_explanation: ["abstract", "introduction", "research_question"],
  研究背景: ["abstract", "introduction", "research_question"],
  背景: ["abstract", "introduction", "research_question"],
  文獻探討: ["abstract", "research_question", "literature_review", "discussion", "conclusion"],
  文献探讨: ["abstract", "research_question", "literature_review", "discussion", "conclusion"],
  研究方法: ["methodology", "limitations"],
  analysis: ["findings", "discussion"],
  數據分析: ["abstract", "findings", "discussion", "conclusion"],
  数据分析: ["abstract", "findings", "discussion", "conclusion"],
  結論: ["discussion", "limitations", "conclusion"],
  结论: ["discussion", "limitations", "conclusion"],
};

const REPORT_SECTION_ID_ALIASES: Record<string, CanonicalReportSectionId> = {
  summary: "abstract",
  摘要: "abstract",
  intro: "introduction",
  background: "introduction",
  研究背景: "introduction",
  背景: "introduction",
  導論: "introduction",
  引言: "introduction",
  research_questions: "research_question",
  question: "research_question",
  研究問題: "research_question",
  研究问题: "research_question",
  研究目的: "research_question",
  literature: "literature_review",
  文獻探討: "literature_review",
  文献探讨: "literature_review",
  文獻回顧: "literature_review",
  文献回顾: "literature_review",
  method: "methodology",
  methods: "methodology",
  methods_context: "methodology",
  研究方法: "methodology",
  findings: "findings",
  finding: "findings",
  results: "findings",
  result: "findings",
  analysis: "findings",
  數據分析: "findings",
  数据分析: "findings",
  主要發現: "findings",
  主要发现: "findings",
  討論: "discussion",
  讨论: "discussion",
  限制: "limitations",
  研究限制: "limitations",
  結論: "conclusion",
  结论: "conclusion",
};

function normalizeSectionFitKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

export function normalizeReportSectionId(value: string): CanonicalReportSectionId | null {
  const key = normalizeSectionFitKey(value);
  if ((CANONICAL_REPORT_SECTION_IDS as readonly string[]).includes(key)) {
    return key as CanonicalReportSectionId;
  }
  return REPORT_SECTION_ID_ALIASES[key] ?? REPORT_SECTION_ID_ALIASES[value.normalize("NFKC").trim()] ?? null;
}

export function normalizeEvidenceSectionFits(values: readonly string[]): CanonicalReportSectionId[] {
  const normalized = new Set<CanonicalReportSectionId>();
  for (const value of values) {
    const key = normalizeSectionFitKey(value);
    const mapped = SECTION_FIT_ALIASES[key] ?? SECTION_FIT_ALIASES[value.normalize("NFKC").trim()];
    for (const sectionId of mapped ?? []) normalized.add(sectionId);
  }
  return CANONICAL_REPORT_SECTION_IDS.filter((sectionId) => normalized.has(sectionId));
}

export function evidenceFitsReportSection(
  sectionId: string,
  rawFits: readonly string[],
  evidenceType?: string | null,
): boolean {
  if (rawFits.length === 0) return true;
  const target = normalizeReportSectionId(sectionId);
  if (!target) return false;
  if (target === "methodology" && /method/iu.test(evidenceType ?? "")) return true;
  return normalizeEvidenceSectionFits(rawFits).includes(target);
}

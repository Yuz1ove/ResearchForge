/**
 * Reusable ResearchForge publication tokens and structural normalizers.
 *
 * This module deliberately contains no report-specific copy. Preview, DOCX,
 * print HTML and QA use the same named system so publication behavior cannot
 * drift into one-off CSS for a single report.
 */
export const RESEARCHFORGE_PUBLICATION_LAYOUT = {
  schemaVersion: "researchforge-publication-layout/v1",
  preset: "narrative_proposal_a4_zh_tw",
  page: {
    size: "A4",
    widthTwips: 11906,
    heightTwips: 16838,
    marginTwips: 1304,
    marginMm: 23,
    footerMarginMm: 24,
  },
  typography: {
    bodyPt: 11,
    bodyLineHeight: 1.58,
    bodyLineTwips: 330,
    firstLineEm: 2,
    paragraphAfterPt: 5,
    heading1Pt: 16,
    heading2Pt: 13,
    heading3Pt: 11.5,
    captionPt: 9.5,
    notePt: 8.7,
    citationPt: 8,
  },
  color: {
    ink: "243535",
    deepTeal: "173F42",
    mutedTeal: "416B6C",
    gold: "A3833B",
    quiet: "627273",
    rule: "C7D5D4",
    pale: "F3F7F6",
    note: "FBF7EC",
  },
  pagination: {
    widows: 2,
    orphans: 2,
    headingMinimumFollowingLines: 2,
    keepCaptionWithObject: true,
    keepCitationWithSentence: true,
  },
} as const;

const HUMAN_ORDINAL_PREFIX =
  /^\s*(?:(?:第\s*)?[一二三四五六七八九十百]+\s*[、.．]\s*|[（(]?[一二三四五六七八九十百]+[）)]\s*)/u;
const PROGRAMMATIC_ORDINAL_PREFIX = /^\s*\d+\s*[.．、]\s*/u;

/** Removes one or more legacy ordinals without changing the semantic title. */
export function publicationSectionTitle(value: string): string {
  let title = value.trim();
  let previous = "";
  while (title && title !== previous) {
    previous = title;
    title = title
      .replace(PROGRAMMATIC_ORDINAL_PREFIX, "")
      .replace(HUMAN_ORDINAL_PREFIX, "")
      .trim();
  }
  return title;
}

export function publicationNumberedTitle(index: number, value: string): string {
  return `${index + 1}. ${publicationSectionTitle(value)}`;
}

export function publicationSourcesHeading(language = "zh-TW"): string {
  return /^zh(?:-|$)/iu.test(language) ? "資料來源" : "References";
}

const PUBLICATION_PUNCTUATION_ANOMALIES = [
  /。\s*[；;]/gu,
  /[；;]\s*。/gu,
  /。{2,}/gu,
  /，{2,}/gu,
] as const;

/** Reader-facing normalization shared by prose, tables, headings and exports. */
export function normalizePublicationText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/\u2019\s+s\b/gu, "\u2019s")
    .replace(PUBLICATION_PUNCTUATION_ANOMALIES[0], "。")
    .replace(PUBLICATION_PUNCTUATION_ANOMALIES[1], "；")
    .replace(PUBLICATION_PUNCTUATION_ANOMALIES[2], "。")
    .replace(PUBLICATION_PUNCTUATION_ANOMALIES[3], "，")
    .replace(/中文摘要：此來源可用於檢視/gu, "來源摘錄僅界定研究範圍為")
    .replace(/\s+([，。；：！？])/gu, "$1")
    .trim();
}

export function publicationCanonicalSectionTitle(input: {
  role: "research_question" | "scope_method" | "analysis" | "cross_source_synthesis" | "limitations" | "conclusion";
  analysisIndex?: number;
  analysisCount?: number;
}): string {
  switch (input.role) {
    case "research_question": return "研究問題與核心回答";
    case "scope_method": return "證據範圍及檢索方法";
    case "analysis":
      if ((input.analysisCount ?? 1) <= 1) return "主要研究發現";
      if ((input.analysisIndex ?? 0) === 0) return "文獻與證據概況";
      if ((input.analysisIndex ?? 0) === 1) return "主要研究發現";
      return `主要研究發現（${(input.analysisIndex ?? 0) + 1}）`;
    case "cross_source_synthesis": return "討論與證據比較";
    case "limitations": return "證據限制及研究缺口";
    case "conclusion": return "結論與後續研究方向";
  }
}

export function publicationTocLabel(number: number | null, title: string): string {
  return number == null ? publicationSectionTitle(title) : `${number}. ${publicationSectionTitle(title)}`;
}

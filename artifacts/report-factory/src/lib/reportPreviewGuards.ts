export type PreviewWorkflowContext = {
  workflowId?: string | null;
  topicHash?: string | null;
};

export type PreviewWorkspaceLike = {
  workflowId?: string | null;
  topicHash?: string | null;
  isConsistent?: boolean | null;
};

export type PreviewSectionLike = {
  sectionId?: string | null;
  title?: string | null;
  body?: string | null;
  prose?: string | null;
  groundingStatus?: "grounded" | "partially_grounded" | "unsupported" | string | null;
  generationMethod?: string | null;
  evidenceCardIds?: string[] | null;
  unsupportedSentences?: string[] | null;
  warnings?: string[] | null;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const CITATION_MARKER_CORE = String.raw`[sS\uff33\uff53]\s*[0-9\uff10-\uff19]+`;
const READER_FACING_CITATION_PATTERN = new RegExp(
  `(?:[\\[\\uff3b]\\s*${CITATION_MARKER_CORE}\\s*[\\]\\uff3d]|[\\(\\uff08]\\s*${CITATION_MARKER_CORE}\\s*[\\)\\uff09]|(?<![A-Za-z0-9_\\uff21-\\uff3a\\uff41-\\uff5a\\uff10-\\uff19])${CITATION_MARKER_CORE}(?![A-Za-z0-9_\\uff21-\\uff3a\\uff41-\\uff5a\\uff10-\\uff19]))`,
  "giu",
);

function asciiDigits(value: string): string {
  return value.replace(/[\uff10-\uff19]/gu, (digit) =>
    String(digit.charCodeAt(0) - 0xff10),
  );
}

export function stripReaderFacingCitationMarkers(
  value: string | null | undefined,
): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  return text
    .replace(READER_FACING_CITATION_PATTERN, (marker, offset: number, source: string) => {
      if (/^[\[\uff3b(\uff08]/u.test(marker)) return "";

      const before = source.slice(0, offset);
      const after = source.slice(offset + marker.length);
      const looksLikeScientificLabel =
        /(?:Table|Figure|Fig\.?|Supplement(?:ary)?|Appendix|\u8868|\u5716|\u9644\u8868|\u9644\u5716|\u9644\u9304)\s*$/iu.test(
          before,
        ) || !/^\s*(?:[\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001]|$)/u.test(after);

      return looksLikeScientificLabel ? marker : "";
    })
    .replace(/[ \t]+([\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001\uff1a:])/gu, "$1")
    .replace(/([\u3001\uff0c,\uff1b;\uff1a:])(?:\s*[\u3001\uff0c,\uff1b;\uff1a:])+/gu, "$1")
    .replace(/[\u3001\uff0c,\uff1b;\uff1a:]+\s*([\u3002\uff01\uff1f!?])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, "\n")
    .trim();
}

export function citationMarkerSourceLabel(
  marker: string | null | undefined,
  fallbackIndex = 0,
): string {
  const digits = marker?.match(/[0-9\uff10-\uff19]+/u)?.[0];
  return `\u4f86\u6e90 ${digits ? asciiDigits(digits) : fallbackIndex + 1}`;
}

const PARAGRAPH_TRANSITION_PATTERN = /^(?:此外|然而|不過|相較之下|另一方面|因此|綜合而言|整體而言|在方法上|在結果上|限制在於|最後)/u;
const READER_METADATA_LABEL_PATTERN =
  /(?:【|\[)?(?:主旨|摘要重點|重點摘要|摘要要點|內容摘要|限制說明|資料限制)(?:】|\])?\s*[:\uff1a]\s*/gu;

const INTERNAL_READER_LANGUAGE_REPLACEMENTS: Array<readonly [RegExp, string]> = [
  [
    /Associations of screen time with sleep duration and sleep quality in adolescents adolescent digital media health student wellbeing students/giu,
    "青少年螢幕使用與睡眠時長及睡眠品質之關聯",
  ],
  [
    /此來源已保留可追溯的摘要片段，但尚未完成可驗證的繁中重點整理/gu,
    "此來源目前只提供可核對的原文摘要，因此不單獨形成本文的實質結論",
  ],
  [/\bmetadata\s+incomplete\b/giu, "書目資料待補"],
  [/\bevidence\s+card\s+builder\b/giu, "證據摘錄整理流程"],
  [/\bexact\s+(?:abstract\s*\/\s*full[-\s]?text\s+)?support\s*span\b/giu, "可核對的來源支持片段"],
  [/\bsupport\s*span\b/giu, "來源支持片段"],
  [/\bevidence\s+chunks?\b/giu, "證據摘錄"],
  [/\bevidence\s+cards?\b/giu, "證據摘錄"],
  [/證據卡(?:片)?/gu, "證據摘錄"],
  [/\bmetadata(?:-only)?\b/giu, "書目資訊"],
  [/\bpeer[-\s]?reviewed\s+evidence\b/giu, "同儕審查文獻"],
  [/\baccepted\s+sources?\b/giu, "已納入來源"],
  [/\baccepted[-\s]+source\s+abstract\b/giu, "已納入來源之摘要"],
  [/\bdirect_evidence\b/giu, "直接證據"],
  [/\brule_fallback_claim_extraction\b/giu, "僅能依摘要或可讀片段進行保守判讀"],
  [/\bcanonical\s+(?:standardized\s+)?facts?\b/giu, "可核對的標準化研究數值"],
  [/\bstandardized\s+evidence\s+facts?\b/giu, "可核對的標準化研究數值"],
  [/\bexactResult\b/gu, "原始數值"],
  [/\bfact\s+(?:and\s+)?locator\b/giu, "數值與原文定位"],
  [/\bfact\s+與\s+locator\b/giu, "數值與原文定位"],
  [/\blocator\b/giu, "原文定位"],
  [/主要\s+exposure\b/giu, "主要暴露指標"],
  [/\bprovider\s+(?:diagnostics?|progress|status)\b/giu, "來源服務狀態"],
  [/\bLLM\s+provider\b/giu, "模型服務"],
  [/\bWriter\b/gu, "正式內容驗證"],
  [/(?:內容|content)\s*gate/giu, "內容審查"],
  [/\bINSUFFICIENT_FOR_CROSS_STUDY_CONSISTENCY\b\s*[：:]/gu, "目前不足以判斷跨研究一致性："],
  [/[（(]?\bINSUFFICIENT_FOR_CROSS_STUDY_CONSISTENCY\b[）)]?/gu, ""],
  [/\bgrounding\s+verifier\b/giu, "引用支撐檢查"],
  [/\bverifier\b/giu, "引用檢查"],
  [/\bneeds?_manual_review\b/giu, "需人工複核"],
  [/\bgrounding_verifier_blocked\b/giu, "引用支撐不足"],
  [/\babstractOnly\b/giu, "內容層級"],
  [/\bArgumentMap\b/gu, "整體論證"],
  [/\bDiscoursePlan\b/gu, "章節論證安排"],
  [/\bReportPlan\b/gu, "報告架構"],
  [/\bcanonical\s+citation\s+registry\b/giu, "統一引用對照"],
  [/\bnormalizedClaimZhTw\b/gu, "已核對主張"],
  [/\bparagraphPlans?\b/giu, "段落安排"],
  [/\bfindings\s*類證據/giu, "現有研究"],
  [/已正規化且可追溯的主張/gu, "已核對且可追溯的主張"],
  [/已正規化/gu, "已整理"],
  [/未正規化/gu, "未經整理"],
  [/正規化/gu, "整理"],
  [/研究發現類證據/gu, "現有研究"],
  [/原文片段只供核對/gu, "原始來源內容僅供查核"],
  [/既定段落規劃/gu, "本節分析目的"],
  [/可核對的來源摘錄/gu, "可追溯證據"],
  [/不能形成研究結論/gu, "尚無法形成具普遍性的定論"],
  [/\b(?:jobId|workflowId)\b\s*[:=]?\s*[\w-]*/giu, ""],
];

export const READER_FACING_INTERNAL_TERM_PATTERNS: ReadonlyArray<
  readonly [label: string, pattern: RegExp]
> = [
  ["metadata", /\bmetadata(?:-only|\s+incomplete)?\b/iu],
  ["evidence card", /\bevidence\s+cards?\b|證據卡(?:片)?/iu],
  ["evidence chunk", /\bevidence\s+chunks?\b/iu],
  ["support span", /\bsupport\s*span\b/iu],
  ["provider diagnostics", /\bprovider\s+(?:diagnostics?|progress|status)\b/iu],
  ["accepted sources", /\baccepted\s+sources?\b/iu],
  ["accepted source abstract", /\baccepted[-\s]+source\s+abstract\b/iu],
  ["internal evidence enum", /\bdirect_evidence\b/iu],
  ["fallback rule", /\brule_fallback_claim_extraction\b/iu],
  ["canonical fact label", /\bcanonical\s+(?:standardized\s+)?facts?\b/iu],
  ["standardized evidence fact", /\bstandardized\s+evidence\s+facts?\b/iu],
  ["exact result field", /\bexactResult\b/u],
  ["fact locator label", /\bfact\s+(?:and\s+)?locator\b|\bfact\s+與\s+locator\b/iu],
  ["mixed-language exposure label", /主要\s+exposure\b/iu],
  ["grounding verifier", /\bgrounding\s+verifier\b/iu],
  ["internal review status", /\b(?:needs?_manual_review|grounding_verifier_blocked)\b/iu],
  ["internal boolean", /\babstractOnly\b/iu],
  ["argument map", /\bArgumentMap\b/u],
  ["discourse plan", /\bDiscoursePlan\b/u],
  ["report plan", /\bReportPlan\b/u],
  ["canonical citation registry", /\bcanonical\s+citation\s+registry\b/iu],
  ["normalized claim", /\bnormalizedClaimZhTw\b/u],
  ["paragraph plan", /\bparagraphPlans?\b/iu],
  ["internal evidence type", /\bfindings\s*類證據/iu],
  ["normalization workflow", /(?:已|未)?正規化(?:內容|證據|主張)?/u],
  ["generation-state notice", /尚未完成可驗證的繁中重點整理/u],
  ["writer implementation term", /\bWriter\b/u],
  ["content gate", /(?:內容|content)\s*gate/iu],
  ["consistency enum", /\bINSUFFICIENT_FOR_CROSS_STUDY_CONSISTENCY\b/u],
];

export function readerFacingInternalTerms(
  value: string | null | undefined,
): string[] {
  const text = value ?? "";
  return READER_FACING_INTERNAL_TERM_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

/** Removes implementation vocabulary from every reader-facing surface. */
export function sanitizeReaderFacingInternalLanguage(
  value: string | null | undefined,
): string {
  let text = value?.trim() ?? "";
  for (const [pattern, replacement] of INTERNAL_READER_LANGUAGE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, "$1")
    .replace(/台灣/gu, "臺灣")
    .replace(/台北/gu, "臺北")
    .replace(/,/gu, "，")
    .replace(/;/gu, "；")
    .replace(/\?/gu, "？")
    .replace(/!/gu, "！")
    .replace(/可追溯的可追溯證據/gu, "可追溯證據")
    .replace(/現有現有研究/gu, "現有研究")
    .replace(/；\s*。/gu, "。")
    .replace(/([\u3002\uff01\uff1f\uff1b])\s+(?=[\u3400-\u9fff])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+([\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001\uff1a:])/gu, "$1")
    .trim();
}

function readerSentences(value: string): string[] {
  return (value.match(/[^\u3002\uff01\uff1f!?\uff1b;]+[\u3002\uff01\uff1f!?\uff1b;]?/gu) ?? [])
    .map((sentence) =>
      sentence
        .trim()
        .replace(READER_METADATA_LABEL_PATTERN, ""),
    )
    .filter(Boolean);
}

function sentenceFingerprint(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/^(?:主旨|摘要重點)\s*[:\uff1a]\s*/u, "")
    .replace(/[\s\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001\uff1a:"'“”‘’()[\]【】]/gu, "");
}

function dedupeReaderSentences(sentences: string[]): string[] {
  const retained: Array<{ sentence: string; fingerprint: string; hasNumber: boolean }> = [];

  for (const sentence of sentences) {
    const fingerprint = sentenceFingerprint(sentence);
    if (!fingerprint) continue;
    const hasNumber = /[0-9\uff10-\uff19%\uff05]/u.test(sentence);
    const exactIndex = retained.findIndex((item) => item.fingerprint === fingerprint);
    if (exactIndex >= 0) continue;

    if (!hasNumber && fingerprint.length >= 10) {
      const overlapIndex = retained.findIndex(
        (item) =>
          !item.hasNumber &&
          item.fingerprint.length >= 10 &&
          (item.fingerprint.includes(fingerprint) || fingerprint.includes(item.fingerprint)),
      );
      if (overlapIndex >= 0) {
        const existing = retained[overlapIndex];
        if (existing && fingerprint.length > existing.fingerprint.length) {
          retained[overlapIndex] = { sentence, fingerprint, hasNumber };
        }
        continue;
      }
    }
    retained.push({ sentence, fingerprint, hasNumber });
  }

  return retained.map((item) => item.sentence);
}

function naturalSentenceGroups(sentences: string[]): string[][] {
  if (sentences.length <= 2) return sentences.length ? [sentences] : [];
  const groups: string[][] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const startsNewThought = PARAGRAPH_TRANSITION_PATTERN.test(sentence);
    if (current.length >= 2 && (startsNewThought || current.length >= 4)) {
      groups.push(current);
      current = [];
    }
    current.push(sentence);
  }
  if (current.length > 0) groups.push(current);

  const shouldRebalance =
    groups.length > 4 ||
    groups.some((group) => group.length === 1 || group.length > 4) ||
    (groups.length === 1 && sentences.length >= 4);
  if (!shouldRebalance) return groups;

  const groupCount = Math.min(
    4,
    Math.max(2, Math.ceil(sentences.length / 4)),
    Math.floor(sentences.length / 2),
  );
  const baseSize = Math.floor(sentences.length / groupCount);
  const remainder = sentences.length % groupCount;
  let cursor = 0;
  const balanced: string[][] = [];
  for (let index = 0; index < groupCount; index += 1) {
    const size = baseSize + (index >= groupCount - remainder ? 1 : 0);
    balanced.push(sentences.slice(cursor, cursor + size));
    cursor += size;
  }
  return balanced;
}

export function readerFacingNaturalParagraphs(
  value: string | null | undefined,
  seenSentenceFingerprints?: Set<string>,
  preserveCitationMarkers = false,
): string[] {
  const readerText = preserveCitationMarkers
    ? sanitizeReaderFacingInternalLanguage(value)
    : stripReaderFacingCitationMarkers(sanitizeReaderFacingInternalLanguage(value));
  if (!readerText) return [];
  const sentences = readerText
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap(readerSentences);
  const uniqueSentences = dedupeReaderSentences(sentences).filter((sentence) => {
    if (!seenSentenceFingerprints) return true;
    const fingerprint = sentenceFingerprint(sentence);
    const hasNumber = /[0-9\uff10-\uff19%\uff05]/u.test(sentence);
    const alreadyCovered = Array.from(seenSentenceFingerprints).some(
      (seenFingerprint) =>
        seenFingerprint === fingerprint ||
        (!hasNumber &&
          fingerprint.length >= 10 &&
          seenFingerprint.length >= 10 &&
          (fingerprint.includes(seenFingerprint) || seenFingerprint.includes(fingerprint))),
    );
    if (alreadyCovered) return false;
    seenSentenceFingerprints.add(fingerprint);
    return true;
  });
  const paragraphs = naturalSentenceGroups(uniqueSentences)
    .map((group) => group.join(""));
  return paragraphs.length > 0 ? paragraphs : [readerText];
}

export function previewWorkspaceMatchesContext(
  workspace: PreviewWorkspaceLike,
  context: PreviewWorkflowContext,
): boolean {
  if (workspace.isConsistent === false) return false;
  if (context.workflowId && context.workflowId !== workspace.workflowId) return false;
  if (context.topicHash && context.topicHash !== workspace.topicHash) return false;
  return true;
}

export function visibleReportSectionText(section: PreviewSectionLike): string {
  return sanitizeReaderFacingInternalLanguage(
    cleanText(section.body) ??
    cleanText(section.prose) ??
    "目前已納入的來源可支撐本段的背景與初步觀點，但對於在地案例、第一手統計或具體比較資料仍不足。因此，本報告暫以文獻整理與來源審查作為基礎，後續建議補充官方資料或實地調查資料。"
  );
}

export function sectionRequiresExportReview(section: PreviewSectionLike): boolean {
  if (
    section.sectionId === "title" ||
    section.title === "標題" ||
    section.sectionId === "references" ||
    section.title === "參考資料"
  ) {
    return false;
  }
  if (section.generationMethod === "grounding_verifier_blocked") return true;
  if (section.generationMethod === "needs_manual_review") return true;
  if (section.generationMethod === "insufficient_evidence_notice") return true;
  if (section.groundingStatus === "unsupported") return true;
  if ((section.unsupportedSentences?.length ?? 0) > 0) return true;
  if (section.warnings?.includes("needs_manual_review")) return true;
  // A legacy or manually-authored conceptual section can be valid without an
  // evidence-card binding. Treat it as blocked only when the pipeline supplied
  // an explicit generation state and still produced no binding.
  return Boolean(section.generationMethod) &&
    (section.evidenceCardIds?.length ?? 0) === 0 &&
    section.generationMethod !== "title" &&
    section.generationMethod !== "detailed_report_summary";
}

export function exportSafeReportSectionText(section: PreviewSectionLike): string {
  if (!sectionRequiresExportReview(section)) {
    return readerFacingNaturalParagraphs(
      visibleReportSectionText(section),
      undefined,
      true,
    ).join("\n\n");
  }
  const title = cleanText(section.title) ?? "本節";
  const unsupported = new Set(
    (section.unsupportedSentences ?? [])
      .map((sentence) => sanitizeReaderFacingInternalLanguage(sentence))
      .filter(Boolean),
  );
  const retained = section.generationMethod === "needs_manual_review"
    ? []
    : readerSentences(visibleReportSectionText(section))
    .filter((sentence) => !unsupported.has(sanitizeReaderFacingInternalLanguage(sentence)))
    .filter(
      (sentence) =>
        !/目前不輸出正式段落|重新生成或審查|尚未完成|此處需要補充|資料待補|來源待確認/u.test(sentence),
    );
  const retainedText = readerFacingNaturalParagraphs(
    retained.join(""),
    undefined,
    true,
  ).join("\n\n");
  const boundary = `「${title}」目前缺少足以支撐進一步實質判斷的直接資料；本節因此只說明研究範圍與證據缺口，不提出未經支撐的結論。`;
  return retainedText ? `${retainedText}\n\n${boundary}` : boundary;
}

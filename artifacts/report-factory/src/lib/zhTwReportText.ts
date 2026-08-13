const HAN_PATTERN = /[\u3400-\u9fff]/u;
const CITATION_MARKER_SOURCE = String.raw`[\[\uff3b]\s*[S\uff33]\d+\s*[\]\uff3d]`;
const CITATION_MARKER_PATTERN = new RegExp(CITATION_MARKER_SOURCE, "giu");
const RAW_ABSTRACT_LABEL_PATTERN = /(?<![A-Za-z])abstract\b\s*(?:[:\uff1a.\-\u2013\u2014])?/iu;
const MARKDOWN_ENGLISH_FRAGMENT_PATTERN = /`+\s*[A-Za-z][^`\u3002\uff01\uff1f]{18,}`*/u;
const JAPANESE_KANA_PATTERN = /[\u3040-\u30ff]{2,}/u;
const SENTENCE_END_PATTERN = /[\u3002\uff01\uff1f!?\uff1b;]/u;
const TRAILING_CONNECTOR_PATTERN = /[\u65bc\u70ba\u8207\u548c\u53ca\u6216\u7684\u4e4b\u5728\u7531\u5411\u5c0d\u5c07\u628a\u88ab\u5f9e]$/u;
const NON_SUBSTANTIVE_ZH_TW_PATTERN =
  /(?:此來源)?尚未完成(?:可驗證的)?繁中(?:摘要|重點整理)|英文摘要請展開詳情查看|以下顯示原文摘要/u;

function cleanText(value: string | null | undefined): string {
  return value?.replace(/`+/gu, "").replace(/\s+/gu, " ").trim() ?? "";
}

function latinWordCount(value: string): number {
  return value.match(/[A-Za-z][A-Za-z'\u2019-]*/gu)?.length ?? 0;
}

function hanCharacterCount(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function normalizeCitationMarkers(value: string): string {
  return value.replace(CITATION_MARKER_PATTERN, (marker) =>
    marker
      .replace(/[\uff3b]/gu, "[")
      .replace(/[\uff3d]/gu, "]")
      .replace(/[sS\uff33\uff53]/gu, "S")
      .replace(/\s+/gu, ""),
  );
}

function citationOnlySentence(value: string): boolean {
  if (!value.match(CITATION_MARKER_PATTERN)) return false;
  return !value
    .replace(CITATION_MARKER_PATTERN, "")
    .replace(/[\s\u3002\uff01\uff1f!?\uff1b;]/gu, "")
    .trim();
}

function normalizeTrailingCitationPlacement(value: string): string {
  const pattern = new RegExp(
    `([\\u3002\\uff01\\uff1f!?\\uff1b;])\\s*((?:${CITATION_MARKER_SOURCE}\\s*)+)([\\u3002\\uff01\\uff1f!?\\uff1b;])?$`,
    "iu",
  );
  return normalizeCitationMarkers(
    value.replace(pattern, (_match, firstEnd: string, markers: string, finalEnd?: string) =>
      `${markers}${finalEnd || firstEnd}`,
    ),
  );
}

function sentenceSegments(value: string): string[] {
  const initial = value
    .replace(/\r\n?/gu, "\n")
    .split(/(?<=[\u3002\uff01\uff1f!?\uff1b;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const attached: string[] = [];

  for (const sentence of initial) {
    if (citationOnlySentence(sentence) && attached.length > 0) {
      const previous = attached.pop() ?? "";
      attached.push(normalizeTrailingCitationPlacement(`${previous}${sentence}`));
      continue;
    }
    attached.push(normalizeTrailingCitationPlacement(sentence));
  }

  return attached;
}

function rawEnglishStartIndex(value: string): number {
  const abstractMatch = RAW_ABSTRACT_LABEL_PATTERN.exec(value);
  if (abstractMatch?.index !== undefined) return abstractMatch.index;
  const markdownMatch = MARKDOWN_ENGLISH_FRAGMENT_PATTERN.exec(value);
  if (markdownMatch?.index !== undefined) return markdownMatch.index;
  if (!containsRawEnglishEvidenceText(value)) return -1;
  return value.search(/[A-Za-z]/u);
}

function safeChinesePrefix(value: string, rawStartIndex: number): string {
  if (rawStartIndex <= 0) return "";
  const prefix = cleanText(
    value
      .slice(0, rawStartIndex)
      .replace(CITATION_MARKER_PATTERN, "")
      .replace(/[\s`'"\uff08(\uff1a:\u3001\uff0c,]+$/gu, ""),
  );
  if (!prefix || !HAN_PATTERN.test(prefix) || containsRawEnglishEvidenceText(prefix)) return "";
  if (TRAILING_CONNECTOR_PATTERN.test(prefix)) return "";
  return SENTENCE_END_PATTERN.test(prefix.at(-1) ?? "") ? prefix : `${prefix}\u3002`;
}

/**
 * Detects source-language material that should remain in evidence trace fields,
 * rather than being pasted into a Traditional-Chinese report paragraph.
 */
export function containsRawEnglishEvidenceText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (RAW_ABSTRACT_LABEL_PATTERN.test(text)) return true;
  if (MARKDOWN_ENGLISH_FRAGMENT_PATTERN.test(text)) return true;
  if (JAPANESE_KANA_PATTERN.test(text)) return true;

  const withoutMarkers = text.replace(CITATION_MARKER_PATTERN, "");
  const latinWords = latinWordCount(withoutMarkers);
  const hanCharacters = hanCharacterCount(withoutMarkers);
  if (latinWords >= 12 && hanCharacters === 0) return true;
  return latinWords >= 18 && latinWords > hanCharacters * 1.5;
}

/** Returns a reader-facing zh text only when the candidate is actually Chinese. */
export function verifiedZhTwReportText(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    const cleaned = cleanText(value)
      .replace(/^\s*(?:\u6458\u8981|\u4e2d\u6587\u6458\u8981)\s*[:\uff1a]\s*/u, "")
      .trim();
    if (!cleaned || !HAN_PATTERN.test(cleaned)) continue;
    if (containsRawEnglishEvidenceText(cleaned)) continue;
    if (NON_SUBSTANTIVE_ZH_TW_PATTERN.test(cleaned)) continue;
    return cleaned;
  }
  return "";
}

export const UNTRANSLATED_EVIDENCE_NOTICE =
  "\u6b64\u4f86\u6e90\u5df2\u4fdd\u7559\u53ef\u8ffd\u6eaf\u7684\u6458\u8981\u7247\u6bb5\uff0c\u4f46\u5c1a\u672a\u5b8c\u6210\u53ef\u9a57\u8b49\u7684\u7e41\u4e2d\u91cd\u9ede\u6574\u7406";

function sentenceMarkers(value: string): string {
  return Array.from(new Set(value.match(CITATION_MARKER_PATTERN) ?? []))
    .map((marker) => normalizeCitationMarkers(marker))
    .join("");
}

/**
 * Repairs legacy or remote prose that pasted raw English abstracts into zh-TW
 * paragraphs.  It never translates or guesses the source claim: unsafe source
 * text is replaced with an explicit evidence-language gap.
 */
export function sanitizeZhTwReportProse(value: string | null | undefined): string {
  const original = value?.trim() ?? "";
  if (!original) return "";
  const sentences = sentenceSegments(original);
  const repaired: string[] = [];

  for (const sentence of sentences) {
    if (containsRawEnglishEvidenceText(sentence)) {
      const markers = sentenceMarkers(sentence);
      const prefix = safeChinesePrefix(sentence, rawEnglishStartIndex(sentence));
      if (prefix) repaired.push(prefix);
      repaired.push(`${UNTRANSLATED_EVIDENCE_NOTICE}${markers}\u3002`);
      continue;
    }
    const cleaned = normalizeTrailingCitationPlacement(cleanText(sentence));
    if (cleaned) repaired.push(cleaned);
  }

  const deduped = repaired.filter((sentence, index) => repaired.indexOf(sentence) === index);
  if (deduped.length > 0) return deduped.join(" ");
  return `${UNTRANSLATED_EVIDENCE_NOTICE}\uff0c\u56e0\u6b64\u66ab\u4e0d\u5f62\u6210\u6b63\u6587\u7d50\u8ad6\u3002`;
}

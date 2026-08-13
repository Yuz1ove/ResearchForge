import {
  canonicalizeCitationMarkersInText,
  extractCanonicalCitationMarkers,
} from "./citation-markers";

const INLINE_METADATA_LABEL =
  /(?:【|\[)?(?:主旨|摘要重點|重點摘要|摘要要點|內容摘要|限制說明|研究限制|資料限制|限制)(?:】|\])?\s*[：:]/gu;
const CITATION_MARKER = /\[S\d+\]/gu;

function cleanCandidate(value: string): string {
  const cleaned = canonicalizeCitationMarkersInText(value)
    .replace(/^[\s\-*#•·●○▪▫、；;。．]+/u, "")
    .replace(INLINE_METADATA_LABEL, "")
    .replace(/[；;]\s*[。．]/gu, "；")
    .replace(/[。．]\s*[；;]/gu, "。")
    .replace(/([。！？!?；;])\1+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return "";
  const visible = cleaned.replace(CITATION_MARKER, "").replace(/[^\p{L}\p{N}]/gu, "");
  if (visible.length < 5) return "";
  if (/[\u3002！？!?；;]$/u.test(cleaned)) return cleaned;
  return `${cleaned}。`;
}

function preparedText(value: string): string {
  return canonicalizeCitationMarkersInText(value)
    .replace(/\r\n?/gu, "\n")
    .replace(INLINE_METADATA_LABEL, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

function sentenceCandidates(value: string): string[] {
  const prepared = preparedText(value);
  if (!prepared) return [];
  return prepared
    .split(/(?<=[。！？!?])\s*|(?<=[；;])\s+|\n+/u)
    .map(cleanCandidate)
    .filter(Boolean);
}

function comparisonKey(value: string): string {
  return canonicalizeCitationMarkersInText(value)
    .replace(CITATION_MARKER, "")
    .replace(INLINE_METADATA_LABEL, "")
    .toLocaleLowerCase("zh-TW")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value: string): Set<string> {
  const output = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    output.add(value.slice(index, index + 2));
  }
  return output;
}

function nearDuplicate(left: string, right: string): boolean {
  const a = comparisonKey(left);
  const b = comparisonKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (
    shorter.length >= 14 &&
    longer.includes(shorter) &&
    shorter.length / longer.length >= 0.78
  ) {
    return true;
  }
  if (shorter.length < 18) return false;
  const aPairs = bigrams(a);
  const bPairs = bigrams(b);
  let overlap = 0;
  for (const pair of aPairs) {
    if (bPairs.has(pair)) overlap += 1;
  }
  const dice = (2 * overlap) / Math.max(1, aPairs.size + bPairs.size);
  return dice >= 0.88;
}

function mergeCitationMarkers(preferred: string, values: string[]): string {
  const markers = Array.from(
    new Set(values.flatMap((value) => extractCanonicalCitationMarkers(value))),
  );
  if (markers.length === 0) return preferred;
  const withoutMarkers = canonicalizeCitationMarkersInText(preferred)
    .replace(CITATION_MARKER, "")
    .trim();
  const punctuation = withoutMarkers.match(/[。！？!?]$/u)?.[0] ?? "。";
  const body = withoutMarkers.replace(/[。！？!?]+$/u, "").trim();
  return `${body}${markers.join("")}${punctuation}`;
}

export function uniqueReportFragments(values: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  for (const value of values) {
    if (!value?.trim()) continue;
    for (const candidate of sentenceCandidates(value)) {
      const duplicateIndex = output.findIndex((existing) => nearDuplicate(existing, candidate));
      if (duplicateIndex < 0) {
        output.push(candidate);
        continue;
      }
      const existing = output[duplicateIndex]!;
      const preferred = comparisonKey(candidate).length > comparisonKey(existing).length
        ? candidate
        : existing;
      output[duplicateIndex] = mergeCitationMarkers(preferred, [existing, candidate]);
    }
  }
  return output;
}

function desiredParagraphCount(sentenceCount: number): number {
  if (sentenceCount <= 1) return sentenceCount;
  if (sentenceCount <= 4) return 2;
  if (sentenceCount <= 7) return 3;
  return 4;
}

function distributeSentences(sentences: string[], paragraphCount: number): string[] {
  if (paragraphCount <= 1) return sentences.length > 0 ? [sentences.join("")] : [];
  const paragraphs: string[] = [];
  let offset = 0;
  for (let index = 0; index < paragraphCount; index += 1) {
    const remainingSentences = sentences.length - offset;
    const remainingParagraphs = paragraphCount - index;
    const take = Math.ceil(remainingSentences / remainingParagraphs);
    paragraphs.push(sentences.slice(offset, offset + take).join(""));
    offset += take;
  }
  return paragraphs.filter(Boolean);
}

/**
 * Normalizes reader-facing section prose while leaving evidence/citation ids untouched.
 * Near-duplicate sentences are collapsed and their inline source markers are unioned.
 * A usable section is rendered as two to four balanced natural paragraphs whenever at
 * least two distinct sentences are available.
 */
export function normalizeReportSectionProse(
  primary: string,
  supplements: Array<string | null | undefined> = [],
): string {
  const primarySentences = uniqueReportFragments([primary]);
  const sentences = [...primarySentences];
  const explicitParagraphCount = preparedText(primary)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
  if (sentences.length < 2) {
    for (const supplement of uniqueReportFragments(supplements)) {
      const merged = uniqueReportFragments([...sentences, supplement]);
      sentences.splice(0, sentences.length, ...merged);
      if (sentences.length >= 2) break;
    }
  }
  const paragraphCount = explicitParagraphCount >= 2 && explicitParagraphCount <= 4
    ? Math.min(explicitParagraphCount, sentences.length)
    : desiredParagraphCount(sentences.length);
  return distributeSentences(sentences, paragraphCount).join("\n\n");
}

export function reportSectionParagraphs(value: string): string[] {
  return normalizeReportSectionProse(value)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function firstReportFragment(value: string | null | undefined): string {
  return uniqueReportFragments([value])[0] ?? "";
}

import type {
  ResearchTitleSentenceParse,
  TitleSemanticComparison,
} from "@workspace/api-zod";

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? compactWhitespace(value) : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeCompareValue(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[「」"'`]/g, "")
    .replace(/[()（）,，、:：;；.。!?！？]/g, " ");
}

function normalizeCompareList(values: string[]): string[] {
  return uniqueStrings(values.map(normalizeCompareValue)).sort();
}

function charSimilarity(left: string, right: string): number {
  const leftChars = new Set(left.replace(/\s+/g, ""));
  const rightChars = new Set(right.replace(/\s+/g, ""));
  if (leftChars.size === 0 || rightChars.size === 0) return 0;
  const overlap = Array.from(leftChars).filter((char) => rightChars.has(char)).length;
  return overlap / Math.max(leftChars.size, rightChars.size);
}

function listsSemanticallyEquivalent(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeCompareList(left);
  const normalizedRight = normalizeCompareList(right);
  if (JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight)) return true;
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every(
    (item, index) => charSimilarity(item, normalizedRight[index] ?? "") >= 0.6,
  );
}

export function parseResearchTitleSentence(text: string): ResearchTitleSentenceParse {
  const originalText = compactWhitespace(text);
  const normalizedText = originalText.replace(/[「」"'`]/g, "");
  const warnings: string[] = [];
  const empty = {
    subject: [] as string[],
    independentVariables: [] as string[],
    dependentVariables: [] as string[],
    relation: [] as string[],
    conditions: [] as string[],
    scope: [] as string[],
    missingFields: [] as string[],
  };

  const effectPatterns = [
    /^(不同.+?)對(.+?)的影響$/u,
    /^(.+?)對(.+?)的影響$/u,
    /^(不同.+?)對(.+?)之影響$/u,
    /^(.+?)對(.+?)之影響$/u,
    /^effect of (.+?) on (.+)$/i,
  ];
  for (const pattern of effectPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1] && match?.[2]) {
      const iv = compactWhitespace(match[1]);
      const dv = compactWhitespace(match[2]);
      return {
        originalText,
        normalizedText,
        sentenceType: "effect_of_x_on_y",
        subject: uniqueStrings([dv]),
        independentVariables: [iv],
        dependentVariables: [dv],
        relation: ["影響"],
        conditions: /^不同/u.test(iv) ? [iv] : [],
        scope: [],
        confidence: 0.94,
        missingFields: [],
        warnings,
      };
    }
  }

  const correlationPatterns = [
    /^(.+?)與(.+?)的(?:關係|相關性)$/u,
    /^relationship between (.+?) and (.+)$/i,
    /^correlation between (.+?) and (.+)$/i,
  ];
  for (const pattern of correlationPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1] && match?.[2]) {
      const left = compactWhitespace(match[1]);
      const right = compactWhitespace(match[2]);
      return {
        originalText,
        normalizedText,
        sentenceType: "correlation",
        subject: uniqueStrings([left, right]),
        independentVariables: [left],
        dependentVariables: [right],
        relation: ["關係"],
        conditions: [],
        scope: [],
        confidence: 0.9,
        missingFields: [],
        warnings,
      };
    }
  }

  const mechanismPatterns = [
    /^(.+?)的(?:形成)?機制$/u,
    /^(.+?)反應的反應機制$/u,
    /^mechanism of (.+)$/i,
  ];
  for (const pattern of mechanismPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const subject = compactWhitespace(match[1]);
      return {
        originalText,
        normalizedText,
        sentenceType: "mechanism",
        subject: [subject],
        independentVariables: [],
        dependentVariables: [],
        relation: ["機制"],
        conditions: [],
        scope: [],
        confidence: 0.85,
        missingFields: [],
        warnings,
      };
    }
  }

  const comparisonPatterns = [/^不同(.+?)的(.+?)比較$/u, /^(.+?)比較$/u, /^comparison of (.+)$/i];
  for (const pattern of comparisonPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const left = compactWhitespace(match[1]);
      const right = compactWhitespace(match[2] ?? "");
      return {
        originalText,
        normalizedText,
        sentenceType: "comparison",
        subject: uniqueStrings([left, right || normalizedText]),
        independentVariables: [left],
        dependentVariables: right ? [right] : [],
        relation: ["比較"],
        conditions: /^不同/u.test(normalizedText) ? [left] : [],
        scope: [],
        confidence: right ? 0.83 : 0.68,
        missingFields: right ? [] : ["dependent_variable"],
        warnings: right ? warnings : ["比較句型缺少明確比較指標。"],
      };
    }
  }

  if (normalizedText.length <= 12) {
    return {
      originalText,
      normalizedText,
      sentenceType: "broad_topic",
      ...empty,
      confidence: 0.52,
      missingFields: ["subject_or_variable"],
      warnings: ["主題過短，後續需靠 source grounding 補足研究方向。"],
    };
  }

  return {
    originalText,
    normalizedText,
    sentenceType: "descriptive",
    subject: [normalizedText],
    independentVariables: [],
    dependentVariables: [],
    relation: [],
    conditions: [],
    scope: [],
    confidence: 0.48,
    missingFields: ["research_relation"],
    warnings: ["尚未穩定解析為研究題目句型。"],
  };
}

export function compareTitleSemantics(
  originalParse: ResearchTitleSentenceParse,
  candidateParse: ResearchTitleSentenceParse,
): TitleSemanticComparison {
  if (originalParse.confidence < 0.6 || candidateParse.confidence < 0.6) {
    return {
      isSemanticallyEquivalent: false,
      changedFields: [],
      reason: "parser confidence below 0.6; preserve original topic to avoid semantic drift",
    };
  }

  const changedFields: TitleSemanticComparison["changedFields"] = [];
  const fieldPairs: Array<
    [
      TitleSemanticComparison["changedFields"][number],
      string[],
      string[],
    ]
  > = [
    ["subject", originalParse.subject, candidateParse.subject],
    ["independentVariables", originalParse.independentVariables, candidateParse.independentVariables],
    ["dependentVariables", originalParse.dependentVariables, candidateParse.dependentVariables],
    ["relation", originalParse.relation, candidateParse.relation],
    ["conditions", originalParse.conditions, candidateParse.conditions],
    ["scope", originalParse.scope, candidateParse.scope],
  ];

  for (const [field, left, right] of fieldPairs) {
    if (!listsSemanticallyEquivalent(left, right)) {
      changedFields.push(field);
    }
  }

  return {
    isSemanticallyEquivalent: changedFields.length === 0,
    changedFields,
    reason:
      changedFields.length === 0
        ? "polished title preserves subject, variables, relation, conditions, and scope"
        : `semantic drift detected in: ${changedFields.join(", ")}`,
  };
}

export function evaluatePolishedTitle(
  originalTopic: string,
  polishedTitle: string,
): TitleSemanticComparison {
  return compareTitleSemantics(
    parseResearchTitleSentence(originalTopic),
    parseResearchTitleSentence(polishedTitle),
  );
}

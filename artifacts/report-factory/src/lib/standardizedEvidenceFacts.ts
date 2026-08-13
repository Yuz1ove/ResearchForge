import type { NormalizedFact } from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import {
  canonicalSourceKeyForSource,
  type SourceRecord,
} from "./sourceRecords.ts";

export type EvidenceDirection =
  | "increase"
  | "decrease"
  | "mixed"
  | "association"
  | "difference"
  | "not_reported";

export interface StandardizedNumericalResult {
  resultId: string;
  factId: string;
  sourceId: string;
  sourceIdentity: string;
  evidenceId: string;
  /** Scalar value when the source reports one; null for a range. */
  value: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  rawValue: string;
  displayValue: string;
  unit: string;
  metric: string;
  statisticType: string;
  resultRole: "outcome" | "exposure" | "baseline" | "statistic";
  direction: EvidenceDirection;
  comparisonBasis: string | null;
  uncertainty: string | null;
  comparabilityKey: string;
  isComparable: boolean;
  sourceField: "exactResult" | "numericResult";
  supportingText: string;
  locator: string;
}

export interface StandardizedEvidenceFact {
  schemaVersion: "standardized-evidence-fact/v1";
  factId: string;
  evidenceId: string;
  sourceId: string;
  sourceIdentity: string;
  sourceTitle: string;
  authors: string[];
  year: number | null;
  publicationVenue: string | null;
  retrievalProvider: string | null;
  locator: string;
  /** Explicit atomic-fact dimensions. Unknown values remain null. */
  population: string | null;
  ageGroup: string | null;
  sampleSize: number | null;
  geography: string | null;
  studyDesign: string | null;
  exposureConcept: string | null;
  exposureMeasure: string | null;
  outcomeConcept: string | null;
  outcomeMeasure: string | null;
  statisticType: string | null;
  value: number | null;
  lowerCI: number | null;
  upperCI: number | null;
  unit: string | null;
  mediator: string | null;
  adjustmentStatus: string | null;
  evidenceDirectness: "A" | "B" | "C" | "D";
  sourceSpan: string;
  certainty: string | null;
  /** Compatibility aliases used by the current formal-document renderer. */
  location: string | null;
  setting: string | null;
  populationOrObject: string | null;
  exposure: string | null;
  outcome: string | null;
  method: string | null;
  design: string | null;
  dataScope: string | null;
  exactResult: string;
  direction: EvidenceDirection;
  uncertainty: string | null;
  limitations: string[];
  applicability: string;
  directness: "A" | "B" | "C" | "D";
  numericalResults: StandardizedNumericalResult[];
}

function compact(value: string | null | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim() ?? "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function firstMatch(value: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const matched = compact(value.match(pattern)?.[0]);
    if (matched) return matched;
  }
  return null;
}

function stableKey(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function evidenceId(card: EvidenceCard): string {
  return compact(card.evidenceId ?? card.evidenceCardId ?? card.id);
}

function factText(card: EvidenceCard): string {
  return compact(
    card.exactResult ??
    card.supportedByText ??
    card.supportSpan ??
    card.sourceExcerptOriginal,
  );
}

function sentenceList(value: string): string[] {
  return value
    .split(/(?<=[。！？!?;；])\s*|(?<=[A-Za-z)])\.\s+(?=[A-Z])/u)
    .map(compact)
    .filter(Boolean);
}

function inferDirection(value: string): EvidenceDirection {
  if (/(?:相反|不一致|mixed|conflict)/iu.test(value)) return "mixed";
  if (/(?:降低|下降|較低|減少|降溫|負相關|inverse|lower|decreas|cool)/iu.test(value)) {
    return "decrease";
  }
  if (/(?:增加|上升|較高|提升|正相關|higher|increas|rise)/iu.test(value)) {
    return "increase";
  }
  if (/(?:差異|相差|difference|variation|range)/iu.test(value)) return "difference";
  if (/(?:相關|關聯|associated|correlat|predict)/iu.test(value)) return "association";
  return "not_reported";
}

function inferPValue(value: string): number | null {
  const matched = value.match(/\bp\s*(?:=|<|\u2264)\s*(0?(?:\.\d+)|1(?:\.0+)?)/iu);
  if (!matched?.[1]) return null;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function inferMetric(sentence: string): string {
  if (/(?:相對濕度|relative humidity|\bRH\b)/iu.test(sentence)) return "relative_humidity";
  if (/(?:R[²2]|決定係數|model fit|predict)/iu.test(sentence)) return "model_fit";
  if (/(?:熱舒適|thermal comfort|skin conductance|皮膚電導)/iu.test(sentence)) return "thermal_comfort";
  if (/(?:地表溫度|land surface temperature|\bLST\b)/iu.test(sentence)) return "land_surface_temperature";
  if (/(?:氣溫|環境溫度|ambient temperature|air temperature)/iu.test(sentence)) return "air_temperature";
  if (/(?:降溫|cooling|temperature)/iu.test(sentence)) return "temperature_difference";
  if (/(?:綠覆率|green coverage|GCR|GVI|NDVI|樹冠)/iu.test(sentence)) return "vegetation_metric";
  return "reported_measure";
}

function inferStatisticType(sentence: string, rawValue: string): string {
  if (/R[²2]/iu.test(sentence)) return "model_fit";
  if (/p\s*[<=>]/iu.test(rawValue)) return "p_value";
  if (/[%％]/u.test(rawValue) && /(?:accounting for|占(?:總效果|效果)|總效果的)/iu.test(sentence)) {
    return "effect_share";
  }
  if (/[%％]/u.test(rawValue) && /(?:poor sleep|sleep quality|detection rate|prevalence|睡眠不佳|睡眠品質|檢出率|盛行率)/iu.test(sentence)) {
    return "prevalence";
  }
  if (/[%％]/u.test(rawValue) && /(?:female|male|boys?|girls?|女性|男性|男生|女生)/iu.test(sentence)) {
    return "sample_composition";
  }
  if (/[%％]/u.test(rawValue) && /(?:TikTok|Snapchat|Instagram|YouTube|短影音|social media).*(?:use|used|使用|platform)/iu.test(sentence)) {
    return "exposure_prevalence";
  }
  if (/(?:每增加|per\s+\d|for every)/iu.test(sentence)) return "marginal_change";
  if (/(?:最大差|最高差|差異|相差|variation|difference|range)/iu.test(sentence)) return "group_difference";
  if (/(?:平均|mean|average)/iu.test(sentence)) return "mean";
  if (/(?:相關|correlation)/iu.test(sentence)) return "association";
  return "reported_value";
}

function inferComparisonBasis(sentence: string): string | null {
  return firstMatch(sentence, [
    /(?:每增加|每提升)\s*\d+(?:\.\d+)?\s*[%％][^，。；]{0,36}/u,
    /(?:between|compared with|versus|vs\.?|相較於|相對於)[^，。；]{0,48}/iu,
    /(?:樹木[—-]灌木[—-]草地|喬木[^，。；]{0,24}草地|植被遮蔭[^，。；]{0,24}水體蒸發)/u,
  ]);
}

function inferUncertainty(sentence: string): string | null {
  return firstMatch(sentence, [
    /(?:95%\s*CI|confidence interval|信賴區間)[^，。；]{0,50}/iu,
    /p\s*[<=>]\s*0?\.\d+/iu,
    /(?:顯著|significant|不顯著|not significant)/iu,
  ]);
}

interface NumericCandidate {
  rawValue: string;
  value: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  unit: string;
  displayValue?: string;
  metric?: string;
  statisticType?: string;
  resultRole?: StandardizedNumericalResult["resultRole"];
  comparisonBasis?: string | null;
  uncertainty?: string | null;
  /** Character offset in the result-bearing sentence, used for local labels. */
  startIndex?: number;
}

function numericCandidates(sentence: string): NumericCandidate[] {
  const candidates: NumericCandidate[] = [];
  const seen = new Set<string>();
  const occupied: Array<[number, number]> = [];
  // Effect estimates and their confidence intervals are one semantic datum.
  // Mark the entire expression occupied before generic percentage parsing so
  // `95% CI` can never leak out as a prevalence value.
  const oddsRatioPattern = /([^.;()]{0,96}?)(?:\(\s*)?((?:adjusted\s+)?OR\s*=?\s*(\d+(?:\.\d+)?)\s*[,，]?\s*(?:\(\s*)?95\s*%\s*CI\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)(?:\s*\))?)/giu;
  for (const match of sentence.matchAll(oddsRatioPattern)) {
    const value = Number(match[3]);
    const lowerBound = Number(match[4]);
    const upperBound = Number(match[5]);
    if (![value, lowerBound, upperBound].every(Number.isFinite)) continue;
    const expression = compact(match[2]);
    const expressionStart = (match.index ?? 0) + match[0].indexOf(match[2]);
    occupied.push([expressionStart, expressionStart + match[2].length]);
    seen.add(expression);
    const comparisonBasis = compact(match[1])
      .replace(/^(?:and|及|與|、|,)+\s*/iu, "")
      .replace(/^(?:regarding|for)\s+/iu, "") || null;
    candidates.push({
      rawValue: expression,
      value,
      lowerBound,
      upperBound,
      unit: "OR",
      displayValue: `OR ${value}（95% CI ${lowerBound}–${upperBound}）`,
      metric: /(?:poor sleep|sleep quality|睡眠不佳|睡眠品質)/iu.test(sentence)
        ? "poor_sleep_odds"
        : "reported_odds",
      statisticType: "odds_ratio",
      resultRole: "statistic",
      comparisonBasis,
      uncertainty: `95% CI ${lowerBound}–${upperBound}`,
      startIndex: expressionStart,
    });
  }

  const correlationPattern = /r\s*=\s*(-?0?\.\d+)\s*,\s*(-?0?\.\d+)\s*,\s*(-?0?\.\d+)/iu;
  const correlationMatch = sentence.match(correlationPattern);
  if (correlationMatch && correlationMatch.index != null) {
    occupied.push([correlationMatch.index, correlationMatch.index + correlationMatch[0].length]);
    const listedConcepts = /short[-‐‑–— ]form video addiction[^.]{0,80}sleep quality[^.]{0,80}social anxiety/iu.test(sentence)
      ? ["短影音成癮—睡眠品質", "短影音成癮—社交焦慮", "睡眠品質—社交焦慮"]
      : ["變項 1—變項 2", "變項 1—變項 3", "變項 2—變項 3"];
    correlationMatch.slice(1, 4).forEach((raw, index) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      seen.add(raw);
      candidates.push({
        rawValue: raw,
        value,
        lowerBound: null,
        upperBound: null,
        unit: "r",
        displayValue: `r = ${raw}`,
        metric: "correlation_structure",
        statisticType: "correlation_coefficient",
        resultRole: "statistic",
        comparisonBasis: listedConcepts[index] ?? null,
        uncertainty: firstMatch(sentence, [/P\s*[<=>]\s*0?\.\d+/iu]),
        startIndex: correlationMatch.index,
      });
    });
  }
  for (const match of sentence.matchAll(/\br\s*=\s*(-?0?\.\d+)/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied.some(([left, right]) => start >= left && end <= right)) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    const rawValue = compact(match[0]);
    occupied.push([start, end]);
    candidates.push({
      rawValue,
      value,
      lowerBound: null,
      upperBound: null,
      unit: "r",
      displayValue: `r = ${match[1]}`,
      metric: "correlation_structure",
      statisticType: "correlation_coefficient",
      resultRole: "statistic",
      comparisonBasis: firstMatch(sentence.slice(0, start), [
        /[^；;。]{1,48}(?:與|—|-)[^；;。]{1,48}$/u,
      ]),
      uncertainty: firstMatch(sentence, [/P\s*[<=>]\s*0?\.\d+/iu]),
      startIndex: start,
    });
  }

  const meanSdPattern = /(-?\d+(?:\.\d+)?)\s*[±+]\s*(\d+(?:\.\d+)?)\s*(points?|分)/giu;
  for (const match of sentence.matchAll(meanSdPattern)) {
    const value = Number(match[1]);
    const sd = Number(match[2]);
    if (!Number.isFinite(value) || !Number.isFinite(sd)) continue;
    const rawValue = compact(match[0]);
    occupied.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
    seen.add(rawValue);
    candidates.push({
      rawValue,
      value,
      lowerBound: null,
      upperBound: null,
      unit: "points",
      displayValue: `${value} ± ${sd} 分`,
      metric: /sleep quality|睡眠品質/iu.test(sentence) ? "sleep_quality_score" : "reported_score",
      statisticType: "mean_with_sd",
      resultRole: "outcome",
      uncertainty: `SD ${sd}`,
      startIndex: match.index ?? 0,
    });
  }

  const pathEffectPattern = /\b(direct|indirect)\s+effect[^.;]{0,72}?\bis\s+(-?\d+(?:\.\d+)?)/giu;
  for (const match of sentence.matchAll(pathEffectPattern)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    const rawValue = compact(match[2]);
    const valueStart = (match.index ?? 0) + match[0].lastIndexOf(match[2]);
    occupied.push([valueStart, valueStart + match[2].length]);
    const indirect = match[1].toLocaleLowerCase() === "indirect";
    candidates.push({
      rawValue,
      value,
      lowerBound: null,
      upperBound: null,
      unit: "coefficient",
      displayValue: `${indirect ? "間接" : "直接"}效果係數 ${rawValue}`,
      metric: "mediation_path",
      statisticType: indirect ? "indirect_effect" : "direct_effect",
      resultRole: "statistic",
      comparisonBasis: indirect
        ? "短影音成癮 → 社交焦慮 → 睡眠品質"
        : "短影音成癮 → 睡眠品質",
      uncertainty: null,
      startIndex: valueStart,
    });
  }
  const ranges = [
    /(?:between\s+)?(-?\d+(?:\.\d+)?)\s*(?:and|to|–|—|-)\s*(-?\d+(?:\.\d+)?)\s*(degrees?\s+celsius|°\s*C|°C|℃)/giu,
  ];
  for (const pattern of ranges) {
    for (const match of sentence.matchAll(pattern)) {
      const lowerBound = Number(match[1]);
      const upperBound = Number(match[2]);
      if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) continue;
      const rawValue = compact(match[0]);
      occupied.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
      seen.add(rawValue);
      candidates.push({
        rawValue,
        value: null,
        lowerBound,
        upperBound,
        unit: "°C",
        startIndex: match.index ?? 0,
      });
    }
  }
  const patterns = [
    /R[²2]\s*(?:[<=>]|exceed(?:s|ed|ing)?|above|over)?\s*(0?\.\d+)/giu,
    /(-?\d+(?:\.\d+)?)\s*(°\s*C|°C|℃|degrees?\s+celsius|%|％)/giu,
    /p\s*[<=>]\s*(0?\.\d+)/giu,
  ];
  for (const pattern of patterns) {
    for (const match of sentence.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (occupied.some(([left, right]) => start >= left && end <= right)) continue;
      const full = compact(match[0]);
      const numeric = Number((match[1] ?? "").replace("，", "."));
      if (!Number.isFinite(numeric) || seen.has(full)) continue;
      const unit = /^R[²2]/iu.test(full)
        ? "R²"
        : /^p\s*/iu.test(full)
          ? "p"
          : /[%％]/u.test(full)
            ? "%"
            : "°C";
      seen.add(full);
      candidates.push({
        rawValue: full,
        value: numeric,
        lowerBound: null,
        upperBound: null,
        unit,
        startIndex: start,
      });
    }
  }
  return candidates;
}

function resultRole(
  sentence: string,
  candidate: NumericCandidate,
): StandardizedNumericalResult["resultRole"] {
  if (candidate.unit === "R²" || candidate.unit === "p") return "statistic";
  if (["OR", "r", "coefficient"].includes(candidate.unit)) return "statistic";
  if (candidate.unit === "%" && /(?:accounting for|accounts? for|占(?:總效果|效果)|總效果的)/iu.test(sentence)) {
    return "statistic";
  }
  if (candidate.unit === "%" && /(?:綠覆|GCR|GVI|NDVI|green coverage|canopy)/iu.test(sentence)) {
    return "exposure";
  }
  if (candidate.unit === "%" && /(?:TikTok|Snapchat|Instagram|YouTube|短影音|short[-‐‑–— ]form video|social media).*(?:use|used|使用|platform)/iu.test(sentence)) {
    return "exposure";
  }
  if (candidate.unit === "%" && /(?:female|male|boys?|girls?|女性|男性|男生|女生)/iu.test(sentence)) {
    return "baseline";
  }
  if (/(?:current|baseline|現況|基準)/iu.test(sentence) &&
      !/(?:cooling|reduced|difference|降溫|降低|差異)/iu.test(sentence)) {
    return "baseline";
  }
  return "outcome";
}

function localPlatformLabel(sentence: string, candidate: NumericCandidate): string | null {
  const prefix = sentence.slice(0, Math.max(0, candidate.startIndex ?? sentence.length));
  const matches = [...prefix.matchAll(/\b(TikTok|Tiktok|Snapchat|Instagram|YouTube)\b/giu)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  return /^tiktok$/iu.test(raw) ? "TikTok" : raw;
}

function resultBearingSentence(sentence: string): boolean {
  return /(?:結果|發現|顯示|指出|revealed|results?|found|reached|exceed|difference|variation|correlat|associated|predict|cool(?:ed|ing)|reduced|lower|higher|average|mean|current|baseline|was|were|is|are|最大|平均|現況|基準|差異|相關|降低|降溫|達到|超過|為|\b(?:OR|RR|HR|r|R[²2]|p)\s*[=:<>]|%|％)/iu.test(sentence);
}

function atomicResultComparisonBasis(
  sentence: string,
  candidate: NumericCandidate,
  statisticType: string,
  role: StandardizedNumericalResult["resultRole"],
): string | null {
  if (candidate.comparisonBasis) return candidate.comparisonBasis;
  if (statisticType === "effect_share") {
    const before = sentence.slice(0, Math.max(0, candidate.startIndex ?? sentence.length));
    if (/indirect\s+effect|間接效果/iu.test(before)) return "間接效果占總效果比例";
    if (/direct\s+effect|直接效果/iu.test(before)) return "直接效果占總效果比例";
    return "中介效果占比";
  }
  if (statisticType === "prevalence" && /poor sleep|sleep quality|睡眠不佳|睡眠品質/iu.test(sentence)) {
    return "睡眠不佳比例";
  }
  if (role === "exposure") {
    const platform = localPlatformLabel(sentence, candidate) ?? firstMatch(sentence, [
      /TikTok/iu,
      /Snapchat/iu,
      /Instagram/iu,
      /YouTube/iu,
      /短影音/iu,
      /social media/iu,
    ]);
    return platform ? `${platform} 使用比例` : "暴露比例";
  }
  if (role === "baseline" && /female|male|boys?|girls?|女性|男性|男生|女生/iu.test(sentence)) {
    return "樣本性別組成";
  }
  if (statisticType === "p_value" && /correlat|相關/iu.test(sentence)) {
    return "相關結構的顯著性";
  }
  return inferComparisonBasis(sentence);
}

function atomicResultMetric(
  sentence: string,
  candidate: NumericCandidate,
  statisticType: string,
  role: StandardizedNumericalResult["resultRole"],
): string {
  if (candidate.metric) return candidate.metric;
  if (statisticType === "effect_share") return "mediation_effect_share";
  if (role === "baseline" && /female|male|boys?|girls?|女性|男性|男生|女生/iu.test(sentence)) {
    return "sample_sex_composition";
  }
  if (role === "exposure" && /TikTok|Snapchat|Instagram|YouTube|短影音|social media/iu.test(sentence)) {
    return "media_use_prevalence";
  }
  if (statisticType === "prevalence" && /poor sleep|sleep quality|睡眠不佳|睡眠品質/iu.test(sentence)) {
    return /detection rate|檢出率/iu.test(sentence)
      ? "sleep_quality_detection_rate"
      : "poor_sleep_prevalence";
  }
  return inferMetric(sentence);
}

/**
 * Canonical numerical parser shared by report planning and rendering. It keeps
 * one semantic result per OR/CI, prevalence, correlation pair, or path effect;
 * generic percentages inside confidence-interval labels are never emitted as
 * standalone facts.
 */
export function parseAtomicNumericalResults(
  card: EvidenceCard,
): NormalizedFact["numericalResults"] {
  const exactResult = factText(card);
  if (!exactResult) return [];
  return sentenceList(exactResult)
    .filter(resultBearingSentence)
    .flatMap((sentence) => {
      const fallbackMetric = inferMetric(sentence);
      const fallbackUncertainty = inferUncertainty(sentence);
      return numericCandidates(sentence).map((candidate) => {
        const statisticType = candidate.statisticType ?? inferStatisticType(sentence, candidate.rawValue);
        const role = candidate.resultRole ?? resultRole(sentence, candidate);
        return {
          rawText: candidate.rawValue,
          measure: atomicResultMetric(sentence, candidate, statisticType, role) || fallbackMetric,
          resultRole: role,
          value: candidate.value,
          unit: candidate.unit || null,
          statisticType,
          comparisonBasis: atomicResultComparisonBasis(sentence, candidate, statisticType, role),
          lowerCI: candidate.lowerBound,
          upperCI: candidate.upperBound,
          pValue: statisticType === "p_value"
            ? candidate.value
            : inferPValue(sentence),
          uncertainty: candidate.uncertainty ?? fallbackUncertainty,
        };
      });
    });
}

function buildNumericalResults(input: {
  factId: string;
  card: EvidenceCard;
  source: SourceRecord;
  sourceIdentity: string;
  exactResult: string;
  locator: string;
}): StandardizedNumericalResult[] {
  const results = sentenceList(input.exactResult).filter(resultBearingSentence).flatMap((sentence) => {
    const metric = inferMetric(sentence);
    const direction = inferDirection(sentence);
    const comparisonBasis = inferComparisonBasis(sentence);
    const uncertainty = inferUncertainty(sentence);
    return numericCandidates(sentence).map((candidate, index) => {
      const statisticType = candidate.statisticType ?? inferStatisticType(sentence, candidate.rawValue);
      const role = candidate.resultRole ?? resultRole(sentence, candidate);
      const candidateMetric = atomicResultMetric(sentence, candidate, statisticType, role) || metric;
      const candidateComparisonBasis = atomicResultComparisonBasis(
        sentence,
        candidate,
        statisticType,
        role,
      ) ?? comparisonBasis;
      const candidateUncertainty = candidate.uncertainty ?? uncertainty;
      const comparabilityKey = [candidateMetric, candidate.unit, statisticType, candidateComparisonBasis ?? "none"]
        .join("|")
        .toLocaleLowerCase();
      return {
        resultId: `result-${stableKey(`${input.factId}|${sentence}|${candidate.rawValue}|${index}`)}`,
        factId: input.factId,
        sourceId: input.source.id,
        sourceIdentity: input.sourceIdentity,
        evidenceId: evidenceId(input.card),
        value: candidate.value,
        lowerBound: candidate.lowerBound,
        upperBound: candidate.upperBound,
        rawValue: candidate.rawValue,
        displayValue: candidate.displayValue ?? (
          candidate.lowerBound != null && candidate.upperBound != null
            ? `${candidate.lowerBound}–${candidate.upperBound} ${candidate.unit}`
            : candidate.rawValue
        ),
        unit: candidate.unit,
        metric: candidateMetric,
        statisticType,
        resultRole: role,
        direction,
        comparisonBasis: candidateComparisonBasis,
        uncertainty: candidateUncertainty,
        comparabilityKey,
        isComparable: false,
        sourceField: "exactResult" as const,
        supportingText: sentence,
        locator: input.locator,
      };
    });
  });
  const counts = results.reduce<Map<string, number>>((map, result) => {
    map.set(result.comparabilityKey, (map.get(result.comparabilityKey) ?? 0) + 1);
    return map;
  }, new Map());
  return results.map((result) => ({
    ...result,
    isComparable: (counts.get(result.comparabilityKey) ?? 0) > 1,
  }));
}

function inferPopulationOrObject(text: string): string | null {
  return firstMatch(text, [
    /(?:senior high school students?|high school students?|secondary school students?|college students?|university students?|adolescents?|children and adolescents?|高中生|中學生|大學生|青少年|兒少)/iu,
    /(?:學生|受試者|participants?|pedestrians?|行人)/iu,
    /(?:校園綠地|校園開放空間|street segments?|街道|測點|sites?)/iu,
  ]);
}

function inferLocation(text: string): string | null {
  const value = firstMatch(text, [
    /(?:Aseer Region(?:, Saudi Arabia)?|Saudi Arabia|China|Chinese|中國|沙烏地阿拉伯|臺北|台北|Taipei|高雄|Kaohsiung|嘉義|Chiayi|廣州|Guangzhou|鄭州|Zhengzhou|吉達|Jeddah|武漢|Wuhan|臺灣|台灣|Taiwan)/iu,
  ]);
  return value?.toLocaleLowerCase() === "chinese" ? "China" : value;
}

function inferSetting(text: string): string | null {
  return firstMatch(text, [
    /(?:three high schools?|public secondary schools?|senior high schools?|high schools?|secondary schools?|高中|中學)/iu,
    /(?:college students?|university students?|大學生)/iu,
    /(?:大學)?校園|校園綠地|校園開放空間|university campus|school campus|campus/iu,
    /(?:都市街道|城市街道|urban street|street canyon|都市地區)/iu,
  ]);
}

function inferExposure(text: string): string | null {
  return firstMatch(text, [
    /(?:short[-‐‑–— ]form video(?:\s*\(SFV\))? addiction|SFV addiction|短影音成癮)/iu,
    /(?:hours spent on (?:social media|short[-‐‑–— ]form video)|短影音使用時數|社群媒體使用時數)/iu,
    /(?:TikTok use|TikTok 使用)/iu,
    /(?:short[-‐‑–— ]form video use|短影音使用)/iu,
    /(?:social media use|use of social media|一般社群媒體使用)/iu,
    /(?:綠覆率|綠視率|GCR|GVI|NDVI|樹冠覆蓋|樹冠|植被遮蔭|水體蒸發|green coverage|green view|tree canopy|vegetation)/iu,
  ]);
}

function inferOutcome(text: string): string | null {
  return firstMatch(text, [
    /(?:poor sleep(?:ers?)?|sleep quality score|sleep quality|睡眠不佳|睡眠品質分數|睡眠品質)/iu,
    /(?:depressive symptoms?|depression|憂鬱症狀|憂鬱)/iu,
    /(?:social anxiety|社交焦慮)/iu,
    /(?:happiness|幸福感|parent-child relationship|親子關係|self-control|自我控制|perseverance|毅力)/iu,
    /(?:地表溫度|land surface temperature|LST)/iu,
    /(?:環境溫度|氣溫|ambient temperature|air temperature)/iu,
    /(?:熱舒適|thermal comfort|熱暴露|heat exposure)/iu,
    /(?:相對濕度|relative humidity|RH)/iu,
  ]);
}

function inferMethod(text: string): string | null {
  return firstMatch(text, [
    /(?:ENVI-?met|Landsat|Street View|街景影像|biosensors?|生理感測器|遙測|remote sensing|GIS|迴歸|regression|實地量測|field measurements?)/iu,
  ]);
}

function inferDesign(text: string): string | null {
  return firstMatch(text, [
    /(?:cross-sectional|longitudinal|case study|field study|observational|simulation|情境模擬|數值模擬|橫斷面|觀察研究|案例研究)/iu,
  ]);
}

function inferAgeGroup(text: string): string | null {
  if (/(?:senior high school students?|high school students?|recruited from (?:three |\d+ )?high schools?|高中生)/iu.test(text)) return "高中生";
  if (/(?:secondary school students?|中學生)/iu.test(text)) return "中學生";
  if (/(?:college students?|university students?|大學生)/iu.test(text)) return "大學生";
  if (/(?:children and adolescents?|children|兒少|兒童)/iu.test(text)) return "一般兒少";
  if (/(?:adolescents?|青少年)/iu.test(text)) return "青少年";
  return null;
}

function inferSampleSize(text: string): number | null {
  const match = text.match(
    /(?:participants?\s+(?:included|comprised)|survey(?:ed|ing)?|conducted on|recruited(?: from)?|sample of|共納入|招募|調查)\s*(\d{2,6})\s*(?:participants?|students?|adolescents?|children|名)?/iu,
  ) ?? text.match(/\b(\d{2,6})\s+(?:senior high school students?|high school students?|secondary school students?|college students?|university students?|adolescents?|participants?)\b/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function inferExposureConcept(text: string): string | null {
  if (/(?:short[-‐‑–— ]form video(?:\s*\(SFV\))? addiction|SFV addiction|短影音成癮)/iu.test(text)) return "短影音成癮";
  if (/(?:hours spent on short[-‐‑–— ]form video|短影音使用時數)/iu.test(text)) return "短影音使用時數";
  if (/(?:TikTok use|TikTok 使用)/iu.test(text)) return "TikTok 使用";
  if (/(?:short[-‐‑–— ]form video use|短影音使用)/iu.test(text)) return "短影音使用";
  if (/(?:hours spent on social media|social media use|use of social media|一般社群媒體使用)/iu.test(text)) return "一般社群媒體使用";
  return inferExposure(text);
}

function inferExposureMeasure(text: string): string | null {
  return firstMatch(text, [
    /(?:College Student )?Short[-‐‑–— ]Form Video Addiction Scale/iu,
    /hours spent on (?:social media|short[-‐‑–— ]form video)/iu,
    /TikTok use/iu,
    /(?:使用時數|成癮量表|使用比例)/u,
  ]);
}

function inferOutcomeConcept(text: string): string | null {
  if (/(?:poor sleep(?:ers?)?|sleep quality detection rate|detection rate of sleep quality|睡眠不佳比例|睡眠品質異常檢出率)/iu.test(text)) {
    return "睡眠不佳比例";
  }
  if (/(?:sleep quality score|sleep quality|睡眠品質分數|睡眠品質)/iu.test(text)) return "睡眠品質分數";
  if (/(?:depressive symptoms?|depression|憂鬱)/iu.test(text)) return "憂鬱";
  if (/(?:happiness|幸福感)/iu.test(text)) return "幸福感";
  if (/(?:parent-child relationship|親子關係)/iu.test(text)) return "親子關係";
  if (/(?:social anxiety|社交焦慮)/iu.test(text)) return "社交焦慮";
  if (/(?:self-control|自我控制)/iu.test(text)) return "自我控制";
  return inferOutcome(text);
}

function inferOutcomeMeasure(text: string): string | null {
  return firstMatch(text, [
    /Pittsburgh Sleep Quality Index|\bPSQI\b/iu,
    /(?:sleep quality score|detection rate of sleep quality|poor sleepers?)/iu,
    /depression, anxiety and stress scale|\bDASS-?21\b/iu,
    /Interaction Anxiousness Scale|Brief Self-Control Scale/iu,
  ]);
}

function inferMediator(text: string): string | null {
  if (!/mediat/iu.test(text)) return null;
  const candidates = unique([
    /(?:社交焦慮|social anxiety)/iu.test(text) ? "社交焦慮" : null,
    /(?:self-control|自我控制)/iu.test(text) ? "自我控制" : null,
    /(?:need gratification|需求滿足)/iu.test(text) ? "需求滿足" : null,
    /(?:short[-‐‑–— ]form video addiction|短影音成癮)/iu.test(text) && /(?:chain mediat|鏈式中介)/iu.test(text)
      ? "短影音成癮"
      : null,
  ]);
  return candidates.length > 0 ? candidates.join("；") : null;
}

function inferAdjustmentStatus(text: string): string | null {
  if (/(?:adjusted OR|adjusted odds ratio|控制[^，。；]{0,24}變項|校正後)/iu.test(text)) return "已明示調整";
  if (/(?:unadjusted OR|crude OR|未調整)/iu.test(text)) return "未調整";
  return null;
}

export function buildStandardizedEvidenceFacts(
  cards: EvidenceCard[],
  sources: SourceRecord[],
): StandardizedEvidenceFact[] {
  const sourceById = new Map(sources.map((source) => [source.id, source] as const));
  const facts = cards.flatMap((card): StandardizedEvidenceFact[] => {
    const source = sourceById.get(card.sourceId);
    const exactResult = factText(card);
    if (!source || !exactResult) return [];
    const sourceIdentity = canonicalSourceKeyForSource(source);
    const id = evidenceId(card);
    const factId = `fact-${stableKey(`${sourceIdentity}|${id}|${exactResult}`)}`;
    // Atomic dimensions may only come from the source title/span or explicit
    // structured fields. A writer-facing paraphrase can combine sources and is
    // therefore deliberately excluded from extraction.
    const searchText = compact([
      source.title,
      source.abstract,
      exactResult,
    ].filter(Boolean).join(" "));
    const locator = compact(card.locator ?? card.pageOrLocation ?? card.sourceLocation) ||
      "可核對內容摘錄";
    const location = compact(card.location) || inferLocation(searchText);
    const setting = compact(card.researchSetting) || inferSetting(searchText);
    const exposure = compact(card.exposure) || inferExposure(searchText);
    const outcome = compact(card.outcome) || inferOutcome(searchText);
    const method = inferMethod(searchText);
    const design = compact(card.studyDesign) || inferDesign(searchText);
    const directness = card.evidenceDirectnessTier ?? source.researchDirectnessTier ?? "C";
    const limitations = unique([
      ...(card.limitationsZhTw ?? []),
      ...(card.limitations ?? []),
      card.limitation,
    ]);
    return [{
      schemaVersion: "standardized-evidence-fact/v1",
      factId,
      evidenceId: id,
      sourceId: source.id,
      sourceIdentity,
      sourceTitle: source.title,
      authors: [...source.authors],
      year: source.year ?? null,
      publicationVenue: compact(source.containerTitle) || null,
      retrievalProvider: compact(source.provider ?? source.sourceType) || null,
      locator,
      population: inferPopulationOrObject(searchText),
      ageGroup: inferAgeGroup(searchText),
      sampleSize: inferSampleSize(searchText),
      geography: location,
      studyDesign: design,
      exposureConcept: inferExposureConcept(searchText),
      exposureMeasure: inferExposureMeasure(searchText),
      outcomeConcept: inferOutcomeConcept(searchText),
      outcomeMeasure: inferOutcomeMeasure(searchText),
      statisticType: null,
      value: null,
      lowerCI: null,
      upperCI: null,
      unit: null,
      mediator: inferMediator(searchText),
      adjustmentStatus: inferAdjustmentStatus(searchText),
      evidenceDirectness: directness,
      sourceSpan: exactResult,
      certainty: inferUncertainty(exactResult),
      location,
      setting,
      populationOrObject: inferPopulationOrObject(searchText),
      exposure,
      outcome,
      method,
      design,
      dataScope: compact(card.dataScope) || null,
      exactResult,
      direction: inferDirection(exactResult),
      uncertainty: inferUncertainty(exactResult),
      limitations,
      applicability: compact(card.applicability) ||
        "僅適用於來源直接涵蓋的研究地點、場域、對象、指標與方法。",
      directness,
      numericalResults: buildNumericalResults({
        factId,
        card,
        source,
        sourceIdentity,
        exactResult,
        locator,
      }),
    }];
  });

  const comparabilitySourceCounts = facts
    .flatMap((fact) => fact.numericalResults)
    .reduce<Map<string, Set<string>>>((map, result) => {
      const sourceIds = map.get(result.comparabilityKey) ?? new Set<string>();
      sourceIds.add(result.sourceId);
      map.set(result.comparabilityKey, sourceIds);
      return map;
    }, new Map());
  return facts
    .map((fact) => {
      const numericalResults = fact.numericalResults.map((result) => ({
        ...result,
        isComparable: (comparabilitySourceCounts.get(result.comparabilityKey)?.size ?? 0) >= 2,
      }));
      return {
        ...fact,
        statisticType: unique(numericalResults.map((result) => result.statisticType)).join("+") || null,
        value: numericalResults.length === 1 ? numericalResults[0]?.value ?? null : null,
        lowerCI: numericalResults.length === 1 ? numericalResults[0]?.lowerBound ?? null : null,
        upperCI: numericalResults.length === 1 ? numericalResults[0]?.upperBound ?? null : null,
        unit: numericalResults.length === 1 ? numericalResults[0]?.unit ?? null : null,
        numericalResults,
      };
    })
    .sort((left, right) =>
      left.sourceIdentity.localeCompare(right.sourceIdentity) ||
      left.factId.localeCompare(right.factId),
    );
}

function normalizedDirection(fact: NormalizedFact): EvidenceDirection {
  switch (fact.associationDirection ?? fact.direction) {
    case "positive":
      return "increase";
    case "negative":
      return "decrease";
    case "mixed":
      return "mixed";
    case "null":
      return "association";
    default:
      return "not_reported";
  }
}

/**
 * Project the planner's immutable, atomic facts into the renderer contract.
 *
 * This deliberately does not re-infer scientific dimensions from source prose
 * or evidence cards. Source records contribute bibliography metadata only; all
 * claim, population, method, result, applicability and locator fields come
 * from the canonical ReportPlan fact.
 */
export function buildStandardizedEvidenceFactsFromNormalizedPlan(
  normalizedFacts: NormalizedFact[],
  sources: SourceRecord[],
): StandardizedEvidenceFact[] {
  const sourceById = new Map(sources.map((source) => [source.id, source] as const));
  const facts = normalizedFacts
    .filter((fact) => fact.writerEligible)
    .flatMap((fact): StandardizedEvidenceFact[] => {
      // sourceId was added after canonicalSourceId. Keep the latter as a
      // read-only compatibility key for archived, already-built plans.
      const plannedSourceId = compact(fact.sourceId || fact.canonicalSourceId);
      const source = sourceById.get(plannedSourceId);
      if (!source) return [];
      const sourceIdentity = canonicalSourceKeyForSource(source);
      const exactResult = compact(fact.sourceSpan) || compact(fact.claimTextZhTw);
      if (!exactResult) return [];
      const direction = normalizedDirection(fact);
      const directness = fact.evidenceDirectness ?? fact.directness ?? "C";
      const numericalResults: StandardizedNumericalResult[] = fact.numericalResults.map(
        (result, index) => {
          const rawValue = compact(result.rawText);
          const supportingText = exactResult.includes(rawValue)
            ? exactResult
            : compact(`${exactResult} ${rawValue}`);
          const statisticType = compact(result.statisticType ?? fact.statisticType) || "reported_value";
          const metric = compact(
            result.measure ?? fact.outcomeMeasure ?? fact.exposureMeasure ?? fact.outcomeConcept ?? fact.exposureConcept,
          ) || "reported_measure";
          return {
            resultId: `result-${fact.factId}-${index + 1}`,
            factId: fact.factId,
            sourceId: source.id,
            sourceIdentity,
            evidenceId: fact.evidenceId,
            value: result.value,
            lowerBound: result.lowerCI ?? null,
            upperBound: result.upperCI ?? null,
            rawValue,
            displayValue: rawValue,
            unit: compact(result.unit ?? fact.unit),
            metric,
            statisticType,
            resultRole: statisticType === "reported_value" ? "outcome" : "statistic",
            direction,
            comparisonBasis: result.comparisonBasis ?? null,
            uncertainty: compact(result.uncertainty ?? fact.uncertainty) || null,
            comparabilityKey: compact(fact.comparabilityKey) || `fact:${fact.factId}`,
            isComparable: false,
            sourceField: "exactResult",
            supportingText,
            locator: compact(fact.locator) || "可核對內容摘錄",
          };
        },
      );
      const singleResult = numericalResults.length === 1 ? numericalResults[0] : null;
      const compatibilityFact = fact as NormalizedFact & { dataScope?: string | null };
      return [{
        schemaVersion: "standardized-evidence-fact/v1",
        factId: fact.factId,
        evidenceId: fact.evidenceId,
        sourceId: source.id,
        sourceIdentity,
        sourceTitle: source.title,
        authors: [...source.authors],
        year: source.year ?? null,
        publicationVenue: compact(source.containerTitle) || null,
        retrievalProvider: compact(source.provider ?? source.sourceType) || null,
        locator: compact(fact.locator) || "可核對內容摘錄",
        population: fact.population ?? null,
        ageGroup: fact.ageGroup ?? null,
        sampleSize: fact.sampleSize ?? null,
        geography: fact.geography ?? fact.location ?? null,
        studyDesign: fact.studyDesign ?? fact.method ?? null,
        exposureConcept: fact.exposureConcept ?? fact.exposure ?? null,
        exposureMeasure: fact.exposureMeasure ?? null,
        outcomeConcept: fact.outcomeConcept ?? fact.outcome ?? null,
        outcomeMeasure: fact.outcomeMeasure ?? null,
        statisticType: fact.statisticType ?? singleResult?.statisticType ?? null,
        value: fact.value ?? singleResult?.value ?? null,
        lowerCI: fact.lowerCI ?? singleResult?.lowerBound ?? null,
        upperCI: fact.upperCI ?? singleResult?.upperBound ?? null,
        unit: fact.unit ?? singleResult?.unit ?? null,
        mediator: fact.mediator ?? null,
        adjustmentStatus: fact.adjustmentStatus ?? null,
        evidenceDirectness: directness,
        sourceSpan: exactResult,
        certainty: fact.certainty ?? null,
        location: fact.location ?? fact.geography ?? null,
        setting: fact.setting ?? null,
        populationOrObject: fact.population ?? null,
        exposure: fact.exposure ?? fact.exposureConcept ?? null,
        outcome: fact.outcome ?? fact.outcomeConcept ?? null,
        method: fact.method ?? fact.studyDesign ?? null,
        design: fact.studyDesign ?? fact.method ?? null,
        dataScope: compatibilityFact.dataScope ?? null,
        exactResult,
        direction,
        uncertainty: fact.uncertainty ?? null,
        limitations: [...fact.limitations],
        applicability: compact(fact.applicability) || "僅適用於規劃階段明確記錄的對象、場域、指標與方法。",
        directness,
        numericalResults,
      }];
    });

  const comparabilitySourceCounts = facts
    .flatMap((fact) => fact.numericalResults)
    .reduce<Map<string, Set<string>>>((map, result) => {
      const sourceIds = map.get(result.comparabilityKey) ?? new Set<string>();
      sourceIds.add(result.sourceId);
      map.set(result.comparabilityKey, sourceIds);
      return map;
    }, new Map());
  return facts
    .map((fact) => ({
      ...fact,
      numericalResults: fact.numericalResults.map((result) => ({
        ...result,
        isComparable: (comparabilitySourceCounts.get(result.comparabilityKey)?.size ?? 0) >= 2,
      })),
    }))
    .sort((left, right) =>
      left.sourceIdentity.localeCompare(right.sourceIdentity) ||
      left.factId.localeCompare(right.factId),
    );
}

export function auditStandardizedEvidenceFacts(
  facts: StandardizedEvidenceFact[],
): string[] {
  const issues: string[] = [];
  for (const fact of facts) {
    if (!fact.sourceIdentity) issues.push(`fact_missing_source_identity:${fact.factId}`);
    if (!fact.exactResult) issues.push(`fact_missing_exact_result:${fact.factId}`);
    for (const result of fact.numericalResults) {
      if (!result.supportingText.includes(result.rawValue)) {
        issues.push(`numeric_result_not_in_supporting_text:${result.resultId}`);
      }
      if (!result.sourceId || !result.evidenceId || !result.locator) {
        issues.push(`numeric_result_missing_provenance:${result.resultId}`);
      }
    }
  }
  return unique(issues).sort();
}

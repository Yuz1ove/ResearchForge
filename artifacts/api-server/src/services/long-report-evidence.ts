/**
 * Deterministic evidence-density and long-report acceptance contracts.
 *
 * This module deliberately consumes the Writer's existing source, evidence,
 * atomic-claim, synthesis-claim, plan and sentence identifiers. It does not
 * create a parallel provenance namespace and it never upgrades unsupported
 * prose into evidence-bearing content.
 */

export const CANONICAL_STAGE_NAMES = [
  "raw",
  "validation",
  "repair",
  "post-deletion",
  "paragraph-render",
  "trace-reconstruction",
  "canonical",
] as const;

export type CanonicalStageName = (typeof CANONICAL_STAGE_NAMES)[number];

export const CANONICAL_LOSS_REASONS = [
  "unsupported_claim",
  "citation_failure",
  "claim_reference_mismatch",
  "duplicate_exact",
  "duplicate_semantic",
  "low_information",
  "transition_removed",
  "paragraph_merge_loss",
  "trace_mapping_loss",
  "claim_namespace_loss",
  "not_in_plan",
  "synthesis_not_realized",
  "conclusion_only_claim",
  "renderer_rewrite",
  "structural_text_removed",
  "other",
] as const;

export type CanonicalLossReason = (typeof CANONICAL_LOSS_REASONS)[number];

export const CONTENT_TAXONOMY = [
  "factual",
  "synthesis",
  "interpretive",
  "methodological",
  "structural",
  "transition",
  "limitation",
  "implication",
  "central_answer",
] as const;

export type ContentTaxonomy = (typeof CONTENT_TAXONOMY)[number];

export interface AuditSentence {
  sentenceId: string;
  text: string;
  sectionId?: string;
  paragraphId?: string;
  originalClaimIds?: string[];
  finalClaimIds?: string[];
  evidenceIds?: string[];
  sourceIds?: string[];
  citationIds?: string[];
  factual?: boolean;
  taxonomy?: ContentTaxonomy;
  validation?: "pass" | "blocked";
  deleted?: boolean;
  action?: string;
  actionReason?: string;
  reasonCode?: CanonicalLossReason;
}

export interface CanonicalStageSnapshot {
  stage: CanonicalStageName;
  sentences: AuditSentence[];
}

export interface CanonicalLossRecord {
  stageFrom: CanonicalStageName;
  stageTo: CanonicalStageName;
  sentenceId: string;
  originalText: string;
  resultingText: string;
  originalCjk: number;
  resultingCjk: number;
  cjkDelta: number;
  originalClaimIds: string[];
  finalClaimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  reasonCode: CanonicalLossReason;
  deterministic: true;
}

export interface CanonicalStageLossAttribution {
  schemaVersion: "researchforge-canonical-stage-loss-attribution/v1";
  raw_cjk: number;
  validated_cjk: number;
  repair_cjk: number;
  canonical_cjk: number;
  net_lost_cjk: number;
  reconciled: boolean;
  lost_cjk_by_reason: Partial<Record<CanonicalLossReason, number>>;
  gained_cjk_by_reason: Partial<Record<CanonicalLossReason, number>>;
  net_cjk_by_reason: Partial<Record<CanonicalLossReason, number>>;
  lost_sentences_by_reason: Partial<Record<CanonicalLossReason, number>>;
  factual_cjk_lost: number;
  interpretive_cjk_lost: number;
  structural_cjk_lost: number;
  duplicate_cjk_lost: number;
  unsupported_cjk_lost: number;
  records: CanonicalLossRecord[];
}

export function countCjk(value: string): number {
  return (value.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu) ?? []).length;
}

function clean(value: string | null | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim() ?? "";
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function fingerprint(value: string): string {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/\[(?:s|ref)\d+\]/giu, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function ngrams(value: string, size = 2): Set<string> {
  const normalized = fingerprint(value);
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    result.add(normalized.slice(index, index + size));
  }
  return result;
}

function similarity(left: string, right: string): number {
  if (fingerprint(left) === fingerprint(right)) return 1;
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

const LIMITATION_PATTERN =
  /(?:限制|不足|未揭露|無法|不能|不宜|不確定|證據有限|limitation|uncertain|insufficient)/iu;
const METHODOLOGY_PATTERN =
  /(?:本報告|本次|搜尋|篩選|納入|排除|方法|研究設計|樣本|受試|參與者|method|sample|design|screening)/iu;
const TRANSITION_PATTERN =
  /^(?:然而|此外|同時|相較之下|換言之|綜合而言|因此|另一方面|首先|其次|最後|however\b|moreover\b|therefore\b)/iu;
const IMPLICATION_PATTERN = /(?:意味|啟示|可供|實務|政策|後續研究|implication)/iu;
const CENTRAL_ANSWER_PATTERN = /(?:核心回答|中心答案|總體答案|最穩妥結論|central answer)/iu;
const FACTUAL_PATTERN =
  /(?:研究|資料|樣本|結果|發現|顯示|指出|報告|比例|相關|關聯|效果|風險|增加|降低|\d|study|result|reported|association)/iu;

export function classifyContentTaxonomy(input: AuditSentence): ContentTaxonomy {
  if (input.taxonomy) return input.taxonomy;
  const text = clean(input.text);
  const claimIds = unique([...(input.finalClaimIds ?? []), ...(input.originalClaimIds ?? [])]);
  if (claimIds.some((id) => id.startsWith("synthesis-"))) return "synthesis";
  if (CENTRAL_ANSWER_PATTERN.test(text)) return "central_answer";
  if (LIMITATION_PATTERN.test(text)) return "limitation";
  if (METHODOLOGY_PATTERN.test(text)) return "methodological";
  if (IMPLICATION_PATTERN.test(text)) return "implication";
  if (TRANSITION_PATTERN.test(text) && claimIds.length === 0) return "transition";
  if (input.factual === true || claimIds.length > 0 || FACTUAL_PATTERN.test(text)) return "factual";
  if (input.factual === false && text.length < 28) return "structural";
  return "interpretive";
}

function explicitReason(sentence: AuditSentence): CanonicalLossReason | null {
  if (sentence.reasonCode) return sentence.reasonCode;
  const reason = `${sentence.action ?? ""} ${sentence.actionReason ?? ""}`.toLocaleLowerCase();
  if (reason.includes("duplicate")) {
    return reason.includes("semantic") ? "duplicate_semantic" : "duplicate_exact";
  }
  if (reason.includes("citation_mismatch") || reason.includes("citation failure")) return "citation_failure";
  if (reason.includes("reference") || reason.includes("source_binding_mismatch")) return "claim_reference_mismatch";
  if (reason.includes("namespace") || reason.includes("claim_identity_missing")) return "claim_namespace_loss";
  if (reason.includes("not_in_plan") || reason.includes("not in plan")) return "not_in_plan";
  if (reason.includes("synthesis") && reason.includes("not")) return "synthesis_not_realized";
  if (reason.includes("conclusion") && reason.includes("body")) return "conclusion_only_claim";
  if (reason.includes("unsupported") || reason.includes("no_allowed_claim")) return "unsupported_claim";
  return null;
}

function lossReason(
  before: AuditSentence,
  after: AuditSentence | undefined,
  stageFrom: CanonicalStageName,
  stageTo: CanonicalStageName,
): CanonicalLossReason {
  const explicit = explicitReason(after ?? before);
  if (explicit) return explicit;
  const taxonomy = classifyContentTaxonomy(before);
  if (!after && stageTo === "validation") {
    if (taxonomy === "transition") return "transition_removed";
    if (taxonomy === "structural") return "structural_text_removed";
    return "unsupported_claim";
  }
  if (stageFrom === "paragraph-render" && stageTo === "trace-reconstruction") return "trace_mapping_loss";
  if (stageFrom === "trace-reconstruction" && stageTo === "canonical") return "renderer_rewrite";
  if (stageTo === "paragraph-render") return "paragraph_merge_loss";
  if (taxonomy === "transition") return "transition_removed";
  if (taxonomy === "structural") return "structural_text_removed";
  if (countCjk(before.text) <= 8 && !(before.finalClaimIds?.length || before.originalClaimIds?.length)) {
    return "low_information";
  }
  if (before.validation === "blocked" || before.deleted) return "unsupported_claim";
  return "other";
}

function sumCjk(sentences: readonly AuditSentence[]): number {
  return sentences.reduce((total, sentence) => total + countCjk(sentence.text), 0);
}

function addCount<T extends string>(record: Partial<Record<T, number>>, key: T, value: number): void {
  record[key] = (record[key] ?? 0) + value;
}

export function attributeCanonicalStageLoss(
  snapshots: readonly CanonicalStageSnapshot[],
): CanonicalStageLossAttribution {
  const byStage = new Map(snapshots.map((snapshot) => [snapshot.stage, snapshot] as const));
  const records: CanonicalLossRecord[] = [];
  for (let index = 0; index < CANONICAL_STAGE_NAMES.length - 1; index += 1) {
    const stageFrom = CANONICAL_STAGE_NAMES[index]!;
    const stageTo = CANONICAL_STAGE_NAMES[index + 1]!;
    const before = byStage.get(stageFrom)?.sentences ?? [];
    const after = byStage.get(stageTo)?.sentences ?? [];
    const unused = new Set(after.map((_, itemIndex) => itemIndex));
    for (const original of before) {
      let matchIndex = after.findIndex(
        (candidate, itemIndex) => unused.has(itemIndex) && candidate.sentenceId === original.sentenceId,
      );
      if (matchIndex < 0) {
        matchIndex = after.findIndex(
          (candidate, itemIndex) => unused.has(itemIndex) && fingerprint(candidate.text) === fingerprint(original.text),
        );
      }
      if (matchIndex < 0) {
        let best = 0;
        for (const itemIndex of unused) {
          const score = similarity(original.text, after[itemIndex]!.text);
          if (score >= 0.72 && score > best) {
            best = score;
            matchIndex = itemIndex;
          }
        }
      }
      const resulting = matchIndex >= 0 ? after[matchIndex] : undefined;
      if (matchIndex >= 0) unused.delete(matchIndex);
      const originalCjk = countCjk(original.text);
      const resultingCjk = countCjk(resulting?.text ?? "");
      if (originalCjk === resultingCjk && fingerprint(original.text) === fingerprint(resulting?.text ?? "")) continue;
      records.push({
        stageFrom,
        stageTo,
        sentenceId: original.sentenceId,
        originalText: original.text,
        resultingText: resulting?.text ?? "",
        originalCjk,
        resultingCjk,
        cjkDelta: originalCjk - resultingCjk,
        originalClaimIds: unique([...(original.originalClaimIds ?? []), ...(original.finalClaimIds ?? [])]),
        finalClaimIds: unique(resulting?.finalClaimIds ?? []),
        evidenceIds: unique([...(original.evidenceIds ?? []), ...(resulting?.evidenceIds ?? [])]),
        sourceIds: unique([...(original.sourceIds ?? []), ...(resulting?.sourceIds ?? [])]),
        reasonCode: lossReason(original, resulting, stageFrom, stageTo),
        deterministic: true,
      });
    }
    for (const itemIndex of unused) {
      const resulting = after[itemIndex]!;
      records.push({
        stageFrom,
        stageTo,
        sentenceId: resulting.sentenceId,
        originalText: "",
        resultingText: resulting.text,
        originalCjk: 0,
        resultingCjk: countCjk(resulting.text),
        cjkDelta: -countCjk(resulting.text),
        originalClaimIds: [],
        finalClaimIds: unique(resulting.finalClaimIds ?? []),
        evidenceIds: unique(resulting.evidenceIds ?? []),
        sourceIds: unique(resulting.sourceIds ?? []),
        reasonCode: lossReason(resulting, resulting, stageFrom, stageTo),
        deterministic: true,
      });
    }
  }
  const lost_cjk_by_reason: Partial<Record<CanonicalLossReason, number>> = {};
  const gained_cjk_by_reason: Partial<Record<CanonicalLossReason, number>> = {};
  const lost_sentences_by_reason: Partial<Record<CanonicalLossReason, number>> = {};
  let factual_cjk_lost = 0;
  let interpretive_cjk_lost = 0;
  let structural_cjk_lost = 0;
  for (const record of records) {
    if (record.cjkDelta > 0) {
      addCount(lost_cjk_by_reason, record.reasonCode, record.cjkDelta);
      if (record.resultingCjk === 0) addCount(lost_sentences_by_reason, record.reasonCode, 1);
      const taxonomy = classifyContentTaxonomy({ sentenceId: record.sentenceId, text: record.originalText, finalClaimIds: record.originalClaimIds });
      if (taxonomy === "factual" || taxonomy === "synthesis") factual_cjk_lost += record.cjkDelta;
      else if (["structural", "transition", "methodological"].includes(taxonomy)) structural_cjk_lost += record.cjkDelta;
      else interpretive_cjk_lost += record.cjkDelta;
    } else if (record.cjkDelta < 0) {
      addCount(gained_cjk_by_reason, record.reasonCode, Math.abs(record.cjkDelta));
    }
  }
  const raw_cjk = sumCjk(byStage.get("raw")?.sentences ?? []);
  const validated_cjk = sumCjk(byStage.get("validation")?.sentences ?? []);
  const repair_cjk = sumCjk(byStage.get("repair")?.sentences ?? []);
  const canonical_cjk = sumCjk(byStage.get("canonical")?.sentences ?? []);
  const signedRecordDelta = records.reduce((total, record) => total + record.cjkDelta, 0);
  const net_cjk_by_reason: Partial<Record<CanonicalLossReason, number>> = {};
  for (const reason of CANONICAL_LOSS_REASONS) {
    const net = (lost_cjk_by_reason[reason] ?? 0) - (gained_cjk_by_reason[reason] ?? 0);
    if (net !== 0) net_cjk_by_reason[reason] = net;
  }
  return {
    schemaVersion: "researchforge-canonical-stage-loss-attribution/v1",
    raw_cjk,
    validated_cjk,
    repair_cjk,
    canonical_cjk,
    net_lost_cjk: raw_cjk - canonical_cjk,
    reconciled: signedRecordDelta === raw_cjk - canonical_cjk,
    lost_cjk_by_reason,
    gained_cjk_by_reason,
    net_cjk_by_reason,
    lost_sentences_by_reason,
    factual_cjk_lost,
    interpretive_cjk_lost,
    structural_cjk_lost,
    duplicate_cjk_lost: (lost_cjk_by_reason.duplicate_exact ?? 0) + (lost_cjk_by_reason.duplicate_semantic ?? 0),
    unsupported_cjk_lost: lost_cjk_by_reason.unsupported_claim ?? 0,
    records,
  };
}

export type EvidenceYieldCategory =
  | "objective"
  | "population"
  | "sample"
  | "method"
  | "exposure"
  | "comparator"
  | "primary_outcome"
  | "quantitative"
  | "secondary_result"
  | "mechanism"
  | "moderator"
  | "limitation"
  | "uncertainty"
  | "author_interpretation"
  | "generalizability"
  | "conflict";

export interface EvidenceAuditSource {
  sourceId: string;
  content?: string | null;
}

export interface EvidenceAuditCard {
  evidenceId: string;
  sourceId: string;
  text: string;
}

export interface EvidenceAuditClaim {
  claimId: string;
  proposition: string;
  supportEvidenceIds: string[];
  supportSourceIds: string[];
  claimType?: string;
  scope?: { population?: string; exposure?: string; outcome?: string; context?: string };
  supportSpans?: Array<{ exactSupportSpan: string }>;
}

export interface SourceEvidenceYield {
  sourceId: string;
  safeEvidenceCards: number;
  atomicClaims: number;
  uniqueClaimConcepts: number;
  quantitativeClaims: number;
  methodClaims: number;
  populationSampleClaims: number;
  mechanismClaims: number;
  limitationClaims: number;
  comparisonCapableClaims: number;
  findingClaims: number;
  claimsPerSource: number;
  evidenceCardsPerSource: number;
  presentInSource: EvidenceYieldCategory[];
  extracted: EvidenceYieldCategory[];
  missedExtractableCategories: EvidenceYieldCategory[];
  saturation: "source_extraction_complete" | "source_extraction_partial" | "source_content_limited";
}

export interface EvidenceDensityAudit {
  schemaVersion: "researchforge-evidence-density-audit/v1";
  sources: SourceEvidenceYield[];
  claims_per_source: number;
  evidence_cards_per_source: number;
  unique_claims_per_source: number;
  under_extracted_sources: string[];
  source_limited_sources: string[];
  over_represented_sources: string[];
}

const YIELD_PATTERNS: Record<EvidenceYieldCategory, RegExp> = {
  objective: /(?:目的|旨在|研究問題|objective|aim(?:ed|s)? to|research question)/iu,
  population: /(?:青少年|學生|成人|兒童|參與者|受試者|population|participants?)/iu,
  sample: /(?:樣本|n\s*=|\d+\s*(?:人|名)|sample size|participants?)/iu,
  method: /(?:橫斷|縱貫|實驗|問卷|訪談|回顧|統合分析|method|cross-sectional|longitudinal|trial|survey|review)/iu,
  exposure: /(?:暴露|介入|使用時間|使用頻率|exposure|intervention|screen time|use frequency)/iu,
  comparator: /(?:對照|相比|比較|相較|versus|compared with|control group)/iu,
  primary_outcome: /(?:主要結果|主要終點|睡眠|注意力|學業|primary outcome|endpoint)/iu,
  quantitative: /(?:\d+(?:\.\d+)?\s*%|\br\s*=|\bp\s*[<=>]|confidence interval|odds ratio|平均|中位數)/iu,
  secondary_result: /(?:次要結果|次要終點|secondary outcome|secondary result)/iu,
  mechanism: /(?:機制|中介|路徑|調節|mechanism|mediat(?:e|ion)|pathway)/iu,
  moderator: /(?:調節因子|分層|亞組|交互作用|moderator|subgroup|interaction)/iu,
  limitation: LIMITATION_PATTERN,
  uncertainty: /(?:不確定|可能|信賴區間|證據有限|uncertain|may|confidence interval)/iu,
  author_interpretation: /(?:作者認為|作者解釋|研究者認為|authors? (?:suggest|interpret|conclude))/iu,
  generalizability: /(?:外推|推廣性|適用範圍|代表性|generalizab|applicability)/iu,
  conflict: /(?:矛盾|不一致|相反|不同方向|conflict|inconsistent|opposite)/iu,
};

function detectedYieldCategories(text: string): EvidenceYieldCategory[] {
  return (Object.entries(YIELD_PATTERNS) as Array<[EvidenceYieldCategory, RegExp]>)
    .filter(([, pattern]) => pattern.test(text))
    .map(([category]) => category);
}

function conceptFingerprint(value: string): string {
  return fingerprint(value)
    .replace(/(?:研究|結果|顯示|指出|報告|資料|證據)/gu, "")
    .slice(0, 96);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function auditEvidenceDensity(input: {
  sources: readonly EvidenceAuditSource[];
  evidenceCards: readonly EvidenceAuditCard[];
  atomicClaims: readonly EvidenceAuditClaim[];
}): EvidenceDensityAudit {
  const sourceYields = input.sources.map((source): SourceEvidenceYield => {
    const cards = input.evidenceCards.filter((card) => card.sourceId === source.sourceId);
    const claims = input.atomicClaims.filter((claim) => claim.supportSourceIds.includes(source.sourceId));
    const extractedText = [
      ...cards.map((card) => card.text),
      ...claims.flatMap((claim) => [claim.proposition, ...(claim.supportSpans ?? []).map((span) => span.exactSupportSpan)]),
    ].join(" ");
    const content = clean(source.content);
    const presentInSource = detectedYieldCategories(content);
    const extracted = detectedYieldCategories(extractedText);
    const missedExtractableCategories = presentInSource.filter((category) => !extracted.includes(category));
    const sourceLimited = countCjk(content) + content.replace(/[^A-Za-z]/gu, "").length < 160 || presentInSource.length <= 2;
    const claimText = (claim: EvidenceAuditClaim) => `${claim.claimType ?? ""} ${claim.proposition}`;
    return {
      sourceId: source.sourceId,
      safeEvidenceCards: cards.length,
      atomicClaims: claims.length,
      uniqueClaimConcepts: new Set(claims.map((claim) => conceptFingerprint(claim.proposition)).filter(Boolean)).size,
      quantitativeClaims: claims.filter((claim) => YIELD_PATTERNS.quantitative.test(claimText(claim))).length,
      methodClaims: claims.filter((claim) => claim.claimType === "method" || YIELD_PATTERNS.method.test(claimText(claim))).length,
      populationSampleClaims: claims.filter((claim) => Boolean(claim.scope?.population) || YIELD_PATTERNS.population.test(claimText(claim)) || YIELD_PATTERNS.sample.test(claimText(claim))).length,
      mechanismClaims: claims.filter((claim) => YIELD_PATTERNS.mechanism.test(claimText(claim))).length,
      limitationClaims: claims.filter((claim) => claim.claimType === "limitation" || YIELD_PATTERNS.limitation.test(claimText(claim))).length,
      comparisonCapableClaims: claims.filter((claim) => YIELD_PATTERNS.comparator.test(claimText(claim)) || Boolean(claim.scope?.exposure && claim.scope?.outcome)).length,
      findingClaims: claims.filter((claim) => claim.claimType === "finding" || claim.claimType === "association" || claim.claimType === "causal").length,
      claimsPerSource: claims.length,
      evidenceCardsPerSource: cards.length,
      presentInSource,
      extracted,
      missedExtractableCategories,
      saturation: sourceLimited
        ? "source_content_limited"
        : missedExtractableCategories.length > 0
          ? "source_extraction_partial"
          : "source_extraction_complete",
    };
  });
  const claimsMedian = median(sourceYields.map((source) => source.atomicClaims));
  return {
    schemaVersion: "researchforge-evidence-density-audit/v1",
    sources: sourceYields,
    claims_per_source: input.sources.length ? input.atomicClaims.length / input.sources.length : 0,
    evidence_cards_per_source: input.sources.length ? input.evidenceCards.length / input.sources.length : 0,
    unique_claims_per_source: input.sources.length
      ? sourceYields.reduce((total, source) => total + source.uniqueClaimConcepts, 0) / input.sources.length
      : 0,
    under_extracted_sources: sourceYields.filter((source) => source.saturation === "source_extraction_partial").map((source) => source.sourceId),
    source_limited_sources: sourceYields.filter((source) => source.saturation === "source_content_limited").map((source) => source.sourceId),
    over_represented_sources: sourceYields.filter((source) => claimsMedian > 0 && source.atomicClaims > claimsMedian * 2).map((source) => source.sourceId),
  };
}

export interface EvidenceBearingMetrics {
  canonical_body_cjk: number;
  supported_factual_cjk: number;
  supported_synthesis_cjk: number;
  supported_evidence_bearing_cjk: number;
  unsupported_factual_claim_count: number;
  evidence_bearing_ratio: number;
  semantic_duplicate_cjk: number;
  duplicate_ratio: number;
  unique_evidence_bearing_ratio: number;
}

export function measureEvidenceBearingContent(sentences: readonly AuditSentence[]): EvidenceBearingMetrics {
  const canonical_body_cjk = sumCjk(sentences);
  let supported_factual_cjk = 0;
  let supported_synthesis_cjk = 0;
  let unsupported_factual_claim_count = 0;
  let semantic_duplicate_cjk = 0;
  const prior: AuditSentence[] = [];
  for (const sentence of sentences) {
    const cjk = countCjk(sentence.text);
    const taxonomy = classifyContentTaxonomy(sentence);
    const claimIds = unique(sentence.finalClaimIds ?? []);
    const traceable = claimIds.length > 0 && (sentence.evidenceIds?.length ?? 0) > 0 && (sentence.sourceIds?.length ?? 0) > 0 && sentence.validation !== "blocked";
    if (taxonomy === "factual") {
      if (traceable) supported_factual_cjk += cjk;
      else unsupported_factual_claim_count += 1;
    } else if (taxonomy === "synthesis") {
      if (traceable && claimIds.every((claimId) => claimId.startsWith("synthesis-"))) supported_synthesis_cjk += cjk;
      else unsupported_factual_claim_count += 1;
    }
    if (prior.some((candidate) => similarity(candidate.text, sentence.text) >= 0.82)) {
      semantic_duplicate_cjk += cjk;
    } else {
      prior.push(sentence);
    }
  }
  const supported_evidence_bearing_cjk = supported_factual_cjk + supported_synthesis_cjk;
  return {
    canonical_body_cjk,
    supported_factual_cjk,
    supported_synthesis_cjk,
    supported_evidence_bearing_cjk,
    unsupported_factual_claim_count,
    evidence_bearing_ratio: canonical_body_cjk ? supported_evidence_bearing_cjk / canonical_body_cjk : 0,
    semantic_duplicate_cjk,
    duplicate_ratio: canonical_body_cjk ? semantic_duplicate_cjk / canonical_body_cjk : 0,
    unique_evidence_bearing_ratio: canonical_body_cjk ? Math.max(0, supported_evidence_bearing_cjk - semantic_duplicate_cjk) / canonical_body_cjk : 0,
  };
}

export interface LongReportThresholdSample extends EvidenceBearingMetrics {
  fixtureId: string;
  accepted: boolean;
}

export interface LongReportThresholds {
  minimumCanonicalBodyCjk: number;
  minimumSupportedEvidenceBearingCjk: number;
  minimumEvidenceBearingRatio: number;
  maximumDuplicateRatio: number;
  derivation: {
    acceptedFixtureIds: string[];
    rejectedFixtureIds: string[];
    method: "accepted_fixture_lower_quartile_with_rejected_separation";
  };
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank lower bound is intentionally conservative for a small frozen
  // fixture corpus: a known accepted example must not fail its own threshold.
  return sorted[Math.floor((sorted.length - 1) * quantile)]!;
}

function upperPercentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length - 1) * quantile)]!;
}

export function deriveLongReportThresholds(samples: readonly LongReportThresholdSample[]): LongReportThresholds {
  const accepted = samples.filter((sample) => sample.accepted);
  const rejected = samples.filter((sample) => !sample.accepted);
  if (accepted.length < 2) throw new Error("at_least_two_accepted_fixtures_required_for_threshold_derivation");
  const acceptedCanonicalQ1 = percentile(accepted.map((sample) => sample.canonical_body_cjk), 0.25);
  const acceptedSupportedQ1 = percentile(accepted.map((sample) => sample.supported_evidence_bearing_cjk), 0.25);
  const acceptedRatioQ1 = percentile(accepted.map((sample) => sample.evidence_bearing_ratio), 0.25);
  const acceptedDuplicateQ3 = upperPercentile(
    accepted.map((sample) => sample.duplicate_ratio),
    0.75,
  );
  const rejectedSupportedMax = Math.max(0, ...rejected.map((sample) => sample.supported_evidence_bearing_cjk));
  return {
    // A verbose rejected fixture may be longer than an accepted fixture, so
    // canonical length is derived only from accepted long-report examples.
    minimumCanonicalBodyCjk: Math.round(acceptedCanonicalQ1),
    minimumSupportedEvidenceBearingCjk: Math.round(Math.max(rejectedSupportedMax + 1, acceptedSupportedQ1)),
    minimumEvidenceBearingRatio: acceptedRatioQ1,
    maximumDuplicateRatio: acceptedDuplicateQ3,
    derivation: {
      acceptedFixtureIds: accepted.map((sample) => sample.fixtureId),
      rejectedFixtureIds: rejected.map((sample) => sample.fixtureId),
      method: "accepted_fixture_lower_quartile_with_rejected_separation",
    },
  };
}

export interface LongReportSafetyMetrics {
  citationCoverage: number;
  claimReferenceMismatch: number;
  unknownSourceLeakage: number;
  rejectedSourceLeakage: number;
  ghostReferences: number;
  orphanCitations: number;
  lineageIssues: number;
  primaryFindingPreservation: number;
  centralAnswerAlignment: boolean;
  conclusionAlignment: boolean;
  sectionCompleteness: number;
  formalQuality: boolean;
}

export interface LongReportQualityGateResult {
  passed: boolean;
  failures: string[];
  metrics: EvidenceBearingMetrics & LongReportSafetyMetrics;
  thresholds: LongReportThresholds;
}

export function evaluateLongReportQuality(input: {
  content: EvidenceBearingMetrics;
  safety: LongReportSafetyMetrics;
  thresholds: LongReportThresholds;
}): LongReportQualityGateResult {
  const failures = unique([
    input.content.canonical_body_cjk < input.thresholds.minimumCanonicalBodyCjk
      ? "canonical_body_below_derived_long_threshold"
      : "",
    input.content.supported_evidence_bearing_cjk <
      input.thresholds.minimumSupportedEvidenceBearingCjk
      ? "supported_evidence_bearing_content_below_derived_threshold"
      : "",
    input.content.evidence_bearing_ratio <
      input.thresholds.minimumEvidenceBearingRatio
      ? "evidence_bearing_ratio_below_derived_threshold"
      : "",
    input.content.duplicate_ratio > input.thresholds.maximumDuplicateRatio
      ? "duplicate_ratio_above_derived_threshold"
      : "",
    input.content.unsupported_factual_claim_count !== 0
      ? "unsupported_factual_claims_present"
      : "",
    input.safety.citationCoverage !== 1 ? "factual_citation_coverage_not_100_percent" : "",
    input.safety.claimReferenceMismatch !== 0 ? "claim_reference_mismatch" : "",
    input.safety.unknownSourceLeakage !== 0 ? "unknown_source_leakage" : "",
    input.safety.rejectedSourceLeakage !== 0 ? "rejected_source_leakage" : "",
    input.safety.ghostReferences !== 0 ? "ghost_references" : "",
    input.safety.orphanCitations !== 0 ? "orphan_citations" : "",
    input.safety.lineageIssues !== 0 ? "lineage_issues" : "",
    input.safety.primaryFindingPreservation !== 1 ? "primary_findings_not_fully_preserved" : "",
    !input.safety.centralAnswerAlignment ? "central_answer_not_aligned" : "",
    !input.safety.conclusionAlignment ? "conclusion_not_aligned" : "",
    input.safety.sectionCompleteness !== 1 ? "required_sections_incomplete" : "",
    !input.safety.formalQuality ? "formal_quality_failed" : "",
  ]);
  return {
    passed: failures.length === 0,
    failures,
    metrics: { ...input.content, ...input.safety },
    thresholds: input.thresholds,
  };
}

export interface CentralAnswerContract {
  researchQuestion: string;
  supportedAnswer: string;
  supportingFindingIds: string[];
  supportingClaimIds: string[];
  synthesisClaimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  confidence: "high" | "moderate" | "limited";
  boundaries: string[];
  contradictions: string[];
  requiredClaims: CentralAnswerRequiredClaim[];
}

export type CentralClaimSemanticRole =
  | "direct_finding"
  | "quantitative_finding"
  | "temporal_finding"
  | "mechanism"
  | "contradiction"
  | "limitation"
  | "synthesis";

export type CentralClaimRealizationRequirement =
  | "fully_realized"
  | "partially_realized"
  | "not_realized";

export interface CentralAnswerRequiredClaim {
  centralClaimId: string;
  required: true;
  allowedSections: string[];
  targetSection: string;
  requiredEvidenceIds: string[];
  requiredSourceIds: string[];
  requiredSemanticRole: CentralClaimSemanticRole;
  realizationRequirement: CentralClaimRealizationRequirement;
}

export interface CentralAnswerAtomicClaim extends EvidenceAuditClaim {
  claimType?: string;
}

export interface CentralAnswerSynthesisClaim {
  claimId: string;
  proposition: string;
  derivedFromAtomicClaimIds: string[];
  supportSourceIds: string[];
  validationStatus: "pending" | "validated" | "rejected";
  synthesisType?: string;
}

function centralSemanticRole(
  claim: CentralAnswerAtomicClaim | CentralAnswerSynthesisClaim,
): CentralClaimSemanticRole {
  if ("derivedFromAtomicClaimIds" in claim) {
    return claim.synthesisType === "contrast" || claim.synthesisType === "uncertainty"
      ? "contradiction"
      : "synthesis";
  }
  if (claim.claimType === "limitation") return "limitation";
  if (claim.claimType === "causal" || /(?:機制|中介|路徑|mechanism|mediat)/iu.test(claim.proposition)) {
    return "mechanism";
  }
  if (/(?:縱貫|追蹤|前瞻|longitudinal|prospective|temporal)/iu.test(claim.proposition)) {
    return "temporal_finding";
  }
  if (/(?:\d|百分比|比值|相關係數|odds ratio|confidence interval|p\s*[<=>])/iu.test(claim.proposition)) {
    return "quantitative_finding";
  }
  return "direct_finding";
}

function centralTargetSection(
  claim: CentralAnswerAtomicClaim | CentralAnswerSynthesisClaim,
): { targetSection: string; allowedSections: string[] } {
  const role = centralSemanticRole(claim);
  if (role === "limitation") {
    return { targetSection: "limitations", allowedSections: ["limitations", "discussion"] };
  }
  if (role === "synthesis" || role === "contradiction" || role === "mechanism") {
    return { targetSection: "discussion", allowedSections: ["findings", "discussion"] };
  }
  return { targetSection: "findings", allowedSections: ["findings", "literature_review"] };
}

export function buildCentralAnswerContract(input: {
  researchQuestion: string;
  atomicClaims: readonly CentralAnswerAtomicClaim[];
  synthesisClaims: readonly CentralAnswerSynthesisClaim[];
  supportingFindingIds?: readonly string[];
  preferredClaimIds?: readonly string[];
  fixedClaimIds?: readonly string[];
}): CentralAnswerContract {
  const atomicById = new Map(input.atomicClaims.map((claim) => [claim.claimId, claim]));
  const preferred = new Set(input.preferredClaimIds ?? []);
  const fixed = new Set(input.fixedClaimIds ?? []);
  const validatedSynthesis = input.synthesisClaims.filter(
    (claim) => claim.validationStatus === "validated" && claim.derivedFromAtomicClaimIds.length >= 2 && claim.derivedFromAtomicClaimIds.every((id) => atomicById.has(id)),
  );
  const selectedSynthesis = fixed.size > 0
    ? validatedSynthesis.filter((claim) => fixed.has(claim.claimId))
    : [...validatedSynthesis].sort((left, right) =>
        Number(preferred.has(right.claimId)) - Number(preferred.has(left.claimId)) ||
        similarity(right.proposition, input.researchQuestion) -
          similarity(left.proposition, input.researchQuestion) ||
        right.supportSourceIds.length - left.supportSourceIds.length ||
        left.claimId.localeCompare(right.claimId)
      ).slice(0, 2);
  const directAtomic = input.atomicClaims
    .filter((claim) =>
      fixed.size > 0
        ? fixed.has(claim.claimId)
        : preferred.size > 0
        ? preferred.has(claim.claimId)
        : ["finding", "association", "causal"].includes(claim.claimType ?? ""),
    )
    .sort(
      (left, right) =>
        similarity(right.proposition, input.researchQuestion) -
          similarity(left.proposition, input.researchQuestion) ||
        right.supportSourceIds.length - left.supportSourceIds.length ||
        left.claimId.localeCompare(right.claimId),
    );
  const supportingClaimIds = fixed.size > 0
    ? directAtomic.map((claim) => claim.claimId)
    : unique([
        ...selectedSynthesis.flatMap((claim) => claim.derivedFromAtomicClaimIds),
        ...directAtomic.slice(0, 4).map((claim) => claim.claimId),
      ]).slice(0, 6);
  const supportingClaims = supportingClaimIds.map((id) => atomicById.get(id)).filter((claim): claim is CentralAnswerAtomicClaim => Boolean(claim));
  const answerClaims = selectedSynthesis.length > 0 ? selectedSynthesis : supportingClaims.slice(0, 2);
  const sourceIds = unique([
    ...selectedSynthesis.flatMap((claim) => claim.supportSourceIds),
    ...supportingClaims.flatMap((claim) => claim.supportSourceIds),
  ]);
  const evidenceIds = unique(supportingClaims.flatMap((claim) => claim.supportEvidenceIds));
  const boundaries = unique(
    input.atomicClaims
      .filter(
        (claim) =>
          claim.claimType === "limitation" ||
          LIMITATION_PATTERN.test(claim.proposition),
      )
      .map((claim) => claim.proposition),
  );
  const contradictions = unique(validatedSynthesis.filter((claim) => ["contrast", "uncertainty"].includes(claim.synthesisType ?? "")).map((claim) => claim.proposition));
  const selectedCentralClaims: Array<CentralAnswerAtomicClaim | CentralAnswerSynthesisClaim> = [
    ...supportingClaims,
    ...selectedSynthesis,
  ];
  const requiredClaims = selectedCentralClaims.map((claim): CentralAnswerRequiredClaim => {
    const placement = centralTargetSection(claim);
    const requiredEvidenceIds = "supportEvidenceIds" in claim
      ? unique(claim.supportEvidenceIds)
      : unique(claim.derivedFromAtomicClaimIds.flatMap((claimId) => atomicById.get(claimId)?.supportEvidenceIds ?? []));
    return {
      centralClaimId: claim.claimId,
      required: true,
      allowedSections: placement.allowedSections,
      targetSection: placement.targetSection,
      requiredEvidenceIds,
      requiredSourceIds: unique(claim.supportSourceIds),
      requiredSemanticRole: centralSemanticRole(claim),
      realizationRequirement: "fully_realized",
    };
  });
  return {
    researchQuestion: clean(input.researchQuestion),
    supportedAnswer: answerClaims.map((claim) => claim.proposition).join(" "),
    supportingFindingIds: unique(input.supportingFindingIds ?? []),
    supportingClaimIds,
    synthesisClaimIds: selectedSynthesis.map((claim) => claim.claimId),
    evidenceIds,
    sourceIds,
    confidence:
      sourceIds.length >= 8 &&
      selectedSynthesis.length >= 2 &&
      contradictions.length === 0 &&
      boundaries.length === 0
        ? "high"
        : sourceIds.length >= 3
          ? "moderate"
          : "limited",
    boundaries,
    contradictions,
    requiredClaims,
  };
}

export interface SemanticClaimDefinition {
  claimId: string;
  proposition: string;
  supportEvidenceIds: string[];
  supportSourceIds: string[];
  claimType?: string;
  scope?: { population?: string; exposure?: string; outcome?: string; context?: string };
  epistemicStrength?: string;
  forbiddenExtensions?: string[];
}

export interface EvidenceConflictPolicy {
  conflictId: string;
  status: "resolved" | "unresolved";
  authoritativeValue?: string;
  conflictingValues: string[];
  contextPattern?: RegExp;
}

export interface SemanticEntailmentAudit {
  status: "entailed" | "not_entailed";
  issues: string[];
  expectedConcepts: string[];
  realizedConcepts: string[];
}

const SEMANTIC_CONCEPTS: Record<string, RegExp> = {
  association: /(?:相關|關聯|伴隨|associated?|association|correlat)/iu,
  causality: /(?:造成|導致|引起|使得|因果|cause[ds]?|causal|result(?:s|ed)? in|leads? to)/iu,
  observational: /(?:觀察性|橫斷|世代|observational|cross[- ]?sectional|cohort)/iu,
  longitudinal: /(?:縱貫|追蹤|前瞻|longitudinal|prospective|follow[- ]?up)/iu,
  randomized: /(?:隨機(?:對照)?|randomi[sz]ed|\brct\b)/iu,
  adolescent: /(?:青少年|青春期|adolescen|teen(?:ager)?s?|youth)/iu,
  university: /(?:大學生|大學學生|university students?|college students?)/iu,
  children: /(?:兒童|孩童|children|child)/iu,
  adults: /(?:成人|成年|adults?)/iu,
  chinese_population: /(?:中國|華人|Chinese)/iu,
  short_video: /(?:短影音|短視頻|TikTok|Reels|YouTube Shorts|short[- ]?form video|short video)/iu,
  generic_screen: /(?:螢幕時間|屏幕時間|screen time)/iu,
  social_media: /(?:社群媒體|社交媒體|social media)/iu,
  sleep_duration: /(?:睡眠時長|睡眠時間|sleep duration)/iu,
  sleep_quality: /(?:睡眠品質|睡眠質量|sleep quality)/iu,
  bedtime: /(?:就寢時間|bedtime)/iu,
  sleep_onset: /(?:入睡時間|入睡潛伏|sleep onset|sleep latency)/iu,
  self_report: /(?:自陳|自我報告|問卷|self[- ]?report)/iu,
  actigraphy: /(?:活動紀錄儀|腕動計|actigraph)/iu,
  adjusted: /(?:調整後|控制.*(?:混雜|共變)|adjusted|after adjustment|controlling for confound)/iu,
  attenuated: /(?:減弱|衰減|幅度較小|attenuat)/iu,
  non_significant: /(?:不顯著|未達顯著|non[- ]?significant|not statistically significant)/iu,
  null_result: /(?:虛無結果|零結果|null (?:result|finding|association))/iu,
  uncertainty: /(?:可能|或許|不確定|不能確定|證據有限|may|might|could|uncertain|suggest)/iu,
  practical_importance: /(?:實務上重要|實質重要|practically important|clinically meaningful)/iu,
};

function semanticConcepts(value: string): string[] {
  return Object.entries(SEMANTIC_CONCEPTS)
    .filter(([, pattern]) => pattern.test(value))
    .map(([concept]) => concept);
}

function semanticNumbers(value: string): string[] {
  return unique(
    (value.normalize("NFKC").match(/-?\d+(?:\.\d+)?/gu) ?? []).map((number) =>
      String(Number(number)),
    ),
  );
}

function hasAbsenceAssertion(value: string): boolean {
  return /(?:沒有影響|毫無影響|證明不存在|完全沒有|no effect|proves? (?:the )?absence|there is no)/iu.test(value);
}

function hasStrongAdjustedAssertion(value: string): boolean {
  return /(?:調整後仍(?:然)?(?:很|非常|高度)?強|控制.*後.*強|remained strong after adjustment)/iu.test(value);
}

function hasDisappearanceAssertion(value: string): boolean {
  return /(?:完全消失|不復存在|disappeared|eliminated entirely)/iu.test(value);
}

export function auditConflictPolicy(input: {
  realizedText: string;
  policies: readonly EvidenceConflictPolicy[];
}): { status: "pass" | "blocked"; issues: string[] } {
  const issues: string[] = [];
  for (const policy of input.policies) {
    if (policy.contextPattern && !policy.contextPattern.test(input.realizedText)) continue;
    const presentValues = policy.conflictingValues.filter((value) =>
      input.realizedText.normalize("NFKC").includes(value.normalize("NFKC")),
    );
    if (policy.status === "resolved") {
      const forbidden = presentValues.filter((value) => value !== policy.authoritativeValue);
      if (
        forbidden.length > 0 &&
        !/(?:另一處|其他欄位|不同記載|衝突|誤記|conflict|elsewhere|another field)/iu.test(input.realizedText)
      ) {
        issues.push(`${policy.conflictId}:non_authoritative_value:${forbidden.join(",")}`);
      }
      continue;
    }
    if (
      presentValues.length > 0 &&
      !/(?:未解決|不一致|衝突|無法確定|uncertain|unresolved|conflict)/iu.test(input.realizedText)
    ) {
      issues.push(`${policy.conflictId}:unresolved_value_asserted_definitively:${presentValues.join(",")}`);
    }
  }
  return { status: issues.length === 0 ? "pass" : "blocked", issues };
}

export function auditSemanticEntailment(input: {
  claim: SemanticClaimDefinition;
  realizedText: string;
  conflictPolicies?: readonly EvidenceConflictPolicy[];
}): SemanticEntailmentAudit {
  const expectedText = input.claim.proposition;
  const structuredScopeText = [
    input.claim.scope?.population,
    input.claim.scope?.exposure,
    input.claim.scope?.outcome,
    input.claim.scope?.context,
  ].filter(Boolean).join(" ");
  const expectedConcepts = semanticConcepts(expectedText);
  const structuredScopeConcepts = new Set(semanticConcepts(structuredScopeText));
  const realizedConcepts = semanticConcepts(input.realizedText);
  const expected = new Set(expectedConcepts);
  const realized = new Set(realizedConcepts);
  const issues: string[] = [];

  if (realized.has("causality") && !expected.has("causality")) {
    issues.push("causality_escalation");
  }
  if (expected.has("longitudinal") && !realized.has("longitudinal")) {
    issues.push("design_qualification_missing:longitudinal");
  }
  if (expected.has("observational") && !realized.has("observational")) {
    issues.push("design_qualification_missing:observational");
  }
  if (expected.has("association") && !realized.has("association") && !realized.has("uncertainty")) {
    issues.push("association_semantics_missing");
  }

  const populationConcepts = ["adolescent", "university", "children", "adults", "chinese_population"];
  for (const concept of populationConcepts) {
    if (expected.has(concept) && !realized.has(concept)) issues.push(`population_qualification_missing:${concept}`);
  }
  if ((expected.has("university") || structuredScopeConcepts.has("university")) && realized.has("adolescent") && !expected.has("adolescent")) issues.push("population_escalation:university_to_adolescent");
  if ((expected.has("children") || structuredScopeConcepts.has("children")) && realized.has("adolescent") && !expected.has("adolescent")) issues.push("population_escalation:children_to_adolescent");
  if ((expected.has("adults") || structuredScopeConcepts.has("adults")) && realized.has("adolescent") && !expected.has("adolescent")) issues.push("population_escalation:adults_to_adolescent");
  if ((expected.has("chinese_population") || structuredScopeConcepts.has("chinese_population")) && /(?:所有|普遍|全球|universal|all adolescents)/iu.test(input.realizedText)) {
    issues.push("generalizability_escalation:chinese_population_to_universal");
  }

  for (const concept of ["short_video", "generic_screen", "social_media"] as const) {
    if (expected.has(concept) && !realized.has(concept)) issues.push(`exposure_qualification_missing:${concept}`);
  }
  if (!expected.has("short_video") && !structuredScopeConcepts.has("short_video") && realized.has("short_video")) issues.push("exposure_escalation:generic_to_short_video");
  for (const concept of ["sleep_duration", "sleep_quality", "bedtime", "sleep_onset", "self_report", "actigraphy"] as const) {
    if (expected.has(concept) && !realized.has(concept)) issues.push(`measurement_qualification_missing:${concept}`);
  }

  if ((expected.has("non_significant") || expected.has("null_result")) && hasAbsenceAssertion(input.realizedText)) {
    issues.push("null_or_non_significant_rewritten_as_proof_of_absence");
  }
  if (expected.has("attenuated") && hasStrongAdjustedAssertion(input.realizedText)) {
    issues.push("attenuation_reversed_after_adjustment");
  }
  if (expected.has("attenuated") && hasDisappearanceAssertion(input.realizedText) && !expected.has("non_significant")) {
    issues.push("attenuation_rewritten_as_disappearance");
  }
  if (expected.has("non_significant") && !realized.has("non_significant")) {
    issues.push("statistical_significance_qualification_missing");
  }
  if (/statistically significant|統計(?:上)?顯著/iu.test(input.claim.proposition) && realized.has("practical_importance")) {
    issues.push("statistical_significance_rewritten_as_practical_importance");
  }
  if (expected.has("uncertainty") && !realized.has("uncertainty") && /(?:證明|確定|必然|proves?|definitely|certainly)/iu.test(input.realizedText)) {
    issues.push("uncertainty_or_modality_removed");
  }

  const missingNumbers = semanticNumbers(input.claim.proposition).filter(
    (number) => !semanticNumbers(input.realizedText).includes(number),
  );
  if (missingNumbers.length > 0) issues.push(`quantitative_detail_missing:${missingNumbers.join(",")}`);
  const novelNumbers = semanticNumbers(input.realizedText).filter(
    (number) => !semanticNumbers(input.claim.proposition).includes(number),
  );
  if (novelNumbers.length > 0) issues.push(`novel_quantitative_detail:${novelNumbers.join(",")}`);

  const conflictAudit = auditConflictPolicy({
    realizedText: input.realizedText,
    policies: input.conflictPolicies ?? [],
  });
  issues.push(...conflictAudit.issues);
  return {
    status: issues.length === 0 ? "entailed" : "not_entailed",
    issues: unique(issues),
    expectedConcepts,
    realizedConcepts,
  };
}

export type BodyRealizationStatus =
  | "fully_realized"
  | "partially_realized"
  | "not_realized"
  | "removed_during_canonicalization";

export interface BodyRealizationRecord {
  claimId: string;
  centralClaimId?: string;
  sectionId: string;
  paragraphId: string | null;
  paragraphIds: string[];
  sentenceIds: string[];
  originalClaimIds: string[];
  finalClaimIds: string[];
  plannedSectionId: string;
  realizedSentenceIds: string[];
  canonicalSentenceIds: string[];
  evidenceCardIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  entailmentStatus: "entailed" | "not_entailed";
  entailmentIssues: string[];
  epistemicStatus: "preserved" | "escalated";
  citationValidated: boolean;
  realizationStatus: BodyRealizationStatus;
  allowedConclusionUse: boolean;
}

export function auditBodyRealization(input: {
  plannedClaims: readonly { claimId: string; sectionId: string }[];
  bodySentences: readonly AuditSentence[];
  canonicalSentences: readonly AuditSentence[];
  claimDefinitions?: readonly SemanticClaimDefinition[];
  centralRequirements?: readonly CentralAnswerRequiredClaim[];
  conflictPolicies?: readonly EvidenceConflictPolicy[];
}): BodyRealizationRecord[] {
  return input.plannedClaims.map((planned): BodyRealizationRecord => {
    const realized = input.bodySentences.filter((sentence) => (sentence.finalClaimIds ?? []).includes(planned.claimId));
    const canonical = input.canonicalSentences.filter((sentence) => (sentence.finalClaimIds ?? []).includes(planned.claimId));
    const claim = input.claimDefinitions?.find((candidate) => candidate.claimId === planned.claimId);
    const requirement = input.centralRequirements?.find((candidate) => candidate.centralClaimId === planned.claimId);
    const targetSection = requirement?.targetSection ?? planned.sectionId;
    // Central Answer claims must still satisfy their assigned coverage
    // contract. Other claims become reusable by the Conclusion when they were
    // actually realized in any canonical body section; their planning section
    // is not a second, accidental whitelist.
    const canonicalForEligibility = requirement
      ? canonical.filter((sentence) => sentence.sectionId === targetSection)
      : canonical;
    const entailmentAudits = claim
      ? canonicalForEligibility.map((sentence) => auditSemanticEntailment({
          claim,
          realizedText: sentence.text,
          conflictPolicies: input.conflictPolicies,
        }))
      : [];
    const evidenceIds = unique(canonicalForEligibility.flatMap((sentence) => sentence.evidenceIds ?? []));
    const sourceIds = unique(canonicalForEligibility.flatMap((sentence) => sentence.sourceIds ?? []));
    const requiredEvidencePresent = (requirement?.requiredEvidenceIds ?? []).every((id) => evidenceIds.includes(id));
    const requiredSourcesPresent = (requirement?.requiredSourceIds ?? []).every((id) => sourceIds.includes(id));
    const semanticallyEntailed = claim
      ? entailmentAudits.some((audit) => audit.status === "entailed")
      : canonicalForEligibility.length > 0;
    const citationValidated =
      canonicalForEligibility.length > 0 &&
      canonicalForEligibility.every((sentence) => sentence.validation !== "blocked") &&
      evidenceIds.length > 0 &&
      sourceIds.length > 0;
    const fullyRealized =
      canonicalForEligibility.length > 0 &&
      citationValidated &&
      requiredEvidencePresent &&
      requiredSourcesPresent &&
      semanticallyEntailed;
    const realizationStatus: BodyRealizationStatus = fullyRealized
      ? "fully_realized"
      : realized.length > 0 && canonical.length === 0
        ? "removed_during_canonicalization"
        : canonical.length > 0 || realized.length > 0
          ? "partially_realized"
          : "not_realized";
    const paragraphIds = unique(canonicalForEligibility.map((sentence) => sentence.paragraphId));
    const sentenceIds = unique(canonicalForEligibility.map((sentence) => sentence.sentenceId));
    const entailmentIssues = unique(entailmentAudits.flatMap((audit) => audit.issues));
    return {
      claimId: planned.claimId,
      centralClaimId: requirement?.centralClaimId,
      sectionId: canonicalForEligibility[0]?.sectionId ?? targetSection,
      paragraphId: paragraphIds[0] ?? null,
      paragraphIds,
      sentenceIds,
      originalClaimIds: unique(canonical.flatMap((sentence) => sentence.originalClaimIds ?? [])),
      finalClaimIds: unique(canonical.flatMap((sentence) => sentence.finalClaimIds ?? [])),
      plannedSectionId: targetSection,
      realizedSentenceIds: unique(realized.map((sentence) => sentence.sentenceId)),
      canonicalSentenceIds: sentenceIds,
      evidenceCardIds: evidenceIds,
      evidenceIds,
      sourceIds,
      entailmentStatus: semanticallyEntailed ? "entailed" : "not_entailed",
      entailmentIssues,
      epistemicStatus: entailmentIssues.some((issue) => /(?:causality|population|exposure|generalizability|uncertainty|significance|attenuation)/u.test(issue))
        ? "escalated"
        : "preserved",
      citationValidated,
      realizationStatus,
      allowedConclusionUse:
        realizationStatus === "fully_realized" &&
        citationValidated &&
        !entailmentIssues.some((issue) => /(?:causality|population|exposure|generalizability|uncertainty|significance|attenuation)/u.test(issue)) &&
        !["method", "background", "definition"].includes(claim?.claimType ?? ""),
    };
  });
}

export interface ConclusionCandidate {
  claimId: string;
  originatingSection: string;
  originatingParagraphIds: string[];
  sentenceIds: string[];
  sourceIds: string[];
  evidenceCardIds: string[];
  centralClaimId?: string;
  realizationStatus: BodyRealizationStatus;
  epistemicStatus: "preserved" | "escalated";
  citationValidated: boolean;
  allowedConclusionUse: boolean;
}

export interface ConclusionEligibilityGate {
  status: "pass" | "blocked";
  candidates: ConclusionCandidate[];
  rejected: Array<{ claimId: string; reason: string }>;
  requestedClaimIds: string[];
}

export function buildConclusionEligibilityGate(input: {
  bodyRealization: readonly BodyRealizationRecord[];
  requestedClaimIds?: readonly string[];
}): ConclusionEligibilityGate {
  const candidates = input.bodyRealization
    .filter((record) => record.realizationStatus === "fully_realized" && record.allowedConclusionUse)
    .map((record): ConclusionCandidate => ({
      claimId: record.claimId,
      originatingSection: record.sectionId,
      originatingParagraphIds: [...record.paragraphIds],
      sentenceIds: [...record.sentenceIds],
      sourceIds: [...record.sourceIds],
      evidenceCardIds: [...record.evidenceCardIds],
      centralClaimId: record.centralClaimId,
      realizationStatus: record.realizationStatus,
      epistemicStatus: record.epistemicStatus,
      citationValidated: record.citationValidated,
      allowedConclusionUse: true,
    }));
  const eligibleIds = new Set(candidates.map((candidate) => candidate.claimId));
  const requestedClaimIds = unique(input.requestedClaimIds ?? candidates.map((candidate) => candidate.claimId));
  const rejected = requestedClaimIds.flatMap((claimId) => {
    if (eligibleIds.has(claimId)) return [];
    const record = input.bodyRealization.find((candidate) => candidate.claimId === claimId);
    return [{
      claimId,
      reason: !record
        ? "claim_not_in_body_realization_registry"
        : record.realizationStatus !== "fully_realized"
          ? `body_claim_${record.realizationStatus}`
          : "conclusion_use_not_allowed",
    }];
  });
  return {
    status: rejected.length === 0 ? "pass" : "blocked",
    candidates,
    rejected,
    requestedClaimIds,
  };
}

export interface ConclusionClosureAudit {
  central_answer_present: boolean;
  all_conclusion_claims_realized_in_body: boolean;
  all_conclusion_claims_traceable: boolean;
  conclusion_claim_novelty: number;
  novelClaimIds: string[];
  untraceableSentenceIds: string[];
  semanticMismatchSentenceIds: string[];
  passed: boolean;
}

export function auditConclusionClosure(input: {
  contract: CentralAnswerContract;
  bodyRealization: readonly BodyRealizationRecord[];
  conclusionSentences: readonly AuditSentence[];
  claimDefinitions?: readonly SemanticClaimDefinition[];
  conflictPolicies?: readonly EvidenceConflictPolicy[];
}): ConclusionClosureAudit {
  const substantiveConclusionSentences = input.conclusionSentences.filter(
    (sentence) =>
      sentence.factual !== false || (sentence.finalClaimIds?.length ?? 0) > 0,
  );
  const bodyClaims = new Set(
    input.bodyRealization
      .filter((record) => record.realizationStatus === "fully_realized" && record.allowedConclusionUse)
      .flatMap((record) => record.claimId),
  );
  const conclusionClaimIds = unique(substantiveConclusionSentences.flatMap((sentence) => sentence.finalClaimIds ?? []));
  // Central Answer is a coverage contract, not the Conclusion's only
  // whitelist. Novelty is closed over the authoritative, fully-realized and
  // conclusion-eligible canonical body registry.
  const novelClaimIds = conclusionClaimIds.filter((claimId) => !bodyClaims.has(claimId));
  const untraceableSentenceIds = substantiveConclusionSentences
    .filter((sentence) =>
      (sentence.finalClaimIds?.length ?? 0) === 0 ||
      (sentence.evidenceIds?.length ?? 0) === 0 ||
      (sentence.sourceIds?.length ?? 0) === 0 ||
      sentence.validation === "blocked",
    )
    .map((sentence) => sentence.sentenceId);
  const semanticMismatchSentenceIds = substantiveConclusionSentences.flatMap((sentence) => {
    const claims = (sentence.finalClaimIds ?? [])
      .map((claimId) => input.claimDefinitions?.find((claim) => claim.claimId === claimId))
      .filter((claim): claim is SemanticClaimDefinition => Boolean(claim));
    if (claims.length === 0 || !input.claimDefinitions) return [];
    return claims.some((claim) => auditSemanticEntailment({
      claim,
      realizedText: sentence.text,
      conflictPolicies: input.conflictPolicies,
    }).status === "entailed")
      ? []
      : [sentence.sentenceId];
  });
  const central_answer_present = input.contract.supportingClaimIds.some((claimId) => conclusionClaimIds.includes(claimId)) || input.contract.synthesisClaimIds.some((claimId) => conclusionClaimIds.includes(claimId));
  const all_conclusion_claims_realized_in_body = novelClaimIds.length === 0;
  const all_conclusion_claims_traceable = untraceableSentenceIds.length === 0;
  return {
    central_answer_present,
    all_conclusion_claims_realized_in_body,
    all_conclusion_claims_traceable,
    conclusion_claim_novelty: novelClaimIds.length,
    novelClaimIds,
    untraceableSentenceIds,
    semanticMismatchSentenceIds,
    passed: central_answer_present && all_conclusion_claims_realized_in_body && all_conclusion_claims_traceable && semanticMismatchSentenceIds.length === 0,
  };
}

export type LongReportFeasibilityStatus =
  | "ready_long_report"
  | "ready_medium_report"
  | "ready_limited_report"
  | "insufficient_evidence";

export type ReportLengthTier =
  | "limited_evidence_brief"
  | "standard_research_report"
  | "long_research_report";

export const MIN_LONG_REPORT_SUPPORTED_CANONICAL_CJK = 5_200;
export const MIN_LONG_REPORT_SUPPORTED_RATIO = 0.7162;

export interface SectionSupportedBudget {
  sectionId: string;
  allocatedBudget: number;
  supportedBudgetEstimate: number;
  evidenceUnitsAvailable: number;
  claimCountAvailable: number;
  synthesisCountAvailable: number;
}

/**
 * Builds an exhaustive, source-balanced feasibility view without changing the
 * Writer's bounded per-section realization plan. Every validated atomic claim
 * is assigned once to a body section so recovered evidence cannot disappear
 * merely because it was appended after the Writer's planning cap.
 */
export function buildLongReportFeasibilitySectionPlans(input: {
  atomicClaims: readonly EvidenceAuditClaim[];
  allocatedBudgets: Readonly<Record<string, number>>;
}): Array<{ sectionId: string; claimIds: string[]; allocatedBudget: number }> {
  const sectionIds = Object.keys(input.allocatedBudgets);
  const result = new Map(sectionIds.map((sectionId) => [sectionId, [] as string[]] as const));
  const queues = new Map<string, EvidenceAuditClaim[]>();
  for (const claim of input.atomicClaims) {
    const sourceId = claim.supportSourceIds[0] ?? "unknown-source";
    const queue = queues.get(sourceId) ?? [];
    queue.push(claim);
    queues.set(sourceId, queue);
  }
  const sourceIds = [...queues.keys()];
  const balanced: EvidenceAuditClaim[] = [];
  for (let round = 0; ; round += 1) {
    let added = false;
    for (const sourceId of sourceIds) {
      const claim = queues.get(sourceId)?.[round];
      if (!claim) continue;
      balanced.push(claim);
      added = true;
    }
    if (!added) break;
  }
  const counters: Record<string, number> = {};
  const choose = (family: string, candidates: string[]): string => {
    const available = candidates.filter((sectionId) => result.has(sectionId));
    const safe = available.length ? available : sectionIds;
    const index = counters[family] ?? 0;
    counters[family] = index + 1;
    return safe[index % Math.max(1, safe.length)] ?? sectionIds[0] ?? "literature_review";
  };
  for (const claim of balanced) {
    const type = claim.claimType ?? "background";
    const sectionId = type === "method"
      ? choose("method", ["methodology", "limitations"])
      : type === "limitation"
        ? choose("limitation", ["limitations", "discussion"])
        : type === "recommendation"
          ? choose("recommendation", ["discussion"])
          : ["association", "finding", "causal"].includes(type)
            ? choose("finding", ["findings", "literature_review", "discussion", "findings"])
            : choose("background", ["introduction", "literature_review"]);
    result.get(sectionId)?.push(claim.claimId);
  }
  return sectionIds.map((sectionId) => ({
    sectionId,
    claimIds: result.get(sectionId) ?? [],
    allocatedBudget: input.allocatedBudgets[sectionId] ?? 0,
  }));
}

export interface LongReportEvidenceFeasibility {
  status: LongReportFeasibilityStatus;
  recommendedTier: ReportLengthTier;
  estimatedSupportedCanonicalCjk: number;
  requestedCanonicalCjk: number;
  sourceDiversity: number;
  uniqueAtomicClaims: number;
  primaryFindings: number;
  validatedSynthesisClaims: number;
  quantitativeClaims: number;
  methodologicalClaims: number;
  limitationClaims: number;
  centralAnswerSupported: boolean;
  sectionBudgets: SectionSupportedBudget[];
  reasons: string[];
}

export function estimateLongReportEvidenceFeasibility(input: {
  requestedCanonicalCjk: number;
  atomicClaims: readonly EvidenceAuditClaim[];
  synthesisClaims: readonly CentralAnswerSynthesisClaim[];
  sectionPlans: readonly { sectionId: string; claimIds: string[]; allocatedBudget: number }[];
  centralAnswer?: CentralAnswerContract | null;
}): LongReportEvidenceFeasibility {
  const uniqueClaims = [...new Map(input.atomicClaims.map((claim) => [conceptFingerprint(claim.proposition), claim])).values()];
  const validSynthesis = input.synthesisClaims.filter((claim) => claim.validationStatus === "validated" && claim.derivedFromAtomicClaimIds.length >= 2);
  const sourceDiversity = new Set(uniqueClaims.flatMap((claim) => claim.supportSourceIds)).size;
  const quantitativeClaims = uniqueClaims.filter((claim) => YIELD_PATTERNS.quantitative.test(claim.proposition)).length;
  const methodologicalClaims = uniqueClaims.filter((claim) => claim.claimType === "method" || YIELD_PATTERNS.method.test(claim.proposition)).length;
  const limitationClaims = uniqueClaims.filter((claim) => claim.claimType === "limitation" || YIELD_PATTERNS.limitation.test(claim.proposition)).length;
  const primaryFindings = uniqueClaims.filter((claim) => ["finding", "association", "causal"].includes(claim.claimType ?? "")).length;
  const atomicById = new Map(uniqueClaims.map((claim) => [claim.claimId, claim]));
  const accountedAtomicClaimIds = new Set<string>();
  const accountedSynthesisClaimIds = new Set<string>();
  const sectionBudgets = input.sectionPlans.map((section): SectionSupportedBudget => {
    const boundClaims = [...new Map(
      section.claimIds
        .map((claimId) => atomicById.get(claimId))
        .filter((claim): claim is EvidenceAuditClaim => Boolean(claim))
        .map((claim) => [claim.claimId, claim] as const),
    ).values()];
    const claims = boundClaims.filter((claim) => {
      if (accountedAtomicClaimIds.has(claim.claimId)) return false;
      accountedAtomicClaimIds.add(claim.claimId);
      return true;
    });
    const synthesis = validSynthesis.filter((claim) => {
      if (
        accountedSynthesisClaimIds.has(claim.claimId) ||
        !claim.derivedFromAtomicClaimIds.some((claimId) => section.claimIds.includes(claimId))
      ) return false;
      accountedSynthesisClaimIds.add(claim.claimId);
      return true;
    });
    const evidenceUnits = new Set(claims.flatMap((claim) => claim.supportEvidenceIds)).size;
    // The estimate is bounded by actual unique proposition/support-span text.
    // Structural allowance is proportional to evidence units and capped at 25%.
    const evidenceTextCjk = claims.reduce((total, claim) => total + countCjk(claim.proposition) + Math.min(80, countCjk((claim.supportSpans ?? []).map((span) => span.exactSupportSpan).join(" "))), 0)
      + synthesis.reduce((total, claim) => total + countCjk(claim.proposition), 0);
    const supportedBudgetEstimate = Math.min(section.allocatedBudget, Math.round(evidenceTextCjk * 1.25));
    return {
      sectionId: section.sectionId,
      allocatedBudget: section.allocatedBudget,
      supportedBudgetEstimate,
      evidenceUnitsAvailable: evidenceUnits,
      claimCountAvailable: boundClaims.length,
      synthesisCountAvailable: synthesis.length,
    };
  });
  const estimatedSupportedCanonicalCjk = sectionBudgets.reduce((total, section) => total + section.supportedBudgetEstimate, 0);
  const centralAnswerSupported = Boolean(
    input.centralAnswer?.supportedAnswer &&
    input.centralAnswer.supportingClaimIds.length > 0 &&
    input.centralAnswer.evidenceIds.length > 0 &&
    input.centralAnswer.sourceIds.length > 0,
  );
  const distributionComplete = sectionBudgets.filter((section) => section.claimCountAvailable > 0).length >= Math.min(5, sectionBudgets.length);
  const ratio = input.requestedCanonicalCjk > 0 ? estimatedSupportedCanonicalCjk / input.requestedCanonicalCjk : 0;
  const evidenceFamiliesComplete =
    primaryFindings > 0 &&
    methodologicalClaims > 0 &&
    limitationClaims > 0 &&
    validSynthesis.length > 0 &&
    sourceDiversity > 1;
  const longReportCapacitySatisfied =
    estimatedSupportedCanonicalCjk >= MIN_LONG_REPORT_SUPPORTED_CANONICAL_CJK &&
    ratio >= MIN_LONG_REPORT_SUPPORTED_RATIO;
  const status: LongReportFeasibilityStatus =
    centralAnswerSupported && evidenceFamiliesComplete && distributionComplete && longReportCapacitySatisfied
      ? "ready_long_report"
      : centralAnswerSupported && distributionComplete && ratio >= 0.55
        ? "ready_medium_report"
        : centralAnswerSupported && estimatedSupportedCanonicalCjk > 0
          ? "ready_limited_report"
          : "insufficient_evidence";
  const recommendedTier: ReportLengthTier = status === "ready_long_report"
    ? "long_research_report"
    : status === "ready_medium_report"
      ? "standard_research_report"
      : "limited_evidence_brief";
  const reasons = unique([
    !longReportCapacitySatisfied ? "estimated_supported_canonical_cjk_below_long_request" : "",
    sourceDiversity <= 1 ? "multi_source_diversity_missing" : "",
    primaryFindings === 0 ? "primary_findings_missing" : "",
    methodologicalClaims === 0 ? "methodological_evidence_missing" : "",
    limitationClaims === 0 ? "limitation_evidence_missing" : "",
    validSynthesis.length === 0 ? "validated_synthesis_opportunities_missing" : "",
    !distributionComplete ? "required_section_evidence_distribution_incomplete" : "",
    !centralAnswerSupported ? "central_answer_support_incomplete" : "",
  ]);
  return {
    status,
    recommendedTier,
    estimatedSupportedCanonicalCjk,
    requestedCanonicalCjk: input.requestedCanonicalCjk,
    sourceDiversity,
    uniqueAtomicClaims: uniqueClaims.length,
    primaryFindings,
    validatedSynthesisClaims: validSynthesis.length,
    quantitativeClaims,
    methodologicalClaims,
    limitationClaims,
    centralAnswerSupported,
    sectionBudgets,
    reasons,
  };
}

import type {
  ArgumentMap,
  CrossSourceClaimGraph,
  DiscourseSection,
  NarrativePassPlan,
  NormalizedEvidenceFunction,
  NormalizedFact,
  NormalizedWriterEvidence,
  SynthesisCluster,
} from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import { evidenceAccessTierForFact } from "./reportIntelligence.ts";
import { parseAtomicNumericalResults } from "./standardizedEvidenceFacts.ts";
import {
  containsRawEnglishEvidenceText,
  UNTRANSLATED_EVIDENCE_NOTICE,
  verifiedZhTwReportText,
} from "./zhTwReportText.ts";

export const ZH_TW_REPORT_TERMINOLOGY: Readonly<Record<string, string>> = {
  "retrieval-augmented generation": "檢索增強生成（retrieval-augmented generation, RAG）",
  "citation faithfulness": "引用忠實度（citation faithfulness）",
  "urban heat island": "都市熱島（urban heat island, UHI）",
  "green roof": "綠屋頂（green roof）",
  "vertical greening": "垂直綠化（vertical greening）",
  evidence: "證據",
  data: "資料",
  information: "資訊",
  software: "軟體",
  video: "影片",
};

const INTERNAL_ARTIFACT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Evidence Card", /\bevidence\s*cards?\b|證據卡/iu],
  ["supportSpan", /\bsupport\s*spans?\b|\bsupportSpan\b/iu],
  ["canonicalSourceId", /\bcanonicalSourceId\b/iu],
  ["evidence_id", /\bevidence_id\b/iu],
  ["writer diagnostics", /\bwriter\s+diagnostics?\b/iu],
  ["internal marker", /\[\[(?:EVIDENCE|CLAIM|SOURCE|CITATION)[^\]]*\]\]/iu],
  ["normalization status", /\bUNRESOLVED_NORMALIZATION\b/iu],
  ["非實質性繁中摘要佔位字", /(?:尚未完成繁中摘要|英文摘要請展開詳情查看|以下顯示原文摘要)/u],
  ["system prompt", /\b(?:system|developer)\s+(?:prompt|message)\b/iu],
  ["generation trace", /以下根據提供的證據卡|(?:作為|身為)AI|我是(?:一個)?(?:AI|語言模型)|無法存取即時資料/iu],
];

const ALLOWED_LATIN_TOKEN_PATTERN = /^(?:[A-Z][A-Z0-9.-]{1,12}|DOI|URL|et\s+al\.?|ENVI-met)$/u;

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function evidenceId(card: EvidenceCard): string {
  return clean(card.evidenceId ?? card.evidenceCardId ?? card.id);
}

function sourceId(card: EvidenceCard): string {
  return clean(card.canonicalSourceKey ?? card.dedupeKey ?? card.sourceId);
}

function citationMarker(card: EvidenceCard): string {
  return clean(card.citationMarker) || clean(card.citationText.match(/[\[［]\s*[SＳ]\d+\s*[\]］]/u)?.[0]);
}

function sourceLanguage(card: EvidenceCard): string {
  const original = clean(
    card.sourceExcerptOriginal || card.supportSpan || card.supportedByText || card.abstract,
  );
  if (!original) return "unknown";
  const han = original.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const latin = original.match(/[A-Za-z][A-Za-z'-]*/gu)?.length ?? 0;
  if (han > 0 && latin > 4) return "mixed";
  if (han > 0) return "zh";
  if (latin > 0) return "en";
  return "unknown";
}

function normalizedClaim(card: EvidenceCard): string {
  const value = verifiedZhTwReportText(
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.claimTextZh,
    card.usableEvidence,
    card.mainClaim,
    card.claim,
    card.summary,
  );
  if (!value || value.includes(UNTRANSLATED_EVIDENCE_NOTICE)) return "";
  return value;
}

function isScopingReviewCorpus(text: string): boolean {
  return /(?:scoping review|範疇性回顧)/iu.test(text) &&
    /(?:(?:found|included|identified|reviewed|納入|辨識|檢索到)\s*[\d,]+\s*(?:篇|份)?\s*(?:reports?|stud(?:y|ies)|articles?|papers?|報告|研究|文獻)|[\d,]+\s*(?:篇|份)\s*(?:報告|研究|文獻))/iu.test(text);
}

function evidenceFunction(card: EvidenceCard): NormalizedEvidenceFunction {
  // A substantive result can (and normally should) carry its own limitations.
  // Classifying from the limitations array made every well-qualified finding a
  // limitation-only card and collapsed otherwise complete reports into
  // "insufficient evidence" conclusions.  The evidence function therefore
  // comes from the card's declared role, not from its attached caveats.
  const declaredRole = `${card.evidenceType ?? ""} ${card.relevance ?? ""}`
    .toLocaleLowerCase();
  const sectionType = factSectionType(card);
  if (sectionType === "discussion" || sectionType === "mechanism_interpretation") {
    return "background";
  }
  if (sectionType === "limitations") return "limitation";
  if (sectionType === "study_design" || sectionType === "statistical_methods") return "method";
  const sourceResult = atomicSourceText(card);
  // A scoping-review corpus count describes the review's document set, not a
  // participant-level result for the report population. Keep that evidence as
  // context even when its abstract mentions an associated outcome.
  if (isScopingReviewCorpus(sourceResult)) return "background";
  if (
    /(?:\bResults?\b|結果(?:顯示|指出|為)|發現|顯著|associated|correlat|predict|\b(?:OR|RR|HR|r)\s*[=:]|%|％)/iu.test(sourceResult) &&
    !/(?:scoping review|範疇性回顧|未(?:專門)?(?:聚焦|測量|報告)|no (?:short-form-video-specific|sleep) estimate)/iu.test(sourceResult)
  ) {
    return "support";
  }
  if (/矛盾|相反|不一致|contrast|conflict|null result|no association/u.test(declaredRole)) return "contrast";
  if (/^\s*(?:(?:限制|缺口)(?:\s|$)|(?:limitation|evidence_gap|uncertainty)\b)/u.test(declaredRole)) return "limitation";
  if (/定義|definition|terminology/u.test(declaredRole)) return "definition";
  if (/方法|method|dataset|sample|measurement/u.test(declaredRole)) return "method";
  if (/背景|background|introduction/u.test(declaredRole)) return "background";
  return normalizedClaim(card) ? "support" : "unresolved";
}

function semanticKey(value: string): string {
  return clean(value)
    .replace(/台灣/gu, "臺灣")
    .toLocaleLowerCase("zh-TW")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 56) || "unknown";
}

function cardSemanticText(card: EvidenceCard): string {
  return clean([
    card.exactResult,
    card.supportSpan,
    card.supportedByText,
    card.title,
    card.sourceTitle,
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.researchSetting,
    card.studyDesign,
    card.location,
    card.exposure,
    card.outcome,
    card.dataScope,
  ].filter(Boolean).join(" "));
}

function atomicSourceText(card: EvidenceCard): string {
  return clean([
    card.dataScope,
    card.exactResult,
    card.supportSpan,
    card.supportedByText,
    card.sourceExcerptOriginal,
    card.claimTextZhTw,
  ].filter(Boolean).join(" "));
}

function firstSemanticMatch(
  text: string,
  candidates: ReadonlyArray<readonly [label: string, pattern: RegExp]>,
): string | null {
  return candidates.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function normalizedDimension(
  explicit: string | null | undefined,
  semanticText: string,
  candidates: ReadonlyArray<readonly [label: string, pattern: RegExp]>,
): string | null {
  const explicitValue = clean(explicit);
  return firstSemanticMatch(explicitValue || semanticText, candidates) || explicitValue || null;
}

function factLocation(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.populationLocation) return card.structuredStudyFact.populationLocation;
  return normalizedDimension(card.location, atomicSourceText(card), [
    ["臺灣", /(?:臺灣|台灣|Taiwan)/iu],
    ["臺北", /(?:臺北|台北|Taipei)/iu],
    ["高雄", /(?:高雄|Kaohsiung)/iu],
    ["嘉義", /(?:嘉義|Chiayi)/iu],
    ["Aseer Region, Saudi Arabia", /Aseer Region(?:, Saudi Arabia)?/iu],
    ["Saudi Arabia", /Saudi Arabia|沙烏地阿拉伯/iu],
    ["中國", /\bChina\b|Chinese|中國/iu],
  ]);
}

function factPopulation(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.population) return card.structuredStudyFact.population;
  const sourceText = atomicSourceText(card);
  if (isScopingReviewCorpus(sourceText)) return null;
  const text = sourceText
    .replace(/(?:而非|不是|不含|非|並非|未(?:曾)?(?:專門)?(?:聚焦|測量|報告|提供|包含|納入|涵蓋|針對|以)(?:於|以)?)[^。；;]{0,24}(?:高中生|中學生|青少年|大學生|一般兒少)(?:樣本|分析|估計|資料|證據)?/gu, "")
    .replace(/(?:(?:not|rather than|without|no)|did not (?:specifically )?(?:focus(?:ed)? on|include(?:d)?|provide(?:d)?|report(?:ed)?|target(?:ed)?|measure(?:d)?))\s+(?:specifically\s+)?(?:a\s+)?(?:high[- ]school students?|secondary school students?|adolescents?|college students?|children)(?:\s+(?:sample|analysis|estimate|data|evidence))?/giu, "");
  const populationPhrases: ReadonlyArray<readonly [string, RegExp]> = [
    ["大學生", /(?:研究對象為|樣本為|納入|調查|surveyed|sample(?: included| of)?|participants? included)\s*[\d,]*\s*(?:名|位)?(?:中國)?\s*(?:大學生|大專生|college students?|university students?|undergraduates?)/iu],
    ["高中生", /(?:研究對象為|樣本為|納入|招募|recruited from|surveyed|sample(?: included| of)?|participants? included)\s*[\d,]*\s*(?:名|位|來自)?[^。.;]{0,20}(?:高中生|高級中學(?:學生)?|senior high school students?|high school students?|high schools?)/iu],
    ["中學生", /(?:研究對象為|樣本為|納入|調查|conducted on|surveyed|sample(?: included| of)?)\s*[\d,]*\s*(?:名|位)?[^。.;]{0,12}(?:中學生|中學學生|secondary school students?|middle school students?)/iu],
    ["青少年", /(?:研究對象為|樣本為|納入|招募|recruited(?: from)?|surveyed|sample(?: included| of)?|data collected from)\s*[\d,]*\s*(?:名|位)?[^。.;]{0,12}(?:青少年|adolescents?)/iu],
    ["一般兒少", /(?:研究對象為|樣本為|納入|招募|surveyed|sample(?: included| of)?)\s*[\d,]*\s*(?:名|位)?[^。.;]{0,12}(?:一般兒少|兒童與青少年|兒少|children and adolescents|children|youth)/iu],
  ];
  const anchored = firstSemanticMatch(text, populationPhrases);
  if (anchored) return anchored;
  return firstSemanticMatch(text, [
    ["大學生", /(?:大學生|大專生|college students?|university students?|undergraduates?)/iu],
    ["高中生", /(?:高中生|高級中學(?:學生)?|senior high school students?|high school students?)/iu],
    ["中學生", /(?:中學生|中學學生|secondary school students?|middle school students?)/iu],
    ["青少年", /(?:青少年|adolescents?)/iu],
    ["一般兒少", /(?:一般兒少|兒童與青少年|兒少|children and adolescents|children|youth)/iu],
  ]);
}

function factAgeGroup(card: EvidenceCard): string | null {
  const structured = card.structuredStudyFact;
  if (structured?.populationAgeMin != null || structured?.populationAgeMax != null) {
    return [structured.populationAgeMin, structured.populationAgeMax]
      .filter((value) => value != null).join("–");
  }
  if (structured?.populationAgeMean != null) return `mean ${structured.populationAgeMean}`;
  const text = atomicSourceText(card);
  const explicitRange = text.match(
    /(?:年齡(?:介於|為|範圍)?\s*)?(\d{1,2}\s*(?:至|到|[-–—])\s*\d{1,2}\s*歲)|(?:aged?|ages?)\s*(\d{1,2}\s*(?:to|[-–—])\s*\d{1,2})/iu,
  );
  if (explicitRange) return clean(explicitRange[1] ?? explicitRange[2]);
  return factPopulation(card);
}

function factSampleSize(card: EvidenceCard): number | null {
  if (card.structuredStudyFact?.populationSampleSize != null) {
    return card.structuredStudyFact.populationSampleSize;
  }
  const sourceText = atomicSourceText(card);
  if (isScopingReviewCorpus(sourceText)) return null;
  const text = sourceText.replace(
    /(?:納入|包含|included?|covered?)\s*[\d,]+\s*(?:篇|份)?\s*(?:報告|研究|文獻|reports?|stud(?:y|ies)|articles?|papers?)/giu,
    "",
  );
  if (!text) return null;
  const match = text.match(
    /(?:\bn\s*[=:]\s*([\d,]+)(?!\s*(?:reports?|articles?|stud(?:y|ies)|papers?))|(?:研究對象為|樣本(?:為|含)?|納入|招募|調查|conducted on|surveyed|recruited(?: from)?|sample(?: included| of)?|participants? included|data collected from)\s*([\d,]+)\s*(?:名|位)?(?:中國)?[^\d。.;]{0,32}(?:受試者|參與者|學生|青少年|大學生|高中生|中學生|participants?|students?|adolescents?|college students?|high school students?)|([\d,]+)\s*(?:名|位)?(?:受試者|參與者|學生|青少年|大學生|高中生|中學生|participants?|students?|adolescents?|college students?|high school students?))/iu,
  );
  const value = Number((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").replace(/,/gu, ""));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function factSetting(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.populationSetting) return card.structuredStudyFact.populationSetting;
  return normalizedDimension(card.researchSetting, cardSemanticText(card), [
    ["校園", /(?:校園|學校|大學|campus|school|university)/iu],
    ["都市", /(?:都市|城市|urban|city)/iu],
  ]);
}

function factExposure(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.exposure) return card.structuredStudyFact.exposure;
  return normalizedDimension(card.exposure, cardSemanticText(card), [
    ["短影音成癮", /(?:短影音|短視頻|short[- ]?form video).{0,12}(?:成癮|問題性使用|addiction|problematic use)/iu],
    ["短影音使用時數", /(?:短影音|短視頻|short[- ]?form video).{0,16}(?:使用時數|使用時間|每日時數|duration|screen time|hours?)/iu],
    ["TikTok 使用", /(?:TikTok|抖音).{0,12}(?:使用|時數|成癮|use|duration|addiction)?/iu],
    ["短影音使用", /(?:短影音|短視頻|short[- ]?form videos?|short videos?)/iu],
    ["一般社群媒體使用", /(?:一般社群媒體|社群媒體使用|social media use|social networking sites?)/iu],
    ["綠視率", /(?:綠視率|green view index|\bGVI\b)/iu],
    ["NDVI", /(?:\bNDVI\b|normalized difference vegetation index)/iu],
    ["樹冠覆蓋率", /(?:樹冠覆蓋率|樹冠率|tree canopy cover)/iu],
    ["綠覆率", /(?:綠覆率|green coverage)/iu],
    ["綠地或植被", /(?:綠地|植被|green space|vegetation)/iu],
  ]);
}

function factOutcome(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.outcome) return card.structuredStudyFact.outcome;
  return normalizedDimension(card.outcome, cardSemanticText(card), [
    ["睡眠品質分數", /(?:睡眠品質(?:分數|得分|量表)|sleep quality score|\bPSQI\b)/iu],
    ["睡眠不佳比例", /(?:睡眠不佳(?:比例|盛行率)?|睡眠品質不佳|poor sleep(?: quality)?|sleep disturbance prevalence)/iu],
    ["憂鬱", /(?:憂鬱|抑鬱|depress(?:ion|ive symptoms?))/iu],
    ["幸福感", /(?:幸福感|主觀福祉|well-?being)/iu],
    ["親子關係", /(?:親子關係|parent[- ]child relationship)/iu],
    ["社交焦慮", /(?:社交焦慮|社群焦慮|社會焦慮|social anxiety)/iu],
    ["自我控制", /(?:自我控制|self[- ]control)/iu],
    ["睡眠品質", /(?:睡眠品質|sleep quality)/iu],
    ["地表溫度", /(?:地表溫度|land surface temperature|\bLST\b)/iu],
    ["氣溫", /(?:環境溫度|空氣溫度|氣溫|air temperature)/iu],
    ["熱舒適", /(?:熱舒適|thermal comfort|heat stress)/iu],
    ["都市熱島", /(?:都市熱島|urban heat island|\bUHI\b)/iu],
  ]);
}

function factMethod(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.studyDesign && card.structuredStudyFact.studyDesign !== "unknown") {
    return card.structuredStudyFact.studyDesign;
  }
  return normalizedDimension(card.studyDesign, cardSemanticText(card), [
    ["橫斷式研究", /(?:橫斷(?:式)?|cross[- ]sectional)/iu],
    ["縱貫研究", /(?:縱貫|追蹤研究|longitudinal|cohort)/iu],
    ["系統性回顧", /(?:系統性回顧|systematic review|meta-analysis|統合分析)/iu],
    ["實驗研究", /(?:隨機對照|實驗研究|randomi[sz]ed|experimental study)/iu],
    ["ENVI-met 模擬", /(?:ENVI-?met|數值模擬|simulation|numerical model|scenario)/iu],
    ["遙測或空間觀測", /(?:遙測|衛星|Landsat|remote sensing|street view|街景)/iu],
    ["人本觀測", /(?:問卷|訪談|生理感測|survey|questionnaire|interview|biosensor)/iu],
    ["實地量測", /(?:實地量測|field measurement)/iu],
  ]);
}

function factMeasure(
  explicit: string | null | undefined,
  semanticText: string,
  patterns: RegExp[],
): string | null {
  const explicitValue = clean(explicit);
  const matchText = explicitValue || semanticText;
  if (!patterns.some((pattern) => pattern.test(matchText))) return null;
  return explicitValue || clean(
    matchText.match(/[^。；;]{0,28}(?:量表|分數|得分|時數|時間|比例|盛行率|scale|score|duration|hours?|prevalence)[^。；;]{0,20}/iu)?.[0],
  ) || null;
}

function factExposureMeasure(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.exposureMeasurement) return card.structuredStudyFact.exposureMeasurement;
  const text = atomicSourceText(card);
  return firstSemanticMatch(text, [
    ["大學生短影音成癮量表", /College Student Short[-‐‑–— ]Form Video Addiction Scale|大學生短影音成癮量表/iu],
    ["短影音成癮量表（摘要未列名稱）", /short[-‐‑–— ]form video addiction[^.。]{0,90}(?:corresponding scales?|相應量表)/iu],
    ["社群媒體使用時數", /hours spent on social media|社群媒體使用時數/iu],
    ["短影音使用時數", /hours spent on short[-‐‑–— ]form video|短影音使用時數/iu],
    ["TikTok 是否使用", /TikTok use|TikTok 使用/iu],
    ["短影音成癮量表", /short[-‐‑–— ]form video addiction scale|短影音成癮量表/iu],
  ]) ?? factMeasure(card.exposure, clean(card.exposure), [
    /(?:量表|分數|得分|時數|時間|duration|hours?|screen time|scale|score)/iu,
  ]);
}

function factOutcomeMeasure(card: EvidenceCard): string | null {
  if (card.structuredStudyFact?.outcomeMeasurement) return card.structuredStudyFact.outcomeMeasurement;
  const text = atomicSourceText(card);
  return firstSemanticMatch(text, [
    ["匹茲堡睡眠品質指數（PSQI）", /Pittsburgh Sleep Quality Index|\bPSQI\b/iu],
    ["睡眠品質異常檢出率", /detection rate of sleep quality|睡眠品質(?:異常)?檢出率/iu],
    ["睡眠不佳比例", /poor sleepers?|睡眠不佳(?:比例|盛行率)?/iu],
    ["睡眠品質分數", /sleep quality score|睡眠品質(?:分數|得分)/iu],
    ["DASS-21", /depression, anxiety and stress scale|\bDASS-?21\b/iu],
    ["互動焦慮量表", /Interaction Anxiousness Scale|互動焦慮量表/iu],
    ["簡式自我控制量表", /Brief Self-Control Scale|簡式自我控制量表/iu],
  ]) ?? factMeasure(card.outcome, clean(card.outcome), [
    /(?:量表|分數|得分|比例|盛行率|scale|score|prevalence|\bPSQI\b)/iu,
  ]);
}

function factSourceSpan(card: EvidenceCard): string | null {
  return clean(card.sourceExcerptOriginal || card.supportSpan || card.supportedByText) || null;
}

function factMediator(card: EvidenceCard): string | null {
  const explicitMediator = card.structuredStudyFact?.mediators[0];
  if (explicitMediator) return explicitMediator.factor;
  const text = clean(`${normalizedClaim(card)} ${card.exactResult ?? ""}`);
  const clauses = text.split(/(?<=[。！？.!?；;])\s*/u).map(clean).filter(Boolean);
  const mediatorTerms: ReadonlyArray<readonly [string, string]> = [
    ["社交焦慮", "(?:社交焦慮|社會焦慮|social anxiety)"],
    ["自我控制", "(?:自我控制|self[- ]control)"],
    ["需求滿足", "(?:需求滿足|need gratification)"],
    ["短影音成癮", "(?:短影音成癮|short[-‐‑–— ]form video addiction|SFV addiction)"],
  ];
  const mediationSyntax = /(?:中介(?:作用|效果|變項|因素|路徑)|mediating (?:role|effect|mechanism)s?|served as a mediator|mediat(?:e|ed|es|ion|or)|indirect effect)/iu;

  for (const clause of clauses) {
    if (!mediationSyntax.test(clause)) continue;
    for (const [label, term] of mediatorTerms) {
      const governedByMediation = new RegExp(
        `(?:mediating (?:role|effect|mechanism)s? of|indirect effect(?: exerted)? through|mediated (?:through|by)|through|via|經由|透過|由)\\s*(?:higher|lower|較高|較低)?\\s*${term}`,
        "iu",
      );
      if (governedByMediation.test(clause)) return label;
    }
    for (const [label, term] of mediatorTerms) {
      const governsMediation = new RegExp(
        `${term}(?:的)?[^。！？.!?；;]{0,32}?(?:partially\\s+|fully\\s+|部分|完全)?(?:mediat(?:e|ed|es)|served as a mediator|作為[^。！？.!?；;]{0,8}中介|中介(?:作用|效果|變項|因素|路徑))`,
        "iu",
      );
      if (governsMediation.test(clause)) return label;
    }
  }
  return null;
}

function resultCarriesMediation(
  result: NormalizedFact["numericalResults"][number] | null,
): boolean {
  return Boolean(
    result && (
      result.statisticType === "direct_effect" ||
      result.statisticType === "indirect_effect" ||
      /中介|mediation/u.test(result.measure ?? "") ||
      /→/u.test(result.comparisonBasis ?? "")
    )
  );
}

function atomicFactStatement(input: {
  population: string | null;
  exposure: string | null;
  outcome: string | null;
  result: NormalizedFact["numericalResults"][number] | null;
  direction: NormalizedFact["associationDirection"];
  mediator: string | null;
}): string {
  const scope = input.population ? `在${input.population}樣本中，` : "";
  const basis = normalizedBasis(input.result?.comparisonBasis);
  if (input.result?.value != null || input.result?.lowerCI != null || input.result?.upperCI != null) {
    const statistic = input.result.statisticType === "odds_ratio"
      ? `${basis || input.exposure || "暴露"}對${input.outcome || "結果"}的 OR 為 ${input.result.value}（95% CI ${input.result.lowerCI}–${input.result.upperCI}）`
      : input.result.statisticType === "correlation_coefficient"
        ? `${basis || "變項間相關"}的 r = ${input.result.value}`
        : input.result.statisticType === "direct_effect"
          ? `直接效果係數為 ${input.result.value}`
          : input.result.statisticType === "indirect_effect"
            ? `間接效果係數為 ${input.result.value}`
            : input.result.statisticType === "p_value"
              ? `${basis || "統計檢定"}為 ${input.result.rawText}`
              : `${basis || readerMetric(input.result.measure) || input.outcome || input.exposure || "報告值"}為 ${input.result.value}${input.result.unit === "points" ? " 分" : input.result.unit ?? ""}`;
    return `${scope}${statistic}。`;
  }
  if (input.mediator) {
    const pathway = input.exposure && input.outcome &&
      semanticKey(input.mediator) !== semanticKey(input.exposure) &&
      semanticKey(input.mediator) !== semanticKey(input.outcome)
      ? `${input.exposure}與${input.outcome}之間`
      : "研究所述前因與後果之間";
    return `${scope}${input.mediator}被報告為${pathway}的中介變項；研究設計不足以證明因果路徑。`;
  }
  if (input.exposure && input.outcome) {
    const direction = input.direction === "positive"
      ? "呈正向關聯"
      : input.direction === "negative"
        ? "呈反向關聯"
        : input.direction === "null"
          ? "未見明確關聯"
          : "關係方向未能由現有資料確定";
    return `${scope}${input.exposure}與${input.outcome}${direction}。`;
  }
  return `${scope}此原子事實僅能支持其明示的研究範圍與限制。`;
}

function factAdjustmentStatus(card: EvidenceCard): string | null {
  const explicitAdjustment = card.structuredStudyFact?.adjustedOrUnadjusted;
  if (explicitAdjustment && explicitAdjustment !== "unknown") return explicitAdjustment;
  const text = clean(`${card.exactResult ?? ""} ${normalizedClaim(card)}`);
  if (/(?:未校正|未調整|unadjusted|crude estimate)/iu.test(text)) return "unadjusted";
  if (/(?:校正後|調整後|多變項調整|adjusted|multivariable)/iu.test(text)) return "adjusted";
  return null;
}

function explicitEvidenceTheme(card: EvidenceCard): string | null {
  const explicit = clean(card.evidenceType);
  return explicit && !/^(?:finding|findings|support|result|results|general)$/iu.test(explicit)
    ? `evidence:${semanticKey(explicit)}`
    : null;
}

function topicCluster(card: EvidenceCard): string {
  const exposure = factExposure(card);
  const outcome = factOutcome(card);
  if (exposure && outcome) {
    return `relationship:${semanticKey(exposure)}:${semanticKey(outcome)}`;
  }
  const explicit = explicitEvidenceTheme(card);
  if (explicit) return explicit;
  if (outcome) return `outcome:${semanticKey(outcome)}`;
  if (exposure) return `exposure:${semanticKey(exposure)}`;
  const setting = factSetting(card);
  if (setting) return `setting:${semanticKey(setting)}`;
  const method = factMethod(card);
  if (method) return `method:${semanticKey(method)}`;
  const location = factLocation(card);
  if (location) return `geography:${semanticKey(location)}`;
  const targets = unique(card.sectionTargets);
  if (targets.some((value) => /method/u.test(value))) return "methods";
  if (targets.some((value) => /finding|data/u.test(value))) return "findings";
  if (targets.some((value) => /discussion|conclusion/u.test(value))) return "interpretation";
  if (targets.some((value) => /background|introduction|literature/u.test(value))) return "context";
  return "general_evidence";
}

function conceptAxesForCard(card: EvidenceCard): string[] {
  const axes = [
    factExposure(card) ? `exposure:${semanticKey(factExposure(card)!)}` : null,
    factOutcome(card) ? `outcome:${semanticKey(factOutcome(card)!)}` : null,
    factSetting(card) ? `setting:${semanticKey(factSetting(card)!)}` : null,
    factMethod(card) ? `method:${semanticKey(factMethod(card)!)}` : null,
    factLocation(card) ? `geography:${semanticKey(factLocation(card)!)}` : null,
    explicitEvidenceTheme(card),
  ];
  return unique([...axes, topicCluster(card)]);
}

function topicClusterLabel(cluster: string): string {
  const labels: Record<string, string> = {
    geography_taiwan: "臺灣場域的直接或近直接證據",
    setting_campus: "校園場域的鄰近證據",
    method_simulation: "情境模擬與介入證據",
    method_human_observation: "人本觀測與感受證據",
    method_spatial_observation: "空間觀測與遙測證據",
    methods: "研究方法",
    findings: "主要結果",
    interpretation: "結果解讀",
    context: "研究背景",
    general_evidence: "綜合實證",
  };
  if (cluster.startsWith("relationship:")) return "暴露、介入與結果之間的關聯證據";
  if (cluster.startsWith("outcome:")) return "共同結果指標的證據";
  if (cluster.startsWith("exposure:")) return "共同暴露或介入構面的證據";
  if (cluster.startsWith("setting:")) return "共同研究場域的證據";
  if (cluster.startsWith("method:")) return "共同研究方法的證據";
  if (cluster.startsWith("geography:")) return "共同地理範圍的證據";
  if (cluster.startsWith("evidence:")) return `${cluster.slice("evidence:".length).replace(/_/gu, " ")}證據`;
  return labels[cluster] ?? cluster.replace(/_/gu, " ");
}

function scope(card: EvidenceCard): string {
  if (card.derivation === "fulltext-derived" && !card.abstractOnly) return "全文可核對範圍";
  if (card.derivation === "abstract-derived" || card.abstractOnly) return "摘要揭露範圍";
  return "書目或有限片段範圍";
}

function allowedUses(card: EvidenceCard, fn: NormalizedEvidenceFunction): NormalizedEvidenceFunction[] {
  if (fn === "unresolved") return ["unresolved"];
  const uses = new Set<NormalizedEvidenceFunction>([fn]);
  if (card.sourceRole === "background_definition") uses.add("background");
  if (card.sectionTargets.some((section) => /method/u.test(section))) uses.add("method");
  return [...uses].sort();
}

/**
 * Produces the only evidence projection that may be handed to the prose writer.
 * originalSpan remains available for audit but writerEligible is false until a
 * real Traditional-Chinese claim exists; raw abstracts never become prose input.
 */
export function normalizeEvidenceForWriter(cards: EvidenceCard[]): NormalizedWriterEvidence[] {
  return [...cards]
    .sort((left, right) =>
      sourceId(left).localeCompare(sourceId(right)) ||
      evidenceId(left).localeCompare(evidenceId(right)),
    )
    .map((card) => {
      const claim = normalizedClaim(card);
      const fn = evidenceFunction(card);
      const marker = citationMarker(card);
      const canonicalSourceId = sourceId(card);
      const id = evidenceId(card);
      const originalSpan = clean(
        card.sourceExcerptOriginal || card.supportSpan || card.supportedByText || card.abstract,
      );
      const writerEligible = Boolean(
        claim &&
        id &&
        canonicalSourceId &&
        marker &&
        fn !== "unresolved" &&
        !containsRawEnglishEvidenceText(claim),
      );
      return {
        evidenceId: id,
        canonicalSourceId,
        sourceLanguage: sourceLanguage(card),
        originalSpan,
        normalizedClaimZhTw: claim || "尚無可安全用於正文的繁體中文主張。",
        evidenceType: clean(card.evidenceType) || fn,
        topicCluster: topicCluster(card),
        stance:
          fn === "contrast"
            ? "contrasts"
            : fn === "limitation"
              ? "limits"
              : fn === "unresolved"
                ? "unresolved"
                : fn === "support"
                  ? "supports"
                  : "neutral",
        scope: scope(card),
        confidence: Math.max(0, Math.min(1, card.confidenceScore ?? 0)),
        allowedUses: allowedUses(card, fn),
        canonicalCitationMarker: marker || "UNRESOLVED_CITATION",
        writerEligible,
      } satisfies NormalizedWriterEvidence;
    });
}

function factLimitations(card: EvidenceCard): string[] {
  return unique([
    ...(card.limitationsZhTw ?? []),
    ...(card.limitations ?? []),
    card.limitation,
  ]);
}

function associationDirection(
  card: EvidenceCard,
  fn: NormalizedEvidenceFunction,
): NormalizedFact["associationDirection"] {
  const structuredDirection = card.structuredStudyFact?.effectDirection;
  if (structuredDirection && structuredDirection !== "unclear") return structuredDirection;
  const text = `${normalizedClaim(card)} ${card.relevance ?? ""}`.toLocaleLowerCase();
  if (/不一致|方向不同|混合結果|mixed|heterogeneous|conflict/u.test(text)) return "mixed";
  if (/無顯著|未發現.{0,8}關聯|沒有.{0,8}關聯|no association|not significant|null result/u.test(text)) {
    return "null";
  }
  if (/負相關|反向關聯|反比|較低|降低|下降|減少|negative association|inverse association/u.test(text)) {
    return "negative";
  }
  if (/正相關|正向關聯|同向關聯|較高|增加|上升|改善|positive association/u.test(text)) {
    return "positive";
  }
  if (fn === "background" || fn === "definition" || fn === "method" || fn === "limitation") {
    return "not_applicable";
  }
  return "unclear";
}

function numericalResultsForCard(card: EvidenceCard): NormalizedFact["numericalResults"] {
  const structured = card.structuredStudyFact?.quantitativeFacts ?? [];
  if (structured.length > 0) {
    return structured.map((fact) => ({
      rawText: fact.rawValue,
      measure: fact.metric,
      resultRole: fact.metric === "sample_size" ? "baseline" : "outcome",
      value: fact.value,
      unit: fact.unit,
      statisticType: fact.metric,
      comparisonBasis: fact.comparison,
      lowerCI: fact.ciLower,
      upperCI: fact.ciUpper,
      pValue: fact.pValue ? Number(fact.pValue.replace(/[^\d.]+/gu, "")) || null : null,
      uncertainty: fact.ciLower != null && fact.ciUpper != null
        ? `${fact.ciLower}–${fact.ciUpper}`
        : null,
    }));
  }
  return parseAtomicNumericalResults(card);
}

function atomicEvidenceMetadata(card: EvidenceCard): Record<string, unknown> | null {
  const atomic = card.sourceMetadata?.atomicEvidence;
  return atomic && typeof atomic === "object" ? atomic as Record<string, unknown> : null;
}

function factSectionType(card: EvidenceCard): NormalizedFact["sectionType"] {
  const resolved = atomicEvidenceMetadata(card)?.sectionType;
  if (typeof resolved === "string" && [
    "abstract", "background", "research_question", "sample_and_setting", "eligibility",
    "study_design", "exposure", "outcome", "measurement", "statistical_methods",
    "primary_results", "secondary_results", "sensitivity_analysis", "discussion",
    "mechanism_interpretation", "limitations", "conclusion", "unknown",
  ].includes(resolved)) {
    return resolved as NormalizedFact["sectionType"];
  }
  // A card's evidence role (for example, "mechanism") is not the same as the
  // section where the source actually stated it. Only resolver metadata or an
  // explicit source heading/location may assign a semantic source section.
  const value = clean(`${card.sectionHeading ?? ""} ${card.sourceLocation ?? ""}`)
    .toLocaleLowerCase("zh-TW");
  if (!value) return card.derivation === "abstract-derived" ? "abstract" : "unknown";
  if (/abstract|摘要/iu.test(value)) return "abstract";
  if (/background|introduction|背景|引言/iu.test(value)) return "background";
  if (/research question|hypoth|研究問題|假設/iu.test(value)) return "research_question";
  if (/sample|participant|setting|樣本|參與者|場域/iu.test(value)) return "sample_and_setting";
  if (/eligib|inclusion|exclusion|納入|排除/iu.test(value)) return "eligibility";
  if (/statistical (?:analysis|method)|statistics|統計方法|分析方法/iu.test(value)) return "statistical_methods";
  if (/method|design|方法|設計/iu.test(value)) return "study_design";
  if (/exposure|暴露變項/iu.test(value)) return "exposure";
  if (/outcome|結果變項/iu.test(value)) return "outcome";
  if (/measure|instrument|scale|量表|工具|測量/iu.test(value)) return "measurement";
  if (/sensitivity|敏感度/iu.test(value)) return "sensitivity_analysis";
  if (/secondary result|次要結果/iu.test(value)) return "secondary_results";
  if (/result|finding|主要結果|結果/iu.test(value)) return "primary_results";
  if (/limitation|限制/iu.test(value)) return "limitations";
  if (/mechanism|機制/iu.test(value)) return "mechanism_interpretation";
  if (/discussion|討論/iu.test(value)) return "discussion";
  if (/conclusion|結論/iu.test(value)) return "conclusion";
  return "unknown";
}

function factEvidenceLevel(
  card: EvidenceCard,
  fn: NormalizedEvidenceFunction,
): NormalizedFact["evidenceLevel"] {
  if (card.derivation === "metadata-derived") return "bibliographic";
  if (fn === "background" || fn === "definition" || fn === "method") return "background";
  if (card.evidenceDirectnessTier === "A") return "direct";
  if (card.evidenceDirectnessTier === "B") return "near_direct";
  if (card.evidenceDirectnessTier === "D") return "bibliographic";
  return "background";
}

function factComparabilityKey(card: EvidenceCard): string {
  const numericalResults = numericalResultsForCard(card);
  const numericalUnits = numericalResults
    .map((result) => result.unit)
    .filter((value): value is string => Boolean(value));
  return [
    `population=${semanticKey(factPopulation(card) ?? "unspecified")}`,
    `exposure=${semanticKey(factExposure(card) ?? "unspecified")}`,
    `exposure_measure=${semanticKey(factExposureMeasure(card) ?? "unspecified")}`,
    `outcome=${semanticKey(factOutcome(card) ?? "unspecified")}`,
    `outcome_measure=${semanticKey(factOutcomeMeasure(card) ?? "unspecified")}`,
    `method=${semanticKey(factMethod(card) ?? "unspecified")}`,
    `statistic=${unique(numericalResults.map((result) => result.statisticType)).map(semanticKey).join("+") || "unspecified"}`,
    `unit=${unique(numericalUnits).map(semanticKey).join("+") || "unspecified"}`,
  ].join("|");
}

type AtomicNumericalResult = NormalizedFact["numericalResults"][number];

function normalizedBasis(value: string | null | undefined): string {
  return clean(value)
    .replace(/Tiktok/giu, "TikTok")
    .replace(/^TikTok\s+use$/iu, "TikTok 使用")
    .replace(/^hours? spent on social media$/iu, "社群媒體使用時數")
    .replace(/^having moderate to severe depressive symptoms$/iu, "中重度憂鬱症狀");
}

function readerMetric(value: string | null | undefined): string {
  const metric = clean(value);
  const labels: Record<string, string> = {
    sleep_quality_score: "睡眠品質分數",
    sleep_quality_detection_rate: "睡眠品質異常檢出率",
    poor_sleep_prevalence: "睡眠不佳比例",
    mediation_effect_share: "中介效果占比",
    correlation_structure: "相關結構",
    sample_sex_composition: "樣本性別組成",
    media_use_prevalence: "媒體使用比例",
  };
  return labels[metric] ?? metric;
}

function correlationConcepts(basis: string): [string | null, string | null] {
  const concepts = basis.split(/\s*[—–]\s*/u).map(clean).filter(Boolean);
  return [concepts[0] ?? null, concepts[1] ?? null];
}

function atomicDimensions(
  card: EvidenceCard,
  result: AtomicNumericalResult | null,
): {
  exposure: string | null;
  outcome: string | null;
  exposureMeasure: string | null;
  outcomeMeasure: string | null;
} {
  const baseExposure = factExposure(card);
  const baseOutcome = factOutcome(card);
  if (!result) {
    return {
      exposure: baseExposure,
      outcome: baseOutcome,
      exposureMeasure: factExposureMeasure(card),
      outcomeMeasure: factOutcomeMeasure(card),
    };
  }
  const basis = normalizedBasis(result.comparisonBasis);
  const role = result.resultRole;
  if (role === "baseline") {
    return { exposure: null, outcome: null, exposureMeasure: null, outcomeMeasure: null };
  }
  if (role === "exposure") {
    return {
      exposure: basis.replace(/使用比例$/u, "使用") || baseExposure,
      outcome: null,
      exposureMeasure: basis || result.measure || null,
      outcomeMeasure: null,
    };
  }
  if (result.statisticType === "odds_ratio") {
    const exposure = /TikTok/iu.test(basis)
      ? "TikTok 使用"
      : /hours? spent on social media|社群媒體使用時數/iu.test(basis)
        ? "一般社群媒體使用時數"
        : /depress|憂鬱/iu.test(basis)
          ? "中重度憂鬱症狀"
          : baseExposure;
    return {
      exposure,
      outcome: /poor sleep|睡眠不佳/iu.test(`${basis} ${atomicSourceText(card)}`)
        ? "睡眠不佳"
        : baseOutcome,
      exposureMeasure: basis || null,
      outcomeMeasure: "睡眠不佳勝算",
    };
  }
  if (result.statisticType === "correlation_coefficient") {
    const [left, right] = correlationConcepts(basis);
    return {
      exposure: left || baseExposure,
      outcome: right || baseOutcome,
      exposureMeasure: left ? `${left}量表` : factExposureMeasure(card),
      outcomeMeasure: "相關係數（r）",
    };
  }
  if (["direct_effect", "indirect_effect", "effect_share"].includes(result.statisticType ?? "")) {
    return {
      exposure: "短影音成癮",
      outcome: "睡眠品質",
      exposureMeasure: factExposureMeasure(card),
      outcomeMeasure: result.statisticType === "effect_share" ? "中介效果占比" : "路徑係數",
    };
  }
  if (result.statisticType === "prevalence" && /睡眠/u.test(basis || result.measure || "")) {
    return {
      exposure: baseExposure,
      outcome: "睡眠不佳比例",
      exposureMeasure: factExposureMeasure(card),
      outcomeMeasure: readerMetric(result.measure) || "睡眠不佳比例",
    };
  }
  return {
    exposure: baseExposure,
    outcome: baseOutcome,
    exposureMeasure: factExposureMeasure(card),
    outcomeMeasure: result.measure && !/^(?:reported_measure|model_fit)$/u.test(result.measure)
      ? readerMetric(result.measure)
      : factOutcomeMeasure(card),
  };
}

function atomicEvidenceFunction(
  declared: NormalizedEvidenceFunction,
  result: AtomicNumericalResult | null,
): NormalizedEvidenceFunction {
  if (result?.resultRole === "baseline" || result?.resultRole === "exposure") return "background";
  return declared;
}

function atomicAssociationDirection(
  declared: NormalizedFact["associationDirection"],
  fn: NormalizedEvidenceFunction,
  result: AtomicNumericalResult | null,
): NormalizedFact["associationDirection"] {
  if (fn === "background" || fn === "definition" || fn === "method") return "not_applicable";
  if (!result) return declared;
  if (["prevalence", "sample_composition", "exposure_prevalence", "mean_with_sd", "effect_share"].includes(result.statisticType ?? "")) {
    return "not_applicable";
  }
  if (["odds_ratio", "correlation_coefficient", "direct_effect", "indirect_effect"].includes(result.statisticType ?? "") && result.value != null) {
    if (result.statisticType === "odds_ratio") return result.value > 1 ? "positive" : result.value < 1 ? "negative" : "null";
    return result.value > 0 ? "positive" : result.value < 0 ? "negative" : "null";
  }
  return declared;
}

function atomicThemeKey(input: {
  exposure: string | null;
  outcome: string | null;
  result: AtomicNumericalResult | null;
  fn: NormalizedEvidenceFunction;
  fallback: string;
}): string {
  if (input.exposure && input.outcome) {
    return `relationship:${semanticKey(input.exposure)}:${semanticKey(input.outcome)}`;
  }
  const basis = normalizedBasis(input.result?.comparisonBasis);
  if (input.fn === "background") return `background:${semanticKey(basis || input.result?.measure || input.fallback)}`;
  if (input.outcome) return `outcome:${semanticKey(input.outcome)}`;
  if (input.exposure) return `exposure:${semanticKey(input.exposure)}`;
  return input.fallback;
}

function atomicConceptAxes(input: {
  card: EvidenceCard;
  exposure: string | null;
  outcome: string | null;
  themeKey: string;
}): string[] {
  return unique([
    input.exposure ? `exposure:${semanticKey(input.exposure)}` : null,
    input.outcome ? `outcome:${semanticKey(input.outcome)}` : null,
    factSetting(input.card) ? `setting:${semanticKey(factSetting(input.card)!)}` : null,
    factMethod(input.card) ? `method:${semanticKey(factMethod(input.card)!)}` : null,
    factLocation(input.card) ? `geography:${semanticKey(factLocation(input.card)!)}` : null,
    input.themeKey,
  ]);
}

function atomicComparabilityKey(input: {
  card: EvidenceCard;
  population: string | null;
  exposure: string | null;
  exposureMeasure: string | null;
  outcome: string | null;
  outcomeMeasure: string | null;
  result: AtomicNumericalResult | null;
}): string {
  return [
    `population=${semanticKey(input.population ?? "unspecified")}`,
    `exposure=${semanticKey(input.exposure ?? "unspecified")}`,
    `exposure_measure=${semanticKey(input.exposureMeasure ?? "unspecified")}`,
    `outcome=${semanticKey(input.outcome ?? "unspecified")}`,
    `outcome_measure=${semanticKey(input.outcomeMeasure ?? "unspecified")}`,
    `method=${semanticKey(factMethod(input.card) ?? "unspecified")}`,
    `statistic=${semanticKey(input.result?.statisticType ?? "unspecified")}`,
    `unit=${semanticKey(input.result?.unit ?? "unspecified")}`,
    `basis=${semanticKey(normalizedBasis(input.result?.comparisonBasis) || "unspecified")}`,
  ].join("|");
}

/**
 * Builds one atomic, traceable fact per independently reported numerical
 * result. Qualitative cards yield one fact. This is deliberately independent
 * of source order so the same atomic ids can drive the claim graph and visuals.
 */
export function normalizeFactsForWriter(
  cards: EvidenceCard[],
  normalizedEvidence = normalizeEvidenceForWriter(cards),
): NormalizedFact[] {
  const evidenceById = new Map(
    normalizedEvidence.map((item) => [item.evidenceId, item] as const),
  );
  return cards
    .flatMap((card): NormalizedFact[] => {
      const id = evidenceId(card);
      const source = sourceId(card);
      const normalized = evidenceById.get(id);
      const declaredFunction = evidenceFunction(card);
      const limits = factLimitations(card);
      const themeKey = topicCluster(card);
      const numericalResults = numericalResultsForCard(card);
      const direction = associationDirection(card, declaredFunction);
      const parentFactId = `fact-${stableHash([
          id,
          source,
          themeKey,
          factComparabilityKey(card),
        ].join("|"))}`;
      const atomicResults = numericalResults.length > 0
        ? numericalResults.map((result, resultIndex) => ({ result, resultIndex }))
        : [{ result: null, resultIndex: null }];
      return atomicResults.map(({ result, resultIndex }): NormalizedFact => {
        const population = factPopulation(card);
        const dimensions = atomicDimensions(card, result);
        const { exposure, outcome, exposureMeasure, outcomeMeasure } = dimensions;
        const fn = atomicEvidenceFunction(declaredFunction, result);
        const sectionType = factSectionType(card);
        const sourceSpan = factSourceSpan(card);
        const resolvedAtomicMetadata = atomicEvidenceMetadata(card);
        const resolvedAccessTier = resolvedAtomicMetadata?.accessTier;
        const resolvedVerificationStatus = resolvedAtomicMetadata?.verificationStatus;
        const extractionConfidence = typeof card.groundingConfidence === "number" && Number.isFinite(card.groundingConfidence)
          ? card.groundingConfidence
          : typeof card.confidenceScore === "number" && Number.isFinite(card.confidenceScore)
            ? card.confidenceScore
            : null;
        const atomicDirection = atomicAssociationDirection(direction, fn, result);
        const mediator = fn === "support" && (
          result == null ||
          result.statisticType === "indirect_effect" ||
          (result.statisticType === "effect_share" && /間接|indirect/iu.test(normalizedBasis(result.comparisonBasis)))
        )
          ? factMediator(card)
          : null;
        const factThemeKey = atomicThemeKey({
          exposure,
          outcome,
          result,
          fn,
          fallback: themeKey,
        });
        const conceptAxes = atomicConceptAxes({ card, exposure, outcome, themeKey: factThemeKey });
        const comparabilityKey = atomicComparabilityKey({
          card,
          population,
          exposure,
          exposureMeasure,
          outcome,
          outcomeMeasure,
          result,
        });
        return ({
        factId: result
          ? `${parentFactId}-result-${stableHash([
              String(resultIndex),
              result.statisticType ?? "unknown",
              result.measure ?? "unknown",
              String(result.value ?? "null"),
              result.unit ?? "unitless",
            ].join("|"))}`
          : parentFactId,
        parentFactId,
        resultIndex,
        evidenceId: id,
        sourceId: source,
        canonicalSourceId: source,
        sourceType: clean(card.sourceType) || null,
        evidenceLevel: factEvidenceLevel(card, fn),
        sourceAccessLevel: typeof resolvedAccessTier === "string" && [
          "complete_full_text", "structured_full_text", "verifiable_full_text_excerpt",
          "complete_abstract", "partial_abstract", "bibliographic_only",
        ].includes(resolvedAccessTier)
          ? resolvedAccessTier as NormalizedFact["sourceAccessLevel"]
          : evidenceAccessTierForFact({
              accessLevel: card.sourceAccessLevel,
              derivation: card.derivation,
              sectionType,
              sourceSpan,
              fullTextStructured: card.derivation === "fulltext-derived" && sectionType !== "unknown",
              abstractComplete: card.derivation === "abstract-derived" && !card.needsReview,
            }),
        sectionType,
        claimTextZhTw: atomicFactStatement({
          population,
          exposure,
          outcome,
          result,
          direction: atomicDirection,
          mediator,
        }),
        population,
        ageGroup: factAgeGroup(card),
        sampleSize: factSampleSize(card),
        geography: factLocation(card),
        studySetting: factSetting(card),
        studyDesign: factMethod(card),
        exposureConcept: exposure,
        exposureMeasure,
        outcomeConcept: outcome,
        outcomeMeasure,
        statisticType: result?.statisticType ?? null,
        value: result?.value ?? null,
        lowerCI: result?.lowerCI ?? null,
        upperCI: result?.upperCI ?? null,
        pValue: result?.pValue ?? null,
        unit: result?.unit ?? null,
        direction: atomicDirection === "unclear" ? null : atomicDirection,
        mediator,
        moderator: card.structuredStudyFact?.moderators[0]?.factor ?? null,
        confounders: card.structuredStudyFact?.confounders.length
          ? card.structuredStudyFact.confounders
          : null,
        adjustmentStatus: factAdjustmentStatus(card),
        evidenceDirectness: card.evidenceDirectnessTier ?? null,
        sourceSpan,
        certainty: clean(card.confidence) || null,
        confidence: Number.isFinite(card.confidenceScore) ? card.confidenceScore : null,
        authorInterpretation: sectionType === "discussion" || sectionType === "mechanism_interpretation"
          ? normalized?.normalizedClaimZhTw ?? null
          : null,
        // The current evidence-card contract does not distinguish author-stated
        // limitations from ResearchForge governance notes. Keep this null until
        // the extractor supplies an explicitly author-attributed field.
        authorLimitations: card.structuredStudyFact?.authorCautions.length
          ? card.structuredStudyFact.authorCautions
          : null,
        extractionConfidence,
        verificationStatus: normalized?.writerEligible === false
          ? "rejected"
          : typeof resolvedVerificationStatus === "string" && [
              "verified", "needs_review", "conflicted", "rejected", "unverified",
            ].includes(resolvedVerificationStatus)
            ? resolvedVerificationStatus as NormalizedFact["verificationStatus"]
          : card.needsManualReview || card.needsReview || (card.governanceFlags?.length ?? 0) > 0
            ? "needs_review"
            : sourceSpan && clean(card.locator ?? card.pageOrLocation ?? card.sourceLocation)
              ? "verified"
              : "unverified",
        evidenceFunction: fn,
        location: factLocation(card),
        setting: factSetting(card),
        exposure,
        outcome,
        method: factMethod(card),
        numericalResults: result ? [result] : [],
        associationDirection: atomicDirection,
        uncertainty: limits[0] ?? null,
        directness: card.evidenceDirectnessTier ?? "C",
        applicability: clean(card.applicability) || scope(card),
        locator: clean(card.locator ?? card.pageOrLocation ?? card.sourceLocation) || "可核對內容摘錄",
        themeKey: factThemeKey,
        conceptAxes,
        comparabilityKey,
        limitations: limits,
        supportingEvidenceIds: [id],
        supportingSourceIds: [source],
        writerEligible: normalized?.writerEligible ?? false,
      });
      });
    })
    .sort((left, right) =>
      left.themeKey.localeCompare(right.themeKey) ||
      left.factId.localeCompare(right.factId)
    );
}

function clusterSharedFinding(facts: NormalizedFact[], label: string): string {
  const sourceCount = new Set(facts.flatMap((fact) => fact.supportingSourceIds)).size;
  if (sourceCount === 1) {
    const statements = unique(facts.map((fact) => fact.claimTextZhTw)).slice(0, 3);
    return statements.length > 0
      ? statements.join("")
      : `${label}目前只有單一來源，僅能形成暫定判斷。`;
  }
  const exposures = unique(facts.map((fact) => fact.exposure));
  const outcomes = unique(facts.map((fact) => fact.outcome));
  const directions = unique(facts.map((fact) => fact.associationDirection))
    .filter((direction) => direction !== "unclear" && direction !== "not_applicable");
  const relation = exposures.length === 1 && outcomes.length === 1
    ? `${exposures[0]}與${outcomes[0]}之間`
    : label;
  if (directions.length > 1 || directions.includes("mixed")) {
    return `${relation}的跨來源結果方向不完全一致，須依研究場域、方法與量測指標分別解讀。`;
  }
  const directionText = directions[0] === "positive"
    ? "呈同向關聯"
    : directions[0] === "negative"
      ? "呈反向關聯"
      : directions[0] === "null"
        ? "未呈現明確關聯"
        : "形成可比較的方向性證據";
  return `${relation}在多個獨立來源中${directionText}，但效果量只可在量測定義相容時比較。`;
}

function broadDimension(value: string | null, kind: "exposure" | "outcome"): string {
  const normalized = clean(value);
  if (kind === "exposure" && /(?:短影音|短視頻|short[- ]?form video|TikTok|抖音)/iu.test(normalized)) {
    return "short_video";
  }
  if (kind === "exposure" && /(?:一般社群媒體|social media|social networking)/iu.test(normalized)) {
    return "social_media_background";
  }
  if (kind === "exposure" && /(?:綠視率|NDVI|樹冠|綠覆率|綠地|植被|green|canopy)/iu.test(normalized)) {
    return "green_quantity";
  }
  if (kind === "outcome" && /(?:睡眠品質|睡眠不佳|sleep quality|poor sleep|PSQI)/iu.test(normalized)) {
    return "sleep_quality";
  }
  if (kind === "outcome" && /(?:地表溫度|氣溫|熱舒適|都市熱島|thermal|temperature|heat|LST|UHI)/iu.test(normalized)) {
    return "thermal_environment";
  }
  return semanticKey(normalized || "unspecified");
}

function clusterLabel(
  purpose: NonNullable<SynthesisCluster["clusterPurpose"]>,
  themeKey: string,
): string {
  if (purpose === "exposure_translation") return "暴露概念與量測指標的轉譯差異";
  if (purpose === "outcome_hierarchy") return "結果概念與量測指標的層級差異";
  if (purpose === "applicability_boundary") return "研究場域與地理適用邊界";
  if (purpose === "method_heterogeneity") return "研究方法與數值可比較性";
  return topicClusterLabel(themeKey);
}

function sharedFindingForPurpose(
  facts: NormalizedFact[],
  purpose: NonNullable<SynthesisCluster["clusterPurpose"]>,
  label: string,
): string {
  if (purpose === "exposure_translation") {
    const values = unique(facts.map((fact) => fact.exposure));
    return `${values.join("、")}描述彼此相關但不等同的暴露概念；量測定義不同時只能比較研究方向，不能視為同一指標。`;
  }
  if (purpose === "outcome_hierarchy") {
    const values = unique(facts.map((fact) => fact.outcome));
    return `${values.join("、")}位於不同結果或量測層級，跨來源只能比較方向與機制，不能合併成單一效果量。`;
  }
  if (purpose === "applicability_boundary") {
    const settings = unique(facts.flatMap((fact) => [fact.location, fact.setting]));
    return `現有證據分布於${settings.join("、")}等情境；都市尺度與國外校園研究可互補，但不能直接替代目標地區的校園量測。`;
  }
  if (purpose === "method_heterogeneity") {
    const methods = unique(facts.map((fact) => fact.method));
    return `${methods.join("、")}回答的是不同層次的問題；研究數值只有在暴露、結果、單位與比較基準相容時才可合併。`;
  }
  return clusterSharedFinding(facts, label);
}

function synthesisCluster(
  themeKey: string,
  purpose: NonNullable<SynthesisCluster["clusterPurpose"]>,
  values: NormalizedFact[],
): SynthesisCluster {
  const clusterFacts = [...values].sort((left, right) => left.factId.localeCompare(right.factId));
  const sourceIds = unique(clusterFacts.flatMap((fact) => fact.supportingSourceIds));
  const directions = unique(clusterFacts.map((fact) => fact.associationDirection)) as SynthesisCluster["associationDirections"];
  const substantiveDirections = directions.filter(
    (direction) => direction !== "unclear" && direction !== "not_applicable",
  );
  const comparabilityKeys = unique(clusterFacts.map((fact) => fact.comparabilityKey));
  const hasDeclaredConflict = clusterFacts.some((fact) => fact.associationDirection === "mixed");
  const hasDirectionConflict = new Set(substantiveDirections).size > 1;
  const label = clusterLabel(purpose, themeKey);
  const conflictPoints = unique([
    hasDeclaredConflict || hasDirectionConflict
      ? "來源對關聯方向的判斷不一致，不能合併為單一共識。"
      : null,
    comparabilityKeys.length > 1
      ? "來源使用不同暴露、結果、方法、單位或比較基準，數值不得直接合併或排名。"
      : null,
    unique(clusterFacts.map((fact) => fact.setting)).length > 1
      ? "研究場域不同，跨情境外推需保留限制。"
      : null,
  ]);
  const agreementStatus: SynthesisCluster["agreementStatus"] = sourceIds.length === 1
    ? "single_source"
    : hasDeclaredConflict || hasDirectionConflict
      ? "conflicting"
      : substantiveDirections.length === 1
        ? "corroborated"
        : "uncertain";
  const numericAggregationAllowed =
    sourceIds.length >= 2 && comparabilityKeys.length === 1 &&
    !hasDeclaredConflict && !hasDirectionConflict;
  const comparabilityStatus: SynthesisCluster["comparabilityStatus"] =
    numericAggregationAllowed
      ? "comparable"
      : purpose === "relationship" && sourceIds.length >= 2 && substantiveDirections.length > 0 && comparabilityKeys.length > 1
        ? "direction_only"
        : sourceIds.length >= 2 && comparabilityKeys.length > 1
          ? "partially_comparable"
          : "not_comparable";
  const comparabilityReasons = unique([
    sourceIds.length < 2 ? "single_source_only" : null,
    comparabilityKeys.length > 1 ? "measurement_or_population_mismatch" : null,
    hasDirectionConflict ? "direction_conflict" : null,
    purpose !== "relationship" ? `thematic_${purpose}` : null,
  ]);
  return {
    clusterId: `cluster-${stableHash(`${purpose}|${themeKey}`)}`,
    clusterPurpose: purpose,
    themeKey,
    label,
    conceptAxes: unique(clusterFacts.flatMap((fact) => fact.conceptAxes)),
    factIds: clusterFacts.map((fact) => fact.factId),
    evidenceIds: unique(clusterFacts.map((fact) => fact.evidenceId)),
    sourceIds,
    sharedFindingZhTw: sharedFindingForPurpose(clusterFacts, purpose, label),
    agreementStatus,
    associationDirections: directions,
    comparabilityKeys,
    numericAggregationAllowed,
    comparabilityStatus,
    comparabilityReasons,
    conflictPoints,
    limitations: unique(clusterFacts.flatMap((fact) => fact.limitations)),
  };
}

/**
 * Builds semantic clusters from claims and concept axes. A fact may belong to
 * more than one cluster (relationship, metric translation, applicability, or
 * method), but source identity and array position never define a cluster.
 */
export function buildSynthesisClusters(facts: NormalizedFact[]): SynthesisCluster[] {
  const eligible = facts.filter((fact) => fact.writerEligible);
  const relationshipGroups = new Map<string, NormalizedFact[]>();
  for (const fact of eligible) {
    const themeKey = fact.exposure || fact.outcome
      ? `relationship:${broadDimension(fact.exposure, "exposure")}:${broadDimension(fact.outcome, "outcome")}`
      : fact.themeKey;
    relationshipGroups.set(themeKey, [...(relationshipGroups.get(themeKey) ?? []), fact]);
  }
  const clusters = Array.from(relationshipGroups.entries()).map(([themeKey, values]) =>
    synthesisCluster(themeKey, "relationship", values)
  );
  const multiSourceFacts = eligible.filter((fact) => fact.supportingSourceIds.length > 0);
  const sourceCount = new Set(multiSourceFacts.flatMap((fact) => fact.supportingSourceIds)).size;
  if (sourceCount >= 2 && unique(multiSourceFacts.map((fact) => fact.exposure)).length > 1) {
    clusters.push(synthesisCluster("translation:exposure", "exposure_translation", multiSourceFacts));
  }
  if (sourceCount >= 2 && unique(multiSourceFacts.map((fact) => fact.outcome)).length > 1) {
    clusters.push(synthesisCluster("hierarchy:outcome", "outcome_hierarchy", multiSourceFacts));
  }
  if (sourceCount >= 2 && unique(multiSourceFacts.flatMap((fact) => [fact.location, fact.setting])).length > 1) {
    clusters.push(synthesisCluster("boundary:setting-geography", "applicability_boundary", multiSourceFacts));
  }
  if (sourceCount >= 2 && unique(multiSourceFacts.map((fact) => fact.method)).length > 1) {
    clusters.push(synthesisCluster("heterogeneity:method", "method_heterogeneity", multiSourceFacts));
  }
  const purposeRank: Record<NonNullable<SynthesisCluster["clusterPurpose"]>, number> = {
    relationship: 0,
    exposure_translation: 1,
    outcome_hierarchy: 2,
    applicability_boundary: 3,
    method_heterogeneity: 4,
  };
  return clusters.sort((left, right) =>
    purposeRank[left.clusterPurpose ?? "relationship"] - purposeRank[right.clusterPurpose ?? "relationship"] ||
    right.sourceIds.length - left.sourceIds.length ||
    left.themeKey.localeCompare(right.themeKey)
  );
}

function centralAnswerForEvidence(
  topic: string,
  evidence: NormalizedWriterEvidence[],
  synthesisClusters: SynthesisCluster[],
): string {
  const usable = evidence.filter((item) => item.writerEligible && item.stance !== "limits");
  if (usable.length === 0) {
    return `現有證據尚不足以直接回答「${topic}」；目前只能界定資料缺口，不能形成研究結論。`;
  }
  const sourceCount = new Set(usable.map((item) => item.canonicalSourceId)).size;
  const firstCandidate = usable[0]?.normalizedClaimZhTw
    .split(/(?<=[。！？])/u)
    .map((sentence, index) => ({
      sentence: sentence.replace(/[。；;]+$/u, "").trim(),
      index,
      score:
        (/(?:結果|顯示|指出|發現|關聯|相關|降低|改善|差異)/u.test(sentence) ? 5 : 0) +
        (/(?:旨在|目的|方法|採用|使用|資料庫)/u.test(sentence) ? -3 : 0),
    }))
    .filter((candidate) => candidate.sentence.length >= 12)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
    ?.sentence ?? "現有證據提供可核對的方向性結果";
  const first = firstCandidate.length <= 180
    ? firstCandidate
    : firstCandidate
        .slice(0, 180)
        .replace(/[，；、][^，；、]*$/u, "")
        .replace(/[，；、]+$/u, "")
        .trim();
  const strongestCluster = synthesisClusters[0];
  return sourceCount === 1
    ? `就「${topic}」而言，目前可核對的方向是：${first}；這項判斷仍需獨立資料驗證，不能概括為普遍結論。`
    : `就「${topic}」而言，跨證據綜合支持一項受限回答：${strongestCluster?.sharedFindingZhTw ?? "目前已形成可比較的方向性證據。"}結論仍須分別考量研究場域、指標與方法差異。`;
}

const DIRECTNESS_RANK: Readonly<Record<NonNullable<NormalizedFact["evidenceDirectness"]>, number>> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
};

function weakestDirectness(facts: NormalizedFact[]): NormalizedFact["evidenceDirectness"] {
  return facts
    .map((fact) => fact.evidenceDirectness)
    .filter((tier): tier is NonNullable<NormalizedFact["evidenceDirectness"]> => Boolean(tier))
    .sort((left, right) => DIRECTNESS_RANK[right] - DIRECTNESS_RANK[left])[0] ?? null;
}

function confidenceForFacts(facts: NormalizedFact[]): number {
  const scores = facts
    .map((fact) => fact.confidence)
    .filter((score): score is number => score != null && Number.isFinite(score));
  const mean = scores.length > 0
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0.4;
  const independentSources = new Set(facts.flatMap((fact) => fact.supportingSourceIds)).size;
  return Math.max(0, Math.min(1, mean + (independentSources >= 2 ? 0.08 : 0)));
}

/**
 * Converts semantic clusters into a claim-level graph. Facts, not source cards,
 * are the graph leaves; source identity appears only as an entailment mapping.
 */
export function buildCrossSourceClaimGraph(
  researchQuestion: string,
  facts: NormalizedFact[],
  clusters: SynthesisCluster[],
): CrossSourceClaimGraph {
  const factById = new Map(facts.map((fact) => [fact.factId, fact] as const));
  const nodeForFacts = (input: {
    claimType: CrossSourceClaimGraph["claims"][number]["claimType"];
    statement: string;
    supportingFacts?: NormalizedFact[];
    contradictingFacts?: NormalizedFact[];
    backgroundFacts?: NormalizedFact[];
    limitations?: string[];
  }): CrossSourceClaimGraph["claims"][number] => {
    const supporting = input.supportingFacts ?? [];
    const contradicting = input.contradictingFacts ?? [];
    const background = input.backgroundFacts ?? [];
    const all = unique([...supporting, ...contradicting, ...background].map((fact) => fact.factId))
      .map((factId) => factById.get(factId))
      .filter((fact): fact is NormalizedFact => Boolean(fact));
    const claimId = `claim-${stableHash(`${input.claimType}|${input.statement}|${all.map((fact) => fact.factId).join("|")}`)}`;
    const visualizable = all.some((fact) => fact.statisticType != null && fact.value != null);
    return {
      claimId,
      claimType: input.claimType,
      readerFacingStatement: input.statement,
      supportingFacts: supporting.map((fact) => fact.factId),
      contradictingFacts: contradicting.map((fact) => fact.factId),
      backgroundFacts: background.map((fact) => fact.factId),
      applicability: unique(all.flatMap((fact) => [
        fact.population,
        fact.geography,
        fact.setting,
        fact.studyDesign,
        fact.applicability,
      ])),
      confidence: confidenceForFacts(all),
      citationIds: unique(all.map((fact) => fact.sourceId)),
      statisticalInterpretationIds: [],
      visualizable,
      visualId: visualizable ? `visual-${stableHash(claimId)}` : null,
      evidenceDirectness: weakestDirectness(all),
      limitations: unique([
        ...all.flatMap((fact) => fact.limitations),
        ...(input.limitations ?? []),
      ]),
    };
  };
  const claims: CrossSourceClaimGraph["claims"] = clusters.map((cluster) => {
    const clusterFacts = cluster.factIds
      .map((factId) => factById.get(factId))
      .filter((fact): fact is NormalizedFact => Boolean(fact));
    const backgroundFacts = clusterFacts
      .filter((fact) => ["background", "definition", "method"].includes(fact.evidenceFunction))
      .map((fact) => fact.factId);
    const substantiveFacts = clusterFacts.filter((fact) => !backgroundFacts.includes(fact.factId));
    const directionCounts = new Map<string, number>();
    for (const fact of substantiveFacts) {
      if (fact.associationDirection === "unclear" || fact.associationDirection === "not_applicable") continue;
      directionCounts.set(
        fact.associationDirection,
        (directionCounts.get(fact.associationDirection) ?? 0) + 1,
      );
    }
    const dominantDirection = [...directionCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    const contradictingFacts = substantiveFacts
      .filter((fact) =>
        fact.evidenceFunction === "contrast" ||
        (dominantDirection != null &&
          fact.associationDirection !== "unclear" &&
          fact.associationDirection !== "not_applicable" &&
          fact.associationDirection !== dominantDirection),
      )
      .map((fact) => fact.factId);
    const supportingFacts = substantiveFacts
      .filter((fact) => !contradictingFacts.includes(fact.factId))
      .map((fact) => fact.factId);
    const claimType: CrossSourceClaimGraph["claims"][number]["claimType"] =
      supportingFacts.length === 0
        ? "evidence_gap"
        : cluster.clusterPurpose === "applicability_boundary"
        ? "applicability_boundary"
        : cluster.clusterPurpose === "exposure_translation" ||
            cluster.clusterPurpose === "outcome_hierarchy" ||
            cluster.clusterPurpose === "method_heterogeneity" ||
            cluster.agreementStatus === "conflicting"
          ? "research_difference"
          : cluster.clusterPurpose === "relationship" &&
              supportingFacts.length > 0 &&
              substantiveFacts.some((fact) => fact.mediator != null)
            ? "possible_mechanism"
            : cluster.sourceIds.length >= 2
              ? "cross_source_shared_direction"
              : "direct_result";
    const citationIds = unique(
      [...supportingFacts, ...contradictingFacts, ...backgroundFacts]
        .map((factId) => factById.get(factId)?.sourceId),
    );
    const applicability = unique(clusterFacts.flatMap((fact) => [
      fact.population,
      fact.geography,
      fact.setting,
      fact.studyDesign,
      fact.applicability,
    ]));
    const visualizable = clusterFacts.some((fact) =>
      fact.statisticType != null && fact.value != null,
    );
    const claimId = `claim-${stableHash(`${cluster.clusterId}|${cluster.sharedFindingZhTw}`)}`;
    return {
      claimId,
      claimType,
      readerFacingStatement: cluster.sharedFindingZhTw,
      supportingFacts,
      contradictingFacts,
      backgroundFacts,
      applicability,
      confidence: confidenceForFacts(clusterFacts),
      citationIds,
      statisticalInterpretationIds: [],
      visualizable,
      visualId: visualizable ? `visual-${stableHash(claimId)}` : null,
      evidenceDirectness: weakestDirectness(clusterFacts),
      limitations: unique([
        ...cluster.limitations,
        ...cluster.conflictPoints,
        cluster.comparabilityStatus !== "comparable"
          ? "來源概念或量測不完全相容，不得直接合併效果量。"
          : null,
      ]),
    };
  });

  const substantiveFacts = facts.filter(
    (fact) => fact.writerEligible && !["background", "definition", "method", "unresolved"].includes(fact.evidenceFunction),
  );
  const backgroundFacts = facts.filter(
    (fact) => fact.writerEligible && ["background", "definition", "method"].includes(fact.evidenceFunction),
  );

  if (!claims.some((claim) => claim.claimType === "cross_source_shared_direction")) {
    const directionGroups = new Map<string, NormalizedFact[]>();
    for (const fact of substantiveFacts) {
      if (!fact.exposure || !fact.outcome || !["positive", "negative", "null"].includes(fact.associationDirection)) continue;
      const key = [
        broadDimension(fact.exposure, "exposure"),
        broadDimension(fact.outcome, "outcome"),
        fact.associationDirection,
      ].join("|");
      directionGroups.set(key, [...(directionGroups.get(key) ?? []), fact]);
    }
    const shared = [...directionGroups.entries()]
      .filter(([, grouped]) => new Set(grouped.map((fact) => fact.sourceId)).size >= 2)
      .sort((left, right) =>
        new Set(right[1].map((fact) => fact.sourceId)).size - new Set(left[1].map((fact) => fact.sourceId)).size ||
        right[1].length - left[1].length ||
        left[0].localeCompare(right[0])
      )[0];
    if (shared) {
      const direction = shared[1][0]?.associationDirection;
      const directionText = direction === "positive"
        ? "同向關聯"
        : direction === "negative"
          ? "反向關聯"
          : "未見明確關聯";
      claims.push(nodeForFacts({
        claimType: "cross_source_shared_direction",
        statement: `針對「${researchQuestion}」，至少兩個獨立來源呈現一致的${directionText}方向；效果量仍須依樣本與量測定義分開解讀。`,
        supportingFacts: shared[1],
        limitations: ["跨來源方向一致不等於因果效果，也不代表數值可直接合併。"],
      }));
    }
  }

  if (!claims.some((claim) => claim.claimType === "direct_result")) {
    const directFacts = substantiveFacts.filter((fact) => fact.evidenceDirectness === "A").slice(0, 4);
    if (directFacts.length > 0) {
      claims.push(nodeForFacts({
        claimType: "direct_result",
        statement: directFacts.map((fact) => fact.claimTextZhTw).join(""),
        supportingFacts: directFacts,
        limitations: ["直接證據節點僅重述來源明示的結果，不超越其研究設計。"],
      }));
    }
  }

  if (!claims.some((claim) => claim.claimType === "possible_mechanism")) {
    const mechanismFacts = substantiveFacts.filter((fact) =>
      fact.mediator != null ||
      fact.statisticType === "indirect_effect" ||
      (fact.statisticType === "effect_share" && /間接|indirect/iu.test(fact.numericalResults[0]?.comparisonBasis ?? "")),
    );
    if (mechanismFacts.length > 0) {
      const mediators = unique(mechanismFacts.map((fact) => fact.mediator));
      claims.push(nodeForFacts({
        claimType: "possible_mechanism",
        statement: `${mediators.join("、") || "中介路徑"}可能連結短影音暴露與睡眠結果，但現有設計只能支持中介模型，不能確證因果機制。`,
        supportingFacts: mechanismFacts,
        limitations: ["橫斷資料無法確定暴露、中介與結果的時間先後。"],
      }));
    }
  }

  if (!claims.some((claim) => claim.claimType === "evidence_gap")) {
    const gapBasis = backgroundFacts.length > 0 ? backgroundFacts : substantiveFacts.slice(0, 3);
    if (gapBasis.length > 0) {
      claims.push(nodeForFacts({
        claimType: "evidence_gap",
        statement: "目前證據仍缺乏可驗證時間先後與因果方向的縱貫或實驗設計，且部分來源只能提供背景或間接適用資訊。",
        backgroundFacts: gapBasis,
        limitations: ["不得將現有關聯或間接證據寫成因果結論。"],
      }));
    }
  }

  if (!claims.some((claim) => claim.claimType === "author_synthesis")) {
    const synthesisFacts = unique(
      claims.flatMap((claim) => [...claim.supportingFacts, ...claim.contradictingFacts]),
    ).map((factId) => factById.get(factId)).filter((fact): fact is NormalizedFact => Boolean(fact));
    if (synthesisFacts.length > 0) {
      claims.push(nodeForFacts({
        claimType: "author_synthesis",
        statement: `綜合而言，「${researchQuestion}」的現有資料較支持有條件的關聯與可能中介路徑，不支持單一通用效果量或因果斷言。`,
        supportingFacts: synthesisFacts,
        limitations: ["本節為跨來源綜合判斷，必須連同研究差異、適用邊界與證據缺口一併閱讀。"],
      }));
    }
  }
  const relationshipClaims = claims.filter((claim) =>
    claim.claimType === "direct_result" || claim.claimType === "cross_source_shared_direction",
  );
  const edges: CrossSourceClaimGraph["edges"] = [];
  for (const claim of claims) {
    if (relationshipClaims.includes(claim)) continue;
    for (const target of relationshipClaims) {
      const relationship = claim.claimType === "possible_mechanism"
        ? "explains"
        : claim.claimType === "applicability_boundary"
          ? "bounds"
          : claim.claimType === "research_difference"
            ? "qualifies"
            : "supports";
      edges.push({ fromClaimId: claim.claimId, toClaimId: target.claimId, relationship });
    }
  }
  return { researchQuestion, claims, edges };
}

function buildNarrativePasses(claimGraph: CrossSourceClaimGraph): NarrativePassPlan[] {
  const inputClaimIds = claimGraph.claims.map((claim) => claim.claimId);
  const inputFactIds = unique(claimGraph.claims.flatMap((claim) => [
    ...claim.supportingFacts,
    ...claim.contradictingFacts,
    ...claim.backgroundFacts,
  ]));
  return [
    {
      pass: "teach_back",
      objective: "先以自己的話回答核心問題，建立概念、機制、證據強弱與適用邊界的完整心智模型。",
      inputClaimIds,
      inputFactIds,
      outputConstraints: [
        "不得按來源順序逐篇摘要。",
        "不得出現作者姓名、來源標題或引用標記。",
        "只說明 claim graph 已建立的關係與限制。",
      ],
      citationMode: "deferred",
    },
    {
      pass: "academic_reconstruction",
      objective: "把 teach-back 的理解重建為正式學術論證，逐一放回可核對數值、限制與精確引用。",
      inputClaimIds,
      inputFactIds,
      outputConstraints: [
        "每個研究主張只能使用其 claim node 允許的 citationIds。",
        "數值、母群、暴露、結果與 directness 不得跨 fact 拼接。",
        "每段依核心問題、綜合判斷、關鍵資料、跨研究解讀、適用邊界組織。",
      ],
      citationMode: "claim_entailment",
    },
  ];
}

export interface ReportCompositionResult {
  normalizedEvidence: NormalizedWriterEvidence[];
  normalizedFacts: NormalizedFact[];
  synthesisClusters: SynthesisCluster[];
  claimGraph: CrossSourceClaimGraph;
  narrativePasses: NarrativePassPlan[];
  argumentMap: ArgumentMap;
  discoursePlan: DiscourseSection[];
  compositionKind: "complete_research_report" | "limited_evidence_brief" | "evidence_summary";
  terminology: Record<string, string>;
}

export function buildReportComposition(input: {
  topic: string;
  researchQuestion?: string | null;
  evidenceCards: EvidenceCard[];
}): ReportCompositionResult {
  const normalizedEvidence = normalizeEvidenceForWriter(input.evidenceCards);
  const usable = normalizedEvidence.filter((item) => item.writerEligible);
  const normalizedFacts = normalizeFactsForWriter(input.evidenceCards, normalizedEvidence);
  const synthesisClusters = buildSynthesisClusters(normalizedFacts);
  const usableFactById = new Map(
    normalizedFacts.filter((fact) => fact.writerEligible).map((fact) => [fact.factId, fact] as const),
  );
  const evidenceById = new Map(usable.map((item) => [item.evidenceId, item] as const));
  const sourceCount = new Set(usable.map((item) => item.canonicalSourceId)).size;
  const researchQuestion = clean(input.researchQuestion) ||
    `現有證據如何回答「${clean(input.topic)}」，其適用範圍與限制為何？`;
  const claimGraph = buildCrossSourceClaimGraph(
    researchQuestion,
    normalizedFacts.filter((fact) => fact.writerEligible),
    synthesisClusters,
  );
  const narrativePasses = buildNarrativePasses(claimGraph);
  const subQuestions = (synthesisClusters.length > 0 ? synthesisClusters : [null])
    .slice(0, 4)
    .map((cluster) =>
      cluster == null
        ? `目前還缺少哪些證據才能回答「${input.topic}」？`
        : `關於「${input.topic}」，${cluster.label}能支持什麼判斷？`,
    );
  const claims = synthesisClusters.map((cluster) => {
    const clusterEvidence = cluster.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is NormalizedWriterEvidence => Boolean(item));
    const fn: NormalizedEvidenceFunction = cluster.agreementStatus === "conflicting"
      ? "contrast"
      : clusterEvidence.some((item) => item.allowedUses.includes("support"))
        ? "support"
        : clusterEvidence[0]?.allowedUses[0] ?? "unresolved";
    const supportingEvidenceIds = clusterEvidence
      .filter((item) => item.stance === "supports" || item.stance === "neutral")
      .map((item) => item.evidenceId);
    const contrastingEvidenceIds = clusterEvidence
      .filter((item) => item.stance === "contrasts")
      .map((item) => item.evidenceId);
    const limitingEvidenceIds = clusterEvidence
      .filter((item) => item.stance === "limits")
      .map((item) => item.evidenceId);
    return {
      claimId: `argument-${stableHash(cluster.clusterId)}`,
      claimText: cluster.sharedFindingZhTw,
      function: fn,
      supportingEvidenceIds: supportingEvidenceIds.length > 0
        ? supportingEvidenceIds
        : cluster.evidenceIds,
      contrastingEvidenceIds,
      limitingEvidenceIds,
      sourceCount: cluster.sourceIds.length,
      wordingStrength: cluster.sourceIds.length >= 2 && cluster.agreementStatus === "corroborated"
        ? "qualified"
        : "tentative",
      normalizedFactIds: cluster.factIds,
      synthesisClusterIds: [cluster.clusterId],
    } satisfies ArgumentMap["claims"][number];
  });
  const unresolvedCount = normalizedEvidence.filter((item) => !item.writerEligible).length;
  const evidenceGaps = unique([
    unresolvedCount > 0 ? `${unresolvedCount} 筆證據尚未完成可驗證的繁中正規化，未交付 writer。` : null,
    sourceCount < 2 ? "缺少第二個獨立來源，不能形成跨來源共識。" : null,
    synthesisClusters.length < 2 ? "目前證據只形成一個可辨識的分析面向，不應依來源順序硬拆章節。" : null,
  ]);
  const centralAnswer = centralAnswerForEvidence(input.topic, normalizedEvidence, synthesisClusters);
  const conclusionBoundary =
    "結論只能回收 ArgumentMap 中已有的主張與引用，不得把相關性改寫為因果，也不得超出摘要或全文實際揭露範圍。";
  const argumentMap: ArgumentMap = {
    researchQuestion,
    scope: `範圍限於 ${sourceCount} 個可唯一識別來源中已正規化且可追溯的證據；原文片段只供核對。`,
    centralAnswer,
    subQuestions,
    claims,
    evidenceGaps,
    conclusionBoundary,
  };

  const analysisSections = synthesisClusters.slice(0, 4).map((cluster, index) => {
    const assignedFacts = cluster.factIds
      .map((factId) => usableFactById.get(factId))
      .filter((fact): fact is NormalizedFact => Boolean(fact));
    const question = subQuestions[index] ?? researchQuestion;
    const clusterLabel = cluster.label;
    const previous = index === 0 ? "承接研究問題與證據範圍。" : `承接前一分析面向，改從${clusterLabel}檢驗核心回答。`;
    return {
      sectionId: `analysis-${stableHash(cluster.themeKey)}`,
      sectionRole: "thematic_analysis",
      questionAnswered: question,
      sectionClaim: cluster.sharedFindingZhTw,
      assignedEvidenceIds: cluster.evidenceIds,
      assignedFactIds: cluster.factIds,
      synthesisClusterIds: [cluster.clusterId],
      evidenceRelationship:
        cluster.sourceIds.length >= 2
          ? cluster.conflictPoints.join("；") || "跨來源支持、補充或限制同一子問題。"
          : "單一來源主張，必須明示來源數量並保留暫定語氣。",
      connectionFromPrevious: previous,
      expectedTakeaway: `讀者應能辨識${clusterLabel}支持的判斷與不可外推範圍。`,
      transitionToNext:
        index === synthesisClusters.slice(0, 4).length - 1
          ? "下一節比較各分析面向的一致、差異與限制。"
          : "下一節改以不同證據面向檢驗核心回答。",
      limitations: unique([...cluster.limitations, ...evidenceGaps]),
    } satisfies DiscourseSection;
  });
  const discoursePlan: DiscourseSection[] = [
    {
      sectionId: "question-and-scope",
      sectionRole: "research_question_and_scope",
      questionAnswered: researchQuestion,
      sectionClaim: centralAnswer,
      assignedEvidenceIds: [],
      assignedFactIds: [],
      synthesisClusterIds: [],
      evidenceRelationship: "界定全文共同使用的研究問題、核心回答與證據邊界。",
      connectionFromPrevious: "由摘要進入可檢查的研究問題。",
      expectedTakeaway: "讀者先知道報告要回答什麼，以及哪些問題尚不能回答。",
      transitionToNext: "後續章節依子問題逐一檢驗核心回答。",
      limitations: evidenceGaps,
    },
    ...analysisSections,
    {
      sectionId: "cross-source-synthesis",
      sectionRole: "cross_source_synthesis",
      questionAnswered: "不同來源之間有哪些一致、差異與適用條件？",
      sectionClaim: centralAnswer,
      assignedEvidenceIds: usable.map((item) => item.evidenceId),
      assignedFactIds: normalizedFacts.filter((fact) => fact.writerEligible).map((fact) => fact.factId),
      synthesisClusterIds: synthesisClusters.map((cluster) => cluster.clusterId),
      evidenceRelationship: "比較支持、相反與限制證據，不按來源順序逐篇摘要。",
      connectionFromPrevious: "把各主題分析放回同一研究問題下比較。",
      expectedTakeaway: "讀者可辨識跨來源綜合，而非來源摘要清單。",
      transitionToNext: "接著明列證據缺口，再回到研究問題形成結論。",
      limitations: evidenceGaps,
    },
    {
      sectionId: "limitations",
      sectionRole: "limitations_and_gaps",
      questionAnswered: "哪些結論目前不能成立？",
      sectionClaim: evidenceGaps.join("；") || "限制只對應已知的來源與方法邊界。",
      assignedEvidenceIds: usable.filter((item) => item.stance === "limits").map((item) => item.evidenceId),
      assignedFactIds: normalizedFacts
        .filter((fact) => fact.writerEligible && fact.limitations.length > 0)
        .map((fact) => fact.factId),
      synthesisClusterIds: synthesisClusters
        .filter((cluster) => cluster.limitations.length > 0)
        .map((cluster) => cluster.clusterId),
      evidenceRelationship: "把缺口連回具體來源數量、語言、方法與適用範圍。",
      connectionFromPrevious: "以綜合結果中的差異與不確定性界定結論強度。",
      expectedTakeaway: "限制不是通用免責，而是結論不能越過的證據邊界。",
      transitionToNext: "結論只回答研究問題，不加入新來源或新主張。",
      limitations: evidenceGaps,
    },
    {
      sectionId: "conclusion",
      sectionRole: "direct_answer",
      questionAnswered: researchQuestion,
      sectionClaim: centralAnswer,
      assignedEvidenceIds: usable.map((item) => item.evidenceId),
      assignedFactIds: normalizedFacts.filter((fact) => fact.writerEligible).map((fact) => fact.factId),
      synthesisClusterIds: synthesisClusters.map((cluster) => cluster.clusterId),
      evidenceRelationship: "回收前文已建立的核心回答、條件與限制。",
      connectionFromPrevious: "依限制章界定的強度直接回答研究問題。",
      expectedTakeaway: centralAnswer,
      transitionToNext: "正文結束，後接實際引用的參考文獻。",
      limitations: [conclusionBoundary],
    },
  ];

  const compositionKind =
    sourceCount >= 3 && synthesisClusters.length >= 2
      ? "complete_research_report"
      : sourceCount >= 2
        ? "limited_evidence_brief"
        : "evidence_summary";
  return {
    normalizedEvidence,
    normalizedFacts,
    synthesisClusters,
    claimGraph,
    narrativePasses,
    argumentMap,
    discoursePlan,
    compositionKind,
    terminology: { ...ZH_TW_REPORT_TERMINOLOGY },
  };
}

function bodySections(text: string): string {
  return text.replace(
    /(?:^|\n)#{1,3}\s*(?:參考文獻|參考資料|參考來源|References|Bibliography)[\s\S]*$/iu,
    "",
  );
}

export interface LanguageArtifactAudit {
  passed: boolean;
  longEnglishSegments: string[];
  internalArtifacts: string[];
  terminologyInconsistencies: string[];
}

const ZH_TW_VARIANT_GROUPS: ReadonlyArray<readonly [preferred: string, discouraged: string]> = [
  ["資料", "數據"],
  ["軟體", "軟件"],
  ["影片", "視頻"],
  ["資訊", "信息"],
  ["品質", "質量"],
];

export function auditTraditionalChineseTerminology(text: string): string[] {
  return ZH_TW_VARIANT_GROUPS
    .filter(([preferred, discouraged]) => text.includes(preferred) && text.includes(discouraged))
    .map(([preferred, discouraged]) => `${preferred}/${discouraged}`);
}

/** Applies only deterministic Taiwan zh-TW lexical substitutions. */
export function normalizeTraditionalChineseTerminology(text: string): string {
  return text
    .replace(/數據/gu, "資料")
    .replace(/軟件/gu, "軟體")
    .replace(/視頻/gu, "影片")
    .replace(/信息/gu, "資訊");
}

/** Audits body text only; bibliography, DOI, URL, authors, formulas and code are excluded. */
export function auditReportLanguageAndArtifacts(text: string): LanguageArtifactAudit {
  const body = bodySections(text)
    .replace(/https?:\/\/\S+|doi:\s*\S+|10\.\d{4,9}\/\S+/giu, "")
    .replace(/```[\s\S]*?```|`[^`]*`/gu, "")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]+\$/gu, "");
  const internalArtifacts = INTERNAL_ARTIFACT_PATTERNS
    .filter(([, pattern]) => pattern.test(body))
    .map(([label]) => label);
  const longEnglishSegments = body
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map(clean)
    .filter((segment) => {
      const latin = segment.match(/[A-Za-z][A-Za-z'-]*/gu) ?? [];
      const disallowed = latin.filter((token) => !ALLOWED_LATIN_TOKEN_PATTERN.test(token));
      const han = segment.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
      return disallowed.length >= 12 && (han === 0 || disallowed.length > han * 0.8);
    });
  const terminologyInconsistencies = auditTraditionalChineseTerminology(body);
  return {
    passed:
      internalArtifacts.length === 0 &&
      longEnglishSegments.length === 0 &&
      terminologyInconsistencies.length === 0,
    longEnglishSegments,
    internalArtifacts,
    terminologyInconsistencies,
  };
}

function citationTokens(text: string): string[] {
  return (text.match(/[\[［]\s*[SＳ]\d+\s*[\]］]/gu) ?? [])
    .map((marker) => marker.normalize("NFKC").replace(/\s+/gu, "").toUpperCase());
}

export interface BoundedEditorialAudit {
  passed: boolean;
  citationIdentityPreserved: boolean;
  introducedInternalArtifacts: string[];
  removedLimitation: boolean;
}

/** Citation markers are locked tokens; limitations may be reordered, never removed. */
export function auditBoundedEditorialPass(before: string, after: string): BoundedEditorialAudit {
  const beforeMarkers = citationTokens(before);
  const afterMarkers = citationTokens(after);
  const afterArtifactAudit = auditReportLanguageAndArtifacts(after);
  const limitationSentences = before
    .split(/(?<=[。！？!?；;])/u)
    .map(clean)
    .filter((sentence) => /限制|不足|不確定|不能|尚未/u.test(sentence));
  const afterFingerprint = normalizeTraditionalChineseTerminology(after)
    .normalize("NFKC")
    .replace(/\s+/gu, "");
  const removedLimitation = limitationSentences.some((sentence) => {
    const anchor = normalizeTraditionalChineseTerminology(sentence)
      .normalize("NFKC")
      .replace(/[\s，。；：、]/gu, "")
      .slice(0, 12);
    return anchor.length >= 6 && !afterFingerprint.includes(anchor);
  });
  const citationIdentityPreserved =
    beforeMarkers.length === afterMarkers.length &&
    beforeMarkers.every((marker, index) => marker === afterMarkers[index]);
  return {
    passed:
      citationIdentityPreserved &&
      afterArtifactAudit.passed &&
      !removedLimitation,
    citationIdentityPreserved,
    introducedInternalArtifacts: afterArtifactAudit.internalArtifacts,
    removedLimitation,
  };
}

export interface CoherenceAudit {
  passed: boolean;
  issues: string[];
}

function semanticTerms(value: string): string[] {
  const phraseTerms = unique(
    value
      .normalize("NFKC")
      .replace(/[\[［]\s*[SＳ]\d+\s*[\]］]/gu, " ")
      .split(/[\s，。；：、！？!?()（）「」『』\[\]]+/u)
      .map((term) => term.trim().toLocaleLowerCase())
      .filter((term) => term.length >= 2 && !/^(?:目前|現有|研究|證據|資料|來源|回答|結論)$/u.test(term)),
  );
  const hanOnly = value
    .normalize("NFKC")
    .replace(/[\[［]\s*[SＳ]\d+\s*[\]］]/gu, "")
    .replace(/[^\u3400-\u9fff]+/gu, "");
  const hanFourGrams = Array.from(
    { length: Math.max(0, hanOnly.length - 3) },
    (_unused, index) => hanOnly.slice(index, index + 4),
  ).filter((term) => !/^(?:現有研究|目前來源|證據支持|結論強度)$/u.test(term));
  return unique([...phraseTerms, ...hanFourGrams]);
}

/** Deterministic whole-report checks; no model self-rating can satisfy them. */
export function auditReportCoherence(input: {
  reportPlan?: {
    researchQuestion?: string | null;
    centralAnswer?: string | null;
    subQuestions?: string[] | null;
    argumentMap?: ArgumentMap | null;
    discoursePlan?: DiscourseSection[] | null;
    normalizedEvidence?: NormalizedWriterEvidence[] | null;
  } | null;
  sections: Array<{
    sectionId?: string | null;
    title?: string | null;
    body?: string | null;
    prose?: string | null;
  }>;
}): CoherenceAudit {
  const issues: string[] = [];
  const plan = input.reportPlan;
  const argumentMap = plan?.argumentMap;
  const discoursePlan = plan?.discoursePlan ?? [];
  const textById = new Map(
    input.sections.map((section) => [
      clean(section.sectionId),
      clean(section.body ?? section.prose),
    ] as const),
  );
  const researchQuestion = clean(argumentMap?.researchQuestion ?? plan?.researchQuestion);
  const centralAnswer = clean(argumentMap?.centralAnswer ?? plan?.centralAnswer);
  if (!researchQuestion) issues.push("missing_research_question");
  if (!centralAnswer) issues.push("missing_central_answer");
  const subQuestions = argumentMap?.subQuestions ?? plan?.subQuestions ?? [];
  if (subQuestions.length < 1 || subQuestions.length > 4) issues.push("invalid_subquestion_count");
  if (new Set(subQuestions.map((item) => item.normalize("NFKC"))).size !== subQuestions.length) {
    issues.push("duplicate_subquestions");
  }

  const thematicSections = discoursePlan.filter((section) => section.sectionRole === "thematic_analysis");
  if (thematicSections.length < 1) issues.push("missing_thematic_analysis");
  if (thematicSections.some((section) => section.assignedEvidenceIds.length === 0)) {
    issues.push("analysis_without_evidence");
  }
  for (const role of [
    "research_question_and_scope",
    "cross_source_synthesis",
    "limitations_and_gaps",
    "direct_answer",
  ]) {
    if (!discoursePlan.some((section) => section.sectionRole === role)) {
      issues.push(`missing_discourse_role:${role}`);
    }
  }

  const eligibleIds = new Set(
    (plan?.normalizedEvidence ?? [])
      .filter((item) => item.writerEligible)
      .map((item) => item.evidenceId),
  );
  const assignedIds = new Set(discoursePlan.flatMap((section) => section.assignedEvidenceIds));
  if ([...eligibleIds].some((id) => !assignedIds.has(id))) issues.push("isolated_evidence");

  const analysisOwners = new Map<string, DiscourseSection[]>();
  for (const section of thematicSections) {
    for (const id of section.assignedEvidenceIds) {
      const owners = analysisOwners.get(id) ?? [];
      owners.push(section);
      analysisOwners.set(id, owners);
    }
  }
  // One study can legitimately inform more than one conceptual cluster (for
  // example, exposure translation and outcome hierarchy). Treat that as
  // synthesis, not duplication. Repetition is only a coherence defect when
  // the same evidence is assigned to the same cluster in multiple analysis
  // sections, or when legacy sections have no cluster identity at all.
  const repeatedWithinSameCluster = [...analysisOwners.values()].some((owners) => {
    if (owners.length < 2) return false;
    for (let leftIndex = 0; leftIndex < owners.length; leftIndex += 1) {
      const leftClusters = new Set(owners[leftIndex]!.synthesisClusterIds ?? []);
      for (let rightIndex = leftIndex + 1; rightIndex < owners.length; rightIndex += 1) {
        const rightClusters = new Set(owners[rightIndex]!.synthesisClusterIds ?? []);
        if (leftClusters.size === 0 && rightClusters.size === 0) return true;
        if ([...leftClusters].some((clusterId) => rightClusters.has(clusterId))) return true;
      }
    }
    return false;
  });
  if (repeatedWithinSameCluster) {
    issues.push("cross_analysis_evidence_repetition");
  }

  const conclusion = textById.get("conclusion") ?? "";
  if (conclusion && centralAnswer) {
    const answerTerms = semanticTerms(centralAnswer);
    const conclusionTerms = new Set(semanticTerms(conclusion));
    if (answerTerms.length > 0 && answerTerms.filter((term) => conclusionTerms.has(term)).length < 1) {
      issues.push("conclusion_not_aligned_to_central_answer");
    }
  } else if (input.sections.length > 0) {
    issues.push("missing_conclusion_content");
  }

  return { passed: issues.length === 0, issues: unique(issues) };
}

export interface BoundedCoherenceDiff {
  sectionId: string;
  before: string;
  after: string;
  audit: BoundedEditorialAudit;
}

/**
 * Adds only plan-authored, fact-free connections around existing prose. The
 * edit is discarded unless citation order/identity and limitation language are
 * preserved exactly.
 */
export function applyBoundedCoherencePass<T extends {
  sectionId: string;
  body: string;
  prose?: string | null;
  synthesizedProseZhTw?: string | null;
}>(input: {
  sections: T[];
  discoursePlan?: DiscourseSection[] | null;
}): { sections: T[]; diffs: BoundedCoherenceDiff[] } {
  const discourse = input.discoursePlan ?? [];
  const thematic = discourse.filter((section) => section.sectionRole === "thematic_analysis");
  const roleForSection = (sectionId: string): DiscourseSection | undefined => {
    if (sectionId === "research_question") {
      return discourse.find((section) => section.sectionRole === "research_question_and_scope");
    }
    if (sectionId === "literature_review") return thematic[0];
    if (sectionId === "findings") return thematic.length > 1 ? thematic[1] : undefined;
    if (sectionId === "discussion") {
      return discourse.find((section) => section.sectionRole === "cross_source_synthesis");
    }
    if (sectionId === "limitations") {
      return discourse.find((section) => section.sectionRole === "limitations_and_gaps");
    }
    if (sectionId === "conclusion") {
      return discourse.find((section) => section.sectionRole === "direct_answer");
    }
    return undefined;
  };
  const diffs: BoundedCoherenceDiff[] = [];
  const sections = input.sections.map((section) => {
    const plan = roleForSection(section.sectionId);
    const before = clean(section.body);
    if (!before) return section;
    const normalizedBefore = normalizeTraditionalChineseTerminology(before);
    if (!plan && normalizedBefore === before) return section;
    const connection = clean(plan?.connectionFromPrevious);
    const transition = clean(plan?.transitionToNext);
    const prefix = connection && !normalizedBefore.includes(connection) ? connection : "";
    const suffix = transition && !normalizedBefore.includes(transition) ? transition : "";
    const after = [prefix, normalizedBefore, suffix].filter(Boolean).join("\n\n");
    if (after === before) return section;
    const audit = auditBoundedEditorialPass(before, after);
    if (!audit.passed) return section;
    diffs.push({ sectionId: section.sectionId, before, after, audit });
    return {
      ...section,
      body: after,
      ...(section.prose !== undefined ? { prose: after } : {}),
      ...(section.synthesizedProseZhTw !== undefined
        ? { synthesizedProseZhTw: after }
        : {}),
    };
  });
  return { sections, diffs };
}

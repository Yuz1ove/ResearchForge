import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard } from "@workspace/api-zod/research-grounding";
import { buildFormalResearchArchitecture } from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import {
  assertPresentFactsHaveProvenance,
  extractStudyFactEnvelopeV2,
  type StudyDocumentInputV2,
} from "../artifacts/api-server/src/services/research/study-fact-extraction-v2.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(repositoryRoot, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-evidence-gap-formal-synthesis-v3-20260827T150400+0800");
const replayRoot = path.join(outputRoot, "deterministic-replay");
const baselineRoot = path.join(repositoryRoot, "artifacts/qa/researchforge-general-study-fact-extraction-v2-live-20260826T222300+0800");
const gapMap = JSON.parse(fs.readFileSync(path.join(outputRoot, "CASE-EVIDENCE-GAP-MAP.json"), "utf8")) as { cases: Array<{ caseId: string; slug: string; topic: string; researchQuestion: string }> };
const protectedFixture = path.join(repositoryRoot, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

function writeJson(relative: string, value: unknown): void {
  const target = path.join(replayRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relative: string, value: string): void {
  const target = path.join(replayRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function sha256(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function studyInput(source: SourceRecord): StudyDocumentInputV2 {
  const raw = source as SourceRecord & {
    extractedAbstract?: string;
    abstractOriginal?: string;
    accessLevel?: string;
    extractionMethod?: string;
    extractionMode?: string;
    extractionStatus?: string;
    fullTextCharCount?: number;
    extractedText?: string;
    extractedSections?: Array<{ heading?: string; text: string; page?: number; confidence?: number }>;
    extractedChunks?: Array<{ text: string; section_heading?: string; source_location?: string; page?: number; char_start?: number; char_end?: number }>;
    qualityFlags?: string[];
    extractionWarnings?: string[];
  };
  return {
    sourceId: source.id,
    documentId: `${source.id}:replay-v3`,
    title: source.title,
    year: source.year,
    canonicalId: source.doi ?? source.dedupeKey ?? source.id,
    abstract: raw.extractedAbstract ?? raw.abstractOriginal ?? source.abstract,
    accessLevel: raw.accessLevel,
    extractionMethod: raw.extractionMethod ?? raw.extractionMode,
    extractionStatus: raw.extractionStatus,
    fullTextCharCount: raw.fullTextCharCount,
    extractedText: raw.extractedText,
    sections: raw.extractedSections,
    chunks: raw.extractedChunks,
    qualityFlags: [...(raw.qualityFlags ?? []), ...(raw.extractionWarnings ?? [])],
  };
}

function attachStudyFactV2(sources: SourceRecord[], cards: EvidenceCard[]): { cards: EvidenceCard[]; envelopes: Json[] } {
  const envelopeBySource = new Map(sources.map((source) => {
    const envelope = extractStudyFactEnvelopeV2(studyInput(source));
    assertPresentFactsHaveProvenance(envelope);
    return [source.id, envelope];
  }));
  return {
    cards: cards.map((card) => {
      const envelope = envelopeBySource.get(card.sourceId);
      if (!envelope || !card.structuredStudyFact) return card;
      return {
        ...card,
        structuredStudyFact: {
          ...card.structuredStudyFact,
          studyFactV2: envelope as unknown as Record<string, unknown>,
        },
      };
    }),
    envelopes: [...envelopeBySource.values()] as unknown as Json[],
  };
}

function runCase(config: (typeof gapMap.cases)[number]): Json {
  const sourceDir = path.join(baselineRoot, `case-${config.caseId}-${config.slug}`);
  const outputDir = `cases/case-${config.caseId}-${config.slug}`;
  const sources = readJson<SourceRecord[]>(path.join(sourceDir, "accepted-sources.json"));
  const cards = readJson<EvidenceCard[]>(path.join(sourceDir, "evidence-cards.json"));
  const groundingJob = readJson<Json>(path.join(sourceDir, "grounding-job.json"));
  const enriched = attachStudyFactV2(sources, cards);
  const architecture = buildFormalResearchArchitecture({
    sources,
    evidenceCards: enriched.cards as unknown as import("../artifacts/api-server/src/services/report-writer.ts").ReportWriterEvidenceCard[],
    workflow: {
      workflowId: `baseline-replay-v3-${config.caseId}`,
      topicHash: createHash("sha256").update(config.topic).digest("hex").slice(0, 12),
      normalizedTopic: config.topic,
      researchQuestion: config.researchQuestion,
      namedProviders: ["OpenAlex", "Crossref", "Semantic Scholar"],
      reproducibleSearchStrategy: true,
      explicitInclusionCriteria: true,
      explicitExclusionCriteria: true,
      screeningProcedure: true,
      duplicateRemoval: true,
      documentedStudySelection: true,
      qualityAssessment: true,
      queryExpansion: true,
      themeSynthesis: true,
      searchQueries: [],
      searchDates: ["2026-08-25"],
      searchLanguages: ["zh-TW", "en"],
      fullTextRetrievalMethods: ["frozen baseline payload replay"],
      evidenceExtractionMethods: ["Study Fact V2 current deterministic parser", "semantic theme V3", "source independence V3"],
      relevanceQualityAssessmentMethods: ["frozen topic-integrity decision", "type-specific admission"],
      inclusionCriteria: ["frozen accepted sources only"],
      exclusionCriteria: ["no new provider content", "no unsupported source upgrade"],
      topicIntegrityPolicy: "fail closed",
    },
  });
  const directIds = new Set(architecture.evidenceMatrix.flatMap((row) => row.sourceIds));
  const directStudies = architecture.studies.filter((study) => directIds.has(study.sourceId));
  writeJson(`${outputDir}/accepted-sources.json`, sources);
  writeJson(`${outputDir}/canonical-evidence-cards.json`, enriched.cards);
  writeJson(`${outputDir}/report-plan.json`, groundingJob.reportPlan ?? null);
  writeJson(`${outputDir}/structured-study-facts.json`, enriched.envelopes.filter((envelope) => directIds.has(String(envelope.sourceId ?? ""))));
  writeJson(`${outputDir}/study-admission-matrix.json`, architecture.evidenceCoverage.typeSpecificAdmission ?? []);
  writeJson(`${outputDir}/theme-matrix.json`, architecture.evidenceMatrix);
  writeJson(`${outputDir}/source-independence-matrix.json`, architecture.evidenceMatrix.flatMap((row) => row.sourceIndependence ?? []));
  writeJson(`${outputDir}/evidence-diversity-audit.json`, architecture.evidenceMatrix.map((row) => ({
    themeId: row.themeId,
    normalizedProposition: row.normalizedProposition,
    evidenceDiversity: row.evidenceDiversity,
    independentStudyIds: row.independentStudyIds,
    primaryIndependentSourceCount: row.primaryIndependentSourceCount,
    formalIndependentSourceCount: row.formalIndependentSourceCount,
    admissionStatus: row.admissionStatus,
  })));
  writeJson(`${outputDir}/central-answer-contract.json`, {
    researchQuestions: architecture.researchBlueprint.researchQuestions,
    synthesisAxes: architecture.researchBlueprint.synthesisAxes,
    conclusionRequirements: architecture.researchBlueprint.conclusionRequirements,
    closureMatrix: architecture.researchQuestionClosureMatrix,
  });
  writeJson(`${outputDir}/claim-audit.json`, {
    stage: "DETERMINISTIC_PRE_WRITER_REPLAY",
    status: architecture.reportClassification === "FORMAL_RESEARCH_REPORT" ? "PENDING_LIVE_FORMAL_CONFIRMATION" : "NOT_RUN_FAIL_CLOSED",
    providerRequests: 0,
    writerRequests: 0,
    quantitativeFacts: architecture.quantitativeFactRegistry,
    claimAllocations: architecture.sectionClaimAllocations,
  });
  writeJson(`${outputDir}/writer-admission-decision.json`, {
    deterministicReplayClassification: architecture.reportClassification,
    liveWriterAuthorized: false,
    reason: architecture.reportClassification === "FORMAL_RESEARCH_REPORT"
      ? "DETERMINISTIC_REPLAY_DOES_NOT_REPLACE_LIVE_FORMAL_ADMISSION"
      : `WRITER_LOCKED:${architecture.reportClassification}`,
    writerRequests: 0,
  });
  const result = {
    caseId: config.caseId,
    slug: config.slug,
    topic: config.topic,
    evidenceSource: "FROZEN_2026-08-26_STUDY_FACT_V2_LIVE_PAYLOAD",
    providerRequests: 0,
    writerRequests: 0,
    classification: architecture.reportClassification,
    acceptedSources: sources.length,
    directStudies: architecture.evidenceCoverage.directStudyCount,
    fullTextStudies: architecture.evidenceCoverage.fullTextStudyCount,
    limitedStudies: architecture.evidenceCoverage.limitedAdmissionCount ?? 0,
    formalStudies: architecture.evidenceCoverage.formalAdmissionCount ?? 0,
    themes: architecture.evidenceMatrix.length,
    formalThemes: architecture.evidenceMatrix.filter((row) => row.admissionStatus === "FORMAL").length,
    reasons: architecture.evidenceCoverage.reasons,
    protectedInputUnchanged: true,
  };
  writeJson(`${outputDir}/qa.json`, result);
  return result;
}

function main(): void {
  const before = sha256(protectedFixture);
  if (before !== expectedProtectedSha) throw new Error(`PROTECTED_FIXTURE_MISMATCH:${before}`);
  const results = gapMap.cases.map(runCase);
  const after = sha256(protectedFixture);
  const formal = results.filter((item) => item.classification === "FORMAL_RESEARCH_REPORT").length;
  const limited = results.filter((item) => item.classification === "LIMITED_EVIDENCE_BRIEF").length;
  const blocked = results.length - formal - limited;
  writeJson("ACCEPTANCE-MATRIX.json", {
    schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/deterministic-replay",
    status: formal >= 8 && formal + limited === 10 ? "PASS_REPLAY_ONLY" : "PARTIAL_REPLAY_ONLY",
    formal,
    limited,
    blocked,
    topics: results,
    providerRequests: 0,
    writerRequests: 0,
    protectedFixture: { expectedProtectedSha, before, after, unchanged: before === after && after === expectedProtectedSha },
  });
  writeText("VERDICT.txt", formal >= 8 && formal + limited === 10 ? "PASS_REPLAY_ONLY" : "PARTIAL_REPLAY_ONLY");
  process.stdout.write(`${formal >= 8 && formal + limited === 10 ? "PASS_REPLAY_ONLY" : "PARTIAL_REPLAY_ONLY"}\n${replayRoot}\n`);
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") main();

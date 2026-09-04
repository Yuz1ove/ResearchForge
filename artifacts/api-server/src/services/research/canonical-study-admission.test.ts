import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalStudyAdmissionResult,
  GroundingJob,
} from "@workspace/api-zod/research-grounding";
import {
  buildEvidenceCoverageGate,
  projectCanonicalAdmissionForWriter,
  type StructuredStudyEvidence,
} from "../formal-research-architecture";
import { buildAcquisitionTerminalManifest } from "./grounding/researchAcquisitionLifecycle";
import {
  deriveCanonicalStudyAdmission,
  validateCanonicalAdmissionSet,
  type CanonicalAdmissionDecisionContext,
} from "./canonical-study-admission";
import {
  admitStudyFactEnvelopeV2,
  extractStudyFactEnvelopeV2,
  type StudyDocumentInputV2,
  type StudyFactEnvelopeV2,
} from "./study-fact-extraction-v2";

const DECIDED_AT = "2026-08-28T00:00:00.000Z";

function context(
  overrides: Partial<CanonicalAdmissionDecisionContext> = {},
): CanonicalAdmissionDecisionContext {
  return {
    jobId: "job-fixture",
    workflowId: "workflow-fixture",
    jobRevision: 17,
    checkpointRevision: 17,
    acquisitionTerminal: true,
    decidedAt: DECIDED_AT,
    ...overrides,
  };
}

function extract(input: Partial<StudyDocumentInputV2> & { sourceId: string; title: string }): StudyFactEnvelopeV2 {
  return extractStudyFactEnvelopeV2({
    accessLevel: "full_text",
    extractionMethod: "html_readability",
    extractionStatus: "text_extracted",
    ...input,
  });
}

function formalEnvelope(sourceId = "source-formal"): StudyFactEnvelopeV2 {
  return extract({
    sourceId,
    title: "Randomized learning trial",
    fullTextCharCount: 4_000,
    sections: [
      {
        heading: "Abstract",
        text: "This randomized controlled trial aimed to evaluate a tutoring intervention and found that the intervention improved the primary learning score compared with control.",
      },
      {
        heading: "Methods",
        text: "We conducted a randomized controlled trial with 240 students. Students were randomly assigned to the tutoring intervention or a control group. The primary outcome score was measured after 12 weeks. ".repeat(8),
      },
      {
        heading: "Results",
        text: "The intervention improved the primary outcome score compared with the control group. The mean score was 82.4 and the result showed a significant positive effect. ".repeat(8),
      },
    ],
  });
}

function sourceForFullText(sourceId: string) {
  return {
    id: sourceId,
    sourceId,
    accessLevel: "full_text",
    contentLevel: "full_text",
    extractionStatus: "text_extracted",
    extractionMethod: "html_readability",
    fullTextCharCount: 4_000,
    fullTextUrl: `https://repository.example/${sourceId}`,
    contentHash: `sha256:${sourceId}`,
    enrichmentProvenance: [{
      accessState: "FULL_TEXT_HTML",
      checksum: `sha256:${sourceId}`,
      resolvedUrl: `https://repository.example/${sourceId}`,
      artifactCreated: true,
      legalAccess: true,
    }],
  };
}

function studyForAdmission(
  admission: CanonicalStudyAdmissionResult,
): StructuredStudyEvidence {
  return {
    sourceId: admission.sourceId,
    studyId: admission.studyId,
    title: admission.studyId,
    studyDesign: "randomized controlled trial",
    studyDesignExplicit: true,
    evidenceSpans: [],
    readerClaims: [],
    extractionConfidence: 1,
    extractionSource: admission.accessState === "ABSTRACT_ONLY" ? "abstract" : "full_text",
    verificationStatus: "verified",
    evidenceAvailability: admission.accessState === "ABSTRACT_ONLY"
      ? "ABSTRACT_AVAILABLE"
      : "FULL_TEXT_AVAILABLE",
    contentAccessState: admission.accessState === "ABSTRACT_ONLY"
      ? "abstract_only"
      : "full_text",
    canonicalAdmission: admission,
  };
}

function decisionAs(
  base: CanonicalStudyAdmissionResult,
  caseId: string,
  index: number,
  admissionClass: CanonicalStudyAdmissionResult["admissionClass"],
): CanonicalStudyAdmissionResult {
  const sourceId = `${caseId}-source-${index}`;
  return {
    ...base,
    decisionId: `${caseId}-decision-${index}`,
    sourceId,
    studyId: sourceId,
    evidenceRevision: `${caseId}-revision-${index}`,
    admissionClass,
    reasonCodes: admissionClass === "FORMAL"
      ? ["QUALIFYING_FULL_TEXT_PRESENT", "STUDY_FACTS_READY", "FORMAL_ADMITTED"]
      : admissionClass === "LIMITED"
        ? ["ABSTRACT_ONLY", "STUDY_FACTS_READY", "LIMITED_ADMITTED"]
        : ["ACCESS_UNKNOWN", "INSUFFICIENT_STUDY_FACTS"],
  };
}

function manifestFor(
  caseId: string,
  admissions: CanonicalStudyAdmissionResult[],
) {
  const job = {
    jobId: "job-fixture",
    workflowId: "workflow-fixture",
    revision: 17,
    originalTopic: caseId,
    createdAt: DECIDED_AT,
    updatedAt: DECIDED_AT,
    acceptedSources: [],
    sourceCandidates: [],
    claimCandidates: [],
    warnings: [],
    providerErrors: [],
    canonicalStudyAdmissions: admissions,
    requestPayload: { caseId },
  } as unknown as GroundingJob;
  return buildAcquisitionTerminalManifest(job, "COMPLETE", DECIDED_AT);
}

test("Case07 contradiction: abstract evidence plus ACCESS_DENIED cannot be FORMAL", () => {
  const envelope = extract({
    sourceId: "case-07-source",
    title: "HIIT compared with MICT",
    accessLevel: "abstract_only",
    abstract: "A randomized trial assigned 80 adults to a HIIT intervention or MICT control group. Results showed improved cardiorespiratory fitness after training.",
  });
  assert.equal(envelope.documentInterpretability, "ABSTRACT_ONLY");
  assert.equal(admitStudyFactEnvelopeV2(envelope).level, "LIMITED");

  const decision = deriveCanonicalStudyAdmission({
    source: {
      id: "case-07-source",
      sourceId: "case-07-source",
      accessLevel: "abstract_only",
      abstract: "A randomized trial assigned adults to HIIT or MICT.",
      fullTextCharCount: 0,
      enrichmentProvenance: [{
        accessState: "ACCESS_DENIED",
        artifactCreated: false,
        legalAccess: false,
      }],
    },
    envelope,
    context: context(),
  });

  assert.equal(decision.accessState, "ABSTRACT_ONLY");
  assert.equal(decision.admissionClass, "LIMITED");
  assert.ok(decision.reasonCodes.includes("FULL_TEXT_ACCESS_DENIED"));
  assert.ok(!decision.reasonCodes.includes("FORMAL_ADMITTED"));
});

test("UNKNOWN remains distinct while acquisition is incomplete", () => {
  const envelope = extract({
    sourceId: "source-incomplete",
    title: "Incomplete observational record",
    accessLevel: "abstract_only",
    abstract: "A cross-sectional survey examined an association, but the full article was not acquired.",
  });
  assert.equal(envelope.coreFacts.outcome.status, "UNKNOWN");
  assert.equal(envelope.populationContext.status, "UNKNOWN");

  const decision = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-incomplete"),
    envelope,
    context: context({ acquisitionTerminal: false }),
  });
  assert.equal(decision.accessState, "UNKNOWN");
  assert.equal(decision.admissionClass, "BLOCKED");
  assert.ok(decision.reasonCodes.includes("ACQUISITION_INCOMPLETE"));
});

test("NOT_REPORTED requires a qualifying document and an inspected relevant section", () => {
  const noOutcomeSection = extract({
    sourceId: "source-no-outcome-section",
    title: "Methods-only cross-sectional survey",
    fullTextCharCount: 3_000,
    sections: [{
      heading: "Methods",
      text: "A cross-sectional survey included 200 participants and used regression analysis. Recruitment, sampling, data collection, model specification, and quality-control procedures were documented in detail. ".repeat(16),
    }],
  });
  assert.ok(["INTERPRETABLE", "PARTIAL"].includes(noOutcomeSection.documentInterpretability));
  assert.equal(noOutcomeSection.coreFacts.outcome.status, "UNKNOWN");

  const inspectedResults = extract({
    sourceId: "source-inspected-results",
    title: "Cross-sectional survey with inspected results",
    fullTextCharCount: 3_000,
    sections: [
      {
        heading: "Methods",
        text: "A cross-sectional survey included 200 participants and used regression analysis. Recruitment and measurement procedures were documented. ".repeat(10),
      },
      {
        heading: "Results",
        text: "The results described the analytic sample and response quality but omitted the prespecified endpoint. Descriptive characteristics were reported without naming that endpoint. ".repeat(10),
      },
    ],
  });
  assert.equal(inspectedResults.coreFacts.outcome.status, "NOT_REPORTED");
});

test("abstract-only evidence can be LIMITED but never FORMAL", () => {
  const envelope = extract({
    sourceId: "source-abstract",
    title: "Abstract-only impact study",
    accessLevel: "abstract_only",
    abstract: "A cross-sectional survey of 620 students found that longer sleep was associated with higher academic performance after adjustment.",
  });
  const decision = deriveCanonicalStudyAdmission({
    source: {
      id: "source-abstract",
      sourceId: "source-abstract",
      accessLevel: "abstract_only",
      abstract: "A cross-sectional survey found that longer sleep was associated with higher academic performance.",
    },
    envelope,
    context: context(),
  });
  assert.equal(decision.accessState, "ABSTRACT_ONLY");
  assert.notEqual(decision.admissionClass, "FORMAL");
});

test("qualifying full text with complete facts and provenance is FORMAL", () => {
  const envelope = formalEnvelope();
  assert.equal(admitStudyFactEnvelopeV2(envelope).level, "FORMAL");
  const decision = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-formal"),
    envelope,
    context: context(),
  });
  assert.equal(decision.accessState, "FULL_TEXT_HTML");
  assert.equal(decision.parserState, "COMPLETE");
  assert.equal(decision.studyFactState, "READY");
  assert.equal(decision.provenanceState, "READY");
  assert.equal(decision.admissionClass, "FORMAL");
  assert.ok(decision.qualifyingArtifactRefs.length > 0);
});

test("explicitly rejected acquisition artifact cannot use character count to bypass canonical qualification", () => {
  const envelope = formalEnvelope("source-wrong-pdf");
  const decision = deriveCanonicalStudyAdmission({
    source: {
      ...sourceForFullText("source-wrong-pdf"),
      enrichmentProvenance: [{
        accessState: "FULL_TEXT_PDF",
        checksum: "download-checksum",
        resolvedUrl: "https://repository.example/wrong.pdf",
        artifactCreated: true,
        legalAccess: true,
        qualifyingFullText: false,
        acquisitionOutcome: "WRONG_ARTICLE_MATCH",
        artifact: {
          checksum: "download-checksum",
          resolvedUrl: "https://repository.example/wrong.pdf",
          qualificationResult: "REJECTED",
          qualificationReason: "WRONG_ARTICLE_MATCH",
          identityMatch: "MISMATCH",
        },
      }],
    },
    envelope,
    context: context(),
  });
  assert.equal(decision.accessState, "NO_USABLE_ARTIFACT");
  assert.equal(decision.admissionClass, "BLOCKED");
  assert.equal(decision.qualifyingArtifactRefs.length, 0);
  assert.ok(!decision.reasonCodes.includes("FORMAL_ADMITTED"));
});

test("stale job revisions fail canonical admission validation", () => {
  const admission = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-formal"),
    envelope: formalEnvelope(),
    context: context({ jobRevision: 16 }),
  });
  const validation = validateCanonicalAdmissionSet({
    admissions: [admission],
    jobId: "job-fixture",
    workflowId: "workflow-fixture",
    jobRevision: 17,
    requiredSourceIds: ["source-formal"],
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.issues.includes("STALE_REVISION:job_revision:source-formal"));
});

test("stale checkpoint revisions fail canonical admission validation", () => {
  const admission = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-formal"),
    envelope: formalEnvelope(),
    context: context({ checkpointRevision: 16 }),
  });
  const validation = validateCanonicalAdmissionSet({
    admissions: [admission],
    jobId: "job-fixture",
    workflowId: "workflow-fixture",
    jobRevision: admission.jobRevision,
    checkpointRevision: 17,
    requiredSourceIds: ["source-formal"],
  });
  assert.equal(validation.pass, false);
  assert.ok(
    validation.issues.includes(
      "STALE_REVISION:checkpoint_revision:source-formal",
    ),
  );
});

test("owner-issued evidence revision remains opaque to downstream consumers", () => {
  const admission = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-formal"),
    envelope: formalEnvelope(),
    context: context(),
  });
  const validation = validateCanonicalAdmissionSet({
    admissions: [admission],
    jobId: admission.jobId,
    workflowId: admission.workflowId,
    jobRevision: admission.jobRevision,
    checkpointRevision: admission.checkpointRevision,
    requiredSourceIds: [admission.sourceId],
  });
  assert.equal(validation.pass, true);
  assert.equal(validation.issues.length, 0);
  assert.match(admission.evidenceRevision, /^[a-f0-9]{64}$/u);
});

test("historical Cases02/07/08/09 project identical exact counts across all consumers", () => {
  const formalBase = deriveCanonicalStudyAdmission({
    source: sourceForFullText("source-formal"),
    envelope: formalEnvelope(),
    context: context(),
  });
  const historicalCases = [
    { caseId: "case-02", limited: 3, formal: 1, blocked: 0 },
    { caseId: "case-07", limited: 2, formal: 0, blocked: 0 },
    { caseId: "case-08", limited: 1, formal: 1, blocked: 0 },
    { caseId: "case-09", limited: 5, formal: 4, blocked: 0 },
  ];

  for (const fixture of historicalCases) {
    const classes: CanonicalStudyAdmissionResult["admissionClass"][] = [
      ...Array.from({ length: fixture.limited }, () => "LIMITED" as const),
      ...Array.from({ length: fixture.formal }, () => "FORMAL" as const),
      ...Array.from({ length: fixture.blocked }, () => "BLOCKED" as const),
    ];
    const admissions = classes.map((admissionClass, index) =>
      decisionAs(formalBase, fixture.caseId, index, admissionClass)
    );
    const manifest = manifestFor(fixture.caseId, admissions);
    const coverage = buildEvidenceCoverageGate(
      admissions.map(studyForAdmission),
      [],
    );
    const writer = projectCanonicalAdmissionForWriter(admissions);
    const writerCount = (value: CanonicalStudyAdmissionResult["admissionClass"]) =>
      writer.filter((item) => item.admissionClass === value).length;

    assert.equal(manifest.limitedStudyCount, fixture.limited, fixture.caseId);
    assert.equal(manifest.formalStudyCount, fixture.formal, fixture.caseId);
    assert.equal(manifest.blockedStudyCount, fixture.blocked, fixture.caseId);
    assert.equal(coverage.limitedAdmissionCount, fixture.limited, fixture.caseId);
    assert.equal(coverage.formalAdmissionCount, fixture.formal, fixture.caseId);
    assert.equal(coverage.blockedAdmissionCount, fixture.blocked, fixture.caseId);
    assert.equal(writerCount("LIMITED"), fixture.limited, fixture.caseId);
    assert.equal(writerCount("FORMAL"), fixture.formal, fixture.caseId);
    assert.equal(writerCount("BLOCKED"), fixture.blocked, fixture.caseId);
  }
});

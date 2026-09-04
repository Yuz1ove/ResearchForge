import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const priorBundle = resolve(
  repositoryRoot,
  "artifacts/qa/researchforge-legal-oa-discovery-and-qualification-coverage-v1-20260829T035503+0800",
);
const outputArgument = process.argv[2];
if (!outputArgument) {
  throw new Error("Usage: node scripts/build-oa-payload-forensics-v2.mjs <qa-directory>");
}
const outputDirectory = resolve(repositoryRoot, outputArgument);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (name, value) => {
  writeFileSync(resolve(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? "").normalize("NFKC").trim();
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];
const countBy = (values) => Object.fromEntries(
  [...values.reduce((map, value) => {
    const key = clean(value) || "UNKNOWN";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
);

function caseDirectory(caseId) {
  const prefix = `case-${caseId}-`;
  const directory = readdirSync(priorBundle).find((name) => name.startsWith(prefix));
  if (!directory) throw new Error(`Missing prior case directory: ${prefix}`);
  return resolve(priorBundle, directory);
}

function acquisitionRequests(source) {
  const requests = [];
  for (const provenanceValue of list(source.enrichmentProvenance)) {
    const provenance = record(provenanceValue);
    for (const requestValue of list(provenance.resolverRequests)) {
      const request = record(requestValue);
      if (request.phase === "ACQUISITION" && request.artifactCreated === true) {
        requests.push({ ...request, provenance });
      }
    }
  }
  const seen = new Set();
  return requests.filter((request) => {
    const key = [request.provider, request.url, request.resolvedUrl, request.status, request.contentType,
      request.bytesDownloaded, request.acquisitionOutcome].map(clean).join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectRepresentative(source, requests) {
  const provenance = [...list(source.enrichmentProvenance)]
    .map(record)
    .reverse()
    .find((entry) => list(entry.resolverRequests).some((request) => record(request).artifactCreated === true));
  if (!provenance) return { request: requests[0] ?? {}, provenance: {} };
  const exact = requests.find((request) =>
    clean(request.resolvedUrl) === clean(provenance.resolvedUrl) &&
    Number(request.bytesDownloaded ?? 0) === Number(provenance.contentLength ?? 0) &&
    clean(request.url) === clean(provenance.url)
  );
  const contentMatch = requests.find((request) =>
    clean(request.resolvedUrl) === clean(provenance.resolvedUrl) &&
    Number(request.bytesDownloaded ?? 0) === Number(provenance.contentLength ?? 0)
  );
  return { request: exact ?? contentMatch ?? requests[0] ?? {}, provenance };
}

function extensionFor(value) {
  try {
    return extname(new URL(clean(value)).pathname).toLowerCase() || null;
  } catch {
    return null;
  }
}

function charsetFor(contentType) {
  return clean(contentType).match(/charset\s*=\s*([^;\s]+)/iu)?.[1]?.toLowerCase() ?? null;
}

function payloadClass(input) {
  const { source, request, provenance, artifact } = input;
  const contentType = clean(request.contentType || provenance.contentType).toLowerCase();
  const outcome = clean(provenance.acquisitionOutcome || request.acquisitionOutcome);
  const warnings = unique([
    ...list(source.extractionWarnings),
    ...list(source.qualityFlags),
    source.failureReason,
    provenance.failureReason,
    provenance.qualificationReason,
    outcome,
  ]).join(" ");
  const markers = list(artifact.structureMarkers);
  const textLength = Number(artifact.textLength ?? source.fullTextCharCount ?? 0);
  if (/HTML_RETURNED_AS_PDF/iu.test(warnings)) return "HTML_LANDING";
  if (/OCR_REQUIRED|PDF_REQUIRES_OCR|PDF_PARSE_EMPTY_TEXT|PDF_TEXT_EXTRACTION_UNAVAILABLE/iu.test(warnings)) {
    return "PDF_SCANNED";
  }
  if (/CORRUPT_PDF|INVALID_PDF_MAGIC/iu.test(warnings)) return "PDF_INVALID";
  if (/jats/iu.test(contentType)) return textLength > 0 ? "XML_JATS" : "XML_OTHER";
  if (/tei/iu.test(contentType)) return textLength > 0 ? "XML_TEI" : "XML_OTHER";
  if (/xml/iu.test(contentType)) return "XML_OTHER";
  if (/json/iu.test(contentType)) return "JSON_METADATA";
  if (/pdf/iu.test(contentType)) return "BINARY_UNKNOWN";
  if (/html|xhtml/iu.test(contentType)) {
    if (/LOGIN|AUTH_REQUIRED/iu.test(warnings)) return "HTML_LOGIN";
    if (/PAYWALL|LICENSE_RESTRICTED/iu.test(warnings)) return "HTML_PAYWALL";
    if (/HTTP_200_ERROR|SERVER_ERROR/iu.test(warnings)) return "HTML_ERROR";
    if (textLength >= 1_200 && markers.length >= 2) return "HTML_ARTICLE";
    if (/ABSTRACT_ONLY/iu.test(warnings) && Number(request.bytesDownloaded ?? 0) > 8_000) return "HTML_ABSTRACT_ONLY";
    return "HTML_LANDING";
  }
  if (/text\//iu.test(contentType)) return "TEXT";
  return "BINARY_UNKNOWN";
}

function falseNegativeAssessment(payloadClassValue, artifact, source) {
  const outcome = clean(artifact.qualificationReason || source.failureReason);
  if (payloadClassValue === "PDF_SCANNED") return "PARSER_LIMITATION_CONFIRMED";
  if (payloadClassValue === "HTML_ARTICLE" && outcome === "WRONG_ARTICLE_MATCH") {
    return "POSSIBLE_IDENTITY_FALSE_NEGATIVE_NEEDS_RAW_BODY";
  }
  if (["HTML_LANDING", "HTML_ABSTRACT_ONLY", "HTML_LOGIN", "HTML_PAYWALL", "HTML_ERROR", "JSON_METADATA"].includes(payloadClassValue)) {
    return "PAYLOAD_NOT_CANONICAL_FULLTEXT";
  }
  return "INDETERMINATE_RAW_PAYLOAD_NOT_PERSISTED";
}

const qualificationMatrix = readJson(resolve(priorBundle, "QUALIFICATION-MATRIX.json"));
const priorStudies = list(qualificationMatrix.studies)
  .filter((study) => study.directStudy === true && Number(study.acquiredArtifacts ?? 0) > 0);
if (priorStudies.length !== 18) {
  throw new Error(`Expected exactly 18 prior direct studies with fetched payloads, found ${priorStudies.length}`);
}

const jobCache = new Map();
const rows = priorStudies.map((study) => {
  if (!jobCache.has(study.caseId)) {
    const document = readJson(resolve(caseDirectory(study.caseId), "grounding-job-latest.json"));
    jobCache.set(study.caseId, record(document.job));
  }
  const job = jobCache.get(study.caseId);
  const source = list(job.sourceCandidates).find((candidate) => clean(candidate.sourceId) === clean(study.sourceId));
  if (!source) throw new Error(`Missing source ${study.caseId}/${study.sourceId}`);
  const requests = acquisitionRequests(source);
  if (requests.length === 0) throw new Error(`Missing acquired request ${study.caseId}/${study.sourceId}`);
  const { request, provenance } = selectRepresentative(source, requests);
  const artifact = record(provenance.artifact);
  const markers = unique([
    ...list(artifact.structureMarkers),
    ...list(source.extractedSections).map((section) => record(section).heading),
  ]);
  const requestUrl = clean(request.url) || null;
  const resolvedUrl = clean(request.resolvedUrl || provenance.resolvedUrl || request.url) || null;
  const redirectChain = unique([requestUrl, resolvedUrl]);
  const classValue = payloadClass({ source, request, provenance, artifact });
  const assessment = falseNegativeAssessment(classValue, artifact, source);
  const doiEvidence = list(artifact.identityEvidence).find((value) => /DOI/iu.test(clean(value)));
  const titleEvidence = list(artifact.identityEvidence).find((value) => /TITLE/iu.test(clean(value)));
  const reasonCodes = unique([
    ...list(source.extractionWarnings),
    ...list(source.qualityFlags),
    ...list(study.reasonCodes),
    source.failureReason,
    provenance.failureReason,
    provenance.acquisitionOutcome,
    provenance.qualificationReason,
    request.acquisitionOutcome,
    artifact.qualificationReason,
    "RAW_PAYLOAD_NOT_PERSISTED",
  ]);
  return {
    caseId: study.caseId,
    studyId: study.studyId,
    candidateId: study.sourceId,
    sourceProvider: request.provider ?? provenance.provider ?? source.provider ?? null,
    originalUrl: requestUrl,
    resolvedUrl,
    redirectChain,
    httpStatus: Number(request.status ?? 0),
    declaredContentType: clean(request.contentType || provenance.contentType) || null,
    detectedContentType: "UNKNOWN_NOT_PERSISTED",
    byteLength: Number(request.bytesDownloaded ?? provenance.contentLength ?? 0),
    magicBytes: "UNKNOWN_NOT_PERSISTED",
    fileExtension: extensionFor(requestUrl || resolvedUrl),
    charset: charsetFor(request.contentType || provenance.contentType),
    titleMatch: titleEvidence ?? "UNKNOWN_NOT_PERSISTED",
    doiMatch: doiEvidence ?? "UNKNOWN_NOT_PERSISTED",
    studyIdentityMatch: artifact.identityMatch ?? "UNKNOWN_NOT_PERSISTED",
    payloadClass: classValue,
    parserSelected: artifact.parserUsed ?? source.extractionMethod ?? "unknown",
    parseSuccess: Number(artifact.textLength ?? source.fullTextCharCount ?? 0) > 0,
    bodyCharacterCount: Number(artifact.textLength ?? source.fullTextCharCount ?? 0),
    bodyWordCount: null,
    sectionCount: list(source.extractedSections).length || list(artifact.structureMarkers).length || 0,
    referenceCount: null,
    pageCount: artifact.pageCount ?? source.pageCount ?? source.extractedPageCount ?? null,
    abstractDetected: Boolean(clean(source.extractedAbstract || source.abstract)),
    methodsDetected: markers.some((marker) => /methods?|materials?|methodology/iu.test(marker)),
    resultsDetected: markers.some((marker) => /results?|findings?/iu.test(marker)),
    discussionDetected: markers.some((marker) => /discussion|conclusions?/iu.test(marker)),
    fullTextSignals: markers,
    shellSignals: unique([
      Number(request.bytesDownloaded ?? 0) > 0 && Number(request.bytesDownloaded ?? 0) < 5_000 ? "SMALL_HTTP_200_PAYLOAD" : "",
      /NO_READABLE_BODY/iu.test(reasonCodes.join(" ")) ? "NO_READABLE_BODY" : "",
      /PUBLISHER_SHELL/iu.test(reasonCodes.join(" ")) ? "PUBLISHER_SHELL" : "",
      /ABSTRACT_ONLY/iu.test(reasonCodes.join(" ")) ? "ABSTRACT_ONLY_PROJECTION" : "",
    ]),
    qualificationDecision: artifact.qualificationResult ?? "REJECTED_OR_NOT_REACHED",
    qualificationReasonCodes: reasonCodes,
    detectionEvidence: {
      rawPayloadPersisted: false,
      rejectedParsedBodyPersisted: Number(source.fullTextCharCount ?? 0) > 0,
      declaredMimeObserved: Boolean(clean(request.contentType || provenance.contentType)),
      byteCountObserved: Number(request.bytesDownloaded ?? provenance.contentLength ?? 0) > 0,
      checksumObserved: Boolean(clean(provenance.checksum || artifact.checksum)),
      detectionMethod: "PRIOR_TELEMETRY_ONLY_NO_BYTE_SNIFF_REPLAY",
      mismatch: "UNKNOWN_NOT_PERSISTED",
    },
    falseNegativeAssessment: assessment,
    allAcquiredRoutes: requests.map((entry) => ({
      provider: entry.provider ?? null,
      originalUrl: entry.url ?? null,
      resolvedUrl: entry.resolvedUrl ?? null,
      httpStatus: Number(entry.status ?? 0),
      declaredContentType: entry.contentType ?? null,
      byteLength: Number(entry.bytesDownloaded ?? 0),
      acquisitionOutcome: entry.acquisitionOutcome ?? null,
    })),
  };
});

const summary = {
  schemaVersion: "researchforge-payload-forensics-summary/v2",
  evidenceMode: "PRIOR_CURRENT_LIVE_SAVED_TELEMETRY_ONLY",
  sourceArtifact: "artifacts/qa/researchforge-legal-oa-discovery-and-qualification-coverage-v1-20260829T035503+0800",
  generatedAt: new Date().toISOString(),
  payloadStudyCount: rows.length,
  rawPayloadsPersisted: rows.filter((row) => row.detectionEvidence.rawPayloadPersisted).length,
  byPayloadClass: countBy(rows.map((row) => row.payloadClass)),
  byFalseNegativeAssessment: countBy(rows.map((row) => row.falseNegativeAssessment)),
  evidenceLimits: [
    "The prior cohort persisted transport/audit metadata, checksums, byte counts, and some rejected qualification artifacts, but not raw response bytes.",
    "Magic bytes, byte-sniffed MIME, exact word/reference counts, and rejected body text therefore remain UNKNOWN_NOT_PERSISTED.",
    "No live refresh was used to rewrite prior evidence, and these 18 studies are excluded from V2 CURRENT LIVE acceptance.",
  ],
  answerToPrimaryQuestion: {
    conclusion: "MOSTLY_NON_FULLTEXT_OR_UNMATERIALIZED_WITH_CONFIRMED_PARSER_LIMITATIONS; EXACT_SPLIT_NOT_PROVABLE_FROM_PRIOR_PERSISTENCE",
    observed: "Saved telemetry shows small HTML landing/shell payloads and parser-unavailable/scanned-PDF outcomes dominate the 18 direct studies.",
    falseNegativeEvidence: "Only a persisted parsed qualification artifact can support a false-negative hypothesis; otherwise the prior rejected body and raw bytes are unavailable.",
    safetyDecision: "Do not lower canonical qualification. Repair byte sniffing, landing resolution, parser routing, and persistence first.",
  },
};

writeJson("PAYLOAD-FORENSICS.json", {
  schemaVersion: "researchforge-payload-forensics/v2",
  evidenceMode: "PRIOR_CURRENT_LIVE_FORENSIC_ONLY_NOT_ACCEPTANCE",
  sourceArtifact: summary.sourceArtifact,
  generatedAt: summary.generatedAt,
  payloads: rows,
});
writeJson("PAYLOAD-FORENSICS-SUMMARY.json", summary);
console.log(JSON.stringify({ outputDirectory, summary }, null, 2));

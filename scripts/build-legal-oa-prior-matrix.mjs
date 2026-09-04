import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const prior = resolve(
  root,
  "artifacts/qa/researchforge-full-text-acquisition-recovery-v1-20260828T223126+0800",
);
const output = resolve(
  root,
  "artifacts/qa/researchforge-legal-oa-discovery-and-qualification-coverage-v1-20260829T035503+0800/ROUTE-PROVIDER-FAILURE-MATRIX.json",
);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const routeMatrix = readJson(resolve(prior, "ACQUISITION-ROUTE-MATRIX.json"));
const acquisitionMatrix = readJson(resolve(prior, "FULL-TEXT-ACQUISITION-MATRIX.json"));
const qualificationMatrix = readJson(resolve(prior, "FULL-TEXT-QUALIFICATION-MATRIX.json"));

const studyKey = (value) => `${value.caseId}\u0000${value.sourceId}`;
const studies = new Map(acquisitionMatrix.studies.map((study) => [studyKey(study), study]));
const qualifications = new Map();
for (const row of qualificationMatrix.rows) {
  const key = studyKey(row);
  const existing = qualifications.get(key) ?? [];
  existing.push(row);
  qualifications.set(key, existing);
}

function normalizeDoi(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .replace(/^doi:\s*/iu, "")
    .toLowerCase() || null;
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/iu.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function routeType(row) {
  if (row.phase === "RESOLUTION") return "PROVIDER_METADATA_DISCOVERY";
  const value = `${row.contentType ?? ""} ${row.url ?? ""}`.toLowerCase();
  if (/jats|xml/u.test(value)) return "FULL_TEXT_XML";
  if (/pdf/u.test(value)) return "DIRECT_PDF";
  if (/html/u.test(value)) return "FULL_TEXT_OR_LANDING_HTML";
  if (/doi\.org/u.test(value)) return "DOI_LANDING";
  return "ARTIFACT_OR_LANDING_ROUTE";
}

function failure(row) {
  const code = String(row.acquisitionOutcome ?? row.failureReason ?? row.result ?? "UNKNOWN");
  if (row.ok && ["OA_LOOKUP_SUCCESS", "FULL_TEXT_QUALIFIED", "PDF_DOWNLOAD_SUCCESS", "HTML_FULL_TEXT_FOUND", "XML_JATS_FULL_TEXT_FOUND"].includes(code)) {
    return { failureClass: null, failureCode: null };
  }
  if (code === "ROBOTS_OR_TOS_BLOCKED") return { failureClass: "LEGAL_ACCESS", failureCode: "ROBOTS_OR_PROVIDER_POLICY_BLOCK" };
  if (code === "RIGHTS_OR_LICENSE_BLOCKED") return { failureClass: "LEGAL_ACCESS", failureCode: "LICENSE_UNCLEAR" };
  if (["HTTP_401", "HTTP_403"].includes(code)) return { failureClass: "LEGAL_ACCESS", failureCode: code === "HTTP_401" ? "LOGIN_REQUIRED" : "ACCESS_FORBIDDEN" };
  if (code === "HTTP_429") return { failureClass: "RATE_LIMIT", failureCode: "HTTP_429" };
  if (code === "PROVIDER_TIMEOUT") return { failureClass: "TIMEOUT", failureCode: "PROVIDER_TIMEOUT" };
  if (code === "PROVIDER_NETWORK_ERROR") return { failureClass: "NETWORK", failureCode: "PROVIDER_NETWORK_ERROR" };
  if (["PROVIDER_SERVER_ERROR", "PROVIDER_CIRCUIT_OPEN"].includes(code)) return { failureClass: "PROVIDER_TRANSIENT", failureCode: code };
  if (code === "HTTP_404") return { failureClass: "PROVIDER_PERMANENT", failureCode: "DEAD_ROUTE" };
  if (["NO_FULL_TEXT_DISCOVERED", "OA_LOOKUP_MISS", "DOI_RESOLUTION_FAILED"].includes(code)) return { failureClass: "DISCOVERY_MISS", failureCode: code };
  if (["WRONG_ARTICLE_MATCH", "WRONG_ARTICLE_VERSION"].includes(code)) return { failureClass: "IDENTITY_MISMATCH", failureCode: code };
  if (["PARSER_FAILED", "OCR_REQUIRED", "OCR_FAILED"].includes(code)) return { failureClass: "PARSER_FAILURE", failureCode: code };
  if (["LANDING_PAGE_ONLY", "ABSTRACT_ONLY", "INVALID_CONTENT_TYPE", "HTML_RETURNED_AS_PDF", "CORRUPT_PDF", "ENCRYPTED_PDF", "FULL_TEXT_TOO_SHORT", "FULL_TEXT_STRUCTURE_INVALID", "SUPPLEMENTARY_ONLY"].includes(code)) {
    return { failureClass: "CONTENT_INVALID", failureCode: code };
  }
  return { failureClass: "UNKNOWN", failureCode: code };
}

const seenAttempts = new Map();
const rows = routeMatrix.rows.map((row) => {
  const study = studies.get(studyKey(row)) ?? {};
  const candidateQualifications = qualifications.get(studyKey(row)) ?? [];
  const matchingQualification = candidateQualifications.find((entry) => {
    const artifact = entry.artifact ?? {};
    return canonicalUrl(artifact.sourceUrl) === canonicalUrl(row.url) ||
      canonicalUrl(artifact.resolvedUrl) === canonicalUrl(row.resolvedUrl ?? row.url);
  });
  const artifact = matchingQualification?.artifact ?? {};
  const attemptKey = `${row.caseId}\u0000${row.sourceId}\u0000${row.provider}\u0000${canonicalUrl(row.url)}\u0000${row.phase}`;
  const retryCount = seenAttempts.get(attemptKey) ?? 0;
  seenAttempts.set(attemptKey, retryCount + 1);
  const finalUrl = row.resolvedUrl ?? row.url ?? null;
  const requestedUrl = row.url ?? null;
  const redirectChain = requestedUrl && finalUrl && canonicalUrl(requestedUrl) !== canonicalUrl(finalUrl)
    ? [requestedUrl, finalUrl]
    : requestedUrl ? [requestedUrl] : [];
  const failureResult = failure(row);
  const title = typeof artifact.studyId === "string" && !/^10\./u.test(artifact.studyId)
    ? artifact.studyId
    : row.sourceId?.startsWith("title:") ? row.sourceId.slice(6) : null;
  return {
    caseId: row.caseId,
    studyId: row.studyId ?? study.studyId ?? null,
    canonicalStudyId: artifact.canonicalWorkId ?? study.studyId ?? row.studyId ?? null,
    DOI: row.doi ?? study.doi ?? artifact.identifiers?.doi ?? null,
    normalizedDOI: normalizeDoi(row.doi ?? study.doi ?? artifact.identifiers?.doi),
    title,
    provider: row.provider ?? null,
    phase: row.phase ?? null,
    routeType: routeType(row),
    discoveredUrl: row.phase === "ACQUISITION" ? row.url ?? null : null,
    landingUrl: null,
    requestedUrl,
    redirectChain,
    finalUrl,
    httpStatus: row.status ?? 0,
    contentType: row.contentType ?? null,
    contentLength: row.bytesDownloaded ?? artifact.byteLength ?? 0,
    accessClass: row.legalAccess === true ? "DECLARED_LEGAL_OA" : row.legalAccess === false ? "NOT_DECLARED_LEGAL_OA" : "UNKNOWN",
    oaStatus: row.legalAccess === true ? "OA" : row.legalAccess === false ? "NOT_OA" : "UNKNOWN",
    license: artifact.license ?? null,
    retryCount,
    elapsedMs: row.latencyMs ?? 0,
    circuitState: row.acquisitionOutcome === "PROVIDER_CIRCUIT_OPEN" ? "OPEN" : "CLOSED_OR_NOT_RECORDED",
    terminalReason: row.failureReason ?? row.acquisitionOutcome ?? row.result ?? null,
    ...failureResult,
    qualificationResult: matchingQualification?.canonicalQualified === true
      ? "CANONICAL_QUALIFIED"
      : matchingQualification?.qualifyingFullText === true
        ? "ARTIFACT_QUALIFIED_NOT_CANONICAL"
        : matchingQualification?.artifact?.qualificationResult ?? "NOT_APPLICABLE_OR_NOT_RECORDED",
    routeFingerprint: requestedUrl ? sha256(`${row.provider ?? "unknown"}\n${canonicalUrl(requestedUrl)}`) : null,
    artifactFingerprint: artifact.checksum ?? null,
  };
});

const countBy = (key) => Object.fromEntries(
  [...rows.reduce((map, row) => map.set(String(row[key] ?? "NONE"), (map.get(String(row[key] ?? "NONE")) ?? 0) + 1), new Map())]
    .sort(([left], [right]) => left.localeCompare(right)),
);

const outputValue = {
  schemaVersion: "researchforge-route-provider-failure-matrix/v1",
  evidenceMode: "PRIOR_CURRENT_LIVE_TELEMETRY_RECONCILIATION",
  sourceArtifact: "artifacts/qa/researchforge-full-text-acquisition-recovery-v1-20260828T223126+0800",
  generatedAt: new Date().toISOString(),
  attempts: rows.length,
  summary: {
    byProvider: countBy("provider"),
    byPhase: countBy("phase"),
    byFailureClass: countBy("failureClass"),
    byFailureCode: countBy("failureCode"),
    byQualificationResult: countBy("qualificationResult"),
  },
  telemetryGaps: [
    "Prior attempt telemetry did not preserve landingUrl separately from requestedUrl.",
    "Prior attempt telemetry preserved only the final resolved URL, not every redirect hop.",
    "Prior attempt telemetry did not preserve provider-declared OA status and license on every route attempt.",
    "Prior circuit telemetry exposed open skips but not full per-attempt closed/half-open state.",
    "Prior acquisition rows did not always preserve an exact title; null is retained rather than inferred.",
  ],
  rows,
};

writeFileSync(output, `${JSON.stringify(outputValue, null, 2)}\n`);
console.log(JSON.stringify({ output, attempts: rows.length, summary: outputValue.summary }, null, 2));

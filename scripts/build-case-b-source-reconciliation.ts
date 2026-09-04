import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-final-evidence-and-export-closure-20260824T075851+0800",
);
const caseDir = path.join(outputDir, "case-b");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(caseDir, name), "utf8")) as T;
}

function write(name: string, value: string): void {
  fs.writeFileSync(path.join(caseDir, name), value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function writeJson(name: string, value: unknown): void {
  write(name, JSON.stringify(value, null, 2));
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedDoi(value: unknown): string | null {
  const doi = clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:/iu, "").toLocaleLowerCase();
  return doi || null;
}

function normalizedUrl(value: unknown, doi: string | null): string | null {
  const raw = clean(value);
  if (doi) return `https://doi.org/${doi}`;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/u, "");
  } catch {
    return raw;
  }
}

const rawSources = readJson<Json[]>("targeted-accepted-sources.input.json");
const sourceReview = readJson<Json[]>("source-review.json");
const canonicalSources = readJson<Json[]>("accepted-sources.json");
const canonicalCards = readJson<Json[]>("canonical-evidence-cards.json");
const offlineGate = readJson<Json>("offline-content-gate.json");
const reviewById = new Map(sourceReview.map((item) => [clean(item.sourceId), item]));
const canonicalById = new Map(canonicalSources.map((item) => [clean(item.id), item]));
const cardsBySource = new Map<string, Json[]>();
for (const card of canonicalCards) {
  const sourceId = clean(card.sourceId);
  cardsBySource.set(sourceId, [...(cardsBySource.get(sourceId) ?? []), card]);
}

const rows = rawSources.map((source) => {
  const rawId = clean(source.id);
  const review = reviewById.get(rawId) ?? {};
  const canonical = canonicalById.get(rawId);
  const cards = cardsBySource.get(rawId) ?? [];
  const doi = normalizedDoi(source.doi);
  const role = clean(review.sourceRole) || "UNREVIEWED";
  const classification = role === "DIRECT_FINDING"
    ? "direct"
    : role === "CONTEXTUAL_BACKGROUND"
      ? "context"
      : role === "METHOD_CONTEXT" || role === "LIMITATION_CONTEXT"
        ? "method"
        : "rejected";
  const accessLevel = clean(source.accessLevel) || clean(source.sourceAccessLevel) || "unknown";
  let exclusionReason = canonical
    ? "INCLUDED_DIRECT_WITH_CLAIM_ENTAILING_SPAN"
    : clean(review.topicIntegrityReason) || "NO_CANONICAL_DIRECT_EVIDENCE";
  if (rawId === "doi:10.31949/jell.v9i2.16302") {
    exclusionReason = "EXPECTED_CANONICAL_EXCLUSION: higher-education population; no accepted claim-entailing card; prior route DIRECT_FINDING classification was a deterministic fail-open defect";
  }
  return {
    rawCandidateSourceId: rawId,
    routeAcceptedSourceId: review.acceptedForCanonicalEvidence === true ? rawId : null,
    sourceReviewRole: role,
    canonicalSourceId: canonical ? rawId : null,
    evidenceCardSourceId: cards.length > 0 ? rawId : null,
    evidenceCardIds: cards.map((card) => clean(card.evidenceId) || clean(card.id)),
    classification,
    doi,
    normalizedDoi: doi,
    url: clean(source.url) || null,
    normalizedUrl: normalizedUrl(source.url, doi),
    providerId: source.providerIds ?? source.provider ?? source.sourceType ?? null,
    dedupeKey: clean(source.dedupeKey) || (doi ? `doi:${doi}` : rawId),
    fullText: accessLevel === "full_text",
    abstractOnly: accessLevel === "abstract_only",
    accessLevel,
    claimEntailingSpan: cards.length > 0,
    canonicalExclusionReason: exclusionReason,
  };
});

const priorMismatch = {
  observed: {
    routeDirectSources: 4,
    canonicalSources: 3,
    directFindingEvidenceCards: 2,
    canonicalSourceCountMatchesRoute: false,
  },
  classification: [
    {
      category: "EXPECTED_CANONICAL_EXCLUSION",
      applies: true,
      detail: "doi:10.31949/jell.v9i2.16302 studies university English Education students, not the required high-school population.",
    },
    {
      category: "FULLTEXT_OR_SPAN_INSUFFICIENCY",
      applies: true,
      detail: "The same source produced no accepted Evidence Card and was marked PAYWALL_OR_LOGIN_REQUIRED in the saved grounding result.",
    },
    {
      category: "UNKNOWN_REQUIRES_FIX",
      applies: true,
      resolved: true,
      detail: "The prior route classifier allowed an unspecified population to pass DIRECT_FINDING. A failing regression now requires explicit population match and recognizes secondary/upper-secondary terms.",
    },
    { category: "ID_NORMALIZATION_DEFECT", applies: false },
    { category: "DEDUPLICATION_DEFECT", applies: false },
    { category: "SERIALIZATION_OR_MAPPING_DEFECT", applies: false },
    { category: "RETRIEVAL_INSUFFICIENCY", applies: false, detail: "Targeted recovery found sufficient direct sources; retrieval scarcity was not the sole cause of the 4-to-3 mismatch." },
  ],
};

const result = {
  schemaVersion: "researchforge-source-id-reconciliation.v1",
  topic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
  priorGroundingJob: "4ea7f417-48fc-42e7-8e43-bc6007dbcdf2",
  priorWorkflow: "qa-formal-case-b-1787510255389",
  priorMismatch,
  current: {
    rawCandidateSources: rows.length,
    routeDirectSources: rows.filter((row) => row.routeAcceptedSourceId).length,
    canonicalSources: rows.filter((row) => row.canonicalSourceId).length,
    directFindingEvidenceCards: canonicalCards.length,
    canonicalSourceCountMatchesRoute: (offlineGate.checks as Json)?.canonicalSourceCountMatchesRoute === true,
  },
  rows,
};
writeJson("SOURCE-ID-RECONCILIATION.json", result);

const escapeCell = (value: unknown) => String(value ?? "").replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim();
const markdown = [
  "# Case B Source-ID Reconciliation",
  "",
  "## Root cause and resolution",
  "",
  "The previous 4 route-direct → 3 canonical → 2 direct-card funnel was not an ID-normalization or deduplication loss. The extra route-direct record (`doi:10.31949/jell.v9i2.16302`) is explicitly a higher-education/university sample and had no accepted claim-entailing card. The prior route population policy failed open on `populationMatch: unspecified`; this was reproduced by regression and repaired. Its canonical exclusion was correct.",
  "",
  "Taxonomy: `EXPECTED_CANONICAL_EXCLUSION` + `FULLTEXT_OR_SPAN_INSUFFICIENCY`, with the prior population classifier recorded as resolved `UNKNOWN_REQUIRES_FIX`. `ID_NORMALIZATION_DEFECT`, `DEDUPLICATION_DEFECT`, and `SERIALIZATION_OR_MAPPING_DEFECT` are not supported by the row-level evidence.",
  "",
  `Current result: ${result.current.routeDirectSources} route-direct sources = ${result.current.canonicalSources} canonical sources; ${result.current.directFindingEvidenceCards} direct finding Evidence Cards; canonical count match ${result.current.canonicalSourceCountMatchesRoute ? "PASS" : "FAIL"}.`,
  "",
  "## Row-level reconciliation",
  "",
  "| Raw ID | Route role | Canonical ID | Class | DOI | Access | Card count | Canonical disposition |",
  "| --- | --- | --- | --- | --- | --- | ---: | --- |",
  ...rows.map((row) => `| ${escapeCell(row.rawCandidateSourceId)} | ${escapeCell(row.sourceReviewRole)} | ${escapeCell(row.canonicalSourceId)} | ${escapeCell(row.classification)} | ${escapeCell(row.normalizedDoi)} | ${escapeCell(row.accessLevel)} | ${row.evidenceCardIds.length} | ${escapeCell(row.canonicalExclusionReason)} |`),
  "",
  "The JSON companion retains raw/normalized DOI and URL, provider identity, dedupe key, full-text/abstract state, and every canonical Evidence Card ID.",
].join("\n");
write("SOURCE-ID-RECONCILIATION.md", markdown);
process.stdout.write(`${rows.length} source rows reconciled\n`);

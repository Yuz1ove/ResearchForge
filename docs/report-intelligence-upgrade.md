# ResearchForge report-intelligence upgrade

This note records the implementation contract introduced after the 2026-08-13
QA review. It is intentionally stricter than a generic retrieval-augmented
generation design: retrieval may reduce context, but only source-grounded facts
may enter report claims.

## Evidence memory

The evidence-memory flow is:

1. Keep immutable source text and its original locator.
2. Parse source-native chunks (including DOCX and EPUB).
3. Store workflow-scoped, content-addressed chunk versions.
4. Retrieve with lexical and optional semantic signals.
5. Preserve source diversity before filling remaining context by score.
6. Pass only selected chunks into fact and claim extraction.
7. Retain the full accepted source record for audit and replay.

`EvidenceChunkStore` has an in-memory implementation for deterministic tests and
a PostgreSQL/pgvector implementation for durable deployments. PostgreSQL rows
are isolated by workflow, marked current by source/content hash, expired by TTL,
and preserve exact source location and character offsets. Retrieval will not use
vectors created by another embedding model or with another vector dimension.

Lexical retrieval remains mandatory. Chinese text receives a deterministic CJK
bigram projection so a failed or unavailable embedding provider does not remove
the auditable fallback path. Semantic retrieval is optional and any provider,
schema, timeout, invalid-vector, or store failure is recorded in diagnostics
before falling back to lexical in-memory retrieval.

### Configuration

| Environment variable | Purpose |
| --- | --- |
| `EVIDENCE_CHUNK_STORE=pgvector` | Enable durable PostgreSQL/pgvector storage. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `EVIDENCE_CHUNK_RETENTION_DAYS` | Version retention window; default 30 days. |
| `EVIDENCE_EMBEDDING_MODEL` | OpenAI-compatible embedding model. |
| `EVIDENCE_EMBEDDING_BASE_URL` | Provider base URL. |
| `EVIDENCE_EMBEDDING_API_KEY` | Optional provider bearer token. |
| `EVIDENCE_EMBEDDING_TIMEOUT_MS` | Embedding request timeout. |

The vector store is not the authority for citations. Every selected vector hit
must still resolve to an accepted source, an exact original chunk, and a valid
claim/evidence relationship. Metadata-only, rejected, or non-claim sources are
never promoted into evidence by retrieval score.

## Native document ingestion

DOCX and EPUB are now source-native inputs rather than plain-text surrogates.
DOCX extraction reads document order, heading styles, core title metadata and
footnotes. EPUB extraction follows the OPF spine and reads XHTML headings and
paragraphs in publication order. Both paths preserve the original-language text,
heading, locator, character offsets, content hash, and extraction provenance.

Archive size is bounded (12 MiB by default), and batch extraction uses bounded
concurrency. Translation, if added later, must remain a derivative layer and may
not overwrite the original text used for evidence verification.

## Model capability registry

All LLM calls now consult a central capability profile before dispatch. The
profile records provider, context window, maximum output, JSON/schema/tool and
embedding support, cost tier, latency tier and recommended workloads. Unknown
models receive a conservative profile. Exact deployment values can be supplied
through `MODEL_CAPABILITY_REGISTRY_JSON`.

The request planner caps output tokens against both the model output maximum and
its context budget. This avoids relying on provider errors as context management.

## Statistical interpretation boundaries

The intelligence layer includes explicit interpretation contracts for:

- multilevel coefficients and random-effects structure;
- survival probability and Kaplan–Meier-style outputs;
- Bayesian posterior estimates and credible intervals;
- Bayes factors;
- network meta-analysis.

These are semantic validators, not number generators. A single proportion cannot
be rendered as a survival curve; a credible interval cannot be described as a
frequentist confidence interval; a Bayes factor is neither an effect size nor the
probability that a hypothesis is true; a treatment ranking cannot replace
transitivity, consistency, heterogeneity and certainty checks.

## Quality repair loop

`orchestrateReportQualityRetries` turns the deterministic quality gate into a
bounded repair loop. It identifies the failed dimension, routes the exact stage,
reruns the gate, records every attempt, stops on pass/no-progress/exhaustion, and
only permits export after a passing audit. A caller may explicitly downgrade to
a limited-evidence brief when a complete report cannot be supported.

The repair callback is injected so the API, writer and renderer can rerun their
own stages without putting provider-specific logic into the quality gate.

## Acceptance status and remaining live work

Automated unit/type checks cover the new retrieval, ingestion, model-registry,
statistics and retry contracts. Full end-to-end acceptance still requires:

- the seven formal live scenarios from the QA plan;
- real writer/export execution for all report archetypes;
- a real secondary image provider when Image2 is requested;
- provider credentials and an environment with PostgreSQL/pgvector;
- preservation and replay of the tracked
  `artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json`
  fixture in the real local repository.

Those items must not be replaced with synthetic success claims. Their run IDs,
inputs, model profiles, source manifests, evidence-set hashes, quality-gate
results and exported artifacts should be retained together for replay.

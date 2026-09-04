# ResearchForge historical reconstruction

> Backstage evidence layer. Dates after 2026-08-13 describe dated worktree/QA sessions unless an explicit commit is named.

## Phase 0 — Before ResearchForge had its name

The first repository commit is dated 2026-05-28. The first substantial application commit, `a20f64a` on 2026-06-10, created an AI report-generator website. Its center of gravity was visible output: a large generator page, selectable report options, and a polished front end. Follow-up commits expanded report styles, modes, topic frameworks, and document export. At this point the system could assemble something that looked like a report, but the repository did not yet contain the source-first contract that later defined ResearchForge.

The early development log corroborates the change in thinking. The initial question was how to produce a usable report and export it. Within days, the project owner identified a harder problem: a plausible paragraph does not reveal which source supports it. This distinction is the origin of the later system, but it would be anachronistic to say the original app already solved it.

## Phase 1 — Citation foundation and source review

Commit `f0df507` (2026-06-12) is the first major evidence-system checkpoint. It added a source-search route, provider retrieval, normalized source records, review state, tests, and shared schemas. Rather than letting every provider leak its own shape into the UI, the application gained a common source model.

Commit `16b0807` (2026-06-14) expanded this into a resilient search core: keyword expansion, provider configuration, search preflight, diagnostic behavior, and tests. The 6/17 commit cluster then added source relevance, authority and language handling, accepted-source synthesis, and a generation gate. By the 2026-06-18 architecture audit, the documented flow was already:

`topic → search plan → source search → source review → accepted sources → evidence cards → report draft → preview → export`

At this stage, the important product decision was human review: search results were candidates, not evidence by default. Accepted sources became the input to evidence cards and report drafting. The later canonical authority did not yet exist; truth was still distributed across UI state and helper modules.

## Phase 2 — Topic anchors, provider behavior, and retrieval budgets

Late June work addressed topic drift. The planner gained canonical topic fields, bilingual query seeds, subtopics, required terms, exclusion terms, domain hints, and selected research-plan identity. This made query expansion a constrained planning problem rather than an exercise in producing more keywords.

The repository also records repeated provider degradation: timeouts, rate limits, incomplete abstracts, and fallback results. Commits around 2026-06-20 through 2026-07-06 refined normalization, ranking, entity-aware grounding, source grouping, query tokenization, and request budgets. A crucial lesson emerged: a provider returning data is not equivalent to the system finding the right evidence.

## Phase 3 — Deployment and durable research jobs

The 2026-07-11 history contains a sequence of deployment repairs: API configuration, function entrypoints, ESM loading, build output, frontend fallback, and localized error states. Commit `3922d4a` then made research-grounding jobs durable for Vercel. The server could persist a job, expose structured diagnostics, and avoid treating an in-memory browser request as the only owner of long-running research work.

This phase later became central to V4: `CLIENT_WAIT_EXPIRED` had to mean only that a client stopped waiting, not that the research job had failed or produced zero evidence.

## Phase 4 — Direct paper search and the report-intelligence integration

Commit `912babd` (2026-07-16) introduced direct paper search and a summary handoff. Commit `a89549a` (2026-08-13) was a large integration: report drafts and exports, canonical Writer evidence, citation markers, evidence resolution, structured report plans, standardized facts, report intelligence, quality gates, formal-document construction, CJK export work, visual semantics, and a substantial test/QA corpus.

The dated 8/13 QA report called the result a partial report-intelligence upgrade. Deterministic contracts and regression were strong, but required live multi-topic artifacts were missing. A real Ollama run produced four model sections and three fallbacks; post-edit claim/citation entailment failed, so formal DOCX/PDF export was deliberately blocked. This is the first major example of a recurring rule: a technically complete vertical slice is not the same thing as an accepted research output.

## Phase 5 — Writer closure and supported-content limits

Later August sessions focused on Writer behavior. The architecture separated canonical facts and claim graphs from raw source text, introduced a two-pass `teach_back → academic_reconstruction` flow, and checked claim/citation entailment after editing. Long-report acceptance found that unsupported or unrealized prose disappeared during canonicalization, leaving a much shorter defensible report than the requested length.

The project did not solve this by padding. One case became a publishable formal report; a second remained blocked because its supported content was below threshold. A subsequent publication-layout phase repaired citation presentation, headings, figures, typography, and DOCX/PDF parity without regenerating Writer content. This separation matters: display-layer success preserved claim ownership, but did not create missing evidence.

## Phase 6 — Publication success, then generalization failure

The Case A publication artifact passed citation resolution, content integrity, cross-format anchors, and rendered visual QA. When the same pipeline was applied to three new topics, none passed the complete canonical export gate. One lacked direct evidence, one carried only generic fallback claims, and one passed a Writer-level gate but failed the stricter canonical publication gate.

This failure changed the development question. The problem was no longer “How do we make the Writer better?” It was “What exact study-level material is missing before Writer?”

## Phase 7 — General research ingestion and Study Facts

The 2026-08-25 ten-topic ingestion run produced 0/10 publishable new-topic reports despite passing engineering regression. The root cause report identified structured study-fact extraction and schema admission as the shared bottleneck, with retrieval and full-text access failing even earlier in several cases.

`StudyFactEnvelopeV2` made absence explicit. A field could be present, not reported, unknown, or not applicable. Facts retained exact locators and provenance; direct studies were classified before being admitted. A subsequent fresh extraction run reached 7/10 LIMITED and 0/10 FORMAL, so Writer remained closed. A deterministic replay recovered many quantitative facts, but replay results were kept separate from live acceptance.

## Phase 8 — Evidence-gap acquisition and durable completion

V3 added evidence-gap-driven acquisition and formal synthesis. Its fresh live materialization reached only 2/10 LIMITED-or-better and 0/10 FORMAL; several client waits expired before job artifacts materialized. V4 repaired lifecycle ownership: the create route returned a job ID before background work, stage checkpoints became explicit, terminal state became immutable, revisions were lightweight, and retries/resume were idempotent.

All ten V4 jobs eventually reached explicit terminal states even though bounded client waits expired many times. Only one final output validated as LIMITED, and none was FORMAL. V4 also exposed inconsistent admission counts among terminal manifests, formal architecture, and Writer projections.

## Phase 9 — One canonical admission owner

The canonical-evidence-admission substrate moved the decision into `artifacts/api-server/src/services/research/canonical-study-admission.ts`. That result binds job, workflow, study identity, access state, parser and Study Fact readiness, provenance, admission class, reason codes, and revision identity. Terminal Manifest, formal architecture, Writer, and QA became projections of that decision instead of independent judges.

The fresh run had 46 study decisions with zero projection mismatches and zero formal-safety or UNKNOWN-collapse violations. The substrate was READY. Content was not: only 1/10 reports validated as LIMITED-or-better and 0/10 were FORMAL. The remaining plurality blocker was full-text acquisition.

## Phase 10 — Legal full-text acquisition and materialization

Full-text recovery separated metadata resolution from artifact creation. It added deterministic legal route planning, JATS/XML/HTML/PDF/OCR dispatch, payload sniffing, identity validation, artifact qualification, retry taxonomy, circuit behavior, and canonical checks. A successful HTTP response stopped counting as full text unless it contained the right work, a substantive body, and usable scholarly structure.

Successive live cohorts moved between 0/10 and 2/10 qualifying-full-text coverage while regression stayed green. This apparent regression was informative: stricter qualification removed false positives and exposed landing pages, abstract shells, scanned PDFs, robots/TOS blocks, rate limits, and unavailable authorized providers. The system became more honest before it became more capable.

## Phase 11 — Post-closure audit and V5 budget authority

The legal-OA manifestation V4 finalizer initially reported four qualifying cases. A sealed read-only audit found that it had projected every canonical row as admitted without checking the canonical admission state. One qualifying manifestation belonged to a BLOCKED source and could not count. The defensible verdict was overridden to BLOCKED. The same audit found that a nominal three-query/three-provider cascade had expanded into 22 unique queries, six providers, and 90 attempt rows for one case.

V5 closed both defects. Canonical binding was audited end to end, and an authoritative execution ledger enforced separate limits for queries, expanded queries, providers, provider-query pairs, requests, retries, redirects, resolvers, materialization, fallbacks, and elapsed time before each external side effect. The control plane passed with zero mismatches, budget overruns, or hidden attempts. The same fresh content cohort had only 1/10 direct-study coverage and 0/10 qualifying full text. Therefore V5 is correctly described as control-plane READY and generalization not ready.

## Current historical endpoint

As of 2026-08-29, ResearchForge has a much stronger system for saying “we do not know” than for guaranteeing that arbitrary topics will yield formal reports. That is not a footnote; it is the architectural achievement and the unresolved product problem. The series should end at this honest boundary: canonical truth, budgets, and legal acquisition are now explicit, while broad live full-text coverage remains the next phase.

## V1 audit addendum: evidence classes and endpoint

This addendum makes the reconstruction contract explicit without rewriting the earlier historical summary.

| Required history section | Verified boundary | Evidence class | Confidence |
|---|---|---|---|
| Project Origin | 2026-05-28 scaffold; 2026-06-10 generator application | commits `2246770`, `a20f64a`; initial source | HIGH |
| Early Report Generator Stage | 2026-06-10 modes, topic structures and export | commits `27cc69a`, `79fce70`, `869cc1c` | HIGH |
| Academic Search Stage | 2026-06-12 foundation; 2026-06-14 planner; 2026-06-17 gates | commits `f0df507`, `16b0807`, `6a2e5dd`, `db49aa4..a146d27` | HIGH |
| Document Acquisition Stage | output formats from 2026-06-10; DOCX alpha branch path 2026-06-13; integrated export 2026-06-18 onward | commits `79fce70`, branch-local `9fd8799`, `5c654b9` | HIGH / MEDIUM |
| Parsing Stage | parser tree 2026-06-26; grounding extractor 2026-07-06 | commits `ec20e43`, `f21d380` | HIGH for code existence; LOW for live coverage |
| Evidence Card Stage | frontend card flow 2026-06-16; research card builder 2026-06-26 | commits `ec4a82a`, `ec20e43` | HIGH |
| Synthesis Stage | accepted-source synthesis 2026-06-17/18; report-writer and intelligence 2026-06-20/2026-08-13 | commits `80fbcbb`, `5cd5e48`, `ed05b87`, `a89549a` | HIGH |
| Citation / Attribution Stage | source identity 2026-06-12; claim/document citation expansion 2026-08-13 and later QA | commits `f0df507`, `a89549a`; dated QA | HIGH |
| Evidence Admission Stage | early quality gates 2026-06-17; one canonical owner only in 2026-08-28 worktree | commits `e2b8f80..a146d27`; current source/QA | HIGH |
| Full-text Acquisition / Materialization Stage | parser foundations before 2026-07-06; legal qualification/materialization in 2026-08-27–29 worktree/QA | current source and dated QA | HIGH for later evidence; LOW for earlier coverage |
| Generalization Testing Stage | 2026-08-24–29 bounded cohorts | dated QA artifacts | HIGH for reported cohort outcomes |
| Current State | 2026-08-29 V5/V6A control and materialization evidence; content generalization false | dated QA artifacts | HIGH |

The historical endpoint for committed code remains `a89549a6e26a7ac3ae44ad52b5588101baf28b95`. V6A is a later worktree/QA observation, not a commit. The main unresolved gaps are exact early motivations, exact early live provider outcomes, and whether branch-local implementation was ever merged into this HEAD; all remain `UNKNOWN` where not directly evidenced.

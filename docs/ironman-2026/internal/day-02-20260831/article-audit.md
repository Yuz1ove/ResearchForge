# Day 02 article audit

## Article identity

- Task: IRONMAN_DAY_02_PUBLICATION_TASK
- Day: 02; editorial date: 2026-08-31, Asia/Taipei.
- Title: 為什麼我讓 AI 在證據不足時停下來？
- Unicode character count including Markdown and references: 3509.
- CJK character count (U+3400–U+9FFF): 2255; meets 1800–3000 Chinese-character target.
- Article SHA-256: `977a55cd5ad9916cede956f1e2b2d4e503743f0d8cb92a2b421b3917ae89ebde`.
- Verdict: RESEARCHFORGE_IRONMAN_DAY02_READY, scoped to this candidate's article/evidence/assets.
- Local editorial status: READY_FOR_HUMAN_REVIEW. Human approval PENDING; publication NOT_RUN.

## Repository and layout decision

Actual ResearchForge root is recorded in repository-preservation.json. The task opened in ARCI; no ARCI file was edited.

The formal editorial root is `docs/ironman-2026/`, not `docs/ironman/days/`. Day 01 exists as `articles/day-01.md`, with audit/facts in shared `internal/ARTICLE-FACT-MAP.json`, `internal/SOURCE-LEDGER.json`, `day-facts/day-01.json`, publication safety in `internal/PUBLICATION-SAFETY.md`, and metadata in the series manifests. It has no selected per-day diagram or `article-public.md`; the assets reviewed include the existing Day 25 qualification diagram and all-series asset conventions. No absent Day 01 architecture diagram is invented.

The existing uncommitted `articles/day-02.md` is the historical article “模板先完成，證據仍然缺席”. The new request asks for a different current-evidence narrative. To obey the explicit no-overwrite requirement, this task adds a versioned publication candidate:

- Public source: `articles/day-02-20260831/article-public.md`.
- Public assets: `assets/day-02/20260831/`.
- Internal audit/QA: `internal/day-02-20260831/`.

This extends the existing articles/assets/internal separation. Original Day 01/02, frozen history, manifests, source ledger, daily ledger and global status remain unchanged. The candidate is intentionally not registered as the selected canonical Day 02. Selecting it would require a later coordinated update to Day 01's preview and the series manifest, not an implicit overwrite in this publication task.

## Continuity and time boundary

Actual Day 01 discusses timer-driven completion versus research capability; it does not establish a completed autonomous anti-self-certification system. The new article connects to this narrower real point, explicitly acknowledges the old templates/export preview, and explains the turn to evidence available by 2026-08-31. V6 evidence is dated 2026-08-30; it is not backdated into the June historical sequence. The user's current-date topic overrides the older frozen-packet-only drafting preference for this separate candidate, without changing that historical packet or claiming its facts have changed.

## Repository evidence reviewed

- Day 01/02/03 articles, Day 01 and Day 03 fact packets, ARTICLE-FACT-MAP, SOURCE-LEDGER, EDITORIAL-MAP, README, WRITER-RULES, PUBLICATION-SAFETY and PUBLICATION-RUNBOOK.
- Historical `a20f64a` generator source, read with `git show`, including timer at lines 69–76.
- V6B FINAL-REPORT and title-only / landing-page / parser-failure test source.
- V6C FINAL-REPORT: independent identity-only READY, full-text NOT_RUN.
- V6D FINAL-REPORT, MATERIALIZATION-RESULT, ARTIFACT-VALIDATION, TEST-RESULTS, MANDATORY-STOP, STOP-EVIDENCE, WRITER-CALL-RECEIPT and seal.py.
- Current `studyManifestation.ts` identity decisions and `admittedManifestationMaterializer.ts` blocked-first/qualification/rejection/authority checks.
- Saved V6D raw HTML rehashed: 209155 bytes; SHA matches its saved artifact receipt. This was a read-only local check, not a fresh download or a scientific validation.
- Bounded repository search did not locate V6E evidence; its hypothesized dependency blocker is omitted, not declared absent.

## Claims checked

All 16 claim groups are recorded in evidence-map.md and claims.json, with article anchors, exact file/line ranges, source SHA-256 and provenance categories. Main case: V6D technical/content success but acceptance stop. One smaller case: V6B insufficient canonical identity. V6C supplies only a scoped-state illustration, not a third changelog story. No test totals, latency, paper conclusions, generalization success or deployment are published.

## Removed / softened claims

| Proposed stronger claim | Why rejected | Published treatment |
|---|---|---|
| Day 01 already prevented AI self-certifying success | Actual Day 01 describes an early UI prototype | Completion display needs supporting evidence |
| All bibliographic fields exactly matched | V6D retains a venue spelling discrepancy under existing exact-PID precedence | Identity passed under existing rules |
| Full-text retrieval succeeded, so ResearchForge is READY | V6D overall verdict is concurrent-modification BLOCKED | Materialization success and acceptance outcome stay separate |
| An unauthorized person changed the repository | Attribution is UNKNOWN; evidence proves only unaccounted changes | Scope-external article files changed; no person or malicious cause assigned |
| Production detects every repository mutation on each request | Whole-worktree comparison is in an acceptance script | Figure explicitly separates engineering acceptance from production data checks |
| NOT_RUN means tests failed | Unexecuted work has no success/failure result | Keep prerequisite BLOCKED and downstream NOT_RUN distinct |
| V6E proves offline package/toolchain failure | No directly located repository receipt in bounded search | Omit it |
| Stop conditions eliminate hallucinations or guarantee correctness | No such measured result exists | Some unsupported material is kept out of downstream use |
| This validation reran 225/745/432 tests or live retrieval | This task only read historical receipts | Historical PASS is explicitly historical; no test totals in public text |
| New article is approved, canonical, or published | No selection/approval/platform action occurred | Versioned candidate, READY_FOR_HUMAN_REVIEW only |

## Publication safety

PASS — 12/12 explicit safety categories in publication-safety.json, scoped only to public article/SVG/Mermaid. Automated patterns are supplemented by semantic rereading of numerical, scientific, reliability and READY claims. Internal files contain evidence paths and must not be pasted into a public post.

## Validation and limitations

- Candidate checks: 16/16 PASS; exact scanner definitions reused from existing unchanged validator.
- MarkdownIt commonmark + table renderer: H1/H2, table, code blocks, references and image parsed.
- One relative image link resolves; SVG XML parses, arrow markers resolve, no foreignObject or external resources/fonts. SVG is manually laid out from the same graph as the Mermaid source; no dependency was installed.
- Browser review: desktop 1000px and mobile 360px; image loaded, no page horizontal overflow, no SVG text outside viewbox; source/state labels and arrow directions inspected. The local preview is not iThome Preview.
- Unchanged legacy all-series validator ran on an isolated copy to avoid overwriting its pre-existing JSON result. It returns FAIL because old Day 02's legitimate discussion contains “待補”. That existing placeholder-regex false positive remains reported, not silently fixed or relabeled PASS. The validator only enumerates canonical day-XX files and original direct-child diagrams; this candidate is covered by its separate recorded checks, not its fixed counts.
- Candidate numeric scan initially mistook the date component of the relative asset path for a test fraction; correction excludes link destinations from prose numeric checks. No safety or evidence requirement was disabled.
- Browser getBBox is not available on the read-only DOM surface; bounds were checked using visible getBoundingClientRect plus screenshots instead. Initial fullPage screenshot scaling was unsuitable for review; delivered captures use viewport screenshots with verified dimensions.
- Initial local preview server failed with listen EPERM; a reviewed loopback-only rerun succeeded. No production dependency or network acquisition was needed.
- Engineering tests/build/typecheck, live acquisition, Writer, deployment, authenticated staging and iThome Preview/publication: NOT_RUN in this task.

A final delivery check found that the repository shell selects Homebrew Python 3.14 without MarkdownIt, while the isolated checks used the already-installed framework Python 3.11 with MarkdownIt. No dependency was installed. The explicit existing interpreter below reproduces the renderer and validation without changing the toolchain.

Reproduce after delivery from repository root:

```sh
node docs/ironman-2026/internal/day-02-20260831/reuse-safety-scans.mjs
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3 docs/ironman-2026/internal/day-02-20260831/validate-candidate.py .
```

The full-series validator writes an existing internal output. Run it on a copy when preserving the dirty tree, as done here; its current prior failure is retained in legacy-baseline-validation.json.

## Repository preservation and Git

Before identity: branch `codex/paper-search-performance-v1-20260716`, HEAD `a89549a6e26a7ac3ae44ad52b5588101baf28b95`; 304 short-status entries; 9045 tracked/nonignored regular files hashed. Full before/after result and allowed new files are recorded in repository-preservation.json. No pre-existing file is intentionally modified. No production behavior changes, installs, broad staging, reset, restore, clean, stash, commit, push, merge or deployment.

## Day 03 handoff

Keep the established topic “引用在句尾，證據仍可能不成立”: source identity, normalized records/review state and why citation presence does not establish support. EDITORIAL-MAP:90 defines the historical citation foundation; do not promise V6 generalization or a completed Writer result. If this candidate is selected to replace historical Day 02, reconcile the old Day 01 preview and canonical manifests in a separate explicit editorial selection; this task preserved them.

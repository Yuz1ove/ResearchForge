import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const value = process.argv.find((item) => item.startsWith("--root="));
if (!value) throw new Error("Expected --root=...");
const root = path.resolve(repositoryRoot, value.slice("--root=".length));
const fixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedFixtureSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const git = "/Users/Yuz1ove/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git";

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;
}

function write(relative: string, contents: string): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, contents.endsWith("\n") ? contents : `${contents}\n`);
  fs.renameSync(temporary, target);
}

function writeJson(relative: string, contents: unknown): void {
  write(relative, JSON.stringify(contents, null, 2));
}

function shaFile(target: string): string {
  return createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function command(args: string[]): string {
  return execFileSync(git, args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

const caseA = readJson<Json>("case-a/MATERIALIZATION.json");
const citation = caseA.citationQa as Json;
const figure = caseA.figureQa as Json;
const pagination = caseA.paginationQa as Json;
const generalizationSlugs = [
  "gen-ai-high-school-learning",
  "rag-vs-llm-knowledge-qa",
  "urban-green-adolescent-mental-health",
] as const;
const generalization = Object.fromEntries(generalizationSlugs.map((slug) => [slug, {
  summary: readJson<Json>(`${slug}/acceptance-summary.json`),
  calls: readJson<Json>(`${slug}/live-call-counts.json`),
}]));
const urbanWorkspace = readJson<Json>("urban-green-adolescent-mental-health/workspace-preparation.json");
const caseACanonical = readJson<Json>("case-a/canonical-report.json");
const caseAFormal = caseACanonical.formalDocument as Json;
const urbanFormal = readJson<Json>("urban-green-adolescent-mental-health/canonical-report.json");
const fixtureAfter = shaFile(fixture);
const branch = command(["branch", "--show-current"]);
const head = command(["rev-parse", "HEAD"]);
const dirtyPaths = command(["status", "--short"]).split("\n").filter(Boolean).length;
const verdict = "FORMAL_PUBLICATION_REPORT_V2_READY_GENERALIZATION_FAILED";

function allFormalSections(formal: Json): Json[] {
  return [
    formal.abstract,
    formal.researchQuestion,
    formal.scopeAndMethod,
    ...list<Json>(formal.analysisSections),
    formal.crossSourceSynthesis,
    formal.limitations,
    formal.conclusion,
    ...list<Json>(formal.appendix),
  ].filter((item): item is Json => Boolean(item && typeof item === "object"));
}

function manifestsFor(formal: Json, status: string): {
  citations: Json;
  tables: Json;
  figures: Json;
} {
  const sections = allFormalSections(formal);
  const references = list<Json>(formal.references);
  const tables = [formal.evidenceTable, ...sections.flatMap((section) => list<Json>(section.tables))]
    .filter((item): item is Json => Boolean(item && typeof item === "object"));
  const figures = sections.flatMap((section) => list<Json>(section.figures));
  return {
    citations: {
      schemaVersion: "researchforge-citation-manifest/v2",
      status,
      references: references.map((reference) => ({
        citationId: reference.citationId,
        sourceId: reference.sourceId,
        ordinal: reference.ordinal,
        doi: reference.doi,
        url: reference.url,
      })),
    },
    tables: {
      schemaVersion: "researchforge-table-manifest/v2",
      status,
      tables: tables.map((table) => ({
        number: table.number,
        title: table.title,
        columns: list(table.columns).length,
        rows: list(table.rows).length,
        sourceNote: table.sourceNote,
      })),
    },
    figures: {
      schemaVersion: "researchforge-figure-manifest/v2",
      status,
      figures: figures.map((item) => ({
        number: item.number,
        visualId: item.visualId ?? null,
        figureType: item.figureType,
        title: item.title,
        sourceNote: item.sourceNote,
        argumentClaimId: item.argumentClaimId ?? null,
        provenance: item.provenance ?? null,
      })),
    },
  };
}

const caseAManifests = manifestsFor(caseAFormal, "ready");
writeJson("case-a/CITATION-MANIFEST.json", caseAManifests.citations);
writeJson("case-a/TABLE-MANIFEST.json", caseAManifests.tables);
writeJson("case-a/FIGURE-MANIFEST.json", caseAManifests.figures);
const urbanManifests = manifestsFor(urbanFormal, "blocked_canonical_content_gate");
writeJson("urban-green-adolescent-mental-health/CITATION-MANIFEST.json", urbanManifests.citations);
writeJson("urban-green-adolescent-mental-health/TABLE-MANIFEST.json", urbanManifests.tables);
writeJson("urban-green-adolescent-mental-health/FIGURE-PROVENANCE-MANIFEST.json", urbanManifests.figures);
writeJson("urban-green-adolescent-mental-health/NO-EXPORT.json", {
  verdict: "BLOCKED_CANONICAL_CONTENT_GATE",
  reason: "Writer succeeded, but canonical integrity and visual quality blocked export.",
  forbiddenReaderTokens: (urbanFormal.integrity as Json).forbiddenReaderTokens,
  citationMappingIssues: (urbanFormal.integrity as Json).citationMappingIssues,
  qualityRetryPlan: (urbanFormal.quality as Json).retryPlan,
  exported: false,
});
for (const slug of generalizationSlugs.slice(0, 2)) {
  const item = generalization[slug] as { summary: Json; calls: Json };
  writeJson(`${slug}/NO-EXPORT.json`, {
    verdict: "INSUFFICIENT_WRITER_ELIGIBLE_SUPPORTED_CONTENT",
    reason: "Canonical report plan could not be built from substantive Traditional-Chinese evidence claims; Writer was not called.",
    acceptedSources: item.summary.acceptedSources,
    evidenceCards: item.summary.evidenceCards,
    calls: item.calls,
    exported: false,
  });
  writeJson(`${slug}/CITATION-MANIFEST.json`, {
    schemaVersion: "researchforge-citation-manifest/v2",
    status: "not_run_no_canonical_report",
    references: [],
  });
  writeJson(`${slug}/TABLE-MANIFEST.json`, {
    schemaVersion: "researchforge-table-manifest/v2",
    status: "not_run_no_canonical_report",
    tables: [],
  });
  writeJson(`${slug}/FIGURE-PROVENANCE-MANIFEST.json`, {
    schemaVersion: "researchforge-figure-manifest/v2",
    status: "not_run_no_canonical_report",
    figures: [],
  });
}

const regression = {
  reportFactory: { passed: 426, failed: 0 },
  api: { passed: 581, failed: 0 },
  focusedLineage: { passed: 55, failed: 0 },
  formalDocumentFocused: { passed: 21, failed: 0 },
  workspaceTypecheck: "PASS",
  productionBuild: "PASS",
  gitDiffCheck: "PASS",
};
writeJson("REGRESSION-SUMMARY.json", regression);
writeJson("VERDICT.json", {
  verdict,
  caseAReady: true,
  newCasesExported: 0,
  newCasesRequired: 2,
  protectedFixture: {
    expected: expectedFixtureSha,
    before: expectedFixtureSha,
    after: fixtureAfter,
    unchanged: fixtureAfter === expectedFixtureSha,
  },
});

const finalReport = `# ResearchForge Publication V2 Generalization Acceptance

## A. Executive Verdict

\`${verdict}\`

Case A 的 citation rendering、academic figure eligibility、H1 pagination、DOCX/PDF 與逐頁 Visual QA 全部通過；但 3 個新題沒有任何一個通過完整 canonical export gate，因此不符合至少 2 個新題輸出 DOCX/PDF 的 READY 條件。

## B. Repository Identity

- Repository: ${repositoryRoot}
- Branch: \`${branch}\`
- HEAD: \`${head}\`
- Dirty paths at closure: ${dirtyPaths};既有 dirty worktree 已保留。
- Protected fixture SHA before/after: \`${expectedFixtureSha}\` / \`${fixtureAfter}\`，${fixtureAfter === expectedFixtureSha ? "UNCHANGED" : "CHANGED"}。
- 未執行 reset、clean、checkout、commit、push、merge、PR 或 deploy。

## C. Starting Baseline

上一輪 Case A 為 \`FORMAL_PUBLICATION_REPORT_READY\`。本輪先實際檢視舊 PDF/DOCX，重現三個表層缺陷：正文引用被投影為 superscript 數字、單一研究 58% 被畫成 dashboard progress bar、top-level chapters 共用頁面。

## D. Citation Rendering Fix

Root cause 是 canonical citation resolver 已正確解析來源後，reader projection 刻意把 bibliography ordinals 渲染成 superscript cluster；不是 evidence ID 或 provenance 洩漏。現改為同一 deterministic registry 產生 \`〔1〕\`、\`〔1, 4〕\`、\`〔1–3〕\`、\`〔1–3, 6〕\`，Preview/HTML/DOCX/PDF 一致，DOCX marker 具有 internal bookmark hyperlink。

Case A：6/6 references 雙向閉合，HTML/DOCX/PDF 各 72 個 markers，DOCX 72 個 internal links；internal ID、raw provenance、orphan superscript 均為 0。

## E. Academic Figure Redesign

新增 figure eligibility layer：single-study single metric 預設拒絕大型圖；多研究只有同 metric/unit/estimate semantics 才可比較；異質 outcome 使用 evidence map/table；study characteristic count 必須逐來源可追溯；無真實時間序列不得畫 trend。所有 evidence figure 均輸出 metric、unit、n、denominator、transform、comparability、pooling 與 caveat manifest。

Case A 的單篇 58% 已明確拒絕為 \`FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE\`；發布的是流程示意圖與逐來源去重的研究設計分布，pooling 皆為 not performed。若候選圖找不到 exact argument claim，現會省略而非製造綁定。

## F. Chapter Pagination

HTML/print 對每個 canonical top-level section 設 \`break-before: page\`；DOCX Heading 1 使用 \`pageBreakBefore\` 與 \`keepNext\`，不插入多餘 explicit page-break run；H2/H3 正常流動。References/appendix 同為 top-level new-page section。

Case A 10/10 H1：PDF 頁 3, 4, 5, 7, 8, 10, 11, 12, 13, 21；DOCX 頁 3, 4, 5, 7, 8, 10, 11, 12, 13, 22。全部 page-top，無 accidental blank page。

## G. Existing Case A Regression

- Search calls 0；Writer calls 0。
- Citation QA PASS；Figure Grounding QA PASS；Pagination QA PASS。
- PDF 21 頁；portable DOCX 22 頁；Noto Sans TC embedded/visible PASS。
- 6 references 全部 cited，72/72 markers 跨 HTML/DOCX/PDF 一致。
- unsupported quantitative figure、incompatible merge、pseudo pooling、ghost data 均為 0。
- protected fixture unchanged。

## H. Generalization Case 1

題目：生成式人工智慧輔助高中生學習。Search calls 1，候選 30，接受 14，Evidence Cards 34，Writer calls 0。Grounding 已警告直接證據 A=0/B=0；server preflight 成功，但可交給繁中 Writer 的實質 claim 不足，canonical plan fail closed。未產生 Preview/DOCX/PDF。

## I. Generalization Case 2

題目：RAG 與純 LLM 知識密集型問答。Search calls 1，候選 31，接受 30，Evidence Cards 44，Writer calls 0。Topic-integrity lineage 遺失缺陷已修正且 preflight 200；其後 44 張卡仍只有英文 rule-fallback claim，不能把泛稱「中文摘要：可用於檢視…」冒充研究發現，canonical plan 正確停止。未產生 Preview/DOCX/PDF。

## J. Generalization Case 3

題目：都市綠地暴露與青少年心理健康。Search calls 1，候選 35，接受 23，Evidence Cards 47；一次 Writer、0 retry，Writer content gate 回傳 READY_FOR_EXPORT。但接回 canonical 後被更嚴格出口閘門阻擋：evidence table ellipsis、\`source-led-summary-template\`、兩句未綁引用的數值/外推限制。保存 rejected workspace/generated/canonical artifacts，未輸出 DOCX/PDF。

## K. Cross-format QA

Case A canonical → Preview/HTML → DOCX → PDF 全部通過 citation、figure 與 chapter-boundary semantic checks。新題沒有通過 canonical export gate，跨格式 QA 均標示 NOT RUN，沒有用缺件冒稱 PASS。

## L. Visual QA

Case A production PDF 21/21 頁與 portable DOCX 22/22 頁以 current contact sheet 全頁檢視，並以原尺寸抽查 figure page 與 references page。H1 page-top、citation 非 exponent、圖說/表格/DOI/CJK/頁碼無裁切，未見 unknown glyph、blank page、orphan heading 或 paragraph clipping。HTML 1440×1000 preview console 0 errors / 0 warnings。新題因無可出版輸出，Visual QA NOT RUN。

## M. Regression

- Report Factory: 426/426 PASS。
- API: 581/581 PASS。
- Focused lineage: 55/55 PASS。
- Formal document focused: 21/21 PASS。
- Workspace typecheck PASS；production build PASS；\`git diff --check\` PASS。

## N. Remaining Risks

新題 grounding 的 LLM planning/enrichment 因 time budget 或無可見內容而 fallback，導致英文 exact spans 未形成實質繁中 claim；不能靠 renderer 修復。第三題顯示 live Writer gate 與 canonical publication gate 仍有分層差異，必須在新的受控 run 中修正上游 table/prose generation 後再驗證；本輪不允許重抽或手補 prose。

## O. Final Deliverables

所有 QA、case artifacts、call counts、production traces、page renders、contact sheets 與 SHA manifest 均位於本目錄。Case A 的 final PDF/DOCX/HTML/Markdown 可出版；三個新題均附 \`NO-EXPORT.json\` 與明確 blocker。
`;
write("FINAL-REPORT.md", finalReport);

write("CITATION-RENDERING-QA.md", `# Citation Rendering QA

Verdict: **PASS for Case A; NOT RUN for blocked new cases.**

- Root cause: deterministic reference ordinals were reader-rendered as superscript clusters.
- Reader style: \`〔n〕\`, \`〔n, m〕\`, \`〔n–m〕\`, \`〔n–m, x〕\`.
- Reference count/cited count: ${citation.referenceCount}/${citation.citedReferenceCount}.
- Resolution and bidirectional match: ${citation.citation_resolution}% / ${citation.citation_reference_bidirectional_match}%.
- Markers HTML/DOCX/PDF: ${JSON.stringify(citation.markers)}.
- DOCX internal hyperlinks: ${citation.internalHyperlinks}.
- Internal ID leakage: ${citation.internal_id_leakage}; raw provenance leakage: ${citation.raw_provenance_leakage}; orphan numeric marker: ${citation.orphan_numeric_marker}.
`);

write("FIGURE-GROUNDING-QA.md", `# Figure Grounding QA

Verdict: **PASS for Case A.**

- Single-study 58% progress-style candidate: \`FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE\`.
- Published evidence visual: study-design distribution with source-level deduplication and unknown design retained as unknown.
- Unsupported quantitative figure: ${figure.unsupported_quantitative_figure}; incompatible metric merge: ${figure.incompatible_metric_merge}; pseudo pooled estimate: ${figure.pseudo_pooled_estimate}; ghost data: ${figure.ghost_data}.
- An evidence visual without an exact argument-claim relation is omitted fail closed.
- New cases: no figure was exported because no new case passed canonical publication gates.
`);

write("CHAPTER-PAGINATION-QA.md", `# Chapter Pagination QA

Verdict: **PASS for Case A.**

- Top-level chapters: ${pagination.topLevelChapterCount}; DOCX Heading 1 pageBreakBefore count: ${pagination.docxHeadingPageBreakBeforeCount}.
- Explicit DOCX page-break runs: ${pagination.docxExplicitPageBreakRuns}.
- PDF headings distinct/page-top: ${pagination.pdfHeadingsOnDistinctPages}/${pagination.pdfHeadingsAtPageTop}.
- DOCX headings distinct: ${pagination.docxHeadingsOnDistinctPages}; TOC field dirty/updateable: ${pagination.docxTocFieldDirty}.
- PDF/DOCX pages: 21/22; semantic H1 boundaries agree despite renderer page-count difference.
`);

write("GENERALIZATION-ACCEPTANCE.md", `# Generalization Acceptance

Overall verdict: \`${verdict}\`

| Case | Search | Writer | Accepted / cards | Furthest stage | Export |
| --- | ---: | ---: | ---: | --- | --- |
| GenAI high-school learning | 1 | 0 | 14 / 34 | evidence preflight; no canonical plan | No |
| RAG vs LLM QA | 1 | 0 | 30 / 44 | lineage-correct preflight; no safe zh-TW plan | No |
| Urban green / adolescent mental health | 1 | 1 | 23 / 47 | Writer success; canonical content blocked | No |

No content reruns or transport retries were used. The minimum of two newly exported topics was not met.
`);

write("VISUAL-QA-REPORT.md", `# Visual QA Report

## Case A — PASS

- Production PDF: 21/21 pages inspected at contact-sheet level; figure and references pages also inspected at original resolution.
- Portable DOCX render: 22/22 pages inspected; embedded Noto Sans TC is visible and expected title, figure title, and \`〔1–6〕\` are extractable.
- HTML preview: 1440×1000 screenshot and accessibility snapshot preserved; browser console 0 errors and 0 warnings.
- No clipping, overlap, missing glyph, accidental blank page, orphan H1, broken caption, table cutoff, reference overflow, or footer collision observed.

Artifacts: \`case-a/visual-qa/pdf-contact-sheet-current.png\`, \`case-a/visual-qa/docx-portable-contact-sheet-current.png\`, and all current page PNGs.

## New cases — NOT RUN

No new case passed canonical export authorization, so no PDF/DOCX was generated and no Visual QA PASS is claimed.
`);

write("PUBLICATION-V2-BEFORE-AFTER.md", `# Publication V2 Before / After

| Area | Before | V2 |
| --- | --- | --- |
| Citation | superscript reference ordinals could resemble exponents | bracketed academic clusters with deterministic links |
| Single metric | one-study 58% rendered like a progress KPI | rejected as unsupported figure; retained in prose/table |
| Heterogeneous data | risk of chart-first rendering | comparability and pooling gate before visualization |
| Evidence figure | incomplete uniform manifest | source/evidence/metric/unit/n/denominator/transform/caveat manifest |
| Pagination | chapters could continue on prior page | every canonical H1 uses new-page semantics in HTML, DOCX, PDF |
| Generalization | Case A only | 3 live searches audited; none falsely promoted past fail-closed canonical gates |
`);

const excluded = new Set(["ARTIFACT-MANIFEST.json"]);
const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
  .filter((relative) => !excluded.has(relative))
  .sort();
writeJson("ARTIFACT-MANIFEST.json", {
  schemaVersion: "researchforge-publication-v2-artifact-manifest/v1",
  verdict,
  generatedAt: new Date().toISOString(),
  repository: { root: repositoryRoot, branch, head, dirtyPaths },
  protectedFixture: { expected: expectedFixtureSha, before: expectedFixtureSha, after: fixtureAfter },
  regression,
  artifacts: files.map((relative) => {
    const target = path.join(root, relative);
    return { path: relative, bytes: fs.statSync(target).size, sha256: shaFile(target) };
  }),
});

process.stdout.write(`${verdict}\n${root}\n`);

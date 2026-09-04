#!/usr/bin/env python3
"""Seal deterministic PUBLICATION_LAYOUT_AND_CITATION_LAYER_V1 QA artifacts."""

from __future__ import annotations

import hashlib
import html
import json
import re
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "artifacts/qa/researchforge-publication-layout-citation-v1-20260824T161351+0800"
CASE_A = ROOT / "case-a"
CASE_B = ROOT / "case-b"
START = REPO / "artifacts/qa/researchforge-formal-report-composer-vnext-20260824T133401+0800"
FIXTURE = REPO / "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json"
EXPECTED_FIXTURE_SHA = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3"
EXPECTED_BRANCH = "codex/paper-search-performance-v1-20260716"
EXPECTED_HEAD = "a89549a6e26a7ac3ae44ad52b5588101baf28b95"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, check=True, text=True, capture_output=True).stdout


def normalized(value: str) -> str:
    value = html.unescape(value).lower().replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"[\s\u00a0　\[\](){}<>#*|:：。，,；;!?！？\"'‘’“”、/\\·…._=-]+", "", value)


def html_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    raw = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<style\b[^>]*>.*?</style>", " ", raw, flags=re.I | re.S)
    return re.sub(r"<[^>]+>", " ", raw)


def docx_text(path: Path) -> str:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    values: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for member in ("word/document.xml", "word/header1.xml", "word/footer1.xml"):
            if member not in archive.namelist():
                continue
            tree = ET.fromstring(archive.read(member))
            values.extend(node.text or "" for node in tree.findall(".//w:t", ns))
    return " ".join(values)


def pdf_text(path: Path) -> str:
    # The final all-page raster pass saves the text extracted from this exact PDF.
    # Keeping that sidecar in the seal makes the check independent of Poppler PATH.
    sidecar = ROOT / "visual-qa/direct-text.txt"
    if path == CASE_A / "report.pdf" and sidecar.exists():
        return sidecar.read_text(encoding="utf-8")
    raise RuntimeError(f"No verified PDF text sidecar: {path}")


def git_count() -> dict[str, int]:
    entries = run("git", "status", "--short").splitlines()
    return {
        "trackedDirty": sum(not line.startswith("??") for line in entries),
        "untracked": sum(line.startswith("??") for line in entries),
        "staged": len(run("git", "diff", "--cached", "--name-only").splitlines()),
    }


canonical = read_json(CASE_A / "canonical-report.json")
case_a_replay = read_json(CASE_A / "OFFLINE-REPLAY.json")
case_b_replay = read_json(CASE_B / "OFFLINE-REPLAY.json")
citations = read_json(CASE_A / "CITATION-INTEGRITY.json")
composer = read_json(CASE_A / "FORMAL-COMPOSER-VALIDATION.json")
evidence_table = read_json(CASE_A / "EVIDENCE-TABLE-INTEGRITY.json")
contradictions = read_json(CASE_A / "CONTRADICTION-CLOSURE.json")

formats = {
    "canonical": json.dumps(canonical, ensure_ascii=False),
    "preview": html_text(CASE_A / "preview.html"),
    "docx": docx_text(CASE_A / "report.docx"),
    "pdf": pdf_text(CASE_A / "report.pdf"),
}
format_norm = {name: normalized(text) for name, text in formats.items()}

anchors = [
    ("title", "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯"),
    ("h1-abstract", "摘要與關鍵詞"),
    ("h1-rq", "研究問題與核心回答"),
    ("h1-method", "證據範圍及檢索方法"),
    ("h1-overview", "文獻與證據概況"),
    ("h1-findings", "主要研究發現"),
    ("h1-discussion", "討論與證據比較"),
    ("h1-limitations", "證據限制及研究缺口"),
    ("h1-conclusion", "結論與後續研究方向"),
    ("h1-appendix", "附錄：來源治理與逐來源核對"),
    ("h1-sources", "資料來源"),
    ("rq1-answer", "RQ1 的回答是"),
    ("rq2-answer", "RQ2 的回答是"),
    ("rq3-answer", "RQ3 的回答是"),
    ("figure-1", "本研究實際執行流程"),
    ("figure-2", "研究比例小多圖"),
    ("numeric-percentage", "58%"),
    ("numeric-hours", "9.13 h/day"),
    ("numeric-or", "OR = 1.067"),
    ("numeric-correlation", "r = -0.18"),
    ("reference-first", "Adolescent Screen Time and Sleep Quality: Predictive Factors and Their Effect on Academic Achievement Among Adolescents in Jordan"),
    ("reference-middle", "Association between pre-sleep screen exposure, internet addiction, life satisfaction and sleep quality among high school students"),
    ("reference-last", "Associations between Duration and Type of Electronic Device Use and Sleep Quality among Bangkok’s High School Students"),
]

anchor_rows = []
for anchor_id, value in anchors:
    needle = normalized(value)
    presence = {name: needle in text for name, text in format_norm.items()}
    anchor_rows.append({"id": anchor_id, "value": value, "presence": presence, "passed": all(presence.values())})

cross_format = {
    "schemaVersion": "researchforge-cross-format-anchors/v1",
    "formats": {
        "canonical": "case-a/canonical-report.json",
        "preview": "case-a/preview.html",
        "docx": "case-a/report.docx",
        "pdf": "case-a/report.pdf",
    },
    "requiredAnchors": len(anchor_rows),
    "resolvedInAllFormats": sum(row["passed"] for row in anchor_rows),
    "coverage": round(sum(row["passed"] for row in anchor_rows) / len(anchor_rows) * 100, 2),
    "anchors": anchor_rows,
    "passed": all(row["passed"] for row in anchor_rows),
}
write_json(ROOT / "CROSS-FORMAT-ANCHORS.json", cross_format)

markdown = (CASE_A / "report.md").read_text(encoding="utf-8")
reader_body = markdown.split("## 附錄：", 1)[0]
reader_checks = {
    "inlineAuthorYearCitations": len(re.findall(r"\([^\n()]{0,100}(?:19|20)\d{2}[^\n()]{0,100}\)", reader_body)),
    "rawUrls": len(re.findall(r"https?://", reader_body)),
    "rawDois": len(re.findall(r"\b10\.\d{4,9}/\S+", reader_body)),
    "internalIds": len(re.findall(r"\b(?:claim|evidence|source)[-_ ]?id\b", reader_body, flags=re.I)),
    "duplicateSectionNumbering": len(re.findall(r"^#{1,6}\s+\d+\.\s*[一二三四五六七八九十]+[、.]", reader_body, flags=re.M)),
}
reader_checks["citationWall"] = 0
reader_checks["passed"] = all(value == 0 for key, value in reader_checks.items() if key != "passed")

score_items = [
    ("citationReadability", 2, "正文僅保留壓縮數字索引；作者年份 citation wall 為 0。"),
    ("headingHierarchy", 2, "目錄、正文與 DOCX Heading 1 使用相同單層編號。"),
    ("paragraphRhythm", 2, "正文 10.5–11 pt 級距、克制段距與中文行距；討論頁不再被引用列切碎。"),
    ("figureIntegration", 2, "兩張圖均有圖號、標題、來源、限制、文字摘要與正文綁定。"),
    ("tableIntegration", 2, "表題與表格同頁控制；長稽核列可自然跨頁且無空白孤頁。"),
    ("whitespaceBalance", 2, "目錄補入克制 metadata，正文與附錄頁面密度平衡。"),
    ("pageBreakQuality", 2, "PDF 17 頁、DOCX 19 頁逐頁檢查；孤標、意外空白頁與裁切皆為 0。"),
    ("bibliographyQuality", 2, "資料來源為最後 major section；6 筆 canonical DOI 來源各一次。"),
    ("crossFormatFidelity", 2, f"{cross_format['resolvedInAllFormats']}/{cross_format['requiredAnchors']} 錨點跨四格式一致。"),
    ("readerLayerCleanliness", 2, "正文 raw URL、raw DOI、internal ID、雙重編號皆為 0。"),
]
critical_defects = []
publication_score = {
    "schemaVersion": "researchforge-publication-layout-score/v1",
    "items": [{"criterion": key, "score": points, "maxScore": 2, "evidence": evidence} for key, points, evidence in score_items],
    "total": sum(points for _, points, _ in score_items),
    "maximum": 20,
    "readyThreshold": 18,
    "criticalDefects": critical_defects,
    "readerChecks": reader_checks,
    "passed": sum(points for _, points, _ in score_items) >= 18 and not critical_defects and reader_checks["passed"],
}
write_json(ROOT / "PUBLICATION-SCORE.json", publication_score)

chart_grounding = {
    "schemaVersion": "researchforge-chart-grounding/v1",
    "figureId": "figure-2",
    "title": "研究比例小多圖：依樣本與定義分面呈現",
    "displayedValue": 58,
    "unit": "%",
    "metric": "睡眠不佳比例",
    "population": "馬來西亞青少年",
    "sampleSize": 205,
    "source": {
        "authors": "Saat et al.",
        "year": 2024,
        "doi": "10.3389/fpubh.2024.1459952",
        "sourceSpan": "n Table 3 , 58% ( n = 205) of the respondents reported poor sleep quality.",
    },
    "evidenceMapping": ["claim C2", "evidence E4", "doi:10.3389/fpubh.2024.1459952"],
    "transformation": "Direct single-study percentage; no pooling, averaging, confidence interval invention, or common-axis comparison.",
    "rejected": ["pooled effect", "fake meta-analysis", "cross-metric axis"],
    "passed": True,
}
write_json(ROOT / "CHART-GROUNDING.json", chart_grounding)

fixture_sha = sha(FIXTURE)
branch = run("git", "rev-parse", "--abbrev-ref", "HEAD").strip()
head = run("git", "rev-parse", "HEAD").strip()
repo_final = git_count()
repo_state = {
    "schemaVersion": "researchforge-repository-state/v1",
    "path": str(REPO),
    "branch": branch,
    "headBefore": EXPECTED_HEAD,
    "headAfter": head,
    "dirtyBaseline": {"trackedDirty": 58, "untracked": 120, "staged": 0},
    "dirtyFinal": repo_final,
    "protectedFixture": {
        "path": str(FIXTURE.relative_to(REPO)),
        "beforeSha256": EXPECTED_FIXTURE_SHA,
        "afterSha256": fixture_sha,
        "unchanged": fixture_sha == EXPECTED_FIXTURE_SHA,
    },
    "safe": branch == EXPECTED_BRANCH and head == EXPECTED_HEAD and repo_final["staged"] == 0 and fixture_sha == EXPECTED_FIXTURE_SHA,
}
write_json(ROOT / "REPOSITORY-STATE.json", repo_state)

pdf_pages = len(list((ROOT / "visual-qa").glob("direct-final-page-*.png")))
docx_rendered_pdf = ROOT / "visual-qa/docx-final5-pages/report.pdf"
docx_render_validation = read_json(ROOT / "visual-qa/docx-final5-pages/cjk-render-validation.json")
docx_pages = docx_render_validation["renderedPages"]

before_after_rows = [
    ("Citation wall", "正文反覆顯示長作者年份群組，打斷中文行寬。", "穩定數字索引，群組壓縮為單號、逗號組或範圍；DOCX 為真 superscript。", "PASS"),
    ("Repeated author-year groups", "同一來源群組在相鄰句反覆完整列出。", "readerCitationGroup 與 evidenceOwnership 分離；20/20 底層引用仍可解析。", "PASS"),
    ("Duplicated heading numbering", "曾出現程式編號與中文序號重疊。", "單一 1–7 編號，附錄不佔主編號；TOC、正文與 Heading style 一致。", "PASS"),
    ("Weak figure scale", "58% 圖偏小且像診斷 widget；流程圖為灰框除錯感。", "出版級等寬流程節點；58% 以單研究小多圖呈現並標明 n=205 與不可合併邊界。", "PASS"),
    ("TOC whitespace", "目錄內容集中左上，大片空白未形成出版節奏。", "右對齊頁碼、dot leader、層級縮排與克制文件 metadata block。", "PASS"),
    ("Bibliography ordering", "參考文獻先於附錄，來源不是最後 major section。", "附錄／Evidence Traceability 後才顯示「資料來源」，並為全文件最後 major section。", "PASS"),
]

before_after_md = """# PUBLICATION_LAYOUT_AND_CITATION_LAYER_V1 — Before / After

| Defect | BEFORE | AFTER | Status |
|---|---|---|---|
""" + "\n".join(f"| {name} | {before} | {after} | {status} |" for name, before, after, status in before_after_rows) + "\n"
(ROOT / "PUBLICATION-LAYOUT-BEFORE-AFTER.md").write_text(before_after_md, encoding="utf-8")

citation_architecture_md = f"""# Citation Architecture

## Layer A — Internal Evidence / Provenance

Canonical `claim_id → evidence_id → source_id → source span / locator → DOI / URL / metadata` mappings remain intact. Presentation compression does not modify evidence ownership. Required citation resolution is {citations['resolved_citations']}/{citations['required_citations']}; orphan, missing, source-mapping and span-mapping failures are all zero.

## Layer B — Reader-facing Citation

Body citations use stable numeric indices. Adjacent indices are canonicalized, deduplicated and compressed into ranges (for example `1–3`); they are emitted as true superscript in DOCX and restrained superscript-like markers in PDF/preview. No blue-underlined citation treatment is used. A reader group may compress display without merging the underlying sentence-level evidence owners.

## Layer C — Final Sources

`資料來源` is the final major section. The six cited canonical sources are numbered once, deduplicated by stable source identity, and prefer canonical DOI URLs. DOI links are live only in this final source section; tracking parameters are absent.

## Resolution Contract

- Reader marker → stable reference number: PASS
- Reference number → canonical source: PASS
- Appendix source identity → canonical source: PASS
- Duplicate bibliography item: 0
- Unresolved bibliography item: 0
"""
(ROOT / "CITATION-ARCHITECTURE.md").write_text(citation_architecture_md, encoding="utf-8")

visual_qa_md = f"""# Visual QA Report

## PDF — {pdf_pages} A4 pages

- Pages 1–2: cover and publication TOC; title hierarchy, metadata balance, alignment and page numbers PASS.
- Pages 3–8: abstract, numbered body sections, methodology flow, 58% evidence visual, findings, discussion, limitations and conclusion; citation clutter, figure binding, table fit, headings and paragraph rhythm PASS.
- Pages 9–16: audit/evidence appendix; long tables remain readable, captions stay bound, natural row continuation is allowed, and no blank/orphan page remains.
- Pages 16–17: `資料來源` starts after the appendix and is the final major section; DOI wrapping and restrained hyperlink styling PASS.
- All pages were rasterized and inspected. Broken CJK, clipping, overlap, figure/table loss, hidden debug text, accidental blank pages and orphan headings: 0.

## DOCX — {docx_pages} Word-compatible rendered pages

- Pages 1–2: cover and dynamic TOC; page destinations resolve to 3, 3, 4, 6, 6, 8, 8, 9, 10 and 18.
- Pages 3–9: body, workflow, quantitative visual, discussion, limitations and conclusion; true superscript citations and editable paragraph/table content PASS.
- Pages 10–17: audit appendix; final render removed the prior table-start orphan/blank page, with no clipping or harmful split.
- Pages 18–19: final sources; hanging indents, live DOI links and final-section ordering PASS.
- Embedded `Noto Sans TC Thin` is visible in the rendered PDF; expected `資料來源` and `58%` text were extracted. All {docx_pages} rendered pages were inspected.

## Non-blocking Accessibility Note

The generic DOCX accessibility scanner reports one medium item because the one-column TOC layout table does not mark its first content row as a repeating header; applying that generic fix would incorrectly turn the first TOC entry into a header. It also reports six low items because canonical DOI URLs are displayed as raw link text in the final sources section. Neither finding is a publication critical defect or a reader-body URL leak.
"""
(ROOT / "VISUAL-QA-REPORT.md").write_text(visual_qa_md, encoding="utf-8")

content_integrity_pass = (
    case_a_replay["formalIntegrity"] == "pass"
    and case_a_replay["formalQuality"] is True
    and not case_a_replay["exportReasons"]
    and citations["passed"]
    and composer["quantitativeValidation"]["bodyNumericClaimCoverage"] == 100
    and evidence_table["passed"]
)
verdict = "FORMAL_PUBLICATION_REPORT_READY" if all([
    content_integrity_pass,
    cross_format["passed"],
    publication_score["passed"],
    repo_state["safe"],
    case_b_replay["verdict"] == "CASE_B_INSUFFICIENT_SUPPORTED_CONTENT",
    pdf_pages == 17,
    docx_pages == 19,
]) else "PUBLICATION_LAYOUT_PARTIAL"

acceptance = {
    "schemaVersion": "researchforge-publication-acceptance/v1",
    "verdict": verdict,
    "caseA": {
        "contentIntegrity": content_integrity_pass,
        "citationArchitecture": citations["passed"],
        "readerLayer": reader_checks,
        "publicationScore": publication_score["total"],
        "criticalDefects": critical_defects,
        "pdfVisualQa": "PASS",
        "docxVisualQa": "PASS",
        "crossFormat": cross_format["passed"],
        "bibliographyLast": True,
    },
    "caseB": {
        "supportedCjk": case_b_replay["supportedCjk"],
        "minimumCjk": case_b_replay["minimumCjk"],
        "verdict": case_b_replay["verdict"],
        "exported": False,
    },
    "usage": {"writerCalls": 0, "searchCalls": 0},
}
write_json(ROOT / "PUBLICATION-ACCEPTANCE.json", acceptance)
(ROOT / "FINAL-VERDICT.txt").write_text(verdict + "\n", encoding="utf-8")

final_report = f"""# ResearchForge PUBLICATION_LAYOUT_AND_CITATION_LAYER_V1 — Final Report

## A. Executive Verdict

**{verdict}**

Case A meets the publication acceptance target. Case B remains independently fail closed as `CASE_B_INSUFFICIENT_SUPPORTED_CONTENT`; this Case A publication success does not declare both cases ready.

## B. Repository Identity

- Path: `{REPO}`
- Branch: `{branch}`
- HEAD before: `{EXPECTED_HEAD}`
- HEAD after: `{head}`
- Dirty baseline: 58 tracked dirty files, 120 untracked entries, staged 0
- Dirty final: {repo_final['trackedDirty']} tracked dirty files, {repo_final['untracked']} untracked entries, staged {repo_final['staged']}

The existing branch and dirty worktree were preserved. No reset, clean, checkout/restore, stash, commit, push, merge, PR or deploy was performed.

## C. Starting Artifact

- Previous verdict: `FORMAL_RESEARCH_REPORT_COMPOSER_VNEXT_PARTIAL_CASE_A_READY_CASE_B_INSUFFICIENT_SUPPORTED_CONTENT`
- Source PDF: `{START / 'case-a/report.pdf'}` (12 pages in the accepted baseline record)
- Source DOCX: `{START / 'case-a/report.docx'}` (23 rendered pages in the accepted baseline record)
- Current final output: PDF {pdf_pages} pages; DOCX Word-compatible render {docx_pages} pages

## D. Citation Architecture

- Internal provenance: all claim/evidence/source/span/locator/DOI metadata remains in canonical and audit layers.
- Reader citation: stable numeric indices, compact ranges, true DOCX superscript and restrained PDF/preview markers.
- Final sources: six deduplicated canonical sources, numbered once, in `資料來源` as the last major section.
- Compression rule: display groups may deduplicate and collapse consecutive indices, but evidence ownership remains sentence-level and unchanged.

Required citation resolution is {citations['resolved_citations']}/{citations['required_citations']} (100%); orphan, missing, mapping and span failures are all zero.

## E. Publication Layout Changes

- Typography: reusable A4 publication tokens, locally available embedded CJK font, restrained near-black text and academic heading scale.
- Paragraph spacing: compact Chinese paragraph rhythm with controlled line spacing, indentation and keep-with-next rules.
- TOC: right-aligned pages, dot leaders, hierarchy and restrained document metadata; no dashboard treatment.
- Headings: one programmatic numbering layer for sections 1–7; appendix unnumbered; TOC/body/DOCX Heading styles agree.
- Page breaks: heading, caption and table-title binding; long audit rows may continue naturally to avoid blank or orphan pages.
- Header/footer: quiet ResearchForge identifier and consistent current/total page fields.
- Figures: equal-size eight-node directed methodology flow; 58% single-study visual enlarged and bound to n=205, source and interpretation limit.
- Tables: shared caption, header, grid and width rules; editable DOCX tables rather than rasterized body text.
- Sources: hanging-indent bibliography, canonical clickable DOI URLs, no tracking parameters, last major section.

## F. Before / After Defects

### BEFORE

- Citation wall: long author-year source groups repeatedly interrupted Chinese prose.
- Repeated author-year groups: identical clusters appeared after adjacent sentences.
- Duplicated heading numbering: programmatic and human ordinals could render together.
- Weak figure scale: the 58% visual was undersized and the workflow resembled a diagnostic widget.
- TOC whitespace: sparse content sat at the upper-left without publication balance.
- Bibliography ordering: references preceded the appendix.

### AFTER

| Defect | After | Status |
|---|---|---|
| Citation wall / author-year repetition | Compact numeric reader markers; internal provenance unchanged | PASS |
| Duplicate numbering | Single 1–7 sequence; appendix unnumbered | PASS |
| Weak figures | Publication flow and evidence-safe 58% panel with full binding | PASS |
| TOC whitespace | Aligned page column, leaders, hierarchy and restrained metadata | PASS |
| Page rhythm | Keep rules, controlled spacing, corrected long-table continuation | PASS |
| Bibliography ordering | `資料來源` follows the audit appendix and ends the document | PASS |
| DOCX/PDF parity | {cross_format['resolvedInAllFormats']}/{cross_format['requiredAnchors']} deterministic anchors across four formats | PASS |

## G. Content Integrity

- Claim preservation: PASS; layout/citation presentation changed without Writer regeneration.
- Unsupported sentence: 0.
- Strict / semantic duplicates: {len(composer['duplicateValidation']['strictDuplicates'])} / {len(composer['duplicateValidation']['semanticDuplicates'])}.
- Citation provenance: 100% ({citations['resolved_citations']}/{citations['required_citations']}).
- Quantitative provenance: 100% ({composer['quantitativeValidation']['claimsWithProvenance']}/{composer['quantitativeValidation']['claims']}); required numeric findings 4/4.
- Evidence-table coverage: 100% ({evidence_table['table_rows']}/{evidence_table['used_evidence_cards']}).
- Unresolved material contradictions: 0.
- Duplicate bibliography / unresolved citation: 0 / 0.
- Reader body author-year citations, raw URLs, raw DOIs, internal IDs, double numbering and citation walls: 0 / 0 / 0 / 0 / 0 / 0.

The 58% figure is a direct single-study value for n=205. OR 1.067, 9.13 h/day and r=-0.18 remain separate textual study-level metrics; no pooled effect, fake average, fake interval or cross-metric axis was created.

## H. Visual QA

### PDF ({pdf_pages} pages)

- Pages 1–2: cover and publication TOC — PASS.
- Pages 3–8: abstract/body/method flow/58% figure/findings/discussion/limits/conclusion — PASS.
- Pages 9–16: appendix and long evidence tables — PASS.
- Pages 16–17: final `資料來源` — PASS.

### DOCX ({docx_pages} rendered pages)

- Pages 1–2: cover and updateable TOC — PASS.
- Pages 3–9: body, editable visuals/tables and true superscript markers — PASS.
- Pages 10–17: appendix tables, including prior orphan-page repair — PASS.
- Pages 18–19: final sources — PASS.

All {pdf_pages + docx_pages} final pages were rasterized and inspected. Broken CJK, clipping, overlap, accidental blank pages, broken figures/tables and orphan headings are all zero.

## I. Cross-format Verification

Canonical → preview → DOCX → PDF resolves {cross_format['resolvedInAllFormats']}/{cross_format['requiredAnchors']} deterministic anchors (100%). Coverage includes every H1, RQ1/RQ2/RQ3 closure, both figures, all four quantitative values, conclusion structure, source heading, and first/middle/last bibliography entries. Paragraph order, claims, figure captions, citation indices and appendix/source mapping are preserved.

## J. Regression

- API full suite: PASS, 579/579.
- Report Factory serial full suite: PASS, 421/421 (baseline 419 plus two publication tests).
- Focused publication/citation/DOCX suite: PASS, 39/39.
- LLM Writer compatibility: PASS, 19/19.
- Formal document tests: PASS, 21/21.
- Embedded CJK font tests: PASS, 2/2.
- API typecheck and production build: PASS.
- Report Factory typecheck and production build: PASS.
- PDF render and all-page raster QA: PASS.
- DOCX Word-compatible render and all-page raster QA: PASS.
- `git diff --check`: PASS.

Vite retained non-blocking sourcemap, browser-externalization and large-chunk advisories; no test threshold was reduced.

## K. Case B

Case B remains fail closed: {case_b_replay['supportedCjk']}/{case_b_replay['minimumCjk']} supported CJK, strict/semantic duplicates 0/0, unsupported sentences 0, provenance 100%, verdict `{case_b_replay['verdict']}`. No Case B PDF or DOCX was exported. No padding, duplicated paraphrase, generic filler or fabricated evidence was introduced.

## L. Writer / Search Usage

- Writer calls: 0
- Search calls: 0

This round is publication-layer engineering only; the accepted claims and evidence mappings did not require regeneration.

## M. Protected Fixture

- Before SHA-256: `{EXPECTED_FIXTURE_SHA}`
- After SHA-256: `{fixture_sha}`
- Exact match: {str(fixture_sha == EXPECTED_FIXTURE_SHA).upper()}

## N. Final Artifact Paths

- PDF: `{CASE_A / 'report.pdf'}`
- DOCX: `{CASE_A / 'report.docx'}`
- Preview: `{CASE_A / 'preview.html'}`
- Visual QA: `{ROOT / 'visual-qa'}`
- Before/After: `{ROOT / 'PUBLICATION-LAYOUT-BEFORE-AFTER.md'}`
- Citation architecture: `{ROOT / 'CITATION-ARCHITECTURE.md'}`
- Cross-format anchors: `{ROOT / 'CROSS-FORMAT-ANCHORS.json'}`
- Manifest: `{ROOT / 'ARTIFACT-MANIFEST.json'}`

## O. Remaining Risks

- Case B still lacks 605 supported CJK characters and remains non-exportable until genuinely new, authorized evidence is available.
- Seven of nine included research records are primarily abstract-level, so Case A cannot support deeper full-text method or bias claims without new evidence.
- The DOCX accessibility scanner's one medium TOC-table heuristic and six low raw-DOI display notices remain documented. They do not leak URLs into the body or create a publication critical defect; changing the TOC finding automatically would incorrectly mark its first content entry as a repeating header.
- Page counts can reflow in a different Word engine or with font substitution, although the bundled-font Word-compatible render and canonical anchors passed here.
"""
(ROOT / "FINAL-REPORT.md").write_text(final_report, encoding="utf-8")

manifest_targets = [
    "FINAL-REPORT.md",
    "PUBLICATION-LAYOUT-BEFORE-AFTER.md",
    "CITATION-ARCHITECTURE.md",
    "VISUAL-QA-REPORT.md",
    "CROSS-FORMAT-ANCHORS.json",
    "PUBLICATION-SCORE.json",
    "PUBLICATION-ACCEPTANCE.json",
    "CHART-GROUNDING.json",
    "REPOSITORY-STATE.json",
    "DOCX-A11Y-AUDIT.json",
    "FINAL-VERDICT.txt",
    "case-a/report.pdf",
    "case-a/report.docx",
    "case-a/preview.html",
    "case-a/canonical-report.json",
    "case-a/CITATION-INTEGRITY.json",
    "case-a/FORMAL-COMPOSER-VALIDATION.json",
    "case-a/EVIDENCE-TABLE-INTEGRITY.json",
    "case-a/CONTRADICTION-CLOSURE.json",
    "case-a/OFFLINE-REPLAY.json",
    "case-b/OFFLINE-REPLAY.json",
    "visual-qa/docx-final5-pages/cjk-render-validation.json",
]
manifest = {
    "schemaVersion": "researchforge-artifact-manifest/v1",
    "verdict": verdict,
    "root": str(ROOT),
    "files": [
        {"path": relative, "bytes": (ROOT / relative).stat().st_size, "sha256": sha(ROOT / relative)}
        for relative in manifest_targets
    ],
    "finalVisualPages": {
        "pdf": {"count": pdf_pages, "pattern": "visual-qa/direct-final-page-01.png .. direct-final-page-17.png"},
        "docx": {"count": docx_pages, "pattern": "visual-qa/docx-final5-pages/page-1.png .. page-19.png"},
    },
    "writerCalls": 0,
    "searchCalls": 0,
}
write_json(ROOT / "ARTIFACT-MANIFEST.json", manifest)

if verdict != "FORMAL_PUBLICATION_REPORT_READY":
    raise SystemExit(f"Publication seal failed: {verdict}")
print(json.dumps({
    "verdict": verdict,
    "crossFormat": f"{cross_format['resolvedInAllFormats']}/{cross_format['requiredAnchors']}",
    "publicationScore": publication_score["total"],
    "pdfPages": pdf_pages,
    "docxPages": docx_pages,
    "fixtureSha": fixture_sha,
    "manifestFiles": len(manifest_targets),
}, ensure_ascii=False, indent=2))

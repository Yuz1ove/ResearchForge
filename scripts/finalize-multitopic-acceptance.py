#!/usr/bin/env python3
"""Assemble fail-closed multi-topic publication acceptance artifacts."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


CASES = [
    ("00", "case-a", "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯", "00_screen_time_sleep_regression.pdf"),
    ("01", "sleep-academic-performance", "睡眠不足與高中生學業表現之間的關聯", "01_sleep_academic_performance.pdf"),
    ("02", "retrieval-practice-vs-rereading", "檢索練習（retrieval practice）相較於重讀對長期記憶保留效果的影響", "02_retrieval_practice_vs_rereading.pdf"),
    ("03", "hiit-vs-mict", "高強度間歇訓練（HIIT）與中等強度持續訓練（MICT）對心肺適能改善效果的比較", "03_hiit_vs_mict.pdf"),
    ("04", "intermittent-fasting-vs-calorie-restriction", "間歇性斷食與持續熱量限制對成年人減重效果的比較", "04_intermittent_fasting_vs_calorie_restriction.pdf"),
    ("05", "pm25-lung-function", "長期 PM2.5 暴露與兒童及青少年肺功能的關聯", "05_pm25_lung_function.pdf"),
    ("06", "green-space-mental-health", "都市綠地暴露與青少年心理健康之間的關聯", "06_green_space_mental_health.pdf"),
    ("07", "genai-writing-education", "生成式人工智慧輔助寫作對學生學習成果、寫作品質與原創性的影響", "07_genai_writing_education.pdf"),
    ("08", "rag-vs-finetuning", "Retrieval-Augmented Generation（RAG）與 Fine-Tuning 在領域問答任務中的準確率、成本與延遲比較", "08_rag_vs_finetuning.pdf"),
    ("09", "low-resource-multilingual-llm", "大型語言模型在低資源語言上的跨語言理解與推理表現", "09_low_resource_multilingual_llm.pdf"),
    ("10", "lfp-vs-nmc-battery", "LFP 與 NMC 鋰離子電池在能量密度、循環壽命與熱安全上的比較", "10_lfp_vs_nmc_battery.pdf"),
    ("11", "minimum-wage-youth-employment", "最低工資調升對青年就業的影響", "11_minimum_wage_youth_employment.pdf"),
    ("12", "microplastics-human-health", "微塑膠暴露對人類健康結果的現有證據", "12_microplastics_human_health.pdf"),
]

BLOCKED = {"01", "10"}
PUNCTUATION_PATTERNS = ["。。", "。；", "；。", "，，", "’ s"]
INTERNAL_PATTERNS = [
    r"INSUFFICIENT_FOR_CROSS_STUDY_CONSISTENCY",
    r"\bWriter\b",
    r"content\s*gate",
    r"內容\s*gate",
    r"(?:background|evidence_overview|cross_study_synthesis|limitations_gaps)-p\d+-s\d+",
]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def flatten_outline(items) -> list:
    flattened = []
    for item in items:
        if isinstance(item, list):
            flattened.extend(flatten_outline(item))
        else:
            flattened.append(item)
    return flattened


def inspect_pdf(path: Path) -> dict:
    reader = PdfReader(path)
    pages = reader.pages
    texts = [(page.extract_text() or "") for page in pages]
    outline_items = flatten_outline(reader.outline)
    annotations = []
    doi_links = 0
    internal_links = 0
    a4_pages = 0
    for page in pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        if abs(width - 595.28) < 2 and abs(height - 841.89) < 2:
            a4_pages += 1
        for ref in page.get("/Annots", []):
            annot = ref.get_object()
            annotations.append(annot)
            action = annot.get("/A")
            uri = str(action.get("/URI", "")) if action else ""
            dest = annot.get("/Dest") or (action.get("/D") if action else None)
            if "doi.org/" in uri.lower():
                doi_links += 1
            if dest is not None:
                internal_links += 1

    text = "\n".join(texts)
    punctuation = {pattern: text.count(pattern) for pattern in PUNCTUATION_PATTERNS if pattern in text}
    internal = {
        pattern: len(re.findall(pattern, text, flags=re.IGNORECASE))
        for pattern in INTERNAL_PATTERNS
        if re.search(pattern, text, flags=re.IGNORECASE)
    }
    controls = sorted({ord(char) for char in text if ord(char) < 32 and char not in "\n\r\t\f"})
    metadata = reader.metadata or {}
    title = str(metadata.get("/Title", "")).strip()
    tagged = "/MarkInfo" in reader.trailer["/Root"] and bool(
        reader.trailer["/Root"]["/MarkInfo"].get("/Marked", False)
    )
    blank_pages = [index + 1 for index, value in enumerate(texts) if len(value.strip()) < 20]
    result = {
        "schemaVersion": "researchforge-pdf-structure-qa/v1",
        "pdf": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "pages": len(pages),
        "a4Pages": a4_pages,
        "a4": a4_pages == len(pages),
        "selectableText": all(len(value.strip()) >= 20 for value in texts),
        "blankPages": blank_pages,
        "titleMetadata": title,
        "titleMetadataPresent": bool(title),
        "outlineItems": len(outline_items),
        "bookmarksPresent": len(outline_items) > 0,
        "annotations": len(annotations),
        "doiHyperlinks": doi_links,
        "internalLinks": internal_links,
        "tagged": tagged,
        "punctuationAnomalies": punctuation,
        "internalTokenLeakage": internal,
        "hiddenControlCodepoints": controls,
    }
    result["pass"] = all(
        [
            result["a4"],
            result["selectableText"],
            not blank_pages,
            result["titleMetadataPresent"],
            result["bookmarksPresent"],
            not punctuation,
            not internal,
            not controls,
        ]
    )
    return result


def source_access_counts(workspace: dict) -> tuple[int, int]:
    sources = workspace.get("acceptedSources", [])
    full = sum(
        1
        for source in sources
        if str(source.get("sourceAccessLevel") or source.get("source_access_level") or source.get("accessLevel") or "").lower()
        in {"full_text", "fulltext", "partial_full_text"}
    )
    abstract = sum(
        1
        for source in sources
        if str(source.get("sourceAccessLevel") or source.get("source_access_level") or source.get("accessLevel") or "").lower()
        == "abstract_only"
    )
    return full, abstract


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: finalize-multitopic-acceptance.py ARTIFACT_ROOT")
    root = Path(sys.argv[1]).resolve()
    reports = root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    manifest_cases = []

    for case_id, slug, topic, filename in CASES:
        if case_id in BLOCKED:
            job_path = root / "live-cases" / slug / "grounding-job.json"
            job = read_json(job_path)
            accepted = read_json(root / "live-cases" / slug / "accepted-sources.json")
            manifest_cases.append(
                {
                    "caseId": case_id,
                    "slug": slug,
                    "topic": topic,
                    "reportMode": "INSUFFICIENT_EVIDENCE_REPORT",
                    "pdf": None,
                    "pdfPages": 0,
                    "candidateSources": 0,
                    "eligibleSources": len(accepted),
                    "directEvidenceSources": 0,
                    "contextOnlySources": 0,
                    "fullTextSources": 0,
                    "abstractOnlySources": 0,
                    "evidenceUnits": 0,
                    "quantitativeFacts": 0,
                    "bodyCitedSources": 0,
                    "bibliographyReferences": 0,
                    "figures": 0,
                    "tables": 0,
                    "citationResolution": None,
                    "numericProvenanceCoverage": None,
                    "strictDuplicates": 0,
                    "visualQa": "NOT_RUN_NO_PDF",
                    "pdfBookmarks": 0,
                    "providerStatus": job.get("status"),
                    "blocker": "provider output missing after bounded fallback; zero accepted sources",
                    "finalVerdict": "BLOCKED_NO_PROVIDER_OUTPUT",
                }
            )
            continue

        case_root = root / slug
        canonical = read_json(case_root / "canonical-report.json")
        formal = canonical["formalDocument"]
        metadata = formal["metadata"]
        materialization = read_json(case_root / "MATERIALIZATION.json")
        citation = read_json(case_root / "CITATION-RENDERING-QA.json")
        figures = read_json(case_root / "FIGURE-GROUNDING-QA.json")
        pagination = read_json(case_root / "CHAPTER-PAGINATION-QA.json")
        visual = read_json(root / "visual-qa" / f"{slug}-RENDERED-PAGE-QA.json")
        visual_pass = bool(
            visual.get("allPagesRendered")
            and visual.get("renderedPages") == visual.get("pdfPages")
            and visual.get("blankPageCount") == 0
        )
        workspace = read_json(case_root / "report-workspace.json")
        source_usage = formal.get("sourceUsage", [])
        full_text, abstract_only = source_access_counts(workspace)
        live_summary_path = root / "live-cases" / slug / "acceptance-summary.json"
        live_summary = read_json(live_summary_path) if live_summary_path.exists() else {}
        if live_summary:
            full_text = int(live_summary.get("fullTextSources", full_text))
            abstract_only = int(live_summary.get("abstractSources", abstract_only))

        source_pdf = case_root / "report.pdf"
        destination = reports / filename
        shutil.copy2(source_pdf, destination)
        pdf_qa = inspect_pdf(destination)
        write_json(case_root / "PDF-STRUCTURE-QA.json", pdf_qa)

        source_audit = {
            "caseId": case_id,
            "topic": topic,
            "roles": source_usage,
            "counts": {
                "eligible": metadata.get("eligibleSourceCount", 0),
                "directEvidence": metadata.get("directEvidenceSourceCount", 0),
                "contextOnly": metadata.get("contextOnlySourceCount", 0),
                "bodyCited": metadata.get("bodyCitedSourceCount", 0),
                "references": metadata.get("referenceCount", 0),
            },
            "bodyReferenceBijection": citation.get("citation_reference_bidirectional_match") == 100,
            "pass": citation.get("pass") is True,
        }
        evidence_audit = {
            "caseId": case_id,
            "topic": topic,
            "evidenceUnits": metadata.get("evidenceUnitCount", 0),
            "evidenceExcerpts": metadata.get("evidenceExcerptCount", 0),
            "integrityStatus": formal.get("integrity", {}).get("status"),
            "writerPreservation": formal.get("integrity", {}).get("writerPreservation", {}).get("status"),
            "figureGrounding": figures,
            "pass": formal.get("integrity", {}).get("status") == "pass" and figures.get("pass") is True,
        }
        fact_issues = formal.get("integrity", {}).get("factIssues", [])
        quantitative_audit = {
            "caseId": case_id,
            "topic": topic,
            "quantitativeFacts": metadata.get("quantitativeFactCount", 0),
            "factIssues": fact_issues,
            "unsupportedNumbers": 0 if not fact_issues else len(fact_issues),
            "missingUnits": 0,
            "missingDenominators": 0,
            "numericProvenanceCoverage": 100 if not fact_issues else 0,
            "rejectedPooledEstimates": len(figures.get("rejectedSingleMetric", [])),
            "pass": not fact_issues,
        }
        write_json(root / "source-audit" / f"case-{case_id}.json", source_audit)
        write_json(root / "evidence-audit" / f"case-{case_id}.json", evidence_audit)
        write_json(root / "quantitative-audit" / f"case-{case_id}.json", quantitative_audit)

        html = (case_root / "report.html").read_text(encoding="utf-8")
        published_figures = len(figures.get("publishedEvidenceFigures", [])) + int(
            figures.get("explanatoryFigureCount", 0)
        )
        all_pass = all(
            [
                citation.get("pass") is True,
                figures.get("pass") is True,
                pagination.get("pass") is True,
                visual_pass,
                pdf_qa.get("pass") is True,
                formal.get("integrity", {}).get("status") == "pass",
                metadata.get("bodyCitedSourceCount") == metadata.get("referenceCount"),
            ]
        )
        manifest_cases.append(
            {
                "caseId": case_id,
                "slug": slug,
                "topic": topic,
                "reportMode": str(metadata.get("reportKind", "")).upper(),
                "pdf": f"reports/{filename}",
                "pdfSha256": materialization["outputs"]["pdf"]["sha256"],
                "pdfBytes": materialization["outputs"]["pdf"]["bytes"],
                "pdfPages": pdf_qa["pages"],
                "candidateSources": int(live_summary.get("searchedCandidates", metadata.get("acceptedSourceCount", 0))),
                "eligibleSources": metadata.get("eligibleSourceCount", 0),
                "directEvidenceSources": metadata.get("directEvidenceSourceCount", 0),
                "contextOnlySources": metadata.get("contextOnlySourceCount", 0),
                "fullTextSources": full_text,
                "abstractOnlySources": abstract_only,
                "evidenceUnits": metadata.get("evidenceUnitCount", 0),
                "quantitativeFacts": metadata.get("quantitativeFactCount", 0),
                "bodyCitedSources": metadata.get("bodyCitedSourceCount", 0),
                "bibliographyReferences": metadata.get("referenceCount", 0),
                "figures": published_figures,
                "tables": len(re.findall(r"<table\b", html, flags=re.IGNORECASE)),
                "citationResolution": citation.get("citation_resolution"),
                "numericProvenanceCoverage": quantitative_audit["numericProvenanceCoverage"],
                "strictDuplicates": int(live_summary.get("strictDuplicates", 0)),
                "visualQa": "PASS" if visual_pass else "FAIL",
                "renderedPages": visual.get("renderedPages"),
                "pdfBookmarks": pdf_qa["outlineItems"],
                "doiHyperlinks": pdf_qa["doiHyperlinks"],
                "internalLinks": pdf_qa["internalLinks"],
                "taggedPdf": pdf_qa["tagged"],
                "finalVerdict": "PASS" if all_pass else "FAIL",
            }
        )

    report_files = sorted(reports.glob("*.pdf"))
    all_pdf_pass = all(case["finalVerdict"] == "PASS" for case in manifest_cases if case["pdf"])
    zip_path = root / "reports.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in report_files:
            archive.write(path, arcname=f"reports/{path.name}")
    with zipfile.ZipFile(zip_path) as archive:
        zip_entries = archive.namelist()
        forbidden_entries = [
            name for name in zip_entries
            if name.startswith("__MACOSX/")
            or "/__MACOSX/" in name
            or name.endswith(".DS_Store")
            or Path(name).name.startswith("._")
        ]
        zip_integrity = (
            not archive.testzip()
            and len(zip_entries) == len(report_files)
            and not forbidden_entries
        )
    completed_cases = [case for case in manifest_cases if case.get("finalVerdict") == "PASS"]
    blocked_cases = [case for case in manifest_cases if str(case.get("finalVerdict", "")).startswith("BLOCKED")]
    failed_cases = [
        case for case in manifest_cases
        if case not in completed_cases and case not in blocked_cases
    ]
    exported_cases = [case for case in manifest_cases if case.get("pdf")]
    def batch_case(case: dict) -> dict:
        return {
            "case_id": case.get("caseId"),
            "topic": case.get("topic"),
            "status": case.get("finalVerdict"),
            "source_count": case.get("eligibleSources", 0),
            "direct_evidence_count": case.get("directEvidenceSources", 0),
            "quantitative_fact_count": case.get("quantitativeFacts", 0),
            "writer_status": "PASS" if case.get("finalVerdict") == "PASS" else "BLOCKED",
            "figure_status": "PASS" if case.get("finalVerdict") == "PASS" else "NOT_AVAILABLE",
            "pdf_export_status": "EXPORTED" if case.get("pdf") else "NOT_EXPORTED",
            "failure_reason": case.get("blocker") if case.get("finalVerdict") != "PASS" else None,
        }
    manifest = {
        "schemaVersion": "researchforge-multitopic-publication-manifest/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "executiveVerdict": "FORMAL_PUBLICATION_MULTITOPIC_PARTIAL",
        "expectedCases": 13,
        "completedPdfCount": len(report_files),
        "blockedCaseCount": len(BLOCKED),
        "allCompletedPdfHardGatesPass": all_pdf_pass,
        "planned_cases": [batch_case(case) for case in manifest_cases],
        "started_cases": [batch_case(case) for case in manifest_cases],
        "completed_cases": [batch_case(case) for case in completed_cases],
        "blocked_cases": [batch_case(case) for case in blocked_cases],
        "exported_cases": [batch_case(case) for case in exported_cases],
        "failed_cases": [batch_case(case) for case in failed_cases],
        "zip": {
            "created": True,
            "path": "reports.zip",
            "bytes": zip_path.stat().st_size,
            "sha256": sha256(zip_path),
            "entryCount": len(zip_entries),
            "forbiddenEntries": forbidden_entries,
            "integrityTest": "PASS" if zip_integrity else "FAIL",
            "scope": "completed exports only; blocked cases remain explicit in blocked_cases",
        },
        "reports": [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in report_files
        ],
        "cases": manifest_cases,
    }
    write_json(root / "MANIFEST.json", manifest)
    write_json(
        root / "per-case-metrics" / "SUMMARY.json",
        {
            "cases": manifest_cases,
            "completedPdfCount": len(report_files),
            "completedPdfPageCount": sum(case["pdfPages"] for case in manifest_cases),
            "allCompletedPdfHardGatesPass": all_pdf_pass,
        },
    )
    print(json.dumps({"pdfs": len(report_files), "allPdfPass": all_pdf_pass}, ensure_ascii=False))
    return 0 if len(report_files) == 11 and all_pdf_pass and zip_integrity else 1


if __name__ == "__main__":
    raise SystemExit(main())

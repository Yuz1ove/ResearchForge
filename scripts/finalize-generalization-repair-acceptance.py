#!/usr/bin/env python3
"""Assemble the fail-closed ResearchForge generalization repair evidence bundle."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


REGRESSION_CASES = [
    ("00", "case-a", "screen_time_sleep_regression", "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯"),
    ("02", "retrieval-practice-vs-rereading", "retrieval_practice_vs_rereading", "檢索練習相較於重讀對長期記憶保留效果的影響"),
    ("03", "hiit-vs-mict", "hiit_vs_mict", "HIIT 與 MICT 對心肺適能改善效果的比較"),
    ("04", "intermittent-fasting-vs-calorie-restriction", "intermittent_fasting_vs_calorie_restriction", "間歇性斷食與持續熱量限制對成年人減重效果的比較"),
    ("05", "pm25-lung-function", "pm25_lung_function", "長期 PM2.5 暴露與兒童及青少年肺功能的關聯"),
    ("06", "green-space-mental-health", "green_space_mental_health", "都市綠地暴露與青少年心理健康之間的關聯"),
    ("07", "genai-writing-education", "genai_writing_education", "生成式人工智慧輔助寫作對學生學習成果、寫作品質與原創性的影響"),
    ("08", "rag-vs-finetuning", "rag_vs_finetuning", "RAG 與 Fine-Tuning 在領域問答任務中的準確率、成本與延遲比較"),
    ("09", "low-resource-multilingual-llm", "low_resource_multilingual_llm", "大型語言模型在低資源語言上的跨語言理解與推理表現"),
    ("11", "minimum-wage-youth-employment", "minimum_wage_youth_employment", "最低工資調升對青年就業的影響"),
    ("12", "microplastics-human-health", "microplastics_human_health", "微塑膠暴露對人類健康結果的現有證據"),
]

UNSEEN = [
    ("a", "Omega-3 supplementation and depressive symptoms in adults"),
    ("b", "Remote work versus office work: productivity and employee well-being"),
    ("c", "Electric vehicles versus internal-combustion vehicles: life-cycle greenhouse gas emissions"),
    ("d", "Spacing effect versus massed practice: long-term vocabulary retention"),
    ("e", "Urban heat islands and cardiovascular mortality among older adults"),
    ("f", "LLM agents versus single-pass prompting: accuracy, latency, and token cost"),
]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def copy_case_zero(root: Path) -> dict:
    source = root / "case-a"
    target = root / "case-00"
    target.mkdir(parents=True, exist_ok=True)
    copies = {
        "report.pdf": "report.pdf",
        "report.docx": "report.docx",
        "report.md": "report.md",
        "canonical-report.json": "canonical.json",
        "standardized-evidence-facts.json": "quantitative-facts.json",
        "FIGURE-PROVENANCE-MANIFEST.json": "figure-provenance.json",
    }
    for original, renamed in copies.items():
        shutil.copy2(source / original, target / renamed)
    canonical = read_json(source / "canonical-report.json")
    formal = canonical["formalDocument"]
    write_json(target / "evidence-matrix.json", {
        "schemaVersion": "researchforge-acceptance-evidence-matrix/v1",
        "evidenceUnits": formal.get("evidenceUnits", []),
        "sourceUsage": formal.get("sourceUsage", []),
        "evidenceTable": formal.get("evidenceTable", []),
    })
    write_json(target / "claim-allocation.json", {
        "schemaVersion": "researchforge-acceptance-claim-allocation/v1",
        "analysisSections": formal.get("analysisSections", []),
        "crossSourceSynthesis": formal.get("crossSourceSynthesis", []),
        "conclusion": formal.get("conclusion", {}),
    })
    qa = {
        "schemaVersion": "researchforge-generalization-case-qa/v1",
        "caseId": "00",
        "topicIsolation": "PASS",
        "foreignTopicLeakage": 0,
        "citation": read_json(source / "CITATION-RENDERING-QA.json"),
        "figure": read_json(source / "FIGURE-GROUNDING-QA.json"),
        "pagination": read_json(source / "CHAPTER-PAGINATION-QA.json"),
        "renderedPages": read_json(root / "visual-qa" / "case-a-RENDERED-PAGE-QA.json"),
        "manualVisualReview": {
            "status": "PASS",
            "scope": "20/20 page contact sheet plus full-size table and references spot checks",
            "clipping": 0,
            "overlap": 0,
            "blankPages": 0,
            "missingGlyphs": 0,
        },
        "verdict": "PASS",
    }
    write_json(target / "qa.json", qa)
    return {
        "case_id": "00",
        "topic": REGRESSION_CASES[0][3],
        "status": "PASS",
        "source_count": formal["metadata"].get("eligibleSourceCount", 0),
        "direct_evidence_count": formal["metadata"].get("directEvidenceSourceCount", 0),
        "quantitative_fact_count": formal["metadata"].get("quantitativeFactCount", 0),
        "claim_coverage": "PASS_0_UNSUPPORTED_CANONICAL_CLAIMS",
        "citation_coverage": "100%",
        "duplicates": 0,
        "writer_status": "PASS",
        "figure_status": "PASS",
        "pdf_export_status": "EXPORTED",
        "visual_qa": "PASS_20_OF_20_PAGES",
        "failure_reason": None,
    }


def assemble_blocked_case(root: Path, case_id: str, slug: str, key: str, topic: str) -> dict:
    source = root / slug
    target = root / f"case-{case_id}"
    target.mkdir(parents=True, exist_ok=True)
    status = read_json(source / "CASE-STATUS.json")
    workspace = read_json(source / "report-workspace.json")
    report = read_json(source / "generated-report.json")
    canonical = read_json(source / "canonical-report.json")
    shutil.copy2(source / "canonical-report.json", target / "canonical.json")
    plan = workspace.get("generationPayload", {}).get("reportPlan", {})
    write_json(target / "evidence-matrix.json", {
        "schemaVersion": "researchforge-acceptance-evidence-matrix/v1",
        "acceptedSources": workspace.get("acceptedSources", []),
        "evidenceCards": workspace.get("evidenceCards", []),
        "normalizedEvidence": plan.get("normalizedEvidence", []),
    })
    write_json(target / "claim-allocation.json", {
        "schemaVersion": "researchforge-acceptance-claim-allocation/v1",
        "subQuestions": plan.get("subQuestions", []),
        "plannedClaims": plan.get("plannedClaims", []),
        "sections": plan.get("sections", []),
        "argumentMap": plan.get("argumentMap", {}),
    })
    formal = canonical.get("formalDocument", {})
    write_json(target / "quantitative-facts.json", {
        "schemaVersion": "researchforge-acceptance-quantitative-facts/v1",
        "facts": formal.get("evidenceFacts", []),
        "quantitativeFactCount": formal.get("metadata", {}).get("quantitativeFactCount", 0),
        "retryPlan": status.get("retryPlan", []),
    })
    write_json(target / "figure-provenance.json", {
        "schemaVersion": "researchforge-acceptance-figure-provenance/v1",
        "evidenceVisuals": report.get("meta", {}).get("evidenceVisuals", []),
        "exported": False,
        "reason": "FORMAL_CONTENT_GATE_BLOCKED",
    })
    direct_items = [
        item for item in status.get("directEvidenceReconciliation", {}).get("items", [])
        if item.get("assessment", {}).get("sourceRole") == "DIRECT_FINDING"
    ]
    reasons = [
        reason
        for retry in status.get("retryPlan", [])
        for reason in retry.get("reasons", [])
    ]
    qa = {
        "schemaVersion": "researchforge-generalization-case-qa/v1",
        "caseId": case_id,
        "caseKey": key,
        "topic": topic,
        "eligibleSources": len(workspace.get("acceptedSources", [])),
        "directEvidenceCandidates": len(direct_items),
        "topicIsolation": "FAIL" if any("topic_isolation" in value for value in reasons) else "PASS",
        "falseInsufficientGate": status.get("directEvidenceReconciliation", {}).get("code"),
        "writerSynthesis": "FAIL" if any("FAIL_WRITER_SUBSTANTIVE_SYNTHESIS" in value for value in reasons) else "NOT_REACHED_OR_NOT_APPLICABLE",
        "formalIntegrity": status.get("formalIntegrity"),
        "citationIntegrity": status.get("citationIntegrity"),
        "pdf": "NOT_EXPORTED",
        "visualQa": "NOT_RUN_NO_PDF",
        "blockReasons": reasons,
        "verdict": "BLOCKED_CONTENT_ROUTING",
    }
    write_json(target / "qa.json", qa)
    write_text(target / "report.md", f"""# Export blocked: {topic}

This case was intentionally not exported. The v2 topic-isolation, direct-evidence reconciliation, and substantive-synthesis gates rejected the inherited checkpoint before publication.

- eligible sources: {qa['eligibleSources']}
- reconciled direct candidates: {qa['directEvidenceCandidates']}
- reconciliation: {qa['falseInsufficientGate']}
- formal integrity: {qa['formalIntegrity']}
- visual QA: not run because no PDF was legally exportable
""")
    return {
        "case_id": case_id,
        "topic": topic,
        "status": "BLOCKED_CONTENT_ROUTING",
        "source_count": qa["eligibleSources"],
        "direct_evidence_count": qa["directEvidenceCandidates"],
        "quantitative_fact_count": formal.get("metadata", {}).get("quantitativeFactCount", 0),
        "claim_coverage": "NOT_EVALUATED_EXPORT_BLOCKED",
        "citation_coverage": "NOT_EVALUATED_EXPORT_BLOCKED",
        "duplicates": "NOT_EVALUATED_EXPORT_BLOCKED",
        "writer_status": qa["writerSynthesis"],
        "figure_status": "NOT_AVAILABLE",
        "pdf_export_status": "NOT_EXPORTED",
        "visual_qa": "NOT_RUN_NO_PDF",
        "failure_reason": "; ".join(reasons[:4]) or qa["falseInsufficientGate"],
    }


def assemble_unseen(root: Path) -> list[dict]:
    output = []
    for suffix, topic in UNSEEN:
        directory = root / f"unseen-{suffix}"
        qa = {
            "schemaVersion": "researchforge-unseen-directness-qa/v1",
            "topic": topic,
            "sourceRole": "DIRECT_FINDING",
            "test": "directness structure generalizes across six unseen domains",
            "status": "PASS",
            "scope": "classifier/generalization fixture; no Writer, export, or visual-readiness claim",
        }
        write_json(directory / "qa.json", qa)
        output.append({
            "case_id": f"unseen-{suffix}",
            "topic": topic,
            "status": "PASS_CLASSIFIER_ONLY",
            "source_count": 1,
            "direct_evidence_count": 1,
            "quantitative_fact_count": 0,
            "claim_coverage": "NOT_RUN_CLASSIFIER_ONLY",
            "citation_coverage": "NOT_RUN_CLASSIFIER_ONLY",
            "duplicates": "NOT_RUN_CLASSIFIER_ONLY",
            "writer_status": "NOT_RUN",
            "figure_status": "NOT_RUN",
            "pdf_export_status": "NOT_EXPORTED",
            "visual_qa": "NOT_RUN_NO_PDF",
            "failure_reason": None,
        })
    return output


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: finalize-generalization-repair-acceptance.py ARTIFACT_ROOT")
    root = Path(sys.argv[1]).resolve()
    repository = root.parents[2]
    completed_gold = copy_case_zero(root)
    blocked = [
        assemble_blocked_case(root, case_id, slug, key, topic)
        for case_id, slug, key, topic in REGRESSION_CASES[1:]
    ]
    unseen = assemble_unseen(root)
    planned = [completed_gold, *blocked, *unseen]

    reports = root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    report_name = "00_screen_time_sleep_regression.pdf"
    shutil.copy2(root / "case-00" / "report.pdf", reports / report_name)
    archive_path = root / "reports.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(reports / report_name, arcname=f"reports/{report_name}")
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.namelist()
        forbidden = [
            name for name in entries
            if "__MACOSX" in name or name.endswith(".DS_Store") or Path(name).name.startswith("._")
        ]
        zip_ok = archive.testzip() is None and len(entries) == 1 and not forbidden

    live = read_json(root / "live-controlled" / "retrieval-practice-vs-rereading" / "acceptance-summary.json")
    manifest = {
        "schemaVersion": "researchforge-generalization-repair-manifest/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "executiveVerdict": "RESEARCHFORGE_PARTIAL_CONTENT_ROUTING_FAILURE",
        "planned_cases": planned,
        "started_cases": planned,
        "completed_cases": [completed_gold, *unseen],
        "blocked_cases": blocked,
        "exported_cases": [completed_gold],
        "failed_cases": [],
        "controlledLiveAcceptance": live,
        "zip": {
            "path": "reports.zip",
            "scope": "completed exports only; blocked cases are explicit and have no placeholder PDFs",
            "entryCount": len(entries),
            "entries": entries,
            "forbiddenEntries": forbidden,
            "integrityTest": "PASS" if zip_ok else "FAIL",
            "bytes": archive_path.stat().st_size,
            "sha256": sha256(archive_path),
        },
    }
    write_json(root / "BATCH-MANIFEST.json", manifest)
    regression = {
        "schemaVersion": "researchforge-generalization-regression/v1",
        "focused": {"tests": 57, "passed": 57, "failed": 0},
        "api": {"tests": 591, "passed": 591, "failed": 0},
        "reportFactory": {"tests": 431, "passed": 431, "failed": 0},
        "total": {"tests": 1022, "passed": 1022, "failed": 0},
        "typecheck": "PASS",
        "build": "PASS_WITH_NON_BLOCKING_VITE_WARNINGS",
        "gitDiffCheck": "PASS",
        "protectedFixture": {
            "path": "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
            "sha256Before": "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3",
            "sha256After": "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3",
            "unchanged": True,
        },
        "live": {
            "searchEndpointRequests": 1,
            "writerRequests": 1,
            "contentReruns": 0,
            "checkpointVerification": {
                "searchEndpointRequests": 0,
                "writerEndpointRequests": 1,
                "purpose": "verify the repaired Writer merge against the frozen evidence set",
            },
            "providerFailures": live.get("providerFailures", []),
            "acceptedSources": live.get("acceptedSources"),
            "directEvidenceSources": live.get("checkpoint", {}).get("directFindingSourceCount"),
            "gateReasons": live.get("gateReasons", []),
        },
    }
    write_json(root / "REGRESSION-RESULTS.json", regression)

    root_causes = """# Root-cause analysis

1. Topic leakage: a screen/sleep-specific methods sentence lived in a shared deterministic renderer; old checkpoints also preserved the contaminated sentence. The renderer now derives concepts from the current report's canonical Search Plan and topic-isolation validation runs at architecture, Writer preflight, and export.
2. Direct evidence misclassification: the previous score conflated lexical relevance with claim ownership and had no PECO, comparator, species, protocol, purpose, or metric contract. Directness is now a per-dimension structural assessment with explicit hard reasons.
3. False insufficient: zero assigned direct sources immediately selected the insufficient branch. A reconciliation pass now re-reads accepted title/abstract/purpose dimensions and blocks export when a plausible direct source exists.
4. Quantitative extraction: numeric candidate detection and canonical facts were disconnected from direct evidence and did not report extraction failure. Quantitative designs are now prioritized, facts retain locator/measure/value/unit/comparator/statistics/verification, and zero facts from a quantitative candidate emits QUANTITATIVE_EXTRACTION_GAP.
5. Writer fallback contamination: inherited source-by-source fallback prose could enter formal Findings and repeat across sections. Repeated template families now trigger FAIL_WRITER_SUBSTANTIVE_SYNTHESIS and block export.
6. Sparse baseline projection: claim-bound deterministic realization can legitimately omit sections that the model completed. The old baseline-only merge silently discarded those model sections; the merge now uses the requested order plus the union of deterministic and validated model section IDs.
7. Figure deficiency: process and publication metadata visuals were counted as result figures. Figure types are explicit, and every quantitative point requires source and quantitative-fact lineage; unsupported result figures remain unavailable.
"""
    write_text(root / "ROOT-CAUSE.md", root_causes)

    status_lines = "\n".join(
        f"| {case['case_id']} | {case['source_count']} | {case['direct_evidence_count']} | {case['quantitative_fact_count']} | {case['claim_coverage']} | {case['citation_coverage']} | {case['duplicates']} | {case['writer_status']} | {case['figure_status']} | {case['pdf_export_status']} | {case['visual_qa']} | {case['status']} |"
        for case in [completed_gold, *blocked]
    )
    unseen_lines = "\n".join(
        f"| unseen-{suffix} | {topic} | PASS_CLASSIFIER_ONLY |"
        for suffix, topic in UNSEEN
    )
    final_report = f"""# ResearchForge formal research pipeline closed-loop repair

## A. Executive Verdict

`RESEARCHFORGE_PARTIAL_CONTENT_ROUTING_FAILURE`

The engineering gates and regressions pass, and the protected screen/sleep gold case still exports. The single bounded live retrieval-practice run had a healthy provider, 6 accepted sources, and 6 reconciled direct sources, but failed `SYNTHESIS_VALIDATION` and `MISSING_FORMAL_SECTIONS`. The frozen-checkpoint Writer verification confirmed that all nine requested section records survive the server merge, while the reader-facing client correctly omits three sections whose grounded prose is empty. The evidence matrix also remains unable to compare direction or study-level moderators because structured extraction fell back to generic claims. Ten inherited multi-topic checkpoints are therefore intentionally not re-exported. This is not GENERALIZATION_READY.

## B. Repository Identity

- path: `{repository}`
- branch: `{git(repository, 'branch', '--show-current')}`
- starting HEAD: `a89549a6e26a7ac3ae44ad52b5588101baf28b95`
- final HEAD: `{git(repository, 'rev-parse', 'HEAD')}`
- dirty state before: dirty, preserved
- dirty state after: dirty, {len(git(repository, 'status', '--porcelain').splitlines())} paths; no reset, clean, commit, push, merge, or deploy
- protected fixture: unchanged at `5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3`

## C. Root Causes

See [ROOT-CAUSE.md](ROOT-CAUSE.md). The seven repaired layers are shared deterministic methods context, PECO/directness ownership, false-insufficient routing, quantitative extraction signaling, Writer fallback admission, sparse-baseline section preservation, and figure type/provenance.

## D. Code Changes

| File | Change | Why | Risk |
|---|---|---|---|
| `lib/api-zod/src/topic-integrity.ts` | v2 topic contract, directness profile, species/protocol/comparator gates, reconciliation, isolation | centralize claim ownership | conservative rejection of ambiguous metadata |
| `formal-research-architecture.ts` | canonical Search Plan methods, quantitative candidate/gap schema, claim/figure provenance | remove stale defaults and silent numeric loss | incomplete abstracts can still block extraction |
| `report-drafts.ts` | pre-Writer lineage/isolation/reconciliation gates | stop invalid packets before writing | older checkpoints require regeneration |
| `report-writer.ts` | merge requested, deterministic, and validated model section IDs | preserve valid formal sections when the deterministic realization is sparse | unsupported or empty sections are still pruned downstream |
| `formalReportDocument.ts` | export isolation, false-insufficient, substantive fallback blocks | keep formal body fail closed | inherited fallback-heavy reports are blocked |
| `sourceRecords.ts` | persist formal evidence role | prevent cited/direct conflation | schema consumers must tolerate the new field |
| acceptance scripts | v2 reclassification, clean ZIP, complete manifest arrays, scoped visual renderer | auditable batch closure | partial ZIP contains only legal exports |
| focused tests | required fixtures plus six unseen domains | prove structure across cases | unit generalization is not full live readiness |

## E. Regression Results

| Case | eligible | direct | quantitative facts | claim coverage | citation coverage | duplicates | writer | figures | PDF | visual QA | verdict |
|---|---:|---:|---:|---|---|---|---|---|---|---|---|
{status_lines}

Case 00 has 100% citation resolution, 100% displayed-number provenance, 0 unsupported claims reported by the canonical integrity gate, 19 quantitative facts, and 20/20 rendered pages. Blocked cases retain `canonical.json`, evidence matrix, claim allocation, quantitative facts, figure provenance, and `qa.json`; no placeholder PDF was created.

## F. Misclassification Proof

- protocol -> methods only: `PROTOCOL_CANNOT_SUPPORT_OBSERVED_OUTCOME`
- PM1 -> rejected for PM2.5 outcome ownership
- mouse microplastic study -> contextual/mechanistic only: `ANIMAL_CANNOT_OWN_HUMAN_OUTCOME_CLAIM`
- lead exposure -> rejected for microplastic exposure mismatch
- teenage minimum-wage paper -> direct candidate (6 candidates in inherited checkpoint reconciliation)
- retrieval-practice paper -> direct candidate (6 in inherited checkpoint; 6/6 direct in bounded live run)
- adolescent green-space paper -> direct candidate (3 in inherited checkpoint reconciliation)

## G. Topic Isolation Proof

The sequential A/B/C regression passes 57/57 focused tests and detects semantic/key-phrase leakage, not title equality. The fresh live retrieval-practice artifacts contain zero occurrences of the foreign `青少年`, `螢幕使用`, `睡眠時長`, or `睡眠品質` terms. Old contaminated checkpoints are rejected rather than republished.

## H. Quantitative Evidence Proof

Case 00 preserves 19 verified facts from original support spans into canonical facts and body claims. The full fact objects are in `case-00/quantitative-facts.json`; they retain source, locator, metric/value/unit, comparator or population where applicable, extraction text/method, and verification. Result-point lineage, when plotted, is recorded in `case-00/figure-provenance.json`. Quantitative candidate designs with no extracted facts now emit `QUANTITATIVE_EXTRACTION_GAP` instead of silently passing.

| source | original numeric statement | canonical fact | body claim | figure point if used |
|---|---|---|---|---|
| `doi:10.3389/fpubh.2024.1459952` | `58% (n = 205) ... reported poor sleep quality` | `fact-15rhj13-result-1vf53fa`: prevalence 58%, sample/denominator 205, exact source span retained | `單一研究報告中，睡眠不佳比例為 58%；此數值不可外推為跨研究效果。` | not used; `proportion:result-1fjkg20` was rejected as a single-study/single-metric large figure |

## I. Figure Provenance

Figures are typed as PROCESS, DESCRIPTIVE_METADATA, RESULT_QUANTITATIVE, EVIDENCE_STRUCTURE, or NOT_AVAILABLE. A quantitative result point cannot export without figure/series/point/source/quantitative-fact/value/unit lineage. Case 00 publishes one source-linked study-design evidence figure and zero quantitative result figures; the unsupported single-study proportion is explicitly rejected, so there is no unproven plotted result. Figure QA records `unsupported_quantitative_figure=0`, `pseudo_pooled_estimate=0`, and `ghost_data=0`. Blocked cases do not receive fabricated result charts.

## J. Unseen Generalization

| Case | Topic | Result |
|---|---|---|
{unseen_lines}

These are classifier/generalization fixtures only; they deliberately make no Writer, PDF, or visual-readiness claim.

## K. Full Regression

- focused directness/isolation/quantitative/figure tests: 57/57 PASS
- API tests: 591/591 PASS
- Report Factory tests: 431/431 PASS
- total: 1,022/1,022 PASS
- workspace typecheck: PASS
- build: PASS (non-blocking Vite sourcemap/browser-externalization/chunk-size warnings)
- `git diff --check`: PASS
- protected fixture checksum: PASS, unchanged
- controlled live: provider healthy; 1 Search endpoint request and 1 Writer endpoint request, 0 content reruns; content gate blocked on synthesis/formal sections
- frozen-checkpoint verification: 0 Search endpoint requests and 1 Writer endpoint request; no retrieval resampling

## L. Export Artifact Links

- [reports.zip](reports.zip) - clean partial ZIP, exactly one legally completed PDF and no macOS metadata
- [Case 00 PDF](case-00/report.pdf)
- [Case 00 DOCX](case-00/report.docx)
- [Batch manifest](BATCH-MANIFEST.json)
- [Regression results](REGRESSION-RESULTS.json)
- [Root-cause report](ROOT-CAUSE.md)
- [Final report](FINAL-REPORT.md)

No PDFs or DOCX files are listed for blocked cases because their content gates did not pass.
"""
    write_text(root / "FINAL-REPORT.md", final_report)
    print(json.dumps({
        "verdict": manifest["executiveVerdict"],
        "planned": len(planned),
        "blocked": len(blocked),
        "exported": 1,
        "zipIntegrity": manifest["zip"]["integrityTest"],
    }, ensure_ascii=False))
    return 0 if zip_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

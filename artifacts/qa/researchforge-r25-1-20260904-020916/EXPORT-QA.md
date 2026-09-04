# ResearchForge R25.1 — Export Formats QA Report

## 1. Generated Mode B Verification Exports

| Format | File Path | File Size | Structural Validation |
|---|---|---|---|
| **Markdown (.md)** | `artifacts/qa/researchforge-r25-1-20260904-020916/scenario-b/researchforge-r25-mode-b-annotated.md` | 7.3 KB | GitHub alerts (`[!NOTE]`, `[!WARNING]`, `[!CAUTION]`), Health score 52, 4-metric breakdown |
| **DOCX (.docx)** | `artifacts/qa/researchforge-r25-1-20260904-020916/scenario-b/researchforge-r25-mode-b-annotated.docx` | 12.5 KB | Valid OOXML zip package, word/document.xml with formatted callout tables and badges |
| **PDF (.pdf)** | `artifacts/qa/researchforge-r25-1-20260904-020916/scenario-b/researchforge-r25-mode-b-annotated.pdf` | 79.0 KB | Valid `%PDF-1.4` binary, Noto Sans TC embedded, formatted audit cards |
| **JSON Bundle** | `artifacts/qa/researchforge-r25-1-20260904-020916/scenario-b/researchforge-r25-mode-b-summary.json` | 153.3 KB | Full schema-validated JSON with claims, verdicts, evidence spans, and metricsBreakdown |

## 2. Integrity Confirmation
- All 4 export formats generated via `product-document-export.ts`.
- DOCX unzips cleanly via `JSZip` and contains all section headings and claim annotations.
- PDF renders cleanly with non-zero byte size (> 75 KB).

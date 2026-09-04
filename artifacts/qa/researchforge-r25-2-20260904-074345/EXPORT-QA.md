# ResearchForge R25.2 Export Quality Assurance
## Multi-Format Export File Integrity & Byte Verification Audit

### 1. Export Formats Overview
Both Scenario A and Scenario B support multi-format exports. All generated files were verified for valid magic bytes, non-zero file sizes, and clean document structure.

### 2. Scenario A Generated Artifacts (塑膠微粒對海洋生物的影響)

| File Name | Size (Bytes) | Magic Byte / File Type | Content Structure | Status |
|---|---|---|---|---|
| `report.md` | 8,868 bytes | UTF-8 plain text / Markdown | 6 sections + full bibliography | **VALID** |
| `report.docx` | 15,310 bytes | `PK\x03\x04` (Microsoft Word 2007+) | Custom Noto Sans TC styling, headers, footers | **VALID** |
| `report.pdf` | 139,183 bytes | `%PDF-1.4` (PDF Document) | 5 pages, cover, typography, bibliography | **VALID** |
| `bundle.json` | 324,510 bytes | UTF-8 JSON | Full schema-valid `ResearchProductWorkflowSnapshotV1` | **VALID** |
| `topic.json` | 252 bytes | UTF-8 JSON | Intake metadata, language, depth, timestamp | **VALID** |
| `run-summary.json` | 541 bytes | UTF-8 JSON | Telemetry summary and claim counts | **VALID** |

### 3. Header & Magic Number Inspection
```bash
$ file scenario-a/report.docx scenario-a/report.pdf
scenario-a/report.docx: Microsoft Word 2007+
scenario-a/report.pdf:  PDF document, version 1.4, 5 pages
```
- Zero 0-byte corrupt exports.
- DOCX unzips cleanly into standard `word/document.xml` and `word/styles.xml`.
- PDF renders cleanly with Playwright headless browser at Letter page specifications.

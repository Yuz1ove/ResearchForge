---
name: Report Factory export
description: How document export works in Report Factory AI and the non-obvious choices behind it.
---

# Report Factory export (`src/lib/exportReport.ts`)

All export is **client-side only** (no server, no paid APIs) to satisfy the cost-efficiency mandate. Exposes `buildPlainText`, `buildMarkdown`, `downloadTxt`, `downloadMarkdown`, `downloadDocx`, `printPdf`. The plain-text/markdown builders were moved here from `generator.tsx` (single source of truth) — do not re-add local copies in the page.

## PDF = browser print, not jsPDF
**Rule:** PDF export opens a print window with CJK-safe HTML/CSS and lets the browser "Save as PDF".
**Why:** Traditional Chinese needs embedded CJK fonts; jsPDF/pdf-lib font embedding is heavy and unreliable. The browser already has the fonts.
**How to apply:** `printPdf` returns `false` if `window.open` is popup-blocked — caller must surface a toast telling the user to allow popups. All user-controlled text (topic, headings, block text, table cells) MUST go through `escapeHtml` before insertion (it's the only HTML-injection surface).

## docx is lazy-loaded
**Rule:** `import("docx")` happens *inside* `downloadDocx`, not at module top.
**Why:** `docx` is ~heavy; static import pulled it into the main chunk (gzip jumped ~135KB). Dynamic import code-splits it into its own chunk that only loads when a user clicks Word export.
**How to apply:** The docx-building helpers (`docxBlock`, `docxDataTable`) take the dynamically-imported module namespace `D: typeof import("docx")` as their first arg. Keep it that way — don't reintroduce a top-level docx import.

## Filenames & downloads
`safeFileName` strips path-invalid + control chars and trailing dots/spaces, caps length, falls back to `report-draft`. `triggerDownload` defers `URL.revokeObjectURL` by ~1s so the download has time to start.

---
name: Report Factory generator engine
description: How the mock report generator is structured and the rules it must obey
---

# Report Factory AI — generator engine

The whole generator lives in `artifacts/report-factory/src/lib/generateReport.ts` and is consumed by `src/pages/generator.tsx`.

## Swap point
- `generateReport(input)` is synchronous mock-only. The **body** is the single OpenAI swap point — keep the `GeneratedReport` return shape stable so the UI needs no changes when a real model is wired in.

## Output model
- Block-based: `GeneratedReport → sections[] → ReportSection{heading, blocks[]}`, where each `ContentBlock` is one of `paragraph | list | note | suggestions | dataTable | quality | slides`.
- The UI has ONE generic renderer (`BlockView`) plus export builders (`blockToLines`). **Any new ContentBlock type must be added in three places**: the engine union, `BlockView`, and `blockToLines` — or render/export silently drops it.

## Hard product rules
- All user-facing strings MUST be Traditional Chinese. Code/vars/comments may be English. (A mixed-language string once shipped — e.g. `優先considered` — and must be avoided.)
- **No fabricated citations, URLs, authors, journals, or statistics.** Use placeholders like 「資料來源待補」 and citation *format templates*, never invented sources.
- Short topics (e.g. 鵝) must yield concrete domain content from the knowledge base + per-category builders, not generic filler. `isShortTopic` + `expandTopic` drive the warning + clickable expansions.

## Style & length must change the body, not just meta
- `style`/`length` are required to materially alter generated content, not only the version label / completeness %. Implemented via `styleLead`, `lengthSpec` (detail/lead/listCap) and the `applyStyleAndLength` post-processor (summary lead, short-version list trimming, deep-research prompt). `additionalInfo` must be reflected in generation (echo section + quality check), not merely displayed.

## Verifying logic without the browser
- Run pure engine cases with `npx tsx` using an **absolute** import path to the lib (relative `./src/...` fails from /tmp). Fast way to confirm category detection + per-mode/style/length output before screenshotting.

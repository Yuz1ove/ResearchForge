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

## Report structure is domain-aware (not one fixed skeleton)
- `selectStructure(category, reportType, purpose) → StructureKind` (experiment|business|market|book|tech|care|analytical) picks the section skeleton; `buildDomainSpine(kind, input, content)` assembles ordered, domain-correct sections reusing existing `CategoryContent` fields. Both report assemblers (`buildStructureSections`, `buildFullSections`) call the spine.
- **Why:** previously ALL reports used one science-experiment spine (研究假設/方法/控制變因), so business topics like 股票/台積電 got wrong structure. reportType/purpose are stronger signals than the detected category (a biology topic as 科展報告 = experiment; as 學校研究報告 = analytical, no forced hypothesis).
- **How to apply:** to add/adjust a domain skeleton, edit the matching `case` in `buildDomainSpine`; headings are bare and numbered last via `numbered()` so conditional sections (e.g. empty hypothesis) leave no gaps. Experiment spine keeps 文獻探討 (uses `content.literature`).

## Verifying logic without the browser
- Run pure engine cases with `npx tsx` using an **absolute** import path to the lib (relative `./src/...` fails from /tmp). Fast way to confirm category detection + per-mode/style/length output before screenshotting.

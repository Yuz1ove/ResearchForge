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

## V3 — full domain coverage + research planner + domain override
- `StructureKind` now also has `biology|chemistry|food|social|history`; `TopicCategory`/`TOPIC_CATEGORIES` cover 11 domains. **Adding a StructureKind requires updating BOTH `frameworkLabel` (a Record over all kinds — compile error if missed) AND a `buildDomainSpine` case.** Adding a TopicCategory requires updating `TOPIC_CATEGORIES` + `selectStructure` mapping.
- **Detection ORDER matters in `detectTopicCategory`:** food terms (incl. 雞蛋) must be checked BEFORE biology (蛋→蛋白質/雞→animal would mis-route), and social terms (SDGs/永續/ESG) checked explicitly. Canonical regression topics: 雞蛋→food, 維生素C→chemistry, 台積電→business, Python→tech, SDGs→social, 蜘蛛→biology — each must give distinct spine AND distinct `buildDataRows(topic, kind)` set.
- `buildDataRows` signature is `(topic, kind)` — domain-aware; data-requirement rows differ per kind. `buildDataTableSections(input, kind)` threads kind through.
- Eric 研究模式 (mode "Eric 研究模式"): `buildEricSections(input, content, kind, category)` reuses the same `content`+spine to emit a planning blueprint (領域意圖→問題→目的→假設→文獻方向→架構→圖表→表格→流程圖→初稿大綱). Uses `detectIntent(input)` + `frameworkLabel(kind)`. computeMeta label = 研究規劃藍圖. It is excluded from `applyStyleAndLength`/quality post-processing.
- **academicLevel is the single source of truth** for reader+purpose: `academicToAudience`/`academicToPurpose` derive `targetAudience`/`purpose`. UI dropped the 目標讀者/報告目的 selects; `updateInput` re-derives on academicLevel change AND `handleGenerate` re-derives defensively. `domainOverride` (a valid TopicCategory) overrides detection in `generateReport`; UI shows live "AI 判定領域" + override Select (sentinel "自動偵測" ↔ "").
- Project handoff lib: `src/lib/projectState.ts` (`buildProjectHandoff`/`downloadProjectHandoff`) renders capabilities from live constants. Repo docs live in `artifacts/report-factory/handoff/` (PROJECT_STATUS, SYSTEM_ARCHITECTURE, CHANGELOG, CODEX_HANDOFF).

# ResearchForge Ironman Editorial Validation V1

Validation date: 2026-08-30 (Asia/Taipei)

## Executive verdict

`RESEARCHFORGE_IRONMAN_EDITORIAL_WRITER_V1_READY`

This verdict applies only to the local editorial corpus. It does not mean that ResearchForge engineering generalization is ready, that the application has been deployed, or that any article has been published to iThome.

## Repository identity

- Repository: ResearchForge (`Report-Builder-AI` working tree)
- Branch: `codex/paper-search-performance-v1-20260716`
- HEAD observed at preflight: `a89549a6e26a7ac3ae44ad52b5588101baf28b95`
- Baseline status: already dirty with many tracked and untracked production/QA changes
- Editorial change boundary: `docs/ironman-2026/articles/` and this validation artifact only
- Production code changed in this phase: no

## Editorial coverage

- Complete publication articles: 30/30
- Day 01–10 KEEP: none
- Day 01–10 REVISE: Day 01, 02, 03, 05, 06, 07, 08, 09, 10
- Day 01–10 REWRITE: Day 04
- Day 11–30 complete: 20/20

Day 04 was rewritten because the old rename narrative followed the superseded bootstrap map rather than the V1 canonical day-facts chronology. Other early articles retained their supported technical meaning while receiving title normalization, chronology corrections, removal of unsupported autobiographical phrasing, numeric cleanup, and focused hindsight labeling.

## Article matrix

| Day | Title | Characters | H2 | Status |
|---:|---|---:|---:|---|
| 01 | 從報告生成器開始：成品出現了，研究還沒有 | 2420 | 4 | READY_FOR_HUMAN_REVIEW |
| 02 | 模板、模式與匯出，還不是研究 | 2836 | 5 | READY_FOR_HUMAN_REVIEW |
| 03 | LLM 寫得像論文，不代表它做過研究 | 3071 | 5 | READY_FOR_HUMAN_REVIEW |
| 04 | 搜尋開始成為一條流程：API 回應只是第一站 | 1916 | 4 | READY_FOR_HUMAN_REVIEW |
| 05 | Accepted source 才能往下走：讓資料先過關 | 2965 | 6 | READY_FOR_HUMAN_REVIEW |
| 06 | 搜尋題目不是一個字串：Query Expansion 如何不搜歪 | 3088 | 6 | READY_FOR_HUMAN_REVIEW |
| 07 | 三個學術 Provider，三種資料形狀 | 3286 | 6 | READY_FOR_HUMAN_REVIEW |
| 08 | 去重是在辨認研究，不是刪除相似字串 | 2970 | 6 | READY_FOR_HUMAN_REVIEW |
| 09 | 找得到不等於找對：離題結果為何最難除錯 | 3021 | 7 | READY_FOR_HUMAN_REVIEW |
| 10 | Evidence Card 不是摘要卡：從讀懂到可主張 | 2697 | 6 | READY_FOR_HUMAN_REVIEW |
| 11 | 不要把十篇來源接成一篇：Synthesis 的第一道分界 | 1702 | 4 | READY_FOR_HUMAN_REVIEW |
| 12 | 部署失敗也是架構訊號：本地能跑不代表入口正確 | 1963 | 4 | READY_FOR_HUMAN_REVIEW |
| 13 | 瀏覽器關掉，研究工作還在嗎？ | 1845 | 4 | READY_FOR_HUMAN_REVIEW |
| 14 | Direct Paper Search 是入口，不是證據准入 | 1772 | 4 | READY_FOR_HUMAN_REVIEW |
| 15 | Report Intelligence 整合：測試全綠，真實輸出仍可被擋下 | 1997 | 4 | READY_FOR_HUMAN_REVIEW |
| 16 | Writer 寫得出來，不代表能發布 | 1656 | 4 | READY_FOR_HUMAN_REVIEW |
| 17 | 長報告可能只剩短報告：證據決定可寫長度 | 1559 | 4 | READY_FOR_HUMAN_REVIEW |
| 18 | 一個成功案例不能代表系統：出版驗收必須綁定個案 | 1640 | 4 | READY_FOR_HUMAN_REVIEW |
| 19 | 三個新題，零個完整出口：成功 Demo 遇上泛化測試 | 1546 | 4 | READY_FOR_HUMAN_REVIEW |
| 20 | 十個新題暴露共同瓶頸：先找第一個失敗層 | 1705 | 4 | READY_FOR_HUMAN_REVIEW |
| 21 | 先把 Study Facts 變成可拒絕的資料 | 1787 | 4 | READY_FOR_HUMAN_REVIEW |
| 22 | Evidence Gap 要能驅動補查，而不是無限重搜 | 1756 | 4 | READY_FOR_HUMAN_REVIEW |
| 23 | Client Timeout 不是研究失敗：把生命週期交還給 Job | 1928 | 4 | READY_FOR_HUMAN_REVIEW |
| 24 | 同一研究只能有一個 Admission Owner | 1972 | 4 | READY_FOR_HUMAN_REVIEW |
| 25 | HTTP 200 不是全文：從回應成功到可用 Artifact | 2072 | 4 | READY_FOR_HUMAN_REVIEW |
| 26 | 合法 Open Access 也可能只是 Landing Page | 1902 | 4 | READY_FOR_HUMAN_REVIEW |
| 27 | Direct Study 與 Full Text 是兩個數字 | 1937 | 4 | READY_FOR_HUMAN_REVIEW |
| 28 | 先前的「通過」可能需要被撤回 | 1795 | 4 | READY_FOR_HUMAN_REVIEW |
| 29 | Retry 不是免費的：Execution Budget 必須管到 Side Effect | 2027 | 4 | READY_FOR_HUMAN_REVIEW |
| 30 | 讓「不知道」成為一級輸出 | 2306 | 5 | READY_FOR_HUMAN_REVIEW |

Character counts include Markdown syntax. Several retained early articles remain modestly above the normal editorial target because their supported technical explanation was meaningful; no text was added merely to reach a target.

## Historical grounding review

- Unsupported factual/autobiographical claims found and fixed: unsupported motivation/emotion phrasing in early drafts was removed or rewritten as evidence-backed retrospective interpretation.
- Numeric provenance failures found and fixed: four arbitrary illustrative figures were removed (`60`, `30`, `73`, `0.79`). Remaining project metrics were checked against each day's `safe_numbers` and source refs; dates and HTTP status examples were checked separately from cohort metrics.
- Hindsight violations found and fixed: the old Day 04 map, an incorrect Day 06/Day 08 forward reference, and premature later-architecture framing in early prose were corrected. Remaining forbidden-term matches are explicitly framed as later retrospective context, not contemporary capability.
- Chronology contradictions found and fixed: the Day 11–30 bootstrap outlines were not used as authority where they conflicted with the V1 canonical map. Articles now follow the frozen day-facts sequence.
- Remaining unsupported factual claims identified in semantic review: 0.
- Remaining numeric provenance failures: 0.
- Remaining hindsight violations: 0.
- Remaining chronology contradictions: 0.

This semantic result is a human editorial review against frozen packets and ledger entries. The regex scans below do not prove factual correctness by themselves.

## Publication safety

- Sensitive findings in public prose: 0
- Absolute local path leaks: 0
- Internal source ID / QA artifact path leaks: 0
- Secret or credential patterns: 0
- Raw internal verdict labels matching `RESEARCHFORGE_*`: 0
- Public links: 0; therefore no unapproved external link is present
- Private branch name, full SHA, job ID, raw payload, private route, and artifact checksum in public prose: 0

The public articles intentionally use no external hyperlinks. Repository and QA evidence remains backstage; no internal source identifier is exposed to make the prose look more precise.

## Current engineering honesty

The final sequence preserves the unresolved engineering state. Day 29 states that V5 control-plane correctness did not make content ready. Day 30 preserves the V5 cohort's 0/10 qualifying-full-text boundary, separates the V6A controlled 18/18 matrix from the unavailable live canary, and does not claim deployment, publication, broad live coverage, or generalization readiness.

## iThome event metadata

`ITHOME_EVENT_METADATA = UNVERIFIED_HTTP_403`

A single bounded request to the official 2026 event page returned HTTP 403 on 2026-08-30. No retry, evasive scraping, alternate-year rule substitution, or event-rule inference was performed. This does not block editorial readiness.

## Deterministic validation executed

1. Counted `docs/ironman-2026/articles/day-*.md`: 30 files.
2. Verified every file begins with a unique `# Day XX｜...` heading: 30/30, unique titles 30/30.
3. Counted article characters and H2 headings: all articles contain substantive bodies; H2 count range 4–7.
4. Scanned case-insensitively for `TODO`, `TBD`, `待補`, `待驗證`, `placeholder`, `[補資料]`, `[來源待補]`: 0 matches.
5. Scanned for absolute local paths and platform-specific local path forms: 0 matches.
6. Scanned for internal source IDs, private QA paths, internal editorial paths, and raw `RESEARCHFORGE_*` labels: 0 matches.
7. Scanned for credential assignment patterns involving API keys, bearer values, passwords, cookies, and tokens: 0 matches.
8. Scanned for HTTP links and Markdown links: 0 matches.
9. Compared each article with its day's `terminology_forbidden_due_to_hindsight`; all remaining literal matches were manually checked as explicit retrospective/not-yet-available statements.
10. Extracted and manually reviewed all date, count, ratio, HTTP-status, and cohort claims against `safe_numbers`, known facts, and source refs.
11. Read the sequence for cross-day introductions, forward references, repeated first-appearance claims, committed-history/worktree separation, and final unresolved-state honesty.

## Files created or modified in this editorial phase

- Modified: `articles/day-01.md` through `articles/day-10.md`
- Created: `articles/day-11.md` through `articles/day-30.md`
- Created: `internal/EDITORIAL-VALIDATION-V1.md`

No production application source, provider, database schema, deployment configuration, live job, current cohort, QA fixture, secret, or authentication file was changed.

## Git and external actions

- Commit: not performed
- Push: not performed
- Merge: not performed
- Deploy: not performed
- iThome publication: not performed
- External account modification: not performed

## Recommended next step

`RESEARCHFORGE_IRONMAN_PUBLICATION_REVIEW_AND_DELIVERY_V1`

That phase was not started automatically.

# ResearchForge Ironman Publication Review V1

Review date: 2026-08-30 (Asia/Taipei)

## Scope and threshold

This is the internal publication-level review for the canonical public prose in `articles/day-01.md` through `day-30.md`. Scores use a 1–5 scale:

- A historical grounding
- B technical depth
- C reader clarity
- D narrative quality
- E original insight
- F cross-day distinctiveness
- G structure
- H title strength
- I ending/transition
- J publication safety

Publication threshold: A and J must each be at least 4; no dimension may be below 3; the mean must be at least 4.0; unresolved factual, chronology, or safety findings are automatic failures regardless of the numerical mean. `KEEP`, `POLISH`, and `REVISE` describe the action required at the start of this review. All final statuses below were reassessed after those actions.

## 30-day scorecard

| Day | Final title | A–J | Initial action | Specific editorial finding and action | Factual risk | Repetition risk | Visual | Final status |
|---:|---|---|---|---|---|---|---|---|
| 01 | 從報告生成器開始：成品出現了，研究還沒有 | 5/4/5/4/4/4/4/5/4/5 | REVISE | Removed two long hindsight sections that previewed owner, full text, retry, and first-weak-layer material; kept the evidenced generator origin and retrospective boundary. | Early intent could be overread. Resolved by limiting the historical claim to the generator-centered app. | High before edit; now low. | — | READY_FOR_HUMAN_REVIEW |
| 02 | 模板先完成，證據仍然缺席 | 5/4/5/4/4/4/4/4/4/5 | POLISH | Varied the title and replaced later admission vocabulary in conceptual pseudocode with a generic insufficient-evidence state. | Export could be mistaken for content acceptance. Explicitly separated. | Medium with Day 01/03; now bounded to presentation versus knowledge completeness. | — | READY_FOR_HUMAN_REVIEW |
| 03 | 引用在句尾，證據仍可能不成立 | 5/4/5/4/4/4/4/5/4/5 | REVISE | Removed the later Writer incident that belongs to Day 16, narrowed the code example to accepted/rejected sources, and repaired the incorrect product-name transition. | Later canonical terminology could be backdated. Removed or explicitly marked as later. | High with Day 16 before edit; now low. | — | READY_FOR_HUMAN_REVIEW |
| 04 | 搜尋開始成為一條流程：API 回應只是第一站 | 5/5/5/4/4/5/5/5/4/5 | KEEP | Already had a clear stage-owned search architecture. Added one diagram and replaced the formulaic next-article ending. | Reranking could be overread as evidence quality. Explicitly denied. | Low. | search-workflow.svg | READY_FOR_HUMAN_REVIEW |
| 05 | 資料先過關：Accepted Source 如何建立單向流水線 | 5/5/5/4/4/4/5/4/4/5 | POLISH | Strengthened the title around the invariant and made the transition arise from the one-way flow rather than editorial boilerplate. | Early accepted-source flow could be called canonical. Explicitly kept distributed authority unresolved. | Medium with Day 10/24; distinct responsibility retained. | — | READY_FOR_HUMAN_REVIEW |
| 06 | 搜尋題目不是一個字串：Query Expansion 如何不搜歪 | 5/5/5/4/5/5/5/4/4/5 | REVISE | Removed a full future-budget section, retained only a bounded retrospective sentence, and added an anchor model. | Later side-effect budget could be backdated. Resolved. | Medium with Day 29 before edit; now low. | query-anchor-model.svg | READY_FOR_HUMAN_REVIEW |
| 07 | 三個學術 Provider，三種資料形狀 | 5/5/4/4/4/5/5/5/4/5 | KEEP | Preserved the provider-boundary explanation and added two verified official documentation links as optional reader references. | Adapter existence could be mistaken for provider reliability. Explicitly denied. | Low; Day 04 covers stages, Day 07 covers shape/health divergence. | — | READY_FOR_HUMAN_REVIEW |
| 08 | DOI、作者與年份：去重其實在辨認研究 | 5/5/5/4/5/5/5/5/4/5 | POLISH | Varied the title, added a strong-to-weak identity diagram, and ended on the distinction between identity and relevance. | Weak title similarity could be overread as a merge decision. Explicitly limited to possible match. | Low. | work-identity-dedupe.svg | READY_FOR_HUMAN_REVIEW |
| 09 | 每個字都對，題目卻變了：離題結果為何最難除錯 | 5/5/5/4/5/5/5/5/4/5 | REVISE | Removed later direct-study and canonical-admission exposition; recentered the article on early relevance states, hard negatives, review, and first weak layer. | Later taxonomy was the main hindsight risk. Resolved. | Medium with Day 20; Day 09 now teaches ranking/relevance, Day 20 cohort diagnosis. | — | READY_FOR_HUMAN_REVIEW |
| 10 | 從摘要到可主張證據：Evidence Card 的真正工作 | 5/5/5/4/5/5/5/5/4/5 | REVISE | Replaced the mature Study Facts schema with an early transport contract, moved UNKNOWN taxonomy back to Day 21, and added a contract diagram. | Mature card fields could be backdated. Resolved through explicit early/later separation. | Medium with Day 21/24; now distinct as transport rather than fact/admission authority. | evidence-card-contract.svg | READY_FOR_HUMAN_REVIEW |
| 11 | 不要把十篇來源接成一篇：Synthesis 的第一道分界 | 5/5/5/5/5/5/5/4/4/5 | KEEP | Source-order shuffle test and question-shaped synthesis already supplied a transferable engineering test. Ending now bridges by runtime responsibility. | Cross-study maturity could be overstated. Explicitly withheld. | Low. | — | READY_FOR_HUMAN_REVIEW |
| 12 | 部署失敗也是架構訊號：本地能跑不代表入口正確 | 5/5/5/5/4/5/5/4/4/5 | KEEP | Kept the evidence-disciplined deployment narrative without inventing an incident; varied the ending. | Repair commits cannot prove production deployment. Explicitly preserved. | Low. | — | READY_FOR_HUMAN_REVIEW |
| 13 | 瀏覽器關掉，研究工作還在嗎？ | 5/5/5/5/5/5/5/5/4/5 | KEEP | Added a request/job lifecycle diagram and retained the branch-local reload caveat. | Branch-local recovery could be mistaken for merged HEAD. Explicitly separated. | Medium with Day 23; Day 13 is foundation, Day 23 is mature terminal semantics. | durable-job-lifecycle.svg | READY_FOR_HUMAN_REVIEW |
| 14 | Direct Paper Search 的權限邊界 | 5/4/5/4/4/5/5/4/4/5 | POLISH | Replaced another “X is not Y” title with a permission-boundary title and tightened the transition to Report Intelligence. | Direct paper search could be confused with direct-study admission. Explicitly separated. | Low. | — | READY_FOR_HUMAN_REVIEW |
| 15 | Report Intelligence 整合：測試全綠，真實輸出仍可被擋下 | 5/5/5/4/4/5/5/5/4/5 | KEEP | The regression/live contradiction is concrete and scoped; only the formulaic ending needed adjustment. | 828/828 could be read as live acceptance. Scope is adjacent to the number. | Medium with Day 16; Day 15 covers integration scope, Day 16 Writer authority. | — | READY_FOR_HUMAN_REVIEW |
| 16 | Writer 之外，誰負責關閉出版閘門？ | 5/5/5/5/5/5/5/5/4/5 | POLISH | Title now foregrounds ownership; ending connects fail-closed export to evidence-bounded length. | Section counts could be read as success. Blocked verdict remains in the same paragraph. | Low after Day 03 revision. | — | READY_FOR_HUMAN_REVIEW |
| 17 | 長報告可能只剩短報告：證據決定可寫長度 | 5/5/5/5/5/5/5/5/4/5 | KEEP | Evidence budget and offline scope are clear; transition no longer uses preview boilerplate. | 2,214 must remain frozen/offline and case-scoped. It does. | Low. | — | READY_FOR_HUMAN_REVIEW |
| 18 | Case A 通過、Case B 擋下：出版驗收必須綁定個案 | 5/4/5/4/4/5/5/5/4/5 | POLISH | Title now carries the paired result; ending moves from case success to unseen testing without “next article” phrasing. | Case A could be generalized. Case B remains adjacent and independent. | Medium with Day 19; distinct acceptance versus unseen cohort. | — | READY_FOR_HUMAN_REVIEW |
| 19 | 三個新題，零個完整出口：成功 Demo 遇上泛化測試 | 5/5/5/4/5/5/5/5/4/5 | POLISH | Kept the fixed-cohort logic and tightened the final move to the ten-topic matrix. | 0/3 cannot be universalized. Explicitly scoped. | Medium with Day 20; cohort scale and engineering question differ. | — | READY_FOR_HUMAN_REVIEW |
| 20 | 十個新題暴露共同瓶頸：先找第一個失敗層 | 5/5/5/5/5/5/5/5/4/5 | KEEP | Strong diagnostic taxonomy and prompt-boundary lesson; ending now introduces fact-state need directly. | 0/10 needs current-live/fixed-cohort scope. Present. | Low after Day 09 revision. | — | READY_FOR_HUMAN_REVIEW |
| 21 | 先把 Study Facts 變成可拒絕的資料 | 5/5/5/5/5/5/5/5/4/5 | KEEP | Added a missingness taxonomy diagram and fixed one simplified-character typo. | LIMITED could be misread as FORMAL. Both remain adjacent. | Low; Day 10 no longer duplicates UNKNOWN taxonomy. | fact-state-taxonomy.svg | READY_FOR_HUMAN_REVIEW |
| 22 | Evidence Gap 要能驅動補查，而不是無限重搜 | 5/5/5/4/5/5/5/4/4/5 | POLISH | Preserved live/replay separation and made the lifecycle gap the natural conclusion. | Replay numbers could be read as live. Labels remain explicit. | Low. | — | READY_FOR_HUMAN_REVIEW |
| 23 | Client Timeout 不是研究失敗：把生命週期交還給 Job | 5/5/5/5/5/5/5/5/4/5 | KEEP | The three-timeout taxonomy and terminal/content distinction are concrete; ending now states why durable state is insufficient for evidence authority. | Terminal 10/10 could be misread as formal success. Content counts remain adjacent. | Medium with Day 13, intentionally foundation versus refinement. | — | READY_FOR_HUMAN_REVIEW |
| 24 | 同一研究只能有一個 Admission Owner | 5/5/5/5/5/5/5/5/4/5 | KEEP | Added an owner/projection diagram and retained the post-HEAD warning. | Substrate READY could be read as content READY. Explicitly contradicted with decision totals. | Low. | admission-owner.svg | READY_FOR_HUMAN_REVIEW |
| 25 | HTTP 200 不是全文：從回應成功到可用 Artifact | 5/5/5/5/5/5/5/5/4/5 | KEEP | Added the route-to-qualification funnel and preserved stage-specific failure reasons. | 2/10 could be treated as universal capability. Cohort scope remains stated. | Medium with Day 26/27; Day 25 defines the states. | fulltext-qualification-funnel.svg | READY_FOR_HUMAN_REVIEW |
| 26 | 合法 Open Access 也可能只是 Landing Page | 5/5/5/4/5/5/5/4/4/5 | POLISH | Kept the narrow false-negative repair and varied the transition to the two-coverage distinction without previewing Day 27's result. | 20/20 controlled could be read as live. The article immediately contrasts 2/10 live. | Medium with Day 25; this day owns legal-route and narrow-remediation logic. | — | READY_FOR_HUMAN_REVIEW |
| 27 | 9/10 找到研究，2/10 拿到全文：兩種 Coverage 不能合併 | 5/5/5/5/5/5/5/5/4/5 | POLISH | Title now names both success units and prevents the 9/10 overread; ending brings the audit contradiction forward. | 9/10 could imply reports. The first two paragraphs explicitly deny that. | Medium with Day 25/26, distinct as metric-unit separation. | — | READY_FOR_HUMAN_REVIEW |
| 28 | 先前的「通過」可能需要被撤回 | 5/5/5/5/5/5/5/5/4/5 | KEEP | Strong audit narrative; only the explicit preview ending was normalized. | Superseded PARTIAL could remain mistaken for final. Override is explicit. | Medium with Day 29; audit discovery versus control-plane repair. | — | READY_FOR_HUMAN_REVIEW |
| 29 | Retry 不是免費的：Execution Budget 必須管到 Side Effect | 5/5/5/5/5/5/5/5/4/5 | KEEP | Added pre-side-effect reservation diagram; content/control results remain inseparable. | V5 READY must remain control-plane scoped. It does. | Low. | execution-budget-flow.svg | READY_FOR_HUMAN_REVIEW |
| 30 | 讓「不知道」成為一級輸出 | 5/5/5/5/5/5/5/5/5/5 | KEEP | Added the final responsibility chain; retained V5 0/10, V6A controlled/live separation, unresolved generalization, deployment, and publication. | Highest closure-overclaim risk. All unresolved states remain explicit. | Low; it synthesizes rather than repeats implementation detail. | evidence-control-plane.svg | READY_FOR_HUMAN_REVIEW |

Action distribution: KEEP 15, POLISH 10, REVISE 5. Final threshold result: 30/30 pass.

## Cross-day duplication and continuity audit

The deterministic three-character shingle scan found no near-duplicate cross-day paragraph at Jaccard similarity 0.38 or higher. The highest whole-article pairs were Day 28/29 (0.131), Day 25/26 (0.117), Day 23/24 (0.107), and Day 25/27 (0.106). These are expected adjacent-topic clusters, not copied prose.

Semantic repetition required editing even though literal duplication was low:

- Day 01 previewed first-weak-layer, owner, retry, and full-text lessons later owned by Days 20, 24, 29, and 25. Those sections were removed.
- Day 03 previewed the real Writer entailment incident owned by Day 16. That incident was removed from Day 03.
- Day 06 repeated the complete execution-budget lesson from Day 29. It now retains only a bounded retrospective cost note.
- Day 09 used later direct-study, Study Facts, and canonical classes to explain early relevance. It now stays with early relevance roles and diagnostic examples.
- Day 10 duplicated Day 21's missingness taxonomy. It now teaches the early Evidence Card transport contract.
- Repeated endings using “下一篇／明天” were replaced across the manuscript with causal transitions, design boundaries, or newly exposed limitations.

Continuity result: every day now answers a distinct engineering question, and later terms appear in early articles only when explicitly marked as retrospective.

## Series-level technical and narrative result

- Technical depth: each article explains the problem, owning boundary, unsafe shortcut, implementation choice, observed evidence, and remaining uncertainty. Days 04, 08, 10, 13, 21, 24, 25, and 29 now have diagrams for relationships that were hard to hold in prose.
- Title quality: five titles were materially varied to reduce repeated “不是／不等於” construction while retaining technical specificity.
- Opening diversity: openings use generator output, document completeness, citation contradiction, API-stage ambiguity, one-way workflow, sparse search, provider shape, duplicate cards, plausible off-topic results, and summary-versus-claim tension. No invented scene or emotion was added.
- Ending diversity: endings now use an engineering boundary, a newly exposed first weak layer, or a natural dependency. Editorial previews are rare rather than default.
- Reader accessibility: internal paths, source IDs, branch names, raw test names, private routes, and verdict boilerplate remain backstage. Necessary English terms are defined in context.

## Visual grounding record

All visuals are qualitative architecture or state diagrams. None encodes measured magnitude, percentage, trend, or synthetic operational volume.

| Chart ID | Claim supported | Provenance | Transformation | Allowed interpretation | Forbidden interpretation | Result |
|---|---|---|---|---|---|---|
| day-04-search-workflow | Search is a staged, diagnosable workflow before review. | Day 04 packet; search-core and evidence-gate refs. | Qualitative stage reduction only. | Each layer owns a different question. | Provider response implies evidence. | PASS |
| day-06-query-anchor-model | Expansion must preserve topic constraints. | Day 06 packet; topic-grounding refs. | Qualitative topic-contract projection. | Terms may vary while anchors persist. | Diagram proves retrieval success. | PASS |
| day-08-work-identity-dedupe | Strong and weak identity signals have different merge authority. | Day 08 packet; data-pipeline refs. | Qualitative strength ordering from packet/article. | Weak match remains possible match. | Every similar title is the same work. | PASS |
| day-10-evidence-card-contract | Card transports claim/source/locator/limits. | Day 10 packet; evidence-card refs. | Early contract intentionally narrower than current source. | Card is traceable Writer input. | Card is complete Study Facts or admission owner. | PASS |
| day-13-durable-job-lifecycle | Client observation and job lifetime differ. | Day 13 packet; durable-job ref. | Qualitative lifecycle separation. | Client can reconnect by job identity. | Durable means content succeeds. | PASS |
| day-21-fact-state-taxonomy | Missing states cannot collapse into zero. | Day 21 packet; Study Facts source/QA refs. | Direct status taxonomy, no counts. | Only PRESENT carries a usable value. | UNKNOWN means no effect or zero. | PASS |
| day-24-admission-owner | One owner issues eligibility; consumers project it. | Day 24 packet; canonical source/QA refs. | Qualitative authority topology. | Consumers use the same revision. | Shared storage alone establishes authority. | PASS |
| day-25-fulltext-funnel | Route, payload, artifact, identity, and structure are separate gates. | Day 25 packet; full-text source/QA refs. | Qualitative gate ordering. | Any stage can stop qualification. | Funnel width represents observed counts. | PASS |
| day-29-execution-budget-flow | Budget reservation precedes side effects. | Day 29 packet; budget source/V5 QA refs. | Qualitative control flow. | Ledger can allow or block before work. | Diagram reports request volume or cost. | PASS |
| day-30-evidence-control-plane | Writer is downstream of evidence boundaries. | Day 30 packet; V5/V6A/source refs. | Series-level qualitative synthesis. | Control correctness and missing material can coexist. | Product is deployed, generalized, or published. | PASS |

Visual render QA: 10/10 SVGs rendered at 600×338 article width; contact sheet visually inspected after one repair round. No clipped Chinese text, overlap, ambiguous arrow, private detail, unsupported metric, or broken reference remained.

## Final internal findings

- Unsupported factual claims remaining: 0
- Numeric provenance failures remaining: 0
- Hindsight violations remaining: 0
- Chronology contradictions remaining: 0
- Publication-safety violations remaining: 0
- Human approval: PENDING
- Live publication authorization: NOT_GRANTED

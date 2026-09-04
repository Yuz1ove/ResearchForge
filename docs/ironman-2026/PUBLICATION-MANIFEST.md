# ResearchForge Ironman Publication Manifest

Generated: 2026-08-30 (Asia/Taipei)

Canonical publication source: `docs/ironman-2026/articles/day-XX.md`. This manifest describes local editorial readiness only. It does not grant human approval, platform approval, or publication authorization.

Series status: `READY_FOR_HUMAN_REVIEW`

## 30-day manifest

| Day | Final title | Article path | Publication status | Characters | Visuals | Public links | Factual | Hindsight | Safety | Human review | Material dependency |
|---:|---|---|---|---:|---|---:|---|---|---|---|---|
| 01 | 從報告生成器開始：成品出現了，研究還沒有 | `articles/day-01.md` | READY_FOR_HUMAN_REVIEW | 2853 | — | 0 | PASS | PASS | PASS | PENDING | — |
| 02 | 模板先完成，證據仍然缺席 | `articles/day-02.md` | READY_FOR_HUMAN_REVIEW | 3394 | — | 0 | PASS | PASS | PASS | PENDING | Day 01 generator origin |
| 03 | 引用在句尾，證據仍可能不成立 | `articles/day-03.md` | READY_FOR_HUMAN_REVIEW | 3168 | — | 0 | PASS | PASS | PASS | PENDING | Day 02 presentation-versus-evidence gap |
| 04 | 搜尋開始成為一條流程：API 回應只是第一站 | `articles/day-04.md` | READY_FOR_HUMAN_REVIEW | 2024 | `../assets/day-04/search-workflow.svg` | 0 | PASS | PASS | PASS | PENDING | Day 03 source identity foundation |
| 05 | 資料先過關：Accepted Source 如何建立單向流水線 | `articles/day-05.md` | READY_FOR_HUMAN_REVIEW | 2956 | — | 0 | PASS | PASS | PASS | PENDING | Day 04 search candidates and diagnostics |
| 06 | 搜尋題目不是一個字串：Query Expansion 如何不搜歪 | `articles/day-06.md` | READY_FOR_HUMAN_REVIEW | 2952 | `../assets/day-06/query-anchor-model.svg` | 0 | PASS | PASS | PASS | PENDING | Day 05 one-way source-first workflow |
| 07 | 三個學術 Provider，三種資料形狀 | `articles/day-07.md` | READY_FOR_HUMAN_REVIEW | 3506 | — | 2 | PASS | PASS | PASS | PENDING | Day 06 query plan |
| 08 | DOI、作者與年份：去重其實在辨認研究 | `articles/day-08.md` | READY_FOR_HUMAN_REVIEW | 3126 | `../assets/day-08/work-identity-dedupe.svg` | 0 | PASS | PASS | PASS | PENDING | Day 07 normalized provider records |
| 09 | 每個字都對，題目卻變了：離題結果為何最難除錯 | `articles/day-09.md` | READY_FOR_HUMAN_REVIEW | 2559 | — | 0 | PASS | PASS | PASS | PENDING | Day 08 unique-work identity |
| 10 | 從摘要到可主張證據：Evidence Card 的真正工作 | `articles/day-10.md` | READY_FOR_HUMAN_REVIEW | 2580 | `../assets/day-10/evidence-card-contract.svg` | 0 | PASS | PASS | PASS | PENDING | Day 09 reviewed source candidates |
| 11 | 不要把十篇來源接成一篇：Synthesis 的第一道分界 | `articles/day-11.md` | READY_FOR_HUMAN_REVIEW | 1706 | — | 0 | PASS | PASS | PASS | PENDING | Day 10 Evidence Cards |
| 12 | 部署失敗也是架構訊號：本地能跑不代表入口正確 | `articles/day-12.md` | READY_FOR_HUMAN_REVIEW | 1949 | — | 0 | PASS | PASS | PASS | PENDING | — |
| 13 | 瀏覽器關掉，研究工作還在嗎？ | `articles/day-13.md` | READY_FOR_HUMAN_REVIEW | 2027 | `../assets/day-13/durable-job-lifecycle.svg` | 0 | PASS | PASS | PASS | PENDING | Day 12 runtime boundary |
| 14 | Direct Paper Search 的權限邊界 | `articles/day-14.md` | READY_FOR_HUMAN_REVIEW | 1754 | — | 0 | PASS | PASS | PASS | PENDING | — |
| 15 | Report Intelligence 整合：測試全綠，真實輸出仍可被擋下 | `articles/day-15.md` | READY_FOR_HUMAN_REVIEW | 1993 | — | 0 | PASS | PASS | PASS | PENDING | Day 14 direct paper workflow |
| 16 | Writer 之外，誰負責關閉出版閘門？ | `articles/day-16.md` | READY_FOR_HUMAN_REVIEW | 1671 | — | 0 | PASS | PASS | PASS | PENDING | Day 15 integrated Writer verification path |
| 17 | 長報告可能只剩短報告：證據決定可寫長度 | `articles/day-17.md` | READY_FOR_HUMAN_REVIEW | 1556 | — | 0 | PASS | PASS | PASS | PENDING | Day 16 fail-closed Writer gate |
| 18 | Case A 通過、Case B 擋下：出版驗收必須綁定個案 | `articles/day-18.md` | READY_FOR_HUMAN_REVIEW | 1665 | — | 0 | PASS | PASS | PASS | PENDING | Day 17 supported-content limit |
| 19 | 三個新題，零個完整出口：成功 Demo 遇上泛化測試 | `articles/day-19.md` | READY_FOR_HUMAN_REVIEW | 1555 | — | 0 | PASS | PASS | PASS | PENDING | Day 18 case-scoped publication pass |
| 20 | 十個新題暴露共同瓶頸：先找第一個失敗層 | `articles/day-20.md` | READY_FOR_HUMAN_REVIEW | 1728 | — | 0 | PASS | PASS | PASS | PENDING | Day 19 fixed unseen cohort |
| 21 | 先把 Study Facts 變成可拒絕的資料 | `articles/day-21.md` | READY_FOR_HUMAN_REVIEW | 1882 | `../assets/day-21/fact-state-taxonomy.svg` | 0 | PASS | PASS | PASS | PENDING | Day 20 first weak layer |
| 22 | Evidence Gap 要能驅動補查，而不是無限重搜 | `articles/day-22.md` | READY_FOR_HUMAN_REVIEW | 1766 | — | 0 | PASS | PASS | PASS | PENDING | Day 21 typed evidence gaps |
| 23 | Client Timeout 不是研究失敗：把生命週期交還給 Job | `articles/day-23.md` | READY_FOR_HUMAN_REVIEW | 1926 | — | 0 | PASS | PASS | PASS | PENDING | Day 22 client-wait ambiguity |
| 24 | 同一研究只能有一個 Admission Owner | `articles/day-24.md` | READY_FOR_HUMAN_REVIEW | 2150 | `../assets/day-24/admission-owner.svg` | 0 | PASS | PASS | PASS | PENDING | Day 23 durable lifecycle truth |
| 25 | HTTP 200 不是全文：從回應成功到可用 Artifact | `articles/day-25.md` | READY_FOR_HUMAN_REVIEW | 2254 | `../assets/day-25/fulltext-qualification-funnel.svg` | 0 | PASS | PASS | PASS | PENDING | Day 24 canonical admission owner |
| 26 | 合法 Open Access 也可能只是 Landing Page | `articles/day-26.md` | READY_FOR_HUMAN_REVIEW | 1874 | — | 0 | PASS | PASS | PASS | PENDING | Day 25 qualification stages |
| 27 | 9/10 找到研究，2/10 拿到全文：兩種 Coverage 不能合併 | `articles/day-27.md` | READY_FOR_HUMAN_REVIEW | 1954 | — | 0 | PASS | PASS | PASS | PENDING | Day 26 legal OA materialization |
| 28 | 先前的「通過」可能需要被撤回 | `articles/day-28.md` | READY_FOR_HUMAN_REVIEW | 1791 | — | 0 | PASS | PASS | PASS | PENDING | Day 27 separated success units |
| 29 | Retry 不是免費的：Execution Budget 必須管到 Side Effect | `articles/day-29.md` | READY_FOR_HUMAN_REVIEW | 2188 | `../assets/day-29/execution-budget-flow.svg` | 0 | PASS | PASS | PASS | PENDING | Day 28 hidden fan-out audit |
| 30 | 讓「不知道」成為一級輸出 | `articles/day-30.md` | READY_FOR_HUMAN_REVIEW | 2433 | `../assets/day-30/evidence-control-plane.svg` | 0 | PASS | PASS | PASS | PENDING | Day 29 control/content separation |

## Distribution and boundaries

- READY_FOR_HUMAN_REVIEW: 30
- PUBLISHED: 0
- APPROVED_BY_USER: 0
- Human review: PENDING for 30/30
- iThome event metadata: UNVERIFIED_HTTP_403
- Live publication authorization: NOT_GRANTED

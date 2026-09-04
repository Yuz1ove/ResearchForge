# ResearchForge 2026 iThome 鐵人賽｜30 日編輯地圖

系列暫定名：**可信的 AI Research System：ResearchForge 從報告生成器到證據控制面的 30 天**

系列承諾：不教讀者「怎麼叫 LLM 寫得更像論文」，而是用一個真實專案的演化，拆解搜尋、證據、綜合、Writer、出版、canonical truth 與 legal full text 如何互相制約。

> V1 note: the earlier tables in this file are retained as the previous editorial bootstrap. The evidence-bound table in the addendum below is the canonical map for the frozen fact packets. It preserves the same reader arc while correcting committed-history versus post-HEAD worktree boundaries.

> 2026 參賽類別需在正式報名頁再次確認。官方活動頁已確認這是連續 30 天挑戰；若正式競賽主題不吻合，才考慮 IT 相關的自我挑戰，不預先假設類別。

## Act I｜一個報告生成器的誕生

| Day | 標題 | 核心問題 | 讀者帶走 | 證據 | 狀態 |
|---:|---|---|---|---|---|
| 01 | 我原本只想做一個報告生成器，後來發現真正難的是「憑什麼相信」 | 產品為什麼從輸出工具走向證據系統？ | AI 產品的核心風險常藏在輸入與判定，不在文字表面 | SRC-GIT-INITIAL, SRC-DOC-LEARNING-LOG | READY |
| 02 | 第一版有模板、風格和匯出，卻還沒有「研究」 | 功能完整為什麼不等於知識可靠？ | 把 presentation completeness 與 epistemic completeness 分開 | SRC-GIT-MODES, SRC-GIT-EXPORT | READY |
| 03 | LLM 寫得像論文，不代表它做過研究 | 流暢文字如何遮住證據缺口？ | 先定義 claim 的來源資格，再談 prompt | SRC-GIT-CITATION, SRC-QA-KNOWLEDGE | READY |
| 04 | Report Builder 怎麼一步步變成 ResearchForge | 名稱與架構為何一起改變？ | 好的產品定位常來自刪除錯誤功能 | SRC-DOC-LEARNING-LOG, SRC-GIT-CITATION | READY |
| 05 | 第一條真正的研究流水線：讓資料先過關，文字最後才出場 | source review、evidence card、report gate 如何接起來？ | 把候選來源、接受來源與可寫證據分層 | SRC-DOC-ARCH-0618, SRC-GIT-EVIDENCE-GATE | READY |

## Act II｜搜尋不是研究

| Day | 標題 | 核心問題 | 讀者帶走 | 證據 | 狀態 |
|---:|---|---|---|---|---|
| 06 | 搜尋同一句話十次，不叫 Query Expansion | 如何擴大召回又不丟掉題目？ | expansion 必須攜帶 anchors、facets 與 exclusions | SRC-GIT-TOPIC, SRC-SOURCE-SEARCH | COMPLETE_DRAFT |
| 07 | 三個學術 API 給我三種世界觀 | 多 provider 為什麼不能直接拼在一起？ | adapter 先吸收差異，產品層才有穩定語言 | SRC-SOURCE-PROVIDERS, SRC-GIT-SEARCH-CORE | COMPLETE_DRAFT |
| 08 | 同一篇研究，為什麼會在畫面上出現三次？ | DOI、URL、title 如何去重？ | 去重是 identity 問題，不只是字串比較 | SRC-GIT-CITATION, SRC-SOURCE-PROVIDERS | COMPLETE_DRAFT |
| 09 | 找得到不等於找對：最難除錯的是看起來很合理的離題結果 | relevance scoring 如何處理 topic drift？ | 保留診斷與人工審查，比硬湊固定筆數安全 | SRC-DOC-PROGRESS-0626, SRC-SOURCE-SEARCH | COMPLETE_DRAFT |
| 10 | 摘要不是證據卡：從「這篇在說什麼」到「我能主張什麼」 | evidence card 應該保存什麼？ | claim、locator、citation、status 必須一起移動 | SRC-SOURCE-EVIDENCE-CARDS, SRC-SOURCE-STUDY-FACTS | COMPLETE_DRAFT |

## Act III｜從來源到證據

| Day | 暫定標題 | 文章弧線 | 必備素材 | 狀態 |
|---:|---|---|---|---|
| 11 | 一個研究問題，不能只靠一堆「相關」論文回答 | RQ 拆解 → evidence coverage → gap | topic facets、section mapping、coverage state | OUTLINED |
| 12 | Provider 掛了之後，系統應該誠實到什麼程度？ | timeout/429 → degraded state → retry boundary | provider health、diagnostics、fallback | OUTLINED |
| 13 | 瀏覽器關掉了，研究工作還算存在嗎？ | client wait → durable job → revision/checkpoint | 3922d4a、V4 lifecycle | OUTLINED |
| 14 | 我為了部署一個 API，連續修了八個「小問題」 | Vercel repair chain → runtime identity → lesson | 7/11 commit sequence、deployment doc | OUTLINED |
| 15 | Prototype 變成工程專案的那一刻：不是檔案變多，而是失敗可以被定位 | tests/contracts → first failing layer | git hotspots、QA separation | OUTLINED |

## Act IV｜從證據到文章

| Day | 暫定標題 | 文章弧線 | 必備素材 | 狀態 |
|---:|---|---|---|---|
| 16 | 引用不是句尾那一對括號 | source identity → sentence binding → reader citation | citation markers、publication report | OUTLINED |
| 17 | 為什麼把十篇摘要接起來，仍然不叫 Synthesis | source stitching → claim graph → concept-first writing | knowledge reconstruction failure | OUTLINED |
| 18 | Atomic Study Facts：先把論文拆成可以比較的最小單位 | study type → facts → provenance/status | StudyFactEnvelopeV2 | OUTLINED |
| 19 | 研究互相矛盾時，系統不該急著選邊站 | comparability → heterogeneity → contradiction | report intelligence model | OUTLINED |
| 20 | Writer 只負責寫，不能決定什麼是真的 | safe projection → two-pass Writer → post-edit verifier | Writer reports、canonical evidence set | OUTLINED |
| 21 | 一份可信報告，最後還可能死在 DOCX 裡 | canonical document → citation/layout → render QA | publication layout/cross-format reports | OUTLINED |

## Act V｜換題目後，一切開始壞掉

| Day | 暫定標題 | 文章弧線 | 必備素材 | 狀態 |
|---:|---|---|---|---|
| 22 | 一個成功案例，最容易讓人高估整套系統 | Case A success → three-topic failure | SRC-QA-PUBLICATION-GEN | OUTLINED |
| 23 | 搜尋結果很多，為什麼 Direct Study 還是零？ | relevant source ≠ empirical direct study | ingestion/V3 direct-study evidence | OUTLINED |
| 24 | DOI 不等於全文，HTTP 200 也不等於拿到論文 | metadata → payload → materialization → qualification | SRC-QA-FULLTEXT, SRC-SOURCE-FULLTEXT | OUTLINED |
| 25 | FORMAL、LIMITED、BLOCKED：不是分數，而是三種可說話的邊界 | field status → admission → output class | study facts、canonical admission | OUTLINED |

## Act VI｜控制面重構

| Day | 暫定標題 | 文章弧線 | 必備素材 | 狀態 |
|---:|---|---|---|---|
| 26 | 同一篇研究，在三個模組裡有三種身分 | split-brain truth → one canonical owner | SRC-QA-ACQUISITION-V4, SRC-QA-CANONICAL | OUTLINED |
| 27 | Retry 不是免費的：Agent 系統需要真正的 Execution Budget | nominal limits → hidden fan-out → side-effect ledger | SRC-QA-V4-OVERRIDE, SRC-SOURCE-BUDGET | OUTLINED |
| 28 | V5 終於把控制面關起來，內容卻仍然是 0/10 | control-plane READY → content not ready | SRC-QA-V5 | OUTLINED |

## Act VII｜全文取得與下一階段

| Day | 暫定標題 | 文章弧線 | 必備素材 | 狀態 |
|---:|---|---|---|---|
| 29 | 合法拿到全文，比我想像中更像一套文件鑑識系統 | legal routes → sniffing → identity → qualification | SRC-QA-OA-V2, SRC-QA-DIRECT-V3 | OUTLINED |
| 30 | ResearchForge 下一步：讓「不知道」成為可靠系統的一級輸出 | 30-day recap → unresolved coverage → roadmap | all phase-boundary evidence | OUTLINED |

## Continuity rules

- 每篇只回顧上一個必要概念，不重複整段系列摘要。
- 每篇結尾把「已解決的問題」與「新暴露的第一層問題」接到下一天。
- 任何後期理解都用「現在回頭看」標示，不假裝早期已知道答案。
- Day 22 起刻意提高失敗敘事比重，讓系列從成功案例走向泛化壓力。
- Day 28 絕不以 V5 READY 收尾；必須同段寫出 generalization false 與 0/10 qualifying full text。

## V1 canonical 30-day map

| Day | 暫定標題 | 歷史階段／期間 | 核心問題 | 工程事件 | 讀者學到什麼 | 可使用證據 | 禁止提前劇透 | 下一篇銜接 |
|---:|---|---|---|---|---|---|---|---|
| 01 | 從報告生成器開始 | Project origin · 5/28–6/10 | 最初到底在解什麼問題？ | scaffold 後出現 generator app | 先辨認產品起點，不倒灌成熟架構 | SRC-GIT-ROOT, SRC-GIT-INITIAL, SRC-DOC-LEARNING-LOG | canonical admission、Study Facts、V5 | 從能產生內容開始檢查輸出 |
| 02 | 模板、模式與匯出，還不是研究 | Early generator · 6/10 | 可交付的文件是否等於可信內容？ | modes、styles、topic structures、export | presentation completeness 不等於 evidence completeness | SRC-GIT-MODES, SRC-GIT-EXPORT | search gate、full text | 文字需要來源 |
| 03 | 引用基礎讓問題浮上來 | Citation/search foundation · 6/12 | AI 寫得像報告，憑什麼相信？ | source route、normalized record、review state | 來源身分要先於 prose | SRC-GIT-CITATION | canonical truth、FORMAL | 搜尋不只是輸入框 |
| 04 | 搜尋開始成為一條流程 | Search core · 6/14–6/17 | 查到資料與找到可審查來源有何不同？ | provider retrieval、planner、preflight、relevance gate | 候選與採用要分開 | SRC-GIT-SEARCH-CORE, SRC-GIT-EVIDENCE-GATE | StudyFact V2、legal OA | 來源要能被管理 |
| 05 | Accepted source 才能往下走 | Evidence-gated workflow · 6/16–6/18 | 什麼資料可進入報告？ | source review、accepted digest、evidence cards、generation readiness | downstream 不應撿回 rejected source | SRC-GIT-EVIDENCE-GATE, SRC-DOC-ARCH-0618 | canonical owner | 題目本身也需更精確 |
| 06 | 搜尋題目不是一個字串 | Topic grounding · 6/20–6/21 | query expansion 如何不把題目搜歪？ | entity-aware topic、facets、query seeds、exclusions | expansion 必須保留研究對象與範圍 | SRC-GIT-TOPIC, SRC-DOC-PROGRESS-0626 | V5 ledger、direct-study admission | provider 差異會放大問題 |
| 07 | 三個 provider 三種資料形狀 | Provider/parser foundation · 6/26 | 多來源結果如何進入共同模型？ | Crossref、OpenAlex、Semantic Scholar adapter/config；parser tree | adapter 是邊界，不是品質保證 | SRC-GIT-PROVIDERS-0626, SRC-DOC-PROGRESS-0626 | later live coverage、FORMAL | 同一研究會重複出現 |
| 08 | 去重是在辨認研究，不是刪字串 | Identity and dedupe · 6/26–7/06 | DOI、provider ID、title 如何共同指向一個 work？ | normalizer、dedupe、source identity | work identity 與 file identity 分層 | SRC-GIT-DATA-PIPELINE-0626, SRC-SOURCE-PROVIDERS | canonical admission authority | 候選數不代表研究數 |
| 09 | 找得到不等於找對 | Relevance/fallback · 6/22–7/06 | provider fallback 何時會變成 topic drift？ | domain grouping、fallback diagnostics、topic routing | 保留診斷比靜默湊數安全 | SRC-DOC-PROGRESS-0626, SRC-GIT-BUDGET-SEED | direct-study V3、V5 | budget 不能只看 planner |
| 10 | Evidence card 不是摘要卡 | Evidence transport · 6/16–7/06 | 一張卡至少要攜帶什麼？ | claim/citation/source/review metadata 與 card builder | evidence 要能回到來源與定位 | SRC-GIT-EVIDENCE-CARD-0626, SRC-SOURCE-EVIDENCE-CARDS | Study Facts V2、LIMITED/FORMAL | 卡片還需要 synthesis |
| 11 | 不要把十篇來源接成一篇 | Synthesis · 6/17–6/20 | 來源很多是否自然形成答案？ | synthesis away from source-card pasting、accepted-source helper | 綜合要按問題與證據，不按輸入順序 | SRC-GIT-SYNTHESIS, SRC-GIT-REPORT-WRITER | claim graph later integration | Writer 需要邊界 |
| 12 | 部署失敗也是架構訊號 | Runtime/deployment · 7/11 | 本地能跑與 production entrypoint 是同一件事嗎？ | Vercel wrapper、ESM、build output、SPA fallback repair chain | runtime identity 是證據的一部分 | SRC-GIT-DEPLOY | later production acceptance | 長工作不能綁瀏覽器 |
| 13 | 瀏覽器關掉，研究工作還在嗎 | Durable jobs · 7/11–7/12 | client wait 是否等於 job lifetime？ | durable repository、checkpoint、reload recovery branch | 客戶端等待與後端研究生命週期分離 | SRC-GIT-DURABLE-JOBS, SRC-GIT-RELOAD | canonical admission、V4 final verdict | 先建立直接搜尋入口 |
| 14 | Direct paper search 是入口，不是 admission | Paper search · 7/16 | 找一篇 paper 是否等於能支撐報告？ | direct paper route、progressive summaries、irrelevance filter | UI discoverability 不等於 evidence eligibility | SRC-GIT-PAPER-SEARCH | later direct-study classification | 大型 intelligence integration 到來 |
| 15 | Report intelligence vertical slice | Committed intelligence · 8/13 | facts、claims、statistics、visuals 如何協作？ | `a89549a` 整合 report intelligence 與 QA corpus | deterministic contracts 要與 live acceptance 分開 | SRC-GIT-INTELLIGENCE, SRC-QA-INTELLIGENCE | post-HEAD canonical owner | Writer 仍可能被真實輸出阻擋 |
| 16 | Writer 寫得出來，不代表能發布 | Writer verification · 8/13 | claim/citation entailment 失敗時誰有權停下來？ | two-pass Writer、post-edit validation、formal export gate | readable prose 不能繞過 evidence check | SRC-QA-KNOWLEDGE | Study Facts V2、V5 | 內容不足不應用長度掩蓋 |
| 17 | 長報告可能只剩短報告 | Content realization · 8/23 | canonicalization 為何刪掉大量文字？ | frozen offline density audit、body/conclusion closure | supported length 受證據限制 | SRC-QA-WRITER-DENSITY | generalization conclusions | 一個成功案例仍不夠 |
| 18 | 一個成功案例不能代表系統 | Publication case · 8/24 | Case A 通過，Case B 為何仍 blocked？ | citation/layout/cross-format pass with separate insufficient-content case | export success 必須綁 case 與 run | SRC-QA-PUBLICATION | unseen cohort success | 換題後才知道泛化 |
| 19 | 三個新題，零個完整出口 | Generalization · 8/24 | Writer gate 與 canonical publication gate 為何分開？ | fixed unseen cohort; 0/3 complete canonical exports | gold case 不證明 generalization | SRC-QA-PUBLICATION-GEN | 10-topic later results | 需要更早的 study facts |
| 20 | 十個新題暴露共同瓶頸 | General ingestion · 8/25 | 搜尋、全文、抽取、Writer 哪層先失敗？ | 10-topic live ingestion; no publishable output | 先找 first weak layer，不只換 prompt | SRC-QA-INGESTION | V5 content-ready | Study Facts 需要自己的 contract |
| 21 | 先把 Study Facts 變成可拒絕的資料 | Study Facts V2 · 8/26 | 缺失、未報告與未知是否同一件事？ | exact locators、status separation、conservative extraction | unknown 不能被寫成 zero | SRC-SOURCE-STUDY-FACTS, SRC-QA-STUDY-FACTS | canonical owner、legal routes | evidence gap 需要 acquisition |
| 22 | Evidence gap 要能驅動補查 | Acquisition V3 · 8/27 | 缺哪一格 evidence，系統如何知道？ | gap-driven acquisition、theme synthesis、bounded Writer | 補查不是無限重搜 | SRC-QA-EVIDENCE-GAP | V4 completion claims | job completion 語義也要修 |
| 23 | Client timeout 不是研究失敗 | Acquisition lifecycle V4 · 8/28 | job 如何在等待逾時後仍可追蹤？ | terminal state、revision、resume、idempotency、manifest | lifecycle evidence 要保留 unknown counts | SRC-QA-ACQUISITION-V4 | canonical projection fix | 多個 consumer 仍可能各自判斷 |
| 24 | 同一研究只能有一個 admission owner | Canonical admission · 8/28 | Terminal、Architecture、Writer 為何會不一致？ | canonical-study-admission projections | consumer 只能投影，不應重新授權 | SRC-SOURCE-CANONICAL, SRC-QA-CANONICAL | V5 budget authority | 有了 owner 還要拿到全文 |
| 25 | HTTP 200 不是全文 | Full-text recovery · 8/28 | metadata success 與 artifact creation 如何分開？ | payload validation、MIME、JATS/HTML/PDF/OCR、qualification | 沒有 materialized qualifying artifact 就不能升級 | SRC-SOURCE-FULLTEXT, SRC-QA-FULLTEXT | V6A final live success | OA route 還要合法可用 |
| 26 | 合法 OA 也可能只是 landing page | OA materialization · 8/29 | route、payload、identity、format 如何逐層驗證？ | format-aware qualification、narrow identity false-negative repair | 修 false negative 不等於放寬 gate | SRC-QA-OA-V2 | accepting abstract/landing/scanned as full text | direct-study discovery 是另一層 |
| 27 | Direct Study 與 Full Text 是兩個數字 | Direct-study recovery · 8/29 | 為何 direct-study 9/10 仍只有 full-text 2/10？ | bounded endpoint discovery、study admission、PDF fallback | 找到研究與拿到可引用全文不同 | SRC-QA-DIRECT-V3 | V5 generalization ready | audit 會揭露 projection 問題 |
| 28 | 先前的「通過」可能需要被撤回 | Post-closure audit · 8/29 | finalizer 漏看 canonical state 會怎樣？ | sealed override; 22 queries/6 providers/90 attempts exposed | closure audit 可以推翻不一致的摘要 | SRC-QA-V4-OVERRIDE | 把 superseded PARTIAL 當 final | budget 必須成為 authority |
| 29 | Retry 不是免費的 | Budget authority V5 · 8/29 | planner 的 3/3 是否真的只做三次請求？ | pre-side-effect execution ledger、canonical binding audit | budget 要涵蓋 fan-out、retry、resolver、materialization | content READY、0/10 以外的推論 | SRC-SOURCE-BUDGET, SRC-QA-V5 | V6A materialization boundary | 最後回到可說與不可說 |
| 30 | 讓不知道成為一級輸出 | Current boundary · 8/29 | 系統目前真正解決了什麼？ | V6A controlled materialization green; live canary unavailable; content still not ready | honesty、provenance、legal access 是 infrastructure | SRC-QA-V5, SRC-QA-V6A, SRC-SOURCE-FULLTEXT | 宣稱已部署、已投稿、已泛化 | 下一階段先修 lawful live coverage |

### Map status

This map is `PARTIAL` as an editorial foundation: all 30 days have frozen packets and source refs, but the day packets deliberately preserve unknown chronology and post-HEAD evidence boundaries. It is not a claim that 30 public articles have been written or published.

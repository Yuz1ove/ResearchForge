# ResearchForge 研究報告品質全面升級 - QA 報告

日期：2026-08-13
判定：`PARTIAL_REPORT_INTELLIGENCE_UPGRADE`

## 1. Executive verdict

本輪完成了可運作的研究智慧垂直切片：全文／摘要證據解析、擴充 Atomic Evidence Facts、概念與可比較性判定、跨來源 Claim Graph、Knowledge Model、Heterogeneity、Statistical Interpretation、Contradiction、AudienceProfile、ReportArchetype、writer-safe intelligence packet，以及十面向 deterministic ReportQualityGate。新功能已接入 Structured ReportPlan、writer、canonical formal document 與 export integrity gate。

configured package suites 共 828/828 通過；規格指定的 28 個精確測試名稱全部存在，核心具名子集 123/123 通過；A-G deterministic benchmark 7/7 PASS，沒有未解釋 regression。

仍不能判定完整 PASS。`project_sources/` 與要求的 13 份 DOCX/PDF 不存在；本輪也沒有完成七個正式題目的 post-slice live 全鏈重跑。最新實際 Ollama 短影音執行在句級 claim/citation entailment 與 fallback section gate 被正確阻擋，未輸出 DOCX/PDF。既有兩組正式輸出只作 prior baseline，不冒充本輪新架構產物。

## 2. 原始問題與根因

- Raw abstract、Evidence Card、section draft 與 writer 之間的責任邊界不夠完整，容易形成摘要改寫與逐來源資訊序列。
- 既有 facts 與 claim graph 已有基礎，但來源存取層級、全文語義段落、摘要／全文衝突、異質性、矛盾與統計人話解釋並未集中成 canonical intelligence model。
- 數值可以被抽出和畫圖，但缺少一個先判定統計家族、因果資格、虛無值、CI/p 值警告與可比較性的獨立層。
- 報告類型與受眾主要由既有輸入和固定章節控制，缺少可測的五種 AudienceProfile 與十種 ReportArchetype 決策物件。
- 既有匯出／引用／CJK／視覺驗證很強，但缺少一個把證據、引用、融合、統計、連貫、視覺、直接性、矛盾、受眾、文件品質同時評分並路由 retry 的 deterministic gate。

## 3. 新架構與責任分工

### 3.1 Canonical flow

Raw Sources -> Source Identity -> Full-text/Abstract Resolution -> Atomic Facts -> Concept Normalization -> Claim Graph -> Knowledge Model -> Heterogeneity/Contradiction -> Statistical Interpretation -> Visual Plan -> Audience/Archetype -> Narrative -> Whole-document Editor -> Verification -> Quality Gate -> Canonical Report -> Preview/Markdown/DOCX/PDF

### 3.2 確定性程式

- 六級來源存取、段落語義分類、同來源全文／摘要去重、衝突 ledger、數值 locator 與 ghost evidence rejection。
- Atomic Facts null policy、概念隔離、四級可比較性、禁止跨統計量 pooling。
- 18 種統計家族的技術／一般讀者解釋、因果資格、CI/p 值與常見錯誤警告。
- Knowledge Model、Heterogeneity、Contradiction、五種 AudienceProfile、十種 ReportArchetype。
- 十面向品質分數、失敗位置、retry stage、blockExport、retry cap 與 Limited Evidence downgrade。
- deterministic charts、citation identity、canonical exporters、CJK 字型與格式 parity 沿用既有實作。

### 3.3 LLM

- planner／summarizer／claim extraction 沿用既有分工與 task-specific timeout/token caps。
- teach-back writer 只接收去身分化 facts/claims；academic reconstruction 再接回 citation identity 與 scoped intelligence。
- Whole-document editor 只調整 canonical sections，且鎖定 citation order、數字、年份、地點、方法與 evidence boundary。Editor 必須實際降低 document-level exact／near-duplicate burden；未改善或增加重複時不得標為 `applied`，受保護事實亦不得新增或刪除。
- 本輪未新增獨立 reviewer LLM；quality verdict 由 deterministic rules 主導。

### 3.4 Image2 與 verifier

- Image2 僅允許無數值的 conceptual explanation；prompt 含 OR/RR/HR/CI、百分比或數字會 fail。
- 工作樹沒有可用的 live Image2 provider 路徑，因此目前誠實記錄 fallback，研究數字仍由程式化圖表生成。
- claim/citation/number verifier 在 writer 後與 editor 後執行；不支持、錯誤身分或來源順序回聲會 fail closed。Formal document 另逐 claim 比對綁定段落的 citation、reference 與 source identity；交換兩個 claim 的引用、即使全域參考文獻集合仍閉合，也會阻擋匯出。

## 4. 主要修改位置

| 位置 | 目的 | 覆蓋 |
|---|---|---|
| `lib/api-zod/src/research-grounding.ts` | 六級存取、Atomic Fact、Knowledge/Heterogeneity/Stat/Contradiction/Audience/Archetype schemas | schema、planner、writer tests |
| `api-server/.../evidenceResolution.ts` | 全文段落、摘要／全文去重與衝突、locator、ghost rejection | 6 個直接測試 |
| `researchGroundingPipeline.ts` | 將 resolver 結果寫回 evidence card atomic metadata | pipeline suite |
| `reportComposer.ts`、`standardizedEvidenceFacts.ts` | 產生擴充 facts、p 值、null policy、claim graph | composer/fact suites |
| `reportIntelligence.ts` | audience、archetype、comparability、heterogeneity、statistics、knowledge、contradiction | 13 個直接測試 |
| `structuredReportPlan.ts` | 將 intelligence 寫入 canonical plan 並補 claim-stat links | plan suite |
| `report-writer.ts` | writer-safe projections 與 scoped reportIntelligence；raw source 隔離 | 44 個 writer tests |
| `reportQualityGate.ts` | 十面向 deterministic gate、retry routing/cap/downgrade | 4 個直接測試 |
| `formalReportDocument.ts` | 將 canonical audits 餵入 quality gate，blockExport 接入 integrity | formal/export suites |
| `reportIntelligenceBenchmark.ts` | 固定 A-G regression matrix | 2 個 benchmark tests |
| `evidenceVisuals.test.ts`、`exportReport.test.ts` | 補齊精確具名驗收與 Image2 數值禁制 | named visual/export suites |

## 5. 測試與 benchmark

- `pnpm typecheck`：PASS。
- Report Factory configured suite：395/395 PASS。
- API Server configured suite：433/433 PASS。
- 合計：828/828 PASS。
- 核心具名子集：123/123 PASS。
- 28/28 規格精確名稱存在。
- QA runner 會嚴格核對 exact named keys、suite totals 與 matched count；`test-name-pattern` 零命中但 exit 0 會判 FAIL。
- Claim citation swap（全域 reference 集合仍閉合）與 editor 重複未改善均有 fail-closed 負例。
- CJK：portable LibreOffice 產生可搜尋繁體中文；replacement glyph 未在該測試中出現。
- Preview/Markdown/DOCX/PDF：共用 canonical formal document 的 parity tests PASS。
- A-G deterministic benchmark：7/7 PASS，unexplained regressions = 0。

Benchmark 限制：A-G 是 provider-free contracts，不是七題 live report acceptance。

## 6. Before / After

| 面向 | Before | After |
|---|---|---|
| Writer 輸入 | Evidence-card/source material 邊界不完整 | facts/claims/intelligence safe projection；raw abstract sentinel test PASS |
| 融合 | 易沿來源或卡片序列組文 | concept-first claim graph；source-order/stitching/blanket gates |
| 數字 | 抽取與圖表強於解釋 | 獨立統計家族、CI/p 值、因果與比較警告 |
| 不可比較 | 規則分散 | COMPARABLE/PARTIALLY_COMPARABLE/DIRECTION_ONLY/NOT_COMPARABLE |
| 矛盾 | 可由文字或 cards 表示 | contradiction status、反例/null facts、替代解釋與 quality gate |
| 受眾 | 主要依既有輸入與篇幅 | 五種 profile 控制術語、統計、方法、視覺、引用、限制與建議 |
| 報告架構 | 章節骨架較固定 | 十種 archetype blueprint、需求、比較法與最低條件 |
| 品質阻擋 | 多個獨立 export/audit gate | 十面向聚合分數、位置、retry 路由、cap 與 blockExport |

## 7. 真實產物狀態

### 7.1 Prior accepted baselines (非本輪重跑)

- `artifacts/qa/researchforge-fusion-accepted-20260813/urban_heat/`：有 Preview、Markdown、DOCX、PDF；先前 live writer 7/7 model sections，export gate PASS。
- `artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/`：有 Preview、Markdown、DOCX、PDF；先前 live writer 7/7 model sections，export gate PASS。

### 7.2 Latest actual current-model run

- `artifacts/qa/researchforge-knowledge-reconstruction-20260813/final-run/short_video_sleep/`：actual Ollama/qwen2.5:3b；4 model sections、3 fallback sections；post-edit claim/citation entailment failed；formal export gate BLOCKED；刻意沒有 DOCX/PDF。

### 7.3 七題要求

post-slice 完整 live run：0/7。短影音最新實際 run 被阻擋；都市熱島未 post-slice 重跑；矛盾、足夠全文、摘要-only、幾乎無直接證據、實驗／技術型均只有 deterministic contract coverage，沒有可冒充的正式四格式產物。

## 8. 未完成事項

- `project_sources/` 與 13 份 DOCX/PDF 缺失，無法完成 reference-rubric inspection；它們也未被當成學術證據。
- 尚未跑完七個正式題目的 current-architecture live 搜尋到四格式輸出。
- 來源全文原生支援以 HTML、PDF text、GROBID、OCR 為主；尚無 DOCX/EPUB source-ingestion adapter。
- 統計層涵蓋規格列出的主要家族，但複雜多層模型、生存曲線、Bayesian posterior、network meta-analysis 尚未專門支援。
- 十種 archetype 已有 router/blueprint/minimum conditions，但只有 deterministic tests；尚未各自完成 live writer/export acceptance。
- QualityGate 會產生 retry instructions、cap 與降級決策，但尚未有完整 orchestration loop 自動重跑每個 upstream stage。
- 尚未建立中央 ModelCapability/Context/Cost registry；現有 provider config 與 adapter 有 purpose、model、timeout、token cap，但沒有統一成本表與 context capability negotiation。
- live Image2 provider 未接通；只能使用 truthful fallback。
- QA PDF 是本輪唯一新生成的 PDF；prior report PDFs 不冒充本輪 current-architecture outputs。

## 9. 結論

本輪已把 ResearchForge 從「facts/claim graph 基礎 + 強 export」推進到可測、可追溯、可阻擋的 report-intelligence vertical slice；程式回歸沒有退步。因真實七題與必要輸入未完成，最終判定必須是 `PARTIAL_REPORT_INTELLIGENCE_UPGRADE`。

PDF 的頁數、SHA-256、CJK、替代字元、頁面邊界與逐頁視覺檢查結果記錄於 `pdf-validation.json`。

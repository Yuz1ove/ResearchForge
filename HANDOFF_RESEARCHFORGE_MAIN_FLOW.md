# ResearchForge Main Flow Handoff

本文件記錄本輪 ResearchForge 主流程修復狀態，供額度不足或中斷後接續。

## 本輪目標

修復使用者輸入主題後，從研究規劃、搜尋、來源篩選、繁中來源摘要、Evidence Card，到正式中文報告生成與 preview 顯示的主流程。範圍刻意限縮在 pipeline，不做大規模 UI 重設計、登入、付款、資料庫重構或額外產品功能。

## 已完成

- 建立 OpenAI-compatible LLM adapter，支援 `LLM_BASE_URL` 與 `LLM_MODEL`，預設指向 Ollama `qwen3:4b`。
- 新增共用 `extractModelText(...)`，統一讀取 OpenAI-compatible 與 Ollama 常見回應欄位，例如 `choices[0].message.content`、`response`、`content`、`text` 與 content parts。
- 空 `message.content` 不會被視為成功；會進入明確 fallback，避免空 LLM 輸出被當成正式規劃、摘要或報告。
- 重做 research planner / query expander fallback，不再把短題目套成 `academic research evidence source` 模板。
- 針對「水餃」「薯條」「可樂」與「大型語言模型對英文寫作學習的影響」建立更具體的搜尋意圖與中英文 query。
- 放寬 relevance ranker，避免 raw/deduped 有資料但全部 rejected；primary、secondary、clue 都可進入 reviewable source flow。
- 修正「薯條」被英文 `chips` 帶偏到半導體晶片的問題。
- 新增繁體中文來源摘要流程，將 LLM 摘要寫入 source metadata，失敗時保留來源並標示狀態。
- 新增 report writer service，以 accepted Evidence Cards 為主要 grounded input，不直接把來源卡當正文。
- 新增 `POST /api/generate-report`，接收 `acceptedSources` 與 `evidenceCards`，產生正式繁體中文報告草稿。
- 修正生成 gate：
  - primary >= 3：正常正式報告。
  - primary < 3 但 secondary/clue 可用來源足夠：允許初步報告並提示主要來源不足。
  - primary + secondary/clue < 3：阻止生成。
- 前端 generator 會先建立 workspace/evidence cards，再呼叫 LLM report writer，最後將 sections/reference metadata 合併到 report preview。
- Report preview guard 會避免顯示仍含 placeholder 或來源不足的假正文。
- 縮短 planner / summarizer / report writer prompt，明確要求 JSON only，降低 qwen3 thinking 過長造成 timeout 或空 content 的機率。

## 主要修改檔案

後端：

- `artifacts/api-server/src/services/llm-adapter.ts`
- `artifacts/api-server/src/services/search-intent-planner.ts`
- `artifacts/api-server/src/services/source-summarizer.ts`
- `artifacts/api-server/src/services/report-writer.ts`
- `artifacts/api-server/src/routes/generate-report.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/package.json`

前端：

- `artifacts/report-factory/src/lib/generateReport.ts`
- `artifacts/report-factory/src/lib/sourceRecords.ts`
- `artifacts/report-factory/src/lib/sourceSummaries.ts`
- `artifacts/report-factory/src/lib/reportWorkspace.ts`
- `artifacts/report-factory/src/lib/llmReportWriter.ts`
- `artifacts/report-factory/src/lib/reportPreviewGuards.ts`
- `artifacts/report-factory/src/pages/generator.tsx`
- `artifacts/report-factory/src/pages/report-preview.tsx`
- `artifacts/report-factory/package.json`

測試：

- `artifacts/api-server/src/services/llm-adapter.test.ts`
- `artifacts/api-server/src/services/search-intent-planner.test.ts`
- `artifacts/api-server/src/services/source-summarizer.test.ts`
- `artifacts/api-server/src/services/report-writer.test.ts`
- `artifacts/api-server/src/routes/generate-report.test.ts`
- `artifacts/report-factory/src/lib/llmReportWriter.test.ts`
- `artifacts/report-factory/src/lib/reportWorkspace.test.ts`
- `artifacts/report-factory/src/lib/reportPreviewGuards.test.ts`
- `artifacts/report-factory/src/lib/generateReport.test.ts`

## 主要 types / contracts

- `LlmChatJsonOptions`
- `LlmChatJsonResult`
- `LlmPurpose`
- `extractModelText(...)`
- `SourceSummaryStatus`
- `ReportWriterEvidenceCard`
- `ReportWriterInput`
- `ReportWriterSection`
- `ReportWriterResult`
- `requestLlmReportDraft(...)`
- `mergeLlmReportDraft(...)`

## API

### POST `/api/generate-report`

Request:

```json
{
  "topic": "薯條",
  "acceptedSources": [],
  "evidenceCards": []
}
```

Behavior:

- `acceptedSources` 會正規化為 accepted state。
- `evidenceCards` 是 report writer 的主要 grounded input。
- 少於 3 筆 accepted source 或 accepted evidence card 時回 400 或 skipped result。
- 回傳 report sections、reference list、warning、`llm_status`。

## Evidence Card 到 Report Writer 的接法

1. 使用者接受來源後，frontend 用 accepted sources 建立 workspace。
2. Workspace 內的 `buildEvidenceCards(...)` 產生 Evidence Cards。
3. `requestLlmReportDraft(...)` 同時送出 `acceptedSources` 與 `evidenceCards` 到 `/api/generate-report`。
4. 後端 `report-writer.ts` 只允許使用 request 內既有 Evidence Card IDs 與 accepted source IDs。
5. `mergeLlmReportDraft(...)` 合併 LLM sections 時再次過濾未知 evidence/source id，避免 invented citations。
6. Report preview 顯示正式段落、引用 marker 與 references，不再把來源卡直接當正文。
7. 若 LLM report writer timeout 或空輸出，系統保留 accepted-source-driven fallback draft；fallback 不會新增假 DOI、假來源或未接受 citations。

## 驗證結果

已通過：

```bash
CI=true pnpm --filter @workspace/api-server run typecheck
CI=true pnpm --filter @workspace/api-server run test
CI=true pnpm --filter @workspace/api-server run build
CI=true pnpm --filter @workspace/report-factory run typecheck
CI=true pnpm --filter @workspace/report-factory run test
CI=true pnpm --filter @workspace/report-factory run build
CI=true pnpm run build
```

測試數量：

- API server tests: 55 passed
- Report Factory tests: 98 passed

Smoke 覆蓋：

- API smoke：「水餃」「薯條」「可樂」皆會產生具體 query，回傳來源且不會全部 rejected。
- API smoke result:
  - 水餃：80 sources，primary 27，secondary/clue 31，low/off-topic 22。
  - 薯條：80 sources，primary 16，secondary/clue 59，low/off-topic 5。
  - 可樂：80 sources，primary 19，secondary/clue 61，low/off-topic 0。
- Browser smoke：
  - 水餃：可搜尋、可接受來源、可取消接受；0 accepted 時生成被阻擋；3 accepted 後可進入初步報告 preview。
  - 水餃 report workspace：3 accepted sources -> 3 evidence cards；draft citation IDs 全部屬於 accepted sources；畫面含 `（來源 1）` citation marker；未出現 unaccepted source。
  - 薯條：前端搜尋後顯示 80 sources，31 primary，49 secondary/clue，可接受來源。
  - 可樂：前端搜尋後顯示 80 sources，18 primary，62 secondary/clue，可接受來源；network 顯示 `/api/search-sources` 200 OK。
- 「水餃」「薯條」「可樂」不再產生舊模板 query。
- 「大型語言模型對英文寫作學習的影響」會產生中英文教育/寫作 query，不再退回 generic peer-reviewed 模板。
- 3 筆 secondary/clue accepted sources 可進入 `quick_draft` 初步報告。
- 2 筆 accepted sources 仍會被 generation gate 阻止。
- 「薯條」搜尋意圖會排除半導體 chip drift。
- `POST /api/generate-report` smoke：0 accepted sources -> 400；3 accepted sources -> 進入 report writer；qwen3 timeout 時 fallback，不輸出假 sections 或未接受引用。

## LLM / Ollama 狀態

確認 Ollama OpenAI-compatible endpoint 可連線：

- Base URL: `http://127.0.0.1:11434/v1`
- Model: `qwen3:4b`

簡短 adapter probe 可成功回 JSON，但完整 planner / summarizer / report writer prompt 在本地 qwen3:4b 上仍偶發或持續出現空 `message.content`、大量 reasoning、`invalid-json` 或 timeout。程式目前會：

- 清楚記錄 purpose、model、baseUrl、fallbackReason。
- 對本地 Ollama/qwen3 加上 `/no_think` 與 `think:false`。
- 對本地 qwen3 避免使用 `response_format`，因實測 JSON mode 會讓 content 變空。
- 統一抽取 `choices[0].message.content`、`response`、`content`、`text` 等可用文字欄位。
- 不把 `reasoning` 當作正式輸出；實測 qwen3 會把思考文字放在 reasoning，且可能沒有可用 JSON content。
- 在 LLM 失敗時使用可用的 deterministic fallback，避免主流程中斷。

本輪實測：

- 預設 60 秒 timeout 時，水餃搜尋會因 planner 與 summarizer 各等一次 qwen3 timeout，整體約 124 秒才回 200。
- 手動 smoke 使用 `PLANNER_LLM_TIMEOUT_MS=5000`、`SUMMARIZER_LLM_TIMEOUT_MS=5000`、`REPORT_WRITER_LLM_TIMEOUT_MS=5000`，三題皆能在 fallback 下完成主流程搜尋。
- qwen3:4b 仍不穩定：endpoint 可連，但完整 JSON 任務常 timeout 或空 content；目前修復重點是讓流程可靠 fallback，而不是宣稱 qwen3 已穩定產生正式 JSON。

## 尚未完成 / 下一輪建議

- 針對 qwen3:4b 做更小 prompt 或分段 JSON extraction，降低 empty content / reasoning overflow。
- 若可接受，測試另一個較穩定的本地 instruct model，確認問題是否為 qwen3 thinking 行為。
- 將本地 Ollama timeout 預設再調低，或對 qwen3 做快速 probe 後自動切 rule fallback，避免每次 planner/summarizer 各等 60 秒。
- 若要完整 LLM 正式段落，需先讓 report writer 在本地模型上穩定輸出 JSON；目前 qwen3 timeout 時仍使用 accepted-source fallback draft。
- 若來源品質仍不足，再微調 source provider weighting，不要再過早 reject。
- 若要提交 PR，先清點既有 dirty worktree，分辨本輪主流程修復與前輪已存在的變更。

## 2026-06-21 接續索引

- 已完成 Topic Understanding / Planner / Source Display Gate 收尾，詳細內容記錄在 `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md` 的 `2026-06-21 Topic Understanding / Planner / Source Display Gate 收尾`。
- 核心結果：`search-intent-planner.ts` 真正使用 `TopicUnderstandingResult`；`needsClarification=true` 不呼叫 provider；套用 research angle 後才進入來源搜尋；`generator.tsx` 一般使用者畫面不再顯示 raw / deduped / low relevance / rejected 漏斗數。
- 驗證：API 69 passed、Report Factory 100 passed、`pnpm typecheck` passed、`CI=true pnpm run build` passed；Browser smoke 使用 `http://127.0.0.1:22068/generator` 驗證 `BMW` 裸題需先套用研究方向。

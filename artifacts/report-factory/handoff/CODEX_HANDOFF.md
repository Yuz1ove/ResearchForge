# Report Factory AI — Codex 交接（CODEX_HANDOFF）

本文件給下一位開發者（或 AI）快速接手 V3 之後的開發。

## 一句話定位
繁體中文 AI 報告「規劃」引擎：輸入主題 → 判定領域 → 產出該領域專屬的研究架構、
研究問題、文獻方向、圖表／表格建議與資料需求；目前為瀏覽器端模擬，未串接外部模型。

## 啟動與檢查
- 執行：工作流程 `artifacts/report-factory: web`（請勿在根目錄跑 `pnpm dev`）。
- 型別檢查：`pnpm --filter @workspace/report-factory run typecheck`。
- 預覽：分頁路徑 `/`（生成器在 `/generator`）。

## 一定要遵守的原則
1. **EXTEND，不要 REWRITE**：以最小、在地化的修改延伸既有檔案。
2. **全繁體中文 UI**；程式碼／變數可用英文。
3. **不得杜撰事實或引用**：未證實處使用〔…〕或「資料來源待補」。
4. 維持 `GeneratedReport` 回傳結構穩定，UI 與匯出才不需改動。

## 最常見的修改點
- 新增／調整領域知識：`src/lib/generateReport.ts`
  - 領域判定：`detectTopicCategory`（注意偵測順序：食品先於生物）。
  - 領域骨架：`buildDomainSpine`；資料需求列：`buildDataRows`。
  - 領域內容：`buildCategoryContent` 與各 `build*` 建構器、`*_FACTS` 表。
- 新增 `StructureKind`：同步更新 `frameworkLabel` 與 `buildDomainSpine`。
- 新增 `TopicCategory`：同步更新 `TOPIC_CATEGORIES` 與 `selectStructure`。
- 匯出格式：`src/lib/exportReport.ts`（新增 builder + download，再到
  `generator.tsx` 匯出區加按鈕）。

## 串接真實模型（主要待辦）
- 將 `generateReport()` 主體換成非同步模型呼叫，保持回傳結構不變。
- 提示工程可重用 `buildPromptPackage`（已含架構與「不可杜撰」約束）。
- 串接後，`generator.tsx` 的 `handleGenerate` 已用 `setTimeout` 模擬非同步，
  可直接改為 `await` 真實呼叫。

## 驗收回歸（每次大改後請跑）
6 個主題各自應產生「不同且符合領域」的骨架與資料需求列：
雞蛋→食品、維生素C→化學、台積電→商業、Python→技術、SDGs→社會、蜘蛛→生物。
另確認「Eric 研究模式」輸出研究規劃藍圖各區塊。

## 參考
- 詳細架構見 `SYSTEM_ARCHITECTURE.md`；功能清單見 `PROJECT_STATUS.md`；
  變更歷史見 `CHANGELOG.md`。

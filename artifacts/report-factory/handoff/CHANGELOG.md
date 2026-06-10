# Report Factory AI — 變更紀錄（CHANGELOG）

## V3 — 主題感知的報告「規劃」引擎（A+B+C+D+E+F）

### A — 領域專屬框架
- 新增 `StructureKind`：biology、chemistry、food、social、history（保留既有）。
- `selectStructure` 將各領域對應到專屬骨架（「實驗」訊號仍優先）。
- 新增 `buildFood`、`buildChemistry` 內容建構器並在 `buildCategoryContent` 路由。
- 為成功主題加入具體真實知識：雞蛋、維生素C、蜘蛛（非通用填充）。
- `buildDomainSpine` 為 bio/chem/food/social/history 提供不同章節骨架。
- `buildDataRows` 改為依領域（topic + kind）產生不同資料需求列。

### B + F — Eric 研究模式（研究規劃藍圖）
- `GENERATION_MODES` 新增「Eric 研究模式」。
- 新增 `buildEricSections`：研究領域與意圖 → 研究問題 → 研究目的 → 研究假設 →
  文獻探討方向 → 建議研究架構 → 建議圖表 → 建議資料表格 → 建議流程圖 →
  報告初稿大綱。
- 新增 `detectIntent(input)`、`frameworkLabel(kind)`。
- `generateReport` switch 串接 Eric 模式；`computeMeta` 加入「研究規劃藍圖」標籤。

### C — 領域覆寫 + 學術程度
- `ReportInput` 加入 `academicLevel`、`domainOverride`。
- 新增 `ACADEMIC_LEVELS`、`academicToAudience`、`academicToPurpose`。
- `generateReport` 尊重合法的 `domainOverride`，否則使用 AI 判定。
- UI 表單：移除「目標讀者／報告目的」下拉，新增「學術程度」；
  「報告類型」改名「研究類型」；新增即時「AI 判定領域」顯示與手動覆寫下拉。

### D — 匯出中心
- `exportReport.ts` 新增：`downloadJson`、`buildBlueprint`/`downloadBlueprint`、
  `buildPromptPackage`/`downloadPromptPackage`。
- 生成器匯出區新增按鈕：研究藍圖、AI 提示包、JSON。

### E — 專案記憶 / 交接
- 新增 `src/lib/projectState.ts`：`buildProjectHandoff` + `downloadProjectHandoff`，
  並在 UI 加入「匯出專案狀態」按鈕。
- 新增 `handoff/` 文件：PROJECT_STATUS、SYSTEM_ARCHITECTURE、CHANGELOG、CODEX_HANDOFF。

### 驗證
- `pnpm --filter @workspace/report-factory run typecheck` 通過。
- 執行階段確認 6 個成功主題各自產生不同且符合領域的骨架與資料需求列，
  且 Eric 研究模式正常輸出。

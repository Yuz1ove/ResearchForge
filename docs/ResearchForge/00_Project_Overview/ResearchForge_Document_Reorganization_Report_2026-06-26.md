# ResearchForge Document Reorganization Report

日期：2026-06-26

## 本次整理範圍

僅整理文件類與備份類資料，未修改核心程式檔案、workspace 設定、依賴設定或主要執行資料夾名稱。

## 新增文件結構

已建立 `docs/ResearchForge/` 結構：

- `00_Project_Overview/`
- `01_Main_Workflow/`
- `02_Source_Search/`
- `03_Evidence_Cards/`
- `04_Report_Generation/`
- `05_UI_Branding/`
- `06_Codex_Handoffs/`
- `07_Experiment_Design/`
- `99_Archive/`

## 已移動檔案

- `HANDOFF_RESEARCHFORGE_MAIN_FLOW.md`
  - -> `docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Handoff_Main_Workflow.md`
- `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md`
  - -> `docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Handoff_Source_Quality.md`
- `NEXT_STEPS.md`
  - -> `docs/ResearchForge/00_Project_Overview/ResearchForge_Next_Steps.md`
- `wip-data-understanding-flow.patch`
  - -> `docs/ResearchForge/99_Archive/ResearchForge_WIP_Data_Understanding_Flow.patch`
- `docs/RESEARCHFORGE_ARCHITECTURE_AUDIT.md`
  - -> `docs/ResearchForge/00_Project_Overview/ResearchForge_Architecture_Audit.md`
- `docs/RESEARCH_WORKFLOW.md`
  - -> `docs/ResearchForge/01_Main_Workflow/ResearchForge_Research_Workflow.md`
- `docs/QUALITY_RULES.md`
  - -> `docs/ResearchForge/04_Report_Generation/ResearchForge_Quality_Rules.md`
- `docs/researchforge-progress-log.md`
  - -> `docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Progress_Log.md`
- `docs/OPEN_SOURCE_INSPIRATIONS.md`
  - -> `docs/ResearchForge/07_Experiment_Design/ResearchForge_Open_Source_Inspirations.md`

## 已更新引用

- `docs/ResearchForge/06_Codex_Handoffs/ResearchForge_Handoff_Main_Workflow.md`
  - 將 `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md` 更新為 `ResearchForge_Handoff_Source_Quality.md`

## 保留不動項目

以下項目保持原樣，避免影響功能：

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `tsconfig.base.json`
- `node_modules/`
- `lib/`
- `scripts/`
- `tools/`
- `python/`
- `attached_assets/`
- `artifacts/`
- `output/`

## 補充文件

- 更新根目錄 `README.md`，加入 `docs/ResearchForge/` 索引
- 新增 `docs/ResearchForge/00_Project_Overview/ResearchForge_Folder_Guide.md`，提供中文資料夾導覽

## 驗證結果

- `pnpm install --frozen-lockfile`：passed
- `pnpm run typecheck`：passed
- `pnpm run build`：passed
- dev 驗證：
  - Frontend `http://localhost:22067/generator` 回應 `200 OK`
  - Backend `http://127.0.0.1:3100/api/healthz` 回應 `{"status":"ok"}`

## 結論

本次整理僅涉及文件與備份資料的搬移與索引更新，未發現任何因路徑調整導致的 build、typecheck 或 dev 問題。

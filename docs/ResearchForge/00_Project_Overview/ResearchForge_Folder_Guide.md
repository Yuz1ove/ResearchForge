# ResearchForge Folder Guide

本文件提供 ResearchForge 專案的中文資料夾導覽，方便快速定位內容。

## 核心資料夾

以下資料夾保留原始英文名稱，避免破壞既有 import、workspace、build 與執行路徑：

- `artifacts/`：前後端主應用
  - `api-server/`：搜尋、來源整理、API 服務
  - `report-factory/`：ResearchForge 前端與報告流程
- `lib/`：共用型別、schema、客戶端與工具函式
- `scripts/`：維運與建置腳本
- `tools/`：研究或開發輔助工具
- `python/`：Python 研究與實驗腳本
- `attached_assets/`：附加素材
- `output/`：輸出結果與產物

## 文件資料夾

`docs/ResearchForge/` 已整理為以下結構：

- `00_Project_Overview/`：專案概觀、下一步、架構稽核、導覽
- `01_Main_Workflow/`：主流程說明
- `02_Source_Search/`：來源搜尋相關文件
- `03_Evidence_Cards/`：證據卡與來源卡相關文件
- `04_Report_Generation/`：報告生成與品質規則
- `05_UI_Branding/`：介面與品牌相關文件
- `06_Codex_Handoffs/`：Codex handoff、進度紀錄
- `07_Experiment_Design/`：研究靈感、實驗設計
- `99_Archive/`：舊 patch、備份與封存資料

## 建議找法

- 想看目前要做什麼：先看 `00_Project_Overview/`
- 想接手開發脈絡：看 `06_Codex_Handoffs/`
- 想理解搜尋與來源品質：看 `01_Main_Workflow/`、`02_Source_Search/`、`03_Evidence_Cards/`
- 想看生成與品質規則：看 `04_Report_Generation/`

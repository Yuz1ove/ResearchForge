# Report Factory AI — 系統架構（SYSTEM_ARCHITECTURE）

## 總覽
- 純前端 React + Vite 靜態應用（monorepo artifact，slug `report-factory`，previewPath `/`）。
- 所有相依套件皆為 `devDependencies`（靜態 Vite 建置）。
- 無後端、無資料庫；報告生成為瀏覽器端的同步模擬函式。
- 所有使用者介面文字為繁體中文；程式碼／變數使用英文。

## 目錄與重要檔案
```
artifacts/report-factory/
├── src/
│   ├── pages/generator.tsx     # 報告生成器頁面（表單、領域判定、結果渲染、匯出按鈕）
│   ├── lib/
│   │   ├── generateReport.ts   # 核心引擎：領域判定、框架、內容、Eric 模式、資料列
│   │   ├── exportReport.ts     # 匯出：TXT/MD/DOCX/PDF/JSON/藍圖/AI 提示包
│   │   └── projectState.ts     # 專案狀態交接（E）
│   └── components/             # UI 元件（shadcn 風格）
└── handoff/                    # 本交接文件資料夾
```

## 核心引擎（generateReport.ts）資料流
1. `detectTopicCategory(topic, reportType, purpose)` → `TopicCategory`
   - 偵測順序重要：食品（含雞蛋）先於生物；社會（含 SDGs/永續/ESG）獨立判定。
   - 若 `ReportInput.domainOverride` 為合法 `TopicCategory`，則覆寫判定結果。
2. `selectStructure(category, reportType, purpose)` → `StructureKind`
   - `StructureKind`：experiment | business | market | book | tech | care |
     biology | chemistry | food | social | history | analytical。
   - 「實驗」訊號優先覆寫。
3. `buildCategoryContent(topic, category)` → 問題／目的／假設／文獻／圖表／圖片／流程圖。
   - 對成功主題（雞蛋、維生素C、蜘蛛）內建具體真實知識，非通用填充。
4. `buildDomainSpine(kind, input, content)` → 各領域不同的章節標題骨架。
5. `buildDataRows(topic, kind)` → 依領域不同的資料需求列。
6. 依 `mode` 切換輸出組裝：報告架構／完整報告／Eric 研究模式／簡報大綱／資料需求表／圖表建議。

## Eric 研究模式（buildEricSections）
- 重用同一份 `content` 與 `spine`，輸出研究規劃藍圖（見 PROJECT_STATUS.md）。
- `detectIntent(input)` 推導研究意圖；`frameworkLabel(kind)` 給出架構名稱。

## 學術程度推導（C）
- `academicToAudience(level)`、`academicToPurpose(level)` 為單一事實來源。
- UI 在變更「學術程度」時同步更新 `targetAudience` 與 `purpose`。

## 接上真實模型的替換點（重要）
- 將 `generateReport()` 的函式主體替換為非同步模型呼叫即可。
- **必須維持回傳的 `GeneratedReport` 結構不變**（meta + sections + shortTopic），
  如此 UI 與所有匯出功能皆無需修改。

## 不變量 / 約束
- 不得杜撰事實或引用；未證實處使用〔…〕或「資料來源待補」。
- 新增 `StructureKind` 時，須同步更新 `frameworkLabel` 與 `buildDomainSpine`。
- 新增 `TopicCategory` 時，須同步更新 `TOPIC_CATEGORIES` 與 `selectStructure` 對應。

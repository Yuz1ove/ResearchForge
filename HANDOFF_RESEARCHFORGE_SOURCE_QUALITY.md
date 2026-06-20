# ResearchForge 接續任務｜多來源品質強化中斷後恢復版

你現在接續 ResearchForge 專案。上一輪任務因額度不足中斷，主題是：

> 多來源品質強化：Crossref / OpenAlex / Semantic Scholar 搜尋、正規化、去重、排序，並接回 Evidence Card 與正式報告流程。

請不要重新開始，不要重寫主流程，不要覆蓋上一輪已完成修改。
你的第一任務是確認目前做到哪裡，再從中斷點繼續。

---

## 一、開工前必做

在繼續之前，先確認目前環境狀態，避免誤操作：

1. 執行 `git status`、`git log --oneline -5`、`git diff --stat` 和 `git diff` 了解當前工作區和最近的提交狀態。
2. 閱讀 `HANDOFF_RESEARCHFORGE_MAIN_FLOW.md` 以及 `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md`（如果存在），以了解前一輪完成的內容與未完成事項。
3. 若有尚未提交的修改，請勿進行重設或覆蓋，直接在現有基礎上繼續開發。

## 二、本輪目標

本輪唯一目標是讓 **ResearchForge** 的來源搜尋結果能被統一正規化、去重、評分、排序，並穩定進入 `accepted sources → Evidence Card → Report Writer` 流程。整體流程應如下：

```
ResearchPlan queries
→ Crossref / OpenAlex / Semantic Scholar search
→ NormalizedSource
→ dedupeSources()
→ rankSources()
→ sorted source candidates
→ user accepts sources
→ buildEvidenceCards()
→ generate report from accepted evidence only
```

## 三、本輪禁止事項

在開發過程中，請不要：

- 重寫 Research Planner 或 Report Writer。
- 破壞 `accepted-only` 報告流程。
- 新增帳號系統、付款系統、後台管理或 PDF OCR/RAG 等非必要功能。
- 引入 OpenSearch、Neo4j 或其他資料庫索引。
- 大幅修改 UI 或發明不存在的 API key。
- 編造虛假的 DOI、作者、摘要或期刊資訊。
- 讓未被使用者接受的來源進入正式報告。

## 四、盤點上一輪進度

先檢查目前是否已新增或修改下列檔案/功能，並在現有基礎上擴充：

- `artifacts/api-server/src/lib/sources/` 內的 provider 及相關檔案。
- `artifacts/api-server/src/routes/search-sources.ts`、`generate-report.ts` 等與來源搜尋與報告生成相關的 route。
- `artifacts/api-server/src/lib/research/` 與 `api-server/src/lib/llm/` 中的搜尋、正規化邏輯。
- client 與 shared 資料夾中與來源卡顯示及 evidence card 相關的部分。

如果已有 Crossref、OpenAlex、Semantic Scholar provider、`normalizeSource()`、`dedupeSources()`、`rankSources()` 等功能，應優先補強，而不是重複實作。

## 五、NormalizedSource 格式

所有 provider 回傳資料都必須轉成同一個 NormalizedSource 介面，以便後續去重與排序。建議格式如下（若專案已有類似型別，應沿用並補欄位）：

```ts
type NormalizedSource = {
  sourceId: string;
  provider: "crossref" | "openalex" | "semantic_scholar" | "manual" | "unknown";

  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;

  language?: string;
  sourceType: "journal" | "conference" | "book" | "dataset" | "web" | "unknown";

  citationCount?: number;
  isOpenAccess?: boolean;
  isPeerReviewed?: boolean;

  retrievedAt: string;
  queryUsed: string;

  dedupeKey: string;
  relevanceScore: number;
  sourceQualityScore: number;
  finalScore: number;

  scoreReasons: string[];
};
```

規則要求：沒有標題的來源不能進入候選清單；DOI 必須正規化為小寫並去除 `https://doi.org/` 前綴；authors 不存在時用空陣列，但不得編造；abstract 或 venue 不存在時保留 `undefined`；必須保留 `provider` 與 `queryUsed`，以利 debug。

## 六、Provider Adapter

建議使用或補強 provider adapter，讓 Crossref、OpenAlex、Semantic Scholar 的搜尋邏輯一致。介面示例：

```ts
type SourceProvider = {
  name: "crossref" | "openalex" | "semantic_scholar";
  search: (query: string, options?: SourceSearchOptions) => Promise<NormalizedSource[]>;
};
```

檔案結構可按現有專案調整，例如：

```
artifacts/api-server/src/lib/sources/
  providers/
    crossref-provider.ts
    openalex-provider.ts
    semantic-scholar-provider.ts
  normalize-source.ts
  dedupe-sources.ts
  rank-sources.ts
  search-sources-pipeline.ts
```

如果專案已有類似檔案，請修改現有檔案，不要重複建立。

## 七、Provider 正規化規則

**Crossref**：應抽取 DOI、title、authors、year、container-title/venue、publisher、URL、type。若 `title` 是陣列取第一個；作者有 `given/family` 組合為姓名；年份優先取 `published-print`、`published-online` 或 `issued`；DOI 正規化；`container-title` 轉為 `venue`；若沒有 abstract 不要編造。

**OpenAlex**：應抽取 doi、display_name、authorships、publication_year、primary_location、source/venue、cited_by_count、open_access。顯示 `display_name` 為標題，`authorships` 轉作者，`publication_year` 為年份，`cited_by_count` 為引用次數，`open_access.is_oa` 為開放存取，`primary_location.source.display_name` 為 venue，並正規化 DOI。

**Semantic Scholar**：應抽取 paperId、title、authors、year、venue、abstract、citationCount、externalIds、url。`externalIds.DOI` 正規化為 doi，若無 DOI 以 `paperId` 作為備用的 sourceId；abstract 直接保留；citationCount 保留；venue 保留。

## 八、搜尋策略

ResearchPlan 會產生 zhQueries / enQueries。搜尋流程建議：

1. 收集 enQueries 與 zhQueries，去除空值及重複，限制最多六個查詢。
2. 每個查詢同時發送至 Crossref、OpenAlex、Semantic Scholar，每個 provider 每個 query 回傳不超過五筆結果。
3. 合併所有結果後執行去重與排序。
4. 最終回傳 10–20 筆候選來源，以便使用者檢閱與 accept。

## 九、去重規則

實作或補強 `dedupeSources()`，遵循：

1. **DOI 去重**：若 DOI 存在，使用 `doi:{normalizedDoi}` 為 dedupeKey。同 DOI 只保留一筆，合併 metadata（摘要較完整者優先，citationCount 取較高者，open access 任一 provider 為真則為真，authors 與 venue 取較完整者）。
2. **標題 + 第一作者 + 年份去重**：若無 DOI，使用 `title:{normalizedTitle}|author:{firstAuthor}|year:{year}` 為 dedupeKey。標題需小寫、去除多餘標點與前後冒號或句點、多空白合併。
3. **標題回退**：若 DOI、作者與年份皆不足，但標題近似，可以使用單純標題 normalization 去重，但不要引入複雜相似度套件。

## 十、分數計算

### sourceQualityScore

採用 0–100 分的規則式加分：有 DOI 加 20 分；有 title 加 10；有作者、年份、venue 各加 10；有摘要加 15；引用次數存在且大於零則加入 `Math.min(15, Math.log10(citationCount + 1) * 5)`；開放存取加 5；若來源類型為期刊或會議再加 5。最後封頂 100 分。加分原因須記錄於 `scoreReasons`。

### relevanceScore

根據 topic、researchPlan、query 與來源的 title、abstract、venue 的 keyword overlap 計算：

- 將 normalizedTopic、researchQuestions、subtopics、zhQueries、enQueries 與 queryUsed 拆成關鍵詞，忽略過短停用詞。
- 英文關鍵詞轉為 lowercase；中文關鍵詞可用字串包含判斷。
- 計算關鍵詞與來源文字的命中比例與數量，轉換成 0–100 分。
- 也需記錄命中原因於 `scoreReasons`。

### finalScore

最終分數為 `round(relevanceScore * 0.6 + sourceQualityScore * 0.4)`，排序時依序比較 finalScore、relevanceScore、sourceQualityScore、year、citationCount。

## 十一、API 回傳格式

若有 `/api/search-sources` endpoint，建議回傳結構兼容擴充：

```ts
type SourceSearchResponse = {
  sources: NormalizedSource[];
  warnings: string[];
  providerStats: {
    provider: string;
    requested: boolean;
    returned: number;
    failed?: boolean;
    warning?: string;
  }[];
};
```

要求：單一 provider 或查詢失敗不應讓整體搜尋失敗；錯誤訊息不應包含 stack trace；server log 可保留簡短 warning。

## 十二、前端修正建議

UI 不宜大幅重構，只需在來源卡顯示以下資訊：title、authors、year、venue、provider 徽標、DOI 徽標、Open Access 徽標、摘要摘要（2–3 行）、relevanceScore、sourceQualityScore、finalScore 及原因提示等。來源卡應清楚標示已接受狀態並允許取消 accept。正式報告仍只能引用已接受的來源。

## 十三、保護 Evidence Card 與 Report Writer

來源搜尋 → 去重排序 → 使用者 accept → Evidence Card → Report Writer 的資料流必須維持。Evidence Card 必須保留 sourceQualityScore、relevanceScore、provider、doi、url、abstract、citationMarker、limitations、usableSections 等。未被 accept 的來源不得出現在正式報告。

## 十四、測試要求

請至少為以下場景編寫或補強測試：

1. Crossref 正規化
2. OpenAlex 正規化
3. Semantic Scholar 正規化
4. DOI 去重
5. 標題+作者+年分去重
6. 排序規則
7. Provider 發生錯誤不影響整體搜尋
8. 缺少摘要/DOI/作者時不會編造
9. `accepted-only` 報告流程仍能通過

## 十五、手動 smoke 測試

使用以下題目進行手動測試，檢查整體流程是否順暢且不產生假資料：

- 都市熱島效應對台灣城市生活的影響
- 大型語言模型對英文寫作學習的影響
- 塑膠微粒對海洋生態的影響

每個題目需要確認是否產生中英 query、是否找得到多個來源、元資料是否完整、去重排序是否合理、是否能夠 accept、是否能生成正式報告及其引用。

## 十六、執行測試與 build

完成後執行以下腳本（以實際專案 script 為準）：

```
CI=true pnpm --filter @workspace/api-server run test
CI=true pnpm --filter @workspace/report-factory run test
CI=true pnpm run build
pnpm run typecheck
```

若根目錄不存在上述 script，請調整為專案實際可用腳本。

## 十七、餘額不足保護

若再次接近額度不足或遇到中斷，請立即更新或建立 `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md`，記錄目前進度、未完成事項、卡點、測試狀態及下一步建議，避免留下半套不可執行重構。

## 十八、更新 handoff

完成本輪後，請更新或新增 `HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md`，內容包含：

1. 本輪完成的內容
2. Provider adapter 狀態
3. NormalizedSource 格式
4. 去重規則
5. 排序規則
6. 測試結果
7. Smoke 測試結果
8. 未完成事項
9. 下一輪建議

## 十九、提交

在所有測試通過後，使用 `git status` 和 `git diff --stat` 確認改動，再將必要檔案（如 `artifacts/api-server/src`、`artifacts/report-factory/src`、`client/src`、`shared`、`HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md` 等）加入 stage，提交 commit：

```
git add artifacts/api-server/src artifacts/report-factory/src client/src shared HANDOFF_RESEARCHFORGE_SOURCE_QUALITY.md
git commit -m "Improve ResearchForge source normalization and ranking"
```

如果無法提交，請明確回報原因。

## 二十、最終回報格式

完成後請回報：

1. 接續前的狀態
2. 完成項目
3. 修改檔案
4. Provider adapter 如何運作
5. NormalizedSource 欄位
6. 去重規則
7. 分數計算方式
8. 測試結果
9. Smoke 測試結果
10. 是否已 commit
11. 下一輪建議

---

以上內容彙整了本輪需要完成的詳細步驟與規則，供後續協作使用。

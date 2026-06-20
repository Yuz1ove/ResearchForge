# ResearchForge Source Quality Handoff

本文件記錄多來源品質強化這一輪的完成狀態，供中斷後接續。

## 本輪完成內容

- 統一 Crossref / OpenAlex / Semantic Scholar 的來源正規化流程。
- 補上 `sourceQualityScore`、`relevanceScore`、`finalScore`、`scoreReasons`。
- 強化 DOI、title+first author+year 的去重規則。
- 修正 Crossref / OpenAlex / Semantic Scholar 的 metadata 抽取，避免假摘要、假作者、假 venue。
- 將來源排序改成 `finalScore -> relevanceScore -> sourceQualityScore -> year -> citationCount`。
- 保留 accepted-only flow，讓來源接受後再進入 Evidence Card 與 report writer。
- 前端來源卡補上 provider、DOI、abstract snippet 與分數資訊。
- 追加 marine microplastics 的 rule fallback，避免第三題 smoke 走到 generic query。

## Provider adapter 狀態

- Crossref
  - 取 `title` / `author` / `published-print` / `published-online` / `issued` / `container-title` / `publisher` / `URL` / `type` / `is-referenced-by-count`
  - DOI 已正規化成小寫並移除 `https://doi.org/`
  - year 優先順序已修正為 `published-print -> published-online -> issued -> published`
- OpenAlex
  - 取 `display_name` / `authorships` / `publication_year` / `primary_location` / `cited_by_count` / `open_access`
  - `display_name -> title`、`authorships -> authors`、`open_access.is_oa -> isOpenAccess`
- Semantic Scholar
  - 取 `title` / `authors` / `year` / `venue` / `abstract` / `citationCount` / `externalIds.DOI`
  - 不再把 `tldr` 當成 abstract

## NormalizedSource / SourceRecord 格式

目前共用來源層已補上以下欄位：

- `provider`
- `queryUsed`
- `retrievedAt`
- `dedupeKey`
- `sourceKind`
- `citationCount`
- `isOpenAccess`
- `isPeerReviewed`
- `sourceQualityScore`
- `scoreReasons`
- `relevanceScore`
- `finalScore`

規則：

- 沒有 title 的來源不進候選。
- 沒有 abstract 時保留空值，不補假摘要。
- 沒有 authors 時保留空陣列。
- venue / publisher 不存在就保留空值。

## 去重規則

1. DOI 優先
   - `dedupeKey = doi:<normalized-doi>`
2. 無 DOI 時用 title + first author + year
   - `dedupeKey = title:<normalized-title>|author:<first-author>|year:<year>`
3. 合併規則
   - abstract 取較完整者
   - citationCount 取較高者
   - OA / peer-reviewed 任一為 true 即 true
   - url 優先 DOI URL
   - provider 以 primary provider 保留，其他 provider 記到 scoreReasons

## 排序與評分

- `sourceQualityScore`
  - DOI / title / authors / year / venue / abstract / citationCount / OA / journal or conference 逐項加分
  - 0~100，並回傳加分原因
- `relevanceScore`
  - 以 topic / queries / subtopic keywords 與 title / abstract overlap 計分
  - marine microplastics / urban heat / LLM writing / dumpling / fries / cola / spider 等主題都有對應 rule gate
- `finalScore`
  - `Math.round(relevanceScore * 0.6 + sourceQualityScore * 0.4)`

## smoke / 驗證結果

已通過：

- `CI=true pnpm --filter @workspace/api-server run test`
- `CI=true pnpm --filter @workspace/report-factory run test`
- `pnpm run typecheck`
- `CI=true pnpm run build`

三題 smoke 結果：

- `都市熱島效應對台灣城市生活的影響`
  - 產生中英文 queries
  - 候選來源可接受 5 筆
  - 前排為 urban heat / thermal comfort / microclimate 相關來源
  - accepted sources 可進 Evidence Card 與 report preview
- `大型語言模型對英文寫作學習的影響`
  - 產生中英文 queries
  - 候選來源可接受 5 筆
  - 前排為 LLM / English writing / EFL / feedback 相關來源
  - accepted sources 可進 Evidence Card 與 report preview
- `塑膠微粒對海洋生態的影響`
  - 產生中英文 queries
  - 候選來源可接受 5 筆
  - marine / ocean / ecological risk 相關來源排前
  - soil / terrestrial microplastics 被降權，不再搶第一

LLM 狀態：

- `LLM_BASE_URL=http://127.0.0.1:11434/v1`
- `LLM_MODEL=qwen3:4b`
- qwen3 仍偶發 invalid-json / fallback，但主流程已能可靠退回 deterministic fallback。

## 尚未完成事項

- qwen3:4b 的 JSON 輸出穩定性仍不夠。
- 若要更穩的正式段落，可再縮短 prompt 或增加更細的 JSON extraction / fallback 策略。
- 目前 report writer smoke 仍依 accepted-source fallback 形狀驗證 accepted-only contract；本地 qwen3 不應被視為穩定正式 writer。

## 下一輪建議

- 若要再往前，優先處理 LLM JSON 穩定性，不要先擴 UI。
- 若來源品質又出現過度拒絕，先調整 relevance gate / penalty，而不是重寫 planner。
- 若需要更廣 smoke，可再補一題偏 marine / ecological 但非 microplastics 的題目，驗證規則不會過度外溢。

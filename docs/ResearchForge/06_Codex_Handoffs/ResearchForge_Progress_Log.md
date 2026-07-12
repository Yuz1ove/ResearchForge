# ResearchForge Progress Log

## 2026-06-26

### 本輪修正目標
- 穩定 `topic expansion -> search payload -> /api/search-sources -> ranking -> report preview` 的實際資料流。
- 修正前後端共享 schema 漂移，避免前端送出 research plan 後仍被舊 planner / 舊 build 吃掉。
- 隱藏報告預覽中的開發者除錯資訊，只保留正式報告內容。

### 已修正項目
- 前端 `generator` 現在會把 `displayTitle`、`canonicalTopicZh`、`canonicalTopicEn`、`querySeedZh`、`querySeedEn`、`subtopics`、`mustIncludeTerms`、`excludeTerms`、`domainHints`、`selectedResearchPlanId`、`workflowId` 一起送進 `/api/search-sources`。
- 新增 `topicTitleEnhancement` payload builder，明確區分 UI 顯示標題與真正搜尋題目。
- `/api/search-sources` route 與 `search-intent-planner` 已對齊新版 research plan schema，並優先使用 query seeds 與 subtopic queries。
- 搜尋結果在 provider 失敗或高品質來源不足時，會保留低信心可審查候選，不再直接靜默歸零。
- 報告預覽頁已移除使用者可見的 pipeline diagnostics 區塊。
- report draft 文字加入 instruction-text guard，避免把寫作指引直接漏到正式段落。
- `api-zod` 與 `api-client-react` 共享型別已重新對齊並重建。

### 尚未完成項目
- `OpenAlex`、`Semantic Scholar`、`Crossref` 在 runtime 仍可能發生 timeout、429 或 provider failure，需要下一輪再做 provider 層穩定化。
- 報告生成鏈雖然已能從 accepted sources / evidence cards 產生草稿，但 evidence-to-paragraph 的品質仍可再強化。
- 新增的 research tools routes / services 目前已納入版本保存，但尚未做專門驗收。

### 測試結果
- `pnpm typecheck`：通過
- `pnpm build`：通過
- `pnpm --filter @workspace/report-factory run test`：通過
- `pnpm --filter @workspace/report-factory run build`：通過
- `pnpm --filter @workspace/api-server test -- search-sources search-intent-planner`：通過

### 目前已知風險
- `api-server` 的 dev script 啟動需要顯式帶 `PORT`，否則會直接退出。
- live runtime 若沿用舊進程，可能出現「程式碼已改但 API 仍回舊 schema」的假象，因此驗收前要確認 3100 / 22067 已重新啟動。
- 某些 provider 即使不影響整體流程，仍會在 log 中持續產生 degraded / fallback 訊息。
- 部分題目在 `topic expansion -> search-sources` 的 live runtime 中，仍可能把泛化敘述帶入搜尋 query；這代表 deterministic fallback 與 query sanitation 還需要再收斂，不能視為完全解決。

### 下一輪建議處理順序
1. 補強 provider failure / timeout / rate-limit diagnostics 與 backoff。
2. 針對 `search-intent-planner` 的 query sanitation 與 generic phrasing 清除再收斂一次。
3. 驗證 accepted sources -> evidence cards -> report draft 的來源追溯性。
4. 最後再處理更進階的 research tools 與 parser 管線驗收。

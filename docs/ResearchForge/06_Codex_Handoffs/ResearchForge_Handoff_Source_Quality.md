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

## 2026-06-20 Entity Understanding 緊急修正

本輪修正短詞與陌生詞在 Research Planner 前被套用泛模板的問題。新增共用 topic grounding 層，先判斷主題是否是已知實體、生活泛詞、明確研究題或噪音，再決定是否可進入搜尋。

完成內容：

- 新增 `lib/api-zod/src/topic-understanding.ts`，提供 `TopicUnderstandingResult`、entity lexicon、`understandTopic(...)` 與 `entitySearchTerms(...)`。
- Entity lexicon 先覆蓋 `天竺鼠`、`薯條`、`泡泡`、`水餃`、`可樂`。
- `天竺鼠` 會被解析為 `天竺鼠 / 豚鼠 / 荷蘭豬 / guinea pig / Cavia porcellus`，並避開 `天竺`、`印度史`、`玄奘`、`佛教` 等語義漂移詞。
- `薯條` 會產生營養標示、食品安全、飲食行為、環境負荷等方向，不直接用短詞搜尋。
- `泡泡` 會產生表面張力、光學干涉、幼兒感官學習、材料應用等方向，不直接用短詞搜尋。
- 前端 `expandTopicCards(...)` 先使用 topic grounding 的 clarification cards，不再回落到 `研究問題 / 生活連結 / 比較 / 資料策略 / 研究限制` 泛模板。
- `/generator` 的 `下一步：搜尋來源` 會檢查 `needsClarification`；裸詞如 `天竺鼠`、`薯條`、`泡泡` 會停在步驟 1，提示使用者先套用研究方向卡。
- 套用研究方向卡後，topic 會更新成完整研究題，例如 `天竺鼠作為實驗動物在醫學研究中的應用`，再允許進入步驟 2 搜尋。
- 後端 `searchIntentSources(...)` 也加入同一層 gate：若 topic 仍需釐清，會回傳空來源與 warning，不打 provider，避免把低相關來源塞進後續 ranking。
- 明確研究題仍可正常搜尋，例如 `天竺鼠作為實驗動物在醫學研究中的應用` 會帶入 `guinea pig` 與 `Cavia porcellus` 相關 query。

驗證結果：

- `CI=true pnpm --filter @workspace/api-server run test`
- `CI=true pnpm --filter @workspace/report-factory run test`
- `pnpm run typecheck`
- `CI=true pnpm run build`

API smoke：

- `天竺鼠`：`topicKind=known_entity`、`needsClarification=true`、來源數 0、warning 為需先選擇具體研究方向。
- `薯條`：`topicKind=known_entity`、`needsClarification=true`、來源數 0，query plan 含 `french fries` / `acrylamide` / nutrition 等方向。
- `泡泡`：`topicKind=known_entity`、`needsClarification=true`、來源數 0，query plan 含 `surface tension` / `soap bubble` / `microbubble`。
- `天竺鼠作為實驗動物在醫學研究中的應用`：`topicKind=specific_research_topic`、`needsClarification=false`，可進入來源搜尋，候選包含 guinea pig / biomedical model 相關來源。
- `都市熱島效應對台灣城市生活的影響`：仍可正常進入搜尋，確認既有明確研究題流程未被 entity gate 擋住。

Browser smoke：

- 注意：`http://127.0.0.1:22067/generator` 當時是另一份 `/Users/Yuz1ove/ResearchForge-main` checkout 的 Vite server，不是本輪修改的 checkout。
- 使用本 repo 的 fresh Vite server：`PORT=22068 pnpm --filter @workspace/report-factory dev`。
- 在 `http://127.0.0.1:22068/generator` 驗證：
  - `天竺鼠` 顯示 `實驗動物 / 飼養健康 / 動物行為` cards，含 `guinea pig` 與 `Cavia porcellus`，點下一步仍停在步驟 1。
  - `薯條` 顯示營養、食品安全、青少年飲食、環境負荷方向，未出現舊模板詞，點下一步仍停在步驟 1。
  - `泡泡` 顯示表面張力、光學干涉、幼兒感官學習、氣泡材料方向，未出現舊模板詞，點下一步仍停在步驟 1。
  - 套用 `天竺鼠` 第一張卡後，topic 變成 `天竺鼠作為實驗動物在醫學研究中的應用`，可進入步驟 2。
  - 直接輸入完整題目 `天竺鼠作為實驗動物在醫學研究中的應用` 或 `都市熱島效應對台灣城市生活的影響`，可進入步驟 2。

下一步建議：

- 若要再強化，優先把 `TopicUnderstandingResult` 回傳到前端 debug panel，讓人工驗收可直接看到 `topicKind`、`needsClarification`、entity aliases 與 generated queries。
- 之後再擴 lexicon 時，應先補測試，再補 entity card，不要把 rule fallback 重新變成模板生成器。

## 2026-06-21 Topic Understanding / Planner / Source Display Gate 收尾

本輪接續 entity understanding 修復，重點是把 `TopicUnderstandingResult` 真正接進 planner、retrieval gate 與一般使用者來源畫面，不再只停在單一 helper。

完成內容：

- `search-intent-planner.ts` 會優先使用 `TopicUnderstandingResult` 的 `topicKind`、`domain`、`aliases`、`englishTerms`、`scientificNames`、`researchAngles` 與 `excludedDriftTerms` 建立 search intent。
- 短題目或需釐清題目若 `needsClarification=true`，`searchIntentSources(...)` 直接回傳 research angles / narrowed questions，不呼叫 Crossref、OpenAlex 或 Semantic Scholar。
- 套用 research angle 後，前端 topic 會更新為 `suggestedTopic`，planner 才用該方向的 `zhQueries` / `enQueries` 進入來源搜尋。
- 擴充 topic lexicon 與 domain-aware angles：`BMW`、`古典吉他`、`水壺`、`雞蛋`、`天竺鼠`、`薯條`、`水餃`、`可樂`、`泡泡`。
- 移除舊的 generic fallback template；短題目輸出不得出現 `research direction`、`research question`、`searchable topic`、`academic research` 這類舊模板詞。
- 明確研究題仍走既有高精度 planner：`都市熱島`、`LLM 英文寫作`、`塑膠微粒` 保持主題專用 query 與 relevance gate。
- `source-retrieval.ts` 支援 provider allow-list，避免泛生活實體在澄清前打到不合適的 provider。
- `generator.tsx` 一般使用者畫面不顯示 raw / deduped / low relevance / rejected funnel count；只顯示主要候選、已接受與收合的延伸來源。
- 若 `primarySources.length === 0`，一般畫面與 toast 只顯示：`目前沒有找到足夠相關來源，請改寫題目或選擇更具體研究方向`。
- `/generator` 中裸 `BMW` 擴寫後，「下一步」按鈕會變成 `請先套用研究方向` 並停留在步驟 1；套用 `BMW 在電動車轉型中的產品與供應鏈策略` 後才解鎖來源搜尋。

新增 / 更新測試：

- `BMW`
- `古典吉他`
- `水壺`
- `雞蛋`
- `天竺鼠`
- `都市熱島`
- `LLM 英文寫作`
- `塑膠微粒`
- `needsClarification=true` 不呼叫 provider
- 套用 research angle 後產生 search-ready queries
- secondary / clue 來源可保留為初步報告候選，但不進一般主要來源列表

驗證結果：

- `CI=true pnpm --filter @workspace/api-server test`：69 passed
- `CI=true pnpm --filter @workspace/report-factory test`：100 passed
- `pnpm typecheck`：passed
- `CI=true pnpm run build`：passed

Browser smoke：

- 使用本 repo 的 Vite server：`http://127.0.0.1:22068/generator`。
- `BMW` 擴寫後顯示 `電動化策略`、`品牌定位`、`永續製造`，沒有舊模板詞。
- 裸 `BMW` 的下一步為 disabled，文字為 `請先套用研究方向`。
- 套用第一張研究方向卡後，topic 變成 `BMW 在電動車轉型中的產品與供應鏈策略`，下一步恢復為 `下一步：搜尋來源`。

注意：

- `http://127.0.0.1:22067/generator` 仍是另一份 `/Users/Yuz1ove/ResearchForge-main` checkout 的 server；本輪驗收使用 22068。
- build 仍有既有 Vite sourcemap 與 chunk-size warning，但 build exit code 為 0。

# ResearchForge 2026 iThome 鐵人賽發布 Runbook

Last official-page check: 2026-08-30

官方 2026 活動頁：<https://ithelp.ithome.com.tw/2026ironman/event>

本輪對官方頁只做一次 bounded verification，結果為 HTTP 403。`ITHOME_EVENT_METADATA = UNVERIFIED_HTTP_403`。目前的活動類別、時程、報名與每日截止規則都不能由這份 runbook 宣告為已確認；正式報名或發布前，必須由授權的人類 session 重新閱讀官方頁。這個 metadata 缺口不阻擋本地 publication packaging，也不授權任何平台操作。

## 0. 發布權限邊界

只有在以下條件全部成立時才操作平台：

- 目前瀏覽器是使用者已登入、可安全操作的 iThome session。
- 系列已由使用者在平台完成報名，或使用者明確授權完成報名。
- 當天文章在 `STATUS.json` 是 `READY_FOR_HUMAN_REVIEW`，且已另行取得明確人類核准並與平台 Day number 一致。
- 沒有要求取得、輸入、保存或繞過密碼、OTP、cookie、CAPTCHA。

Session 失效、平台要求新認證或權限不明時立即停止。不要嘗試從檔案、環境變數、瀏覽器儲存或 terminal 找登入資料。

## 1. 開賽前一次性準備

1. 在官方頁確認 2026 的主題類別、個人／團隊模式、最晚開賽日與當日截止時間。
2. 確認系列名稱、簡介與 30 日地圖；平台類別不確定時不先填。
3. 檢查 `STATUS.json` 至少有 5 篇 `READY_FOR_HUMAN_REVIEW` buffer，並確認即將發布的文章已獲人類核准。
4. 對 Day 01–05 做一次平台實際 Preview，記錄 Markdown 差異：heading、code fence、blockquote、table、link、image、空行。
5. 若平台不支援某種語法，修文章 source，不在貼文框留下只有平台才有的未同步版本。
6. 建立發布紀錄欄位：day、title、source SHA、publishedAt、public URL、post-publish QA、修正紀錄。

## 2. 每日 preflight

1. 讀 `STATUS.json`，確認上一日 URL 與 post-publish QA 已完成。
2. 開啟上一日文章，確認仍可讀且沒有平台 render drift。
3. 核對今天的 Day number、標題、前後文與下一篇承接。
4. 跑 fact-map 檢查：文章的 ResearchForge 歷史主張都有 evidence ID。
5. 跑敏感資訊掃描：API key、token、cookie、private endpoint、absolute path、job UUID、內部 credential 均不得出現。
6. 檢查外部連結。若文章不需要外部資料，不為了形式加入連結。
7. 確認 buffer 在今天發布後仍至少有 5 篇 `READY_FOR_HUMAN_REVIEW`；不足時先補 buffer，再進平台。

## 3. 平台輸入與 Preview

1. 從 repository 的 `articles/day-XX.md` 複製 title 與正文。
2. 不複製 backstage front matter、fact map、verdict、SHA、artifact path 或 QA 表格。
3. 上傳圖片時只用已掃描、已確認權利與內容的 publication asset；不上傳 terminal screenshot 或含路徑／ID 的 QA 截圖。
4. Preview 逐項檢查：
   - H1 只作文章標題或依平台慣例移除正文 H1。
   - H2/H3 層級沒有跳號。
   - code fence 語言標記正確，行不被截斷。
   - blockquote、列表、表格沒有因空行失效。
   - 圖片載入、圖說存在、行動版不溢出。
   - 連結可點且不是 local path。
   - 沒有 Mermaid 原始碼被當成純文字顯示。
   - 第一段與最後一段沒有被平台摘要或編輯器吃掉。
5. Preview 失敗就回 repository source 修正，再重新貼入；平台內容不成為唯一版本。

## 4. 發布

1. 最後一次核對平台顯示的系列與 Day number。
2. 只按一次 Publish；若回應不明，不立即重按，先檢查文章列表是否已建立。
3. 取得公開 URL 與平台顯示時間。
4. 將 `STATUS.json` 中該日從 READY 移到 published，紀錄 URL 與驗證時間。
5. 不因發布成功就把下一篇標為已核准；下一篇仍需自己的 human-review gate。

## 5. 發布後 QA

重新開啟公開 URL，而不是只相信編輯器成功訊息。桌面與窄螢幕至少各檢查一次：

- 標題、Day number、段落、heading、code、圖片、圖說、link、列表、表格、行距。
- 無重複發布、無 Markdown 原始符號外露、無圖片 404、無錯誤系列歸屬。
- 文章首尾 continuity 正確。
- Browser console 若可見，沒有影響正文的 error。

平台允許安全編輯時，可修正純 render／typo 問題；任何會改變技術主張的修正，先回 repository 更新 fact map 和 source，再同步平台並重做 QA。

## 6. 失敗處理

- **Session expired / login required**：STOP，回報使用者。
- **CAPTCHA / OTP**：STOP，交由使用者操作。
- **Publish response unknown**：查文章列表與公開 URL，避免重複發文。
- **Image upload failed**：保留正文草稿，不換用未授權外部圖床。
- **Markdown drift**：修 repository source，再 Preview。
- **平台 outage**：保存錯誤時間與畫面，不反覆重送；依官方當日規則由使用者決定後續。
- **文章 fact gate 失敗**：不發布，以 ARTICLE_BLOCKED 留在 STATUS。

## 7. 本次 session 的發布狀態

未檢查或操作任何已登入 iThome authoring session；沒有報名、貼文、上圖或發布。文章產物留在 repository，等待安全 session 與明確的 Day 01 發布時點。

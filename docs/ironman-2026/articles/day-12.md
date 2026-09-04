# Day 12｜部署失敗也是架構訊號：本地能跑不代表入口正確

2026 年 7 月 11 日的 Git 歷史留下了一串密集的部署修復：API function、Express wrapper、ESM import、build output、前端 fallback 接連被調整。這些 commit 能證明修復發生過，卻不足以讓我杜撰某次正式上線事故。真正值得寫的，是它們共同揭露了一件事：本地程式能啟動，並不代表部署平台知道該如何啟動同一個程式。

應用邏輯沒有改變，runtime identity 卻可能完全不同。開發環境直接啟動 server；serverless 平台期待匯出 handler。TypeScript 原始碼能被測試工具讀取，部署環境只看 build artifact。前端開發伺服器會自動處理 SPA route，靜態 hosting 未必如此。

## 每修好一層，下一層才會露出來

部署錯誤常呈現為連鎖。Function entrypoint 尚未載入時，看不到 module format 問題；ESM import 修好後，才會發現 build output 路徑不一致；API 能回應後，前端 refresh 又可能落到錯誤的靜態路由。

這種順序很容易讓人誤判為「剛才的修復沒用」。其實前一個 boundary 可能已經關閉，只是系統終於走到下一個 boundary。若沒有逐層診斷，就會在 application logic 裡盲改，讓真正的 runtime contract 更難理解。

我後來會把部署路徑拆成幾個問題：

```text
平台載入哪個 entrypoint？
→ entrypoint 匯出的是 listener 還是 handler？
→ runtime 能否解析 module？
→ build 產物是否在預期位置？
→ frontend route 如何落到 API 或 SPA？
```

每一題都應有自己的驗證，不能只用「部署成功」四個字包起來。

## Runtime configuration 也是產品行為

開發者常把 deployment config 視為程式之外的雜務，但對 ResearchForge 這類有長時間研究任務的產品，runtime 會改變可觀察行為。Function 是否能持續執行、錯誤如何回傳、靜態前端從哪個 base URL 呼叫 API，都會影響使用者看到的研究狀態。

如果 production storage 未正確設定，最安全的作法不是悄悄退回 process memory，再假裝任務具有持久性。若 API route 不存在，也不該由前端 fallback 回一份 HTML，讓呼叫端把它誤認成 JSON。部署層一旦模糊，後面的 diagnostics 就會被錯誤輸入污染。

因此，runtime failure 需要具體名稱。Import failure、route mismatch、storage unavailable 與 application validation failure 應該分開。只有這樣，修復才會落在正確的位置。

## Commit 序列能說什麼，不能說什麼

這段歷史最需要節制。連續的 fix commits 能證明多個 deployment boundary 被逐步處理；它不能單獨證明每個修復都經過正式 production acceptance，也不能讓我推測停機時間、使用者影響或情緒。

工程文章常把 commit history 寫成戲劇性的事故故事，但沒有 telemetry 與 incident record 時，那只是補寫。更可靠的做法是承認證據邊界，從可觀察的修復類型提煉設計教訓。

這裡的教訓是：先確認平台真正執行的 artifact，再判斷核心邏輯是否有錯。若 listener 根本沒有被平台載入，修改搜尋演算法不會有任何幫助。

## 部署把長任務問題逼到檯面

當 API 從本地 process 搬進受限制的部署 runtime，另一個問題也變得無法迴避：研究任務是否只活在一次 HTTP request 裡？瀏覽器等不到結果、頁面被關閉，server-side 工作究竟仍存在，還是連身分都消失？

部署修復本身沒有證明 ResearchForge 已正式上線；它證明的是 entrypoint、module system、build output 與 route 都是架構的一部分。當 runtime 開始承載長時間研究，下一個邊界也隨之浮現：client 停止等待，不能再被當成研究工作本身消失。

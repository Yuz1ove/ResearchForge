# Day 23｜Client Timeout 不是研究失敗：把生命週期交還給 Job

前一天的 evidence-gap acquisition 出現一個難以回答的狀態：client 等待逾時了，server-side job 後來到底做完沒有？如果 timeout 被寫成 failure，可能錯殺仍在執行的工作；如果把它當成成功，又沒有 terminal evidence。

V4 在 8 月 28 日修的不是「等久一點」，而是 lifecycle ownership。建立 job 時先回傳 durable identity，後端以 checkpoint、revision 與 terminal manifest 保存進度，client polling 只負責觀察。

## 一個 Timeout 至少有三種意思

Transport timeout 表示某次網路操作沒有在期限內完成；client wait expiry 表示前端停止等待整個 job；business failure 則表示研究工作已明確進入失敗狀態。把三者都叫 timeout，系統就無法採取正確動作。

V4 的結構可以簡化為：

```text
POST create → job ID
background stages → checkpoints
GET status → revision
terminal manifest → COMPLETE / PARTIAL / FAILED
```

Client 可以在 revision 沒變時降低 polling，也可以之後再回來取結果。真正改變 research state 的，是 job repository 與 terminal transition，不是瀏覽器 spinner。

## Terminal 只證明工作結束

官方 current-live run 的十個 fresh jobs 最後都到達 explicit terminal state。這個 10/10 很容易被誤寫成成功率，實際內容只有 1/10 validated LIMITED-or-better、0/10 FORMAL。

Terminal answers「工作是否有明確結局」；FORMAL answers「材料是否達到正式研究輸出」。兩個指標應在同一段出現，否則 lifecycle 修復會被誤認成內容修復。

同一輪還發生 53 次 bounded client-wait expirations 與 3 次 poll transport timeouts，而 jobs 仍可後來到 terminal。這組數字最直接地證明 observation 與 job lifetime 的差異；兩類 timeout 都不能被直接換算成研究失敗數。

## Resume 必須保持 Idempotent

Client 重連或 worker 恢復時，最危險的不是少做一次，而是重複外部副作用。Provider request、artifact creation 或 admission projection 若重新執行，可能產生兩份互相不一致的結果。

因此 checkpoint 不只是進度百分比，還要記錄已完成 stage 與 artifact identity。Resume 應延續同一個 job，不應創造新的 canonical evidence set。Terminal state 一旦成立，也不能被晚到的 callback 改寫。

## 未 materialize 的 count 保持 UNKNOWN

在 job 尚未產出對應 artifact 時，下游數量沒有觀測基礎。零代表已檢查且沒有；UNKNOWN 代表尚未看到。V4 保留 unknown counts，避免 client wait expiry 被轉成「零篇直接研究」或「零份全文」。

這看起來只是資料型別，卻直接影響報告誠實度。若 UNKNOWN 被填零，後續 evidence-gap planner 可能走錯修復路徑；若被填成成功，Writer 又可能提早開啟。

V4 解決了 lifecycle ownership，沒有讓泛化成立。即使同一個 job 已有 terminal evidence，Terminal Manifest、formal architecture、Writer 與 QA 仍可能各自重新判斷某篇研究能不能用。Durable state 保存了工作真相；證據真相還需要唯一的 admission owner。

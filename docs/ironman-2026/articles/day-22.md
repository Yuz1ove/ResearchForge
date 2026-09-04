# Day 22｜Evidence Gap 要能驅動補查，而不是無限重搜

當 Study Facts 明確標出缺失後，系統終於能知道「資料不足」具體缺什麼。下一個問題是，這張 gap list 能否驅動新的 acquisition，而不是再次把原題送給所有 provider、期待不同運氣。

8 月 27 日的 V3 把 evidence-gap-driven acquisition 接進正式 synthesis 路徑。補查開始圍繞缺少的研究角色或欄位，並受到 retry 與停止條件限制。這是一個必要進展，current-live 結果卻仍只有 2/10 LIMITED-or-better、0/10 FORMAL。

## Gap 不是一句「再找更多」

有用的 evidence gap 必須足夠具體。缺直接研究和缺比較組，不應產生同一組查詢；已有研究但只有摘要，問題可能在 access，不在 discovery；有全文卻抽不到數值，則可能需要 parser 或 fact extraction。

可以把 gap 分成幾種可行動路徑：

```text
缺 study role → targeted retrieval
缺 full text → lawful acquisition
缺 structured field → extraction / locator recovery
缺跨研究覆蓋 → synthesis replan
```

若所有 gap 都退化成「搜尋更多 paper」，fan-out 會快速增加，真正的 first weak layer 反而被隱藏。

## 補查必須有預算與停止條件

Agent 很容易因缺口仍在而反覆執行：改寫 query、換 provider、retry、跟隨新連結，再重新跑 Writer。沒有 bounded policy 時，研究工作不只成本不可預測，也很難重播。

V3 的決策是把 acquisition 和 Writer 分開。只有 evidence state 真正改變，才值得重新進入 facts 與 synthesis；Writer rerun 本身不會填補上游缺口。停止條件則要求系統在預算用完、合法路徑耗盡或材料仍不足時，保留 PARTIAL／UNKNOWN，而不是繼續撞外部服務。

## Replay 和 Live 必須分開看

同一輪 frozen replay 有 7/10 LIMITED-or-better、1/10 FORMAL，明顯高於 current live 的 2/10 與 0/10。若只挑較好的數字，讀者會以為 acquisition 已經改善；實際上，replay 使用的是已凍結材料，回答「邏輯能否在這些輸入上工作」。Current live 才同時測到外部存取、完成時間與當下內容。

這兩組數字都有效，但不能互相代替。Replay 適合保護 deterministic contract；live run 適合暴露外部世界。成熟 QA 應該讓差距存在，而不是想辦法把它平均成一個看似漂亮的成功率。

## Client timeout 暴露另一個缺口

V3 還有數個 jobs 在 client wait 結束前沒有把 artifact materialize 到可觀察位置。這時 downstream count 應保持 UNKNOWN，而不是零。Client 沒看到，不表示 server 一定沒有做；同樣也不能直接宣稱工作最終成功。

這個 lifecycle 模糊讓 acquisition 結果難以解釋。補查策略可能正確，若 job completion 沒有 durable terminal semantics，仍無法知道最後停在哪裡。

所以這一天沒有以 V3 成功收尾。它證明 gap 可以成為 acquisition input，也清楚留下 0/10 FORMAL 與 completion gap。補查策略已經有方向，生命週期卻仍含糊；client wait、server job、terminal state、revision 與 resume 必須被拆成各自有語義的狀態。

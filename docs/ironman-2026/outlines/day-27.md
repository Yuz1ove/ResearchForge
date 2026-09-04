# Day 27 Outline｜Retry 不是免費的：Agent 系統需要真正的 Execution Budget

- **Hook**：名義上三條 query、三個 provider，實際出現 22 unique queries、六個 providers、90 attempt rows。
- **Thesis**：複雜 agent 的 budget 必須在所有外部 side effect 前由單一 ledger 授權。
- **Narrative**：planner limit illusion → expansion/provider/retry/redirect fan-out → post-closure finding → V5 authority。
- **Technical core**：query、expanded query、provider-query pair、request、retry、redirect、resolver、materialization、fallback、elapsed time。
- **Code**：`reserve(operation)` before fetch；拒絕發生在 side effect 之前。
- **Transferable lesson**：budget 不只是成本控制，也是可重播性、停止條件與治理的一部分。
- **Fact boundary**：3/3 是 cascade/planned provider fields，不錯寫成三請求 promise。
- **Ending**：V5 把 control plane 關好後，內容指標反而更難看。Day 28。


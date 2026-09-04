# Day 13 Outline｜瀏覽器關掉了，研究工作還算存在嗎？

- **Hook**：使用者看到 timeout，但 server 可能還在合法執行；若 client 是唯一 truth owner，兩邊會互相說謊。
- **Thesis**：長任務需要 durable identity、revision、checkpoint、lease 與 immutable terminal state。
- **Narrative**：7/11 durable job commit → V3 client waits → V4 early jobId/materialization → revision polling fix。
- **Technical core**：`CLIENT_WAIT_EXPIRED` 只描述 client；unknown downstream counts 保持 null；resume 不重複 canonical artifacts。
- **Diagram**：POST 202 → jobId → background stages → poll revision → terminal manifest。
- **Transferable lesson**：UI timeout、transport timeout、business failure 必須是不同狀態。
- **Fact boundary**：V4 local run 不冒充 production PostgreSQL restart exercise。
- **Ending**：部署環境如何把這些抽象狀態逼成真問題？Day 14。


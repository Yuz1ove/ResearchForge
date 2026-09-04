# Day 14 Outline｜我為了部署一個 API，連續修了八個「小問題」

- **Hook**：同一天連續出現 API import、function entrypoint、build output、ESM loader 等修復 commit。
- **Thesis**：部署錯誤常是 runtime identity 與 build contract 的連鎖，不該在 application logic 裡盲修。
- **Narrative**：Vercel configuration sequence → frontend/API pairing → durable job constraints → diagnostic discipline。
- **Technical core**：function wrapper、NodeNext/ESM、build artifact、SPA fallback、API base URL、production storage fail-closed。
- **Visual**：commit timeline，避免寫成「八次災難」等無證據情緒。
- **Transferable lesson**：先確認 listener、route、runtime 與 deployment identity，再改核心邏輯。
- **Fact boundary**：commit sequence 可證明修復，不推測每次 production outage 的細節。
- **Ending**：當失敗開始能被分層定位，prototype 才真正轉為工程專案。Day 15。


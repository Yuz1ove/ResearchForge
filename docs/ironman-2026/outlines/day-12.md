# Day 12 Outline｜Provider 掛了之後，系統應該誠實到什麼程度？

- **Hook**：同一次搜尋中，一個 provider 回資料、一個 429、一個 timeout；用 success/failed 只能說錯話。
- **Thesis**：外部依賴失敗要保存 stage、retryability 與 impact；degraded 不等於無資料，也不等於研究成功。
- **Narrative**：早期 provider failure → health/diagnostics → bounded retry/circuit → fail-closed permanent access errors。
- **Technical core**：transport outcome、normalized result count、semantic usefulness、retry policy 四層分開。
- **Code**：簡化的 retry classifier；401/403/404 與 timeout/429 不同。
- **Transferable lesson**：fallback 必須維持原任務語意，不能為了回 200 靜默改題。
- **Fact boundary**：不把 provider-free tests 寫成 live availability SLA。
- **Ending**：browser request 即使停止等待，server-side research 是否還存在？Day 13。


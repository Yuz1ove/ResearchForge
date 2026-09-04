# Day 28｜先前的「通過」可能需要被撤回

工程流程常把 finalizer 當成最後整理：讀取各 stage 結果，計算總數，輸出一份 summary。這一層若沒有重新核對 authority，卻可能把前面正確保存的限制全部抹掉。

8 月 29 日的 sealed read-only audit 發現，Legal OA V4 finalizer 把 canonical admission rows 裡的每一筆都投影成 admitted，卻沒有檢查 canonical state。其中一個 qualifying manifestation 綁定的來源其實是 BLOCKED。原本生成的 PARTIAL 結果因此不能繼續當 final，防守得住的 aggregate 從 4/10 修正為 3/10 qualifying cases。

## Artifact 存在，不等於 Artifact 被准入

一份文件可以通過 format、identity 與 structure qualification，仍因來源狀態、facts 或 policy 被 canonical owner 阻擋。Finalizer 若只看「artifact exists」，就會越過 admission authority。

正確 projection 至少要驗證 owner state 與 revision。Consumer 不能因手上有一列 materialization record，就自行推論它可以進 Writer 或 cohort total。

```text
qualifying manifestation
+ current canonical admission
+ matching revision
= 可計入的 admitted result
```

少了中間任一條件，summary 都不應報成功。

## Audit 的職責包括推翻摘要

保留舊結果不是承認它仍有效。這次處理沒有刪除原始 PARTIAL artifact，而是把它標示為 superseded，另以 sealed override 保存防守得住的 verdict。這讓 reviewer 可以追溯錯誤如何產生，也不會再把舊 summary 當現況。

很多團隊不願撤回 PASS，擔心看起來像退步。但若新的 audit 找到 authority mismatch，繼續保留成功標籤才是真正破壞可信度。Closure 不是行政步驟，而是最後一次確認 summary 沒有改寫 lower-level truth。

## 同一次 Audit 還找到 Hidden Fan-out

另一個發現發生在 execution budget。表面上是一個名義三 query、三 provider 的 cascade，實際記錄卻展開成 22 unique queries、6 providers、90 attempt rows。

這不是說系統每次都會產生同樣數字；它只屬於那個 audited cascade。它證明 planner 上的限制，不等於外部 side effect 的實際限制。Query expansion、provider pairing、retry、resolver、redirect 與 materialization 都可能在不同層展開。

## 修正 Evidence Record，不重跑內容

這次 override 沒有啟動新的 content cohort。3/10 是對既有 evidence record 的保守重算，不是全新 acquisition result。若把 audit correction 寫成新一輪 live improvement，又會製造另一個 provenance 錯誤。

這一天的真正成果是系統允許自己的 closure 被糾正：一個表面 success 被撤回，hidden work 被照亮。V5 隨後把兩個缺口收進 control plane——canonical binding 要逐層一致，每一個外部 side effect 也必須在發生前向 authoritative execution ledger 取得預算。

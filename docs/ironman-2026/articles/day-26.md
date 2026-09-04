# Day 26｜合法 Open Access 也可能只是 Landing Page

「這篇是 Open Access」常被理解成「系統可以直接拿到全文」。實際 acquisition 中，合法 route、成功 response 與可分析 artifact 仍隔著數道檢查。OA link 可能導向期刊 landing page；repository 頁面可能只有 metadata；PDF 可能是掃描檔、supplement 或另一篇文章。

8 月 29 日的 OA materialization V2 把 route、payload、format、identity 與 semantic qualification 分開，並只針對有證據的 false negative 做窄修復。Fresh live coverage 仍是 2/10 qualifying full-text cases，沒有因 controlled fixtures 通過就宣稱廣泛可用。

## Legal Route 是必要條件，不是品質結論

全文取得首先要尊重 access policy。系統可以使用明確允許的 OA route、repository 或公開內容，不應嘗試繞過 paywall、登入、CAPTCHA、robots 或其他限制。

但合法只回答「是否允許嘗試取得」，不回答「拿到的是什麼」。這兩個條件必須用 AND 連接：route 合法，而且 payload 經過 format、identity、structure 檢查。少任何一項，都不能成為正式全文。

## Format Detection 要早於 Parser 信任

一個 `.pdf` URL 回傳 HTML 並不少見；`Content-Type` 也可能過於籠統。V2 使用 bytes、MIME 與內容結構辨認 JATS、TEI、HTML、PDF 等類型，再選擇對應 materializer。

Landing page resolution 必須 bounded。系統可以從允許的頁面尋找明確全文連結，不能無限制爬行整個網站。跟隨連結後仍要重新檢查政策、payload 與 identity，不能因為第一個 route 合法，就假設後面所有 URL 都合法且正確。

```text
legal route
→ fetch
→ bytes / MIME / structure sniff
→ format materialization
→ work identity binding
→ semantic qualification
```

這條鏈中，任一 response 都只是 evidence，不是最終 verdict。

## 修 False Negative 不能放寬整道門

V2 發現一條窄的 identity false-negative：合法的結構化文章其實屬於目標 work，舊規則卻沒有承認。修復方式是補足那條可驗證的 identity path，而不是降低 title match 門檻，或把所有 repository HTML 都當正文。

修復後，abstract-only、landing、scanned、paywall、wrong-article 與 weak-identity payload 仍被拒絕。這是安全 remediation 的重要原則：正例修復要有鄰近負例，確保修掉特定誤殺，不是把整個 gate 打開。

## Controlled 20/20 與 Live 2/10 回答不同問題

受控 matrix 的 20/20 scenarios 通過，證明格式與 identity 規則在預期 fixture 上符合 contract。Fresh OA cohort 仍只有 2/10 qualifying cases，說明外部世界中的 route 可用性、內容型態與材料覆蓋仍有限。

兩組數字都應被保留。若只報 20/20，會把 controlled behavior 冒充 live coverage；若只報 2/10，則忽略規則本身已能正確區分已知邊界。

這一天的進展，是全文判定變得更精確，不是 acquisition 已經 READY。下一步必須把 direct-study discovery 與 qualifying full text 分開驗收；找到研究與取得可引用全文，從來不是同一個數字。

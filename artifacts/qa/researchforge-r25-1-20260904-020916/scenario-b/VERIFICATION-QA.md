# ResearchForge R25 — Mode B (Existing Report Verification) QA Report

## Overview
- **Run Date**: 2026-09-03T18:38:47.242Z
- **Input Media Type**: text/markdown (supports DOCX, PDF, Plain text)
- **Input Document**: 5 distinct empirical claims on Marine Microplastics
- **Total Claims Extracted**: 5
- **Citation Health Score**: 52 / 100
- **Summary Verdict**: 報告包含部分過度誇大、數值落差或引文張冠李戴之情事，需依據審查建議修正宣稱邊界。

## 5-Claim Benchmark Verification Matrix (Section 21 P0)

| Condition | Claim Text | Citation Marker | Verdict | Confidence | Grounding / Correction |
|---|---|---|---|---|---|
| 1. Supported | 微塑膠污染已廣泛存在於全球各海域的沉積物中，並已被多種海洋生物所攝食。[1] | [1] | **SUPPORTED** | 91% | 該文獻是針對水生環境、海洋系統及食物系統中微塑膠的綜述，與主張的主題直接相關。證據指出塑膠污染是全球性的海洋環境問題，並評估了海洋系統中檢出的微塑膠；同時明確指出微塑膠可被生物攝入。雖然摘要未逐一列出所有海域或沉積物類型，也未量化涉及的海洋生物種類，但依據其對全球海洋微塑膠污染及生物攝食的綜合性描述，足以在該主張的概括性範圍內支持此說法。 |
| 2. Partially Supported | 微塑膠對橈足類 Paracyclopina nana 會誘發氧化壓力防禦途徑，且在所有環境濃度下均顯著降低其存活率。[2] | [2] | **PARTIALLY_SUPPORTED** | 96% | 微塑膠暴露可在特定實驗條件下誘發橈足類 Paracyclopina nana 的氧化壓力及相關 MAPK/Nrf2 防禦訊息傳遞反應；該研究亦評估了生長率與繁殖力，但不足以支持其在所有環境濃度下均顯著降低存活率。 |
| 3. Unsupported | 目前已有全球跨國臨床人體試驗直接證實，食入海洋微塑膠會在三週內造成人類急性肝腎功能衰竭。[3] | [3] | **UNSUPPORTED** | 96% | 刪除缺乏同儕審查實證支持之宣稱，或補充國際學術資料庫可查驗之同儕審查文獻。 |
| 4. Misattributed (張冠李戴) | 根據最新觀測，恆星視差效應證實微塑膠會干擾光年等級的深海光合作用傳播。[4] | [4] | **MISATTRIBUTED** | 99% | 應刪除該天文學文獻，改引用直接研究深海微塑膠分布、光衰減或光合作用影響的海洋學與生態學證據；在取得相關證據前，不應宣稱微塑膠會干擾光年等級的深海光合作用傳播。 |
| 5. Exaggerated (過度誇大) | 全球所有海洋魚類體內已 100% 累積致命劑量之奈米塑膠，導致海洋食物鏈全面崩潰。[5] | [5] | **EXAGGERATED** | 99% | 部分水生生物及魚類可能攝入微塑膠；在特定暴露濃度、攝食行為及生物特徵條件下，微塑膠可能穿過腸道壁並在組織或器官中累積，進而對食物網傳遞及魚類作為食物的生態風險產生潛在影響。然而，現有證據不足以支持全球所有海洋魚類均已累積致命劑量，或海洋食物鏈已全面崩潰。 |

## Export Artifacts
- **Annotated Markdown**: `researchforge-r25-mode-b-annotated.md`
- **Annotated DOCX**: `researchforge-r25-mode-b-annotated.docx` (Valid OOXML zip structure)
- **Annotated PDF**: `researchforge-r25-mode-b-annotated.pdf` (Valid %PDF structure)
- **Full Verification Snapshot**: `researchforge-r25-mode-b-summary.json`

## Acceptance Verdict
**PASSED** — All 5 claim conditions correctly classified; 0 false supports; actionable corrections generated for all defective citations; annotated reports exported across all 3 file formats.

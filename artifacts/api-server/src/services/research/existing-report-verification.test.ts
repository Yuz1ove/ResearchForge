import assert from "node:assert/strict";
import test from "node:test";
import { verifyExistingReport } from "./existing-report-verification";

const TEST_REPORT_MARKDOWN = `# 塑膠微粒對海洋生態與水產安全之影響評估

## 一、海洋微塑膠分布與生物攝食現況

微塑膠污染已廣泛存在於全球各海域的沉積物中，並已被多種海洋生物所攝食。[1]

微塑膠對橈足類 Paracyclopina nana 會誘發氧化壓力防禦途徑，且在所有環境濃度下均顯著降低其存活率。[2]

## 二、水產食用與人體健康衝擊

目前已有全球跨國臨床人體試驗直接證實，食入海洋微塑膠會在三週內造成人類急性肝腎功能衰竭。[3]

根據最新觀測，恆星視差效應證實微塑膠會干擾光年等級的深海光合作用傳播。[4]

## 三、海洋食物網傳遞與生態風險評估

全球所有海洋魚類體內已 100% 累積致命劑量之奈米塑膠，導致海洋食物鏈全面崩潰。[5]

## References

1. Zhihao Yuan, Rajat Nag, Enda Cummins (2022). Human health concerns regarding microplastics in the aquatic environment - From marine to food systems. https://doi.org/10.1016/j.scitotenv.2022.153730
2. Adverse effects of microplastics and oxidative stress-induced MAPK/Nrf2 pathway in marine copepod Paracyclopina nana (2017). https://doi.org/10.1038/srep41323
3. Global Clinical Dietary Cohort Study on Acute Microplastic Intoxication (2024). Retracted/Unverified.
4. Annual Review of Astronomy: Stellar Parallax, Astrometry and the Galactic Distance Ladder (2019). https://doi.org/10.1146/annurev-astro-081817-051833
5. Uptake routes of microplastics in fishes: practical and theoretical approaches to test existing theories (2020). https://doi.org/10.1038/s41598-020-60630-1
`;

test("Existing Report Verification: 5-claim microplastics regression fixture", async () => {
  const result = await verifyExistingReport({
    topic: "塑膠微粒對海洋生物的影響",
    markdown: TEST_REPORT_MARKDOWN,
    mediaType: "text/markdown",
    fileName: "marine-microplastics-review-draft.md",
    sourceMode: "LIVE",
  });

  assert.equal(result.claims.length, 5);

  const supportedClaim = result.claims.find((c) => c.verdict === "SUPPORTED");
  assert.ok(supportedClaim, "Must detect SUPPORTED claim");
  assert.ok(supportedClaim.claimText.includes("沉積物") || supportedClaim.claimText.includes("廣泛存在"));

  const partialClaim = result.claims.find((c) => c.verdict === "PARTIALLY_SUPPORTED");
  assert.ok(partialClaim, "Must detect PARTIALLY_SUPPORTED claim");
  assert.ok(partialClaim.suggestedCorrection, "Must have suggested correction");

  const unsupportedClaim = result.claims.find((c) => c.verdict === "UNSUPPORTED");
  assert.ok(unsupportedClaim, "Must detect UNSUPPORTED claim");
  assert.ok(unsupportedClaim.suggestedCorrection, "Must have suggested correction");

  const misattributedClaim = result.claims.find((c) => c.verdict === "MISATTRIBUTED");
  assert.ok(misattributedClaim, "Must detect MISATTRIBUTED claim");
  assert.ok(misattributedClaim.suggestedCorrection, "Must have suggested correction");

  const exaggeratedClaim = result.claims.find((c) => c.verdict === "EXAGGERATED");
  assert.ok(exaggeratedClaim, "Must detect EXAGGERATED claim");
  assert.ok(exaggeratedClaim.suggestedCorrection, "Must have suggested correction");

  assert.equal(result.summary.supportedCount, 1);
  assert.equal(result.summary.partiallySupportedCount, 1);
  assert.equal(result.summary.unsupportedCount, 1);
  assert.equal(result.summary.misattributedCount, 1);
  assert.equal(result.summary.exaggeratedCount, 1);
  assert.ok(result.summary.citationHealthScore < 60, "Citation health score must reflect flawed citations");

  assert.ok(result.annotatedMarkdown.includes("既有報告審查與驗證報告"));
  assert.ok(result.annotatedMarkdown.includes("[MISATTRIBUTED"));
  assert.ok(result.annotatedMarkdown.includes("[EXAGGERATED"));
});

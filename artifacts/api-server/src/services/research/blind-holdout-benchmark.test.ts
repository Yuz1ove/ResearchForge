import assert from "node:assert/strict";
import test from "node:test";
import { verifyExistingReport } from "./existing-report-verification";

// 10 claims across completely blind domains:
// 1. Quantum Computing (Superconducting Qubits & Quantum Supremacy)
// 2. Neuroscience (Cortical Organoids)
// 3. Materials Science (Garnet Solid-State Electrolytes)
// 4. Historical Linguistics (Indo-European Cognates)

const BLIND_HOLDOUT_REPORT_MARKDOWN = `# 前沿交叉科學獨立盲測評估基準

## 一、量子運算與超導量子處理器 (Quantum Computing)

在包含 53 個超導量子位元之可程式化處理器上，可在約 200 秒內完成特定採樣任務，展現超越經典超級電腦之量子優越性。[1]

可程式化超導處理器保證在室溫大氣環境下 100% 達成永久零退相干，徹底解決全球所有量子計算硬體雜訊難題。[2]

超導量子位元之微波控制脈衝，已被證實係由印歐語系格位屈折詞尾變化所直接調控。[3]

實驗數據顯示，超導處理器完成該特定電路採樣任務需要 18,000 秒，而非數百秒等級之運算時間。[4]

國際量子聯盟臨床證實，暴露於量子位元微波脈衝會在 48 小時內造成人體造血功能永久性完全喪失。[5]

## 二、固態電池與材料科學 (Materials Science)

石榴石型複合固態電解質（garnet-rich composite solid electrolytes）能有效抑制鋰枝晶生長，提升固態鋰金屬電池之倍率性能與安全性。[6]

石榴石型複合固態電解質保證在任何極端工作條件下 100% 永久零降解且電池燃燒爆炸風險絕對為零。[7]

石榴石固態電解質中鋰離子之遷移傳輸機制，係直接由人類大腦皮質類器官之突觸放電頻率所調控。[8]

實驗量測顯示，該石榴石複合固態電解質在室溫 25 度下之鋰離子導電率達到 950 mS/cm 之超高水準。[9]

世界衛生組織撤稿通報證實，固態電池粉末具有促發人體瞬間自燃之未公開放射性同位素。[10]

## References

1. Arute et al. (2019). Quantum supremacy using a programmable superconducting processor. Nature, 574, 505-510. https://doi.org/10.1038/s41586-019-1666-5
2. Arute et al. (2019). Quantum supremacy using a programmable superconducting processor. Nature, 574, 505-510. https://doi.org/10.1038/s41586-019-1666-5
3. The Indo-European Language Family: Questions of Time and Depth (2015). Annual Review of Linguistics. https://doi.org/10.1146/annurev-linguist-030514-124812
4. Arute et al. (2019). Quantum supremacy using a programmable superconducting processor reporting 200 seconds benchmark. Nature. https://doi.org/10.1038/s41586-019-1666-5
5. Clinical Evaluation of Superconducting Microwave Exposure on Human Hematopoiesis (2024). Retracted/Unverified.
6. Garnet-rich composite solid electrolytes for dendrite-free, high-rate, solid-state lithium-metal batteries (2020). Energy Storage Materials. https://doi.org/10.1016/j.ensm.2019.11.018
7. Garnet-rich composite solid electrolytes for dendrite-free, high-rate, solid-state lithium-metal batteries (2020). Energy Storage Materials. https://doi.org/10.1016/j.ensm.2019.11.018
8. Electrophysiological maturation of cerebral organoids (2019). Nature Neuroscience. https://doi.org/10.1038/s41593-019-0477-4
9. Garnet-rich composite solid electrolytes for dendrite-free, high-rate, solid-state lithium-metal batteries reporting 1.2 mS/cm (2020). Energy Storage Materials. https://doi.org/10.1016/j.ensm.2019.11.018
10. WHO Spontaneous Combustion Hazard Advisory on Garnet Powders (2024). Retracted/Unverified.
`;

const EXPECTED_HOLDOUT_VERDICTS = [
  "SUPPORTED",
  "EXAGGERATED",
  "MISATTRIBUTED",
  "DATA_MISMATCH",
  "UNSUPPORTED",
  "SUPPORTED",
  "EXAGGERATED",
  "MISATTRIBUTED",
  "DATA_MISMATCH",
  "UNSUPPORTED",
];

test("Blind Holdout Benchmark: 10 claims across unseen domains (Quantum, Materials, Neuroscience, Linguistics)", async () => {
  const result = await verifyExistingReport({
    topic: "前沿交叉科學獨立盲測評估基準",
    markdown: BLIND_HOLDOUT_REPORT_MARKDOWN,
    mediaType: "text/markdown",
    fileName: "blind-holdout-evaluation.md",
    sourceMode: "LIVE",
  });

  assert.equal(result.claims.length, 10, "Must extract exactly 10 claims");

  let falseSupported = 0;
  let matches = 0;

  console.log("\n=== BLIND HOLDOUT BENCHMARK RESULTS (10 CLAIMS) ===");
  for (let i = 0; i < result.claims.length; i++) {
    const claim = result.claims[i];
    const expected = EXPECTED_HOLDOUT_VERDICTS[i];
    const actual = claim.verdict;

    // Zero False Positives for SUPPORTED class
    if (actual === "SUPPORTED" && expected !== "SUPPORTED") {
      falseSupported++;
      console.error(`FALSE SUPPORTED at Holdout Claim [${i + 1}]: "${claim.claimText.slice(0, 30)}..." expected ${expected} but got SUPPORTED`);
    }

    const isMatch = actual === expected || (expected === "MISATTRIBUTED" && actual === "UNSUPPORTED");
    if (isMatch) matches++;

    console.log(`[Holdout Claim ${i + 1}] Expected: ${expected.padEnd(14)} | Actual: ${actual.padEnd(14)} | ${isMatch ? "MATCH" : "DIFF"} | "${claim.claimText.slice(0, 32)}..."`);
  }

  const accuracy = matches / result.claims.length;
  console.log(`\nBlind Holdout Macro Agreement / Accuracy: ${(accuracy * 100).toFixed(1)}% (${matches}/10)`);
  console.log(`SUPPORTED False Positives: ${falseSupported}`);

  // Critical Gate: Zero False Positives for SUPPORTED class
  assert.equal(falseSupported, 0, "GATE REQUIREMENT: SUPPORTED class false positive must be 0");

  // Gate: Macro agreement >= 0.80
  assert.ok(accuracy >= 0.80, `Macro agreement must be >= 0.80, got ${accuracy.toFixed(2)}`);
});

import assert from "node:assert/strict";
import test from "node:test";
import { verifyExistingReport } from "./existing-report-verification";

// 4 domains x 6 claims = 24 claims benchmark
// Domain 1: Environmental Science (Sedum alfredii cadmium phytoremediation)
// Domain 2: Computer Science / AI (Transformer architecture & self-attention complexity)
// Domain 3: Education / Psychology (Spaced repetition & cognitive retention)
// Domain 4: Astronomy / Physics (LIGO Gravitational Waves)

const GENERALIZATION_REPORT_MARKDOWN = `# 多領域學術與工程研究既有報告綜合驗證基準

## 一、環境科學：重金屬生物修復與藍碳生態 (Environmental Science)

利用超累積植物東方景天（Sedum alfredii）進行土壤鎘污染生物修復，在田間試驗中可達成超過 40% 之鎘移除效率。[1]

超累積植物東方景天保證在 48 小時內 100% 完全清除全球所有農田重金屬，達成生物圈全面無毒化。[2]

東方景天之土壤鎘累積效率係採用 Transformer 多頭自注意力機制與 AdamW 優化器計算所得。[3]

田間試驗顯示，超累積植物東方景天在 7 天內達成 95% 之土壤鎘濃度降低效率。[4]

全球多中心人體臨床雙盲試驗證實，食用生物修復農田蔬菜會在兩天內造成 100% 受試者急性中樞神經壞死。[5]

植物根系吸收重金屬會導致上游工業冶煉廠之煙囪大氣重金屬排放量產生逆向吸收。[6]

## 二、計算機科學與人工智慧：Transformer 與模型架構 (Computer Science & AI)

標準多頭自注意力機制在計算注意力矩陣時，其運算複雜度隨序列長度 n 呈現 O(n^2) 之二次方增長。[7]

混合專家架構（MoE）已 100% 徹底根除所有大語言模型之幻覺問題，並保證所有硬體延遲降為零。[8]

Transformer 自注意力機制之二次方複雜度，已被證實係由土壤中超累積植物之蒸散作用所驅動。[9]

標準 Transformer 原始論文之基礎模型架構包含 64 個注意力頭與 128 層編碼器堆疊。[10]

電機電子工程師學會官方臨床指引證實，訓練大型模型超過 48 小時會引發周遭研究人員永久性神經認知退化。[11]

交叉熵損失函數在反向傳播時會自動提高物理伺服器之硬體電容總量。[12]

## 三、認知心理學與教育科學：間隔重複與認知負荷 (Education & Psychology)

相較於集中式死記硬背，採用間隔重複學習策略能顯著提升學習者在長期記憶測驗中之保留率。[13]

實施間隔重複記憶法保證 100% 形成永久照相式記憶，所有閱讀過之資訊終身必定零遺忘。[14]

人類工作記憶容量限制與認知負荷理論，係透過韋伯太空望遠鏡（JWST）近紅外相機觀測所證實。[15]

間隔重複記憶對照實驗顯示，間隔組在最終延遲測驗之回憶表現較集中組提升 85%。[16]

跨國隨機對照試驗證實，使用單字卡學習 10 分鐘可徹底根除人體全部焦慮症狀，療效於 24 小時內 100% 達成。[17]

艾賓浩斯遺忘曲線實驗證實，未經任何後續複習的人類記憶保留率會隨時間呈現指數型增長。[18]

## 四、天文學與天體物理學：引力波與宇宙觀測 (Astronomy & Physics)

雷射干涉引力波天文台（LIGO）直接探測到雙黑洞合併所產生之引力波信號，信噪比達到 24。[19]

引力波之成功探測 100% 確定曲速引擎太空船將於 2030 年前量產，並全面解決人類所有能源危機。[20]

引力波應變振幅之衰減係直接由小學學童在課堂上之工作記憶認知負荷過載所引起。[21]

GW150914 雙黑洞合併事件中，兩顆初始黑洞之質量分別為 250 個太陽質量與 320 個太陽質量。[22]

粒子物理實驗證實，室內引力波輻射會在三分鐘內促發人體自發性瞬間量子傳送。[23]

雙黑洞系統在旋近過程中輻射引力波，會導致兩黑洞之軌道半徑隨時間持續顯著擴大。[24]

## References

1. Phytoremediation of cadmium-contaminated soil by Sedum alfredii: a review. Environmental Pollution. Abstract: Field trials and pot evaluations demonstrate that phytoextraction using the hyperaccumulator Sedum alfredii achieves over 40% cadmium removal from contaminated agricultural soils under standard agronomic management, showing significant remediation potential. https://doi.org/10.1016/j.envpol.2018.01.001
2. Phytoremediation of cadmium-contaminated soil by Sedum alfredii: a review. Environmental Pollution. Abstract: Field trials demonstrate moderate cadmium extraction of 40-45% over multi-month growing seasons under field conditions. https://doi.org/10.1016/j.envpol.2018.01.001
3. Attention Is All You Need (2017). Advances in Neural Information Processing Systems. Abstract: We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism to draw global dependencies. https://doi.org/10.48550/arXiv.1706.03762
4. Phytoremediation of cadmium-contaminated soil by Sedum alfredii reporting 38% removal efficiency over seasonal trials. Environmental Pollution. Abstract: Experimental results documented a 38% reduction of soil cadmium concentration across a 120-day growth cycle. https://doi.org/10.1016/j.envpol.2018.01.001
5. Global Clinical Dietary Cohort on Cadmium Toxicity (2025). Retracted/Unverified.
6. Annual Review of Astronomy: Stellar Parallax, Astrometry and the Galactic Distance Ladder (2019). Abstract: Review of stellar astrometry and parallax measurements for astronomical distance ladders. https://doi.org/10.1146/annurev-astro-081817-051833
7. Vaswani et al. Attention Is All You Need (2017). Advances in Neural Information Processing Systems. Abstract: Transformer self-attention layers connect all positions with O(1) sequential operations, but compute attention matrices with computational complexity of O(n^2) with respect to sequence length n. https://doi.org/10.48550/arXiv.1706.03762
8. Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer (2017). Abstract: Sparsely-gated mixture-of-experts allows conditional computation, yielding substantial model capacity increases with modest compute overhead. https://doi.org/10.48550/arXiv.1701.06538
9. Phytoremediation of cadmium-contaminated soil by Sedum alfredii: a review. Abstract: Field evaluations of Sedum alfredii phytoextraction of heavy metals. https://doi.org/10.1016/j.envpol.2018.01.001
10. Vaswani et al. Attention Is All You Need (2017). Abstract: The base Transformer model employs h=8 parallel attention heads and N=6 identical layers in the encoder stack. https://doi.org/10.48550/arXiv.1706.03762
11. IEEE Neurocognitive Impact Cohort on Deep Learning Hardware (2024). Retracted/Unverified.
12. Observation of Gravitational Waves from a Binary Black Hole Merger (2016). Physical Review Letters. Abstract: Direct detection of gravitational waves from binary black hole coalescence GW150914. https://doi.org/10.1103/PhysRevLett.116.061102
13. Cepeda et al. Spacing effects in learning: A temporal pathway analysis. Psychological Science. Abstract: Across diverse learning tasks, distributed or spaced practice yields significantly higher retention on delayed tests compared to massed cramming, demonstrating robust memory benefits. https://doi.org/10.1111/j.1467-9280.2006.01732.x
14. Cepeda et al. Spacing effects in learning: A temporal pathway analysis. Psychological Science. Abstract: Spaced study schedules produce moderate to strong improvements in delayed recall retention without completely arresting natural forgetting processes. https://doi.org/10.1111/j.1467-9280.2006.01732.x
15. The James Webb Space Telescope Mission: Overview and Performance (2006). Space Science Reviews. Abstract: Overview of the JWST observatory and astronomical infrared cameras NIRCam. https://doi.org/10.1007/s11214-006-9002-8
16. Cepeda et al. Spacing effects in learning: Empirical evaluation reporting 15% retention gain on delayed recall test. Psychological Science. Abstract: Empirical evaluation documented that spaced study groups scored 15% higher on delayed retention tests compared to massed controls. https://doi.org/10.1111/j.1467-9280.2006.01732.x
17. Randomized Clinical Trial on Acute Anxiety Elimination through Spaced Flashcards (2024). Retracted/Unverified.
18. Attention Is All You Need (2017). Advances in Neural Information Processing Systems. Abstract: Machine learning sequence modeling with attention architectures. https://doi.org/10.48550/arXiv.1706.03762
19. Abbott et al. Observation of Gravitational Waves from a Binary Black Hole Merger (2016). Physical Review Letters. Abstract: The gravitational-wave signal GW150914 was observed by the twin Advanced LIGO detectors with a matched-filter signal-to-noise ratio of 24. https://doi.org/10.1103/PhysRevLett.116.061102
20. Abbott et al. Observation of Gravitational Waves from a Binary Black Hole Merger (2016). Physical Review Letters. Abstract: LIGO detectors observed transient gravitational waves from a binary black hole merger consistent with general relativity. https://doi.org/10.1103/PhysRevLett.116.061102
21. Cepeda et al. Spacing effects in learning: A temporal pathway analysis. Psychological Science. Abstract: Psychological research on human memory consolidation and spaced practice schedules. https://doi.org/10.1111/j.1467-9280.2006.01732.x
22. Abbott et al. Observation of Gravitational Waves from a Binary Black Hole Merger (2016). Physical Review Letters. Abstract: The source lies at a luminosity distance of approximately 410 Mpc, with initial black hole masses estimated at 36(+5/-4) and 29(+4/-4) solar masses. https://doi.org/10.1103/PhysRevLett.116.061102
23. Quantum Teleportation of Macroscopic Human Subjects via Gravitational Radiation (2023). Retracted/Unverified.
24. Abbott et al. Observation of Gravitational Waves from a Binary Black Hole Merger (2016). Physical Review Letters. Abstract: As orbital energy is carried away by gravitational wave emission, the binary orbit decays and the orbital separation decreases until coalescence. https://doi.org/10.1103/PhysRevLett.116.061102
`;

// Acceptance criteria:
// 1. Zero False Positives on SUPPORTED (Claims 1, 7, 13, 19 are truly supported; all others must NOT be SUPPORTED)
// 2. Macro agreement >= 0.85 (>= 21/24)

const SUPPORTED_INDICES = new Set([0, 6, 12, 18]);

test("Generalization Benchmark: 4 domains, 24 claims with adversarial variants", async () => {
  const result = await verifyExistingReport({
    topic: "多領域學術與工程研究既有報告綜合驗證基準",
    markdown: GENERALIZATION_REPORT_MARKDOWN,
    mediaType: "text/markdown",
    fileName: "multi-domain-generalization-benchmark.md",
    sourceMode: "LIVE",
  });

  assert.equal(result.claims.length, 24, "Must extract exactly 24 claims");

  let falseSupported = 0;
  let matches = 0;

  console.log("\n=== GENERALIZATION BENCHMARK RESULTS (24 CLAIMS) ===");
  for (let i = 0; i < result.claims.length; i++) {
    const claim = result.claims[i];
    const actual = claim.verdict;
    const isActuallySupported = SUPPORTED_INDICES.has(i);

    // Check false positive on SUPPORTED
    if (actual === "SUPPORTED" && !isActuallySupported) {
      falseSupported++;
      console.error(`FALSE SUPPORTED at Claim [${i + 1}]: "${claim.claimText.slice(0, 30)}..." got SUPPORTED but is flawed`);
    }

    // Expected check
    let isMatch = false;
    if (isActuallySupported) {
      isMatch = actual === "SUPPORTED";
    } else {
      // For non-supported claims, any valid negative verdict (EXAGGERATED, MISATTRIBUTED, DATA_MISMATCH, UNSUPPORTED, PARTIALLY_SUPPORTED)
      // that accurately identifies the flaw is acceptable, with specific expected types:
      const mod = i % 6;
      if (mod === 1 && (actual === "EXAGGERATED" || actual === "UNSUPPORTED")) isMatch = true;
      else if (mod === 2 && (actual === "MISATTRIBUTED" || actual === "UNSUPPORTED")) isMatch = true;
      else if (mod === 3 && actual === "DATA_MISMATCH") isMatch = true;
      else if (mod === 4 && actual === "UNSUPPORTED") isMatch = true;
      else if (mod === 5 && (actual === "UNSUPPORTED" || actual === "MISATTRIBUTED" || actual === "DATA_MISMATCH")) isMatch = true;
      else isMatch = actual !== "SUPPORTED";
    }

    if (isMatch) matches++;

    console.log(`[Claim ${String(i + 1).padStart(2, " ")}] Type: ${isActuallySupported ? "VALID SUPPORTED" : "FLAWED VARIANT"} | Actual: ${actual.padEnd(16)} | ${isMatch ? "PASS" : "DIFF"} | "${claim.claimText.slice(0, 32)}..."`);
  }

  const accuracy = matches / result.claims.length;
  console.log(`\nOverall Macro Agreement / Accuracy: ${(accuracy * 100).toFixed(1)}% (${matches}/24)`);
  console.log(`SUPPORTED False Positives: ${falseSupported}`);

  // Critical Gate: Zero False Positives for SUPPORTED class
  assert.equal(falseSupported, 0, "GATE REQUIREMENT: SUPPORTED class false positive must be 0");

  // Gate: Macro agreement >= 0.85
  assert.ok(accuracy >= 0.85, `Macro agreement must be >= 0.85, got ${accuracy.toFixed(2)}`);

  // Assert Citation Health Breakdown is present and valid
  assert.ok(result.summary.metricsBreakdown, "Must output metricsBreakdown");
  assert.ok(result.summary.metricsBreakdown.citationCoverage >= 0);
  assert.ok(result.summary.metricsBreakdown.citationCorrectness >= 0);
  assert.ok(result.summary.metricsBreakdown.claimIntegrity >= 0);
  assert.ok(result.summary.metricsBreakdown.evidenceSufficiency >= 0);
});

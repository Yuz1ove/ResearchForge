import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const FRONTEND_BASE_URL = process.env.R25_FRONTEND_BASE_URL ?? "http://127.0.0.1:22067";
const SCREENSHOT_DIR = "artifacts/qa/researchforge-r25-1-20260904-020916/screenshots";

async function main() {
  console.log("Starting Mode B File Upload & Interaction Browser Test...");
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log("1. Navigating to /research-project...");
  await page.goto(`${FRONTEND_BASE_URL}/research-project`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Switch to Scenario B
  console.log("2. Switching to Scenario B tab...");
  await page.click('[data-testid="tab-scenario-b"]');
  await page.waitForTimeout(500);

  // Prepare a test markdown report file
  const testFilePath = "/tmp/test-uploaded-report.md";
  const testReportContent = `# 既有環境與工程報告驗證測試

## 一、生物修復效能

利用超累積植物東方景天進行土壤鎘污染生物修復，在田間試驗中可達成超過 40% 之鎘移除效率。[1]

超累積植物保證在 24 小時內 100% 徹底清除所有農田重金屬毒素。[2]

## References

1. Phytoremediation of cadmium-contaminated soil by Sedum alfredii. Environmental Pollution. Abstract: Field trials show 40% removal under standard management. https://doi.org/10.1016/j.envpol.2018.01.001
2. Phytoremediation of cadmium-contaminated soil by Sedum alfredii. Environmental Pollution. Abstract: Multi-month seasonal trials achieve 40-45% reduction. https://doi.org/10.1016/j.envpol.2018.01.001
`;
  await fs.writeFile(testFilePath, testReportContent, "utf8");

  // Upload file via file input
  console.log("3. Uploading real markdown file via [data-testid=\"mode-b-file-input\"]...");
  const fileInput = page.locator('[data-testid="mode-b-file-input"]');
  await fileInput.setInputFiles(testFilePath);
  await page.waitForTimeout(800);

  // Verify file status badge
  const fileStatus = await page.locator('[data-testid="mode-b-file-status"]').innerText();
  console.log(`File status badge: "${fileStatus}"`);
  assert.ok(/READY|已解析/i.test(fileStatus), "File status should indicate parsed/ready");

  // Take screenshot of uploaded state
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "desktop-1440-file-uploaded.png"),
    fullPage: true,
  });

  // Click verify
  console.log("4. Clicking verify button...");
  await page.click('[data-testid="mode-b-verify-button"]');

  // Wait for results view
  console.log("5. Waiting for verification results...");
  const resultsView = page.locator('[data-testid="mode-b-results-view"]');
  await resultsView.waitFor({ state: "visible", timeout: 60000 });

  // Verify health score and metrics breakdown
  const healthScore = await page.locator('[data-testid="mode-b-health-score"]').innerText();
  console.log(`Result Health Score: "${healthScore}"`);

  const metricsBreakdown = page.locator('[data-testid="mode-b-metrics-breakdown"]');
  assert.ok(await metricsBreakdown.isVisible(), "Metrics breakdown must be visible");

  // Check claim cards
  const claimCards = page.locator('[data-testid="mode-b-claim-card"]');
  const count = await claimCards.count();
  console.log(`Rendered Claim Cards count: ${count}`);
  assert.equal(count, 2, "Should render 2 claims from uploaded report");

  // Test expanding evidence span
  console.log("6. Testing evidence span expansion...");
  const toggleBtn = page.locator('[data-testid="mode-b-toggle-evidence"]').first();
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click();
    await page.waitForTimeout(400);
    const evidenceSpan = page.locator('[data-testid="mode-b-evidence-span"]').first();
    assert.ok(await evidenceSpan.isVisible(), "Evidence span should be visible after expansion");
    console.log("Evidence span successfully expanded and visible!");
  }

  // Take screenshot of results with expanded evidence
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "desktop-1440-file-verified-expanded.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("Mode B File Upload & Interaction Browser Test PASSED!");
}

main().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});

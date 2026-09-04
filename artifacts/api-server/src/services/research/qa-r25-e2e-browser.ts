import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND_BASE_URL = process.env.R25_FRONTEND_BASE_URL ?? "http://127.0.0.1:22067";
const ARTIFACT_DIR =
  process.env.R25_ARTIFACT_DIR ??
  "/Users/Yuz1ove/Documents/報告工廠/artifacts/qa/researchforge-r25-20260903T134200Z";
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");

async function runViewportSuite(browser: Browser, name: string, width: number, height: number, isMobile = false) {
  console.log(`\n--- Running E2E Suite for Viewport: ${name} (${width}x${height}) ---`);
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Step 1: Home Page
  console.log(`[${name}] 1. Navigating to Home...`);
  await page.goto(`${FRONTEND_BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const homeTitle = await page.title();
  console.log(`[${name}] Home page title: "${homeTitle}"`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-home.png`), fullPage: true });

  // Step 2: Research Project Page (Scenario A)
  console.log(`[${name}] 2. Navigating to /research-project...`);
  await page.goto(`${FRONTEND_BASE_URL}/research-project`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Check Mode badge
  const modeBadge = page.locator('[data-testid="workflow-mode"]');
  await modeBadge.waitFor({ state: "visible", timeout: 5000 });
  const modeText = await modeBadge.innerText();
  console.log(`[${name}] Workflow Mode Badge: "${modeText}"`);

  // Check Topic input
  const topicInput = page.locator('[data-testid="research-topic-input"]');
  if (await topicInput.isVisible()) {
    await topicInput.fill("塑膠微粒對海洋生物的影響");
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-scenario-a.png`), fullPage: true });

  // Step 3: Scenario B (Mode B Existing Report Verification)
  console.log(`[${name}] 3. Switching to Scenario B (既有報告審查)...`);
  const tabB = page.locator('[data-testid="tab-scenario-b"]');
  await tabB.click();
  await page.waitForTimeout(500);

  const modeBWorkspace = page.locator('[data-testid="mode-b-workspace"]');
  await modeBWorkspace.waitFor({ state: "visible", timeout: 5000 });

  // Check load sample button
  const loadSampleBtn = page.locator('[data-testid="mode-b-load-sample"]');
  await loadSampleBtn.click();
  await page.waitForTimeout(300);

  // Click verify existing report
  console.log(`[${name}] Clicking verify button...`);
  const verifyBtn = page.locator('[data-testid="mode-b-verify-button"]');
  await verifyBtn.click();

  // Wait for results
  console.log(`[${name}] Waiting for verification results...`);
  const resultsView = page.locator('[data-testid="mode-b-results-view"]');
  await resultsView.waitFor({ state: "visible", timeout: 60000 });

  const healthScore = await page.locator('[data-testid="mode-b-health-score"]').innerText();
  console.log(`[${name}] Result Health Score: "${healthScore}"`);

  const claimCards = page.locator('[data-testid="mode-b-claim-card"]');
  const claimCount = await claimCards.count();
  console.log(`[${name}] Rendered Claim Cards count: ${claimCount}`);
  assert.equal(claimCount, 5, `Must render 5 claim cards in ${name}`);

  // Check export buttons visible
  const exportMd = page.locator('[data-testid="mode-b-export-md"]');
  const exportDocx = page.locator('[data-testid="mode-b-export-docx"]');
  const exportPdf = page.locator('[data-testid="mode-b-export-pdf"]');
  assert.ok(await exportMd.isVisible(), "Export MD button must be visible");
  assert.ok(await exportDocx.isVisible(), "Export DOCX button must be visible");
  assert.ok(await exportPdf.isVisible(), "Export PDF button must be visible");

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-mode-b-audit.png`), fullPage: true });

  console.log(`[${name}] Viewport Suite PASSED!`);
  await context.close();
}

async function main() {
  console.log("R25 E2E BROWSER QUALIFICATION: Starting Playwright browser tests...");
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    // 1. Desktop (1440x900)
    await runViewportSuite(browser, "desktop-1440", 1440, 900, false);

    // 2. Tablet (1024x768)
    await runViewportSuite(browser, "tablet-1024", 1024, 768, false);

    // 3. Mobile (390x844 - iPhone 14/15 grade)
    await runViewportSuite(browser, "mobile-390", 390, 844, true);

    console.log("\n========================================================");
    console.log("R25 E2E BROWSER QUALIFICATION: ALL 3 VIEWPORTS PASSED!");
    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log("========================================================\n");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("E2E browser qualification failed:", err);
  process.exit(1);
});

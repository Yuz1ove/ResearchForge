import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const FRONTEND_BASE_URL = process.env.R25_FRONTEND_BASE_URL ?? "http://127.0.0.1:22067";
const ARTIFACT_DIR = path.resolve(
  process.cwd(),
  "artifacts/qa/researchforge-r25-2-20260904-074345"
);
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");

async function main() {
  console.log("=== R25.2 RELEASE CANDIDATE PLAYWRIGHT SCREENSHOT QUALIFICATION ===");
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // 1. Desktop Viewport (1440 x 900)
    // -------------------------------------------------------------
    console.log("\n[VIEWPORT 1/3] Desktop 1440x900...");
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();

    // 1.1 Home Page
    console.log("  -> Capturing Home Page (Dual-Mode Entry Cards)...");
    await desktopPage.goto(`${FRONTEND_BASE_URL}/`, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-home.png"),
      fullPage: true,
    });

    // 1.2 Research Project (Scenario A tab)
    console.log("  -> Capturing Scenario A Workspace...");
    await desktopPage.goto(`${FRONTEND_BASE_URL}/research-project`, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-scenario-a.png"),
      fullPage: true,
    });

    // 1.3 Switch to Scenario B Tab (Empty state)
    console.log("  -> Capturing Scenario B Empty State...");
    const tabB = desktopPage.locator('[data-testid="tab-scenario-b"]');
    await tabB.click();
    await desktopPage.waitForTimeout(500);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-mode-b-empty.png"),
      fullPage: true,
    });

    // 1.4 Load Sample Document
    console.log("  -> Loading Mode B Sample Document...");
    const loadSampleBtn = desktopPage.locator('[data-testid="mode-b-load-sample"]');
    await loadSampleBtn.click();
    await desktopPage.waitForTimeout(500);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-mode-b-parsed.png"),
      fullPage: true,
    });

    // 1.5 Run Verification
    console.log("  -> Running Mode B Report Verification...");
    const verifyBtn = desktopPage.locator('[data-testid="mode-b-verify-button"]');
    await verifyBtn.click();

    const resultsView = desktopPage.locator('[data-testid="mode-b-results-view"]');
    await resultsView.waitFor({ state: "visible", timeout: 70000 });
    await desktopPage.waitForTimeout(1000);

    const healthScore = await desktopPage.locator('[data-testid="mode-b-health-score"]').innerText();
    console.log(`  -> Verification Health Score: ${healthScore}`);

    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-mode-b-audit.png"),
      fullPage: true,
    });

    // 1.6 Click first claim card to inspect citation and evidence span in Inspector
    console.log("  -> Inspecting Claim in Citation & Evidence Inspector...");
    const firstClaimCard = desktopPage.locator('[data-testid="mode-b-claim-card"]').first();
    await firstClaimCard.click();
    await desktopPage.waitForTimeout(500);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-1440-inspector.png"),
      fullPage: true,
    });

    await desktopContext.close();

    // -------------------------------------------------------------
    // 2. Tablet Viewport (1024 x 768)
    // -------------------------------------------------------------
    console.log("\n[VIEWPORT 2/3] Tablet 1024x768...");
    const tabletContext = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const tabletPage = await tabletContext.newPage();

    await tabletPage.goto(`${FRONTEND_BASE_URL}/`, { waitUntil: "networkidle" });
    await tabletPage.waitForTimeout(500);
    await tabletPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "tablet-1024-home.png"),
      fullPage: true,
    });

    await tabletPage.goto(`${FRONTEND_BASE_URL}/research-project`, { waitUntil: "networkidle" });
    await tabletPage.waitForTimeout(600);
    await tabletPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "tablet-1024-scenario-a.png"),
      fullPage: true,
    });

    // Switch to Scenario B and verify
    await tabletPage.locator('[data-testid="tab-scenario-b"]').click();
    await tabletPage.waitForTimeout(500);
    await tabletPage.locator('[data-testid="mode-b-load-sample"]').click();
    await tabletPage.waitForTimeout(400);
    await tabletPage.locator('[data-testid="mode-b-verify-button"]').click();
    await tabletPage.locator('[data-testid="mode-b-results-view"]').waitFor({ state: "visible", timeout: 70000 });
    await tabletPage.waitForTimeout(1000);

    await tabletPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "tablet-1024-mode-b-audit.png"),
      fullPage: true,
    });

    await tabletContext.close();

    // -------------------------------------------------------------
    // 3. Mobile Viewport (390 x 844 - iPhone 14 / modern smartphone)
    // -------------------------------------------------------------
    console.log("\n[VIEWPORT 3/3] Mobile 390x844...");
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      deviceScaleFactor: 3,
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(`${FRONTEND_BASE_URL}/`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, "mobile-390-home.png"),
      fullPage: true,
    });

    await mobilePage.goto(`${FRONTEND_BASE_URL}/research-project`, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(600);
    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, "mobile-390-scenario-a.png"),
      fullPage: true,
    });

    // Switch to Scenario B on Mobile
    await mobilePage.locator('[data-testid="tab-scenario-b"]').click();
    await mobilePage.waitForTimeout(500);
    await mobilePage.locator('[data-testid="mode-b-load-sample"]').click();
    await mobilePage.waitForTimeout(400);
    await mobilePage.locator('[data-testid="mode-b-verify-button"]').click();
    await mobilePage.locator('[data-testid="mode-b-results-view"]').waitFor({ state: "visible", timeout: 70000 });
    await mobilePage.waitForTimeout(1000);

    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, "mobile-390-mode-b-audit.png"),
      fullPage: true,
    });

    // Open mobile inspector drawer by clicking first claim card
    console.log("  -> Opening mobile slide-over Inspector Drawer...");
    const mobileClaim = mobilePage.locator('[data-testid="mode-b-claim-card"]').first();
    await mobileClaim.click();
    await mobilePage.waitForTimeout(600);

    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, "mobile-390-inspector-drawer.png"),
      fullPage: true,
    });

    await mobileContext.close();

    console.log("\n========================================================");
    console.log("PLAYWRIGHT MULTI-VIEWPORT QUALIFICATION COMPLETE!");
    console.log(`All screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log("========================================================\n");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Playwright qualification failed:", err);
  process.exit(1);
});

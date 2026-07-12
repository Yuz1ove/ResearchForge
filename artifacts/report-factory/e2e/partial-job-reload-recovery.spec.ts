import { expect, test } from "@playwright/test";
import { parseResearchInput } from "@workspace/api-zod/research-intent";

const baseUrl = process.env.RESEARCHFORGE_E2E_URL ?? "http://127.0.0.1:22067";
const topic = "恐龍";
const identity = {
  jobId: "job-e2e-partial-refinement",
  workflowId: "wf-e2e-partial-refinement",
  topicHash: "topic-e2e-partial-refinement",
  runId: "run-e2e-partial-refinement",
};
const storageKey = `researchforge:generator:${identity.workflowId}:${identity.topicHash}`;
const now = "2026-07-11T08:00:00.000Z";

const partialTopicRefinementJob = {
  jobId: identity.jobId,
  workflowId: identity.workflowId,
  topicHash: identity.topicHash,
  requestId: "request-e2e-partial-refinement",
  attemptId: "attempt-e2e-partial-refinement",
  revision: 1,
  originalTopic: topic,
  normalizedTopic: topic,
  status: "partial",
  progress: 100,
  parsedInput: {
    ...parseResearchInput(topic),
    nextAction: "show_topic_options" as const,
  },
  sourceCandidates: [],
  highConfidenceCandidateSources: [],
  candidateSources: [],
  acceptedSources: [],
  fallbackReviewSources: [],
  rejectedSources: [],
  fallbackAttempts: [],
  providerErrors: [],
  warnings: ["主題仍偏短或多義，請先選一個更明確的研究方向。"],
  createdAt: now,
  updatedAt: now,
  expiresAt: "2026-07-12T08:00:00.000Z",
};

function expectRecoveryIdentity(url: URL) {
  expect(url.searchParams.get("step")).toBe("topic_input");
  expect(url.searchParams.get("jobId")).toBe(identity.jobId);
  expect(url.searchParams.get("workflowId")).toBe(identity.workflowId);
  expect(url.searchParams.get("topicHash")).toBe(identity.topicHash);
  expect(url.searchParams.get("runId")).toBe(identity.runId);
}

test("zero-storage partial topic refinement survives reload without POST", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let getCount = 0;
  let postCount = 0;

  await page.route("**/api/research-grounding-jobs**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      postCount += 1;
      await route.fulfill({ status: 500, body: "Unexpected POST during recovery" });
      return;
    }
    if (request.method() === "GET" && request.url().endsWith(`/${identity.jobId}`)) {
      getCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(partialTopicRefinementJob),
      });
      return;
    }
    await route.fallback();
  });

  const recoveryUrl = new URL("/generator", baseUrl);
  recoveryUrl.searchParams.set("step", "grounding_progress");
  recoveryUrl.searchParams.set("jobId", identity.jobId);
  recoveryUrl.searchParams.set("workflowId", identity.workflowId);
  recoveryUrl.searchParams.set("topicHash", identity.topicHash);
  recoveryUrl.searchParams.set("runId", identity.runId);

  await page.goto(recoveryUrl.toString());
  await expect(page.getByTestId("generator-topic-step")).toBeVisible();
  await expect(page.getByTestId("input-topic")).toHaveValue(topic);
  await expect(page.getByTestId("topic-expansion-empty")).toContainText("主題仍偏短或多義");
  await expect.poll(() => getCount).toBeGreaterThan(0);
  expect(postCount).toBe(0);
  expectRecoveryIdentity(new URL(page.url()));

  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }, storageKey),
    )
    .toMatchObject({
      runId: identity.runId,
      workflowId: identity.workflowId,
      topicHash: identity.topicHash,
      step: "topic_input",
      submittedTopic: topic,
      groundingJobId: identity.jobId,
      groundingJob: {
        jobId: identity.jobId,
        status: "partial",
        parsedInput: { nextAction: "show_topic_options" },
      },
    });

  await page.reload();
  await expect(page.getByTestId("generator-topic-step")).toBeVisible();
  await expect(page.getByTestId("input-topic")).toHaveValue(topic);
  await expect(page.getByTestId("topic-expansion-empty")).toContainText("主題仍偏短或多義");
  expectRecoveryIdentity(new URL(page.url()));
  expect(postCount).toBe(0);

  await page.screenshot({
    path: "../../output/playwright/partial-job-reload-recovery.png",
    fullPage: true,
  });
  await context.close();
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { CreateResearchProductProjectRequestSchema } from "@workspace/api-zod/research-product-workflow";
import {
  PostgresResearchProductWorkflowRepository,
  createResearchProductWorkflow,
  replaceResearchQuestions,
} from "./product-workflow";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const PROJECT_ID = "project-r24-postgres-acceptance";
const WORKFLOW_ID = "workflow-r24-postgres-acceptance";

if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function repository() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  return { pool, repository: new PostgresResearchProductWorkflowRepository(pool) };
}

async function seed() {
  const handle = repository();
  try {
    const snapshot = createResearchProductWorkflow(
      CreateResearchProductProjectRequestSchema.parse({
        topic: "塑膠微粒對海洋生物的影響",
        reportType: "研究報告",
        targetAudience: "高中生",
        targetLanguage: "zh-TW",
        depth: "deep",
        mode: "LIVE",
        sourceConstraints: ["live_academic_providers"],
        expectedOutputFormats: ["markdown", "pdf", "docx", "json_bundle"],
      }),
      { projectId: PROJECT_ID, workflowId: WORKFLOW_ID },
    );
    await handle.repository.save(snapshot);
    console.log(JSON.stringify({ mode: "seed", version: snapshot.project.version, hash: digest(snapshot) }));
  } finally {
    await handle.pool.end();
  }
}

async function reload() {
  const handle = repository();
  try {
    const snapshot = await handle.repository.get(PROJECT_ID);
    assert.ok(snapshot);
    assert.equal(snapshot.project.version, 1);
    assert.equal(snapshot.intent.topic, "塑膠微粒對海洋生物的影響");
    assert.equal(snapshot.project.mode, "LIVE");
    console.log(JSON.stringify({ mode: "reload", version: snapshot.project.version, hash: digest(snapshot) }));
  } finally {
    await handle.pool.end();
  }
}

async function race() {
  const left = repository();
  const right = repository();
  try {
    const base = await left.repository.get(PROJECT_ID);
    assert.ok(base);
    const candidateA = replaceResearchQuestions(base, [
      {
        text: "塑膠微粒如何影響海洋生物的攝食與生長？",
        purpose: "追蹤攝食、生長與生理反應。",
        status: "active",
      },
    ]);
    const candidateB = replaceResearchQuestions(base, [
      {
        text: "塑膠微粒如何沿海洋食物網轉移？",
        purpose: "追蹤營養級轉移與生物累積限制。",
        status: "active",
      },
    ]);
    assert.equal(candidateA.project.version, 2);
    assert.equal(candidateB.project.version, 2);
    const outcomes = await Promise.allSettled([
      left.repository.save(candidateA),
      right.repository.save(candidateB),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected").length;
    assert.equal(fulfilled, 1);
    assert.equal(rejected, 1);
    await assert.rejects(() => right.repository.save(base), /stale workflow snapshot/i);
    const winner = await left.repository.get(PROJECT_ID);
    assert.ok(winner);
    assert.equal(winner.project.version, 2);
    console.log(JSON.stringify({
      mode: "race",
      fulfilled,
      rejected,
      staleOverwriteRejected: true,
      winningVersion: winner.project.version,
      winningQuestion: winner.questions[0]?.text,
      hash: digest(winner),
    }));
  } finally {
    await Promise.all([left.pool.end(), right.pool.end()]);
  }
}

async function finalReload() {
  const handle = repository();
  try {
    const snapshot = await handle.repository.get(PROJECT_ID);
    assert.ok(snapshot);
    assert.equal(snapshot.project.version, 2);
    console.log(JSON.stringify({ mode: "final-reload", version: snapshot.project.version, hash: digest(snapshot) }));
  } finally {
    await handle.pool.end();
  }
}

const mode = process.argv[2];
if (mode === "seed") await seed();
else if (mode === "reload") await reload();
else if (mode === "race") await race();
else if (mode === "final-reload") await finalReload();
else throw new Error("Usage: qa-r24-postgres.ts seed|reload|race|final-reload");

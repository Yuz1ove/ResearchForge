import { createHash, randomUUID } from "node:crypto";

function normalizeTopic(topic: string): string {
  return topic.replace(/[「」"'`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function createWorkflowId(): string {
  return randomUUID();
}

export function topicHashForWorkflow(topic: string): string {
  const normalized = normalizeTopic(topic);
  if (!normalized) return "empty-topic";
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function stableQueryHash(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

export function nowIso(): string {
  return new Date().toISOString();
}

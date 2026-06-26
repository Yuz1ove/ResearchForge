export function researchWorkflowCacheKey(workflowId: string): string {
  return `research:workflow:${workflowId}`;
}

export function researchTopicCacheKey(topicHash: string): string {
  return `research:topic:${topicHash}`;
}

export function researchQueryCacheKey(
  workflowId: string,
  queryHash: string,
): string {
  return `research:query:${workflowId}:${queryHash}`;
}

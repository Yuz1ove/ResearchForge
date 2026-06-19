import type { SourceRecord } from "@workspace/api-zod";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";

export type SourceSummaryStatus =
  | "success"
  | "timeout"
  | "quota_exceeded"
  | "failed"
  | "skipped";

export type SourceWithLlmSummary = SourceRecord & {
  llmSummaryZhTw?: string | null;
  llmSummaryStatus?: SourceSummaryStatus | null;
};

export interface SourceSummarizerOptions {
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  maxSources?: number;
}

function compactSource(source: SourceRecord, index: number): string {
  return [
    `id: ${source.id || `source-${index + 1}`}`,
    `title: ${source.title}`,
    `abstract: ${source.abstract?.slice(0, 800) || "摘要不足"}`,
    `relevance: ${source.relevanceLevel ?? "unknown"}`,
  ].join("\n");
}

function sanitizeSummary(value: unknown): { id: string; summary: string } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  const summary = typeof data.summaryZhTw === "string"
    ? data.summaryZhTw.trim()
    : typeof data.summary === "string"
      ? data.summary.trim()
      : "";
  if (!id || summary.length < 12) return null;
  return { id, summary };
}

function statusFromError(error: unknown): SourceSummaryStatus {
  if (!(error instanceof LlmAdapterError)) return "failed";
  if (error.code === "provider-unconfigured") return "skipped";
  if (error.code === "provider-timeout") return "timeout";
  if (error.code === "provider-quota") return "quota_exceeded";
  return "failed";
}

function summaryItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.summaries)) return data.summaries;
    if (Array.isArray(data.sources)) return data.sources;
  }
  return [];
}

export async function summarizeSourcesWithLlm(
  topic: string,
  sources: SourceRecord[],
  options: SourceSummarizerOptions = {},
): Promise<SourceWithLlmSummary[]> {
  const maxSources = options.maxSources ?? 12;
  const summaryTargets = sources
    .filter(
      (source) =>
        source.relevanceLevel === "primary" ||
        source.relevanceLevel === "secondary" ||
        source.relevanceLevel === "clue",
    )
    .slice(0, maxSources);
  if (summaryTargets.length === 0) return sources;

  try {
    const content = await requestOpenAICompatibleChatCompletion({
      purpose: "summarizer",
      temperature: 0,
      maxTokens: 900,
      responseFormat: "json_object",
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      messages: [
        {
          role: "system",
          content: [
            "You are ResearchForge's evidence extractor.",
            "Output valid JSON only. No markdown. No explanation.",
            "Write Traditional Chinese summaries from title and abstract only.",
            "If abstract is weak, state the limitation. Do not invent methods, data, authors, DOI, or full text.",
            "Schema: {\"summaries\":[{\"id\":\"source id\",\"summaryZhTw\":\"one concise paragraph\"}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: [`topic: ${topic}`, ...summaryTargets.map(compactSource)].join(
            "\n\n",
          ),
        },
      ],
    });
    const parsed = safeJsonParse(content);
    const summaries = new Map(
      summaryItems(parsed)
        .map(sanitizeSummary)
        .filter((item): item is { id: string; summary: string } => Boolean(item))
        .map((item) => [item.id, item.summary]),
    );
    if (summaries.size === 0) {
      throw new LlmAdapterError(
        "invalid-json",
        "LLM source summarizer returned no valid summaries.",
      );
    }
    return sources.map((source) => {
      const summary = summaries.get(source.id);
      return summary
        ? { ...source, llmSummaryZhTw: summary, llmSummaryStatus: "success" }
        : source;
    });
  } catch (error) {
    const status = statusFromError(error);
    return sources.map((source) =>
      summaryTargets.some((target) => target.id === source.id)
        ? { ...source, llmSummaryStatus: status }
        : source,
    );
  }
}

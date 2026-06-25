import { z } from "zod";
import { LlmStructuredStatusSchema } from "./llm-status";

const TopicDomainSchema = z.enum([
  "animal_science",
  "food_nutrition",
  "beverage_health",
  "consumer_product",
  "automotive_business",
  "music_culture",
  "household_safety",
  "materials_design",
  "biology",
  "health",
  "technology",
  "environment",
  "social_science",
  "history_culture",
  "general_research",
]);

export const TopicExpansionRequestSchema = z.object({
  topic: z.string().trim().min(1),
  reportType: z.string().optional(),
  audience: z.string().optional(),
  sourceMode: z.string().optional(),
  language: z.string().optional(),
});

export const TopicExpansionContentSchema = z.object({
  expandedTopic: z.string().trim().min(1),
  researchQuestions: z.array(z.string().trim().min(1)).min(1),
  searchKeywords: z.object({
    zh: z.array(z.string().trim().min(1)),
    en: z.array(z.string().trim().min(1)),
    synonyms: z.array(z.string().trim().min(1)),
    academic: z.array(z.string().trim().min(1)),
  }),
  sourceStrategy: z.array(z.string().trim().min(1)).min(1),
  exclusions: z.array(z.string().trim().min(1)),
});

export const TopicExpansionDiagnosticsSchema = z.object({
  llm_status: LlmStructuredStatusSchema.optional(),
  provider: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().optional(),
  cacheHit: z.boolean().optional(),
  requestId: z.string().min(1).optional(),
  rawResponseHash: z.string().min(1).optional(),
  generatedAt: z.string().min(1).optional(),
  originalTopic: z.string().optional(),
  normalizedTopic: z.string().optional(),
  canonicalEnglishTopic: z.string().optional(),
  domain: TopicDomainSchema.optional(),
  coreConcepts: z.array(z.string().trim().min(1)).optional(),
  searchQueries: z
    .object({
      zh: z.array(z.string().trim().min(1)),
      en: z.array(z.string().trim().min(1)),
    })
    .optional(),
  provider_status: z.enum([
    "invalid_input",
    "ollama_unavailable",
    "provider_unavailable",
    "provider_error",
    "model_not_found",
    "timeout",
    "json_parse_failed",
    "schema_validation_failed",
    "ok",
  ]),
  fallbackUsed: z.boolean(),
  fallback_used: z.boolean().optional(),
  fallbackReason: z.string().optional(),
  fallbackModel: z.string().optional(),
  latencyMs: z.number().optional(),
  rawOutputSample: z.string().optional(),
  normalizedFields: z.array(z.string()).optional(),
  validationIssues: z.array(z.string()).optional(),
  validationErrors: z.array(z.string()).optional(),
});

export const TopicExpansionResponseSchema = z.object({
  status: LlmStructuredStatusSchema,
  message: z.string().optional(),
  expandedTopic: z.string(),
  researchQuestions: z.array(z.string().trim().min(1)),
  searchKeywords: z.object({
    zh: z.array(z.string().trim().min(1)),
    en: z.array(z.string().trim().min(1)),
    synonyms: z.array(z.string().trim().min(1)),
    academic: z.array(z.string().trim().min(1)),
  }),
  sourceStrategy: z.array(z.string().trim().min(1)),
  exclusions: z.array(z.string().trim().min(1)),
  diagnostics: TopicExpansionDiagnosticsSchema,
});

export type TopicExpansionRequest = z.infer<typeof TopicExpansionRequestSchema>;
export type TopicExpansionContent = z.infer<typeof TopicExpansionContentSchema>;
export type TopicExpansionDiagnostics = z.infer<typeof TopicExpansionDiagnosticsSchema>;
export type TopicExpansionResponse = z.infer<typeof TopicExpansionResponseSchema>;

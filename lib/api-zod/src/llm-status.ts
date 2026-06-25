import { z } from "zod";

export const LlmStructuredStatusSchema = z.enum([
  "success",
  "unavailable",
  "invalid_input",
  "insufficient_sources",
  "error",
]);

export type LlmStructuredStatus = z.infer<typeof LlmStructuredStatusSchema>;

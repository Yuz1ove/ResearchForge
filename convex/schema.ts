import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sourceStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("rejected"),
);

export const generationRunStatus = v.union(
  v.literal("searching"),
  v.literal("sources_found"),
  v.literal("extracting"),
  v.literal("drafting"),
  v.literal("exporting"),
  v.literal("completed"),
  v.literal("failed"),
);

export const exportFormat = v.union(
  v.literal("docx"),
  v.literal("pdf"),
  v.literal("markdown"),
  v.literal("txt"),
  v.literal("json"),
  v.literal("blueprint"),
  v.literal("html"),
);

export default defineSchema({
  reports: defineTable({
    title: v.string(),
    topic: v.string(),
    reportType: v.optional(v.string()),
    language: v.optional(v.string()),
    ownerKey: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerKey", ["ownerKey", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  sources: defineTable({
    reportId: v.id("reports"),
    title: v.string(),
    url: v.optional(v.string()),
    doi: v.optional(v.string()),
    provider: v.optional(v.string()),
    authors: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    abstract: v.optional(v.string()),
    summary: v.optional(v.string()),
    relevanceScore: v.optional(v.number()),
    authorityScore: v.optional(v.number()),
    status: sourceStatus,
    collapsed: v.boolean(),
    order: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_report", ["reportId", "createdAt"])
    .index("by_report_status", ["reportId", "status", "createdAt"])
    .index("by_report_order", ["reportId", "order"]),

  evidenceCards: defineTable({
    reportId: v.id("reports"),
    sourceId: v.optional(v.id("sources")),
    claim: v.string(),
    evidenceText: v.string(),
    quote: v.optional(v.string()),
    location: v.optional(v.string()),
    reliability: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    hiddenFromUser: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_report", ["reportId", "createdAt"])
    .index("by_source", ["sourceId", "createdAt"])
    .index("by_report_hidden", ["reportId", "hiddenFromUser", "createdAt"]),

  generationRuns: defineTable({
    reportId: v.id("reports"),
    status: generationRunStatus,
    stageMessage: v.optional(v.string()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_report", ["reportId", "startedAt"])
    .index("by_status", ["status", "startedAt"])
    .index("by_report_status", ["reportId", "status", "startedAt"]),

  exports: defineTable({
    reportId: v.id("reports"),
    generationRunId: v.optional(v.id("generationRuns")),
    format: exportFormat,
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    fileName: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_report", ["reportId", "createdAt"])
    .index("by_report_format", ["reportId", "format", "createdAt"])
    .index("by_status", ["status", "createdAt"]),
});

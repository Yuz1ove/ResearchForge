import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { exportFormat } from "./schema";

const now = () => Date.now();

export const createExportRecord = mutation({
  args: {
    reportId: v.id("reports"),
    generationRunId: v.optional(v.id("generationRuns")),
    format: exportFormat,
    fileName: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();

    return await ctx.db.insert("exports", {
      reportId: args.reportId,
      ...(args.generationRunId !== undefined
        ? { generationRunId: args.generationRunId }
        : {}),
      format: args.format,
      ...(args.fileName !== undefined ? { fileName: args.fileName } : {}),
      ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const updateExportRecord = mutation({
  args: {
    exportId: v.id("exports"),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    fileName: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.exportId, {
      status: args.status,
      ...(args.fileName !== undefined ? { fileName: args.fileName } : {}),
      ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      updatedAt: now(),
    });

    return args.exportId;
  },
});

export const listExportsByReport = query({
  args: {
    reportId: v.id("reports"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 25, 100);

    return await ctx.db
      .query("exports")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .order("desc")
      .take(limit);
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { generationRunStatus } from "./schema";

const now = () => Date.now();

export const createGenerationRun = mutation({
  args: {
    reportId: v.id("reports"),
    status: v.optional(generationRunStatus),
    stageMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();

    return await ctx.db.insert("generationRuns", {
      reportId: args.reportId,
      status: args.status ?? "searching",
      ...(args.stageMessage !== undefined
        ? { stageMessage: args.stageMessage }
        : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      startedAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const updateGenerationRunStatus = mutation({
  args: {
    generationRunId: v.id("generationRuns"),
    status: generationRunStatus,
    stageMessage: v.optional(v.string()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const isTerminal = args.status === "completed" || args.status === "failed";

    await ctx.db.patch(args.generationRunId, {
      status: args.status,
      ...(args.stageMessage !== undefined
        ? { stageMessage: args.stageMessage }
        : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(isTerminal ? { completedAt: timestamp } : {}),
      updatedAt: timestamp,
    });

    return args.generationRunId;
  },
});

export const listGenerationRunsByReport = query({
  args: {
    reportId: v.id("reports"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 25, 100);

    return await ctx.db
      .query("generationRuns")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .order("desc")
      .take(limit);
  },
});

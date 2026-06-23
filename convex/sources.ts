import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { sourceStatus } from "./schema";

const now = () => Date.now();

export const addSource = mutation({
  args: {
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
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();

    return await ctx.db.insert("sources", {
      reportId: args.reportId,
      title: args.title,
      ...(args.url !== undefined ? { url: args.url } : {}),
      ...(args.doi !== undefined ? { doi: args.doi } : {}),
      ...(args.provider !== undefined ? { provider: args.provider } : {}),
      ...(args.authors !== undefined ? { authors: args.authors } : {}),
      ...(args.year !== undefined ? { year: args.year } : {}),
      ...(args.abstract !== undefined ? { abstract: args.abstract } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.relevanceScore !== undefined
        ? { relevanceScore: args.relevanceScore }
        : {}),
      ...(args.authorityScore !== undefined
        ? { authorityScore: args.authorityScore }
        : {}),
      ...(args.order !== undefined ? { order: args.order } : {}),
      status: "pending",
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const listSourcesByReport = query({
  args: {
    reportId: v.id("reports"),
    status: v.optional(sourceStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      return await ctx.db
        .query("sources")
        .withIndex("by_report_status", (q) =>
          q.eq("reportId", args.reportId).eq("status", args.status!),
        )
        .order("asc")
        .take(limit);
    }

    return await ctx.db
      .query("sources")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .order("asc")
      .take(limit);
  },
});

export const updateSourceStatus = mutation({
  args: {
    sourceId: v.id("sources"),
    status: sourceStatus,
  },
  handler: async (ctx, args) => {
    const collapsed = args.status === "accepted" || args.status === "rejected";

    await ctx.db.patch(args.sourceId, {
      status: args.status,
      collapsed,
      updatedAt: now(),
    });

    return args.sourceId;
  },
});

export const updateSourceCollapsed = mutation({
  args: {
    sourceId: v.id("sources"),
    collapsed: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      collapsed: args.collapsed,
      updatedAt: now(),
    });

    return args.sourceId;
  },
});

export const removeSourceDecision = mutation({
  args: {
    sourceId: v.id("sources"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      status: "pending",
      collapsed: false,
      updatedAt: now(),
    });

    return args.sourceId;
  },
});

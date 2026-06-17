import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const now = () => Date.now();

export const createReport = mutation({
  args: {
    title: v.string(),
    topic: v.string(),
    reportType: v.optional(v.string()),
    language: v.optional(v.string()),
    ownerKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();

    return await ctx.db.insert("reports", {
      ...args,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const listReports = query({
  args: {
    ownerKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);

    if (args.ownerKey) {
      return await ctx.db
        .query("reports")
        .withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("reports")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});

export const getReport = query({
  args: {
    reportId: v.id("reports"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reportId);
  },
});

export const archiveReport = mutation({
  args: {
    reportId: v.id("reports"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: "archived",
      updatedAt: now(),
    });

    return args.reportId;
  },
});

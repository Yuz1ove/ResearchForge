import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";

const now = () => Date.now();

export const addEvidenceCard = mutation({
  args: {
    reportId: v.id("reports"),
    sourceId: v.optional(v.id("sources")),
    claim: v.string(),
    evidenceText: v.string(),
    quote: v.optional(v.string()),
    location: v.optional(v.string()),
    reliability: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    hiddenFromUser: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();

    return await ctx.db.insert("evidenceCards", {
      ...args,
      hiddenFromUser: args.hiddenFromUser ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const listEvidenceCardsForInternalUse = internalQuery({
  args: {
    reportId: v.id("reports"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);

    return await ctx.db
      .query("evidenceCards")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .order("asc")
      .take(limit);
  },
});

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { toIssue } from "./lib/shape";
import { feedbackKind, issueStatus, severity } from "./schema";
import type { IssueReport } from "../src/types";

function cap(value: string | undefined, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > max) throw new ConvexError(`${label} must be at most ${max} characters`);
  return value;
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<IssueReport[]> => {
    const user = await requireUser(ctx);
    const member = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    const docs = await ctx.db.query("issueReports").order("desc").collect();
    return (member ? docs : docs.filter((doc) => doc.reporterId === user._id)).map(toIssue);
  },
});

export const create = mutation({
  args: {
    kind: v.optional(feedbackKind),
    title: v.string(),
    description: v.string(),
    steps: v.optional(v.string()),
    expected: v.optional(v.string()),
    actual: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    severity,
  },
  handler: async (ctx, args): Promise<Id<"issueReports">> => {
    const user = await requireUser(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (title.length === 0 || title.length > 120) throw new ConvexError("Title must be 1–120 characters");
    if (description.length === 0 || description.length > 2000) throw new ConvexError("Description must be 1–2000 characters");
    return ctx.db.insert("issueReports", {
      kind: args.kind ?? "issue",
      reporterId: user._id,
      reporterEmail: user.email,
      title,
      description,
      steps: cap(args.steps, 2000, "Steps"),
      expected: cap(args.expected, 1000, "Expected"),
      actual: cap(args.actual, 1000, "Actual"),
      pageUrl: cap(args.pageUrl, 2000, "Page URL"),
      severity: args.severity,
      status: "open",
    });
  },
});

export const setStatus = mutation({
  args: { id: v.id("issueReports"), status: issueStatus },
  handler: async (ctx, { id, status }) => {
    const user = await requireUser(ctx);
    const member = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    if (!member) throw new ConvexError("Only issue members can change status");
    const doc = await ctx.db.get(id);
    if (!doc) throw new ConvexError("Issue not found");
    await ctx.db.patch(id, { status });
  },
});

"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/feedback-form";
import { UserMenu } from "@/components/user-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIssueActions, useIssues, useIsIssueMember } from "@/lib/convex/use-issues";
import type { IssueReport, IssueReportStatus } from "@/types";

/** Stable reference for the loading render. */
const EMPTY_REPORTS: IssueReport[] = [];

const statusMeta: Record<IssueReportStatus, { label: string; icon: typeof AlertCircle; className: string }> = {
  open: { label: "Open", icon: AlertCircle, className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  in_progress: { label: "In progress", icon: Clock, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  resolved: { label: "Resolved", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

export default function IssuesPage() {
  const issues = useIssues();
  const isMember = useIsIssueMember() ?? false;
  const { setIssueStatus } = useIssueActions();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loading = issues === undefined;
  const reports = issues ?? EMPTY_REPORTS;

  async function handleStatusChange(id: string, status: IssueReportStatus) {
    setUpdatingId(id);
    try {
      await setIssueStatus(id, status);
      toast.success("Feedback status updated.");
    } catch (error) {
      console.error("Failed to update issue status", error);
      toast.error("Could not update feedback status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 pt-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Feedback</h1>
        <UserMenu />
      </div>
      <div>
        <p className="mt-1 text-sm text-muted-foreground">
          Report issues, request features, and check their status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send feedback</CardTitle>
          <CardDescription>
            Choose a type and describe what would improve CookSnap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{isMember ? "Feedback inbox" : "Your feedback"}</h2>

        {loading ? (
          <div className="flex flex-col items-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mb-3 h-6 w-6 animate-spin" />
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No feedback yet. Send an issue or feature request above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const meta = statusMeta[report.status];
              const Icon = meta.icon;
              return (
                <Card key={report.id}>
                  <CardHeader className="space-y-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 break-words">
                        <CardTitle className="text-base">{report.kind === "feature" ? "Feature request" : "Issue report"}</CardTitle>
                        <CardDescription className="[overflow-wrap:anywhere]">
                          {report.reporterEmail ?? "Unknown reporter"} · {new Date(report.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Badge className={cn("shrink-0 gap-1", meta.className)} variant="secondary">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{report.description}</p>

                    <div className="flex flex-wrap items-center gap-2">
                      {(["open", "in_progress", "resolved"] as IssueReportStatus[]).map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          type="button"
                          size="sm"
                          variant={report.status === nextStatus ? "default" : "outline"}
                          disabled={!isMember || updatingId === report.id || report.status === nextStatus}
                          onClick={() => handleStatusChange(report.id, nextStatus)}
                        >
                          {statusMeta[nextStatus].label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createIssueReport, fetchIssueReports, updateIssueReportStatus } from "@/lib/supabase/service";
import type { IssueReport, IssueReportSeverity, IssueReportStatus } from "@/types";

const severityOptions: { value: IssueReportSeverity; label: string }[] = [
  { value: "low", label: "Small annoyance" },
  { value: "medium", label: "Getting in the way" },
  { value: "high", label: "Blocking me" },
];

const statusMeta: Record<IssueReportStatus, { label: string; icon: typeof AlertCircle; className: string }> = {
  open: { label: "Open", icon: AlertCircle, className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  in_progress: { label: "In progress", icon: Clock, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  resolved: { label: "Resolved", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

function FieldTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export default function IssuesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [severity, setSeverity] = useState<IssueReportSeverity>("medium");

  async function loadReports() {
    setLoading(true);
    try {
      const data = await fetchIssueReports(supabase);
      setReports(data);
    } catch (error) {
      console.error("Failed to load issue reports", error);
      toast.error("Could not load issue reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const report = await createIssueReport(supabase, {
        title,
        description,
        steps,
        expected,
        actual,
        pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        severity,
      });
      setReports((current) => [report, ...current]);
      setTitle("");
      setDescription("");
      setSteps("");
      setExpected("");
      setActual("");
      setSeverity("medium");
      toast.success("Issue report sent.");
    } catch (error) {
      console.error("Failed to submit issue report", error);
      toast.error(error instanceof Error ? error.message : "Could not submit issue report.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: IssueReportStatus) {
    setUpdatingId(id);
    const previous = reports;
    setReports((current) => current.map((report) => report.id === id ? { ...report, status } : report));
    try {
      await updateIssueReportStatus(supabase, id, status);
      toast.success("Issue status updated.");
    } catch (error) {
      console.error("Failed to update issue status", error);
      setReports(previous);
      toast.error("Could not update issue status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 pt-6">
      <div>
        <h1 className="text-2xl font-bold">Issue reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A shared CookSnap inbox for bugs, confusing moments, and improvement ideas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report something</CardTitle>
          <CardDescription>
            Quick is perfect. What happened, what you expected, and what page you were on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="issue-title">Short title</Label>
              <Input
                id="issue-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Google login gets stuck"
                maxLength={120}
                required
              />
            </div>

            <FieldTextarea
              id="issue-description"
              label="What happened?"
              value={description}
              onChange={setDescription}
              placeholder="Describe the issue in your own words."
              required
              rows={4}
            />

            <FieldTextarea
              id="issue-steps"
              label="Steps to reproduce"
              value={steps}
              onChange={setSteps}
              placeholder="1. Open... 2. Tap... 3. See..."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldTextarea
                id="issue-expected"
                label="Expected"
                value={expected}
                onChange={setExpected}
                placeholder="What should have happened?"
                rows={2}
              />
              <FieldTextarea
                id="issue-actual"
                label="Actual"
                value={actual}
                onChange={setActual}
                placeholder="What actually happened?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="issue-severity">How bad is it?</Label>
              <select
                id="issue-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as IssueReportSeverity)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {severityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Send report
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inbox</h2>
          <Button variant="ghost" size="sm" onClick={loadReports} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mb-3 h-6 w-6 animate-spin" />
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No reports yet. Suspiciously perfect.
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
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{report.title}</CardTitle>
                        <CardDescription>
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
                    <p className="whitespace-pre-wrap">{report.description}</p>

                    {(report.steps || report.expected || report.actual) && (
                      <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-xs">
                        {report.steps && <p><span className="font-medium">Steps:</span> {report.steps}</p>}
                        {report.expected && <p><span className="font-medium">Expected:</span> {report.expected}</p>}
                        {report.actual && <p><span className="font-medium">Actual:</span> {report.actual}</p>}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{report.severity}</Badge>
                      {(["open", "in_progress", "resolved"] as IssueReportStatus[]).map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          type="button"
                          size="sm"
                          variant={report.status === nextStatus ? "default" : "outline"}
                          disabled={updatingId === report.id || report.status === nextStatus}
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

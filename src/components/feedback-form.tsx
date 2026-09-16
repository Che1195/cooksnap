"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useIssueActions } from "@/lib/convex/use-issues";
import type { FeedbackKind } from "@/types";

function deriveTitle(description: string): string {
  return description.trim().split(/\r?\n/)[0].slice(0, 120);
}

export function FeedbackForm({ onSubmittingChange, onViewFeedback }: {
  onSubmittingChange?: (submitting: boolean) => void;
  onViewFeedback?: () => void;
} = {}) {
  const id = useId();
  const pathname = usePathname();
  const { createIssue } = useIssueActions();
  const [kind, setKind] = useState<FeedbackKind>("issue");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [receipt, setReceipt] = useState("");
  const pending = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setReceipt("");
    const text = description.trim();
    if (!text || text.length > 2000) {
      setFieldError(true);
      setError("Enter a description between 1 and 2,000 characters.");
      textarea.current?.focus();
      return;
    }
    setFieldError(false);
    pending.current = true;
    onSubmittingChange?.(true);
    setSubmitting(true);
    try {
      await createIssue({
        kind,
        title: deriveTitle(text),
        description: text,
        pageUrl: pathname?.split(/[?#]/)[0],
        severity: "medium",
      });
      setDescription("");
      setReceipt(kind === "feature" ? "Feature request saved to CookSnap." : "Issue report saved to CookSnap.");
    } catch {
      setError("Could not save feedback. Your draft is still here. Try again.");
    } finally {
      pending.current = false;
      onSubmittingChange?.(false);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={submitting} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Feedback type</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(["issue", "feature"] as const).map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={`${id}-kind`} value={value} checked={kind === value} onChange={() => setKind(value)} className="h-4 w-4 accent-primary" />
              {value === "issue" ? "Report an issue" : "Request a feature"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {kind === "issue" ? "What happened, and what did you expect?" : "What would you like to do, and how would it help?"} Up to 2,000 characters.
        </p>
        <textarea
          ref={textarea}
          id={`${id}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
          required
          rows={5}
          aria-invalid={fieldError || undefined}
          aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ""}`}
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      <div role="status" className="space-y-1 text-sm">
        {receipt && <><p>{receipt}</p><Link href="/issues" onClick={onViewFeedback} className="font-medium underline underline-offset-4">View feedback and status</Link></>}
      </div>
      <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
        {submitting ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Send aria-hidden="true" />}
        {submitting ? "Sending feedback…" : "Send feedback"}
      </Button>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { FeedbackForm } from "@/components/feedback-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  function updateSubmitting(value: boolean) {
    pending.current = value;
    setSubmitting(value);
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending.current) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="min-h-11 shrink-0 px-2">
          <MessageSquare aria-hidden="true" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!submitting} className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>Report an issue or suggest a feature for CookSnap.</DialogDescription>
        </DialogHeader>
        <FeedbackForm onSubmittingChange={updateSubmitting} onViewFeedback={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

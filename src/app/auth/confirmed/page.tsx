/**
 * Lightweight email-confirmation landing page.
 *
 * When a user clicks the confirmation link in their email, the mini-browser in
 * most email clients opens `/auth/callback`, which exchanges the code for a
 * session and redirects here. This page avoids loading the full app (which
 * breaks in mini-browsers) and instead shows a simple success message with a
 * link to open the app in the real browser.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ConfirmedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl">Account confirmed!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your email has been verified. You can now open CookSnap to get started.
          </p>
          <Button asChild className="w-full">
            <Link href="/">Open CookSnap</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecipeForm, isCompleteRecipe } from "@/components/recipe-form";
import { useRecipeActions } from "@/lib/convex/use-recipes";
import { useCurrentUser } from "@/lib/convex/use-user";
import { z } from "zod";
import {
  interpretationSchema,
  validateInterpretation,
} from "@/lib/recipe-interpretation";
import { toast } from "sonner";
import type { RecipeCaptureResult, ScrapedRecipe } from "@/types";

const optionalText = z.string().max(10000).nullable().optional();
const captureSchema = z.object({
  title: z.string().max(10000),
  image: z
    .string()
    .refine(
      (value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value),
    )
    .nullable(),
  ingredients: z.array(z.string().max(10000)).max(500),
  instructions: z.array(z.string().max(20000)).max(500),
  prepTime: optionalText,
  cookTime: optionalText,
  totalTime: optionalText,
  servings: optionalText,
  author: optionalText,
  cuisineType: optionalText,
  interpretation: interpretationSchema.optional(),
  importId: z.string().min(1).max(200),
  warnings: z.array(z.string().max(2000)).max(100),
  needsReview: z.boolean(),
});

type Capture = { data: RecipeCaptureResult; sourceUrl: string; owner: string };

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "capturing" | "saving">("idle");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState("");
  const { profile } = useCurrentUser();
  const { addRecipe } = useRecipeActions();
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const currentOwner = useRef(profile?.id);
  // Keep async work tied to the identity that started it.
  useEffect(() => {
    currentOwner.current = profile?.id;
  }, [profile?.id]);
  useEffect(
    () => () => {
      request.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (capture) heading.current?.focus();
  }, [capture]);

  function cancel() {
    request.current++;
    controller.current?.abort();
    locked.current = false;
    setPhase("idle");
    setCapture(null);
    setError("");
    setTimeout(() => input.current?.focus(), 0);
  }

  async function saveDraft(draft: ScrapedRecipe, context: Capture) {
    if (currentOwner.current !== context.owner)
      throw new Error("Account changed");
    const interpretation = validateInterpretation(draft, draft.interpretation);
    await addRecipe(
      { ...draft, interpretation },
      context.sourceUrl,
      context.data.importId,
    );
  }

  async function handleScrape() {
    if (locked.current || !profile || !url.trim()) return;
    const fullUrl = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    const owner = profile.id;
    const review = profile.reviewBeforeSaving;
    const importId = crypto.randomUUID();
    const token = ++request.current;
    const active = () =>
      token === request.current && currentOwner.current === owner;
    locked.current = true;
    controller.current = new AbortController();
    setError("");
    setCapture(null);
    setPhase("capturing");
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl, importId }),
        signal: controller.current.signal,
      });
      const body: unknown = await response.json().catch(() => {
        throw new Error(
          "Unable to import this recipe right now. Please try again.",
        );
      });
      if (!active()) return;
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Unable to capture this recipe. Try the link again.";
        throw new Error(message);
      }
      const parsed = captureSchema.safeParse(body);
      if (!parsed.success)
        throw new Error(
          "The recipe response was incomplete or invalid. Try importing the link again.",
        );
      const data = parsed.data;
      if (
        data.interpretation &&
        !validateInterpretation(data, data.interpretation)
      ) {
        throw new Error(
          "The recipe interpretation could not be verified. Try importing the link again.",
        );
      }
      // Keep the client's attempt key stable through save retries.
      const context: Capture = {
        data: { ...data, importId },
        sourceUrl: fullUrl,
        owner,
      };
      if (review || data.needsReview || !isCompleteRecipe(data)) {
        setCapture(context);
      } else {
        setPhase("saving");
        try {
          await saveDraft(data, context);
          if (active()) {
            setUrl("");
            toast.success(`"${data.title}" saved!`);
          }
        } catch {
          if (active()) {
            setCapture(context);
            setError(
              "Unable to save this recipe. Review it below and try saving again.",
            );
          }
        }
      }
    } catch (cause) {
      if (active())
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to capture this recipe. Check your connection and try again.",
        );
    } finally {
      if (token === request.current) {
        locked.current = false;
        setPhase("idle");
      }
    }
  }

  const busy = phase !== "idle";
  const hasCapture = !!capture && capture.owner === profile?.id;
  return (
    <section className="space-y-4" aria-label="Import recipe">
      <div className="flex gap-2" aria-busy={busy}>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="recipe-url" className="sr-only">
            Recipe URL
          </label>
          <LinkIcon
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={input}
            id="recipe-url"
            type="url"
            placeholder="Paste recipe URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleScrape();
              }
            }}
            className="pl-9"
            disabled={busy || hasCapture}
            aria-describedby={error ? "capture-error" : undefined}
          />
        </div>
        <Button
          onClick={handleScrape}
          disabled={busy || hasCapture || !profile || !url.trim()}
          aria-label="Snap recipe"
        >
          {busy && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Snap
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {phase === "capturing"
          ? "Reading and interpreting recipe…"
          : phase === "saving"
            ? "Saving recipe…"
            : !profile
              ? "Loading recipe import settings…"
              : ""}
      </p>
      {phase === "capturing" && (
        <Button variant="outline" onClick={cancel}>
          Cancel import
        </Button>
      )}
      {error && (
        <p id="capture-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {capture && capture.owner === profile?.id && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="space-y-1">
            <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
              Review recipe
            </h2>
            <p className="text-sm text-muted-foreground">
              Check the recipe before adding it to your collection.
            </p>
          </div>
          {(capture.data.needsReview || !isCompleteRecipe(capture.data)) && (
            <p className="text-sm text-muted-foreground">
              {isCompleteRecipe(capture.data)
                ? "Check the flagged details before saving."
                : "Add the missing title, ingredients, or instructions before saving."}
            </p>
          )}
          {capture.data.warnings?.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {capture.data.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
          <RecipeForm
            key={capture.data.importId}
            initial={capture.data}
            sourceUrl={capture.sourceUrl}
            submitLabel="Save recipe"
            onCancel={cancel}
            onSave={async (draft) => {
              const token = request.current;
              await saveDraft(draft, capture);
              if (
                token !== request.current ||
                currentOwner.current !== capture.owner
              )
                return;
              setCapture(null);
              setUrl("");
              setError("");
              setTimeout(() => input.current?.focus(), 0);
              toast.success(`"${draft.title}" saved!`);
            }}
          />
        </div>
      )}
    </section>
  );
}

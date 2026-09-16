"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDurationForEdit, parseDurationToISO } from "@/lib/utils";
import type { ScrapedRecipe } from "@/types";

const textareaClass =
  "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function isCompleteRecipe(recipe: ScrapedRecipe): boolean {
  return (
    !!recipe.title.trim() &&
    recipe.ingredients.some((line) => line.trim() && !line.trimStart().startsWith("## ")) &&
    recipe.instructions.some((line) => line.trim())
  );
}

interface RecipeFormProps {
  initial: ScrapedRecipe;
  sourceUrl: string;
  notes?: string | null;
  onSave: (recipe: ScrapedRecipe, notes?: string | null) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

/** Shared editable fields. Persistence belongs to the caller. */
export function RecipeForm({
  initial,
  sourceUrl,
  notes,
  onSave,
  onCancel,
  submitLabel,
}: RecipeFormProps) {
  const [draft, setDraft] = useState(initial);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [times, setTimes] = useState({
    prepTime: formatDurationForEdit(initial.prepTime),
    cookTime: formatDurationForEdit(initial.cookTime),
    totalTime: formatDurationForEdit(initial.totalTime),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const saveError = useRef<HTMLParagraphElement>(null);
  const nextId = useRef(
    initial.ingredients.length + initial.instructions.length,
  );
  const [ids, setIds] = useState({
    ingredients: initial.ingredients.map((_, i) => i),
    instructions: initial.instructions.map(
      (_, i) => initial.ingredients.length + i,
    ),
  });
  const [newLines, setNewLines] = useState({
    ingredients: "",
    instructions: "",
  });
  const set = <K extends keyof ScrapedRecipe>(
    key: K,
    value: ScrapedRecipe[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    draftNotes !== (notes ?? "") ||
    Object.entries(times).some(
      ([key, value]) =>
        value !== formatDurationForEdit(initial[key as keyof typeof times]),
    ) ||
    !!newLines.ingredients ||
    !!newLines.instructions;

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    const warnBeforeFollowingLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey
      ) return;
      const link = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      // External navigation already receives the browser's beforeunload prompt.
      if (target.origin !== window.location.origin) return;
      if (
        target.pathname === window.location.pathname &&
        target.search === window.location.search
      ) return;
      if (!window.confirm("Discard your unsaved recipe changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Next.js links do not trigger beforeunload, so guard their click before routing.
    document.addEventListener("click", warnBeforeFollowingLink, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("click", warnBeforeFollowingLink, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (errors.save) saveError.current?.focus();
  }, [errors.save]);

  function addLine(key: "ingredients" | "instructions") {
    const value = newLines[key].trim();
    if (!value) return;
    set(key, [...draft[key], value]);
    const id = nextId.current++;
    setIds((current) => ({ ...current, [key]: [...current[key], id] }));
    setNewLines((current) => ({ ...current, [key]: "" }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const next: ScrapedRecipe = {
      ...draft,
      title: draft.title.trim(),
      ingredients: draft.ingredients.filter((line) => line.trim()),
      instructions: draft.instructions.filter((line) => line.trim()),
    };
    // Preserve untouched source values exactly, including unusual source durations.
    for (const key of ["prepTime", "cookTime", "totalTime"] as const) {
      if (times[key] !== formatDurationForEdit(initial[key]))
        next[key] = parseDurationToISO(times[key]);
    }
    const invalid: Record<string, string> = {};
    if (!next.title) invalid.title = "Enter a recipe title.";
    if (
      !next.ingredients.some((line) => line.trim() && !line.trimStart().startsWith("## "))
    )
      invalid.ingredients = "Add at least one ingredient.";
    if (!next.instructions.length)
      invalid.instructions = "Add at least one instruction step.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      const key = Object.keys(invalid)[0];
      form.current
        ?.querySelector<HTMLElement>(`[data-field="${key}"]`)
        ?.focus();
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      await onSave(
        next,
        notes === undefined ? undefined : draftNotes.trim() || null,
      );
    } catch {
      setErrors({
        save: "Unable to save this recipe. Your changes are still here. Try saving again.",
      });
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="space-y-5" aria-busy={saving}>
      <fieldset disabled={saving} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="recipe-form-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="recipe-form-title"
            data-field="title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "recipe-title-error" : undefined}
          />
          {errors.title && (
            <p id="recipe-title-error" className="text-sm text-destructive">
              {errors.title}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["servings", "Servings"],
              ["cuisineType", "Cuisine"],
              ["author", "Author"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <label
                htmlFor={`recipe-form-${key}`}
                className="text-sm font-medium"
              >
                {label}
              </label>
              <Input
                id={`recipe-form-${key}`}
                value={draft[key] ?? ""}
                onChange={(e) => set(key, e.target.value || null)}
              />
            </div>
          ))}
          {(
            [
              ["prepTime", "Prep time"],
              ["cookTime", "Cook time"],
              ["totalTime", "Total time"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <label
                htmlFor={`recipe-form-${key}`}
                className="text-sm font-medium"
              >
                {label}
              </label>
              <Input
                id={`recipe-form-${key}`}
                value={times[key]}
                placeholder="e.g. 30 min"
                onChange={(e) =>
                  setTimes((current) => ({ ...current, [key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        {/^https?:\/\//i.test(sourceUrl) && (
          <p className="text-sm">
            Source:{" "}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline"
            >
              View original recipe
            </a>
          </p>
        )}
        {draft.image && (
          <div className="space-y-2">
            {/* External source images have no known dimensions before capture. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.image}
              alt={draft.title || "Recipe preview"}
              className="max-h-52 w-full rounded-lg object-cover"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => set("image", null)}
            >
              Remove image
            </Button>
          </div>
        )}
        {notes !== undefined && (
          <div className="space-y-1.5">
            <label htmlFor="recipe-form-notes" className="text-sm font-medium">
              Notes
            </label>
            <textarea
              id="recipe-form-notes"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              className={textareaClass}
              placeholder="Personal cooking notes..."
            />
          </div>
        )}
        {(
          [
            ["ingredients", "Ingredients", "Ingredient"],
            ["instructions", "Instructions", "Step"],
          ] as const
        ).map(([key, label, singular]) => (
          <div key={key} className="space-y-2">
            <h3 className="text-sm font-medium">{label}</h3>
            {draft[key].map((line, i) => (
              <div key={ids[key][i]} className="flex gap-2">
                <textarea
                  value={line}
                  onChange={(e) =>
                    set(
                      key,
                      draft[key].map((item, index) =>
                        index === i ? e.target.value : item,
                      ),
                    )
                  }
                  aria-label={`${singular} ${i + 1}`}
                  className={textareaClass}
                  rows={key === "ingredients" ? 1 : 2}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${singular.toLowerCase()} ${i + 1}`}
                  onClick={() => {
                    set(
                      key,
                      draft[key].filter((_, index) => index !== i),
                    );
                    setIds((current) => ({
                      ...current,
                      [key]: current[key].filter((_, index) => index !== i),
                    }));
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                data-field={key}
                aria-label={
                  key === "ingredients"
                    ? "New ingredient"
                    : "New instruction step"
                }
                placeholder={
                  key === "ingredients" ? "Add ingredient..." : "Add step..."
                }
                value={newLines[key]}
                onChange={(e) =>
                  setNewLines((current) => ({
                    ...current,
                    [key]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLine(key);
                  }
                }}
                aria-invalid={!!errors[key]}
                aria-describedby={
                  errors[key] ? `recipe-${key}-error` : undefined
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={
                  key === "ingredients" ? "Add ingredient" : "Add step"
                }
                onClick={() => addLine(key)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {errors[key] && (
              <p
                id={`recipe-${key}-error`}
                className="text-sm text-destructive"
              >
                {errors[key]}
              </p>
            )}
          </div>
        ))}
        {errors.save && (
          <p
            ref={saveError}
            data-save-error
            tabIndex={-1}
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.save}
          </p>
        )}
        <div className="flex gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1">
            {saving && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {submitLabel}
          </Button>
        </div>
      </fieldset>
      <p role="status" className="sr-only">
        {saving ? "Saving recipe…" : ""}
      </p>
    </form>
  );
}

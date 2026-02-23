"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Save, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecipeStore } from "@/stores/recipe-store";
import { formatDurationForEdit, parseDurationToISO } from "@/lib/utils";
import type { Recipe } from "@/types";

interface RecipeEditFormProps {
  recipe: Recipe;
  onSave: () => void;
  onCancel: () => void;
}

export function RecipeEditForm({ recipe, onSave, onCancel }: RecipeEditFormProps) {
  const updateRecipe = useRecipeStore((s) => s.updateRecipe);

  const [title, setTitle] = useState(recipe.title);
  const [servings, setServings] = useState(recipe.servings ?? "");
  const [prepTime, setPrepTime] = useState(formatDurationForEdit(recipe.prepTime));
  const [cookTime, setCookTime] = useState(formatDurationForEdit(recipe.cookTime));
  const [author, setAuthor] = useState(recipe.author ?? "");
  const [cuisineType, setCuisineType] = useState(recipe.cuisineType ?? "");
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [ingredients, setIngredients] = useState<string[]>(recipe.ingredients);
  const [instructions, setInstructions] = useState<string[]>(recipe.instructions);
  const [newIngredient, setNewIngredient] = useState("");
  const [newInstruction, setNewInstruction] = useState("");

  /** Resize a textarea to fit its content. */
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleSave = () => {
    updateRecipe(recipe.id, {
      title: title.trim() || recipe.title,
      servings: servings.trim() || null,
      prepTime: parseDurationToISO(prepTime),
      cookTime: parseDurationToISO(cookTime),
      author: author.trim() || null,
      cuisineType: cuisineType.trim() || null,
      notes: notes.trim() || null,
      ingredients: ingredients.filter(Boolean),
      instructions: instructions.filter(Boolean),
    });
    onSave();
  };

  const addIngredient = () => {
    const trimmed = newIngredient.trim();
    if (trimmed) {
      setIngredients([...ingredients, trimmed]);
      setNewIngredient("");
    }
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, value: string) => {
    setIngredients(ingredients.map((item, i) => (i === index ? value : item)));
  };

  const addInstruction = () => {
    const trimmed = newInstruction.trim();
    if (trimmed) {
      setInstructions([...instructions, trimmed]);
      setNewInstruction("");
    }
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    setInstructions(instructions.map((item, i) => (i === index ? value : item)));
  };

  return (
    <div className="space-y-6 p-4">
      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="edit-title" className="text-sm font-medium">Title</label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="edit-servings" className="text-sm font-medium">Servings</label>
          <Input
            id="edit-servings"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="e.g. 4"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-cuisine" className="text-sm font-medium">Cuisine</label>
          <Input
            id="edit-cuisine"
            value={cuisineType}
            onChange={(e) => setCuisineType(e.target.value)}
            placeholder="e.g. Italian"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-prep" className="text-sm font-medium">Prep Time</label>
          <Input
            id="edit-prep"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            placeholder="e.g. 15 min"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-cook" className="text-sm font-medium">Cook Time</label>
          <Input
            id="edit-cook"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            placeholder="e.g. 30 min"
          />
        </div>
      </div>

      {/* Author */}
      <div className="space-y-1.5">
        <label htmlFor="edit-author" className="text-sm font-medium">Author</label>
        <Input
          id="edit-author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Recipe author"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label htmlFor="edit-notes" className="text-sm font-medium">Notes</label>
        <textarea
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Personal cooking notes..."
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={3}
        />
      </div>

      {/* Ingredients */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Ingredients</h3>
        <div className="space-y-1.5">
          {ingredients.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => updateIngredient(i, e.target.value)}
                className="text-sm"
                aria-label={`Ingredient ${i + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removeIngredient(i)}
                aria-label="Remove ingredient"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newIngredient}
            onChange={(e) => setNewIngredient(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addIngredient()}
            placeholder="Add ingredient..."
            className="text-sm"
            aria-label="New ingredient"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={addIngredient}
            disabled={!newIngredient.trim()}
            aria-label="Add ingredient"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Instructions</h3>
        <div className="space-y-1.5">
          {instructions.map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-2 w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {i + 1}.
              </span>
              <textarea
                ref={(el) => autoResize(el)}
                value={step}
                onChange={(e) => {
                  updateInstruction(i, e.target.value);
                  autoResize(e.target);
                }}
                rows={1}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none overflow-hidden"
                aria-label={`Step ${i + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0"
                onClick={() => removeInstruction(i)}
                aria-label="Remove step"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="flex h-9 w-6 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground">
            {instructions.length + 1}.
          </span>
          <Input
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addInstruction()}
            placeholder="Add step..."
            className="text-sm"
            aria-label="New instruction step"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={addInstruction}
            disabled={!newInstruction.trim()}
            aria-label="Add step"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t pt-4">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

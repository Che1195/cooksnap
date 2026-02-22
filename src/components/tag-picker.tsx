"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_TAGS } from "@/lib/constants";

interface TagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
  showSuggestions?: boolean;
}

export function TagPicker({
  selected,
  onChange,
  showSuggestions = true,
}: TagPickerProps) {
  const [custom, setCustom] = useState("");

  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setCustom("");
    }
  };

  const suggestions = showSuggestions
    ? DEFAULT_TAGS.filter((t) => !selected.includes(t))
    : [];

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="cursor-pointer gap-1 pr-1"
              onClick={() => toggle(tag)}
            >
              {tag}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              onClick={() => toggle(tag)}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Custom tag input */}
      <div className="flex gap-2">
        <Input
          placeholder="Custom tag..."
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="h-8"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

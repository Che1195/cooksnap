"use client";

import { useState } from "react";
import { Heart, FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RecipeGroup } from "@/types";

/**
 * Reusable group picker displaying all groups as checkbox rows.
 * Toggling a checkbox adds/removes a recipe from that group.
 * Optionally allows creating new groups inline via a text input.
 */
interface GroupPickerProps {
  recipeId: string;
  groups: RecipeGroup[];
  groupMembers: Record<string, string[]>;
  onToggle: (groupId: string, recipeId: string, isMember: boolean) => void;
  onCreateGroup?: (name: string) => void;
}

export function GroupPicker({
  recipeId,
  groups,
  groupMembers,
  onToggle,
  onCreateGroup,
}: GroupPickerProps) {
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreate = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed || !onCreateGroup) return;
    // Prevent duplicates (case-insensitive)
    if (groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return;
    onCreateGroup(trimmed);
    setNewGroupName("");
  };

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const isMember = (groupMembers[group.id] ?? []).includes(recipeId);
        const Icon = group.isDefault ? Heart : FolderOpen;
        return (
          <label
            key={group.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-accent/50"
          >
            <Checkbox
              checked={isMember}
              onCheckedChange={() => onToggle(group.id, recipeId, isMember)}
              className="shrink-0"
            />
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">{group.name}</span>
          </label>
        );
      })}

      {/* New group input */}
      {onCreateGroup && (
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="New group..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreate}
            disabled={!newGroupName.trim()}
            className="h-8"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

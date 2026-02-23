"use client";

import { Heart, FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { RecipeGroup } from "@/types";

/**
 * Reusable group picker displaying all groups as checkbox rows.
 * Toggling a checkbox adds/removes a recipe from that group.
 */
interface GroupPickerProps {
  recipeId: string;
  groups: RecipeGroup[];
  groupMembers: Record<string, string[]>;
  onToggle: (groupId: string, recipeId: string, isMember: boolean) => void;
}

export function GroupPicker({
  recipeId,
  groups,
  groupMembers,
  onToggle,
}: GroupPickerProps) {
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
    </div>
  );
}

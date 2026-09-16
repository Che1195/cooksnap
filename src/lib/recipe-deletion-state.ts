import { useRecipeStore } from "@/stores/recipe-store";

/** Remove local derived state only after the server confirms deletion. */
export function clearDeletedRecipeState(recipeId: string): void {
  const cooking = useRecipeStore.getState();
  if (cooking.cookingRecipeId === recipeId) cooking.stopCooking();

  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith("cooksnap:snapshot:")) continue;
      const field = key.endsWith(":shopping") ? "recipeId" : key.endsWith(":recipes") ? "id" : null;
      if (!field) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const items: unknown = JSON.parse(raw);
        if (!Array.isArray(items)) continue;
        const retained = items.filter((item: unknown) => {
          if (typeof item !== "object" || item === null) return true;
          if (field === "recipeId") return !("recipeId" in item) || item.recipeId !== recipeId;
          return !("id" in item) || item.id !== recipeId;
        });
        if (retained.length !== items.length) localStorage.setItem(key, JSON.stringify(retained));
      } catch {
        // A corrupt snapshot must not prevent cleanup of the remaining caches.
      }
    }
  } catch {
    // Browser storage is best effort; the authoritative server deletion succeeded.
  }
}

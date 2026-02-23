import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { Recipe, MealPlan, MealPlanDay, MealSlot, MealTemplate, ShoppingItem, ScrapedRecipe, Profile, RecipeGroup, RecipeGroupMember } from "@/types";

type Client = SupabaseClient<Database>;
type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

// ============================================================
// Helpers
// ============================================================

/** Validates that a string is a valid ISO date (YYYY-MM-DD). Throws if not. */
function assertISODate(s: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid date format: "${s}". Expected YYYY-MM-DD.`);
  }
}

function rowToRecipe(
  row: RecipeRow,
  ingredients: string[],
  instructions: string[],
  tags: string[]
): Recipe {
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients,
    instructions,
    sourceUrl: row.source_url,
    tags,
    createdAt: row.created_at,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    totalTime: row.total_time,
    servings: row.servings,
    author: row.author,
    cuisineType: row.cuisine_type,
    difficulty: row.difficulty,
    rating: row.rating,
    isFavorite: row.is_favorite,
    notes: row.notes,
  };
}

async function getUserId(client: Client): Promise<string> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ============================================================
// RECIPES
// ============================================================

export async function fetchRecipes(client: Client): Promise<Recipe[]> {
  const userId = await getUserId(client);

  const { data: recipes, error } = await client
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!recipes || recipes.length === 0) return [];

  const recipeIds = recipes.map((r) => r.id);

  const [ingredientsRes, instructionsRes, tagsRes] = await Promise.all([
    client
      .from("recipe_ingredients")
      .select("*")
      .in("recipe_id", recipeIds)
      .order("sort_order", { ascending: true }),
    client
      .from("recipe_instructions")
      .select("*")
      .in("recipe_id", recipeIds)
      .order("sort_order", { ascending: true }),
    client
      .from("recipe_tags")
      .select("*")
      .in("recipe_id", recipeIds),
  ]);

  if (ingredientsRes.error) throw ingredientsRes.error;
  if (instructionsRes.error) throw instructionsRes.error;
  if (tagsRes.error) throw tagsRes.error;

  const ingredientsByRecipe = new Map<string, string[]>();
  for (const row of ingredientsRes.data ?? []) {
    const arr = ingredientsByRecipe.get(row.recipe_id) ?? [];
    arr.push(row.text);
    ingredientsByRecipe.set(row.recipe_id, arr);
  }

  const instructionsByRecipe = new Map<string, string[]>();
  for (const row of instructionsRes.data ?? []) {
    const arr = instructionsByRecipe.get(row.recipe_id) ?? [];
    arr.push(row.text);
    instructionsByRecipe.set(row.recipe_id, arr);
  }

  const tagsByRecipe = new Map<string, string[]>();
  for (const row of tagsRes.data ?? []) {
    const arr = tagsByRecipe.get(row.recipe_id) ?? [];
    arr.push(row.tag);
    tagsByRecipe.set(row.recipe_id, arr);
  }

  return recipes.map((r) =>
    rowToRecipe(
      r,
      ingredientsByRecipe.get(r.id) ?? [],
      instructionsByRecipe.get(r.id) ?? [],
      tagsByRecipe.get(r.id) ?? []
    )
  );
}

export async function addRecipe(
  client: Client,
  scraped: ScrapedRecipe,
  sourceUrl: string
): Promise<Recipe> {
  const userId = await getUserId(client);

  const { data: recipe, error } = await client
    .from("recipes")
    .insert({
      user_id: userId,
      title: scraped.title,
      image: scraped.image,
      source_url: sourceUrl,
      prep_time: scraped.prepTime ?? null,
      cook_time: scraped.cookTime ?? null,
      total_time: scraped.totalTime ?? null,
      servings: scraped.servings ?? null,
      author: scraped.author ?? null,
      cuisine_type: scraped.cuisineType ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  const [ingredientsRes, instructionsRes] = await Promise.all([
    scraped.ingredients.length > 0
      ? client.from("recipe_ingredients").insert(
          scraped.ingredients.map((text, i) => ({
            recipe_id: recipe.id,
            text,
            sort_order: i,
          }))
        )
      : Promise.resolve({ error: null }),
    scraped.instructions.length > 0
      ? client.from("recipe_instructions").insert(
          scraped.instructions.map((text, i) => ({
            recipe_id: recipe.id,
            text,
            sort_order: i,
          }))
        )
      : Promise.resolve({ error: null }),
  ]);

  if (ingredientsRes.error) throw ingredientsRes.error;
  if (instructionsRes.error) throw instructionsRes.error;

  return rowToRecipe(recipe, scraped.ingredients, scraped.instructions, []);
}

export async function updateRecipe(
  client: Client,
  id: string,
  updates: Partial<Omit<Recipe, "id" | "createdAt">>
): Promise<void> {
  const userId = await getUserId(client);
  const dbUpdates: Database["public"]["Tables"]["recipes"]["Update"] = {};

  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.image !== undefined) dbUpdates.image = updates.image;
  if (updates.sourceUrl !== undefined) dbUpdates.source_url = updates.sourceUrl;
  if (updates.prepTime !== undefined) dbUpdates.prep_time = updates.prepTime ?? null;
  if (updates.cookTime !== undefined) dbUpdates.cook_time = updates.cookTime ?? null;
  if (updates.totalTime !== undefined) dbUpdates.total_time = updates.totalTime ?? null;
  if (updates.servings !== undefined) dbUpdates.servings = updates.servings ?? null;
  if (updates.author !== undefined) dbUpdates.author = updates.author ?? null;
  if (updates.cuisineType !== undefined) dbUpdates.cuisine_type = updates.cuisineType ?? null;
  if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty ?? null;
  if (updates.rating !== undefined) dbUpdates.rating = updates.rating ?? null;
  if (updates.isFavorite !== undefined) dbUpdates.is_favorite = updates.isFavorite;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null;

  // If only sub-tables change (no column updates), verify ownership explicitly (R4-4)
  if (Object.keys(dbUpdates).length === 0 && (updates.ingredients !== undefined || updates.instructions !== undefined)) {
    const { data: owned, error: ownErr } = await client
      .from("recipes")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (ownErr || !owned) throw new Error("Recipe not found");
  }

  if (Object.keys(dbUpdates).length > 0) {
    const { error } = await client
      .from("recipes")
      .update(dbUpdates)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  // Sub-table operations below are safe because recipe ownership was verified above
  // via .eq("user_id", userId). The foreign key on recipe_id ensures only this recipe's
  // child rows are affected. RLS provides an additional layer of protection.

  if (updates.ingredients !== undefined) {
    // Capture existing for recovery if insert fails (R3-8)
    const { data: prevIngredients } = await client
      .from("recipe_ingredients")
      .select("text, sort_order")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true });

    await client.from("recipe_ingredients").delete().eq("recipe_id", id);
    if (updates.ingredients.length > 0) {
      const { error } = await client.from("recipe_ingredients").insert(
        updates.ingredients.map((text, i) => ({
          recipe_id: id,
          text,
          sort_order: i,
        }))
      );
      if (error) {
        // Attempt to restore old data (best-effort recovery)
        if (prevIngredients && prevIngredients.length > 0) {
          try {
            await client.from("recipe_ingredients").insert(
              prevIngredients.map((row) => ({ recipe_id: id, text: row.text, sort_order: row.sort_order }))
            );
          } catch {
            // Recovery failed — original error is still thrown below
          }
        }
        throw error;
      }
    }
  }

  if (updates.instructions !== undefined) {
    // Capture existing for recovery if insert fails (R3-8)
    const { data: prevInstructions } = await client
      .from("recipe_instructions")
      .select("text, sort_order")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true });

    await client.from("recipe_instructions").delete().eq("recipe_id", id);
    if (updates.instructions.length > 0) {
      const { error } = await client.from("recipe_instructions").insert(
        updates.instructions.map((text, i) => ({
          recipe_id: id,
          text,
          sort_order: i,
        }))
      );
      if (error) {
        // Attempt to restore old data (best-effort recovery)
        if (prevInstructions && prevInstructions.length > 0) {
          try {
            await client.from("recipe_instructions").insert(
              prevInstructions.map((row) => ({ recipe_id: id, text: row.text, sort_order: row.sort_order }))
            );
          } catch {
            // Recovery failed — original error is still thrown below
          }
        }
        throw error;
      }
    }
  }
}

export async function deleteRecipe(client: Client, id: string): Promise<void> {
  const userId = await getUserId(client);
  const { error } = await client.from("recipes").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function updateRecipeTags(
  client: Client,
  recipeId: string,
  tags: string[]
): Promise<void> {
  // Verify recipe ownership before modifying tags (defense-in-depth, R3-3)
  const userId = await getUserId(client);
  const { data: recipe, error: recipeError } = await client
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .single();
  if (recipeError || !recipe) throw new Error("Recipe not found");

  // Capture existing tags for recovery if insert fails (R5-14)
  const { data: prevTags } = await client
    .from("recipe_tags")
    .select("tag")
    .eq("recipe_id", recipeId);

  await client.from("recipe_tags").delete().eq("recipe_id", recipeId);
  if (tags.length > 0) {
    const { error } = await client.from("recipe_tags").insert(
      tags.map((tag) => ({ recipe_id: recipeId, tag }))
    );
    if (error) {
      // Attempt to restore old tags (best-effort recovery)
      if (prevTags && prevTags.length > 0) {
        try {
          await client.from("recipe_tags").insert(
            prevTags.map((row) => ({ recipe_id: recipeId, tag: row.tag }))
          );
        } catch {
          // Recovery failed — original error is still thrown below
        }
      }
      throw error;
    }
  }
}

// ============================================================
// MEAL PLAN
// ============================================================

export async function fetchMealPlan(
  client: Client,
  startDate: string,
  endDate: string
): Promise<MealPlan> {
  assertISODate(startDate);
  assertISODate(endDate);
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("meal_plans")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw error;

  const plan: MealPlan = {};
  for (const row of data ?? []) {
    if (!plan[row.date]) plan[row.date] = {};
    const slot = row.meal_type as MealSlot;
    plan[row.date][slot] = row.recipe_id;
    if (row.is_leftover) {
      if (!plan[row.date].leftovers) plan[row.date].leftovers = {};
      plan[row.date].leftovers![slot] = true;
    }
  }
  return plan;
}

export async function assignMeal(
  client: Client,
  date: string,
  slot: MealSlot,
  recipeId: string,
  isLeftover: boolean = false
): Promise<void> {
  assertISODate(date);
  const userId = await getUserId(client);

  const { error } = await client
    .from("meal_plans")
    .upsert(
      { user_id: userId, date, meal_type: slot, recipe_id: recipeId, is_leftover: isLeftover },
      { onConflict: "user_id,date,meal_type" }
    );

  if (error) {
    console.error("assignMeal upsert failed:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw error;
  }
}

export async function removeMeal(
  client: Client,
  date: string,
  slot: MealSlot
): Promise<void> {
  assertISODate(date);
  const userId = await getUserId(client);

  const { error } = await client
    .from("meal_plans")
    .delete()
    .eq("user_id", userId)
    .eq("date", date)
    .eq("meal_type", slot);

  if (error) throw error;
}

export async function clearWeek(
  client: Client,
  weekDates: string[]
): Promise<void> {
  for (const d of weekDates) assertISODate(d);
  const userId = await getUserId(client);

  const { error } = await client
    .from("meal_plans")
    .delete()
    .eq("user_id", userId)
    .in("date", weekDates);

  if (error) throw error;
}

// ============================================================
// MEAL TEMPLATES
// ============================================================

export async function fetchTemplates(client: Client): Promise<MealTemplate[]> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("meal_templates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    // Validate template JSONB is a valid object; default to empty if corrupted (R5-38)
    const template = (row.template && typeof row.template === "object" && !Array.isArray(row.template))
      ? row.template as Record<number, MealPlanDay>
      : ({} as Record<number, MealPlanDay>);
    return {
      id: row.id,
      name: row.name,
      days: template,
      createdAt: row.created_at,
    };
  });
}

export async function saveTemplate(
  client: Client,
  name: string,
  template: Record<number, MealPlanDay>
): Promise<MealTemplate> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("meal_templates")
    .insert({ user_id: userId, name, template: template as unknown as Record<string, unknown> })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    days: data.template as Record<number, MealPlanDay>,
    createdAt: data.created_at,
  };
}

export async function deleteTemplate(
  client: Client,
  id: string
): Promise<void> {
  const userId = await getUserId(client);
  const { error } = await client
    .from("meal_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

// ============================================================
// SHOPPING LIST
// ============================================================

export async function fetchShoppingList(
  client: Client
): Promise<ShoppingItem[]> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("shopping_items")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    checked: row.checked,
    recipeId: row.recipe_id ?? undefined,
  }));
}

export async function addShoppingItem(
  client: Client,
  text: string
): Promise<ShoppingItem> {
  // Validate text length (R5-48)
  if (text.length > 500) {
    throw new Error("Shopping item text exceeds 500 character limit");
  }

  const userId = await getUserId(client);

  const { data, error } = await client
    .from("shopping_items")
    .insert({ user_id: userId, text, checked: false })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    text: data.text,
    checked: data.checked,
    recipeId: data.recipe_id ?? undefined,
  };
}

export async function toggleShoppingItem(
  client: Client,
  id: string,
  checked: boolean
): Promise<void> {
  const userId = await getUserId(client);
  const { error } = await client
    .from("shopping_items")
    .update({ checked })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function uncheckAllShoppingItems(client: Client): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("shopping_items")
    .update({ checked: false })
    .eq("user_id", userId)
    .eq("checked", true);

  if (error) throw error;
}

/** Re-insert previously deleted shopping items (for undo). Returns new items with fresh IDs. */
export async function restoreShoppingItems(
  client: Client,
  items: { text: string; checked: boolean; recipeId?: string }[]
): Promise<ShoppingItem[]> {
  if (items.length === 0) return [];

  // Validate text length for all items (R5-48)
  for (const item of items) {
    if (item.text.length > 500) {
      throw new Error("Shopping item text exceeds 500 character limit");
    }
  }

  const userId = await getUserId(client);

  const { data, error } = await client
    .from("shopping_items")
    .insert(
      items.map((item) => ({
        user_id: userId,
        text: item.text,
        checked: item.checked,
        recipe_id: item.recipeId ?? null,
      }))
    )
    .select();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    checked: row.checked,
    recipeId: row.recipe_id ?? undefined,
  }));
}

export async function clearCheckedItems(client: Client): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("shopping_items")
    .delete()
    .eq("user_id", userId)
    .eq("checked", true);

  if (error) throw error;
}

export async function clearShoppingList(client: Client): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("shopping_items")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}

export async function generateShoppingList(
  client: Client,
  items: { text: string; recipeId: string }[]
): Promise<ShoppingItem[]> {
  // Validate text length for all items (R5-48)
  for (const item of items) {
    if (item.text.length > 500) {
      throw new Error("Shopping item text exceeds 500 character limit");
    }
  }

  const userId = await getUserId(client);

  // Capture existing items for recovery if insert fails (R5-15)
  const { data: prevItems } = await client
    .from("shopping_items")
    .select("text, checked, recipe_id")
    .eq("user_id", userId);

  // Clear existing items first
  const { error: deleteError } = await client
    .from("shopping_items")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  if (items.length === 0) return [];

  const { data, error } = await client
    .from("shopping_items")
    .insert(
      items.map((item) => ({
        user_id: userId,
        text: item.text,
        checked: false,
        recipe_id: item.recipeId,
      }))
    )
    .select();

  if (error) {
    // Attempt to restore old items (best-effort recovery)
    if (prevItems && prevItems.length > 0) {
      try {
        await client.from("shopping_items").insert(
          prevItems.map((row) => ({
            user_id: userId,
            text: row.text,
            checked: row.checked,
            recipe_id: row.recipe_id,
          }))
        );
      } catch {
        // Recovery failed — original error is still thrown below
      }
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    checked: row.checked,
    recipeId: row.recipe_id ?? undefined,
  }));
}

// ============================================================
// CHECKED INGREDIENTS
// ============================================================

export async function fetchCheckedIngredients(
  client: Client
): Promise<Record<string, number[]>> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("checked_ingredients")
    .select("*")
    .eq("user_id", userId);

  if (error) throw error;

  const result: Record<string, number[]> = {};
  for (const row of data ?? []) {
    if (!result[row.recipe_id]) result[row.recipe_id] = [];
    result[row.recipe_id].push(row.ingredient_index);
  }
  return result;
}

export async function toggleIngredient(
  client: Client,
  recipeId: string,
  index: number,
  checked: boolean
): Promise<void> {
  const userId = await getUserId(client);

  if (checked) {
    // Use upsert to handle rapid double-clicks without duplicate key errors (R5-40)
    const { error } = await client
      .from("checked_ingredients")
      .upsert(
        { user_id: userId, recipe_id: recipeId, ingredient_index: index },
        { onConflict: "user_id,recipe_id,ingredient_index" }
      );
    if (error) throw error;
  } else {
    const { error } = await client
      .from("checked_ingredients")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)
      .eq("ingredient_index", index);
    if (error) throw error;
  }
}

export async function clearCheckedIngredients(
  client: Client,
  recipeId: string
): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("checked_ingredients")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);

  if (error) throw error;
}

// ============================================================
// PROFILE
// ============================================================

export async function fetchProfile(client: Client): Promise<Profile> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateProfile(
  client: Client,
  updates: { display_name?: string; avatar_url?: string }
): Promise<void> {
  const userId = await getUserId(client);

  // Explicitly pick only allowed fields to prevent injection of unexpected columns (R5-45)
  const { display_name, avatar_url } = updates;
  const safeUpdates: Record<string, string> = {};
  if (display_name !== undefined) safeUpdates.display_name = display_name;
  if (avatar_url !== undefined) safeUpdates.avatar_url = avatar_url;

  const { error } = await client
    .from("profiles")
    .update(safeUpdates)
    .eq("id", userId);

  if (error) throw error;
}

// ============================================================
// RECIPE GROUPS
// ============================================================

/** Fetches all recipe groups for the current user, ordered by sort_order. */
export async function fetchGroups(client: Client): Promise<RecipeGroup[]> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("recipe_groups")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    createdAt: row.created_at,
  }));
}

export async function createGroup(
  client: Client,
  name: string,
  icon?: string
): Promise<RecipeGroup> {
  const userId = await getUserId(client);

  const { data, error } = await client
    .from("recipe_groups")
    .insert({ user_id: userId, name, icon: icon ?? null })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    icon: data.icon,
    sortOrder: data.sort_order,
    isDefault: data.is_default,
    createdAt: data.created_at,
  };
}

export async function updateGroup(
  client: Client,
  id: string,
  updates: Partial<Pick<RecipeGroup, "name" | "icon" | "sortOrder">>
): Promise<void> {
  const userId = await getUserId(client);
  const dbUpdates: Record<string, unknown> = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await client
    .from("recipe_groups")
    .update(dbUpdates)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteGroup(
  client: Client,
  id: string
): Promise<void> {
  const userId = await getUserId(client);
  const { error } = await client
    .from("recipe_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function fetchGroupMembers(
  client: Client
): Promise<RecipeGroupMember[]> {
  const userId = await getUserId(client);

  // Fetch all members for groups owned by this user
  const { data: groups, error: groupsError } = await client
    .from("recipe_groups")
    .select("id")
    .eq("user_id", userId);

  if (groupsError) throw groupsError;
  if (!groups || groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const { data, error } = await client
    .from("recipe_group_members")
    .select("*")
    .in("group_id", groupIds);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    recipeId: row.recipe_id,
    addedAt: row.added_at,
  }));
}

export async function addRecipeToGroup(
  client: Client,
  groupId: string,
  recipeId: string
): Promise<RecipeGroupMember> {
  const userId = await getUserId(client);

  // Verify the group belongs to the authenticated user
  const { data: group, error: groupError } = await client
    .from("recipe_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", userId)
    .single();
  if (groupError || !group) throw new Error("Group not found");

  // Verify the recipe belongs to the authenticated user (R4-1)
  const { data: recipeRow, error: recipeError } = await client
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .single();
  if (recipeError || !recipeRow) throw new Error("Recipe not found");

  // Check if already a member to avoid duplicate key errors
  const { data: existing } = await client
    .from("recipe_group_members")
    .select("*")
    .eq("group_id", groupId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      groupId: existing.group_id,
      recipeId: existing.recipe_id,
      addedAt: existing.added_at,
    };
  }

  const { data, error } = await client
    .from("recipe_group_members")
    .insert({ group_id: groupId, recipe_id: recipeId })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    groupId: data.group_id,
    recipeId: data.recipe_id,
    addedAt: data.added_at,
  };
}

export async function removeRecipeFromGroup(
  client: Client,
  groupId: string,
  recipeId: string
): Promise<void> {
  const userId = await getUserId(client);

  // Verify the group belongs to the authenticated user
  const { data: group, error: groupError } = await client
    .from("recipe_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", userId)
    .single();
  if (groupError || !group) throw new Error("Group not found");

  const { error } = await client
    .from("recipe_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("recipe_id", recipeId);

  if (error) throw error;
}

export async function ensureDefaultGroups(
  client: Client
): Promise<RecipeGroup[]> {
  const userId = await getUserId(client);

  // Check if user already has groups
  const { data: existing, error: fetchError } = await client
    .from("recipe_groups")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (fetchError) throw fetchError;

  const hasDefault = (existing ?? []).some((g) => g.is_default);

  if (hasDefault) {
    return (existing ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isDefault: row.is_default,
      createdAt: row.created_at,
    }));
  }

  // Create default "Favorites" group — use try-catch to handle race conditions
  // where another concurrent request may have already inserted the default group (R5-16)
  let newGroup: NonNullable<typeof existing>[number];
  try {
    const { data: inserted, error: insertError } = await client
      .from("recipe_groups")
      .insert({ user_id: userId, name: "Favorites", is_default: true, sort_order: 0 })
      .select()
      .single();

    if (insertError) throw insertError;
    newGroup = inserted;
  } catch {
    // Insert failed (likely duplicate from a concurrent request) — re-fetch and return
    const { data: refetched, error: refetchError } = await client
      .from("recipe_groups")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    if (refetchError) throw refetchError;

    return (refetched ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isDefault: row.is_default,
      createdAt: row.created_at,
    }));
  }

  const allGroups = [
    {
      id: newGroup.id,
      name: newGroup.name,
      icon: newGroup.icon,
      sortOrder: newGroup.sort_order,
      isDefault: newGroup.is_default,
      createdAt: newGroup.created_at,
    },
    ...(existing ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isDefault: row.is_default,
      createdAt: row.created_at,
    })),
  ];

  return allGroups;
}

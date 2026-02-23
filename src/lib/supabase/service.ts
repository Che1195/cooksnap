import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { Recipe, MealPlan, MealSlot, ShoppingItem, ScrapedRecipe, Profile } from "@/types";

type Client = SupabaseClient<Database>;
type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

// ============================================================
// Helpers
// ============================================================

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

  if (Object.keys(dbUpdates).length > 0) {
    const { error } = await client
      .from("recipes")
      .update(dbUpdates)
      .eq("id", id);
    if (error) throw error;
  }

  if (updates.ingredients !== undefined) {
    await client.from("recipe_ingredients").delete().eq("recipe_id", id);
    if (updates.ingredients.length > 0) {
      const { error } = await client.from("recipe_ingredients").insert(
        updates.ingredients.map((text, i) => ({
          recipe_id: id,
          text,
          sort_order: i,
        }))
      );
      if (error) throw error;
    }
  }

  if (updates.instructions !== undefined) {
    await client.from("recipe_instructions").delete().eq("recipe_id", id);
    if (updates.instructions.length > 0) {
      const { error } = await client.from("recipe_instructions").insert(
        updates.instructions.map((text, i) => ({
          recipe_id: id,
          text,
          sort_order: i,
        }))
      );
      if (error) throw error;
    }
  }
}

export async function deleteRecipe(client: Client, id: string): Promise<void> {
  const { error } = await client.from("recipes").delete().eq("id", id);
  if (error) throw error;
}

export async function updateRecipeTags(
  client: Client,
  recipeId: string,
  tags: string[]
): Promise<void> {
  await client.from("recipe_tags").delete().eq("recipe_id", recipeId);
  if (tags.length > 0) {
    const { error } = await client.from("recipe_tags").insert(
      tags.map((tag) => ({ recipe_id: recipeId, tag }))
    );
    if (error) throw error;
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
    plan[row.date][row.meal_type as MealSlot] = row.recipe_id;
  }
  return plan;
}

export async function assignMeal(
  client: Client,
  date: string,
  slot: MealSlot,
  recipeId: string
): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("meal_plans")
    .upsert(
      { user_id: userId, date, meal_type: slot, recipe_id: recipeId },
      { onConflict: "user_id,date,meal_type" }
    );

  if (error) throw error;
}

export async function removeMeal(
  client: Client,
  date: string,
  slot: MealSlot
): Promise<void> {
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
  const userId = await getUserId(client);

  const { error } = await client
    .from("meal_plans")
    .delete()
    .eq("user_id", userId)
    .in("date", weekDates);

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
  const { error } = await client
    .from("shopping_items")
    .update({ checked })
    .eq("id", id);

  if (error) throw error;
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
  const userId = await getUserId(client);

  // Clear existing items first
  await client.from("shopping_items").delete().eq("user_id", userId);

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

  if (error) throw error;

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
    const { error } = await client
      .from("checked_ingredients")
      .insert({ user_id: userId, recipe_id: recipeId, ingredient_index: index });
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

  const { error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) throw error;
}

export async function deleteAccount(client: Client): Promise<void> {
  const userId = await getUserId(client);

  const { error } = await client
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (error) throw error;

  await client.auth.signOut();
}

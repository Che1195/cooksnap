import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { difficulty, mealPlanDay, mealType } from "./schema";

async function userByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"users">> {
  const user = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!user) throw new Error(`No migrated user for legacy id ${legacyId}`);
  return user._id;
}

async function recipeByLegacy(ctx: MutationCtx, legacyId: string): Promise<Id<"recipes">> {
  const recipe = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
  if (!recipe) throw new Error(`No migrated recipe for legacy id ${legacyId}`);
  return recipe._id;
}

export const upsertUser = internalMutation({
  args: { legacyId: v.string(), email: v.string() },
  handler: async (ctx, { legacyId, email }): Promise<Id<"users"> | null> => {
    const byLegacy = await ctx.db.query("users").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (byLegacy) return byLegacy._id;
    const byEmail = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).unique();
    if (!byEmail) return null;
    if (byEmail.legacyId !== undefined && byEmail.legacyId !== legacyId) {
      throw new Error(`User ${email} is already linked to legacy id ${byEmail.legacyId}`);
    }
    await ctx.db.patch(byEmail._id, { legacyId });
    return byEmail._id;
  },
});

export const upsertRecipe = internalMutation({
  args: {
    legacyId: v.string(),
    userLegacyId: v.string(),
    title: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    sourceUrl: v.string(),
    prepTime: v.optional(v.string()),
    cookTime: v.optional(v.string()),
    totalTime: v.optional(v.string()),
    servings: v.optional(v.string()),
    author: v.optional(v.string()),
    cuisineType: v.optional(v.string()),
    difficulty: v.optional(difficulty),
    rating: v.optional(v.number()),
    isFavorite: v.boolean(),
    notes: v.optional(v.string()),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    tags: v.array(v.string()),
    createdAt: v.string(),
  },
  handler: async (ctx, { legacyId, userLegacyId, createdAt: _createdAt, ...fields }): Promise<Id<"recipes">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      const { title, sourceUrl, isFavorite, ingredients, instructions, tags } = fields;
      await ctx.db.patch(existing._id, {
        userId,
        title,
        image: fields.image,
        sourceUrl,
        prepTime: fields.prepTime,
        cookTime: fields.cookTime,
        totalTime: fields.totalTime,
        servings: fields.servings,
        author: fields.author,
        cuisineType: fields.cuisineType,
        difficulty: fields.difficulty,
        rating: fields.rating,
        isFavorite,
        notes: fields.notes,
        ingredients,
        instructions,
        tags,
        ...(fields.imageStorageId !== undefined && { imageStorageId: fields.imageStorageId }),
      });
      return existing._id;
    }
    return ctx.db.insert("recipes", { ...fields, userId, legacyId });
  },
});

export const findRecipeByLegacyId = internalMutation({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }): Promise<Id<"recipes"> | null> => {
    const r = await ctx.db.query("recipes").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    return r?._id ?? null;
  },
});

export const upsertMealPlan = internalMutation({
  args: { userLegacyId: v.string(), recipeLegacyId: v.string(), date: v.string(), mealType, isLeftover: v.boolean(), position: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await userByLegacy(ctx, args.userLegacyId);
    const recipeId = await recipeByLegacy(ctx, args.recipeLegacyId);
    const rows = await ctx.db.query("mealPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date)).collect();
    if (rows.some((r) => r.mealType === args.mealType && r.recipeId === recipeId)) return false;
    await ctx.db.insert("mealPlans", { userId, recipeId, date: args.date, mealType: args.mealType, isLeftover: args.isLeftover, position: args.position });
    return true;
  },
});

export const upsertGroup = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), icon: v.optional(v.string()), sortOrder: v.number(), isDefault: v.boolean() },
  handler: async (ctx, { legacyId, userLegacyId, ...fields }): Promise<Id<"recipeGroups">> => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, userId, icon: fields.icon });
      return existing._id;
    }
    return ctx.db.insert("recipeGroups", { ...fields, userId, legacyId });
  },
});

export const upsertGroupMember = internalMutation({
  args: { groupLegacyId: v.string(), recipeLegacyId: v.string() },
  handler: async (ctx, { groupLegacyId, recipeLegacyId }) => {
    const group = await ctx.db.query("recipeGroups").withIndex("by_legacyId", (q) => q.eq("legacyId", groupLegacyId)).unique();
    if (!group) throw new Error(`No migrated group for legacy id ${groupLegacyId}`);
    const recipeId = await recipeByLegacy(ctx, recipeLegacyId);
    const rows = await ctx.db.query("recipeGroupMembers").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    if (rows.some((r) => r.recipeId === recipeId)) return;
    await ctx.db.insert("recipeGroupMembers", { groupId: group._id, recipeId });
  },
});

export const upsertIssueReportMember = internalMutation({
  args: { userLegacyId: v.string() },
  handler: async (ctx, { userLegacyId }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const existing = await ctx.db.query("issueReportMembers").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    if (!existing) await ctx.db.insert("issueReportMembers", { userId });
  },
});

export const upsertTemplate = internalMutation({
  args: { legacyId: v.string(), userLegacyId: v.string(), name: v.string(), days: v.record(v.string(), mealPlanDay) },
  handler: async (ctx, { legacyId, userLegacyId, name, days }) => {
    const userId = await userByLegacy(ctx, userLegacyId);
    const all = await ctx.db.query("mealTemplates").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const existing = all.find((t) => t.legacyId === legacyId);
    if (existing) {
      await ctx.db.patch(existing._id, { name, days });
      return existing._id;
    }
    return ctx.db.insert("mealTemplates", { userId, name, days, legacyId });
  },
});

import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const userIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<Id<"users"> | null> => {
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).unique();
    return user?._id ?? null;
  },
});

type Row = Record<string, unknown>;

async function sbFetchAll(table: string, order: string): Promise<Row[]> {
  const base = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base}/rest/v1/${table}?select=*&order=${order}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Range-Unit": "items", Range: `${offset}-${offset + 999}` },
    });
    if (!res.ok) throw new Error(`Supabase ${table} ${res.status}`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function sbUsers(): Promise<Array<{ id: string; email: string }>> {
  const base = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase auth users ${res.status}`);
  const body = (await res.json()) as { users: Array<{ id: string; email: string }> };
  return body.users;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

export const run = internalAction({
  args: { apply: v.boolean(), skipUnmatched: v.boolean() },
  handler: async (ctx, { apply, skipUnmatched }) => {
    const summary = {
      users: { read: 0, linked: 0, unmatched: [] as string[] },
      recipes: { read: 0, written: 0 },
      images: { copied: 0, failed: [] as string[] },
      mealPlans: { read: 0, written: 0, skipped: 0 },
      groups: { read: 0, written: 0 },
      groupMembers: { read: 0, written: 0 },
      issueMembers: { read: 0, written: 0 },
      templates: { read: 0, written: 0 },
    };

    // 1. users
    const users = await sbUsers();
    summary.users.read = users.length;
    const linked = new Set<string>();
    for (const u of users) {
      const id = apply
        ? await ctx.runMutation(internal.migration.upsertUser, { legacyId: u.id, email: u.email.toLowerCase() })
        : await ctx.runQuery(internal.migration.userIdByEmail, { email: u.email.toLowerCase() });
      if (id) {
        if (apply) linked.add(u.id);
        summary.users.linked++;
      } else summary.users.unmatched.push(u.email);
    }
    if (apply && summary.users.unmatched.length > 0 && !skipUnmatched) {
      throw new Error(`Unmatched Supabase users: ${summary.users.unmatched.join(", ")}. Create them in Clerk or pass skipUnmatched=true.`);
    }
    const ok = (userId: unknown) => typeof userId === "string" && (!apply || linked.has(userId));

    // 2. recipes with embedded lists
    const [recipes, ingredients, instructions, tags] = await Promise.all([
      sbFetchAll("recipes", "created_at"),
      sbFetchAll("recipe_ingredients", "sort_order"),
      sbFetchAll("recipe_instructions", "sort_order"),
      sbFetchAll("recipe_tags", "id"),
    ]);
    summary.recipes.read = recipes.length;
    const byRecipe = <T extends Row>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) (m.get(String(r.recipe_id)) ?? m.set(String(r.recipe_id), []).get(String(r.recipe_id))!).push(r);
      return m;
    };
    const ingBy = byRecipe(ingredients), insBy = byRecipe(instructions), tagBy = byRecipe(tags);
    const bucketPrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/recipe-images/`;

    for (const r of recipes) {
      if (!ok(r.user_id)) continue;
      const legacyId = String(r.id);
      let imageStorageId: Id<"_storage"> | undefined;
      const image = str(r.image);
      if (apply && image && image.startsWith(bucketPrefix)) {
        const existing = await ctx.runMutation(internal.migration.findRecipeByLegacyId, { legacyId });
        if (!existing) {
          try {
            const res = await fetch(image);
            if (!res.ok) throw new Error(String(res.status));
            imageStorageId = await ctx.storage.store(await res.blob());
            summary.images.copied++;
          } catch (e) {
            summary.images.failed.push(`${legacyId}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      if (apply) {
        await ctx.runMutation(internal.migration.upsertRecipe, {
          legacyId,
          userLegacyId: String(r.user_id),
          title: String(r.title),
          image,
          imageStorageId,
          sourceUrl: str(r.source_url) ?? "",
          prepTime: str(r.prep_time), cookTime: str(r.cook_time), totalTime: str(r.total_time),
          servings: str(r.servings), author: str(r.author), cuisineType: str(r.cuisine_type),
          difficulty: r.difficulty === "Easy" || r.difficulty === "Medium" || r.difficulty === "Hard" ? r.difficulty : undefined,
          rating: num(r.rating),
          isFavorite: r.is_favorite === true,
          notes: str(r.notes),
          ingredients: (ingBy.get(legacyId) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((x) => String(x.text)),
          instructions: (insBy.get(legacyId) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((x) => String(x.text)),
          tags: (tagBy.get(legacyId) ?? []).map((x) => String(x.tag)),
          createdAt: String(r.created_at),
        });
      }
      summary.recipes.written++;
    }

    // 3. groups, members
    const groups = await sbFetchAll("recipe_groups", "sort_order");
    summary.groups.read = groups.length;
    for (const g of groups) {
      if (!ok(g.user_id)) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertGroup, {
        legacyId: String(g.id), userLegacyId: String(g.user_id), name: String(g.name), icon: str(g.icon),
        sortOrder: num(g.sort_order) ?? 0, isDefault: g.is_default === true,
      });
      summary.groups.written++;
    }
    const groupIds = new Set(groups.filter((g) => ok(g.user_id)).map((g) => String(g.id)));
    const members = await sbFetchAll("recipe_group_members", "id");
    summary.groupMembers.read = members.length;
    for (const m of members) {
      if (!groupIds.has(String(m.group_id))) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertGroupMember, { groupLegacyId: String(m.group_id), recipeLegacyId: String(m.recipe_id) });
      summary.groupMembers.written++;
    }

    // 4. meal plans
    const plans = await sbFetchAll("meal_plans", "date");
    summary.mealPlans.read = plans.length;
    for (const p of plans) {
      if (!ok(p.user_id)) continue;
      const mt = p.meal_type;
      if (mt !== "breakfast" && mt !== "lunch" && mt !== "dinner" && mt !== "snack") continue;
      const written = apply
        ? await ctx.runMutation(internal.migration.upsertMealPlan, {
            userLegacyId: String(p.user_id), recipeLegacyId: String(p.recipe_id), date: String(p.date),
            mealType: mt, isLeftover: p.is_leftover === true, position: num(p.position) ?? 0,
          })
        : true;
      if (written) summary.mealPlans.written++; else summary.mealPlans.skipped++;
    }

    // 5. templates (recipe ids inside days are remapped)
    const templates = await sbFetchAll("meal_templates", "created_at");
    summary.templates.read = templates.length;
    for (const t of templates) {
      if (!ok(t.user_id)) continue;
      const days = t.template as Record<string, { breakfast?: unknown[]; lunch?: unknown[]; dinner?: unknown[]; snack?: unknown[] }>;
      type Entry = { recipeId: string; isLeftover: boolean; position: number };
      const remapped: Record<string, { breakfast: Entry[]; lunch: Entry[]; dinner: Entry[]; snack: Entry[] }> = {};
      for (const [k, day] of Object.entries(days ?? {})) {
        const slot = async (list: unknown[] | undefined): Promise<Entry[]> => {
          const out: Entry[] = [];
          for (const e of list ?? []) {
            const entry = e as { recipeId?: unknown; isLeftover?: unknown; position?: unknown };
            if (typeof entry.recipeId !== "string") continue;
            const id = apply ? await ctx.runMutation(internal.migration.findRecipeByLegacyId, { legacyId: entry.recipeId }) : entry.recipeId;
            if (!id) continue;
            out.push({ recipeId: id, isLeftover: entry.isLeftover === true, position: num(entry.position) ?? 0 });
          }
          return out;
        };
        remapped[k] = { breakfast: await slot(day.breakfast), lunch: await slot(day.lunch), dinner: await slot(day.dinner), snack: await slot(day.snack) };
      }
      if (apply) await ctx.runMutation(internal.migration.upsertTemplate, { legacyId: String(t.id), userLegacyId: String(t.user_id), name: String(t.name), days: remapped });
      summary.templates.written++;
    }

    // 6. issue report members
    const issueMembers = await sbFetchAll("issue_report_members", "user_id");
    summary.issueMembers.read = issueMembers.length;
    for (const m of issueMembers) {
      if (!ok(m.user_id)) continue;
      if (apply) await ctx.runMutation(internal.migration.upsertIssueReportMember, { userLegacyId: String(m.user_id) });
      summary.issueMembers.written++;
    }

    return summary;
  },
});

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checkedIngredients from "../checkedIngredients.js";
import type * as groceryItems from "../groceryItems.js";
import type * as images from "../images.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_shape from "../lib/shape.js";
import type * as mealPlans from "../mealPlans.js";
import type * as mealTemplates from "../mealTemplates.js";
import type * as recipes from "../recipes.js";
import type * as shoppingItems from "../shoppingItems.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checkedIngredients: typeof checkedIngredients;
  groceryItems: typeof groceryItems;
  images: typeof images;
  "lib/auth": typeof lib_auth;
  "lib/shape": typeof lib_shape;
  mealPlans: typeof mealPlans;
  mealTemplates: typeof mealTemplates;
  recipes: typeof recipes;
  shoppingItems: typeof shoppingItems;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

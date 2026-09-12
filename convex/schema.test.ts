import { describe, expect, it } from "vitest";
import { makeTest } from "./test.setup";

describe("schema", () => {
  it("accepts a user and a recipe", async () => {
    const t = makeTest();
    const recipeId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: "u1", email: "a@b.c" });
      return ctx.db.insert("recipes", {
        userId,
        title: "Toast",
        sourceUrl: "",
        isFavorite: false,
        ingredients: ["bread"],
        instructions: ["toast it"],
        tags: [],
      });
    });
    expect(recipeId).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

const scraped = { title: "P", image: null, ingredients: ["a"], instructions: ["b"], sourceUrl: "", tags: [] as string[] };

describe("images", () => {
  it("attaches an uploaded file and deletes the one it replaces", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const recipeId = await alice.mutation(api.recipes.create, scraped);
    const first = await t.run((ctx) => ctx.storage.store(new Blob(["one"])));
    const second = await t.run((ctx) => ctx.storage.store(new Blob(["two"])));

    const url = await alice.mutation(api.images.attach, { recipeId, storageId: first });
    expect(url).toBeTruthy();
    expect(await t.run((ctx) => ctx.db.get(recipeId))).toMatchObject({ imageStorageId: first, image: url });

    await alice.mutation(api.images.attach, { recipeId, storageId: second });
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.imageStorageId).toBe(second);
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).not.toBeNull();
  });

  it("refuses a storage id another user's recipe already points at", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const aliceRecipe = await alice.mutation(api.recipes.create, scraped);
    const bobRecipe = await bob.mutation(api.recipes.create, scraped);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["shared"])));

    await alice.mutation(api.images.attach, { recipeId: aliceRecipe, storageId });
    await expect(bob.mutation(api.images.attach, { recipeId: bobRecipe, storageId })).rejects.toThrow("File not found");
    expect((await t.run((ctx) => ctx.db.get(bobRecipe)))?.imageStorageId).toBeUndefined();
    // Alice's file survives the rejected attach.
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  it("rejects attaching to a recipe the caller does not own", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    const aliceRecipe = await alice.mutation(api.recipes.create, scraped);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await expect(bob.mutation(api.images.attach, { recipeId: aliceRecipe, storageId })).rejects.toThrow("Recipe not found");
  });

  it("discard deletes an unreferenced file and leaves a referenced one alone", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const recipeId = await alice.mutation(api.recipes.create, scraped);
    const orphan = await t.run((ctx) => ctx.storage.store(new Blob(["orphan"])));
    const attached = await t.run((ctx) => ctx.storage.store(new Blob(["attached"])));
    await alice.mutation(api.images.attach, { recipeId, storageId: attached });

    await alice.mutation(api.images.discard, { storageId: orphan });
    expect(await t.run((ctx) => ctx.storage.getUrl(orphan))).toBeNull();

    await alice.mutation(api.images.discard, { storageId: attached });
    expect(await t.run((ctx) => ctx.storage.getUrl(attached))).not.toBeNull();
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.imageStorageId).toBe(attached);
  });

  it("requires a signed-in user for uploads and discards", async () => {
    const t = makeTest();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await expect(t.mutation(api.images.generateUploadUrl, {})).rejects.toThrow("Unauthenticated");
    await expect(t.mutation(api.images.discard, { storageId })).rejects.toThrow("Unauthenticated");
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });
});

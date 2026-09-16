import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, makeTest } from "./test.setup";
describe("capture admission", () => {
  it("requires a provisioned authenticated user", async () => {
    const t = makeTest();
    await expect(
      t.mutation(api.imports.reserve, { importId: "abcdefghijklmnop" }),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.imports.reserve, { importId: "abcdefghijklmnop" }),
    ).rejects.toThrow();
  });
  it("reserves a fixed amount and rejects duplicate attempts", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    expect(
      (
        await alice.mutation(api.imports.reserve, {
          importId: "abcdefghijklmnop",
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await alice.mutation(api.imports.reserve, {
          importId: "abcdefghijklmnop",
        })
      ).reason,
    ).toBe("duplicate");
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.query("importBudgets").unique())?.reservedMicros,
      ),
    ).toBe(98_000);
  });
  it("enforces the global monthly ceiling atomically", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    await t.run((ctx) =>
      ctx.db.insert("importBudgets", {
        month: new Date().toISOString().slice(0, 7),
        reservedMicros: 4_999_000,
      }),
    );
    expect(
      (
        await alice.mutation(api.imports.reserve, {
          importId: "abcdefghijklmnop",
        })
      ).reason,
    ).toBe("budget");
    expect(
      await t.run((ctx) => ctx.db.query("importAttempts").collect()),
    ).toHaveLength(0);
  });
  it("limits each user to three attempts per minute", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    for (let i = 0; i < 3; i++)
      expect(
        (
          await alice.mutation(api.imports.reserve, {
            importId: `abcdefghijklmnop${i}`,
          })
        ).allowed,
      ).toBe(true);
    expect(
      (
        await alice.mutation(api.imports.reserve, {
          importId: "abcdefghijklmnop3",
        })
      ).reason,
    ).toBe("rate");
  });
});

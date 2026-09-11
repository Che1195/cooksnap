import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("issueReports", () => {
  it("enforces length caps and accepts a 120-character title", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.ensure, {});
    const base = { title: "Broken", description: "It broke", severity: "high" as const };
    await expect(alice.mutation(api.issueReports.create, { ...base, title: "x".repeat(121) })).rejects.toThrow("Title must be 1–120 characters");
    await expect(alice.mutation(api.issueReports.create, { ...base, description: "x".repeat(2001) })).rejects.toThrow("Description must be 1–2000 characters");
    await expect(alice.mutation(api.issueReports.create, { ...base, steps: "x".repeat(2001) })).rejects.toThrow("Steps must be at most 2000 characters");
    await expect(alice.mutation(api.issueReports.create, { ...base, pageUrl: "x".repeat(2001) })).rejects.toThrow("Page URL must be at most 2000 characters");
    const title = "x".repeat(120);
    const id = await alice.mutation(api.issueReports.create, { ...base, title });
    expect(await alice.query(api.issueReports.list, {})).toEqual([expect.objectContaining({ id, title })]);
  });

  it("any user can create and list; only members can set status", async () => {
    const t = makeTest();
    const alice = t.withIdentity(ALICE);
    const bob = t.withIdentity(BOB);
    const aliceId = await alice.mutation(api.users.ensure, {});
    await bob.mutation(api.users.ensure, {});
    await t.run(async (ctx) => { await ctx.db.insert("issueReportMembers", { userId: aliceId }); });
    const id = await bob.mutation(api.issueReports.create, { title: "Broken", description: "It broke", severity: "high" });
    expect((await alice.query(api.issueReports.list, {}))[0]).toMatchObject({ id, status: "open", reporterEmail: "bob@example.com" });
    await expect(bob.mutation(api.issueReports.setStatus, { id, status: "resolved" })).rejects.toThrow();
    await alice.mutation(api.issueReports.setStatus, { id, status: "resolved" });
    expect((await bob.query(api.issueReports.list, {}))[0].status).toBe("resolved");
    expect(await alice.query(api.users.isIssueMember, {})).toBe(true);
    expect(await bob.query(api.users.isIssueMember, {})).toBe(false);
  });
});

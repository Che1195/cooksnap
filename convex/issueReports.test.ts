import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { ALICE, BOB, makeTest } from "./test.setup";

describe("issueReports", () => {
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

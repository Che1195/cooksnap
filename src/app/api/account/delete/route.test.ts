import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn() }));
vi.mock("@/lib/convex/server", () => ({ getConvexToken: vi.fn() }));

import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { getConvexToken } from "@/lib/convex/server";
import { POST } from "./route";

const deleteUser = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  deleteUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(auth).mockResolvedValue({ userId: "user_1" } as Awaited<ReturnType<typeof auth>>);
  vi.mocked(clerkClient).mockResolvedValue({ users: { deleteUser } } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  vi.mocked(getConvexToken).mockResolvedValue("tok");
  vi.mocked(fetchMutation).mockReset().mockResolvedValue({ deleted: true });
});

describe("POST /api/account/delete", () => {
  it("returns 401 when there is no userId", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("returns 401 when the Convex token is missing", async () => {
    vi.mocked(getConvexToken).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("purges account data before deleting the Clerk user", async () => {
    const res = await POST();

    expect(fetchMutation).toHaveBeenCalledWith(api.users.deleteAccount, {}, { token: "tok" });
    expect(deleteUser).toHaveBeenCalledWith("user_1");
    expect(vi.mocked(fetchMutation).mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("continues Clerk deletion when the user is not provisioned", async () => {
    vi.mocked(fetchMutation).mockRejectedValue(new ConvexError("User not provisioned"));

    const res = await POST();

    expect(deleteUser).toHaveBeenCalledWith("user_1");
    expect(res.status).toBe(200);
  });

  it.each([new ConvexError("Unauthenticated"), new Error("User not provisioned")])(
    "stops before Clerk deletion for other purge failures: %s", async (error) => {
      vi.mocked(fetchMutation).mockRejectedValue(error);
      expect((await POST()).status).toBe(500);
      expect(clerkClient).not.toHaveBeenCalled();
    }
  );

  it("reports partial deletion when Clerk deletion fails", async () => {
    deleteUser.mockRejectedValue(new Error("Clerk unavailable"));

    const res = await POST();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Your data was removed but the sign-in account could not be deleted. Sign in again and retry.",
    });
    expect(fetchMutation).toHaveBeenCalledWith(api.users.deleteAccount, {}, { token: "tok" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
import { auth } from "@clerk/nextjs/server";
import { getConvexToken } from "./server";

type Session = Awaited<ReturnType<typeof auth>>;
const getToken = vi.fn<Session["getToken"]>();
function session(userId: string | null, aud?: string): Session {
  return { userId, sessionClaims: aud ? { aud } : null, getToken } as unknown as Session;
}
beforeEach(() => {
  vi.resetAllMocks();
  getToken.mockResolvedValue("convex-token");
});
describe("server Convex authentication", () => {
  it("uses the native integration session token without a JWT template", async () => {
    vi.mocked(auth).mockResolvedValue(session("test-user", "convex"));
    expect(await getConvexToken()).toBe("convex-token");
    expect(getToken).toHaveBeenCalledWith();
  });
  it.each([undefined, "other-service"])("retains legacy template support for audience %s", async (aud) => {
    vi.mocked(auth).mockResolvedValue(session("test-user", aud));
    expect(await getConvexToken()).toBe("convex-token");
    expect(getToken).toHaveBeenCalledWith({ template: "convex" });
  });
  it("does not request a token for an unauthenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(session(null));
    expect(await getConvexToken()).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
  });
  it("reuses the route's authenticated session", async () => {
    expect(await getConvexToken(session("test-user", "convex"))).toBe("convex-token");
    expect(auth).not.toHaveBeenCalled();
    expect(getToken).toHaveBeenCalledWith();
  });
});

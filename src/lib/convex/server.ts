import { auth } from "@clerk/nextjs/server";

export async function getConvexToken(
  existingSession?: Awaited<ReturnType<typeof auth>>,
): Promise<string | null> {
  const session = existingSession ?? await auth();
  if (!session.userId) return null;
  // Match ConvexProviderWithClerk: the native integration sets the audience
  // on session tokens and does not require a legacy JWT template.
  if (session.sessionClaims?.aud === "convex") return session.getToken();
  return session.getToken({ template: "convex" });
}

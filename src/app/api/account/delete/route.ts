import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { getConvexToken } from "@/lib/convex/server";

export async function POST() {
  const { userId } = await auth();
  const token = await getConvexToken();
  if (!userId || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await fetchMutation(api.users.deleteAccount, {}, { token });
  } catch (error) {
    if (!(error instanceof ConvexError && error.data === "User not provisioned")) {
      return NextResponse.json({ error: "Failed to delete account data" }, { status: 500 });
    }
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch {
    return NextResponse.json(
      { error: "Your data was removed but the sign-in account could not be deleted. Sign in again and retry." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

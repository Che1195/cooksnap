/**
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated user's account:
 * 1. Verifies the user's session via the anon client
 * 2. Deletes the Supabase Auth account via the admin client
 * 3. Deletes the profile row (cascades to all user data)
 *
 * Auth is deleted first so that if it fails, the user's data is still intact
 * and they can log in to try again. If profile deletion fails after auth is
 * already removed, we return an error noting partial deletion.
 */

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// R5-26: For production hardening, consider requiring re-authentication (e.g.
// password confirmation or OAuth re-consent) before account deletion to protect
// against session hijacking. Not implemented here as it requires UI changes.
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client for both operations — RLS has no delete policy on profiles
  const admin = createAdminClient();

  // Delete auth account first — if this fails, user data is intact and they can retry
  const { error: adminError } = await admin.auth.admin.deleteUser(user.id);

  if (adminError) {
    return NextResponse.json(
      { error: "Failed to delete auth account" },
      { status: 500 },
    );
  }

  // Delete profile row — cascades to recipes, meal plans, shopping list, etc.
  const { error: deleteError } = await admin
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Auth account deleted but failed to remove profile data. Please contact support." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

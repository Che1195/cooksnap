/**
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated user's account:
 * 1. Verifies the user's session via the anon client
 * 2. Deletes the profile row (cascades to all user data)
 * 3. Deletes the Supabase Auth account via the admin client
 */

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delete profile row — cascades to recipes, meal plans, shopping list, etc.
  const { error: deleteError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete account data" },
      { status: 500 },
    );
  }

  // Delete the auth account using the admin client
  const admin = createAdminClient();
  const { error: adminError } = await admin.auth.admin.deleteUser(user.id);

  if (adminError) {
    return NextResponse.json(
      { error: "Failed to delete auth account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

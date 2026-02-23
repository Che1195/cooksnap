import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Email confirmations have no `next` param — redirect to a lightweight
      // confirmation page that works in email mini-browsers.
      const destination = searchParams.has("next") ? next : "/auth/confirmed";
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // If there's no code or an error, redirect to login with error
  return NextResponse.redirect(`${origin}/login`);
}

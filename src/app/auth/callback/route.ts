import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const isEmailConfirm = searchParams.get("type") === "email_confirm";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isEmailConfirm && data.session) {
        // Pass session tokens via URL hash so the confirmed page can establish
        // the session in whatever browser it loads in (including Safari when the
        // user taps "Open in Safari" from the email app's in-app browser).
        // Hash fragments are never sent to the server, keeping tokens out of logs.
        const { access_token, refresh_token } = data.session;
        const hash = `#access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&token_type=bearer`;
        return NextResponse.redirect(`${origin}/auth/confirmed${hash}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If there's no code or an error, redirect to login with error
  return NextResponse.redirect(`${origin}/login`);
}

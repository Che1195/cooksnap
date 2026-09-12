import { SignUp } from "@clerk/nextjs";
import { authAppearance } from "@/lib/clerk-appearance";

export default function SignupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/" appearance={authAppearance} />
    </div>
  );
}

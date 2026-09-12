import { SignIn } from "@clerk/nextjs";
import { authAppearance } from "@/lib/clerk-appearance";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/" appearance={authAppearance} />
    </div>
  );
}

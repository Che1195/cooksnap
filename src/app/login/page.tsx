import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/" />
    </div>
  );
}

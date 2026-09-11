import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { BottomNav } from "@/components/bottom-nav";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { OfflineSupport } from "@/components/offline-support";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CookSnap",
  description: "Paste a recipe URL, get a clean recipe card",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CookSnap",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read CSP nonce set by the Clerk proxy for secure inline script execution (R3-6)
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">
          Skip to content
        </a>
        <ClerkProvider dynamic nonce={nonce} signInUrl="/login" signUpUrl="/signup">
          <ConvexClientProvider>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem nonce={nonce}>
              <OfflineSupport />
              <main id="main-content" className="mx-auto min-h-dvh max-w-lg pb-20">{children}</main>
              <BottomNav />
              <Toaster position="top-center" richColors />
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

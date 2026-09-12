import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/login(.*)",
  "/signup(.*)",
  "/api(.*)",
  "/manifest.webmanifest",
  "/sw.js",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublic(req)) await auth.protect();
  },
  {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "connect-src": ["https://*.convex.cloud", "wss://*.convex.cloud"],
        "img-src": ["https:", "data:"],
        "frame-ancestors": ["'none'"],
        // base-uri does not fall back to default-src; without it an injected
        // <base href> can redirect the relative script URLs that strict-dynamic
        // trusts.
        "base-uri": ["'self'"],
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

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

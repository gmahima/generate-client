import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define protected routes - anything not in this pattern is public by default
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/projects(.*)',
  '/api(.*)',
  '/supabase-example(.*)'
]);

export default clerkMiddleware(async (auth, req) => {
  // Only protect routes that match the pattern
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}; 
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PLACEHOLDER_ENV_VALUES = new Set(["", "***", "changeme", "change-me", "replace-me"]);

function hasUsableEnvValue(value: string | undefined): boolean {
  return Boolean(value && !PLACEHOLDER_ENV_VALUES.has(value.trim().toLowerCase()));
}

function hasClerkRuntimeConfig(): boolean {
  return hasUsableEnvValue(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && hasUsableEnvValue(process.env.CLERK_SECRET_KEY);
}

function passThrough() {
  return NextResponse.next();
}

// Clerk's auth() helper requires clerkMiddleware() to decorate requests. Keep the
// proxy fail-closed/opt-in while production Clerk env vars are being wired:
// without both keys, requests pass through and protected helpers return 401.
export default hasClerkRuntimeConfig() ? clerkMiddleware() : passThrough;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

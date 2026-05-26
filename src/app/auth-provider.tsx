"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!hasUsableClerkPublishableKey()) {
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}

"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { signalGenClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!hasUsableClerkPublishableKey()) {
    return <>{children}</>;
  }

  return <ClerkProvider appearance={signalGenClerkAppearance}>{children}</ClerkProvider>;
}

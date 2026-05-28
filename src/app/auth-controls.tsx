"use client";

import { OrganizationSwitcher, SignInButton, UserButton, useUser } from "@clerk/nextjs";

import { signalGenClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AuthControls() {
  if (!hasUsableClerkPublishableKey()) {
    return (
      <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
        Auth is not configured in this environment. Product APIs are protected and will require Clerk once real env values are set.
      </div>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
      {!isLoaded ? <span className="text-slate-400">Loading auth…</span> : null}
      {isLoaded && !isSignedIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-300">Sign in and choose a workspace before connecting product data.</span>
          <SignInButton mode="modal">
            <button className="rounded-full bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200">
              Sign in
            </button>
          </SignInButton>
        </div>
      ) : null}
      {isLoaded && isSignedIn ? (
        <>
          <span className="font-medium text-slate-200">Workspace</span>
          <OrganizationSwitcher
            appearance={signalGenClerkAppearance}
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal
            createOrganizationMode="modal"
            organizationProfileMode="modal"
          />
          <UserButton appearance={signalGenClerkAppearance} />
        </>
      ) : null}
    </div>
  );
}

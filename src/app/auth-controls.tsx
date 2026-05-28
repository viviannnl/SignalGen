"use client";

import { OrganizationSwitcher, SignInButton, UserButton, useUser } from "@clerk/nextjs";

import { signalGenClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AuthControls() {
  if (!hasUsableClerkPublishableKey()) {
    return (
      <div className="self-start rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
        Auth is not configured in this environment.
      </div>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="self-start rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-400">Loading auth…</div>;
  }

  if (!isSignedIn) {
    return (
      <div className="flex max-w-full self-start rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-1 text-sm text-slate-300 shadow-sm shadow-black/20">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <span>Sign in to save product feedback and repo-scoped signals.</span>
          <SignInButton mode="modal">
            <button className="rounded-full bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex self-start rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm text-slate-200 shadow-sm shadow-black/20">
      <div className="flex items-center gap-2 pl-4 pr-1">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Workspace</span>
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
      </div>
    </div>
  );
}

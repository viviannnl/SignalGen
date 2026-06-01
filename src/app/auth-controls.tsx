"use client";

import { OrganizationSwitcher, SignInButton, UserButton, useUser } from "@clerk/nextjs";

import { signalGenClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AuthControls() {
  if (!hasUsableClerkPublishableKey()) {
    return (
      <div className="self-start rounded-full border border-[var(--warning-line)] bg-[var(--warning-bg)] px-4 py-2 text-sm font-semibold text-[var(--warning)] shadow-[var(--shadow-sm)]">
        Auth is not configured in this environment.
      </div>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="self-start rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--ink-soft)] shadow-[var(--shadow-sm)]">Loading auth…</div>;
  }

  if (!isSignedIn) {
    return (
      <div className="flex max-w-full self-start rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--card)] p-1 text-sm text-[var(--ink-soft)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <span>Sign in to save product feedback and repo-scoped signals.</span>
          <SignInButton mode="modal">
            <button className="sg-btn sg-btn--primary sg-btn--sm" type="button">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex self-start rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--card)] p-1 text-sm text-[var(--ink)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 pl-4 pr-1">
        <span className="sg-eyebrow">Workspace</span>
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

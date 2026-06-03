"use client";

import { OrganizationSwitcher, SignInButton, UserButton, useUser } from "@clerk/nextjs";

import { signalGenClerkAppearance } from "@/lib/clerk-appearance";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";

export function AuthControls() {
  if (!hasUsableClerkPublishableKey()) {
    return (
      <div className="sg-ticked" style={{ alignSelf: "flex-start", borderRadius: "var(--rad-lg)", border: "1px solid var(--warning-line)", background: "var(--warning-bg)", boxShadow: "var(--shadow-card)", padding: "16px 20px", color: "var(--ink)", fontSize: 14.5, fontWeight: 700 }}>
        Auth is not configured in this environment.
      </div>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="sg-ticked" style={{ alignSelf: "flex-start", borderRadius: "var(--rad-lg)", border: "1px solid var(--line)", background: "var(--panel)", boxShadow: "var(--shadow-card)", padding: "16px 20px", color: "var(--ink-soft)", fontSize: 14 }}>
        Loading auth…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        className="sg-ticked"
        style={{
          width: "min(100%, 760px)",
          borderRadius: "var(--rad-lg)",
          border: "1px solid var(--line)",
          background: "color-mix(in srgb, var(--panel) 88%, var(--signal-soft))",
          boxShadow: "var(--shadow-card)",
          padding: "18px clamp(18px,3vw,26px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: "1 1 360px" }}>
            <div className="sg-eyebrow" style={{ marginBottom: 6 }}>Protected workspace</div>
            <div style={{ color: "var(--ink)", fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>Sign in to save product feedback and repo-scoped signals.</div>
            <p style={{ color: "var(--ink-soft)", margin: "6px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>SignalGen keeps sessions, decisions, and memory behind your account before loading or saving protected data.</p>
          </div>
          <SignInButton mode="modal">
            <button className="sg-btn sg-btn--primary sg-btn--lg" type="button">
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

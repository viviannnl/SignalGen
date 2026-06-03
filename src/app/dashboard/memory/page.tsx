"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button, Card, Eyebrow, Icon, MemoryEntry, Panel, Pill, StatGroup } from "@/components/ui";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";
import type { FounderDecisionAction, SignalGenRun, SignalGenRunStatus, SignalType } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };

type RunsResponse = {
  runs?: ApiRun[];
  error?: string;
};

type MemoryEntryRun = {
  title: string;
  type?: SignalType | string;
  status: SignalGenRunStatus;
  pipelineStatus: SignalGenRunStatus;
  updatedAt?: string;
  confidence?: number;
  evidence?: Array<{ frequency?: number }>;
  decision?: { note?: string; action?: FounderDecisionAction } | null;
  plan?: { filesToChange?: string[] } | null;
};

function subscribeToUrlStore() {
  return () => undefined;
}

function getUrlSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerUrlSnapshot() {
  return "";
}

function useUrlQuery() {
  return useSyncExternalStore(subscribeToUrlStore, getUrlSnapshot, getServerUrlSnapshot);
}

function getDashboardHref(repoConnectionId: string, tab: string) {
  const params = new URLSearchParams();
  if (repoConnectionId) params.set("repoConnectionId", repoConnectionId);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function getRunHref(runId: string, repoConnectionId: string, tab: string) {
  const params = new URLSearchParams();
  if (repoConnectionId) params.set("repoConnectionId", repoConnectionId);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return query ? `/dashboard/runs/${runId}?${query}` : `/dashboard/runs/${runId}`;
}

function getRunType(run: ApiRun): SignalType | string | undefined {
  return run.evidenceItems?.[0]?.clusterType ?? run.signalClusters?.[0]?.type;
}

function getEvidenceStats(run: ApiRun) {
  const evidence = run.evidenceItems && run.evidenceItems.length > 0
    ? run.evidenceItems
    : run.signalClusters && run.signalClusters.length > 0
      ? run.signalClusters
      : (run.signal?.evidence ?? []).map(() => ({ frequency: 1 }));
  const explicitComments = run.extractionDiagnostics?.commentCount ?? run.comments?.length ?? run.extractedComments?.length;
  const comments = typeof explicitComments === "number" && explicitComments > 0 ? explicitComments : evidence.reduce((total, item) => total + (item.frequency ?? 0), 0);
  return { evidence, comments, clusters: evidence.length };
}

function memoryStatusForRun(run: ApiRun): SignalGenRunStatus {
  if (run.founderDecision?.action === "approve") return "approved";
  if (run.founderDecision?.action === "reject") return "rejected";
  return run.status;
}

function isShippedToPr(run: ApiRun) {
  return Boolean(run.status === "pr_created" || run.pr?.url || run.implementation?.prDraft);
}

function toMemoryEntryRun(run: ApiRun): MemoryEntryRun {
  const stats = getEvidenceStats(run);
  return {
    title: run.signal?.title ?? "SignalGen run",
    type: getRunType(run),
    status: memoryStatusForRun(run),
    pipelineStatus: run.status,
    updatedAt: run.updatedAt,
    confidence: run.signal?.confidence ?? 0,
    evidence: stats.evidence,
    decision: run.founderDecision ?? null,
    plan: run.plan,
  };
}

function sortRunsByUpdatedAt(runs: ApiRun[]) {
  return [...runs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export default function MemoryPage() {
  if (!hasUsableClerkPublishableKey()) {
    return <MemoryContent authConfigured={false} authReady={false} isSignedIn={false} onSignIn={() => undefined} />;
  }

  return <ClerkMemoryPage />;
}

function ClerkMemoryPage() {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();

  return <MemoryContent authConfigured authReady={isLoaded} isSignedIn={Boolean(isSignedIn)} onSignIn={() => void clerk.openSignIn()} />;
}

function MemoryContent({ authConfigured, authReady, isSignedIn, onSignIn }: { authConfigured: boolean; authReady: boolean; isSignedIn: boolean; onSignIn: () => void }) {
  const router = useRouter();
  const urlQuery = useUrlQuery();
  const urlParams = new URLSearchParams(urlQuery);
  const repoConnectionId = urlParams.get("repoConnectionId") ?? "";
  const returnTab = urlParams.get("tab") ?? "new-analysis";
  const dashboardHref = getDashboardHref(repoConnectionId, returnTab);
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRuns() {
      if (authConfigured && !authReady) {
        if (isMounted) {
          setIsLoading(true);
          setError(null);
          setRuns([]);
        }
        return;
      }

      if (authConfigured && !isSignedIn) {
        if (isMounted) {
          setIsLoading(false);
          setError(null);
          setRuns([]);
        }
        return;
      }

      if (!repoConnectionId) {
        if (isMounted) {
          setIsLoading(false);
          setError(null);
          setRuns([]);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await fetch(`/api/runs?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as RunsResponse;
        if (!response.ok || !data.runs) {
          throw new Error(data.error ?? "Could not load SignalGen memory.");
        }
        if (isMounted) setRuns(sortRunsByUpdatedAt(data.runs));
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
          setRuns([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadRuns();
    return () => {
      isMounted = false;
    };
  }, [authConfigured, authReady, isSignedIn, repoConnectionId]);

  if (isLoading) {
    return <ShellState dashboardHref={dashboardHref} title="Loading memory…" body="SignalGen is loading the selected repo's run history from the existing run endpoint." />;
  }

  if (authConfigured && authReady && !isSignedIn) {
    return <SignedOutState dashboardHref={dashboardHref} onSignIn={onSignIn} />;
  }

  if (!repoConnectionId) {
    return <ShellState dashboardHref={dashboardHref} title="Choose a repo first" body="Memory is repo-scoped. Go back to the dashboard, choose a connected GitHub repo, then open the full memory timeline." tone="warning" />;
  }

  if (error) {
    return <ShellState dashboardHref={dashboardHref} title="Could not load memory" body={error} tone="error" />;
  }

  const shippedToPr = runs.filter(isShippedToPr).length;
  const awaitingApproval = runs.filter((run) => run.status === "plan_ready").length;

  return (
    <main className="sg-grid-bg min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,32px) 96px" }}>
      <div className="sg-memory-wrap" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
          <Icon name="arrowL" size={16} /> Back to dashboard
        </Link>

        <Card className="sg-ticked" style={{ background: "var(--hero-grad)", padding: "var(--pad-card)", marginBottom: 24 }}>
          <div className="memory-hero-grid">
            <div>
              <Eyebrow>MongoDB memory</Eyebrow>
              <h1 className="sg-display" style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.02, margin: "10px 0 12px" }}>Iteration memory</h1>
              <p style={{ fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 590, margin: 0 }}>
                The full feedback → signal → decision → PR chain for the selected repo, stored end-to-end. Months from now you can still answer “why did we ship this, and who approved it?”
              </p>
            </div>
            <Panel style={{ padding: 16, alignSelf: "start" }}>
              <Eyebrow soft style={{ marginBottom: 8 }}>Repo scope</Eyebrow>
              <div className="sg-mono" style={{ color: "var(--ink)", wordBreak: "break-word", fontSize: 13 }}>{repoConnectionId}</div>
              <p style={{ margin: "10px 0 0", color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.5 }}>Loaded via the existing /api/runs endpoint.</p>
            </Panel>
          </div>
          <StatGroup
            className="memory-stats"
            stats={[
              { value: runs.length, label: "runs in memory" },
              { value: shippedToPr, label: "shipped to PR" },
              { value: awaitingApproval, label: "awaiting approval" },
            ]}
          />
        </Card>

        {runs.length === 0 ? (
          <Card role="status" aria-live="polite" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
            <div style={{ color: "var(--ink-faint)", margin: "8px auto 14px", width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--inset)" }}><Icon name="clock" size={24} /></div>
            <Pill variant="outline">empty</Pill>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "12px 0 6px" }}>No runs yet</h2>
            <p style={{ color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 520, margin: "0 auto" }}>Create a SignalGen run from the dashboard to start building this repo&apos;s iteration memory.</p>
          </Card>
        ) : (
          <section aria-label="Run memory timeline" style={{ display: "flex", flexDirection: "column" }}>
            {runs.map((run) => {
              const href = getRunHref(run._id, repoConnectionId, returnTab);
              const stats = getEvidenceStats(run);
              return (
                <MemoryEntry
                  key={run._id}
                  s={toMemoryEntryRun(run)}
                  comments={stats.comments}
                  clusters={stats.clusters}
                  files={run.plan?.filesToChange?.length ?? 0}
                  onOpenSignal={() => router.push(href)}
                />
              );
            })}
          </section>
        )}
      </div>
      <style jsx>{`
        .memory-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 22px;
          align-items: start;
        }
        .memory-stats {
          margin-top: 20px;
        }
        @media (max-width: 920px) {
          .memory-hero-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .sg-memory-wrap {
            max-width: none;
          }
        }
      `}</style>
    </main>
  );
}

function ShellState({ dashboardHref, title, body, tone = "info" }: { dashboardHref: string; title: string; body: string; tone?: "info" | "warning" | "error" }) {
  return (
    <main className="sg-grid-bg min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,32px) 96px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
          <Icon name="arrowL" size={16} /> Back to dashboard
        </Link>
        <Card role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} aria-busy={title.startsWith("Loading") ? true : undefined} style={{ padding: "var(--pad-card)", borderColor: tone === "error" ? "var(--error-line)" : tone === "warning" ? "var(--warning-line)" : "var(--line)" }}>
          <Pill variant={tone === "error" ? "error" : tone === "warning" ? "warning" : "info"} dot>{tone}</Pill>
          <h1 className="sg-display" style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "16px 0 8px" }}>{title}</h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 620 }}>{body}</p>
        </Card>
      </div>
    </main>
  );
}

function SignedOutState({ dashboardHref, onSignIn }: { dashboardHref: string; onSignIn: () => void }) {
  return (
    <main className="sg-grid-bg min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,32px) 96px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
          <Icon name="arrowL" size={16} /> Back to dashboard
        </Link>
        <Card role="status" aria-live="polite" style={{ padding: "var(--pad-card)", borderColor: "var(--warning-line)" }}>
          <Pill variant="warning" dot>auth</Pill>
          <h1 className="sg-display" style={{ fontSize: "clamp(28px,3.4vw,42px)", margin: "16px 0 8px" }}>Sign in to view memory</h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 620 }}>
            The memory timeline is scoped to your Clerk workspace and selected repo. Sign in before SignalGen loads the protected run history.
          </p>
          <Button variant="signal" onClick={onSignIn} style={{ marginTop: 18 }} leftIcon={<Icon name="shield" size={16} />}>
            Sign in with Clerk
          </Button>
        </Card>
      </div>
    </main>
  );
}

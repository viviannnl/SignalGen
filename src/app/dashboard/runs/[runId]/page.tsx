"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useSyncExternalStore, useState } from "react";

import {
  Button,
  Card,
  Evidence,
  Eyebrow,
  Gauge,
  Icon,
  InfoList,
  MetricTile,
  Panel,
  Pill,
  PipelineRail,
  StrengthBar,
  Textarea,
  stageIndex,
} from "@/components/ui";
import { ThemeMenu } from "@/components/theme-menu";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";
import type { EvidenceItem, FounderDecisionAction, ImplementationJob, SignalDecision, SignalGenRun, SignalGenRunStatus, SignalSeverity, SignalType } from "@/lib/types";

// Fidelity note: the sg3-detail.jsx prototype includes Request changes and Save for later buttons.
// They are intentionally omitted here because the founder-decision API supports only approve/reject.

type ApiRun = SignalGenRun & { _id: string };

type RunResponse = {
  run?: ApiRun;
  implementationJob?: ImplementationJob | null;
  error?: string;
  ok?: boolean;
};

type DecisionResponse = RunResponse;

type ImplementationResponse = {
  implementation?: SignalGenRun["implementation"];
  error?: string;
};

type GateMode = "idle" | "reject";
type ActionState = "idle" | "approving" | "rejecting" | "starting" | "preparing";

type DetailEvidence = {
  id: string;
  title: string;
  quote: string;
  frequency: number;
  severity: SignalSeverity | string;
  confidence: number;
};

const DECISION_STATUS_COPY: Record<FounderDecisionAction, { label: string; variant: "success" | "error" }> = {
  approve: { label: "Approved by founder", variant: "success" },
  reject: { label: "Rejected · in memory", variant: "error" },
};

const REJECT_REASON_CHIPS = ["Not a priority now", "Out of scope", "Disagree with the signal", "Confidence too low"];

function typeMeta(type?: SignalType | string): { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" } {
  const map: Record<string, { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" }> = {
    feature_request: { label: "Feature request", variant: "signal" },
    friction: { label: "Friction", variant: "info" },
    bug: { label: "Bug", variant: "error" },
    trust_objection: { label: "Trust objection", variant: "warning" },
    pricing: { label: "Pricing", variant: "warning" },
    praise: { label: "Praise", variant: "success" },
    noise: { label: "Noise", variant: "outline" },
  };
  return map[type ?? ""] ?? { label: labelize(type), variant: "outline" };
}

function statusMeta(status?: SignalGenRunStatus | string): { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" } {
  const map: Record<string, { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" }> = {
    uploaded: { label: "Uploaded", variant: "outline" },
    signal_detected: { label: "Signal detected", variant: "info" },
    plan_ready: { label: "Awaiting approval", variant: "warning" },
    approved: { label: "Approved", variant: "success" },
    rejected: { label: "Rejected", variant: "error" },
    failed: { label: "Failed", variant: "error" },
    pr_created: { label: "PR draft ready", variant: "signal" },
    needs_review: { label: "Needs review", variant: "warning" },
    insufficient_evidence: { label: "Needs more evidence", variant: "info" },
  };
  return map[status ?? ""] ?? { label: labelize(status), variant: "outline" };
}

function decisionMeta(decision?: SignalDecision): { label: string; variant: "success" | "warning" | "error" | "info" | "outline" } {
  const map: Record<SignalDecision, { label: string; variant: "success" | "warning" | "error" | "info" | "outline" }> = {
    propose_plan: { label: "Plan proposed", variant: "success" },
    urgent_review: { label: "Urgent review", variant: "error" },
    needs_more_evidence: { label: "Needs more evidence", variant: "warning" },
    store_only: { label: "Stored only", variant: "outline" },
  };
  return decision ? map[decision] : { label: "Evidence", variant: "info" };
}

function labelize(value: string | undefined | null) {
  return value ? value.replaceAll("_", " ") : "Not available";
}

function slugBranch(title: string) {
  return `signalgen/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "signal"}`;
}

function realRunStage(run: ApiRun, actionState: ActionState, implementationJob?: ImplementationJob | null) {
  if (run.pr?.previewUrl || run.implementation?.prDraft?.previewUrl) return 8;
  if (run.pr?.url || implementationJob?.prUrl || run.implementation?.prDraft || run.status === "pr_created") return 7;
  if (actionState === "preparing" || run.implementation?.status === "running" || implementationJob?.status === "running") return 6;
  if (actionState === "starting" || run.implementation?.status === "queued" || implementationJob?.branchName) return 5;
  return stageIndex(run.status);
}

function observedLabel(value: boolean) {
  return value ? "Observed" : "Not observed yet";
}

function observedVariant(value: boolean): "success" | "outline" {
  return value ? "success" : "outline";
}

function runningStageFor(actionState: ActionState) {
  if (actionState === "approving") return 4;
  if (actionState === "starting") return 5;
  if (actionState === "preparing") return 6;
  return -1;
}

function getRunType(run: ApiRun): SignalType | string | undefined {
  return run.evidenceItems?.[0]?.clusterType ?? run.signalClusters?.[0]?.type;
}

function getDetailEvidence(run: ApiRun): DetailEvidence[] {
  if (run.evidenceItems && run.evidenceItems.length > 0) {
    return run.evidenceItems.map((item) => ({
      id: item.id,
      title: item.title,
      quote: item.summary,
      frequency: item.frequency,
      severity: item.severity,
      confidence: item.confidence,
    }));
  }

  if (run.signalClusters && run.signalClusters.length > 0) {
    return run.signalClusters.map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      quote: cluster.summary,
      frequency: cluster.frequency,
      severity: cluster.severity,
      confidence: cluster.confidence,
    }));
  }

  return (run.signal?.evidence ?? []).map((quote, index) => ({
    id: `signal-evidence-${index}`,
    title: `Evidence ${index + 1}`,
    quote,
    frequency: 1,
    severity: "medium",
    confidence: run.signal?.confidence ?? 0,
  }));
}

function getCommentCount(run: ApiRun, evidence: DetailEvidence[]) {
  const explicitCount = run.extractionDiagnostics?.commentCount ?? run.comments?.length ?? run.extractedComments?.length;
  if (typeof explicitCount === "number" && explicitCount > 0) return explicitCount;
  return evidence.reduce((total, item) => total + item.frequency, 0);
}

function getDashboardHref(repoConnectionId: string, tab: string) {
  const params = new URLSearchParams();
  if (repoConnectionId) params.set("repoConnectionId", repoConnectionId);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

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

export default function RunDetailPage() {
  if (!hasUsableClerkPublishableKey()) {
    return <RunDetailContent authConfigured={false} authReady={false} isSignedIn={false} onSignIn={() => undefined} />;
  }

  return <ClerkRunDetailPage />;
}

function ClerkRunDetailPage() {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();

  return <RunDetailContent authConfigured authReady={isLoaded} isSignedIn={Boolean(isSignedIn)} onSignIn={() => void clerk.openSignIn()} />;
}

function RunDetailContent({ authConfigured, authReady, isSignedIn, onSignIn }: { authConfigured: boolean; authReady: boolean; isSignedIn: boolean; onSignIn: () => void }) {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const urlQuery = useUrlQuery();
  const urlParams = new URLSearchParams(urlQuery);
  const repoConnectionId = urlParams.get("repoConnectionId") ?? "";
  const returnTab = urlParams.get("tab") ?? "all-signals";
  const [run, setRun] = useState<ApiRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [gateMode, setGateMode] = useState<GateMode>("idle");
  const [approvalNote, setApprovalNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [implementationJob, setImplementationJob] = useState<ImplementationJob | null>(null);

  async function reloadRun() {
    if (authConfigured && !isSignedIn) {
      setIsLoading(false);
      setRun(null);
      setIsNotFound(false);
      setError(null);
      return null;
    }

    if (!repoConnectionId) {
      setIsLoading(false);
      setRun(null);
      setIsNotFound(false);
      setError("Choose a repo before loading this SignalGen run. Go back to the dashboard and open the run from a selected repository.");
      return null;
    }

    const response = await fetch(`/api/runs/${runId}?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as RunResponse;

    if (response.status === 404) {
      setIsNotFound(true);
      setRun(null);
      return null;
    }

    if (!response.ok || !data.run) {
      throw new Error(data.error ?? "Could not load run details.");
    }

    setRun(data.run);
    setImplementationJob(data.implementationJob ?? null);
    return data.run;
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialRun() {
      if (authConfigured && !authReady) {
        if (isMounted) {
          setIsLoading(true);
          setRun(null);
          setIsNotFound(false);
          setError(null);
        }
        return;
      }

      if (authConfigured && !isSignedIn) {
        if (isMounted) {
          setIsLoading(false);
          setRun(null);
          setIsNotFound(false);
          setError(null);
        }
        return;
      }

      if (!repoConnectionId) {
        if (isMounted) {
          setIsLoading(false);
          setRun(null);
          setIsNotFound(false);
          setError("Choose a repo before loading this SignalGen run. Go back to the dashboard and open the run from a selected repository.");
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setError(null);
        setIsNotFound(false);
      }

      try {
        const response = await fetch(`/api/runs/${runId}?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as RunResponse;

        if (!isMounted) return;

        if (response.status === 404) {
          setIsNotFound(true);
          setRun(null);
          return;
        }

        if (!response.ok || !data.run) {
          throw new Error(data.error ?? "Could not load run details.");
        }

        setRun(data.run);
        setImplementationJob(data.implementationJob ?? null);
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
          setRun(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadInitialRun();
    return () => {
      isMounted = false;
    };
  }, [authConfigured, authReady, isSignedIn, repoConnectionId, runId]);

  const dashboardHref = getDashboardHref(repoConnectionId, returnTab);

  async function postDecision(action: FounderDecisionAction, note: string) {
    const response = await fetch(`/api/runs/${runId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, repoConnectionId }),
    });
    const data = (await response.json().catch(() => ({}))) as DecisionResponse;
    if (!response.ok || !data.run) {
      throw new Error(data.error ?? "Could not save founder decision.");
    }
    setRun(data.run);
    return data.run;
  }

  async function runImplementationAction(action: "start" | "prepare-pr") {
    const endpoint = action === "start" ? `/api/runs/${runId}/implement` : `/api/runs/${runId}/implementation/prepare-pr`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoConnectionId }),
    });
    const data = (await response.json().catch(() => ({}))) as ImplementationResponse & RunResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "Could not update implementation state.");
    }
    if (data.run) {
      setRun(data.run);
      return data.run;
    }
    await reloadRun();
    return null;
  }

  async function handleApprove() {
    if (!authReady || !isSignedIn) {
      onSignIn();
      return;
    }
    if (!run || run.status !== "plan_ready") return;
    setActionState("approving");
    setError(null);
    try {
      const decidedRun = await postDecision("approve", approvalNote);
      setGateMode("idle");
      if (!decidedRun.implementation) {
        setActionState("starting");
        await runImplementationAction("start");
      }
      const latestRun = await reloadRun();
      const runForPrDraft = latestRun ?? decidedRun;
      if (runForPrDraft.status === "approved" && runForPrDraft.implementation?.status === "queued" && !runForPrDraft.implementation.prDraft) {
        setActionState("preparing");
        await runImplementationAction("prepare-pr");
      }
      setActionState("idle");
      await reloadRun();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setActionState("idle");
    }
  }

  async function handleReject() {
    if (!authReady || !isSignedIn) {
      onSignIn();
      return;
    }
    if (!run || run.status !== "plan_ready" || rejectNote.trim().length === 0) return;
    setActionState("rejecting");
    setError(null);
    try {
      await postDecision("reject", rejectNote);
      setGateMode("idle");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setActionState("idle");
    }
  }

  if (isLoading) {
    return <ShellState dashboardHref={dashboardHref} title="Loading run details…" body="SignalGen is loading the repo-scoped run from memory." />;
  }

  if (authConfigured && authReady && !isSignedIn && !run) {
    return <SignedOutState dashboardHref={dashboardHref} onSignIn={onSignIn} />;
  }

  if (isNotFound) {
    return <ShellState dashboardHref={dashboardHref} title="Run not found" body="This run was not found for the selected workspace and repo." tone="warning" />;
  }

  if (error && !run) {
    return <ShellState dashboardHref={dashboardHref} title="Could not load run" body={error} tone="error" />;
  }

  if (!run) {
    return <ShellState dashboardHref={dashboardHref} title="Could not load run" body="Run details were unavailable." tone="error" />;
  }

  const evidence = getDetailEvidence(run);
  const commentCount = getCommentCount(run, evidence);
  const filesToChange = run.plan?.filesToChange ?? [];
  const acceptanceCriteria = run.plan?.acceptanceCriteria ?? [];
  const guardrails = run.plan?.guardrails ?? [];
  const typeInfo = typeMeta(getRunType(run));
  const statusInfo = statusMeta(run.status);
  const currentStage = realRunStage(run, actionState, implementationJob);
  const runningStage = runningStageFor(actionState);
  const isActionRunning = actionState !== "idle";
  const canDecide = run.status === "plan_ready";
  const decisionInfo = run.founderDecision ? DECISION_STATUS_COPY[run.founderDecision.action] : null;
  const branchName = implementationJob?.branchName ?? run.implementation?.branchName ?? run.implementation?.prDraft?.branchName ?? slugBranch(run.signal?.title ?? run._id);
  const prDraft = run.implementation?.prDraft;
  const testCommands = prDraft?.testCommands ?? [];
  const prChecklist = prDraft?.checklist ?? [];
  const prUrl = run.pr?.url ?? implementationJob?.prUrl;
  const previewUrl = run.pr?.previewUrl ?? prDraft?.previewUrl;
  const showPrPanel = Boolean(run.implementation || implementationJob || prDraft || run.status === "pr_created" || prUrl || previewUrl || isActionRunning);
  const branchObserved = Boolean(implementationJob?.branchName || run.implementation?.branchName);
  const checksObserved = Boolean(run.implementation?.status === "running" || implementationJob?.status === "running" || implementationJob?.status === "succeeded" || implementationJob?.status === "failed");
  const prObserved = Boolean(prUrl || run.status === "pr_created");
  const previewObserved = Boolean(previewUrl);

  return (
    <main className="sg-grid-bg min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,32px) 96px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
            <Icon name="arrowL" size={16} /> Back to signals
          </Link>
          <ThemeMenu />
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-9">
          <aside className="lg:sticky lg:top-5 lg:self-start">
            <Card style={{ padding: 24 }}>
              <Eyebrow style={{ marginBottom: 18 }}>Run pipeline</Eyebrow>
              <PipelineRail current={currentStage} running={isActionRunning} runningStage={runningStage} />
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                {decisionInfo ? <Pill variant={decisionInfo.variant} dot>{decisionInfo.label}</Pill> : <Pill variant="outline">Awaiting founder decision</Pill>}
                <Pill variant="outline">{run._id}</Pill>
              </div>
            </Card>
          </aside>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Card className="sg-ticked" style={{ background: "var(--hero-grad)", padding: "var(--pad-card)" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <Pill variant={typeInfo.variant}>{typeInfo.label}</Pill>
                <Pill variant={statusInfo.variant} dot>{statusInfo.label}</Pill>
                {run.founderDecision ? <Pill variant={decisionInfo?.variant ?? "outline"}>{run.founderDecision.action === "approve" ? "Decision: approve" : "Decision: reject"}</Pill> : null}
              </div>
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 className="sg-display" style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.02, marginBottom: 14 }}>{run.signal?.title ?? "SignalGen run"}</h1>
                  <p style={{ fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 620 }}>{run.signal?.summary ?? "This run is still building a signal from the uploaded feedback."}</p>
                  <div className="grid gap-3 sm:grid-cols-3" style={{ marginTop: 20 }}>
                    <MetricTile label="comments" value={commentCount} />
                    <MetricTile label="clusters" value={evidence.length} />
                    <MetricTile label="files" value={filesToChange.length} hint="from plan" />
                  </div>
                  <div style={{ marginTop: 20, maxWidth: 340 }}>
                    <StrengthBar value={run.signal?.confidence ?? 0} label="signal strength" />
                  </div>
                </div>
                <Gauge value={run.signal?.confidence ?? 0} size={132} stroke={12} label="confidence" />
              </div>
            </Card>

            <Card style={{ padding: "var(--pad-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <Eyebrow>Evidence · tuned from {commentCount} comments</Eyebrow>
                <span className="sg-meta">{evidence.length} clusters</span>
              </div>
              {evidence.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {evidence.map((item, index) => {
                    const itemDecision = run.evidenceItems?.find((e: EvidenceItem) => e.id === item.id)?.decision ?? run.signalClusters?.find((cluster) => cluster.id === item.id)?.decision;
                    const itemDecisionInfo = decisionMeta(itemDecision);
                    return (
                      <article key={item.id} className="sg-inset" style={{ padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 14.5, color: "var(--ink)" }}>{item.title}</strong>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Pill variant={item.severity === "high" ? "error" : item.severity === "medium" ? "warning" : "outline"}>{item.severity}</Pill>
                            <Pill variant={itemDecisionInfo.variant}>{itemDecisionInfo.label}</Pill>
                          </div>
                        </div>
                        <Evidence quote={item.quote} frequency={item.frequency} severity={item.severity} confidence={item.confidence} i={index} />
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Panel style={{ padding: 18 }}>
                  <strong>No evidence saved yet.</strong>
                  <p style={{ margin: "8px 0 0", color: "var(--ink-soft)", lineHeight: 1.55 }}>This run has not produced evidence clusters. Once comments are extracted and clustered, they will appear here.</p>
                </Panel>
              )}
            </Card>

            {run.plan ? (
              <Card style={{ padding: "var(--pad-card)" }}>
                <Eyebrow style={{ marginBottom: 14 }}>Implementation plan</Eyebrow>
                <Panel style={{ padding: 18, marginBottom: 22 }}>
                  <Eyebrow soft style={{ marginBottom: 6 }}>Recommended change</Eyebrow>
                  <div style={{ fontSize: 16, color: "var(--ink)", lineHeight: 1.55 }}>{run.plan.recommendedChange}</div>
                </Panel>
                <div className="grid gap-6 md:grid-cols-2">
                  <InfoList title="Files likely to change" items={filesToChange.length > 0 ? filesToChange : ["No files identified yet"]} icon="file" />
                  <InfoList title="Acceptance criteria" items={acceptanceCriteria.length > 0 ? acceptanceCriteria : ["No acceptance criteria generated yet"]} icon="check" accent="var(--success)" />
                </div>
                <div style={{ marginTop: 24 }}>
                  <InfoList title="Guardrails" items={guardrails.length > 0 ? guardrails : ["No guardrails generated yet"]} icon="shield" accent="var(--signal-2)" />
                </div>
              </Card>
            ) : (
              <Card style={{ padding: "var(--pad-card)", textAlign: "center" }}>
                <div style={{ color: "var(--ink-faint)", margin: "8px auto 14px", width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--inset)" }}><Icon name="clock" size={22} /></div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Plan not generated yet</h2>
                <p style={{ color: "var(--ink-soft)", fontSize: 14.5, maxWidth: 420, margin: "0 auto", lineHeight: 1.55 }}>SignalGen generates an implementation plan only after the run reaches the plan-ready stage.</p>
              </Card>
            )}

            <ApprovalGate
              run={run}
              canDecide={canDecide}
              authReady={authReady}
              isSignedIn={isSignedIn}
              actionState={actionState}
              error={error}
              gateMode={gateMode}
              approvalNote={approvalNote}
              rejectNote={rejectNote}
              onSignIn={onSignIn}
              onApprove={handleApprove}
              onReject={handleReject}
              onGateMode={setGateMode}
              onApprovalNote={setApprovalNote}
              onRejectNote={setRejectNote}
            />

            <Card style={{ padding: "var(--pad-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <Eyebrow>Implementation signals · observed by API</Eyebrow>
                <Pill variant={implementationJob ? "success" : "outline"} dot={Boolean(implementationJob)}>{implementationJob ? "Job record loaded" : "No job record yet"}</Pill>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Panel style={{ padding: 14 }}>
                  <Pill variant={observedVariant(branchObserved)} dot={branchObserved}>{observedLabel(branchObserved)}</Pill>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: "10px 0 4px" }}>Branch creation</h3>
                  <p className="sg-meta" style={{ margin: 0 }}>{branchObserved ? branchName : "Waiting for an implementation job branch."}</p>
                </Panel>
                <Panel style={{ padding: 14 }}>
                  <Pill variant={observedVariant(checksObserved)} dot={checksObserved}>{observedLabel(checksObserved)}</Pill>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: "10px 0 4px" }}>Build/tests</h3>
                  <p className="sg-meta" style={{ margin: 0 }}>{checksObserved ? `Job status: ${implementationJob?.status ?? run.implementation?.status}` : "No build/check API result is stored yet."}</p>
                </Panel>
                <Panel style={{ padding: 14 }}>
                  <Pill variant={observedVariant(prObserved)} dot={prObserved}>{observedLabel(prObserved)}</Pill>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: "10px 0 4px" }}>PR opened</h3>
                  <p className="sg-meta" style={{ margin: 0 }}>{prObserved ? (implementationJob?.prNumber ? `PR #${implementationJob.prNumber}` : "PR URL stored") : "No pull request URL is stored yet."}</p>
                </Panel>
                <Panel style={{ padding: 14 }}>
                  <Pill variant={observedVariant(previewObserved)} dot={previewObserved}>{observedLabel(previewObserved)}</Pill>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: "10px 0 4px" }}>Vercel preview</h3>
                  <p className="sg-meta" style={{ margin: 0 }}>{previewObserved ? "Preview URL stored" : "No Vercel deployment status is stored yet."}</p>
                </Panel>
              </div>
              <Panel style={{ marginTop: 16, padding: 14, background: "var(--signal-soft)", borderColor: "var(--line-2)" }}>
                <strong>Current data source:</strong>{" "}
                <span style={{ color: "var(--ink-soft)" }}>SignalGen stores PR URLs from the GitHub execution job; build results and Vercel previews need explicit status ingestion before this step can turn green automatically.</span>
              </Panel>
            </Card>

            {actionState === "preparing" && testCommands.length > 0 ? (
              <Card style={{ padding: "var(--pad-card)" }}>
                <Eyebrow style={{ marginBottom: 14 }}>Verification · running</Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {testCommands.map((command) => (
                    <Panel key={command} style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--mono)", fontSize: 13 }}>
                      <span className="sg-spin" style={{ display: "grid", color: "var(--signal)" }}><Icon name="refresh" size={14} /></span>
                      <span>{command}</span>
                    </Panel>
                  ))}
                </div>
              </Card>
            ) : null}

            {showPrPanel ? (
              <Card className="sg-fadeup" style={{ padding: "var(--pad-card)", borderColor: prDraft ? "var(--success-line)" : "var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  <Eyebrow style={{ color: prDraft ? "var(--success)" : "var(--signal)" }}>{prDraft ? "Draft pull request · ready for review" : "Implementation branch · preparing"}</Eyebrow>
                  <Pill variant={prDraft ? "success" : "info"} dot>{run.implementation?.status ?? (isActionRunning ? "running" : "queued")}</Pill>
                </div>
                <Panel style={{ padding: 18, marginBottom: 16 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--signal)", marginBottom: 6 }}>{branchName}</div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", margin: 0 }}>{prDraft?.title ?? `feat: ${(run.signal?.title ?? "signalgen update").toLowerCase()}`}</h2>
                  <div style={{ display: "flex", gap: 16, marginTop: 12, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-faint)", flexWrap: "wrap" }}>
                    <span>{filesToChange.length} files from plan</span><span aria-hidden="true">·</span>
                    <span>{testCommands.length} checks listed</span><span aria-hidden="true">·</span>
                    <span>repo-scoped run</span>
                  </div>
                  {run.implementation?.summary ? <p style={{ margin: "12px 0 0", color: "var(--ink-soft)", lineHeight: 1.55 }}>{run.implementation.summary}</p> : null}
                </Panel>
                {prChecklist.length > 0 ? <InfoList title="PR checklist" items={prChecklist} icon="check" accent="var(--success)" /> : null}
                {prDraft?.body ? <Panel style={{ marginTop: 16, padding: 16, whiteSpace: "pre-wrap", color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.55 }}>{prDraft.body}</Panel> : null}
                {(prUrl || previewUrl) ? (
                  <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                    {prUrl ? <a className="sg-btn sg-btn--primary" href={prUrl} target="_blank" rel="noreferrer"><Icon name="pr" size={16} /> View PR</a> : null}
                    {previewUrl ? <a className="sg-btn sg-btn--ghost" href={previewUrl} target="_blank" rel="noreferrer"><Icon name="eye" size={16} /> Open Vercel preview</a> : null}
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function ApprovalGate({
  run,
  canDecide,
  authReady,
  isSignedIn,
  actionState,
  error,
  gateMode,
  approvalNote,
  rejectNote,
  onSignIn,
  onApprove,
  onReject,
  onGateMode,
  onApprovalNote,
  onRejectNote,
}: {
  run: ApiRun;
  canDecide: boolean;
  authReady: boolean;
  isSignedIn: boolean;
  actionState: ActionState;
  error: string | null;
  gateMode: GateMode;
  approvalNote: string;
  rejectNote: string;
  onSignIn: () => void;
  onApprove: () => void;
  onReject: () => void;
  onGateMode: (mode: GateMode) => void;
  onApprovalNote: (note: string) => void;
  onRejectNote: (note: string) => void;
}) {
  const isBusy = actionState !== "idle";
  const decision = run.founderDecision;
  const gateTone = decision?.action === "approve" ? "success" : decision?.action === "reject" ? "error" : canDecide ? "signal" : "info";
  const iconName = decision?.action === "reject" ? "x" : "shield";
  const signedOut = authReady && !isSignedIn;

  return (
    <Card style={{ padding: "var(--pad-card)", borderColor: gateTone === "signal" ? "var(--signal)" : `var(--${gateTone}-line)`, boxShadow: canDecide && !decision ? "var(--glow)" : "var(--shadow-card)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ width: 46, height: 46, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: gateTone === "signal" ? "linear-gradient(135deg,var(--signal),var(--signal-2))" : `var(--${gateTone}-bg)`, color: gateTone === "signal" ? "#1a0a08" : `var(--${gateTone})` }}>
          <Icon name={iconName} size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow style={{ color: gateTone === "signal" ? "var(--signal-2)" : `var(--${gateTone})` }}>Approval gate · human in control</Eyebrow>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: "6px 0 4px" }}>
            {decision?.action === "approve"
              ? "Plan approved — SignalGen is implementing it"
              : decision?.action === "reject"
                ? "Plan rejected — kept in memory"
                : canDecide
                  ? "No code changes happen until you approve"
                  : "This run is not ready for a founder decision"}
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 620 }}>
            {decision?.action === "approve"
              ? "The existing implementation flow is allowed to create the guarded branch and prepare the PR draft for review."
              : decision?.action === "reject"
                ? "The signal and its evidence stay in memory. Nothing was implemented."
                : canDecide
                  ? "Review the change, affected files, acceptance criteria, and guardrails. SignalGen edits only the configured repo, on a branch, behind a PR."
                  : `Current stage: ${statusMeta(run.status).label}. The server accepts approve/reject only while the run status is plan_ready.`}
          </p>

          {signedOut ? (
            <Panel style={{ marginTop: 16, padding: 14, background: "var(--warning-bg)", borderColor: "var(--warning-line)" }}>
              <strong>Sign in required.</strong>
              <p style={{ margin: "6px 0 12px", color: "var(--ink-soft)", fontSize: 14 }}>Approving or rejecting is gated behind Clerk sign-in.</p>
              <Button variant="signal" size="sm" onClick={onSignIn}>Sign in to decide</Button>
            </Panel>
          ) : null}

          {!authReady ? (
            <Panel style={{ marginTop: 16, padding: 14, background: "var(--warning-bg)", borderColor: "var(--warning-line)" }}>
              <strong>Auth is not configured in this environment.</strong>
              <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: 14 }}>The decision API is still protected; configure Clerk or test with a signed-in environment.</p>
            </Panel>
          ) : null}

          {error ? <Panel role="alert" style={{ marginTop: 16, padding: 14, background: "var(--error-bg)", borderColor: "var(--error-line)", color: "var(--error)" }}>{error}</Panel> : null}

          {decision?.note ? (
            <Panel style={{ padding: "12px 15px", marginTop: 16, fontSize: 13.5, color: "var(--ink-soft)" }}>
              <b style={{ color: "var(--ink)" }}>Founder note:</b> {decision.note}
            </Panel>
          ) : null}

          {!decision && canDecide && gateMode === "idle" ? (
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 7 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>Optional approval note</span>
                <Textarea rows={3} value={approvalNote} onChange={(event) => onApprovalNote(event.target.value)} placeholder="Anything the implementation agent should keep in mind?" disabled={isBusy} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="signal" onClick={onApprove} loading={actionState === "approving" || actionState === "starting" || actionState === "preparing"} disabled={isBusy} leftIcon={<Icon name="check" size={16} />}>Approve plan</Button>
                <Button variant="danger" onClick={() => onGateMode("reject")} disabled={isBusy} leftIcon={<Icon name="x" size={15} />}>Reject</Button>
              </div>
            </div>
          ) : null}

          {!decision && canDecide && gateMode === "reject" ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
                {REJECT_REASON_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="sg-pill sg-pill--outline"
                    style={{ cursor: "pointer", border: "1px solid var(--line-2)" }}
                    onClick={() => onRejectNote(rejectNote ? `${rejectNote.trim()} ${chip}` : chip)}
                    disabled={isBusy}
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <label style={{ display: "grid", gap: 7 }}>
                <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>Rejection reason required</span>
                <Textarea rows={3} value={rejectNote} onChange={(event) => onRejectNote(event.target.value)} placeholder="Why are you rejecting this plan?" error={rejectNote.trim().length === 0} disabled={isBusy} />
                {rejectNote.trim().length === 0 ? <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Add a reason before confirming rejection.</span> : null}
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <Button variant="danger" onClick={onReject} loading={actionState === "rejecting"} disabled={rejectNote.trim().length === 0 || isBusy} leftIcon={<Icon name="x" size={15} />}>Confirm rejection</Button>
                <Button variant="ghost" onClick={() => onGateMode("idle")} disabled={isBusy}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ShellState({ dashboardHref, title, body, tone = "info" }: { dashboardHref: string; title: string; body: string; tone?: "info" | "warning" | "error" }) {
  return (
    <main className="sg-grid-bg min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,32px) 96px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
            <Icon name="arrowL" size={16} /> Back to signals
          </Link>
          <ThemeMenu />
        </div>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>
            <Icon name="arrowL" size={16} /> Back to signals
          </Link>
          <ThemeMenu />
        </div>
        <Card className="sg-grid-bg sg-ticked" role="status" aria-live="polite" style={{ padding: "clamp(28px,5vw,52px)", borderColor: "var(--warning-line)", background: "var(--hero-grad)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 18, alignItems: "start" }}>
            <span style={{ width: 62, height: 62, borderRadius: 18, display: "grid", placeItems: "center", background: "var(--inset)", color: "var(--signal)", border: "1px dashed var(--line-2)", boxShadow: "var(--shadow-card)" }}>
              <Icon name="shield" size={28} />
            </span>
            <div>
              <Eyebrow>Protected run detail</Eyebrow>
              <h1 className="sg-display" style={{ fontSize: "clamp(32px,4.4vw,52px)", lineHeight: 0.98, margin: "12px 0 12px" }}>Sign in to view this run</h1>
              <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, fontSize: 16, maxWidth: 700, margin: 0 }}>
                Run details and founder decisions are scoped to your Clerk workspace and selected repo. Sign in before SignalGen loads the protected run or calls any approval API.
              </p>
            </div>
          </div>
          <Panel style={{ marginTop: 26, padding: 18, background: "color-mix(in srgb, var(--panel) 82%, var(--signal-soft))" }}>
            <div style={{ display: "grid", gap: 10 }}>
              {["No run detail API call is made while signed out.", "Approval and rejection actions stay unavailable until auth is ready.", "Use the dashboard repo selector first if this link is missing repo context."].map((item) => (
                <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.5 }}>
                  <span style={{ color: "var(--signal)", flex: "none", marginTop: 3 }}><Icon name="check" size={15} /></span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="signal" size="lg" onClick={onSignIn} leftIcon={<Icon name="shield" size={17} />}>
              Sign in with Clerk
            </Button>
            <Link href={dashboardHref} className="sg-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
              Back to repo dashboard <Icon name="arrow" size={15} />
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}

"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ThemeMenu } from "@/components/theme-menu";
import { Button, Card, Evidence, Eyebrow, Gauge, Icon, InfoList, MetricTile, Panel, Pill, PipelineRail, StrengthBar, Textarea, stageIndex } from "@/components/ui";
import { hasUsableClerkPublishableKey } from "@/lib/clerk-env";
import type { EvidenceItem, FounderDecisionAction, ImplementationJob, ProductSignal, SignalGenRun, SignalPlan, SignalSeverity, SignalType } from "@/lib/types";

type ApiSignal = ProductSignal & { _id: string };
type ApiRun = Pick<SignalGenRun, "_id" | "status" | "founderDecision" | "implementation" | "pr"> & { _id: string; prUrl?: string; previewUrl?: string };
type SignalResponse = { ok?: boolean; signal?: ApiSignal; plan?: SignalPlan | null; run?: ApiRun | null; implementationJob?: ImplementationJob | null; error?: string };
type ActionState = "idle" | "approving" | "rejecting";
type GateMode = "idle" | "reject";

type DetailEvidence = {
  id: string;
  title: string;
  quote: string;
  frequency: number;
  severity: SignalSeverity | string;
  confidence: number;
};

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

function statusMeta(status?: ProductSignal["status"] | string, run?: ApiRun | null): { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" } {
  if (status === "implemented" && run?.status === "pr_created") return { label: "PR draft ready", variant: "signal" };
  const map: Record<string, { label: string; variant: "success" | "warning" | "error" | "info" | "signal" | "outline" }> = {
    accumulating: { label: "Accumulating", variant: "info" },
    needs_more_evidence: { label: "Needs more evidence", variant: "info" },
    plan_ready: { label: "Awaiting approval", variant: "warning" },
    approved: { label: "Approved", variant: "success" },
    rejected: { label: "Rejected", variant: "error" },
    implemented: { label: "Implemented", variant: "signal" },
  };
  return map[status ?? ""] ?? { label: labelize(status), variant: "outline" };
}

function labelize(value: string | undefined | null) {
  return value ? value.replaceAll("_", " ") : "Not available";
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function getDashboardHref(repoConnectionId: string, tab = "all-signals") {
  const params = new URLSearchParams();
  if (repoConnectionId) params.set("repoConnectionId", repoConnectionId);
  params.set("tab", tab);
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

function detailEvidence(signal: ApiSignal): DetailEvidence[] {
  return (signal.evidenceItems ?? []).map((item: EvidenceItem) => ({
    id: item.id,
    title: item.title,
    quote: item.summary,
    frequency: item.frequency,
    severity: item.severity,
    confidence: item.confidence,
  }));
}

function signalStage(signal: ApiSignal, plan?: SignalPlan | null, run?: ApiRun | null, implementationJob?: ImplementationJob | null) {
  if (run?.status === "pr_created" || signal.status === "implemented" || run?.prUrl || implementationJob?.prUrl) return 7;
  if (run?.implementation?.status === "running" || implementationJob?.status === "running") return 6;
  if (run?.implementation?.branchName || implementationJob?.branchName) return 5;
  if (signal.status === "approved") return stageIndex("approved");
  if (signal.status === "plan_ready" || plan) return stageIndex("plan_ready");
  if (signal.status === "accumulating" || signal.status === "needs_more_evidence") return stageIndex("signal_detected");
  return stageIndex(signal.status);
}

function decisionLabel(action?: FounderDecisionAction) {
  if (action === "approve") return "Approved";
  if (action === "reject") return "Rejected";
  return "Decision saved";
}

export default function SignalDetailPage() {
  if (!hasUsableClerkPublishableKey()) {
    return <SignalDetailContent authConfigured={false} authReady={false} isSignedIn={false} onSignIn={() => undefined} />;
  }
  return <ClerkSignalDetailPage />;
}

function ClerkSignalDetailPage() {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  return <SignalDetailContent authConfigured authReady={isLoaded} isSignedIn={Boolean(isSignedIn)} onSignIn={() => void clerk.openSignIn()} />;
}

function SignalDetailContent({ authConfigured, authReady, isSignedIn, onSignIn }: { authConfigured: boolean; authReady: boolean; isSignedIn: boolean; onSignIn: () => void }) {
  const params = useParams<{ signalId: string }>();
  const signalId = params.signalId;
  const urlQuery = useUrlQuery();
  const urlParams = new URLSearchParams(urlQuery);
  const repoConnectionId = urlParams.get("repoConnectionId") ?? "";
  const [signal, setSignal] = useState<ApiSignal | null>(null);
  const [plan, setPlan] = useState<SignalPlan | null>(null);
  const [run, setRun] = useState<ApiRun | null>(null);
  const [implementationJob, setImplementationJob] = useState<ImplementationJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateMode, setGateMode] = useState<GateMode>("idle");
  const [approvalNote, setApprovalNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");

  const reloadSignal = useCallback(async () => {
    if (authConfigured && !isSignedIn) {
      setIsLoading(false);
      setSignal(null);
      return null;
    }
    if (!repoConnectionId) {
      setIsLoading(false);
      setSignal(null);
      setError("Choose a repo before loading this SignalGen signal. Go back to the dashboard and open the signal from a selected repository.");
      return null;
    }
    const response = await fetch(`/api/signals/${signalId}?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as SignalResponse;
    if (response.status === 404) {
      setIsNotFound(true);
      setSignal(null);
      return null;
    }
    if (!response.ok || !data.signal) throw new Error(data.error ?? "Could not load signal details.");
    setSignal(data.signal);
    setPlan(data.plan ?? null);
    setRun(data.run ?? null);
    setImplementationJob(data.implementationJob ?? null);
    return data.signal;
  }, [authConfigured, isSignedIn, repoConnectionId, signalId]);

  useEffect(() => {
    let isMounted = true;
    async function loadInitialSignal() {
      if (authConfigured && !authReady) return;
      try {
        if (isMounted) {
          setIsLoading(true);
          setError(null);
          setIsNotFound(false);
        }
        await reloadSignal();
      } catch (caughtError) {
        if (isMounted) setError(caughtError instanceof Error ? caughtError.message : "Could not load signal details.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadInitialSignal();
    return () => {
      isMounted = false;
    };
  }, [authConfigured, authReady, reloadSignal]);

  async function decide(action: FounderDecisionAction) {
    if (!run?._id || !repoConnectionId) return;
    setActionState(action === "approve" ? "approving" : "rejecting");
    setError(null);
    try {
      const note = action === "approve" ? approvalNote : rejectNote;
      const response = await fetch(`/api/runs/${run._id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, repoConnectionId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save founder decision.");
      }
      setGateMode("idle");
      await reloadSignal();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save founder decision.");
    } finally {
      setActionState("idle");
    }
  }

  const backHref = getDashboardHref(repoConnectionId, "all-signals");
  const evidence = signal ? detailEvidence(signal) : [];
  const meta = signal ? typeMeta(signal.type) : typeMeta();
  const status = signal ? statusMeta(signal.status, run) : statusMeta();
  const currentStage = signal ? signalStage(signal, plan, run, implementationJob) : 0;
  const sourceRunHref = run?._id ? `/dashboard/runs/${run._id}?repoConnectionId=${encodeURIComponent(repoConnectionId)}&tab=all-signals` : "";
  const hasPlanReadySourceRun = Boolean(signal?.status === "plan_ready" && plan && run?._id && run.status === "plan_ready");
  const canAttemptDecision = Boolean(signal?.status === "plan_ready" && plan);
  const prUrl = run?.prUrl ?? implementationJob?.prUrl;
  const previewUrl = run?.previewUrl;
  const outcomeDecision = plan?.approvalDecision ?? run?.founderDecision;

  return (
    <main className="sg-grid-bg" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", padding: "28px clamp(16px,4vw,44px) 56px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="sg-link" href={backHref} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="arrow" size={16} /> Back to signals</Link>
          <ThemeMenu />
        </header>

        {authConfigured && !authReady ? <Card style={{ padding: 22 }}>Loading session...</Card> : null}
        {authConfigured && authReady && !isSignedIn ? (
          <Card style={{ padding: 24 }}>
            <Eyebrow>Sign in required</Eyebrow>
            <h1 className="sg-display" style={{ margin: "10px 0", fontSize: 28 }}>Open your SignalGen workspace</h1>
            <Button variant="signal" onClick={onSignIn}>Sign in</Button>
          </Card>
        ) : null}
        {error ? <Panel role="alert" style={{ borderColor: "var(--error-line)", background: "var(--error-bg)", color: "var(--error)", padding: 16 }}>{error}</Panel> : null}
        {isLoading ? <Card style={{ padding: 24 }}>Loading signal detail...</Card> : null}
        {isNotFound ? <Card style={{ padding: 24 }}>Signal not found for this repo.</Card> : null}

        {!isLoading && signal ? (
          <>
            <Card style={{ padding: "var(--pad-card)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px", gap: 24, alignItems: "start" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    <Pill variant={meta.variant}>{meta.label}</Pill>
                    <Pill variant={status.variant} dot>{status.label}</Pill>
                  </div>
                  <h1 className="sg-display" style={{ fontSize: "clamp(34px,5vw,64px)", lineHeight: 0.95, margin: 0 }}>{signal.title}</h1>
                  <p style={{ margin: "16px 0 0", color: "var(--ink-soft)", lineHeight: 1.6, fontSize: 16, maxWidth: 780 }}>{signal.summary}</p>
                  <div style={{ marginTop: 18, maxWidth: 520 }}><StrengthBar value={signal.strength ?? 0} label="signal strength" /></div>
                </div>
                <Gauge value={signal.confidence ?? 0} size={148} stroke={12} label="confidence" sub="signal" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 22 }}>
                <MetricTile label="Evidence" value={evidence.length} />
                <MetricTile label="Files" value={plan?.filesToChange?.length ?? 0} />
                <MetricTile label="Criteria" value={plan?.acceptanceCriteria?.length ?? 0} />
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,360px) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
              <Card style={{ padding: 22 }}>
                <Eyebrow>Pipeline</Eyebrow>
                <PipelineRail current={currentStage} running={actionState !== "idle"} runningStage={actionState === "approving" ? 4 : -1} />
              </Card>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Card style={{ padding: 22 }}>
                  <Eyebrow>Evidence</Eyebrow>
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    {evidence.length > 0 ? evidence.map((item, index) => <Evidence key={item.id} e={{ quote: item.quote, frequency: item.frequency, severity: item.severity, confidence: item.confidence }} i={index} />) : <Panel style={{ padding: 14, color: "var(--ink-soft)" }}>No saved evidence items for this signal yet.</Panel>}
                  </div>
                </Card>

                <Card style={{ padding: 22 }}>
                  <Eyebrow>Plan</Eyebrow>
                  {plan ? (
                    <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
                      <Panel style={{ padding: 16 }}><p style={{ margin: 0, lineHeight: 1.55 }}>{plan.recommendedChange}</p></Panel>
                      <InfoList title="Files to change" items={plan.filesToChange} />
                      <InfoList title="Guardrails" items={plan.guardrails} />
                      <InfoList title="Acceptance criteria" items={plan.acceptanceCriteria} />
                    </div>
                  ) : <Panel style={{ padding: 14, color: "var(--ink-soft)", marginTop: 12 }}>No plan has been generated for this signal yet.</Panel>}
                </Card>

                {canAttemptDecision ? (
                  <Card style={{ padding: 22 }}>
                    <Eyebrow>Founder approval gate</Eyebrow>
                    {hasPlanReadySourceRun ? (
                      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                        <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.55 }}>Approval is run-scoped in this codebase, so this button records the decision on the plan-ready source run linked to this signal.</p>
                        {gateMode === "reject" ? (
                          <Textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Why reject this plan?" />
                        ) : (
                          <Textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Optional approval note for the agent." />
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Button variant="success" disabled={actionState !== "idle"} loading={actionState === "approving"} onClick={() => void decide("approve")}>Approve plan</Button>
                          {gateMode === "reject" ? <Button variant="danger" disabled={actionState !== "idle"} loading={actionState === "rejecting"} onClick={() => void decide("reject")}>Confirm rejection</Button> : <Button variant="danger" disabled={actionState !== "idle"} onClick={() => setGateMode("reject")}>Reject plan</Button>}
                        </div>
                      </div>
                    ) : (
                      <Panel style={{ marginTop: 12, padding: 16 }}>
                        {/* Approval remains run-scoped because POST /api/runs/[runId]/decision requires a plan_ready run; when no matching run is resolvable, the signal page must be read-only instead of posting to the wrong run. */}
                        <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.55 }}>This signal has a plan, but SignalGen could not resolve a plan-ready source run for a safe decision write.</p>
                        {sourceRunHref ? <Link className="sg-link" href={sourceRunHref} style={{ display: "inline-flex", marginTop: 12 }}>View source run to decide</Link> : null}
                      </Panel>
                    )}
                  </Card>
                ) : null}

                <Card style={{ padding: 22 }}>
                  <Eyebrow>Outcome</Eyebrow>
                  {outcomeDecision ? (
                    <Panel style={{ padding: 16, marginTop: 12 }}>
                      <Pill variant={outcomeDecision.action === "approve" ? "success" : "error"}>{decisionLabel(outcomeDecision.action)}</Pill>
                      <p style={{ margin: "10px 0 0", color: "var(--ink-soft)" }}>{formatDate(outcomeDecision.decidedAt)}</p>
                      {outcomeDecision.note ? <p style={{ margin: "10px 0 0", lineHeight: 1.55 }}>“{outcomeDecision.note}”</p> : null}
                    </Panel>
                  ) : <p style={{ color: "var(--ink-soft)", lineHeight: 1.55 }}>No founder outcome has been recorded for this signal yet.</p>}
                  <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {prUrl ? <a className="sg-btn sg-btn--signal" href={prUrl} target="_blank" rel="noreferrer">Open PR</a> : null}
                    {previewUrl ? <a className="sg-btn sg-btn--ghost" href={previewUrl} target="_blank" rel="noreferrer">Open preview</a> : null}
                    {sourceRunHref ? <Link className="sg-btn sg-btn--ghost" href={sourceRunHref}>View source run</Link> : null}
                  </div>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

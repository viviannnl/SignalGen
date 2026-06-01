"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { SignalDecision, SignalGenRun, SignalGenRunStatus } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };

type RunResponse = {
  run?: ApiRun;
  error?: string;
};

const statusBadgeStyles: Record<SignalGenRunStatus, string> = {
  uploaded: "sg-pill sg-pill--outline",
  signal_detected: "sg-pill sg-pill--info",
  plan_ready: "sg-pill sg-pill--success",
  approved: "sg-pill sg-pill--success",
  rejected: "sg-pill sg-pill--error",
  failed: "sg-pill sg-pill--error",
  pr_created: "sg-pill sg-pill--info",
  needs_review: "sg-pill sg-pill--warning",
  insufficient_evidence: "sg-pill sg-pill--outline",
};

const decisionBadgeStyles: Record<SignalDecision, string> = {
  propose_plan: "sg-pill sg-pill--success",
  urgent_review: "sg-pill sg-pill--error",
  needs_more_evidence: "sg-pill sg-pill--warning",
  store_only: "sg-pill sg-pill--outline",
};

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const [run, setRun] = useState<ApiRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRun() {
      setIsLoading(true);
      setError(null);
      setIsNotFound(false);

      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as RunResponse;

        if (response.status === 404) {
          if (isMounted) {
            setIsNotFound(true);
            setRun(null);
          }
          return;
        }

        if (!response.ok || !data.run) {
          throw new Error(data.error ?? "Could not load run details.");
        }

        if (isMounted) {
          setRun(data.run);
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
          setRun(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRun();

    return () => {
      isMounted = false;
    };
  }, [runId]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-8 text-[var(--ink)] sm:px-10 sm:pb-20">
        <p className="text-[var(--ink-soft)]">Loading run details...</p>
      </main>
    );
  }

  if (isNotFound) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--ink)] sm:px-10 sm:pb-20">
        <div className="mx-auto max-w-4xl sg-card p-6">
          <Link href="/dashboard" className="sg-link text-sm">
            ← Dashboard
          </Link>
          <p className="mt-6 text-lg text-[var(--ink)]">Run not found.</p>
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--ink)] sm:px-10 sm:pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-[var(--error-line)] bg-[var(--error-bg)] p-6 text-[var(--error)]">
          <Link href="/dashboard" className="sg-link text-sm">
            ← Dashboard
          </Link>
          <p className="mt-6">{error ?? "Could not load run details."}</p>
        </div>
      </main>
    );
  }

  const signalEvidence = run.signal?.evidence ?? [];
  const comments = run.comments ?? [];
  const filesToChange = run.plan?.filesToChange ?? [];
  const acceptanceCriteria = run.plan?.acceptanceCriteria ?? [];
  const guardrails = run.plan?.guardrails ?? [];
  const prChecklist = run.implementation?.prDraft?.checklist ?? [];

  return (
    <main className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--ink)] sm:px-10 sm:pb-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="sg-card p-6">
          <Link href="/dashboard" className="sg-link text-sm">
            ← Dashboard
          </Link>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="sg-eyebrow">Run detail</p>
              <h1 className="mt-3 break-all text-3xl font-semibold tracking-tight">{run._id}</h1>
              <p className="mt-2 text-sm text-[var(--ink-faint)]">Created {new Date(run.createdAt).toLocaleString()}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusBadgeStyles[run.status] ?? "bg-slate-300/10 text-[var(--ink-soft)]"}`}>
              {run.status}
            </span>
          </div>
        </header>

        {run.signal ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Signal</p>
            <div className="mt-5 sg-panel sg-panel--cream p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{run.signal.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{run.signal.summary}</p>
                </div>
                <span className="sg-pill sg-pill--success">
                  {Math.round((run.signal.confidence ?? 0) * 100)}%
                </span>
              </div>
              <ListBlock title="Evidence" items={signalEvidence} />
            </div>
          </section>
        ) : null}

        {run.signalClusters && run.signalClusters.length > 0 ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Signal clusters</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {run.signalClusters.map((cluster) => (
                <article key={cluster.id} className="sg-panel sg-panel--cream p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="sg-pill sg-pill--rose">{cluster.type}</span>
                    <span className={`${decisionBadgeStyles[cluster.decision]}`}>{cluster.decision}</span>
                    <span className="sg-pill sg-pill--outline">Severity: {cluster.severity}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">{cluster.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{cluster.summary}</p>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <Metric label="Frequency" value={cluster.frequency.toString()} />
                    <Metric label="Confidence" value={`${Math.round(cluster.confidence * 100)}%`} />
                  </dl>
                  <p className="mt-5 sg-eyebrow">Rationale</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{cluster.rationale}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {run.comments ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Extracted comments</p>
            <div className="mt-5 max-h-96 overflow-auto sg-panel sg-panel--cream p-5">
              <ul className="space-y-3 text-sm leading-6 text-[var(--ink-soft)]">
                {comments.length > 0 ? comments.map((comment, index) => <li key={`${comment}-${index}`}>• {comment}</li>) : <li className="text-[var(--ink-faint)]">No comments extracted yet.</li>}
              </ul>
            </div>
          </section>
        ) : null}

        {run.plan ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Implementation plan</p>
            <div className="mt-5 sg-panel sg-panel--cream p-5">
              <p className="text-sm text-[var(--ink-faint)]">Recommended change</p>
              <p className="mt-2 text-[var(--ink)]">{run.plan.recommendedChange}</p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <ListBlock title="Files to change" items={filesToChange} />
                <ListBlock title="Acceptance criteria" items={acceptanceCriteria} />
                <ListBlock title="Guardrails" items={guardrails} />
              </div>
            </div>
          </section>
        ) : null}

        {run.founderDecision ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Founder decision</p>
            <div className="mt-5 sg-panel sg-panel--cream p-5">
              <p className="text-lg font-semibold">{run.founderDecision.action === "approve" ? "Approved" : "Rejected"}</p>
              <p className="mt-2 text-sm text-[var(--ink-faint)]">{new Date(run.founderDecision.decidedAt).toLocaleString()}</p>
              {run.founderDecision.note ? <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{run.founderDecision.note}</p> : null}
            </div>
          </section>
        ) : null}

        {run.implementation ? (
          <section className="sg-card p-6">
            <p className="sg-eyebrow">Implementation job</p>
            <div className="mt-5 sg-panel sg-panel--cream p-5">
              <div className="flex flex-wrap gap-2">
                <span className="sg-pill sg-pill--info">{run.implementation.status}</span>
                <span className="sg-pill sg-pill--outline">{run.implementation.branchName}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--ink)]">{run.implementation.summary}</p>
              {run.implementation.prDraft ? (
                <div className="mt-5 sg-panel sg-panel--cream p-5">
                  <p className="text-sm text-[var(--ink-faint)]">PR draft</p>
                  <h2 className="mt-2 text-xl font-semibold">{run.implementation.prDraft.title}</h2>
                  <ListBlock title="Checklist" items={prChecklist} />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sg-panel sg-panel--cream p-4">
      <dt className="sg-eyebrow sg-eyebrow--soft">{label}</dt>
      <dd className="mt-2 font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5 sg-card p-5">
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-soft)]">
        {items.length > 0 ? items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>) : <li className="text-[var(--ink-faint)]">No items yet.</li>}
      </ul>
    </div>
  );
}

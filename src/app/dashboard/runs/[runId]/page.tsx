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
  uploaded: "bg-slate-300/10 text-slate-200",
  signal_detected: "bg-cyan-300/10 text-cyan-200",
  plan_ready: "bg-emerald-300/10 text-emerald-200",
  approved: "bg-emerald-300/10 text-emerald-200",
  rejected: "bg-red-300/10 text-red-200",
  failed: "bg-red-300/10 text-red-200",
  pr_created: "bg-cyan-300/10 text-cyan-200",
  needs_review: "bg-amber-300/10 text-amber-200",
  insufficient_evidence: "bg-slate-300/10 text-slate-300",
};

const decisionBadgeStyles: Record<SignalDecision, string> = {
  propose_plan: "bg-emerald-300/10 text-emerald-200",
  urgent_review: "bg-red-300/10 text-red-200",
  needs_more_evidence: "bg-amber-300/10 text-amber-200",
  store_only: "bg-slate-300/10 text-slate-300",
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
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
        <p className="text-slate-300">Loading run details...</p>
      </main>
    );
  }

  if (isNotFound) {
    return (
      <main className="min-h-screen bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <Link href="/dashboard" className="text-sm text-cyan-200 hover:text-cyan-100">
            ← Dashboard
          </Link>
          <p className="mt-6 text-lg text-slate-200">Run not found.</p>
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="min-h-screen bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-red-400/30 bg-red-400/10 p-6 text-red-100">
          <Link href="/dashboard" className="text-sm text-cyan-200 hover:text-cyan-100">
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
    <main className="min-h-screen bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <Link href="/dashboard" className="text-sm text-cyan-200 hover:text-cyan-100">
            ← Dashboard
          </Link>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Run detail</p>
              <h1 className="mt-3 break-all text-3xl font-semibold tracking-tight">{run._id}</h1>
              <p className="mt-2 text-sm text-slate-400">Created {new Date(run.createdAt).toLocaleString()}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusBadgeStyles[run.status] ?? "bg-slate-300/10 text-slate-300"}`}>
              {run.status}
            </span>
          </div>
        </header>

        {run.signal ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Signal</p>
            <div className="mt-5 rounded-3xl bg-slate-950/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{run.signal.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{run.signal.summary}</p>
                </div>
                <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-200">
                  {Math.round((run.signal.confidence ?? 0) * 100)}%
                </span>
              </div>
              <ListBlock title="Evidence" items={signalEvidence} />
            </div>
          </section>
        ) : null}

        {run.signalClusters && run.signalClusters.length > 0 ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Signal clusters</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {run.signalClusters.map((cluster) => (
                <article key={cluster.id} className="rounded-3xl bg-slate-950/70 p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">{cluster.type}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeStyles[cluster.decision]}`}>{cluster.decision}</span>
                    <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-slate-300">Severity: {cluster.severity}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">{cluster.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{cluster.summary}</p>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <Metric label="Frequency" value={cluster.frequency.toString()} />
                    <Metric label="Confidence" value={`${Math.round(cluster.confidence * 100)}%`} />
                  </dl>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Rationale</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{cluster.rationale}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {run.comments ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Extracted comments</p>
            <div className="mt-5 max-h-96 overflow-auto rounded-3xl bg-slate-950/70 p-5">
              <ul className="space-y-3 text-sm leading-6 text-slate-300">
                {comments.length > 0 ? comments.map((comment, index) => <li key={`${comment}-${index}`}>• {comment}</li>) : <li className="text-slate-500">No comments extracted yet.</li>}
              </ul>
            </div>
          </section>
        ) : null}

        {run.plan ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Implementation plan</p>
            <div className="mt-5 rounded-3xl bg-slate-950/70 p-5">
              <p className="text-sm text-slate-400">Recommended change</p>
              <p className="mt-2 text-slate-100">{run.plan.recommendedChange}</p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <ListBlock title="Files to change" items={filesToChange} />
                <ListBlock title="Acceptance criteria" items={acceptanceCriteria} />
                <ListBlock title="Guardrails" items={guardrails} />
              </div>
            </div>
          </section>
        ) : null}

        {run.founderDecision ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Founder decision</p>
            <div className="mt-5 rounded-3xl bg-slate-950/70 p-5">
              <p className="text-lg font-semibold">{run.founderDecision.action === "approve" ? "Approved" : "Rejected"}</p>
              <p className="mt-2 text-sm text-slate-400">{new Date(run.founderDecision.decidedAt).toLocaleString()}</p>
              {run.founderDecision.note ? <p className="mt-3 text-sm leading-6 text-slate-200">{run.founderDecision.note}</p> : null}
            </div>
          </section>
        ) : null}

        {run.implementation ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Implementation job</p>
            <div className="mt-5 rounded-3xl bg-slate-950/70 p-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-200">{run.implementation.status}</span>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm text-slate-300">{run.implementation.branchName}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-200">{run.implementation.summary}</p>
              {run.implementation.prDraft ? (
                <div className="mt-5 rounded-3xl bg-slate-900/80 p-5">
                  <p className="text-sm text-slate-400">PR draft</p>
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
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-2 font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5 rounded-3xl bg-white/[0.04] p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        {items.length > 0 ? items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>) : <li className="text-slate-500">No items yet.</li>}
      </ul>
    </div>
  );
}

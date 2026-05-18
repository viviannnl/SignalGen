"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { SignalGenRun } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };

export default function DashboardPage() {
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [decidingRunId, setDecidingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latestRun = runs[0];
  const fileNames = useMemo(() => files.map((file) => file.name), [files]);

  async function loadRuns() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load SignalGen runs.");
      }
      const data = (await response.json()) as { runs: ApiRun[] };
      setRuns(data.runs);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function createRun() {
    setIsCreating(true);
    setError(null);

    try {
      const formData = new FormData();
      const filesToUpload = files.slice(0, 5);
      for (const file of filesToUpload) {
        formData.append("screenshots", file);
      }

      const response = await fetch("/api/runs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not create a SignalGen run.");
      }

      const data = (await response.json()) as { run: ApiRun };
      setRuns((currentRuns) => [data.run, ...currentRuns]);
      setFiles([]);

      setIsProcessing(true);
      const tickResponse = await fetch("/api/agent/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.run._id }),
      });
      if (!tickResponse.ok) {
        throw new Error("Run was created, but the agent tick failed. Try Refresh runs or check server logs.");
      }

      await loadRuns();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setIsCreating(false);
      setIsProcessing(false);
    }
  }

  async function decideRun(runId: string, action: "approve" | "reject") {
    const note = window.prompt(
      action === "approve"
        ? "Optional approval note for the agent before future PR work:"
        : "Optional rejection note so SignalGen remembers why this was rejected:",
      "",
    );

    if (note === null) return;

    setDecidingRunId(runId);
    setError(null);

    try {
      const response = await fetch(`/api/runs/${runId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save founder decision.");
      }

      await loadRuns();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setDecidingRunId(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/runs", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load SignalGen runs.");
        }
        return response.json() as Promise<{ runs: ApiRun[] }>;
      })
      .then((data) => {
        if (isMounted) {
          setRuns(data.runs);
          setError(null);
        }
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <nav className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Link href="/" className="text-sm text-cyan-200 hover:text-cyan-100">
              ← SignalGen home
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Founder signal dashboard</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Upload feedback screenshots, generate a first product signal, and store the run in MongoDB as the memory layer.
            </p>
          </div>
          <button
            onClick={() => void loadRuns()}
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-100"
          >
            Refresh runs
          </button>
        </nav>

        {error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">New run</p>
            <h2 className="mt-3 text-2xl font-semibold">Upload screenshots</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Upload feedback screenshots. SignalGen uses Gemini to extract visible comments, stores the run, then automatically wakes the agent tick to classify, cluster, and decide whether there is enough evidence to act.
            </p>

            <label className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-cyan-300/30 bg-cyan-300/5 p-6 text-center transition hover:border-cyan-200/60 hover:bg-cyan-300/10">
              <span className="text-lg font-semibold">Drop or choose screenshots</span>
              <span className="mt-2 text-sm text-slate-300">PNG, JPG, or WebP comment screenshots</span>
              <input
                multiple
                accept="image/png,image/jpeg,image/webp"
                type="file"
                className="sr-only"
                onChange={(event) => {
                  const selectedFiles = Array.from(event.target.files ?? []);
                  setFiles(selectedFiles.slice(0, 5));
                  if (selectedFiles.length > 5) {
                    setError("Please upload at most 5 screenshots per run. The first 5 were selected.");
                  }
                }}
              />
            </label>

            {fileNames.length > 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-white">Selected screenshots</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {fileNames.map((name) => (
                    <li key={name}>• {name}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              onClick={() => void createRun()}
              disabled={isCreating || isProcessing || files.length === 0}
              className="mt-6 w-full rounded-full bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? "Agent is processing..." : isCreating ? "Extracting comments..." : "Upload and run agent"}
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Latest memory</p>
            {isLoading ? (
              <p className="mt-5 text-slate-300">Loading MongoDB runs...</p>
            ) : latestRun ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-3 rounded-3xl bg-slate-950/70 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Top signal</p>
                    <h2 className="mt-2 text-2xl font-semibold">{latestRun.signal.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{latestRun.signal.summary}</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    {Math.round(latestRun.signal.confidence * 100)}%
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <InfoCard title="Evidence" items={latestRun.signal.evidence} />
                  <InfoCard title="Agent rationale" items={(latestRun.signalClusters ?? []).map((cluster) => cluster.rationale)} />
                  <InfoCard title="Guardrails" items={latestRun.plan.guardrails} />
                  <InfoCard title="Files to change" items={latestRun.plan.filesToChange} />
                  <InfoCard title="Acceptance criteria" items={latestRun.plan.acceptanceCriteria} />
                </div>

                <div className="rounded-3xl bg-slate-950/70 p-5">
                  <p className="text-sm text-slate-400">Recommended product change</p>
                  <p className="mt-2 text-slate-100">{latestRun.plan.recommendedChange}</p>
                </div>

                <FounderDecisionPanel run={latestRun} decidingRunId={decidingRunId} onDecide={decideRun} />
              </div>
            ) : (
              <p className="mt-5 text-slate-300">No runs yet. Create the first SignalGen run.</p>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Run history</p>
              <h2 className="mt-3 text-2xl font-semibold">MongoDB product-iteration memory</h2>
            </div>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm text-slate-300">{runs.length} runs</span>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            {runs.length > 0 ? (
              <div className="divide-y divide-white/10">
                {runs.map((run) => (
                  <div key={run._id} className="grid gap-3 bg-slate-950/50 p-4 md:grid-cols-[1fr_1.3fr_0.7fr] md:items-center">
                    <div>
                      <p className="font-semibold">{run.signal.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(run.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-slate-300">{run.plan.recommendedChange}</p>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-sm text-cyan-200">{run.status}</span>
                      {run.founderDecision ? (
                        <span className="text-xs text-slate-400">
                          Founder {run.founderDecision.action === "approve" ? "approved" : "rejected"} · {new Date(run.founderDecision.decidedAt).toLocaleString()}
                        </span>
                      ) : null}
                      {!run.founderDecision && run.status === "plan_ready" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void decideRun(run._id, "approve")}
                            disabled={decidingRunId === run._id}
                            className="rounded-full bg-emerald-300/90 px-3 py-1 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void decideRun(run._id, "reject")}
                            disabled={decidingRunId === run._id}
                            className="rounded-full border border-red-300/40 px-3 py-1 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-slate-300">No run history yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FounderDecisionPanel({
  run,
  decidingRunId,
  onDecide,
}: {
  run: ApiRun;
  decidingRunId: string | null;
  onDecide: (runId: string, action: "approve" | "reject") => Promise<void>;
}) {
  if (run.founderDecision) {
    return (
      <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">Founder decision</p>
        <p className="mt-3 text-lg font-semibold text-white">
          {run.founderDecision.action === "approve" ? "Approved" : "Rejected"}
        </p>
        <p className="mt-2 text-sm text-slate-300">{new Date(run.founderDecision.decidedAt).toLocaleString()}</p>
        {run.founderDecision.note ? <p className="mt-3 text-sm text-slate-200">“{run.founderDecision.note}”</p> : null}
      </div>
    );
  }

  if (run.status !== "plan_ready") {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-sm font-semibold text-white">Founder approval gate</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Approval controls appear once the agent has enough evidence and marks a run as plan-ready.
        </p>
      </div>
    );
  }

  const isDeciding = decidingRunId === run._id;

  return (
    <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">Founder approval required</p>
      <p className="mt-3 text-sm leading-6 text-slate-200">
        SignalGen found enough evidence to propose a plan. Approving only records your decision for the next PR step; it does not edit code yet.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => void onDecide(run._id, "approve")}
          disabled={isDeciding}
          className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeciding ? "Saving..." : "Approve plan"}
        </button>
        <button
          onClick={() => void onDecide(run._id, "reject")}
          disabled={isDeciding}
          className="rounded-full border border-red-300/40 px-5 py-3 text-sm font-semibold text-red-100 transition hover:border-red-200 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject plan
        </button>
      </div>
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-slate-950/70 p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        {items.length > 0 ? (
          items.map((item) => <li key={item}>• {item}</li>)
        ) : (
          <li className="text-slate-500">No items yet.</li>
        )}
      </ul>
    </div>
  );
}

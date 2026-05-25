"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ProductSignal, SignalGenRun, SignalPlan } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };
type ApiSignal = ProductSignal & { _id: string; currentPlan?: SignalPlan };

export default function DashboardPage() {
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [signals, setSignals] = useState<ApiSignal[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [decidingRunId, setDecidingRunId] = useState<string | null>(null);
  const [implementingRunId, setImplementingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"new-analysis" | "all-signals">("new-analysis");

  const latestRun = runs[0];
  const fileNames = useMemo(() => files.map((file) => file.name), [files]);

  async function loadSignals() {
    const response = await fetch("/api/signals", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load SignalGen signals.");
    }
    const data = (await response.json()) as { signals: ApiSignal[] };
    setSignals(data.signals);
  }

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
      await loadSignals();
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

      // Fire-and-forget: kick the agent tick without blocking the UI
      void fetch("/api/agent/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.run._id }),
      }).catch(() => undefined);

      // Start non-blocking polling for this run
      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function createDemoRun() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not create a SignalGen run.");
      }

      const data = (await response.json()) as { run: ApiRun };
      setRuns((currentRuns) => [data.run, ...currentRuns]);

      void fetch("/api/agent/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.run._id }),
      }).catch(() => undefined);

      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function createPasteRun() {
    const comments = pastedText
      .split("\n")
      .map((comment) => comment.trim())
      .filter(Boolean);

    if (comments.length === 0) {
      setError("Enter at least one comment to analyze.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not create a SignalGen run.");
      }

      const data = (await response.json()) as { run: ApiRun };
      setRuns((currentRuns) => [data.run, ...currentRuns]);
      setPastedText("");

      void fetch("/api/agent/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.run._id }),
      }).catch(() => undefined);

      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
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

  async function runImplementationAction(runId: string, action: "start" | "prepare-pr") {
    setImplementingRunId(runId);
    setError(null);

    try {
      const endpoint = action === "start" ? `/api/runs/${runId}/implement` : `/api/runs/${runId}/implementation/prepare-pr`;
      const response = await fetch(endpoint, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not update implementation state.");
      }

      await loadRuns();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setImplementingRunId(null);
    }
  }

  async function pollRunUntilProcessed(runId: string) {
    const maxAttempts = 30; // 60s max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) break;
        const body = (await response.json()) as { run?: ApiRun };
        if (!body.run) break;

        // Update this run in the list in-place
        setRuns((prev) => prev.map((r) => (r._id === runId ? (body.run as ApiRun) : r)));

        if (body.run.status !== "uploaded") break;
      } catch {
        break;
      }
    }
    setIsProcessing(false);
    void loadRuns();
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch("/api/runs", { cache: "no-store" }),
      fetch("/api/signals", { cache: "no-store" }),
    ])
      .then(async ([runsResponse, signalsResponse]) => {
        if (!runsResponse.ok) {
          throw new Error("Could not load SignalGen runs.");
        }
        if (!signalsResponse.ok) {
          throw new Error("Could not load SignalGen signals.");
        }
        const runsData = (await runsResponse.json()) as { runs: ApiRun[] };
        const signalsData = (await signalsResponse.json()) as { signals: ApiSignal[] };
        return { runs: runsData.runs, signals: signalsData.signals };
      })
      .then((data) => {
        if (isMounted) {
          setRuns(data.runs);
          setSignals(data.signals);
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
              Upload feedback screenshots, generate a first product signal.
            </p>
          </div>
          <button
            onClick={() => void loadRuns()}
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-100"
          >
            Refresh
          </button>
        </nav>

        <div className="flex gap-1 self-start rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Dashboard sections">
          <button
            id="new-analysis-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "new-analysis"}
            aria-controls="new-analysis-panel"
            onClick={() => setActiveTab("new-analysis")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "new-analysis" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            New analysis
          </button>
          <button
            id="all-signals-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "all-signals"}
            aria-controls="all-signals-panel"
            onClick={() => setActiveTab("all-signals")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "all-signals" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            All signals
          </button>
        </div>

        {error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>
        ) : null}

        {activeTab === "new-analysis" ? (
          <section
            id="new-analysis-panel"
            role="tabpanel"
            aria-labelledby="new-analysis-tab"
            className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"
          >
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">New analysis</p>
            <h2 className="mt-3 text-2xl font-semibold">Upload screenshots</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Upload feedback screenshots. SignalGen extracts visible comments, records the evidence, and decides whether there is enough signal to act.
            </p>

            <label
              className={`mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center transition hover:border-cyan-200/60 hover:bg-cyan-300/10 ${
                isDragging ? "border-cyan-200/80 bg-cyan-300/15" : "border-cyan-300/30 bg-cyan-300/5"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = Array.from(e.dataTransfer.files);
                setFiles(dropped.slice(0, 5));
                if (dropped.length > 5) {
                  setError("Please upload at most 5 screenshots per run. The first 5 were selected.");
                }
              }}
            >
              <span className="text-lg font-semibold">Drop or choose screenshots</span>
              <span className="mt-2 text-sm text-slate-300">PNG, JPG, or WebP comment screenshots</span>
              <span className="mt-2 text-xs text-slate-400">Max 5 screenshots · 4 MB each · 8 MB total</span>
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

            <button
              onClick={() => void createDemoRun()}
              disabled={isCreating || isProcessing}
              className="mt-3 text-xs text-cyan-300 underline hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use sample feedback
            </button>

            <div>
              <p className="mt-5 text-sm font-semibold text-white">Or paste feedback comments</p>
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="Paste one comment per line…"
                rows={4}
                className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-300/40"
              />
              <button
                onClick={() => void createPasteRun()}
                disabled={pastedText.trim() === "" || isCreating || isProcessing}
                className="mt-3 rounded-full border border-cyan-300/40 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Analyze pasted feedback
              </button>
            </div>

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
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Latest signal</p>
            {isLoading ? (
              <p className="mt-5 text-slate-300">Loading signals...</p>
            ) : latestRun ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-3 rounded-3xl bg-slate-950/70 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Top signal</p>
                    <h2 className="mt-2 text-2xl font-semibold">{latestRun.signal?.title ?? "Pending analysis"}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{latestRun.signal?.summary ?? ""}</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    {Math.round((latestRun.signal?.confidence ?? 0) * 100)}%
                  </span>
                </div>

                {latestRun.extractionDiagnostics ? (
                  <div className="rounded-2xl bg-slate-950/70 px-4 py-3 text-xs text-slate-400">
                    Extracted from {latestRun.extractionDiagnostics.screenshotCount} screenshot{latestRun.extractionDiagnostics.screenshotCount !== 1 ? "s" : ""} · {latestRun.extractionDiagnostics.commentCount} comment{latestRun.extractionDiagnostics.commentCount !== 1 ? "s" : ""} found
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <InfoCard title="Extracted comments" items={latestRun.comments ?? []} />
                  <InfoCard title="Evidence" items={latestRun.signal?.evidence ?? []} />
                  <InfoCard title="Agent rationale" items={(latestRun.signalClusters ?? []).map((cluster) => cluster.rationale)} />
                  <InfoCard title="Guardrails" items={latestRun.plan?.guardrails ?? []} />
                  <InfoCard title="Files to change" items={latestRun.plan?.filesToChange ?? []} />
                  <InfoCard title="Acceptance criteria" items={latestRun.plan?.acceptanceCriteria ?? []} />
                </div>

                <div className="rounded-3xl bg-slate-950/70 p-5">
                  <p className="text-sm text-slate-400">Recommended product change</p>
                  <p className="mt-2 text-slate-100">{latestRun.plan?.recommendedChange ?? "Awaiting agent analysis."}</p>
                </div>

                <FounderDecisionPanel run={latestRun} decidingRunId={decidingRunId} onDecide={decideRun} />
                <ImplementationPanel run={latestRun} implementingRunId={implementingRunId} onRunAction={runImplementationAction} />
              </div>
            ) : (
              <p className="mt-5 text-slate-300">No signals yet. Upload feedback to create your first signal.</p>
            )}
          </div>
        </section>
        ) : null}

        {activeTab === "all-signals" ? (
          <section
            id="all-signals-panel"
            role="tabpanel"
            aria-labelledby="all-signals-tab"
            className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6"
          >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">All signals</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Signals, evidence, and decisions detected from uploaded feedback.
              </p>
            </div>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm text-slate-300">{signals.length} signals</span>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            {signals.length > 0 ? (
              <div className="divide-y divide-white/10">
                {signals.map((signal) => (
                  <div key={signal._id} className="grid gap-3 bg-slate-950/50 p-4 md:grid-cols-[1fr_1.3fr_0.7fr] md:items-center">
                    <div>
                      <p className="font-semibold">{signal.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {signal.type.replaceAll("_", " ")} · {signal.evidenceItemIds.length} evidence item{signal.evidenceItemIds.length !== 1 ? "s" : ""} · {new Date(signal.updatedAt).toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{signal.summary}</p>
                    </div>
                    <p className="text-sm text-slate-300">
                      {signal.currentPlan?.recommendedChange ?? "Signal is still collecting evidence before a plan is proposed."}
                    </p>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-sm text-cyan-200">{signal.status.replaceAll("_", " ")}</span>
                      <span className="text-xs text-slate-400">
                        Strength {Math.round(signal.strength * 100)}% · Confidence {Math.round(signal.confidence * 100)}%
                      </span>
                      {signal.currentPlan?.approvalDecision ? (
                        <span className="text-xs text-slate-400">
                          Founder {signal.currentPlan.approvalDecision.action === "approve" ? "approved" : "rejected"} · {new Date(signal.currentPlan.approvalDecision.decidedAt).toLocaleString()}
                        </span>
                      ) : signal.currentPlan ? (
                        <span className="text-xs text-amber-200">Plan awaiting founder decision</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-slate-300">No signals yet. Upload feedback to start building signal memory.</p>
            )}
          </div>
        </section>
        ) : null}
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

function ImplementationPanel({
  run,
  implementingRunId,
  onRunAction,
}: {
  run: ApiRun;
  implementingRunId: string | null;
  onRunAction: (runId: string, action: "start" | "prepare-pr") => Promise<void>;
}) {
  if (run.status !== "approved") {
    return null;
  }

  const isWorking = implementingRunId === run._id;

  if (!run.implementation) {
    return (
      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">Guarded implementation</p>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          This approved signal is ready for the next safe agent step. Starting implementation only queues an auditable job; it does not edit code or create a PR yet.
        </p>
        <button
          onClick={() => void onRunAction(run._id, "start")}
          disabled={isWorking}
          className="mt-5 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWorking ? "Starting..." : "Start guarded implementation"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">Implementation memory</p>
      <p className="mt-3 text-lg font-semibold text-white">{run.implementation.status}</p>
      <p className="mt-2 text-sm text-slate-300">Branch: {run.implementation.branchName}</p>
      <p className="mt-3 text-sm leading-6 text-slate-200">{run.implementation.summary}</p>
      {run.implementation.status === "queued" ? (
        <button
          onClick={() => void onRunAction(run._id, "prepare-pr")}
          disabled={isWorking}
          className="mt-5 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWorking ? "Preparing..." : "Prepare PR draft"}
        </button>
      ) : null}
      {run.implementation.prDraft ? (
        <div className="mt-5 rounded-2xl bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-white">{run.implementation.prDraft.title}</p>
          <p className="mt-2 text-xs text-slate-400">PR branch: {run.implementation.prDraft.branchName}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Files to inspect</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {run.implementation.prDraft.filesToInspect.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Test commands</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {run.implementation.prDraft.testCommands.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Checklist</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-300">
            {run.implementation.prDraft.checklist.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <details className="mt-4 text-sm text-slate-300">
            <summary className="cursor-pointer text-cyan-100">View PR body draft</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-900 p-4 text-xs leading-5 text-slate-200">
              {run.implementation.prDraft.body}
            </pre>
          </details>
        </div>
      ) : null}
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

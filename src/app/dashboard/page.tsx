"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AuthControls } from "../auth-controls";
import type { ProductSignal, RepoConnection, SignalGenRun, SignalPlan } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };
type ApiSignal = ProductSignal & { _id: string; currentPlan?: SignalPlan };
type DashboardTab = "new-analysis" | "all-signals" | "github";
type GitHubStatus =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "disconnected" }
  | { status: "installed"; installationId: string }
  | { status: "connected"; installationId: string; repoConnection: RepoConnection; repoConnections?: RepoConnection[] };

export default function DashboardPage() {
  const router = useRouter();
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
  const [activeTab, setActiveTab] = useState<DashboardTab>("new-analysis");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ status: "loading" });
  const [selectedRepoConnectionId, setSelectedRepoConnectionId] = useState("");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const connectedRepos = useMemo(() => {
    if (githubStatus.status !== "connected") return [];
    return Array.isArray(githubStatus.repoConnections) && githubStatus.repoConnections.length > 0
      ? githubStatus.repoConnections
      : [githubStatus.repoConnection];
  }, [githubStatus]);
  const selectedRepo = connectedRepos.find((connection) => connection._id === selectedRepoConnectionId);
  const selectedSignal = useMemo(
    () => signals.find((signal) => signal._id === selectedSignalId) ?? null,
    [selectedSignalId, signals],
  );

  const loadSignals = useCallback(async (repoConnectionId: string) => {
    if (!repoConnectionId) {
      setSignals([]);
      return;
    }
    const response = await fetch(`/api/signals?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load SignalGen signals.");
    }
    const data = (await response.json()) as { signals: ApiSignal[] };
    setSignals(data.signals);
  }, []);

  const loadGitHubStatus = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) {
      setGithubStatus({ status: "loading" });
    }

    try {
      const response = await fetch("/api/github/connection-status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load GitHub connection status.");
      }
      const data = (await response.json()) as GitHubStatus;
      setGithubStatus(data);
    } catch (caughtError) {
      setGithubStatus({
        status: "error",
        message: caughtError instanceof Error ? caughtError.message : "Could not load GitHub connection status.",
      });
    }
  }, []);

  const loadRuns = useCallback(
    async (repoConnectionId = selectedRepoConnectionId) => {
      if (!repoConnectionId) {
        setRuns([]);
        setSignals([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/runs?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load SignalGen runs.");
        }
        const data = (await response.json()) as { runs: ApiRun[] };
        setRuns(data.runs);
        await loadSignals(repoConnectionId);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [loadSignals, selectedRepoConnectionId],
  );

  const latestRun = runs[0];
  const fileNames = useMemo(() => files.map((file) => file.name), [files]);

  useEffect(() => {
    if (!selectedSignal) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedSignalId(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedSignal]);

  async function createRun() {
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before creating a SignalGen run.");
      return;
    }
    setIsCreating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("repoConnectionId", selectedRepoConnectionId);
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
        body: JSON.stringify({ runId: data.run._id, repoConnectionId: selectedRepoConnectionId }),
      }).catch(() => undefined);

      // Start non-blocking polling for this run
      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id, selectedRepoConnectionId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function createDemoRun() {
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before creating a SignalGen run.");
      return;
    }
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoConnectionId: selectedRepoConnectionId }),
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
        body: JSON.stringify({ runId: data.run._id, repoConnectionId: selectedRepoConnectionId }),
      }).catch(() => undefined);

      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id, selectedRepoConnectionId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function createPasteRun() {
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before creating a SignalGen run.");
      return;
    }
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
        body: JSON.stringify({ repoConnectionId: selectedRepoConnectionId, comments }),
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
        body: JSON.stringify({ runId: data.run._id, repoConnectionId: selectedRepoConnectionId }),
      }).catch(() => undefined);

      setIsProcessing(true);
      void pollRunUntilProcessed(data.run._id, selectedRepoConnectionId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setIsProcessing(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function decideRun(runId: string, action: "approve" | "reject", note = "") {
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before saving a founder decision.");
      return;
    }

    setDecidingRunId(runId);
    setError(null);

    try {
      const response = await fetch(`/api/runs/${runId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, repoConnectionId: selectedRepoConnectionId }),
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
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before starting implementation.");
      return;
    }
    setImplementingRunId(runId);
    setError(null);

    try {
      const endpoint = action === "start" ? `/api/runs/${runId}/implement` : `/api/runs/${runId}/implementation/prepare-pr`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoConnectionId: selectedRepoConnectionId }),
      });

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

  async function pollRunUntilProcessed(runId: string, repoConnectionId: string) {
    const maxAttempts = 30; // 60s max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch(`/api/runs/${runId}?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: "no-store" });
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
    void Promise.resolve().then(() => loadGitHubStatus({ showLoading: false }));
  }, [loadGitHubStatus]);

  useEffect(() => {
    if (githubStatus.status !== "connected") return;
    const repoFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("repoConnectionId") ?? "" : "";
    const savedRepo = typeof window !== "undefined" ? window.localStorage.getItem("signalgen:selectedRepoConnectionId") ?? "" : "";
    const candidate = repoFromUrl || savedRepo;
    if (candidate && connectedRepos.some((connection) => connection._id === candidate)) {
      window.setTimeout(() => setSelectedRepoConnectionId(candidate), 0);
    }
  }, [connectedRepos, githubStatus.status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!selectedRepoConnectionId) {
        setIsLoading(false);
        return;
      }
      void loadRuns(selectedRepoConnectionId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRuns, selectedRepoConnectionId]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--bg)] px-6 py-8 text-[var(--ink)] sm:px-10 sm:pb-20">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-8">
        <nav className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <Link href="/" className="sg-link text-sm">
              ← SignalGen home
            </Link>
            <h1 className="mt-3 break-words text-[clamp(2.25rem,10vw,2.75rem)] font-semibold leading-[1.05] tracking-tight sm:text-4xl">Founder signal dashboard</h1>
            <p className="mt-2 max-w-2xl break-words text-[var(--ink-soft)]">
              {selectedRepo ? `Current repo: ${selectedRepo.owner}/${selectedRepo.repo}` : "Choose one connected repo before creating signals, sessions, or PR work."}
            </p>
          </div>
          <button
            onClick={() => void loadRuns()}
            className="rounded-full border border-[var(--line-strong)] px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--rose)] hover:text-[var(--rose-hover)]"
          >
            Refresh
          </button>
        </nav>

        <AuthControls />

        <div className="flex gap-1 self-start rounded-full border border-[var(--line)] bg-[var(--card)] p-1" role="tablist" aria-label="Dashboard sections">
          <button
            id="new-analysis-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "new-analysis"}
            aria-controls="new-analysis-panel"
            onClick={() => setActiveTab("new-analysis")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "new-analysis" ? "bg-[var(--primary)] text-[var(--primary-ink)]" : "text-[var(--ink-soft)] hover:text-[var(--primary)]"
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
              activeTab === "all-signals" ? "bg-[var(--primary)] text-[var(--primary-ink)]" : "text-[var(--ink-soft)] hover:text-[var(--primary)]"
            }`}
          >
            All signals
          </button>
          <button
            id="github-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "github"}
            aria-controls="github-panel"
            onClick={() => setActiveTab("github")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === "github" ? "bg-[var(--primary)] text-[var(--primary-ink)]" : "text-[var(--ink-soft)] hover:text-[var(--primary)]"
            }`}
          >
            GitHub
          </button>
        </div>

        {error ? (
          <div className="rounded-3xl border border-[var(--error-line)] bg-[var(--error-bg)] p-4 text-[var(--error)]">{error}</div>
        ) : null}

        {activeTab === "new-analysis" ? (
          <section
            id="new-analysis-panel"
            role="tabpanel"
            aria-labelledby="new-analysis-tab"
            className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"
          >
          <div className="sg-card p-6">
            <p className="sg-eyebrow">New analysis</p>
            <h2 className="mt-3 text-2xl font-semibold">Upload screenshots</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
              {selectedRepo
                ? `This session is scoped to ${selectedRepo.owner}/${selectedRepo.repo}. Uploaded feedback, signal memory, plans, and implementation jobs stay under this repo.`
                : "Choose a repo from the GitHub tab before uploading feedback. SignalGen will not create sessions or implementation work without an explicit repo."}
            </p>

            <label
              className={`mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center transition hover:border-[var(--rose)] hover:bg-[var(--primary)]/10 ${
                isDragging ? "border-[var(--rose)] bg-[var(--primary)]/15" : "border-[var(--line-strong)] bg-[var(--primary)]/5"
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
              <span className="mt-2 text-sm text-[var(--ink-soft)]">PNG, JPG, or WebP comment screenshots</span>
              <span className="mt-2 text-xs text-[var(--ink-faint)]">Max 5 screenshots · 4 MB each · 8 MB total</span>
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
              disabled={!selectedRepo || isCreating || isProcessing}
              className="mt-3 text-xs text-[var(--rose-hover)] underline hover:text-[var(--rose-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use sample feedback
            </button>

            <div>
              <p className="mt-5 text-sm font-semibold text-[var(--ink)]">Or paste feedback comments</p>
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="Paste one comment per line…"
                rows={4}
                className="mt-2 w-full sg-panel sg-panel--cream px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--rose)]"
              />
              <button
                onClick={() => void createPasteRun()}
                disabled={!selectedRepo || pastedText.trim() === "" || isCreating || isProcessing}
                className="mt-3 sg-btn sg-btn--secondary sg-btn--sm"
              >
                Analyze pasted feedback
              </button>
            </div>

            {fileNames.length > 0 ? (
              <div className="mt-5 sg-panel sg-panel--cream p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">Selected screenshots</p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--ink-soft)]">
                  {fileNames.map((name) => (
                    <li key={name}>• {name}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              onClick={() => void createRun()}
              disabled={!selectedRepo || isCreating || isProcessing || files.length === 0}
              className="mt-6 w-full sg-btn sg-btn--primary"
            >
              {isProcessing ? "Agent is processing..." : isCreating ? "Extracting comments..." : "Upload and run agent"}
            </button>
          </div>

          <div className="sg-card p-6">
            <p className="sg-eyebrow">Latest signal</p>
            {isLoading ? (
              <p className="mt-5 text-[var(--ink-soft)]">Loading signals...</p>
            ) : latestRun ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-3 sg-panel sg-panel--cream p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-[var(--ink-faint)]">Top signal</p>
                    <h2 className="mt-2 text-2xl font-semibold">{latestRun.signal?.title ?? "Pending analysis"}</h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{latestRun.signal?.summary ?? ""}</p>
                  </div>
                  <span className="sg-pill sg-pill--success">
                    {Math.round((latestRun.signal?.confidence ?? 0) * 100)}%
                  </span>
                </div>

                {latestRun.extractionDiagnostics ? (
                  <div className="sg-panel sg-panel--cream px-4 py-3 text-xs text-[var(--ink-faint)]">
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

                <div className="sg-panel sg-panel--cream p-5">
                  <p className="text-sm text-[var(--ink-faint)]">Recommended product change</p>
                  <p className="mt-2 text-[var(--ink)]">{latestRun.plan?.recommendedChange ?? "Awaiting agent analysis."}</p>
                </div>

                <FounderDecisionPanel run={latestRun} decidingRunId={decidingRunId} onDecide={decideRun} />
                <ImplementationPanel run={latestRun} implementingRunId={implementingRunId} onRunAction={runImplementationAction} />
              </div>
            ) : (
              <p className="mt-5 text-[var(--ink-soft)]">
                {selectedRepo ? "No signals yet for this repo. Upload feedback to create your first repo-scoped signal." : "Choose a repo first. Each repo has its own saved signal session."}
              </p>
            )}
          </div>
        </section>
        ) : null}

        {activeTab === "all-signals" ? (
          <section
            id="all-signals-panel"
            role="tabpanel"
            aria-labelledby="all-signals-tab"
            className="sg-card p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="sg-eyebrow">All signals</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
                  {selectedRepo
                    ? `Signals, evidence, and decisions saved for ${selectedRepo.owner}/${selectedRepo.repo}.`
                    : "Choose a repo first. Signal memory is separated per repository."}
                </p>
              </div>
              <span className="sg-pill sg-pill--outline">{signals.length} signals</span>
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)]">
              {signals.length > 0 ? (
                <div className="divide-y divide-[var(--line)]">
                  {signals.map((signal) => {
                    const signalEvidenceItemIds = signal.evidenceItemIds ?? [];
                    return (
                      <button
                        key={signal._id}
                        type="button"
                        onClick={() => setSelectedSignalId(signal._id)}
                        className="grid w-full gap-3 bg-[var(--card)] p-4 text-left transition hover:bg-[var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--rose)] md:grid-cols-[1fr_1.3fr_0.7fr] md:items-center"
                      >
                        <div>
                          <p className="font-semibold">{signal.title}</p>
                          <p className="mt-1 text-xs text-[var(--ink-faint)]">
                            {formatSignalLabel(signal.type)} · {signalEvidenceItemIds.length} evidence item{signalEvidenceItemIds.length !== 1 ? "s" : ""} · {formatSignalDate(signal.updatedAt)}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{signal.summary}</p>
                        </div>
                        <p className="text-sm text-[var(--ink-soft)]">
                          {signal.currentPlan?.recommendedChange ?? "Signal is still collecting evidence before a plan is proposed."}
                        </p>
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <span className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-sm text-[var(--rose)]">{formatSignalLabel(signal.status)}</span>
                          <span className="text-xs text-[var(--ink-faint)]">
                            Strength {formatSignalPercent(signal.strength)} · Confidence {formatSignalPercent(signal.confidence)}
                          </span>
                          <span className="text-xs font-semibold text-[var(--rose)]">View details →</span>
                          {signal.currentPlan?.approvalDecision ? (
                            <span className="text-xs text-[var(--ink-faint)]">
                              Founder {signal.currentPlan.approvalDecision.action === "approve" ? "approved" : "rejected"} · {formatSignalDate(signal.currentPlan.approvalDecision.decidedAt)}
                            </span>
                          ) : signal.status === "plan_ready" && signal.currentPlan ? (
                            <span className="text-xs text-[var(--warning)]">Plan awaiting founder decision</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="p-5 text-[var(--ink-soft)]">{selectedRepo ? "No signals yet for this repo." : "Choose a repo first. Each repo has its own signal memory."}</p>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "github" ? (
          <section
            id="github-panel"
            role="tabpanel"
            aria-labelledby="github-tab"
            className="sg-card p-6"
          >
            <GitHubPanel
              githubStatus={githubStatus}
              selectedRepoConnectionId={selectedRepoConnectionId}
              onActiveRepoSelected={(connection) => {
                if (!connection._id) return;
                window.localStorage.setItem("signalgen:selectedRepoConnectionId", connection._id);
                setSelectedRepoConnectionId(connection._id);
                setActiveTab("new-analysis");
                router.replace(`/dashboard?repoConnectionId=${encodeURIComponent(connection._id)}`);
              }}
              onRepoSelected={loadGitHubStatus}
            />
          </section>
        ) : null}
      </div>
      <SignalDetailDrawer
        signal={selectedSignal}
        signals={signals}
        onSelectSignal={setSelectedSignalId}
        onClose={() => setSelectedSignalId(null)}
      />
    </main>
  );
}

function SignalDetailDrawer({
  signal,
  signals,
  onSelectSignal,
  onClose,
}: {
  signal: ApiSignal | null;
  signals: ApiSignal[];
  onSelectSignal: (signalId: string) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!signal) return;
    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      previouslyFocusedElement.current?.focus();
      previouslyFocusedElement.current = null;
    };
  }, [signal]);

  if (!signal) return null;

  const evidenceItems = signal.evidenceItems ?? [];
  const evidenceItemIds = signal.evidenceItemIds ?? [];
  const evidenceReferenceCount = evidenceItemIds.length;
  const otherSignals = signals.filter((otherSignal) => otherSignal._id !== signal._id);
  const plan = signal.currentPlan;
  const decision = plan?.approvalDecision;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--bg-alt)] backdrop-blur-sm" aria-label="Signal detail overlay">
      <button type="button" aria-label="Close signal detail backdrop" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="signal-detail-title"
        className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--line)] bg-[var(--bg)] p-6 text-[var(--ink)] shadow-2xl shadow-[rgba(122,59,78,0.14)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="sg-eyebrow">Signal detail</p>
            <h2 id="signal-detail-title" className="mt-3 text-3xl font-semibold tracking-tight">
              {signal.title || "Untitled signal"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{signal.summary || "Signal summary is not available yet."}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="sg-btn sg-btn--soft sg-btn--sm"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SignalDetailMetric label="Type" value={formatSignalLabel(signal.type)} />
          <SignalDetailMetric label="Status" value={formatSignalLabel(signal.status)} />
          <SignalDetailMetric label="Evidence" value={`${evidenceReferenceCount} item${evidenceReferenceCount === 1 ? "" : "s"}`} />
          <SignalDetailMetric label="Strength" value={formatSignalPercent(signal.strength)} />
          <SignalDetailMetric label="Confidence" value={formatSignalPercent(signal.confidence)} />
          <SignalDetailMetric label="Updated" value={formatSignalDate(signal.updatedAt)} />
          <SignalDetailMetric label="Created" value={formatSignalDate(signal.createdAt)} />
        </div>

        <section className="mt-8 sg-card p-5">
          <p className="sg-eyebrow">Evidence</p>
          {evidenceItems.length > 0 ? (
            <div className="mt-4 space-y-4">
              {evidenceItems.map((item) => (
                <article key={item.id} className="sg-panel sg-panel--cream p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--rose)]">{formatSignalLabel(item.clusterType)}</span>
                    <span className="sg-pill sg-pill--outline">Severity: {formatSignalLabel(item.severity)}</span>
                    <span className="sg-pill sg-pill--outline">Decision: {formatSignalLabel(item.decision)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{item.title || "Evidence item"}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{item.summary || "No evidence summary saved yet."}</p>
                  <dl className="mt-4 grid gap-3 text-xs text-[var(--ink-faint)] sm:grid-cols-3">
                    <SignalDetailInlineMetric label="Frequency" value={String(item.frequency ?? 0)} />
                    <SignalDetailInlineMetric label="Confidence" value={formatSignalPercent(item.confidence)} />
                    <SignalDetailInlineMetric label="Source run" value={item.runId || "Not linked"} />
                  </dl>
                </article>
              ))}
            </div>
          ) : evidenceReferenceCount > 0 ? (
            <div className="mt-4 sg-panel sg-panel--cream p-4 text-sm leading-6 text-[var(--ink-soft)]">
              <p>Evidence references saved, but detailed evidence text is not available in this view yet.</p>
              <p className="mt-2 text-xs text-[var(--ink-faint)]">References: {evidenceItemIds.join(", ")}</p>
            </div>
          ) : (
            <p className="mt-4 sg-panel sg-panel--cream p-4 text-sm text-[var(--ink-faint)]">No evidence has been saved for this signal yet.</p>
          )}
        </section>

        <section className="mt-6 sg-card p-5">
          <p className="sg-eyebrow">Recommended next step</p>
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
            {plan?.recommendedChange ?? "Signal is still collecting evidence before a next step is proposed."}
          </p>
          {plan ? (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <SignalDetailList title="Files to change" items={plan.filesToChange} />
              <SignalDetailList title="Guardrails" items={plan.guardrails} />
              <SignalDetailList title="Acceptance criteria" items={plan.acceptanceCriteria} />
            </div>
          ) : null}
        </section>

        <section className="mt-6 sg-card p-5">
          <p className="sg-eyebrow">Decision memory</p>
          {decision ? (
            <div className="mt-3 text-sm leading-6 text-[var(--ink)]">
              <p>Founder {decision.action === "approve" ? "approved" : "rejected"} this plan on {formatSignalDate(decision.decidedAt)}.</p>
              {decision.note ? <p className="mt-2 text-[var(--ink-soft)]">“{decision.note}”</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--ink-faint)]">No founder decision has been recorded for this signal yet.</p>
          )}
        </section>

        {otherSignals.length > 0 ? (
          <section className="mt-6 sg-card p-5">
            <p className="sg-eyebrow">Other signals</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-faint)]">
              Select another saved signal without leaving this detail drawer.
            </p>
            <div className="mt-4 space-y-2">
              {otherSignals.map((otherSignal) => (
                <button
                  key={otherSignal._id}
                  type="button"
                  onClick={() => onSelectSignal(otherSignal._id)}
                  className="w-full sg-panel sg-panel--cream p-3 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--rose)]"
                >
                  <span className="font-semibold">{otherSignal.title || "Untitled signal"}</span>
                  <span className="mt-1 block text-xs text-[var(--ink-faint)]">
                    {formatSignalLabel(otherSignal.status)} · {formatSignalDate(otherSignal.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function GitHubPanel({
  githubStatus,
  selectedRepoConnectionId,
  onActiveRepoSelected,
  onRepoSelected,
}: {
  githubStatus: GitHubStatus;
  selectedRepoConnectionId: string;
  onActiveRepoSelected: (connection: RepoConnection) => void;
  onRepoSelected: () => void;
}) {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submitRepoSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (githubStatus.status !== "installed") return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const createResponse = await fetch("/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      if (!createResponse.ok) {
        const data = (await createResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not create repo connection.");
      }
      const createData = (await createResponse.json()) as { connection: RepoConnection };
      if (!createData.connection._id) {
        throw new Error("Repo connection was created without an id.");
      }

      const selectResponse = await fetch(`/api/repo-connections/${createData.connection._id}/select-repo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, defaultBranch, installationId: githubStatus.installationId }),
      });
      if (!selectResponse.ok) {
        const data = (await selectResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not select repository.");
      }

      onRepoSelected();
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : "Could not select repository.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (githubStatus.status === "loading") {
    return <p className="text-[var(--ink-soft)]">Loading GitHub connection status...</p>;
  }

  if (githubStatus.status === "error") {
    return <p className="rounded-3xl border border-[var(--error-line)] bg-[var(--error-bg)] p-4 text-[var(--error)]">{githubStatus.message}</p>;
  }

  if (githubStatus.status === "disconnected") {
    return (
      <div>
        <p className="sg-eyebrow">GitHub</p>
        <h2 className="mt-3 text-2xl font-semibold">GitHub is not connected.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
          Connect the GitHub App so SignalGen can remember which product repository belongs to this workspace.
        </p>
        <a
          href="/api/github/install"
          className="mt-5 inline-flex rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-ink)] transition hover:bg-[var(--primary-hover)]"
        >
          Connect GitHub App
        </a>
      </div>
    );
  }

  if (githubStatus.status === "installed") {
    return (
      <div>
        <p className="sg-eyebrow">GitHub</p>
        <h2 className="mt-3 text-2xl font-semibold">GitHub App installed. Select a repository to connect.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
          Repo write capabilities remain disabled until all implementation gates are active.
        </p>
        <form onSubmit={(event) => void submitRepoSelection(event)} className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-[var(--ink)]">
            Owner
            <input
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="mt-2 w-full sg-panel sg-panel--cream px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--rose)]"
              placeholder="viviannnl"
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink)]">
            Repo
            <input
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
              className="mt-2 w-full sg-panel sg-panel--cream px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--rose)]"
              placeholder="SignalGen"
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink)]">
            Default branch
            <input
              value={defaultBranch}
              onChange={(event) => setDefaultBranch(event.target.value)}
              className="mt-2 w-full sg-panel sg-panel--cream px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--rose)]"
              placeholder="main"
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting || owner.trim() === "" || repo.trim() === "" || defaultBranch.trim() === ""}
              className="sg-btn sg-btn--primary"
            >
              {isSubmitting ? "Connecting repo..." : "Connect repository"}
            </button>
            {submitError ? <p className="mt-3 text-sm text-[var(--error)]">{submitError}</p> : null}
          </div>
        </form>
      </div>
    );
  }

  const connectedRepos =
    Array.isArray(githubStatus.repoConnections) && githubStatus.repoConnections.length > 0
      ? githubStatus.repoConnections
      : [githubStatus.repoConnection];
  const enabledForDraftPrs = connectedRepos.filter(
    (connection) => connection.capabilities.branch_push && connection.capabilities.pr_creation,
  );
  const enabledForIssues = connectedRepos.filter((connection) => connection.capabilities.issue_creation);

  return (
    <div>
      <p className="sg-eyebrow">GitHub</p>
      <h2 className="mt-3 text-2xl font-semibold">Connected repositories</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
        Choose one repo to open its workspace. Connected repos are account-level access; sessions, signals, decisions, and PR work are repo-scoped.
        {" "}{enabledForDraftPrs.length} of {connectedRepos.length} repos can receive SignalGen branches, commits, and draft PRs. Issue creation is enabled for {enabledForIssues.length} of {connectedRepos.length} repos.
      </p>
      <div className="mt-5 grid gap-3">
        {connectedRepos.map((connection) => {
          const canCreateDraftPr = connection.capabilities.branch_push && connection.capabilities.pr_creation;
          const isActive = connection._id === selectedRepoConnectionId;
          return (
            <div
              key={connection._id ?? `${connection.owner}/${connection.repo}`}
              className="grid gap-3 sg-panel sg-panel--cream p-5 text-sm text-[var(--ink-soft)] md:grid-cols-2"
            >
              <p>Owner: {connection.owner}</p>
              <p>Repo: {connection.repo}</p>
              <p>Default branch: {connection.defaultBranch}</p>
              <p>Installation ID: {githubStatus.installationId}</p>
              <p className={canCreateDraftPr ? "text-[var(--success)]" : "text-[var(--warning)]"}>
                Draft PR automation: {canCreateDraftPr ? "Enabled" : "Disabled"}
              </p>
              <p>Issues: {connection.capabilities.issue_creation ? "Enabled" : "Disabled"}</p>
              <button
                type="button"
                onClick={() => onActiveRepoSelected(connection)}
                disabled={!connection._id || isActive}
                className="sg-btn sg-btn--primary sg-btn--sm md:col-span-2"
              >
                {isActive ? "Current repo workspace" : "Open workspace"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FounderDecisionPanel({
  run,
  decidingRunId,
  onDecide,
}: {
  run: ApiRun;
  decidingRunId: string | null;
  onDecide: (runId: string, action: "approve" | "reject", note?: string) => Promise<void>;
}) {
  const [composingDecision, setComposingDecision] = useState<"approve" | "reject" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  if (run.founderDecision) {
    return (
      <div className="rounded-3xl border border-[var(--success-line)] bg-[var(--success)]/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--success)]">Founder decision</p>
        <p className="mt-3 text-lg font-semibold text-[var(--ink)]">
          {run.founderDecision.action === "approve" ? "Approved" : "Rejected"}
        </p>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{new Date(run.founderDecision.decidedAt).toLocaleString()}</p>
        {run.founderDecision.note ? <p className="mt-3 text-sm text-[var(--ink)]">“{run.founderDecision.note}”</p> : null}
      </div>
    );
  }

  if (run.status !== "plan_ready") {
    return (
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-alt)] p-5">
        <p className="text-sm font-semibold text-[var(--ink)]">Founder approval gate</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          Approval controls appear once the agent has enough evidence and marks a run as plan-ready.
        </p>
      </div>
    );
  }

  const isDeciding = decidingRunId === run._id;

  return (
    <div className="rounded-3xl border border-[var(--warning-line)] bg-[var(--warning-bg)] p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--warning)]">Founder approval required</p>
      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
        SignalGen found enough evidence to propose a plan. Approving only records your decision for the next PR step; it does not edit code yet.
      </p>
      {composingDecision ? (
        <div className="mt-4">
          <textarea
            autoFocus
            className="sg-textarea"
            onChange={(event) => setDecisionNote(event.target.value)}
            placeholder={composingDecision === "approve" ? "Optional approval note for the agent…" : "Optional reason this was rejected…"}
            rows={2}
            value={decisionNote}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                const action = composingDecision;
                void onDecide(run._id, action, decisionNote).then(() => {
                  setComposingDecision(null);
                  setDecisionNote("");
                });
              }}
              disabled={isDeciding}
              className={composingDecision === "approve" ? "sg-btn sg-btn--success sg-btn--sm" : "sg-btn sg-btn--danger sg-btn--sm"}
            >
              {isDeciding ? "Saving..." : composingDecision === "approve" ? "Confirm approval" : "Confirm rejection"}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposingDecision(null);
                setDecisionNote("");
              }}
              disabled={isDeciding}
              className="sg-btn sg-btn--soft sg-btn--sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setComposingDecision("approve")}
            disabled={isDeciding}
            className="sg-btn sg-btn--success"
          >
            Approve plan
          </button>
          <button
            type="button"
            onClick={() => setComposingDecision("reject")}
            disabled={isDeciding}
            className="sg-btn sg-btn--danger"
          >
            Reject plan
          </button>
        </div>
      )}
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
      <div className="rounded-3xl border border-[var(--info-line)] bg-[var(--info-bg)] p-5">
        <p className="sg-eyebrow">Guarded implementation</p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
          This approved signal is ready for the next safe agent step. Starting implementation only queues an auditable job; it does not edit code or create a PR yet.
        </p>
        <button
          onClick={() => void onRunAction(run._id, "start")}
          disabled={isWorking}
          className="mt-5 sg-btn sg-btn--primary"
        >
          {isWorking ? "Starting..." : "Start guarded implementation"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[var(--info-line)] bg-[var(--info-bg)] p-5">
      <p className="sg-eyebrow">Implementation memory</p>
      <p className="mt-3 text-lg font-semibold text-[var(--ink)]">{run.implementation.status}</p>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">Branch: {run.implementation.branchName}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{run.implementation.summary}</p>
      {run.implementation.status === "queued" ? (
        <button
          onClick={() => void onRunAction(run._id, "prepare-pr")}
          disabled={isWorking}
          className="mt-5 sg-btn sg-btn--primary"
        >
          {isWorking ? "Preparing..." : "Prepare PR draft"}
        </button>
      ) : null}
      {run.implementation.prDraft ? (
        <div className="mt-5 sg-panel sg-panel--cream p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">{run.implementation.prDraft.title}</p>
          <p className="mt-2 text-xs text-[var(--ink-faint)]">PR branch: {run.implementation.prDraft.branchName}</p>
          <p className="mt-4 sg-eyebrow">Files to inspect</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--ink-soft)]">
            {run.implementation.prDraft.filesToInspect.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-4 sg-eyebrow">Test commands</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--ink-soft)]">
            {run.implementation.prDraft.testCommands.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-4 sg-eyebrow">Checklist</p>
          <ul className="mt-2 space-y-2 text-sm text-[var(--ink-soft)]">
            {run.implementation.prDraft.checklist.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <details className="mt-4 text-sm text-[var(--ink-soft)]">
            <summary className="cursor-pointer text-[var(--rose-hover)]">View PR body draft</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap sg-panel sg-panel--cream p-4 text-xs leading-5 text-[var(--ink)]">
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
    <div className="sg-panel sg-panel--cream p-5">
      <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-soft)]">
        {items.length > 0 ? (
          items.map((item) => <li key={item}>• {item}</li>)
        ) : (
          <li className="text-[var(--ink-faint)]">No items yet.</li>
        )}
      </ul>
    </div>
  );
}

function SignalDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sg-panel sg-panel--cream p-4">
      <p className="sg-eyebrow sg-eyebrow--soft">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function SignalDetailInlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">{label}</p>
      <p className="mt-1 break-words text-[var(--ink-soft)]">{value}</p>
    </div>
  );
}

function SignalDetailList({ title, items = [] }: { title: string; items?: string[] }) {
  return (
    <div className="sg-panel sg-panel--cream p-4">
      <p className="sg-eyebrow">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink-soft)]">
        {items.length > 0 ? items.map((item) => <li key={item}>• {item}</li>) : <li className="text-[var(--ink-faint)]">No items saved yet.</li>}
      </ul>
    </div>
  );
}

function formatSignalLabel(value: string | undefined): string {
  if (!value) return "Not available";
  return value.replaceAll("_", " ");
}

function formatSignalPercent(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not available";
  return `${Math.round(value * 100)}%`;
}

function formatSignalDate(value: string | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

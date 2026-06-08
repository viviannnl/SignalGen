"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AuthControls } from "../auth-controls";
import { ThemeMenu } from "@/components/theme-menu";
import {
  Button,
  Card,
  Evidence,
  Eyebrow,
  Field,
  Gauge,
  Icon,
  Input,
  LoopMap,
  MetricTile,
  Panel,
  Pill,
  PipelineStrip,
  SG_STAGES,
  Tab,
  Tabs,
  Textarea,
  stageIndex,
} from "@/components/ui";
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

type SignalFilter = "all" | "feature_request" | "friction" | "bug" | "trust_objection" | "pricing" | "praise" | "noise";

const DASHBOARD_TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "new-analysis", label: "New analysis" },
  { id: "all-signals", label: "All signals" },
  { id: "github", label: "GitHub" },
];

const SIGNAL_FILTERS: Array<{ id: SignalFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "feature_request", label: "Feature" },
  { id: "friction", label: "Friction" },
  { id: "bug", label: "Bug" },
  { id: "trust_objection", label: "Trust" },
  { id: "pricing", label: "Pricing" },
  { id: "praise", label: "Praise" },
  { id: "noise", label: "Noise" },
];

const MAX_SCREENSHOT_FILES = 5;
const MAX_SCREENSHOT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_TOTAL_BYTES = 8 * 1024 * 1024;
const ACCEPTED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const PROCESSING_COMMENTS = [
  "Extracting screenshot text and comments…",
  "Clustering repeated product pain…",
  "Drafting founder-safe plan guardrails…",
  "Saving repo-scoped signal memory…",
];

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
  const [signalQuery, setSignalQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");

  const connectedRepos = useMemo(() => {
    if (githubStatus.status !== "connected") return [];
    return Array.isArray(githubStatus.repoConnections) && githubStatus.repoConnections.length > 0
      ? githubStatus.repoConnections
      : [githubStatus.repoConnection];
  }, [githubStatus]);
  const selectedRepo = connectedRepos.find((connection) => connection._id === selectedRepoConnectionId);
  const latestRun = runs[0];
  const fileNames = useMemo(() => files.map((file) => file.name), [files]);
  const filteredSignals = useMemo(() => {
    const normalizedQuery = signalQuery.trim().toLowerCase();
    return signals.filter((signal) => {
      const matchesFilter = signalFilter === "all" || signal.type === signalFilter;
      const haystack = [signal.title, signal.summary, signal.status, signal.currentPlan?.recommendedChange]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesFilter && (normalizedQuery === "" || haystack.includes(normalizedQuery));
    });
  }, [signalFilter, signalQuery, signals]);

  const replaceDashboardUrl = useCallback(
    (next: { repoConnectionId?: string; tab?: DashboardTab }) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const repoConnectionId = next.repoConnectionId ?? (selectedRepoConnectionId || params.get("repoConnectionId") || "");
      const tab = next.tab ?? activeTab;
      if (repoConnectionId) {
        params.set("repoConnectionId", repoConnectionId);
      } else {
        params.delete("repoConnectionId");
      }
      params.set("tab", tab);
      const query = params.toString();
      router.replace(query ? `/dashboard?${query}` : "/dashboard", { scroll: false });
    },
    [activeTab, router, selectedRepoConnectionId],
  );

  const setDashboardTab = useCallback(
    (tab: DashboardTab) => {
      setActiveTab(tab);
      replaceDashboardUrl({ tab });
    },
    [replaceDashboardUrl],
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setActiveTab(initialDashboardTab());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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

  async function decideRun(runId: string, action: "approve" | "reject") {
    if (!selectedRepoConnectionId) {
      setError("Choose a repo before saving a founder decision.");
      return;
    }
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
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const repoFromUrl = searchParams.get("repoConnectionId") ?? "";
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

  const latestSignalEvidence = latestRun?.evidenceItems?.slice(0, 2) ?? [];
  const processingStage = isProcessing ? 2 : isCreating ? 1 : latestRun ? stageIndex(latestRun.status) : 0;

  return (
    <main className="sg-grid-bg" style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px clamp(16px,4vw,42px) 56px", color: "var(--ink)" }}>
      <style>{`
        @media (max-width: 920px) {
          .dashboard-two-col,
          .github-connect-grid,
          .github-repo-grid { grid-template-columns: 1fr !important; }
          .dashboard-metric-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .signal-row-meta { align-items: flex-start !important; }
          .sg-row { align-items: flex-start !important; flex-direction: column !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <DashboardHeader selectedRepo={selectedRepo} onRefresh={() => void loadRuns()} />

        <AuthControls />

        <Tabs aria-label="Dashboard sections" style={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto", padding: 6, gap: 6 }}>
          {DASHBOARD_TABS.map((tab) => (
            <Tab
              key={tab.id}
              id={`${tab.id}-tab`}
              selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              onClick={() => setDashboardTab(tab.id)}
              style={{ whiteSpace: "nowrap", padding: "13px 26px", fontSize: 15.5 }}
            >
              {tab.label}
            </Tab>
          ))}
        </Tabs>

        {error ? (
          <Panel role="alert" style={{ borderColor: "var(--error-line)", background: "var(--error-bg)", color: "var(--error)", padding: 16 }}>
            {error}
          </Panel>
        ) : null}

        {activeTab === "new-analysis" ? (
          <section id="new-analysis-panel" role="tabpanel" aria-labelledby="new-analysis-tab" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <>
              <LoopMap
                stage={latestRun?.status ?? processingStage}
                signalValue={selectedRepo ? Math.round((latestRun?.signal?.confidence ?? signals[0]?.confidence ?? 0) * 100) : 0}
                runLabel={latestRun?._id ? `${selectedRepo?.repo ?? "Workspace"} · ${shortId(latestRun._id)}` : selectedRepo ? `${selectedRepo.repo} · ready` : "Choose a repo first"}
                title={selectedRepo ? "Latest run · iteration loop" : "Iteration loop · choose a repo to activate"}
                onNode={(key) => {
                  if (!selectedRepo) {
                    setDashboardTab("github");
                    return;
                  }
                  if (key === "memory") {
                    router.push(`/dashboard/memory?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=${activeTab}`);
                    return;
                  }
                  if (latestRun?._id) {
                    router.push(`/dashboard/runs/${latestRun._id}?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=${activeTab}`);
                  }
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {selectedRepo ? (
                  <Link className="sg-link" href={`/dashboard/memory?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=${activeTab}`} style={{ fontSize: 13.5 }}>
                    <Icon name="layers" size={14} /> Open full memory timeline <Icon name="arrow" size={14} />
                  </Link>
                ) : (
                  <button className="sg-link" type="button" onClick={() => setDashboardTab("github")} style={{ fontSize: 13.5, background: "none", border: 0, fontFamily: "var(--sans)" }}>
                    <Icon name="branch" size={14} /> Choose a repo first <Icon name="arrow" size={14} />
                  </button>
                )}
              </div>
              {!selectedRepo ? (
                <EmptyRepoState
                  title="Choose a repo first"
                  body="SignalGen will not create sessions or implementation work without an explicit repo. Open the GitHub tab and choose a connected repository."
                  action={<Button variant="ghost" size="sm" onClick={() => setDashboardTab("github")}>Open GitHub tab</Button>}
                />
              ) : null}
            </>

            <div className="dashboard-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.1fr)", gap: 22 }}>
              <UploadCard
                selectedRepo={selectedRepo}
                files={files}
                fileNames={fileNames}
                isDragging={isDragging}
                isCreating={isCreating}
                isProcessing={isProcessing}
                pastedText={pastedText}
                processingStage={processingStage}
                onDraggingChange={setIsDragging}
                onFiles={(nextFiles) => {
                  const validation = validateDashboardScreenshotFiles(nextFiles);
                  setFiles(validation.files);
                  setError(validation.error);
                }}
                onCreateRun={() => void createRun()}
                onCreateDemoRun={() => void createDemoRun()}
                onPasteTextChange={setPastedText}
                onCreatePasteRun={() => void createPasteRun()}
                onGoGitHub={() => setDashboardTab("github")}
              />
              <LatestSignalPanel
                latestRun={latestRun}
                selectedRepo={selectedRepo}
                isLoading={isLoading}
                isCreating={isCreating}
                isProcessing={isProcessing}
                latestSignalEvidence={latestSignalEvidence}
                decidingRunId={decidingRunId}
                implementingRunId={implementingRunId}
                onDecide={decideRun}
                onRunAction={runImplementationAction}
                onOpenRun={(runId) => router.push(`/dashboard/runs/${runId}?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=${activeTab}`)}
                onGoGitHub={() => setDashboardTab("github")}
              />
            </div>
          </section>
        ) : null}

        {activeTab === "all-signals" ? (
          <section id="all-signals-panel" role="tabpanel" aria-labelledby="all-signals-tab">
            <AllSignalsPanel
              selectedRepo={selectedRepo}
              signals={signals}
              filteredSignals={filteredSignals}
              query={signalQuery}
              filter={signalFilter}
              isLoading={isLoading}
              onQueryChange={setSignalQuery}
              onFilterChange={setSignalFilter}
              onOpenSignal={(signalId) => router.push(`/dashboard/signals/${signalId}?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=all-signals`)}
              onGoGitHub={() => setDashboardTab("github")}
            />
          </section>
        ) : null}

        {activeTab === "github" ? (
          <section id="github-panel" role="tabpanel" aria-labelledby="github-tab">
            <GitHubPanel
              githubStatus={githubStatus}
              selectedRepoConnectionId={selectedRepoConnectionId}
              onActiveRepoSelected={(connection) => {
                if (!connection._id) return;
                window.localStorage.setItem("signalgen:selectedRepoConnectionId", connection._id);
                setSelectedRepoConnectionId(connection._id);
                setActiveTab("new-analysis");
                replaceDashboardUrl({ repoConnectionId: connection._id, tab: "new-analysis" });
              }}
              onRepoSelected={loadGitHubStatus}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function DashboardHeader({ selectedRepo, onRefresh }: { selectedRepo?: RepoConnection; onRefresh: () => void }) {
  return (
    <header style={{ marginBottom: 2 }}>
      <Link href="/" className="sg-link" style={{ display: "inline-flex", marginBottom: 18, fontSize: 14.5 }}>
        <Icon name="arrowL" size={16} /> SignalGen home
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="sg-display" style={{ fontSize: "clamp(34px,4vw,50px)", lineHeight: 0.98, margin: 0 }}>
            Founder signal dashboard
          </h1>
          <p style={{ maxWidth: 760, color: "var(--ink-soft)", marginTop: 14, fontSize: 17, lineHeight: 1.55 }}>
            {selectedRepo
              ? `Current repo: ${selectedRepo.owner}/${selectedRepo.repo}. Sessions, signals, decisions, and PR work stay scoped to this workspace.`
              : "Choose one connected repo before creating signals, sessions, or PR work."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ThemeMenu />
          <Button variant="ghost" size="lg" onClick={onRefresh} leftIcon={<Icon name="refresh" size={17} />}>
            Refresh
          </Button>
        </div>
      </div>
    </header>
  );
}

function EmptyRepoState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="sg-grid-bg" style={{ padding: "48px 32px", textAlign: "center" }}>
      <span style={{ width: 54, height: 54, borderRadius: 15, display: "grid", placeItems: "center", margin: "0 auto 16px", background: "var(--inset)", color: "var(--ink-faint)", border: "1px dashed var(--line-2)" }}>
        <Icon name="branch" size={24} />
      </span>
      <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: "var(--ink-soft)", fontSize: 14.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.55 }}>{body}</p>
      {action ? <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>{action}</div> : null}
    </Card>
  );
}

function UploadCard({
  selectedRepo,
  files,
  fileNames,
  isDragging,
  isCreating,
  isProcessing,
  pastedText,
  processingStage,
  onDraggingChange,
  onFiles,
  onCreateRun,
  onCreateDemoRun,
  onPasteTextChange,
  onCreatePasteRun,
  onGoGitHub,
}: {
  selectedRepo?: RepoConnection;
  files: File[];
  fileNames: string[];
  isDragging: boolean;
  isCreating: boolean;
  isProcessing: boolean;
  pastedText: string;
  processingStage: number;
  onDraggingChange: (dragging: boolean) => void;
  onFiles: (files: File[]) => void;
  onCreateRun: () => void;
  onCreateDemoRun: () => void;
  onPasteTextChange: (value: string) => void;
  onCreatePasteRun: () => void;
  onGoGitHub: () => void;
}) {
  const busy = isCreating || isProcessing;
  return (
    <Card style={{ padding: "var(--pad-card)" }}>
      <Eyebrow>New analysis</Eyebrow>
      <h2 className="sg-display" style={{ fontSize: 24, margin: "8px 0" }}>Upload screenshots</h2>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 18 }}>
        {selectedRepo
          ? `Drop Xiaohongshu, Instagram, Reddit, or app-review screenshots. This session is scoped to ${selectedRepo.owner}/${selectedRepo.repo}.`
          : "Choose a repo from the GitHub tab before uploading feedback. SignalGen will not create sessions without an explicit repo."}
      </p>

      {selectedRepo ? (
        <>
          {!isProcessing ? (
            <label
              style={{
                width: "100%",
                minHeight: 184,
                border: "1.6px dashed var(--line-2)",
                background: isDragging ? "var(--signal-soft)" : "var(--inset)",
                borderColor: isDragging ? "var(--signal)" : "var(--line-2)",
                borderRadius: "var(--rad)",
                padding: "34px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: ".18s",
                color: "var(--ink)",
                display: "grid",
                placeItems: "center",
              }}
              onDragOver={(event) => {
                event.preventDefault();
                onDraggingChange(true);
              }}
              onDragLeave={() => onDraggingChange(false)}
              onDrop={(event) => {
                event.preventDefault();
                onDraggingChange(false);
                onFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <span>
                <span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: 13, background: "var(--node-bg)", color: "var(--signal)", margin: "0 auto 12px", boxShadow: "var(--shadow-card)" }}>
                  <Icon name="upload" size={22} />
                </span>
                <span style={{ display: "block", fontSize: 17, fontWeight: 800 }}>Drop or choose screenshots</span>
                <span className="sg-meta" style={{ display: "block", marginTop: 6 }}>PNG, JPG, or WebP · Max 5 · 4 MB each · 8 MB total</span>
              </span>
              <input
                multiple
                accept="image/png,image/jpeg,image/webp"
                type="file"
                className="sr-only"
                onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          ) : (
            <Panel style={{ padding: 22, borderColor: "var(--signal)" }}>
              <Eyebrow>Detecting signal…</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 18px" }}>
                {PROCESSING_COMMENTS.slice(0, Math.min(PROCESSING_COMMENTS.length, processingStage + 1)).map((comment, index) => (
                  <div key={comment} className="sg-tune" style={{ fontSize: 13.5, padding: "8px 12px", borderRadius: 10, background: "var(--signal-soft)", borderLeft: "2px solid var(--signal)", color: "var(--ink)", animationDelay: `${index * 60}ms` }}>
                    {comment}
                  </div>
                ))}
              </div>
              <PipelineStrip current={Math.min(3, processingStage)} stages={SG_STAGES.slice(0, 4)} />
            </Panel>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
            <button className="sg-link" onClick={onCreateDemoRun} disabled={busy} style={{ background: "none", border: "none", fontFamily: "var(--sans)", fontSize: 14, opacity: busy ? 0.5 : 1 }}>
              <Icon name="spark" size={13} /> Use sample feedback
            </button>
            <Button variant="signal" size="sm" onClick={onCreateRun} disabled={busy || files.length === 0} loading={isCreating && files.length > 0}>
              {isProcessing ? "Agent is processing..." : isCreating ? "Extracting comments..." : "Upload and run agent"}
            </Button>
          </div>

          <Field label="Or paste feedback comments" hint="One comment per line. This keeps the same JSON /api/runs creation path.">
            <Textarea
              value={pastedText}
              onChange={(event) => onPasteTextChange(event.target.value)}
              placeholder="Paste one comment per line…"
              rows={4}
              style={{ marginTop: 10 }}
            />
          </Field>
          <Button variant="ghost" size="sm" onClick={onCreatePasteRun} disabled={busy || pastedText.trim() === ""} style={{ marginTop: 12 }}>
            Analyze pasted feedback
          </Button>

          {fileNames.length > 0 ? (
            <Panel style={{ marginTop: 16, padding: 16 }}>
              <Eyebrow soft>Selected screenshots</Eyebrow>
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.7 }}>
                {fileNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      ) : (
        <EmptyRepoState title="Choose a repo first" body="Uploads and sample feedback are disabled until you choose a connected repository." action={<Button variant="ghost" size="sm" onClick={onGoGitHub}>Open GitHub tab</Button>} />
      )}
    </Card>
  );
}

function LatestSignalPanel({
  latestRun,
  selectedRepo,
  isLoading,
  isCreating,
  isProcessing,
  latestSignalEvidence,
  decidingRunId,
  implementingRunId,
  onDecide,
  onRunAction,
  onOpenRun,
  onGoGitHub,
}: {
  latestRun?: ApiRun;
  selectedRepo?: RepoConnection;
  isLoading: boolean;
  isCreating: boolean;
  isProcessing: boolean;
  latestSignalEvidence: NonNullable<ApiRun["evidenceItems"]>;
  decidingRunId: string | null;
  implementingRunId: string | null;
  onDecide: (runId: string, action: "approve" | "reject") => Promise<void>;
  onRunAction: (runId: string, action: "start" | "prepare-pr") => Promise<void>;
  onOpenRun: (runId: string) => void;
  onGoGitHub: () => void;
}) {
  return (
    <Card style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <Eyebrow>Latest signal</Eyebrow>
        {isCreating || isProcessing ? <Pill variant="signal" dot>Running</Pill> : latestRun ? <Pill variant="success" dot>Repo scoped</Pill> : null}
      </div>

      {!selectedRepo ? (
        <EmptyRepoState title="Choose a repo first" body="Each repo has its own saved signal session. Pick a GitHub workspace before reviewing latest signals." action={<Button variant="ghost" size="sm" onClick={onGoGitHub}>Open GitHub tab</Button>} />
      ) : isLoading ? (
        <Panel style={{ padding: 20 }}>Loading signals...</Panel>
      ) : latestRun ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Gauge value={latestRun.signal?.confidence ?? 0} size={88} stroke={9} label="confidence" sub="signal" />
            <div>
              <Pill variant={runStatusVariant(latestRun.status)}>{formatSignalLabel(latestRun.status)}</Pill>
              <h3 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, margin: "10px 0 8px" }}>{latestRun.signal?.title ?? "Pending analysis"}</h3>
              <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>{latestRun.signal?.summary ?? ""}</p>
            </div>
          </div>

          {latestRun.extractionDiagnostics ? (
            <Panel style={{ padding: 14 }}>
              <Eyebrow soft>Extraction</Eyebrow>
              <p style={{ margin: "8px 0 0", color: "var(--ink-soft)", fontSize: 13.5 }}>
                Extracted from {latestRun.extractionDiagnostics.screenshotCount} screenshot{latestRun.extractionDiagnostics.screenshotCount !== 1 ? "s" : ""} · {latestRun.extractionDiagnostics.commentCount} comment{latestRun.extractionDiagnostics.commentCount !== 1 ? "s" : ""} found
              </p>
            </Panel>
          ) : null}

          <Panel style={{ padding: 14 }}>
            <Eyebrow soft>Top evidence</Eyebrow>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {latestSignalEvidence.length > 0
                ? latestSignalEvidence.map((item, index) => <Evidence key={item.id} e={{ ...item, comment: item.summary }} i={index} />)
                : (latestRun.signal?.evidence ?? []).map((quote, index) => <Evidence key={quote} quote={quote} confidence={latestRun.signal?.confidence ?? 0} i={index} />)}
            </div>
          </Panel>

          <div className="dashboard-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            <MetricTile label="Comments" value={latestRun.comments?.length ?? 0} />
            <MetricTile label="Clusters" value={latestRun.signalClusters?.length ?? 0} />
            <MetricTile label="Files" value={latestRun.plan?.filesToChange?.length ?? 0} />
          </div>

          <InfoGrid title="Agent rationale" items={(latestRun.signalClusters ?? []).map((cluster) => cluster.rationale)} />
          <InfoGrid title="Guardrails" items={latestRun.plan?.guardrails ?? []} />
          <InfoGrid title="Files to change" items={latestRun.plan?.filesToChange ?? []} />
          <InfoGrid title="Acceptance criteria" items={latestRun.plan?.acceptanceCriteria ?? []} />

          <Panel style={{ padding: 16 }}>
            <Eyebrow soft>Recommended product change</Eyebrow>
            <p style={{ margin: "8px 0 0", color: "var(--ink)", lineHeight: 1.55 }}>{latestRun.plan?.recommendedChange ?? "Awaiting agent analysis."}</p>
          </Panel>

          <FounderDecisionPanel run={latestRun} decidingRunId={decidingRunId} onDecide={onDecide} />
          <ImplementationPanel run={latestRun} implementingRunId={implementingRunId} onRunAction={onRunAction} />
          <Button variant="signal" block onClick={() => onOpenRun(latestRun._id)} rightIcon={<Icon name="arrow" size={16} />}>
            Open run detail
          </Button>
        </div>
      ) : (
        <EmptyRepoState title="No signals yet" body="No signals yet for this repo. Upload feedback or use sample feedback to create your first repo-scoped signal." />
      )}
    </Card>
  );
}

function AllSignalsPanel({
  selectedRepo,
  signals,
  filteredSignals,
  query,
  filter,
  isLoading,
  onQueryChange,
  onFilterChange,
  onOpenSignal,
  onGoGitHub,
}: {
  selectedRepo?: RepoConnection;
  signals: ApiSignal[];
  filteredSignals: ApiSignal[];
  query: string;
  filter: SignalFilter;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: SignalFilter) => void;
  onOpenSignal: (signalId: string) => void;
  onGoGitHub: () => void;
}) {
  if (!selectedRepo) {
    return <EmptyRepoState title="Choose a repo first" body="Signal memory is separated per repository. Open the GitHub tab and choose a connected repo to view its signals." action={<Button variant="ghost" size="sm" onClick={onGoGitHub}>Open GitHub tab</Button>} />;
  }

  return (
    <Card style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>All signals · {selectedRepo.owner}/{selectedRepo.repo}</Eyebrow>
          <p style={{ margin: "8px 0 0", color: "var(--ink-soft)", lineHeight: 1.55, fontSize: 14 }}>
            Signals, evidence, and decisions saved for this connected repository.
          </p>
        </div>
        <Pill variant="outline">{filteredSignals.length} of {signals.length} signals</Pill>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Input aria-label="Search signals" placeholder="Search signals…" value={query} onChange={(event) => onQueryChange(event.target.value)} style={{ maxWidth: 280 }} />
        <div role="group" aria-label="Filter signals" style={{ display: "flex", gap: 8, overflowX: "auto", maxWidth: "100%" }}>
          {SIGNAL_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="sg-tab"
              aria-pressed={filter === item.id}
              onClick={() => onFilterChange(item.id)}
              style={{ padding: "10px 17px", fontSize: 13.5, whiteSpace: "nowrap", background: filter === item.id ? "var(--signal)" : undefined, color: filter === item.id ? "#071014" : undefined }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Panel style={{ padding: 20 }}>Loading signals...</Panel>
      ) : filteredSignals.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredSignals.map((signal) => (
            <SignalRow key={signal._id} signal={signal} onOpenSignal={onOpenSignal} />
          ))}
        </div>
      ) : signals.length > 0 ? (
        <Panel style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)" }}>No signals match your search.</Panel>
      ) : (
        <Panel style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>No signals yet for this repo.</Panel>
      )}
    </Card>
  );
}

function SignalRow({ signal, onOpenSignal }: { signal: ApiSignal; onOpenSignal: (signalId: string) => void }) {
  const evidenceItemIds = signal.evidenceItemIds ?? [];
  const signalId = signal._id;
  const hasSignal = Boolean(signalId);
  return (
    <button
      type="button"
      onClick={signalId ? () => onOpenSignal(signalId) : undefined}
      disabled={!hasSignal}
      className="sg-row"
      aria-disabled={!hasSignal}
      style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "left", cursor: hasSignal ? "pointer" : "default", opacity: hasSignal ? 1 : 0.62, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "var(--rad)", padding: "14px 16px", transition: ".16s", fontFamily: "var(--sans)", color: "var(--ink)", width: "100%" }}
    >
      <Gauge value={signal.confidence ?? 0} size={48} stroke={5} label="confidence" sub="" animate={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>{signal.title || "Untitled signal"}</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{signal.summary || "No summary saved yet."}</div>
        <div className="sg-meta" style={{ marginTop: 6 }}>{evidenceItemIds.length} evidence item{evidenceItemIds.length !== 1 ? "s" : ""} · updated {formatSignalDate(signal.updatedAt)}</div>
      </div>
      <div className="signal-row-meta" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flex: "none" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill variant={signalTypeVariant(signal.type)}>{formatSignalLabel(signal.type)}</Pill>
          {signal.type !== "noise" && signal.type !== "praise" ? (
            <Pill variant={signalStatusVariant(signal.status)} dot>{formatSignalLabel(signal.status)}</Pill>
          ) : null}
        </div>
        <span className="sg-meta">Strength {formatSignalPercent(signal.strength)} · Confidence {formatSignalPercent(signal.confidence)}</span>
        {signal.currentPlan?.approvalDecision ? (
          <span className="sg-meta">Founder {signal.currentPlan.approvalDecision.action === "approve" ? "approved" : "rejected"} · {formatSignalDate(signal.currentPlan.approvalDecision.decidedAt)}</span>
        ) : signal.status === "plan_ready" && signal.currentPlan ? (
          <span style={{ color: "var(--warning)", fontSize: 12 }}>Plan awaiting founder decision</span>
        ) : null}
        <span className="sg-meta">{hasSignal ? "View signal detail" : "Signal unavailable"}</span>
      </div>
      <span style={{ color: "var(--ink-faint)", opacity: hasSignal ? 1 : 0.45 }}><Icon name="arrow" size={18} /></span>
    </button>
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
    return <Card style={{ padding: "var(--pad-card)" }}>Loading GitHub connection status...</Card>;
  }

  if (githubStatus.status === "error") {
    return <Panel role="alert" style={{ borderColor: "var(--error-line)", background: "var(--error-bg)", color: "var(--error)", padding: 18 }}>{githubStatus.message}</Panel>;
  }

  if (githubStatus.status === "disconnected") {
    return (
      <Card style={{ padding: "var(--pad-card)" }}>
        <Eyebrow>GitHub</Eyebrow>
        <h2 className="sg-display" style={{ fontSize: 24, margin: "8px 0" }}>GitHub is not connected.</h2>
        <p style={{ maxWidth: 720, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Connect the GitHub App so SignalGen can remember which product repository belongs to this workspace.
        </p>
        <a href="/api/github/install" className="sg-btn sg-btn--signal" style={{ display: "inline-flex", marginTop: 18 }}>
          Connect GitHub App
        </a>
      </Card>
    );
  }

  if (githubStatus.status === "installed") {
    return (
      <Card style={{ padding: "var(--pad-card)" }}>
        <Eyebrow>GitHub</Eyebrow>
        <h2 className="sg-display" style={{ fontSize: 24, margin: "8px 0" }}>GitHub App installed. Select a repository to connect.</h2>
        <p style={{ maxWidth: 720, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Repo write capabilities remain disabled until all implementation gates are active.
        </p>
        <form onSubmit={(event) => void submitRepoSelection(event)} style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }} className="github-connect-grid">
          <Field label="Owner">
            <Input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="viviannnl" />
          </Field>
          <Field label="Repo">
            <Input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="SignalGen" />
          </Field>
          <Field label="Default branch">
            <Input value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} placeholder="main" />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Button type="submit" variant="signal" disabled={isSubmitting || owner.trim() === "" || repo.trim() === "" || defaultBranch.trim() === ""} loading={isSubmitting}>
              {isSubmitting ? "Connecting repo..." : "Connect repository"}
            </Button>
            {submitError ? <p style={{ marginTop: 12, color: "var(--error)", fontSize: 14 }}>{submitError}</p> : null}
          </div>
        </form>
      </Card>
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
    <Card style={{ padding: "var(--pad-card)" }}>
      <Eyebrow>GitHub</Eyebrow>
      <h2 className="sg-display" style={{ fontSize: 24, margin: "8px 0" }}>Connected repositories</h2>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 22, maxWidth: 820 }}>
        Choose one repo to open its workspace. Connected repos are account-level access; sessions, signals, decisions, and PR work are repo-scoped. {enabledForDraftPrs.length} of {connectedRepos.length} repos can receive SignalGen branches, commits, and draft PRs. Issue creation is enabled for {enabledForIssues.length} of {connectedRepos.length} repos.
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        {connectedRepos.map((connection) => {
          const canCreateDraftPr = connection.capabilities.branch_push && connection.capabilities.pr_creation;
          const isActive = connection._id === selectedRepoConnectionId;
          return (
            <Panel key={connection._id ?? `${connection.owner}/${connection.repo}`} className="sg-ticked" style={{ padding: 22, borderColor: isActive ? "var(--success-line)" : "var(--line)" }}>
              <div className="github-repo-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px", marginBottom: 18 }}>
                <RepoFact label="Owner" value={connection.owner} />
                <RepoFact label="Repo" value={connection.repo} />
                <RepoFact label="Default branch" value={connection.defaultBranch} />
                <RepoFact label="Installation ID" value={connection.installationId ?? githubStatus.installationId} />
                <RepoFact label="Draft PR automation" value={canCreateDraftPr ? "Enabled" : "Disabled"} tone={canCreateDraftPr ? "success" : "warning"} />
                <RepoFact label="Issues" value={connection.capabilities.issue_creation ? "Enabled" : "Disabled"} tone={connection.capabilities.issue_creation ? "success" : "muted"} />
              </div>
              <Button type="button" variant="signal" size="sm" onClick={() => onActiveRepoSelected(connection)} disabled={!connection._id || isActive}>
                {isActive ? "Current repo workspace" : "Open workspace"}
              </Button>
            </Panel>
          );
        })}
      </div>
    </Card>
  );
}

function RepoFact({ label, value, tone = "muted" }: { label: string; value: string; tone?: "success" | "warning" | "muted" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
      <span className="sg-meta">{label}</span>
      <span style={{ color: tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--ink)", fontWeight: 700 }}>{value}</span>
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
  onDecide: (runId: string, action: "approve" | "reject") => Promise<void>;
}) {
  if (run.founderDecision) {
    return (
      <Panel style={{ borderColor: "var(--success-line)", background: "var(--success-bg)", padding: 18 }}>
        <Eyebrow>Founder decision</Eyebrow>
        <p style={{ margin: "10px 0 0", fontSize: 18, fontWeight: 800 }}>{run.founderDecision.action === "approve" ? "Approved" : "Rejected"}</p>
        <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: 13.5 }}>{new Date(run.founderDecision.decidedAt).toLocaleString()}</p>
        {run.founderDecision.note ? <p style={{ margin: "10px 0 0", color: "var(--ink-soft)", fontSize: 14 }}>“{run.founderDecision.note}”</p> : null}
      </Panel>
    );
  }

  if (run.status !== "plan_ready") {
    return (
      <Panel style={{ padding: 18 }}>
        <Eyebrow soft>Founder approval gate</Eyebrow>
        <p style={{ margin: "8px 0 0", color: "var(--ink-soft)", lineHeight: 1.55, fontSize: 14 }}>
          Approval controls appear once the agent has enough evidence and marks a run as plan-ready.
        </p>
      </Panel>
    );
  }

  const isDeciding = decidingRunId === run._id;

  return (
    <Panel style={{ borderColor: "var(--warning-line)", background: "var(--warning-bg)", padding: 18 }}>
      <Eyebrow>Founder approval required</Eyebrow>
      <p style={{ margin: "10px 0 0", color: "var(--ink)", lineHeight: 1.55, fontSize: 14 }}>
        SignalGen found enough evidence to propose a plan. Approving only records your decision for the next PR step; it does not edit code yet.
      </p>
      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button variant="success" onClick={() => void onDecide(run._id, "approve")} disabled={isDeciding} loading={isDeciding}>
          {isDeciding ? "Saving..." : "Approve plan"}
        </Button>
        <Button variant="danger" onClick={() => void onDecide(run._id, "reject")} disabled={isDeciding}>
          Reject plan
        </Button>
      </div>
    </Panel>
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
      <Panel style={{ borderColor: "var(--signal)", background: "var(--signal-soft)", padding: 18 }}>
        <Eyebrow>Guarded implementation</Eyebrow>
        <p style={{ margin: "10px 0 0", color: "var(--ink)", lineHeight: 1.55, fontSize: 14 }}>
          This approved signal is ready for the next safe agent step. Starting implementation only queues an auditable job; it does not edit code or create a PR yet.
        </p>
        <Button variant="signal" onClick={() => void onRunAction(run._id, "start")} disabled={isWorking} loading={isWorking} style={{ marginTop: 16 }}>
          {isWorking ? "Starting..." : "Start guarded implementation"}
        </Button>
      </Panel>
    );
  }

  return (
    <Panel style={{ borderColor: "var(--signal)", background: "var(--signal-soft)", padding: 18 }}>
      <Eyebrow>Implementation memory</Eyebrow>
      <p style={{ margin: "10px 0 0", fontSize: 18, fontWeight: 800 }}>{run.implementation.status}</p>
      <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: 13.5 }}>Branch: {run.implementation.branchName}</p>
      <p style={{ margin: "10px 0 0", color: "var(--ink)", lineHeight: 1.55, fontSize: 14 }}>{run.implementation.summary}</p>
      {run.implementation.status === "queued" ? (
        <Button variant="signal" onClick={() => void onRunAction(run._id, "prepare-pr")} disabled={isWorking} loading={isWorking} style={{ marginTop: 16 }}>
          {isWorking ? "Preparing..." : "Prepare PR draft"}
        </Button>
      ) : null}
      {run.implementation.prDraft ? (
        <Panel style={{ marginTop: 16, padding: 16 }}>
          <p style={{ fontWeight: 800 }}>{run.implementation.prDraft.title}</p>
          <p className="sg-meta" style={{ marginTop: 6 }}>PR branch: {run.implementation.prDraft.branchName}</p>
          <InfoGrid title="Files to inspect" items={run.implementation.prDraft.filesToInspect} />
          <InfoGrid title="Test commands" items={run.implementation.prDraft.testCommands} />
          <InfoGrid title="Checklist" items={run.implementation.prDraft.checklist} />
          <details style={{ marginTop: 14, color: "var(--ink-soft)", fontSize: 14 }}>
            <summary className="sg-link" style={{ cursor: "pointer" }}>View PR body draft</summary>
            <pre style={{ marginTop: 12, maxHeight: 288, overflow: "auto", whiteSpace: "pre-wrap", borderRadius: 14, background: "var(--inset)", padding: 14, color: "var(--ink)", fontSize: 12, lineHeight: 1.45 }}>
              {run.implementation.prDraft.body}
            </pre>
          </details>
        </Panel>
      ) : null}
    </Panel>
  );
}

function InfoGrid({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel style={{ padding: 14 }}>
      <Eyebrow soft>{title}</Eyebrow>
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14 }}>
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li style={{ color: "var(--ink-faint)" }}>No items yet.</li>}
      </ul>
    </Panel>
  );
}

function initialDashboardTab(): DashboardTab {
  if (typeof window === "undefined") return "new-analysis";
  const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
  return isDashboardTab(tabFromUrl) ? tabFromUrl : "new-analysis";
}

function validateDashboardScreenshotFiles(inputFiles: File[]): { files: File[]; error: string | null } {
  const files = inputFiles.slice(0, MAX_SCREENSHOT_FILES);
  if (inputFiles.length > MAX_SCREENSHOT_FILES) {
    return { files, error: "Please upload at most 5 screenshots per run. The first 5 were selected." };
  }

  const unsupported = files.find((file) => !ACCEPTED_SCREENSHOT_TYPES.has(file.type));
  if (unsupported) {
    return { files: [], error: "Screenshots must be PNG, JPG, or WebP files." };
  }

  const oversized = files.find((file) => file.size > MAX_SCREENSHOT_FILE_BYTES);
  if (oversized) {
    return { files: [], error: "Each screenshot must be 4 MB or smaller." };
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_SCREENSHOT_TOTAL_BYTES) {
    return { files: [], error: "Upload at most 8 MB of screenshots per run." };
  }

  return { files, error: null };
}

function isDashboardTab(value: string | null): value is DashboardTab {
  return value === "new-analysis" || value === "all-signals" || value === "github";
}

function shortId(value: string) {
  return value.length > 8 ? value.slice(-8) : value;
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

function signalTypeVariant(type: string | undefined): "success" | "warning" | "error" | "info" | "signal" | "outline" {
  switch (type) {
    case "feature_request":
      return "signal";
    case "bug":
      return "error";
    case "praise":
      return "success";
    case "trust_objection":
    case "pricing":
      return "warning";
    case "friction":
      return "info";
    default:
      return "outline";
  }
}

function signalStatusVariant(status: string | undefined): "success" | "warning" | "error" | "info" | "signal" | "outline" {
  switch (status) {
    case "approved":
    case "implemented":
      return "success";
    case "rejected":
      return "error";
    case "plan_ready":
      return "warning";
    case "accumulating":
    case "needs_more_evidence":
      return "info";
    default:
      return "outline";
  }
}

function runStatusVariant(status: string | undefined): "success" | "warning" | "error" | "info" | "signal" | "outline" {
  switch (status) {
    case "approved":
    case "pr_created":
      return "success";
    case "rejected":
    case "failed":
      return "error";
    case "plan_ready":
    case "needs_review":
      return "warning";
    case "signal_detected":
    case "insufficient_evidence":
      return "info";
    default:
      return "outline";
  }
}

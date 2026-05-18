import type { SignalCluster, SignalDecision, SignalGenRun, SignalGenRunStatus, SignalSeverity, SignalType } from "./types";

const BUG_WORDS = ["bug", "broken", "crash", "error", "fail", "cannot", "can't", "doesn't work", "stuck"];
const FEATURE_WORDS = ["can you add", "feature", "would love", "need", "wish", "support", "integration"];
const FRICTION_WORDS = ["confusing", "hard", "unclear", "don't understand", "takes too long", "generic"];
const TRUST_WORDS = ["trust", "fake", "scam", "safe", "secure", "ai-generated", "obviously ai"];
const PRICING_WORDS = ["price", "pricing", "expensive", "cost", "free", "trial", "subscription"];
const PRAISE_WORDS = ["love", "great", "helpful", "amazing", "awesome", "works well"];

const PENDING_STATUSES: SignalGenRunStatus[] = ["uploaded", "signal_detected"];

export type AgentTickStore = {
  listPendingRuns: (limit: number, runId?: string) => Promise<SignalGenRun[]>;
  updateRunAnalysis: (runId: string, update: Partial<SignalGenRun>) => Promise<boolean>;
};

export type AgentTickResult = {
  ok: true;
  processedCount: number;
  processedRunIds: string[];
};

export function classifyComment(text: string): SignalType {
  const lower = text.toLowerCase();

  if (BUG_WORDS.some((word) => lower.includes(word))) return "bug";
  if (FEATURE_WORDS.some((word) => lower.includes(word))) return "feature_request";
  if (TRUST_WORDS.some((word) => lower.includes(word))) return "trust_objection";
  if (PRICING_WORDS.some((word) => lower.includes(word))) return "pricing";
  if (FRICTION_WORDS.some((word) => lower.includes(word))) return "friction";
  if (PRAISE_WORDS.some((word) => lower.includes(word))) return "praise";

  return "noise";
}

function severityFor(type: SignalType, frequency: number): SignalSeverity {
  if (type === "bug" && frequency >= 2) return "high";
  if (["bug", "trust_objection", "pricing"].includes(type) && frequency >= 1) return "medium";
  if (["feature_request", "friction"].includes(type) && frequency >= 3) return "medium";
  return "low";
}

function decideCluster(type: SignalType, frequency: number, severity: SignalSeverity): SignalDecision {
  if (type === "bug" && severity === "high" && frequency >= 2) return "propose_plan";
  if (type === "bug" && frequency === 1 && severity !== "low") return "urgent_review";
  if (["feature_request", "friction", "trust_objection"].includes(type) && frequency >= 3) return "propose_plan";
  if (["bug", "feature_request", "friction", "trust_objection", "pricing"].includes(type) && frequency >= 2) {
    return "needs_more_evidence";
  }
  return "store_only";
}

function titleFor(type: SignalType): string {
  switch (type) {
    case "bug":
      return "Repeated bug reports detected";
    case "feature_request":
      return "Repeated feature request detected";
    case "friction":
      return "Repeated product friction detected";
    case "trust_objection":
      return "Repeated trust objection detected";
    case "pricing":
      return "Pricing concern detected";
    case "praise":
      return "Positive feedback detected";
    case "noise":
      return "Low-signal feedback stored";
  }
}

function rationaleFor(type: SignalType, frequency: number, severity: SignalSeverity, decision: SignalDecision): string {
  if (decision === "propose_plan") {
    return `Evidence is strong enough to draft a plan: ${frequency} related ${type.replace("_", " ")} comment(s), severity ${severity}.`;
  }
  if (decision === "urgent_review") {
    return "Potentially severe issue detected; request founder review before planning changes.";
  }
  if (decision === "needs_more_evidence") {
    return "Pattern is emerging, but the agent should collect or wait for more evidence before proposing a code change.";
  }
  return "Evidence is too weak or noisy for action; store in memory only.";
}

function buildSignalClusters(comments: string[]): SignalCluster[] {
  const grouped = new Map<SignalType, Array<{ id: string; text: string }>>();

  comments.forEach((text, index) => {
    const type = classifyComment(text);
    const item = { id: `comment-${index + 1}`, text };
    grouped.set(type, [...(grouped.get(type) ?? []), item]);
  });

  return Array.from(grouped.entries()).map(([type, items]) => {
    const frequency = items.length;
    const severity = severityFor(type, frequency);
    const decision = decideCluster(type, frequency, severity);
    const confidence = Math.min(0.55 + frequency * 0.12, 0.95);

    return {
      id: `${type}-${frequency}`,
      type,
      title: titleFor(type),
      summary: `${frequency} related comment${frequency === 1 ? "" : "s"} classified as ${type.replace("_", " ")}.`,
      evidenceCommentIds: items.map((item) => item.id),
      severity,
      frequency,
      confidence,
      decision,
      rationale: rationaleFor(type, frequency, severity, decision),
    };
  });
}

function selectTopCluster(clusters: SignalCluster[]): SignalCluster | undefined {
  const decisionRank: Record<SignalDecision, number> = {
    urgent_review: 4,
    propose_plan: 3,
    needs_more_evidence: 2,
    store_only: 1,
  };

  return [...clusters].sort((a, b) => {
    const byDecision = decisionRank[b.decision] - decisionRank[a.decision];
    if (byDecision !== 0) return byDecision;
    const byFrequency = b.frequency - a.frequency;
    if (byFrequency !== 0) return byFrequency;
    return b.confidence - a.confidence;
  })[0];
}

function statusForDecision(decision?: SignalDecision): SignalGenRunStatus {
  if (decision === "propose_plan") return "plan_ready";
  if (decision === "urgent_review" || decision === "needs_more_evidence") return "needs_review";
  if (decision === "store_only" || !decision) return "insufficient_evidence";
  return "signal_detected";
}

function planFor(cluster: SignalCluster | undefined): SignalGenRun["plan"] {
  const guardrails = [
    "No code changes before founder approval.",
    "Create a branch and PR instead of pushing directly to main.",
    "Do not touch secrets, auth, billing, or database migrations without explicit approval.",
    "Run build/tests before marking any PR ready for review.",
  ];

  if (!cluster || cluster.decision !== "propose_plan") {
    return {
      recommendedChange: cluster
        ? "Store this signal in memory and wait for more evidence before proposing a product change."
        : "No actionable product signal was detected yet.",
      filesToChange: [],
      guardrails,
      acceptanceCriteria: ["Keep the run in memory for future clustering.", "Do not open a PR until evidence is stronger and the founder approves."],
    };
  }

  return {
    recommendedChange: `Draft a small, reviewable product improvement for: ${cluster.title}. Cite the evidence comments before asking for founder approval.`,
    filesToChange: ["Product UI/content file to be selected after founder approval"],
    guardrails,
    acceptanceCriteria: [
      "Plan cites the feedback comments that triggered it.",
      "Change is limited to approved product surfaces.",
      "Founder approval is captured before any repo edit or PR.",
      "Build/tests must pass before PR is marked ready for review.",
    ],
  };
}

export function analyzeDashboardRun(run: SignalGenRun): Partial<SignalGenRun> {
  const signalClusters = buildSignalClusters(run.comments ?? []);
  const topCluster = selectTopCluster(signalClusters);
  const status = statusForDecision(topCluster?.decision);
  const evidence = (run.comments ?? []).filter((_, index) => topCluster?.evidenceCommentIds.includes(`comment-${index + 1}`));
  const now = new Date().toISOString();

  return {
    status,
    updatedAt: now,
    processedAt: now,
    signalClusters,
    signal: topCluster
      ? {
          title: topCluster.title,
          summary: topCluster.summary,
          confidence: topCluster.confidence,
          evidence,
        }
      : {
          title: "No actionable signal detected yet",
          summary: "The agent tick ran, but the current feedback was too sparse or noisy to classify.",
          confidence: 0,
          evidence: [],
        },
    plan: planFor(topCluster),
  };
}

export async function processAgentTick(
  store: AgentTickStore,
  options: { limit?: number; runId?: string } = {},
): Promise<AgentTickResult> {
  const limit = options.limit ?? 5;
  const runs = await store.listPendingRuns(limit, options.runId);
  const processedRunIds: string[] = [];

  for (const run of runs) {
    if (!run._id || !PENDING_STATUSES.includes(run.status)) continue;

    const update = analyzeDashboardRun(run);
    const updated = await store.updateRunAnalysis(run._id, update);
    if (updated) {
      processedRunIds.push(run._id);
    }
  }

  return {
    ok: true,
    processedCount: processedRunIds.length,
    processedRunIds,
  };
}

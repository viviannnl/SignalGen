import type {
  ExtractedComment,
  ImplementationPlan,
  ProcessRunResult,
  RunStatus,
  SignalCluster,
  SignalGenRun,
  SignalSeverity,
  SignalType,
} from "../schemas.js";

const BUG_WORDS = ["bug", "broken", "crash", "error", "fail", "cannot", "can't", "doesn't work", "stuck"];
const FEATURE_WORDS = ["can you add", "feature", "would love", "need", "wish", "support", "integration"];
const FRICTION_WORDS = ["confusing", "hard", "unclear", "don't understand", "takes too long", "generic"];
const TRUST_WORDS = ["trust", "fake", "scam", "safe", "secure", "ai-generated", "obviously ai"];
const PRICING_WORDS = ["price", "pricing", "expensive", "cost", "free", "trial", "subscription"];
const PRAISE_WORDS = ["love", "great", "helpful", "amazing", "awesome", "works well"];

export function normalizeComments(run: SignalGenRun): ExtractedComment[] {
  return (run.extractedComments ?? []).map((comment, index) => {
    if (typeof comment === "string") {
      return { id: `comment-${index + 1}`, text: comment };
    }

    return {
      id: comment.id || `comment-${index + 1}`,
      text: comment.text,
      source: comment.source,
    };
  });
}

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

export function decideCluster(type: SignalType, frequency: number, severity: SignalSeverity): SignalCluster["decision"] {
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

export function buildSignalClusters(comments: ExtractedComment[]): SignalCluster[] {
  const grouped = new Map<SignalType, ExtractedComment[]>();

  for (const comment of comments) {
    const type = classifyComment(comment.text);
    grouped.set(type, [...(grouped.get(type) ?? []), comment]);
  }

  return [...grouped.entries()].map(([type, items]) => {
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
    } satisfies SignalCluster;
  });
}

function rationaleFor(type: SignalType, frequency: number, severity: SignalSeverity, decision: SignalCluster["decision"]): string {
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

export function selectTopCluster(clusters: SignalCluster[]): SignalCluster | undefined {
  const decisionRank: Record<SignalCluster["decision"], number> = {
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

export function statusForDecision(decision?: SignalCluster["decision"]): RunStatus {
  if (decision === "propose_plan") return "plan_ready";
  if (decision === "urgent_review" || decision === "needs_more_evidence") return "needs_review";
  if (decision === "store_only") return "insufficient_evidence";
  return "signal_detected";
}

export function buildImplementationPlan(cluster: SignalCluster | undefined): ImplementationPlan | undefined {
  if (!cluster || cluster.decision !== "propose_plan") return undefined;

  return {
    title: `Address: ${cluster.title}`,
    summary: "Draft a small, reviewable product improvement based on repeated customer evidence. Keep the change narrow and require founder approval before opening a PR.",
    proposedFiles: ["product UI/content file to be selected after founder approval"],
    acceptanceCriteria: [
      "Plan cites the evidence comments that triggered it.",
      "Change is limited to approved product surfaces.",
      "Build/tests must pass before PR is marked ready for review.",
    ],
    riskLevel: cluster.severity === "high" ? "medium" : "low",
  };
}

export function analyzeRun(run: SignalGenRun): ProcessRunResult {
  const runId = run._id ?? "local-preview-run";
  const comments = normalizeComments(run);
  const signalClusters = buildSignalClusters(comments);
  const topCluster = selectTopCluster(signalClusters);
  const status = statusForDecision(topCluster?.decision);
  const implementationPlan = buildImplementationPlan(topCluster);
  const evidence = comments
    .filter((comment) => topCluster?.evidenceCommentIds.includes(comment.id))
    .map((comment) => comment.text);

  return {
    runId,
    status,
    signalClusters,
    topSignal: topCluster
      ? {
          title: topCluster.title,
          summary: topCluster.summary,
          confidence: topCluster.confidence,
          evidence,
        }
      : undefined,
    implementationPlan,
  };
}

import {
  buildSignalClusters as buildSharedSignalClusters,
  classifyComment,
  decideCluster,
  selectTopCluster,
  statusForDecision,
} from "../../../src/lib/adk-agent-runtime.js";
import type {
  ExtractedComment,
  ImplementationPlan,
  ProcessRunResult,
  SignalCluster,
  SignalGenRun,
} from "../schemas.js";

export { classifyComment, decideCluster };

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

export function buildSignalClusters(comments: ExtractedComment[]): SignalCluster[] {
  return buildSharedSignalClusters(comments);
}

function buildImplementationPlan(cluster: SignalCluster | undefined): ImplementationPlan | undefined {
  if (!cluster || cluster.decision !== "propose_plan") return undefined;

  return {
    title: `Address: ${cluster.title}`,
    summary:
      "Draft a small, reviewable product improvement based on repeated customer evidence. Keep the change narrow and require founder approval before opening a PR.",
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
  const signalClusters = buildSharedSignalClusters(comments);
  const topCluster = selectTopCluster(signalClusters);
  const evidence = comments
    .filter((comment) => topCluster?.evidenceCommentIds.includes(comment.id))
    .map((comment) => comment.text);

  return {
    runId,
    status: statusForDecision(topCluster?.decision) as ProcessRunResult["status"],
    signalClusters,
    topSignal: topCluster
      ? {
          title: topCluster.title,
          summary: topCluster.summary,
          confidence: topCluster.confidence,
          evidence,
        }
      : undefined,
    implementationPlan: buildImplementationPlan(topCluster),
  };
}

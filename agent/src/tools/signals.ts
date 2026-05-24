import {
  analyzeRunWithGemini,
  buildSignalClusters as buildSharedSignalClusters,
  classifyComment,
  decideCluster,
} from "../core/analysis.js";
import type { ExtractedComment, ProcessRunResult, SignalGenRun } from "../schemas.js";

export { classifyComment, decideCluster };

export function normalizeComments(run: SignalGenRun): ExtractedComment[] {
  return (run.extractedComments ?? run.comments?.map((text, i) => ({ id: `comment-${i + 1}`, text })) ?? []).map((comment, index) => {
    if (typeof comment === "string") {
      return { id: `comment-${index + 1}`, text: comment };
    }
    const source = "source" in comment && typeof comment.source === "string" ? comment.source : undefined;
    return {
      id: comment.id || `comment-${index + 1}`,
      text: comment.text,
      source,
    };
  });
}

export function buildSignalClusters(comments: ExtractedComment[]) {
  return buildSharedSignalClusters(comments);
}

export async function analyzeRun(run: SignalGenRun): Promise<ProcessRunResult> {
  const runId = run._id ?? "local-preview-run";
  const normalizedComments = normalizeComments(run);
  const comments = normalizedComments.map((c) => c.text);

  const runForAnalysis: SignalGenRun = {
    ...run,
    comments,
  };

  const analysis = await analyzeRunWithGemini(runForAnalysis);

  return {
    runId,
    status: (analysis.status ?? run.status) as ProcessRunResult["status"],
    signalClusters: analysis.signalClusters ?? [],
    signal: analysis.signal,
    plan: analysis.plan,
    comments,
  };
}

import { checkAllGates, type GateContext, type GateResult } from "./implementation-gates";
import { findImplementationJobById, updateImplementationJob } from "./implementation-job-db";
import type { GitHubClient } from "./github-client";

export type { GateContext, GateResult };

export async function executeImplementationJob(
  jobId: string,
  context: GateContext,
  githubClient: GitHubClient,
): Promise<{ success: boolean; gateFailure?: GateResult; error?: string }> {
  const job = await findImplementationJobById(jobId);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status === "succeeded" || job.status === "cancelled") {
    return { success: false, error: `Job is already ${job.status}` };
  }

  const gateResult = checkAllGates(job, context);
  if (!gateResult.passed) {
    const now = new Date().toISOString();
    await updateImplementationJob(job._id!, {
      status: "blocked",
      logs: [...job.logs, `Gate failed: ${gateResult.gate} — ${gateResult.reason}`],
      updatedAt: now,
    });
    return { success: false, gateFailure: gateResult };
  }

  const runAt = new Date().toISOString();
  await updateImplementationJob(job._id!, {
    status: "running",
    attempts: job.attempts + 1,
    lastAttemptAt: runAt,
    updatedAt: runAt,
  });

  try {
    const conn = context.repoConnection!;

    await githubClient.createBranch({
      owner: conn.owner,
      repo: conn.repo,
      branchName: job.branchName,
      baseSha: conn.defaultBranch,
    });

    const commitResult = await githubClient.createCommit({
      owner: conn.owner,
      repo: conn.repo,
      branchName: job.branchName,
      message: `SignalGen: ${job.branchName}`,
      changes: [],
    });

    const prResult = await githubClient.openDraftPr({
      owner: conn.owner,
      repo: conn.repo,
      title: `SignalGen: ${job.branchName}`,
      body: `Automated implementation job ${jobId}. Branch: ${job.branchName}.`,
      head: job.branchName,
      base: conn.defaultBranch,
    });

    const doneAt = new Date().toISOString();
    await updateImplementationJob(job._id!, {
      status: "succeeded",
      commitSha: commitResult.sha,
      prUrl: prResult.prUrl,
      prNumber: prResult.prNumber,
      updatedAt: doneAt,
    });

    return { success: true };
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    const safeMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const failAt = new Date().toISOString();
    await updateImplementationJob(job._id!, {
      status: "requires_attention",
      errorClass,
      errorMessage: safeMessage,
      updatedAt: failAt,
    });
    return { success: false, error: safeMessage };
  }
}

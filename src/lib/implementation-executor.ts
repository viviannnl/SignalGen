import { checkAllGates, type GateContext, type GateResult } from "./implementation-gates";
import { findImplementationJobById, updateImplementationJob } from "./implementation-job-db";
import { writeAuditLog } from "./audit-log-db";
import type { GitHubClient } from "./github-client";
import type { AuditLog } from "./types";

export type { GateContext, GateResult };

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_ELIGIBLE_CLASSES = ["GitHubAPIError", "GitHubRateLimited", "MissingInstallationToken"];

async function safeWriteAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error("Failed to write implementation audit log", {
      action: entry.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

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
    await safeWriteAuditLog({
      workspaceId: job.workspaceId,
      actorUserId: context.requestingUserId,
      action: "implementation_job.gate_failed",
      resourceType: "implementation_job",
      resourceId: job._id!,
      detail: { gate: gateResult.gate, reason: gateResult.reason },
      createdAt: now,
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
  await safeWriteAuditLog({
    workspaceId: job.workspaceId,
    actorUserId: context.requestingUserId,
    action: "implementation_job.started",
    resourceType: "implementation_job",
    resourceId: job._id!,
    detail: { attempt: job.attempts + 1, branchName: job.branchName },
    createdAt: runAt,
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
    await safeWriteAuditLog({
      workspaceId: job.workspaceId,
      actorUserId: context.requestingUserId,
      action: "implementation_job.succeeded",
      resourceType: "implementation_job",
      resourceId: job._id!,
      detail: { prUrl: prResult.prUrl, prNumber: prResult.prNumber, commitSha: commitResult.sha },
      createdAt: doneAt,
    });

    return { success: true };
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    const safeMessage = `${errorClass} during execution attempt ${job.attempts + 1}`;
    const failAt = new Date().toISOString();
    const currentAttempts = job.attempts + 1;
    const shouldRetry = RETRY_ELIGIBLE_CLASSES.includes(errorClass) && currentAttempts < MAX_RETRY_ATTEMPTS;

    if (shouldRetry) {
      await updateImplementationJob(job._id!, {
        status: "failed",
        errorClass,
        errorMessage: safeMessage,
        updatedAt: failAt,
      });
      await safeWriteAuditLog({
        workspaceId: job.workspaceId,
        actorUserId: context.requestingUserId,
        action: "implementation_job.retry_scheduled",
        resourceType: "implementation_job",
        resourceId: job._id!,
        detail: { errorClass, attempt: currentAttempts, maxAttempts: MAX_RETRY_ATTEMPTS },
        createdAt: failAt,
      });
      return { success: false, error: safeMessage };
    }

    await updateImplementationJob(job._id!, {
      status: "requires_attention",
      errorClass,
      errorMessage: safeMessage,
      updatedAt: failAt,
    });
    await safeWriteAuditLog({
      workspaceId: job.workspaceId,
      actorUserId: context.requestingUserId,
      action: "implementation_job.requires_attention",
      resourceType: "implementation_job",
      resourceId: job._id!,
      detail: { errorClass, attempt: currentAttempts },
      createdAt: failAt,
    });
    return { success: false, error: safeMessage };
  }
}

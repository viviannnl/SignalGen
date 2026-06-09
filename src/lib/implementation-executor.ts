import { checkAllGates, type GateContext, type GateResult } from "./implementation-gates";
import { findImplementationJobById, updateImplementationJob } from "./implementation-job-db";
import { writeAuditLog } from "./audit-log-db";
import { generateImplementationChanges, type CodegenResult, type GenerateImplementationChangesInput } from "./implementation-codegen";
import { findRunById } from "./signal-run-db";
import type { GitHubClient } from "./github-client";
import type { AuditLog, ImplementationJob, RepoConnection, SignalGenRun } from "./types";

export type { GateContext, GateResult };

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_ELIGIBLE_CLASSES = ["GitHubAPIError", "GitHubRateLimited", "MissingInstallationToken"];

type ImplementationCodegen = (input: GenerateImplementationChangesInput) => Promise<CodegenResult>;

type ExecuteImplementationJobOptions = {
  codegen?: ImplementationCodegen;
};

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

function hasApprovedRunPlanAndSignal(
  run: SignalGenRun | null,
  job: ImplementationJob,
  repoConnection: RepoConnection,
): run is SignalGenRun {
  return Boolean(
    run?._id === job.runId &&
      run.status === "approved" &&
      run.founderDecision?.action === "approve" &&
      run.workspaceId === job.workspaceId &&
      run.repoConnectionId === repoConnection._id &&
      run.plan?.recommendedChange &&
      run.signal?.title &&
      run.signal?.summary,
  );
}

function formatEvidence(evidence: unknown[] | undefined): string {
  if (!evidence || evidence.length === 0) return "- No evidence captured.";
  return evidence.map((item) => `- ${String(item)}`).join("\n");
}

function checklist(items: string[] | undefined): string {
  if (!items || items.length === 0) return "- [ ] No explicit acceptance criteria supplied.";
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function bulletList(items: string[] | undefined): string {
  if (!items || items.length === 0) return "- No guardrails supplied.";
  return items.map((item) => `- ${item}`).join("\n");
}

function prBodyForCodegen(run: SignalGenRun, codegenSummary: string, changedFiles: string[]): string {
  return `## SignalGen approved change\n\n${run.plan.recommendedChange}\n\n## Codegen summary\n\n${codegenSummary}\n\n## Changed files\n\n${changedFiles.map((path) => `- ${path}`).join("\n")}\n\n## Evidence\n\n${formatEvidence(run.signal.evidence)}\n\n## Acceptance criteria\n\n${checklist(run.plan.acceptanceCriteria)}\n\n## Guardrails\n\n${bulletList(run.plan.guardrails)}\n\n## Notes\n\nFounder decision: ${run.founderDecision?.note || "Approved in dashboard."}\n`;
}

async function markCodegenRequiresAttention(input: {
  jobId: string;
  workspaceId: string;
  actorUserId: string;
  logs: string[];
  errorClass: "CodegenFailed" | "CodegenNoChanges";
  reason: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateImplementationJob(input.jobId, {
    status: "requires_attention",
    errorClass: input.errorClass,
    errorMessage: input.reason,
    logs: [...input.logs, `Codegen requires attention: ${input.reason}`],
    updatedAt: now,
  });
  await safeWriteAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "implementation_job.requires_attention",
    resourceType: "implementation_job",
    resourceId: input.jobId,
    detail: { errorClass: input.errorClass, reason: input.reason },
    createdAt: now,
  });
}

export async function executeImplementationJob(
  jobId: string,
  context: GateContext,
  githubClient: GitHubClient,
  options: ExecuteImplementationJobOptions = {},
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

    const run = await findRunById(job.runId);
    if (!hasApprovedRunPlanAndSignal(run, job, conn)) {
      const reason = "Approved run or implementation plan was not found.";
      await markCodegenRequiresAttention({
        jobId: job._id!,
        workspaceId: job.workspaceId,
        actorUserId: context.requestingUserId,
        logs: job.logs,
        errorClass: "CodegenFailed",
        reason,
      });
      return { success: false, error: `CodegenFailed: ${reason}` };
    }

    const codegen = options.codegen ?? generateImplementationChanges;
    const codegenResult = await codegen({
      plan: run.plan,
      signal: run.signal,
      githubClient,
      owner: conn.owner,
      repo: conn.repo,
      baseRef: conn.defaultBranch,
    });

    if (codegenResult.status !== "success") {
      const errorClass = codegenResult.status === "no_changes" ? "CodegenNoChanges" : "CodegenFailed";
      await markCodegenRequiresAttention({
        jobId: job._id!,
        workspaceId: job.workspaceId,
        actorUserId: context.requestingUserId,
        logs: job.logs,
        errorClass,
        reason: codegenResult.reason,
      });
      return { success: false, error: `${errorClass}: ${codegenResult.reason}` };
    }

    const changedFiles = codegenResult.changes.map((change) => change.path);
    const commitResult = await githubClient.createCommit({
      owner: conn.owner,
      repo: conn.repo,
      branchName: job.branchName,
      message: `SignalGen: ${job.branchName}`,
      changes: codegenResult.changes,
    });

    const prResult = await githubClient.openDraftPr({
      owner: conn.owner,
      repo: conn.repo,
      title: `SignalGen: ${run.signal.title}`,
      body: prBodyForCodegen(run, codegenResult.summary, changedFiles),
      head: job.branchName,
      base: conn.defaultBranch,
    });

    const doneAt = new Date().toISOString();
    await updateImplementationJob(job._id!, {
      status: "succeeded",
      commitSha: commitResult.sha,
      prUrl: prResult.prUrl,
      prNumber: prResult.prNumber,
      changedFiles,
      codegenSummary: codegenResult.summary,
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

import { writeAuditLog } from "@/lib/audit-log-db";
import { createImplementationJob, findImplementationJobByIdempotencyKey } from "@/lib/implementation-job-db";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import type { AuditLog, ImplementationJob } from "@/lib/types";

export type CreateImplementationJobForRunInput = {
  workspaceId: string;
  runId: string;
  repoConnectionId: string;
  approvedByUserId: string;
  branchName?: string;
  signalId?: string;
  planId?: string;
};

export type CreateImplementationJobForRunResult =
  | { status: "created"; job: ImplementationJob }
  | { status: "duplicate"; job: ImplementationJob }
  | { status: "repo_not_found"; error: string }
  | { status: "repo_not_connected"; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function safeWriteAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error("Failed to write implementation job audit log", {
      action: entry.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function createImplementationJobForRun(
  input: CreateImplementationJobForRunInput,
): Promise<CreateImplementationJobForRunResult> {
  const repoConnection = await findRepoConnectionById(input.repoConnectionId);
  if (!repoConnection || repoConnection.workspaceId !== input.workspaceId) {
    return { status: "repo_not_found", error: "Repo connection not found." };
  }
  if (repoConnection.status !== "connected") {
    return { status: "repo_not_connected", error: "Repo connection is not connected." };
  }

  const idempotencyKey = `${input.workspaceId}:${input.runId}`;
  const existing = await findImplementationJobByIdempotencyKey(idempotencyKey, input.workspaceId);
  if (existing && existing.status !== "cancelled") {
    return { status: "duplicate", job: existing };
  }

  const now = new Date().toISOString();
  const job = await createImplementationJob({
    workspaceId: input.workspaceId,
    runId: input.runId,
    repoConnectionId: input.repoConnectionId,
    approvedByUserId: input.approvedByUserId,
    approvedAt: now,
    branchName: isNonEmptyString(input.branchName) ? input.branchName : `signalgen/job-${input.runId}`,
    signalId: isNonEmptyString(input.signalId) ? input.signalId : undefined,
    planId: isNonEmptyString(input.planId) ? input.planId : undefined,
    idempotencyKey,
    status: "queued",
    attempts: 0,
    logs: [],
    createdAt: now,
    updatedAt: now,
  });

  await safeWriteAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: job.approvedByUserId,
    action: "implementation_job.created",
    resourceType: "implementation_job",
    resourceId: job._id!,
    detail: { runId: job.runId, repoConnectionId: job.repoConnectionId, branchName: job.branchName },
    createdAt: job.createdAt,
  });

  return { status: "created", job };
}

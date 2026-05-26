import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log-db";
import { createImplementationJob, findImplementationJobByIdempotencyKey } from "@/lib/implementation-job-db";
import type { AuditLog, ImplementationJob } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type CreateJobBody = {
  runId: string;
  repoConnectionId: string;
  approvedByUserId: string;
  branchName?: string;
  signalId?: string;
  planId?: string;
  idempotencyKey?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function logJobError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
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

export async function POST(
  request: Request,
): Promise<NextResponse<{ job: ImplementationJob } | { error: string; jobId?: string }>> {
  const workspaceId = resolveWorkspaceId(request);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const runId = typeof body === "object" && body !== null && "runId" in body ? body.runId : undefined;
    const repoConnectionId =
      typeof body === "object" && body !== null && "repoConnectionId" in body ? body.repoConnectionId : undefined;
    const approvedByUserId =
      typeof body === "object" && body !== null && "approvedByUserId" in body ? body.approvedByUserId : undefined;
    const branchName =
      typeof body === "object" && body !== null && "branchName" in body ? (body as CreateJobBody).branchName : undefined;
    const signalId =
      typeof body === "object" && body !== null && "signalId" in body ? (body as CreateJobBody).signalId : undefined;
    const planId =
      typeof body === "object" && body !== null && "planId" in body ? (body as CreateJobBody).planId : undefined;
    if (!isNonEmptyString(runId) || !isNonEmptyString(repoConnectionId) || !isNonEmptyString(approvedByUserId)) {
      return NextResponse.json({ error: "runId, repoConnectionId, and approvedByUserId are required" }, { status: 400 });
    }

    const idempotencyKey = `${workspaceId}:${runId}`;

    const existing = await findImplementationJobByIdempotencyKey(idempotencyKey, workspaceId);
    if (existing && existing.status !== "cancelled") {
      return NextResponse.json({ error: "DuplicateJob", jobId: existing._id }, { status: 409 });
    }

    const now = new Date().toISOString();
    const job = await createImplementationJob({
      workspaceId,
      runId,
      repoConnectionId,
      approvedByUserId,
      approvedAt: now,
      branchName: isNonEmptyString(branchName) ? branchName : `signalgen/job-${runId}`,
      signalId: isNonEmptyString(signalId) ? signalId : undefined,
      planId: isNonEmptyString(planId) ? planId : undefined,
      idempotencyKey,
      status: "queued",
      attempts: 0,
      logs: [],
      createdAt: now,
      updatedAt: now,
    });

    await safeWriteAuditLog({
      workspaceId,
      actorUserId: job.approvedByUserId,
      action: "implementation_job.created",
      resourceType: "implementation_job",
      resourceId: job._id!,
      detail: { runId: job.runId, repoConnectionId: job.repoConnectionId, branchName: job.branchName },
      createdAt: job.createdAt,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    logJobError("Failed to create implementation job", error);
    return NextResponse.json({ error: "Implementation job could not be created. Please try again." }, { status: 503 });
  }
}

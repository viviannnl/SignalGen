import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../lib/api-auth";

import { createImplementationJobForRun } from "../../../lib/implementation-job-create";
import { getSignalGenDb } from "@/lib/mongodb";
import type { ImplementationJob } from "@/lib/types";

export const dynamic = "force-dynamic";

type CreateJobBody = {
  runId: string;
  repoConnectionId: string;
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

export async function POST(
  request: Request,
): Promise<NextResponse<{ job: ImplementationJob } | { error: string; jobId?: string }>> {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId, userId } = auth;

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const runId = typeof body === "object" && body !== null && "runId" in body ? body.runId : undefined;
    const repoConnectionId =
      typeof body === "object" && body !== null && "repoConnectionId" in body ? body.repoConnectionId : undefined;
    const branchName =
      typeof body === "object" && body !== null && "branchName" in body ? (body as CreateJobBody).branchName : undefined;
    const signalId =
      typeof body === "object" && body !== null && "signalId" in body ? (body as CreateJobBody).signalId : undefined;
    const planId =
      typeof body === "object" && body !== null && "planId" in body ? (body as CreateJobBody).planId : undefined;
    if (!isNonEmptyString(runId) || !isNonEmptyString(repoConnectionId)) {
      return NextResponse.json({ error: "runId and repoConnectionId are required" }, { status: 400 });
    }
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
    }

    const db = await getSignalGenDb();
    const run = await db.collection("runs").findOne({ _id: new ObjectId(runId), workspaceId, repoConnectionId });
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }
    if (run.status !== "approved" || run.founderDecision?.action !== "approve") {
      return NextResponse.json({ error: "Implementation requires founder approval." }, { status: 409 });
    }

    const result = await createImplementationJobForRun({
      workspaceId,
      runId,
      repoConnectionId,
      approvedByUserId: userId,
      branchName,
      signalId,
      planId,
    });

    if (result.status === "repo_not_found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.status === "repo_not_connected") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    if (result.status === "duplicate") {
      return NextResponse.json({ error: "DuplicateJob", jobId: result.job._id }, { status: 409 });
    }

    return NextResponse.json({ job: result.job }, { status: 201 });
  } catch (error) {
    logJobError("Failed to create implementation job", error);
    return NextResponse.json({ error: "Implementation job could not be created. Please try again." }, { status: 503 });
  }
}

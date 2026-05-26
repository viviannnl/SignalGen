import { NextResponse } from "next/server";

import { MockGitHubClient } from "@/lib/github-client";
import { executeImplementationJob } from "@/lib/implementation-executor";
import { findImplementationJobById } from "@/lib/implementation-job-db";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RunRouteContext = {
  params: Promise<{ jobId: string }>;
};

function logRunError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function POST(
  request: Request,
  { params }: RunRouteContext,
): Promise<NextResponse<{ success: boolean; gateFailure?: unknown; error?: string }>> {
  const { jobId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const requestingUserId =
      typeof body === "object" && body !== null && "requestingUserId" in body && typeof body.requestingUserId === "string"
        ? body.requestingUserId
        : "dashboard_founder";

    const job = await findImplementationJobById(jobId);
    if (!job || job.workspaceId !== workspaceId) {
      return NextResponse.json({ success: false, error: "Implementation job not found" }, { status: 404 });
    }

    const repoConnection = await findRepoConnectionById(job.repoConnectionId);

    const result = await executeImplementationJob(jobId, {
      workspaceId,
      repoConnection,
      installationToken: null,
      requestingUserId,
    }, new MockGitHubClient());

    return NextResponse.json(result);
  } catch (error) {
    logRunError("Failed to execute implementation job", error);
    return NextResponse.json({ success: false, error: "Execution failed. Please try again." }, { status: 503 });
  }
}

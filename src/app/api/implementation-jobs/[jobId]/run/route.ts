import { NextResponse } from "next/server";

import { MockGitHubClient, createRealGitHubClientForInstallation, type GitHubClient } from "@/lib/github-client";
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

    const useRealGitHub =
      typeof body === "object" &&
      body !== null &&
      "executionMode" in body &&
      (body as { executionMode?: unknown }).executionMode === "real_github";

    if (useRealGitHub && process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES !== "true") {
      return NextResponse.json({ success: false, error: "Real GitHub writes are disabled" }, { status: 403 });
    }

    let githubClient: GitHubClient = new MockGitHubClient();
    let installationToken: string | null = null;
    if (useRealGitHub) {
      if (!repoConnection?.installationId) {
        return NextResponse.json({ success: false, error: "Repo connection installation is missing" }, { status: 400 });
      }
      if (repoConnection.workspaceId !== workspaceId || repoConnection.workspaceId !== job.workspaceId) {
        return NextResponse.json({ success: false, error: "Repo connection workspace mismatch" }, { status: 403 });
      }
      const realClient = await createRealGitHubClientForInstallation(repoConnection.installationId);
      githubClient = realClient.client;
      installationToken = realClient.installationTokenMarker;
    }

    const result = await executeImplementationJob(jobId, {
      workspaceId,
      repoConnection,
      installationToken,
      requestingUserId,
    }, githubClient);

    return NextResponse.json(result);
  } catch (error) {
    logRunError("Failed to execute implementation job", error);
    return NextResponse.json({ success: false, error: "Execution failed. Please try again." }, { status: 503 });
  }
}

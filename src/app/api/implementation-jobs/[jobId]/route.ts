import { NextResponse } from "next/server";

import { findImplementationJobById } from "@/lib/implementation-job-db";
import type { ImplementationJob } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type JobRouteContext = {
  params: Promise<{ jobId: string }>;
};

function logJobError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function GET(
  request: Request,
  { params }: JobRouteContext,
): Promise<NextResponse<{ job: ImplementationJob } | { error: string }>> {
  const { jobId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const job = await findImplementationJobById(jobId);
    if (!job || job.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Implementation job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    logJobError("Failed to load implementation job", error);
    return NextResponse.json({ error: "Implementation job could not be loaded. Please try again." }, { status: 503 });
  }
}

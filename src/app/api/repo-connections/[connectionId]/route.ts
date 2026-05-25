import { NextResponse } from "next/server";

import { findRepoConnectionById } from "@/lib/repo-connection-db";
import type { RepoConnection } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

type RepoConnectionGetResponse = {
  connection: RepoConnection;
};

type RepoConnectionErrorResponse = {
  error: string;
};

function logRepoConnectionError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse<RepoConnectionGetResponse | RepoConnectionErrorResponse>> {
  const { connectionId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const connection = await findRepoConnectionById(connectionId);

    if (!connection || connection.workspaceId !== workspaceId) {
      return NextResponse.json<RepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json<RepoConnectionGetResponse>({ connection });
  } catch (error) {
    logRepoConnectionError("Failed to read repo connection", error);
    return NextResponse.json<RepoConnectionErrorResponse>(
      { error: "Repo connection could not be loaded. Please try again." },
      { status: 503 },
    );
  }
}

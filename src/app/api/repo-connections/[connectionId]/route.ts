import { NextResponse } from "next/server";

import { findRepoConnectionById, updateRepoConnection, type RepoConnectionUpdate } from "@/lib/repo-connection-db";
import type { RepoConnection } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

type RepoConnectionGetResponse = {
  connection: RepoConnection;
};

type RepoConnectionPatchResponse = {
  connection: RepoConnection;
};

type RepoConnectionErrorResponse = {
  error: string;
};

function logRepoConnectionError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

function patchStringField(update: RepoConnectionUpdate, field: "owner" | "repo" | "defaultBranch", value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    update[field] = value.trim();
  }
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse<RepoConnectionPatchResponse | RepoConnectionErrorResponse>> {
  const { connectionId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const owner = typeof body === "object" && body !== null && "owner" in body ? body.owner : undefined;
    const repo = typeof body === "object" && body !== null && "repo" in body ? body.repo : undefined;
    const defaultBranch = typeof body === "object" && body !== null && "defaultBranch" in body ? body.defaultBranch : undefined;

    const existing = await findRepoConnectionById(connectionId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json<RepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    const update: RepoConnectionUpdate = { updatedAt: new Date().toISOString() };
    patchStringField(update, "owner", owner);
    patchStringField(update, "repo", repo);
    patchStringField(update, "defaultBranch", defaultBranch);

    const updated = await updateRepoConnection(connectionId, update);
    if (!updated) {
      return NextResponse.json<RepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json<RepoConnectionPatchResponse>({ connection: updated });
  } catch (error) {
    logRepoConnectionError("Failed to update repo connection", error);
    return NextResponse.json<RepoConnectionErrorResponse>(
      { error: "Repo connection could not be updated. Please try again." },
      { status: 503 },
    );
  }
}

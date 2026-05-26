import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log-db";
import { createRepoConnection, listRepoConnectionsByWorkspace } from "@/lib/repo-connection-db";
import { buildDisabledRepoConnection } from "../../../lib/repo-connection";
import type { AuditLog, RepoConnection } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

type RepoConnectionsListResponse = {
  connections: RepoConnection[];
};

type RepoConnectionCreateResponse = {
  connection: RepoConnection;
};

type RepoConnectionErrorResponse = {
  error: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function logRepoConnectionError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

async function safeWriteAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error("Failed to write repo connection audit log", {
      action: entry.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse<RepoConnectionsListResponse | RepoConnectionErrorResponse>> {
  const workspaceId = resolveWorkspaceId(request);

  try {
    const connections = await listRepoConnectionsByWorkspace(workspaceId);
    return NextResponse.json<RepoConnectionsListResponse>({ connections });
  } catch (error) {
    logRepoConnectionError("Failed to list repo connections", error);
    return NextResponse.json<RepoConnectionErrorResponse>(
      { error: "Repo connections could not be loaded. Please try again." },
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<RepoConnectionCreateResponse | RepoConnectionErrorResponse>> {
  const body: unknown = await request.json().catch(() => ({}));
  const owner = typeof body === "object" && body !== null && "owner" in body ? body.owner : undefined;
  const repo = typeof body === "object" && body !== null && "repo" in body ? body.repo : undefined;

  if (!isNonEmptyString(owner)) {
    return NextResponse.json<RepoConnectionErrorResponse>({ error: "owner is required" }, { status: 400 });
  }

  if (!isNonEmptyString(repo)) {
    return NextResponse.json<RepoConnectionErrorResponse>({ error: "repo is required" }, { status: 400 });
  }

  const workspaceId = resolveWorkspaceId(request);

  try {
    const connection = await createRepoConnection(
      buildDisabledRepoConnection(workspaceId, owner.trim(), repo.trim(), workspaceId),
    );
    await safeWriteAuditLog({
      workspaceId,
      actorUserId: workspaceId,
      action: "repo_connection.created",
      resourceType: "repo_connection",
      resourceId: connection._id!,
      detail: { owner: connection.owner, repo: connection.repo, provider: connection.provider },
      createdAt: connection.createdAt,
    });

    return NextResponse.json<RepoConnectionCreateResponse>({ connection }, { status: 201 });
  } catch (error) {
    logRepoConnectionError("Failed to create repo connection", error);
    return NextResponse.json<RepoConnectionErrorResponse>(
      { error: "Repo connection could not be saved. Please try again." },
      { status: 503 },
    );
  }
}

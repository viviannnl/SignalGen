import { NextResponse } from "next/server";

import { resolveWorkspaceId } from "@/lib/workspace";

import { buildDisabledRepoConnection } from "../../../lib/repo-connection";
import type { RepoConnection } from "../../../lib/types";

type RepoConnectionsListResponse = {
  connections: RepoConnection[];
};

type RepoConnectionCreateResponse = {
  connection: RepoConnection;
};

type RepoConnectionErrorResponse = {
  error: string;
};

const repoConnectionsById = new Map<string, RepoConnection>();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: Request): Promise<NextResponse<RepoConnectionsListResponse>> {
  const workspaceId = resolveWorkspaceId(request);
  const connections = [...repoConnectionsById.values()].filter(
    (connection) => connection.workspaceId === workspaceId,
  );

  return NextResponse.json<RepoConnectionsListResponse>({ connections });
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
  const connectionId = crypto.randomUUID();
  const connection: RepoConnection = {
    ...buildDisabledRepoConnection(workspaceId, owner.trim(), repo.trim(), workspaceId),
    _id: connectionId,
  };
  repoConnectionsById.set(connectionId, connection);

  return NextResponse.json<RepoConnectionCreateResponse>({ connection }, { status: 201 });
}

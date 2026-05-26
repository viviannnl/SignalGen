import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log-db";
import { findGitHubInstallationByWorkspace } from "@/lib/github-installation-db";
import { findRepoConnectionById, updateRepoConnection } from "@/lib/repo-connection-db";
import type { AuditLog, RepoConnection } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

type RepoConnectionSelectResponse = {
  connection: RepoConnection;
};

type RepoConnectionSelectErrorResponse = {
  error: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function logSelectRepoError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

async function safeWriteAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error("Failed to write select repo audit log", {
      action: entry.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse<RepoConnectionSelectResponse | RepoConnectionSelectErrorResponse>> {
  const { connectionId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const owner = typeof body === "object" && body !== null && "owner" in body ? body.owner : undefined;
    const repo = typeof body === "object" && body !== null && "repo" in body ? body.repo : undefined;
    const defaultBranch = typeof body === "object" && body !== null && "defaultBranch" in body ? body.defaultBranch : undefined;
    const installationId = typeof body === "object" && body !== null && "installationId" in body ? body.installationId : undefined;

    if (!isNonEmptyString(owner) || !isNonEmptyString(repo) || !isNonEmptyString(defaultBranch) || !isNonEmptyString(installationId)) {
      return NextResponse.json<RepoConnectionSelectErrorResponse>(
        { error: "owner, repo, defaultBranch, and installationId are required" },
        { status: 400 },
      );
    }

    const existing = await findRepoConnectionById(connectionId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json<RepoConnectionSelectErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    const installation = await findGitHubInstallationByWorkspace(workspaceId);
    if (!installation || installation.status !== "active") {
      return NextResponse.json<RepoConnectionSelectErrorResponse>(
        { error: "GitHub App installation not found" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const updated = await updateRepoConnection(connectionId, {
      owner: owner.trim(),
      repo: repo.trim(),
      defaultBranch: defaultBranch.trim(),
      installationId: installation.installationId,
      status: "connected",
      updatedAt: now,
    });

    if (!updated) {
      return NextResponse.json<RepoConnectionSelectErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    await safeWriteAuditLog({
      workspaceId,
      actorUserId: workspaceId,
      action: "repo_connection.updated",
      resourceType: "repo_connection",
      resourceId: connectionId,
      detail: { owner: updated.owner, repo: updated.repo, status: updated.status },
      createdAt: updated.updatedAt,
    });

    return NextResponse.json<RepoConnectionSelectResponse>({ connection: updated });
  } catch (error) {
    logSelectRepoError("Failed to select repo connection repository", error);
    return NextResponse.json<RepoConnectionSelectErrorResponse>(
      { error: "Repo connection could not be updated. Please try again." },
      { status: 503 },
    );
  }
}

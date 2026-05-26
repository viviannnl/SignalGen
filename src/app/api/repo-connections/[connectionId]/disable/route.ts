import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log-db";
import { findRepoConnectionById, updateRepoConnection } from "@/lib/repo-connection-db";
import type { AuditLog, RepoConnection } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace";

type DisableRepoConnectionResponse = {
  connection: RepoConnection;
};

type DisableRepoConnectionErrorResponse = {
  error: string;
};

function logDisableRepoConnectionError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

async function safeWriteAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error("Failed to write repo connection disable audit log", {
      action: entry.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

function sanitizeDisabledReason(value: string): string {
  const trimmed = value.trim();
  const hasSecretLikeContent =
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed) ||
    /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/.test(trimmed) ||
    /\b(?:token|secret|private[_-]?key|authorization|bearer)\b/i.test(trimmed);

  if (hasSecretLikeContent) {
    return "Disabled by workspace admin";
  }

  return trimmed.slice(0, 200);
}

function getDisabledReason(body: unknown): string {
  const reason = typeof body === "object" && body !== null && "disabledReason" in body ? body.disabledReason : undefined;
  return typeof reason === "string" && reason.trim().length > 0
    ? sanitizeDisabledReason(reason)
    : "Disabled by workspace admin";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse<DisableRepoConnectionResponse | DisableRepoConnectionErrorResponse>> {
  const { connectionId } = await params;
  const workspaceId = resolveWorkspaceId(request);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const existing = await findRepoConnectionById(connectionId);

    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json<DisableRepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    const disabledReason = getDisabledReason(body);
    const updatedAt = new Date().toISOString();
    const updated = await updateRepoConnection(connectionId, {
      status: "error",
      capabilities: { pr_creation: false, branch_push: false, issue_creation: false },
      disabledReason,
      updatedAt,
    });

    if (!updated) {
      return NextResponse.json<DisableRepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
    }

    await safeWriteAuditLog({
      workspaceId,
      actorUserId: workspaceId,
      action: "repo_connection.disabled",
      resourceType: "repo_connection",
      resourceId: connectionId,
      detail: { reason: disabledReason },
      createdAt: updatedAt,
    });

    return NextResponse.json<DisableRepoConnectionResponse>({ connection: updated });
  } catch (error) {
    logDisableRepoConnectionError("Failed to disable repo connection", error);
    return NextResponse.json<DisableRepoConnectionErrorResponse>(
      { error: "Repo connection could not be disabled. Please try again." },
      { status: 503 },
    );
  }
}

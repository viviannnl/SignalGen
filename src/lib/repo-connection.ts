import type { RepoConnection, RepoConnectionCapability } from "./types";

export const DISABLED_REPO_CONNECTION_CAPABILITIES: Record<RepoConnectionCapability, boolean> = {
  pr_creation: false,
  branch_push: false,
  issue_creation: false,
};

export function buildDisabledRepoConnection(
  workspaceId: string,
  owner: string,
  repo: string,
  createdByUserId: string,
  now?: string,
): RepoConnection {
  const ts = now ?? new Date().toISOString();
  return {
    workspaceId,
    provider: "github",
    owner,
    repo,
    defaultBranch: "main",
    installationId: null,
    capabilities: { ...DISABLED_REPO_CONNECTION_CAPABILITIES },
    status: "disconnected",
    disabledReason: "GitHub App installation requires workspace setup and owner approval.",
    createdByUserId,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function isRepoConnectionActive(conn: RepoConnection | null | undefined): boolean {
  return conn?.status === "connected";
}

export function isCapabilityEnabled(
  conn: RepoConnection | null | undefined,
  capability: RepoConnectionCapability,
): boolean {
  if (!conn) return false;
  return conn.capabilities[capability] === true;
}

export function getConnectionGateFailure(
  conn: RepoConnection | null | undefined,
  capability: RepoConnectionCapability,
): string | null {
  if (!conn) return "MissingRepoConnection";
  if (conn.status !== "connected") return "MissingRepoConnection";
  if (!conn.capabilities[capability]) return "CapabilityDisabled";
  return null;
}

export type RepositoryCapability = "pr_creation" | "branch_push" | "issue_creation";

export type ProjectRepository = {
  _id?: string;
  workspaceId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  capabilities: Record<RepositoryCapability, boolean>;
  installedAt?: string;
  disabledReason?: string;
};

export const DISABLED_REPOSITORY: Pick<ProjectRepository, "capabilities" | "disabledReason"> = {
  capabilities: {
    pr_creation: false,
    branch_push: false,
    issue_creation: false,
  },
  disabledReason: "GitHub App installation requires workspace setup and owner approval.",
};

export function isCapabilityEnabled(
  repo: Pick<ProjectRepository, "capabilities"> | null | undefined,
  capability: RepositoryCapability,
): boolean {
  if (!repo) return false;
  return repo.capabilities[capability] === true;
}

export function buildDisabledRepository(owner: string, repoName: string, workspaceId: string): ProjectRepository {
  return {
    workspaceId,
    owner,
    repo: repoName,
    defaultBranch: "main",
    ...DISABLED_REPOSITORY,
  };
}

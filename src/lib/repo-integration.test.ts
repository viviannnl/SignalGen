import { describe, expect, it } from "vitest";

import {
  buildDisabledRepository,
  DISABLED_REPOSITORY,
  isCapabilityEnabled,
  type ProjectRepository,
} from "./repo-integration";

describe("repository integration scaffold", () => {
  it("isCapabilityEnabled returns false for null repo", () => {
    expect(isCapabilityEnabled(null, "pr_creation")).toBe(false);
  });

  it("isCapabilityEnabled returns false for disabled capability", () => {
    const disabledRepo = buildDisabledRepository("owner", "repo", "workspace-1");

    expect(isCapabilityEnabled(disabledRepo, "branch_push")).toBe(false);
  });

  it("isCapabilityEnabled returns true for explicitly enabled capability", () => {
    const repo: ProjectRepository = {
      workspaceId: "workspace-1",
      owner: "owner",
      repo: "repo",
      defaultBranch: "main",
      capabilities: {
        pr_creation: true,
        branch_push: false,
        issue_creation: false,
      },
    };

    expect(isCapabilityEnabled(repo, "pr_creation")).toBe(true);
  });

  it("buildDisabledRepository has all capabilities false", () => {
    const disabledRepo = buildDisabledRepository("owner", "repo", "workspace-1");

    expect(disabledRepo.capabilities).toEqual({
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    });
  });

  it("buildDisabledRepository has correct owner, repo, and workspaceId", () => {
    const disabledRepo = buildDisabledRepository("signalgen-ai", "product", "workspace-1");

    expect(disabledRepo.owner).toBe("signalgen-ai");
    expect(disabledRepo.repo).toBe("product");
    expect(disabledRepo.workspaceId).toBe("workspace-1");
  });

  it("DISABLED_REPOSITORY has disabledReason set", () => {
    expect(DISABLED_REPOSITORY.disabledReason).toBe(
      "GitHub App installation requires workspace setup and owner approval.",
    );
  });
});

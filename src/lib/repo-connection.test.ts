import { describe, expect, it } from "vitest";

import {
  buildDisabledRepoConnection,
  getConnectionGateFailure,
  isCapabilityEnabled,
  isRepoConnectionActive,
} from "./repo-connection";
import type { RepoConnection } from "./types";

const NOW = "2026-05-25T06:23:00.000Z";

function buildConnectedConnection(): RepoConnection {
  return {
    ...buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW),
    status: "connected",
  };
}

describe("repo connection helpers", () => {
  it("buildDisabledRepoConnection sets all capabilities to false", () => {
    const connection = buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW);

    expect(connection.capabilities).toEqual({
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    });
  });

  it("buildDisabledRepoConnection sets status to disconnected", () => {
    const connection = buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW);

    expect(connection.status).toBe("disconnected");
  });

  it("buildDisabledRepoConnection sets installationId to null", () => {
    const connection = buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW);

    expect(connection.installationId).toBeNull();
  });

  it("isRepoConnectionActive returns false for disconnected connection", () => {
    const connection = buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW);

    expect(isRepoConnectionActive(connection)).toBe(false);
  });

  it("isRepoConnectionActive returns true for connected connection", () => {
    const connection = buildConnectedConnection();

    expect(isRepoConnectionActive(connection)).toBe(true);
  });

  it("isCapabilityEnabled returns false when capability is false", () => {
    const connection = buildConnectedConnection();

    expect(isCapabilityEnabled(connection, "pr_creation")).toBe(false);
  });

  it("isCapabilityEnabled returns false for null connection", () => {
    expect(isCapabilityEnabled(null, "pr_creation")).toBe(false);
  });

  it("getConnectionGateFailure returns MissingRepoConnection when conn is null", () => {
    expect(getConnectionGateFailure(null, "pr_creation")).toBe("MissingRepoConnection");
  });

  it("getConnectionGateFailure returns MissingRepoConnection when conn.status is not connected", () => {
    const connection = buildDisabledRepoConnection("workspace-1", "owner", "repo", "user-1", NOW);

    expect(getConnectionGateFailure(connection, "pr_creation")).toBe("MissingRepoConnection");
  });

  it("getConnectionGateFailure returns CapabilityDisabled when capability is false on a connected conn", () => {
    const connection = buildConnectedConnection();

    expect(getConnectionGateFailure(connection, "pr_creation")).toBe("CapabilityDisabled");
  });

  it("getConnectionGateFailure returns null when all checks pass", () => {
    const connection: RepoConnection = {
      ...buildConnectedConnection(),
      capabilities: {
        pr_creation: true,
        branch_push: false,
        issue_creation: false,
      },
    };

    expect(getConnectionGateFailure(connection, "pr_creation")).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUpdateOne = vi.fn();
const mockFindOne = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      updateOne: mockUpdateOne,
      findOne: mockFindOne,
    })),
  })),
}));

const { findGitHubInstallationByWorkspace, upsertGitHubInstallation } = await import("./github-installation-db");

describe("github-installation-db", () => {
  beforeEach(() => {
    mockUpdateOne.mockReset();
    mockFindOne.mockReset();
  });

  it("upsertGitHubInstallation calls updateOne with upsert true and no secret fields", async () => {
    mockUpdateOne.mockResolvedValue({ acknowledged: true });

    await upsertGitHubInstallation(
      {
        workspaceId: "workspace-test",
        installationId: "12345",
        setupAction: "install",
        installedAt: "2026-05-25T13:00:00.000Z",
        status: "active",
      },
      "2026-05-25T13:01:00.000Z",
    );

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { workspaceId: "workspace-test", installationId: "12345" },
      {
        $set: {
          workspaceId: "workspace-test",
          installationId: "12345",
          setupAction: "install",
          installedAt: "2026-05-25T13:00:00.000Z",
          status: "active",
          updatedAt: "2026-05-25T13:01:00.000Z",
        },
        $setOnInsert: {
          createdAt: "2026-05-25T13:01:00.000Z",
        },
      },
      { upsert: true },
    );

    const updatePayload = mockUpdateOne.mock.calls[0][1];
    expect(JSON.stringify(updatePayload)).not.toMatch(/token|secret|privateKey|bearer/i);
  });

  it("findGitHubInstallationByWorkspace returns null when not found", async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(findGitHubInstallationByWorkspace("workspace-test")).resolves.toBeNull();
    expect(mockFindOne).toHaveBeenCalledWith({ workspaceId: "workspace-test" }, { sort: { updatedAt: -1 } });
  });

  it("findGitHubInstallationByWorkspace returns the installation when found", async () => {
    mockFindOne.mockResolvedValue({
      _id: { toString: () => "installation-object-id" },
      workspaceId: "workspace-test",
      installationId: "12345",
      setupAction: "update",
      installedAt: "2026-05-25T13:00:00.000Z",
      status: "active",
      createdAt: "2026-05-25T13:00:00.000Z",
      updatedAt: "2026-05-25T13:01:00.000Z",
    });

    await expect(findGitHubInstallationByWorkspace("workspace-test")).resolves.toEqual({
      _id: "installation-object-id",
      workspaceId: "workspace-test",
      installationId: "12345",
      setupAction: "update",
      installedAt: "2026-05-25T13:00:00.000Z",
      status: "active",
      createdAt: "2026-05-25T13:00:00.000Z",
      updatedAt: "2026-05-25T13:01:00.000Z",
    });
  });
});

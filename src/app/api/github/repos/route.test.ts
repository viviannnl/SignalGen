import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindGitHubInstallationByWorkspace = vi.hoisted(() => vi.fn());
const mockListInstallationRepos = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/github-installation-db", () => ({
  findGitHubInstallationByWorkspace: mockFindGitHubInstallationByWorkspace,
}));

vi.mock("@/lib/github-repos-client", () => ({
  listInstallationRepos: mockListInstallationRepos,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const NOW = "2026-05-25T13:00:00.000Z";

function makeInstallation() {
  return {
    _id: "installation-record-1",
    workspaceId: "workspace-test",
    installationId: "12345",
    setupAction: "install" as const,
    installedAt: NOW,
    status: "active" as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("/api/github/repos", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindGitHubInstallationByWorkspace.mockReset();
    mockListInstallationRepos.mockReset();
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(null);
    mockListInstallationRepos.mockResolvedValue([]);
  });

  it("returns 404 when no installation exists for the workspace", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/repos"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "No GitHub App installation found for this workspace" });
    expect(mockListInstallationRepos).not.toHaveBeenCalled();
  });

  it("returns a repos list when the client succeeds", async () => {
    const repos = [
      {
        id: 101,
        name: "SignalGen",
        fullName: "viviannnl/SignalGen",
        private: true,
        defaultBranch: "main",
        owner: "viviannnl",
      },
    ];
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockListInstallationRepos.mockResolvedValue(repos);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/repos"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ repos });
    expect(mockListInstallationRepos).toHaveBeenCalledWith("12345");
  });

  it("returns 503 when the GitHub client throws", async () => {
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockListInstallationRepos.mockRejectedValue(new Error("token exchange not implemented"));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/repos"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "GitHub repos could not be loaded. Please try again." });
  });

  it("returns 503 when installation lookup throws", async () => {
    mockFindGitHubInstallationByWorkspace.mockRejectedValue(new Error("mongo unavailable"));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/repos"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "GitHub repos could not be loaded. Please try again." });
    expect(mockListInstallationRepos).not.toHaveBeenCalled();
  });
});

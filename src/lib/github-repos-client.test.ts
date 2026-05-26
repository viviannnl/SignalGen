import { describe, expect, it, vi } from "vitest";

const mockCreateGitHubInstallationToken = vi.hoisted(() => vi.fn());

vi.mock("./github-client", () => ({
  createGitHubInstallationToken: mockCreateGitHubInstallationToken,
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listInstallationRepos", () => {
  it("exchanges the installation id for a token and maps GitHub repositories", async () => {
    mockCreateGitHubInstallationToken.mockResolvedValue("installation-token");
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/installation/repositories?per_page=100");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer installation-token" });
      return response({
        repositories: [
          {
            id: 1,
            name: "SignalGen-sandbox-smoke",
            full_name: "viviannnl/SignalGen-sandbox-smoke",
            private: true,
            default_branch: "main",
            owner: { login: "viviannnl" },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const { listInstallationRepos } = await import("./github-repos-client");
    await expect(listInstallationRepos("135555762", fetchMock)).resolves.toEqual([
      {
        id: 1,
        name: "SignalGen-sandbox-smoke",
        fullName: "viviannnl/SignalGen-sandbox-smoke",
        private: true,
        defaultBranch: "main",
        owner: "viviannnl",
      },
    ]);
    expect(mockCreateGitHubInstallationToken).toHaveBeenCalledWith("135555762", fetchMock);
  });

  it("throws a safe error class when GitHub rejects the repository list request", async () => {
    mockCreateGitHubInstallationToken.mockResolvedValue("installation-token");
    const fetchMock = vi.fn(async () => response({ message: "rate limited" }, 403)) as unknown as typeof fetch;

    const { listInstallationRepos } = await import("./github-repos-client");
    await expect(listInstallationRepos("135555762", fetchMock)).rejects.toMatchObject({ name: "GitHubRateLimited" });
  });
});

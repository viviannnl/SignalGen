import { createGitHubInstallationToken } from "./github-client";

export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: string;
};

type FetchLike = typeof fetch;

type GitHubInstallationRepoResponse = {
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: { login: string };
  }>;
};

export async function listInstallationRepos(
  installationId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GitHubRepo[]> {
  const token = await createGitHubInstallationToken(installationId, fetchImpl);
  const response = await fetchImpl("https://api.github.com/installation/repositories?per_page=100", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const error = new Error(`GitHub repositories request failed with status ${response.status}`);
    error.name = response.status === 403 || response.status === 429 ? "GitHubRateLimited" : "GitHubAPIError";
    throw error;
  }

  const body = (await response.json()) as GitHubInstallationRepoResponse;
  return (body.repositories ?? []).map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch,
    owner: repo.owner.login,
  }));
}

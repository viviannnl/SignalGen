export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: string;
};

export async function listInstallationRepos(installationId: string): Promise<GitHubRepo[]> {
  void installationId;
  if (!process.env.SIGNALGEN_GITHUB_APP_ID || !process.env.SIGNALGEN_GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App credentials not configured for repo listing");
  }

  throw new Error("GitHub App repository listing token exchange is not implemented yet");
}

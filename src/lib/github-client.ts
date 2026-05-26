export interface GitHubClient {
  createBranch(params: {
    owner: string;
    repo: string;
    branchName: string;
    baseSha: string;
  }): Promise<{ sha: string }>;
  createCommit(params: {
    owner: string;
    repo: string;
    branchName: string;
    message: string;
    changes: Array<{ path: string; content: string }>;
  }): Promise<{ sha: string }>;
  openDraftPr(params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ prUrl: string; prNumber: number }>;
}

export class MockGitHubClient implements GitHubClient {
  calls: Array<{ method: string; params: unknown }> = [];

  async createBranch(params: {
    owner: string;
    repo: string;
    branchName: string;
    baseSha: string;
  }): Promise<{ sha: string }> {
    this.calls.push({ method: "createBranch", params });
    return { sha: "mock-branch-sha-" + params.branchName };
  }

  async createCommit(params: {
    owner: string;
    repo: string;
    branchName: string;
    message: string;
    changes: Array<{ path: string; content: string }>;
  }): Promise<{ sha: string }> {
    this.calls.push({ method: "createCommit", params });
    return { sha: "mock-commit-sha-" + params.message.slice(0, 8) };
  }

  async openDraftPr(params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ prUrl: string; prNumber: number }> {
    this.calls.push({ method: "openDraftPr", params });
    return {
      prUrl: `https://github.com/${params.owner}/${params.repo}/pull/1`,
      prNumber: 1,
    };
  }
}

export class RealGitHubClient implements GitHubClient {
  constructor(installationToken: string) {
    if (!process.env.SIGNALGEN_GITHUB_APP_ID) {
      throw new Error("GitHub App not configured");
    }
    // Token is held for future real implementation. Must not be logged.
    void installationToken;
  }

  async createBranch(_params: {
    owner: string;
    repo: string;
    branchName: string;
    baseSha: string;
  }): Promise<{ sha: string }> {
    throw new Error("RealGitHubClient not implemented — capability gated");
  }

  async createCommit(_params: {
    owner: string;
    repo: string;
    branchName: string;
    message: string;
    changes: Array<{ path: string; content: string }>;
  }): Promise<{ sha: string }> {
    throw new Error("RealGitHubClient not implemented — capability gated");
  }

  async openDraftPr(_params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ prUrl: string; prNumber: number }> {
    throw new Error("RealGitHubClient not implemented — capability gated");
  }
}

export function createMockGitHubClient(): MockGitHubClient {
  return new MockGitHubClient();
}

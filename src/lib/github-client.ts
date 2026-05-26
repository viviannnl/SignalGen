import { createPrivateKey, sign } from "crypto";

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

type FetchLike = typeof fetch;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64(input: string): string {
  return Buffer.from(input).toString("base64");
}

function readGitHubAppPrivateKey(): string | null {
  const raw = process.env.SIGNALGEN_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/\\n/g, "\n");
}

function createGitHubAppJwt(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const appId = process.env.SIGNALGEN_GITHUB_APP_ID?.trim();
  const privateKey = readGitHubAppPrivateKey();
  if (!appId || !privateKey) {
    const error = new Error("GitHub App credentials are not configured");
    error.name = "MissingInstallationToken";
    throw error;
  }

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), createPrivateKey(privateKey));
  return `${signingInput}.${base64url(signature)}`;
}

function encodeGitHubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubJson<T>(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`GitHub API request failed with status ${response.status}`);
    error.name = response.status === 403 || response.status === 429 ? "GitHubRateLimited" : "GitHubAPIError";
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return body as T;
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
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly installationToken: string,
    fetchImpl: FetchLike = fetch,
  ) {
    if (!installationToken.trim()) {
      const error = new Error("Missing GitHub installation token");
      error.name = "MissingInstallationToken";
      throw error;
    }
    this.fetchImpl = fetchImpl;
  }

  private authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.installationToken}`,
    };
  }

  async createBranch(params: {
    owner: string;
    repo: string;
    branchName: string;
    baseSha: string;
  }): Promise<{ sha: string }> {
    try {
      const existing = await githubJson<{ object: { sha: string } }>(
        this.fetchImpl,
        `https://api.github.com/repos/${params.owner}/${params.repo}/git/ref/heads/${encodeURIComponent(params.branchName)}`,
        { method: "GET", headers: this.authHeaders() },
      );
      return { sha: existing.object.sha };
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "GitHubAPIError" || (error as Error & { status?: number }).status !== 404) {
        throw error;
      }
    }

    const baseRef = await githubJson<{ object: { sha: string } }>(
      this.fetchImpl,
      `https://api.github.com/repos/${params.owner}/${params.repo}/git/ref/heads/${encodeURIComponent(params.baseSha)}`,
      { method: "GET", headers: this.authHeaders() },
    );

    const created = await githubJson<{ object: { sha: string } }>(
      this.fetchImpl,
      `https://api.github.com/repos/${params.owner}/${params.repo}/git/refs`,
      {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({ ref: `refs/heads/${params.branchName}`, sha: baseRef.object.sha }),
      },
    );
    return { sha: created.object.sha };
  }

  async createCommit(params: {
    owner: string;
    repo: string;
    branchName: string;
    message: string;
    changes: Array<{ path: string; content: string }>;
  }): Promise<{ sha: string }> {
    const changes = params.changes.length > 0
      ? params.changes
      : [
          {
            path: `.signalgen/implementation-jobs/${params.branchName.replace(/[^a-zA-Z0-9._-]/g, "-")}.md`,
            content: `# SignalGen sandbox implementation\n\nGenerated by SignalGen for branch \`${params.branchName}\`.\n`,
          },
        ];

    let lastSha = "";
    for (const change of changes) {
      const encodedPath = encodeGitHubPath(change.path);
      let existingSha: string | undefined;
      try {
        const existing = await githubJson<{ sha?: string }>(
          this.fetchImpl,
          `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${encodedPath}?ref=${encodeURIComponent(params.branchName)}`,
          { method: "GET", headers: this.authHeaders() },
        );
        existingSha = existing.sha;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "GitHubAPIError" || (error as Error & { status?: number }).status !== 404) {
          throw error;
        }
      }

      const result = await githubJson<{ commit: { sha: string } }>(
        this.fetchImpl,
        `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${encodedPath}`,
        {
          method: "PUT",
          headers: this.authHeaders(),
          body: JSON.stringify({
            message: params.message,
            content: base64(change.content),
            branch: params.branchName,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
        },
      );
      lastSha = result.commit.sha;
    }

    return { sha: lastSha };
  }

  async openDraftPr(params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ prUrl: string; prNumber: number }> {
    const pulls = await githubJson<Array<{ html_url: string; number: number }>>(
      this.fetchImpl,
      `https://api.github.com/repos/${params.owner}/${params.repo}/pulls?head=${encodeURIComponent(`${params.owner}:${params.head}`)}&state=open`,
      { method: "GET", headers: this.authHeaders() },
    );
    if (pulls.length > 0) {
      return { prUrl: pulls[0].html_url, prNumber: pulls[0].number };
    }

    const pr = await githubJson<{ html_url: string; number: number }>(
      this.fetchImpl,
      `https://api.github.com/repos/${params.owner}/${params.repo}/pulls`,
      {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          head: params.head,
          base: params.base,
          draft: true,
        }),
      },
    );

    return { prUrl: pr.html_url, prNumber: pr.number };
  }
}

export async function createGitHubInstallationToken(
  installationId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const appJwt = createGitHubAppJwt();
  const tokenResult = await githubJson<{ token: string }>(
    fetchImpl,
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${appJwt}` },
    },
  );

  if (!tokenResult.token) {
    const error = new Error("Missing GitHub installation token");
    error.name = "MissingInstallationToken";
    throw error;
  }

  return tokenResult.token;
}

export async function createRealGitHubClientForInstallation(
  installationId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ client: RealGitHubClient; installationTokenMarker: string }> {
  const token = await createGitHubInstallationToken(installationId, fetchImpl);
  return { client: new RealGitHubClient(token, fetchImpl), installationTokenMarker: "present" };
}

export function createMockGitHubClient(): MockGitHubClient {
  return new MockGitHubClient();
}

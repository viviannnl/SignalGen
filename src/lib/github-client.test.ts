import { describe, expect, it, vi } from "vitest";

import {
  MockGitHubClient,
  RealGitHubClient,
  capabilitiesFromInstallationPermissions,
  createRealGitHubClientForInstallation,
} from "./github-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("MockGitHubClient", () => {
  it("records branch, commit, and draft PR calls without hitting GitHub", async () => {
    const client = new MockGitHubClient();

    await client.createBranch({ owner: "viviannnl", repo: "sandbox", branchName: "signalgen/test", baseSha: "main" });
    await client.createCommit({ owner: "viviannnl", repo: "sandbox", branchName: "signalgen/test", message: "test", changes: [] });
    await client.openDraftPr({ owner: "viviannnl", repo: "sandbox", title: "test", body: "body", head: "signalgen/test", base: "main" });

    expect(client.calls.map((call) => call.method)).toEqual(["createBranch", "createCommit", "openDraftPr"]);
  });

  it("returns seeded file contents and file lists while recording read calls", async () => {
    const client = new MockGitHubClient({
      files: {
        "viviannnl/sandbox/main/src/app.ts": { path: "src/app.ts", content: "export const ok = true;", sha: "file-sha" },
      },
      fileLists: {
        "viviannnl/sandbox/main": ["src/app.ts", "README.md"],
      },
    });

    await expect(client.getFileContents({ owner: "viviannnl", repo: "sandbox", path: "src/app.ts", ref: "main" })).resolves.toEqual({
      path: "src/app.ts",
      content: "export const ok = true;",
      sha: "file-sha",
    });
    await expect(client.getFileContents({ owner: "viviannnl", repo: "sandbox", path: "missing.ts", ref: "main" })).resolves.toBeNull();
    await expect(client.listFiles({ owner: "viviannnl", repo: "sandbox", ref: "main" })).resolves.toEqual(["src/app.ts", "README.md"]);

    expect(client.calls.map((call) => call.method)).toEqual(["getFileContents", "getFileContents", "listFiles"]);
  });
});

describe("capabilitiesFromInstallationPermissions", () => {
  it("enables PR creation and branch push only when pull_requests and contents are write", () => {
    expect(capabilitiesFromInstallationPermissions({ contents: "write", pull_requests: "write", issues: "write" })).toEqual({
      pr_creation: true,
      branch_push: true,
      issue_creation: true,
    });

    expect(capabilitiesFromInstallationPermissions({ contents: "write", pull_requests: "read", issues: "read" })).toEqual({
      pr_creation: false,
      branch_push: true,
      issue_creation: false,
    });

    expect(capabilitiesFromInstallationPermissions({ contents: "read", pull_requests: "write" })).toEqual({
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    });

    expect(capabilitiesFromInstallationPermissions({})).toEqual({
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    });
  });
});

describe("RealGitHubClient", () => {
  it("creates a branch from the selected default branch, commits a safe sandbox marker, and opens a draft PR", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";

      if (href.includes("/git/ref/heads/signalgen%2Ftest") && method === "GET") {
        return response({ message: "Not Found" }, 404);
      }
      if (href.endsWith("/git/ref/heads/main") && method === "GET") {
        return response({ object: { sha: "base-sha" } });
      }
      if (href.endsWith("/git/refs") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual({ ref: "refs/heads/signalgen/test", sha: "base-sha" });
        return response({ object: { sha: "branch-sha" } });
      }
      if (href.includes("/contents/.signalgen/implementation-jobs/signalgen-test.md?ref=signalgen%2Ftest") && method === "GET") {
        return response({ message: "Not Found" }, 404);
      }
      if (href.includes("/contents/.signalgen/implementation-jobs/signalgen-test.md") && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        expect(body.branch).toBe("signalgen/test");
        expect(body.message).toBe("SignalGen: signalgen/test");
        expect(body.sha).toBeUndefined();
        expect(Buffer.from(body.content, "base64").toString("utf8")).toContain("SignalGen sandbox implementation");
        return response({ commit: { sha: "commit-sha" } });
      }
      if (href.includes("/pulls?head=") && method === "GET") {
        return response([]);
      }
      if (href.endsWith("/pulls") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        expect(body.draft).toBe(true);
        expect(body.head).toBe("signalgen/test");
        expect(body.base).toBe("main");
        return response({ html_url: "https://github.com/viviannnl/sandbox/pull/1", number: 1 });
      }
      throw new Error(`unexpected request ${method} ${href}`);
    }) as unknown as typeof fetch;

    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.createBranch({ owner: "viviannnl", repo: "sandbox", branchName: "signalgen/test", baseSha: "main" })).resolves.toEqual({ sha: "branch-sha" });
    await expect(client.createCommit({ owner: "viviannnl", repo: "sandbox", branchName: "signalgen/test", message: "SignalGen: signalgen/test", changes: [] })).resolves.toEqual({ sha: "commit-sha" });
    await expect(client.openDraftPr({ owner: "viviannnl", repo: "sandbox", title: "SignalGen: signalgen/test", body: "body", head: "signalgen/test", base: "main" })).resolves.toEqual({ prUrl: "https://github.com/viviannnl/sandbox/pull/1", prNumber: 1 });
  });

  it("updates the existing marker file sha on retry and returns the commit sha", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (href.includes("/contents/.signalgen/implementation-jobs/signalgen-test.md?ref=signalgen%2Ftest") && method === "GET") {
        return response({ sha: "existing-content-sha" });
      }
      if (href.includes("/contents/.signalgen/implementation-jobs/signalgen-test.md") && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        expect(body.sha).toBe("existing-content-sha");
        return response({ commit: { sha: "updated-commit-sha" } });
      }
      throw new Error(`unexpected request ${method} ${href}`);
    }) as unknown as typeof fetch;
    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.createCommit({ owner: "viviannnl", repo: "sandbox", branchName: "signalgen/test", message: "SignalGen: signalgen/test", changes: [] })).resolves.toEqual({ sha: "updated-commit-sha" });
  });

  it("reuses an existing draft PR for idempotent retries", async () => {
    const fetchMock = vi.fn(async () => response([{ html_url: "https://github.com/viviannnl/sandbox/pull/7", number: 7 }])) as unknown as typeof fetch;
    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.openDraftPr({ owner: "viviannnl", repo: "sandbox", title: "title", body: "body", head: "signalgen/test", base: "main" })).resolves.toEqual({ prUrl: "https://github.com/viviannnl/sandbox/pull/7", prNumber: 7 });
  });

  it("fetches and decodes file contents for a ref", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      expect(String(url)).toBe("https://api.github.com/repos/viviannnl/sandbox/contents/src/app%20file.ts?ref=feature%2Fbranch");
      return response({ path: "src/app file.ts", content: Buffer.from("hello repo", "utf8").toString("base64"), sha: "content-sha" });
    }) as unknown as typeof fetch;
    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.getFileContents({ owner: "viviannnl", repo: "sandbox", path: "src/app file.ts", ref: "feature/branch" })).resolves.toEqual({
      path: "src/app file.ts",
      content: "hello repo",
      sha: "content-sha",
    });
  });

  it("returns null when file contents are 404", async () => {
    const fetchMock = vi.fn(async () => response({ message: "Not Found" }, 404)) as unknown as typeof fetch;
    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.getFileContents({ owner: "viviannnl", repo: "sandbox", path: "missing.ts" })).resolves.toBeNull();
  });

  it("lists blob paths from a recursive tree and ignores non-blob entries", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      expect(String(url)).toBe("https://api.github.com/repos/viviannnl/sandbox/git/trees/feature%2Fbranch?recursive=1");
      return response({
        truncated: true,
        tree: [
          { path: "src", type: "tree" },
          { path: "src/app.ts", type: "blob" },
          { path: "README.md", type: "blob" },
        ],
      });
    }) as unknown as typeof fetch;
    const client = new RealGitHubClient("installation-token", fetchMock);

    await expect(client.listFiles({ owner: "viviannnl", repo: "sandbox", ref: "feature/branch" })).resolves.toEqual(["src/app.ts", "README.md"]);
  });
});

describe("createRealGitHubClientForInstallation", () => {
  it("fails closed when GitHub App credentials are missing", async () => {
    const previousAppId = process.env.SIGNALGEN_GITHUB_APP_ID;
    const previousKey = process.env.SIGNALGEN_GITHUB_APP_PRIVATE_KEY;
    delete process.env.SIGNALGEN_GITHUB_APP_ID;
    delete process.env.SIGNALGEN_GITHUB_APP_PRIVATE_KEY;

    await expect(createRealGitHubClientForInstallation("123")).rejects.toMatchObject({ name: "MissingInstallationToken" });

    process.env.SIGNALGEN_GITHUB_APP_ID = previousAppId;
    process.env.SIGNALGEN_GITHUB_APP_PRIVATE_KEY = previousKey;
  });
});

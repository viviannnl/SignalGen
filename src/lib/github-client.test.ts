import { describe, expect, it, vi } from "vitest";

import { MockGitHubClient, RealGitHubClient, createRealGitHubClientForInstallation } from "./github-client";

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

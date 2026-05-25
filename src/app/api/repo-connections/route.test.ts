import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

describe("/api/repo-connections", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("GET /api/repo-connections returns 200 with empty connections array", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/repo-connections"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ connections: [] });
  });

  it("POST /api/repo-connections with valid owner/repo returns a disabled connection", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "ai-cover-letter" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.connection).toMatchObject({
      workspaceId: "workspace-test",
      provider: "github",
      owner: "viviannnl",
      repo: "ai-cover-letter",
      defaultBranch: "main",
      installationId: null,
      capabilities: {
        pr_creation: false,
        branch_push: false,
        issue_creation: false,
      },
      status: "disconnected",
      createdByUserId: "workspace-test",
    });
    expect(body.connection._id).toEqual(expect.any(String));
    expect(body.connection.createdAt).toEqual(expect.any(String));
    expect(body.connection.updatedAt).toEqual(expect.any(String));
  });

  it("POST /api/repo-connections with missing owner returns 400", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "ai-cover-letter" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("owner is required");
  });

  it("POST /api/repo-connections with missing repo returns 400", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("repo is required");
  });

  it("GET /api/repo-connections/[connectionId] returns 404 for unknown connection", async () => {
    const { GET } = await import("./[connectionId]/route");

    const response = await GET(new Request("http://localhost/api/repo-connections/unknown"), {
      params: Promise.resolve({ connectionId: "unknown" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
  });
});

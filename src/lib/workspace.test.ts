import { describe, expect, it } from "vitest";

import { buildWorkspaceFilter, DEFAULT_WORKSPACE_ID, resolveWorkspaceId } from "./workspace";

describe("workspace scaffold", () => {
  it("DEFAULT_WORKSPACE_ID is 'demo'", () => {
    expect(DEFAULT_WORKSPACE_ID).toBe("demo");
  });

  it("resolveWorkspaceId returns demo workspace without auth context", () => {
    expect(resolveWorkspaceId()).toBe("demo");
  });

  it("resolveWorkspaceId returns demo workspace regardless of request", () => {
    const fakeRequest = new Request("http://localhost/api/runs");
    expect(resolveWorkspaceId(fakeRequest)).toBe("demo");
  });

  it("buildWorkspaceFilter includes runs matching the workspace", () => {
    const filter = buildWorkspaceFilter("demo");
    expect(filter.$or).toContainEqual({ workspaceId: "demo" });
  });

  it("buildWorkspaceFilter includes legacy runs without workspaceId field", () => {
    const filter = buildWorkspaceFilter("demo");
    expect(filter.$or).toContainEqual({ workspaceId: { $exists: false } });
  });

  it("buildWorkspaceFilter for a different workspace excludes 'demo' workspace runs", () => {
    const filter = buildWorkspaceFilter("other-workspace");
    expect(filter.$or).not.toContainEqual({ workspaceId: "demo" });
    expect(filter.$or).toContainEqual({ workspaceId: "other-workspace" });
  });
});

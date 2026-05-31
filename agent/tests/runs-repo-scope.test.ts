import { describe, expect, it } from "vitest";

import { buildMemoryScopeFilter, buildScopedDocumentFilter, buildSignalUpsertFilter, type ProductSignalDocument } from "../src/tools/runs.js";

describe("hosted worker signal memory repo scoping", () => {
  it("filters existing signals by both workspace and repo connection", () => {
    expect(buildMemoryScopeFilter("ws-123", "repo-456")).toEqual({ workspaceId: "ws-123", repoConnectionId: "repo-456" });
  });

  it("keeps legacy workspace-only scope for runs without a repo connection", () => {
    expect(buildMemoryScopeFilter("ws-123", undefined)).toEqual({ workspaceId: "ws-123" });
    expect(buildMemoryScopeFilter(undefined, undefined)).toEqual({ $or: [{ workspaceId: { $exists: false } }, { workspaceId: undefined }] });
  });

  it("adds workspace and repo scope to targeted hosted-worker update filters", () => {
    expect(buildScopedDocumentFilter({ _id: "signal-1" }, "ws-123", "repo-456")).toEqual({
      _id: "signal-1",
      workspaceId: "ws-123",
      repoConnectionId: "repo-456",
    });
  });

  it("upserts new signals with the repo connection in the uniqueness filter", () => {
    const signal: Omit<ProductSignalDocument, "_id"> = {
      workspaceId: "ws-123",
      repoConnectionId: "repo-456",
      signalKey: "feature_request:format-options",
      type: "feature_request",
      title: "Format options",
      summary: "Users want more resume format choices.",
      evidenceItemIds: ["evidence-1"],
      evidenceItems: [],
      strength: 0.2,
      confidence: 0.8,
      status: "accumulating",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(buildSignalUpsertFilter(signal)).toEqual({ workspaceId: "ws-123", repoConnectionId: "repo-456", signalKey: "feature_request:format-options" });
  });
});

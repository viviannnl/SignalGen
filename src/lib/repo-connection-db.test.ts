import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoConnection } from "./types";

const mockInsertOne = vi.fn();
const mockFindOne = vi.fn();
const mockFind = vi.fn();
const mockFindOneAndUpdate = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      find: mockFind,
      findOneAndUpdate: mockFindOneAndUpdate,
    })),
  })),
}));

const {
  createRepoConnection,
  findRepoConnectionById,
  listRepoConnectionsByWorkspace,
  updateRepoConnection,
} = await import("./repo-connection-db");

const NOW = "2026-05-25T13:00:00.000Z";
const REPO_CONNECTION_ID = new ObjectId("64f0c1f2a3b4c5d6e7f80901");

function makeRepoConnection(overrides: Partial<RepoConnection> = {}): RepoConnection {
  return {
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
    disabledReason: "GitHub App installation requires workspace setup and owner approval.",
    createdByUserId: "workspace-test",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("repo-connection-db", () => {
  beforeEach(() => {
    mockInsertOne.mockReset();
    mockFindOne.mockReset();
    mockFind.mockReset();
    mockFindOneAndUpdate.mockReset();
  });

  it("createRepoConnection inserts and returns a RepoConnection with string _id", async () => {
    const connection = makeRepoConnection();
    mockInsertOne.mockResolvedValue({ insertedId: REPO_CONNECTION_ID });

    await expect(createRepoConnection(connection)).resolves.toEqual({
      ...connection,
      _id: REPO_CONNECTION_ID.toString(),
    });
    expect(mockInsertOne).toHaveBeenCalledWith(connection);
  });

  it("findRepoConnectionById returns null for unknown id", async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(findRepoConnectionById(REPO_CONNECTION_ID.toString())).resolves.toBeNull();
    expect(mockFindOne).toHaveBeenCalledWith({ _id: REPO_CONNECTION_ID });
  });

  it("listRepoConnectionsByWorkspace returns filtered list", async () => {
    const doc = { ...makeRepoConnection(), _id: REPO_CONNECTION_ID };
    const toArray = vi.fn(async () => [doc]);
    const sort = vi.fn(() => ({ toArray }));
    mockFind.mockReturnValue({ sort });

    await expect(listRepoConnectionsByWorkspace("workspace-test")).resolves.toEqual([
      { ...makeRepoConnection(), _id: REPO_CONNECTION_ID.toString() },
    ]);
    expect(mockFind).toHaveBeenCalledWith({ workspaceId: "workspace-test" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it("updateRepoConnection updates and returns updated doc", async () => {
    const updatedDoc = {
      ...makeRepoConnection({ status: "connected", installationId: "12345" }),
      _id: REPO_CONNECTION_ID,
    };
    mockFindOneAndUpdate.mockResolvedValue(updatedDoc);

    await expect(
      updateRepoConnection(REPO_CONNECTION_ID.toString(), {
        status: "connected",
        installationId: "12345",
        updatedAt: "2026-05-25T13:02:00.000Z",
      }),
    ).resolves.toEqual({
      ...updatedDoc,
      _id: REPO_CONNECTION_ID.toString(),
    });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: REPO_CONNECTION_ID },
      {
        $set: {
          status: "connected",
          installationId: "12345",
          updatedAt: "2026-05-25T13:02:00.000Z",
        },
      },
      { returnDocument: "after" },
    );
  });
});

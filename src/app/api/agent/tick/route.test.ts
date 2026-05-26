import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_HEADERS = {
  "x-signalgen-test-user-id": "user-test",
  "x-signalgen-test-workspace-id": "ws-test",
  "x-signalgen-test-role": "owner",
};

function authedRequest(input: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(AUTH_HEADERS)) {
    headers.set(key, value);
  }
  return new Request(input, { ...init, headers });
}

const mockFindOne = vi.fn();
const mockFind = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock("@/lib/agent-tick", () => ({
  processAgentTick: vi.fn(async () => ({ ok: true, processed: 0 })),
}));

vi.mock("@/lib/hosted-agent-client", () => ({
  callHostedAgent: vi.fn(),
  getHostedAgentConfig: vi.fn(() => null),
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: vi.fn(async (id: string) => ({ _id: id, workspaceId: "ws-test", status: "connected" })),
}));

vi.mock("@/lib/signal-memory-store", () => ({
  buildMongoSignalMemoryStore: vi.fn(() => ({
    listSignals: vi.fn(async () => []),
    listPlans: vi.fn(async () => []),
    persistMemoryUpdate: vi.fn(async () => undefined),
  })),
}));

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: mockFindOne, find: mockFind, updateOne: mockUpdateOne })),
  })),
}));

const { POST } = await import("./route");

function postTick(body: unknown) {
  return POST(
    authedRequest("http://localhost/api/agent/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/agent/tick", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFind.mockReset();
    mockUpdateOne.mockReset();
  });

  it("rejects targeted agent ticks without a selected repo", async () => {
    const response = await postTick({ runId: "64f0c1f2a3b4c5d6e7f80901" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose a repo before running the SignalGen agent.");
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it("rejects targeted agent ticks when the run is not in the selected repo", async () => {
    mockFindOne.mockResolvedValue(null);

    const response = await postTick({ runId: "64f0c1f2a3b4c5d6e7f80901", repoConnectionId: "repo-123" });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Run not found for the selected repo.");
    expect(mockFindOne).toHaveBeenCalledWith({ _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"), workspaceId: "ws-test", repoConnectionId: "repo-123" });
  });
});

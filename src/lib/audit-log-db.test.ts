import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLog } from "./types";

const mockInsertOne = vi.fn();
const mockFind = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      insertOne: mockInsertOne,
      find: mockFind,
    })),
  })),
}));

const { writeAuditLog, listAuditLogs } = await import("./audit-log-db");

const NOW = "2026-01-01T00:00:00.000Z";
const AUDIT_OID = new ObjectId("64f0c1f2a3b4c5d6e7f80911");

function makeAuditLog(overrides: Partial<AuditLog> = {}): Omit<AuditLog, "_id"> {
  return {
    workspaceId: "ws-test",
    actorUserId: "user-1",
    action: "implementation_job.started",
    resourceType: "implementation_job",
    resourceId: "job-1",
    detail: { attempt: 1 },
    createdAt: NOW,
    ...overrides,
  };
}

describe("audit-log-db", () => {
  beforeEach(() => {
    mockInsertOne.mockReset();
    mockFind.mockReset();
  });

  it("writeAuditLog inserts the entry without _id", async () => {
    const entry = makeAuditLog();
    mockInsertOne.mockResolvedValue({ insertedId: AUDIT_OID });

    await writeAuditLog(entry);

    expect(mockInsertOne).toHaveBeenCalledWith(entry);
    expect(mockInsertOne.mock.calls[0][0]._id).toBeUndefined();
  });

  it("listAuditLogs queries by workspace, sorts newest first, and serializes _id", async () => {
    const doc = { ...makeAuditLog(), _id: AUDIT_OID };
    const toArray = vi.fn(async () => [doc]);
    const sort = vi.fn(() => ({ toArray }));
    mockFind.mockReturnValue({ sort });

    const result = await listAuditLogs("ws-test");

    expect(mockFind).toHaveBeenCalledWith({ workspaceId: "ws-test" });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toEqual([{ ...makeAuditLog(), _id: AUDIT_OID.toString() }]);
  });
});

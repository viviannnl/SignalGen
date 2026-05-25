import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImplementationJob } from "./types";

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
  createImplementationJob,
  findImplementationJobById,
  findImplementationJobByIdempotencyKey,
  updateImplementationJob,
  listImplementationJobsByWorkspace,
} = await import("./implementation-job-db");

const NOW = "2026-01-01T00:00:00.000Z";
const JOB_OID = new ObjectId("64f0c1f2a3b4c5d6e7f80901");

function makeJob(overrides: Partial<ImplementationJob> = {}): Omit<ImplementationJob, "_id"> {
  return {
    workspaceId: "ws-test",
    runId: "run-1",
    repoConnectionId: "64f0c1f2a3b4c5d6e7f80902",
    status: "queued",
    branchName: "signalgen/feature-test",
    idempotencyKey: "ws-test:run-1",
    approvedByUserId: "user-approver",
    approvedAt: NOW,
    attempts: 0,
    logs: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("implementation-job-db", () => {
  beforeEach(() => {
    mockInsertOne.mockReset();
    mockFindOne.mockReset();
    mockFind.mockReset();
    mockFindOneAndUpdate.mockReset();
  });

  it("createImplementationJob inserts and returns a job with string _id", async () => {
    const job = makeJob();
    mockInsertOne.mockResolvedValue({ insertedId: JOB_OID });

    const result = await createImplementationJob(job);
    expect(result).toEqual({ ...job, _id: JOB_OID.toString() });
    expect(mockInsertOne).toHaveBeenCalledWith(job);
  });

  it("findImplementationJobById returns null for invalid id", async () => {
    const result = await findImplementationJobById("not-a-valid-id");
    expect(result).toBeNull();
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it("findImplementationJobById returns null when not found", async () => {
    mockFindOne.mockResolvedValue(null);
    const result = await findImplementationJobById(JOB_OID.toString());
    expect(result).toBeNull();
  });

  it("findImplementationJobById returns serialized job when found", async () => {
    const doc = { ...makeJob(), _id: JOB_OID };
    mockFindOne.mockResolvedValue(doc);

    const result = await findImplementationJobById(JOB_OID.toString());
    expect(result).toEqual({ ...makeJob(), _id: JOB_OID.toString() });
  });

  it("findImplementationJobByIdempotencyKey queries by key and workspace", async () => {
    mockFindOne.mockResolvedValue(null);
    const result = await findImplementationJobByIdempotencyKey("ws-test:run-1", "ws-test");
    expect(result).toBeNull();
    expect(mockFindOne).toHaveBeenCalledWith({ idempotencyKey: "ws-test:run-1", workspaceId: "ws-test" });
  });

  it("findImplementationJobByIdempotencyKey returns the job when found", async () => {
    const doc = { ...makeJob(), _id: JOB_OID };
    mockFindOne.mockResolvedValue(doc);

    const result = await findImplementationJobByIdempotencyKey("ws-test:run-1", "ws-test");
    expect(result).toEqual({ ...makeJob(), _id: JOB_OID.toString() });
  });

  it("updateImplementationJob updates and returns serialized job", async () => {
    const updated = { ...makeJob({ status: "succeeded" }), _id: JOB_OID };
    mockFindOneAndUpdate.mockResolvedValue(updated);

    const result = await updateImplementationJob(JOB_OID.toString(), { status: "succeeded", updatedAt: NOW });
    expect(result).toEqual({ ...makeJob({ status: "succeeded" }), _id: JOB_OID.toString() });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: JOB_OID },
      { $set: { status: "succeeded", updatedAt: NOW } },
      { returnDocument: "after" },
    );
  });

  it("listImplementationJobsByWorkspace returns sorted jobs", async () => {
    const doc = { ...makeJob(), _id: JOB_OID };
    const toArray = vi.fn(async () => [doc]);
    const sort = vi.fn(() => ({ toArray }));
    mockFind.mockReturnValue({ sort });

    const result = await listImplementationJobsByWorkspace("ws-test");
    expect(result).toEqual([{ ...makeJob(), _id: JOB_OID.toString() }]);
    expect(mockFind).toHaveBeenCalledWith({ workspaceId: "ws-test" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });
});

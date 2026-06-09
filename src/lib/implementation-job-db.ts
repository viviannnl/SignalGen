import { ObjectId } from "mongodb";

import { getSignalGenDb } from "@/lib/mongodb";
import type { ImplementationJob } from "@/lib/types";

type ImplementationJobDocument = Omit<ImplementationJob, "_id"> & {
  _id?: ObjectId;
};

type ImplementationJobUpdate = Partial<
  Pick<
    ImplementationJob,
    | "status"
    | "commitSha"
    | "prUrl"
    | "prNumber"
    | "errorClass"
    | "errorMessage"
    | "logs"
    | "attempts"
    | "lastAttemptAt"
    | "changedFiles"
    | "codegenSummary"
    | "updatedAt"
  >
>;

function serializeImplementationJob(doc: ImplementationJobDocument): ImplementationJob {
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

export async function createImplementationJob(job: Omit<ImplementationJob, "_id">): Promise<ImplementationJob> {
  const db = await getSignalGenDb();
  const result = await db.collection<Omit<ImplementationJob, "_id">>("implementation_jobs").insertOne(job);
  return { ...job, _id: result.insertedId.toString() };
}

export async function findImplementationJobById(id: string): Promise<ImplementationJob | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getSignalGenDb();
  const doc = await db
    .collection<ImplementationJobDocument>("implementation_jobs")
    .findOne({ _id: new ObjectId(id) });
  return doc ? serializeImplementationJob(doc) : null;
}

export async function findImplementationJobByIdempotencyKey(
  idempotencyKey: string,
  workspaceId: string,
): Promise<ImplementationJob | null> {
  const db = await getSignalGenDb();
  const doc = await db
    .collection<ImplementationJobDocument>("implementation_jobs")
    .findOne({ idempotencyKey, workspaceId });
  return doc ? serializeImplementationJob(doc) : null;
}

export async function updateImplementationJob(
  id: string,
  update: ImplementationJobUpdate,
): Promise<ImplementationJob | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getSignalGenDb();
  const doc = await db.collection<ImplementationJobDocument>("implementation_jobs").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" },
  );
  return doc ? serializeImplementationJob(doc) : null;
}

export async function listImplementationJobsByWorkspace(workspaceId: string): Promise<ImplementationJob[]> {
  const db = await getSignalGenDb();
  const docs = await db
    .collection<ImplementationJobDocument>("implementation_jobs")
    .find({ workspaceId })
    .sort({ updatedAt: -1 })
    .toArray();
  return docs.map(serializeImplementationJob);
}

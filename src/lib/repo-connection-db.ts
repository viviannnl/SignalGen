import { ObjectId } from "mongodb";

import { getSignalGenDb } from "@/lib/mongodb";
import type { RepoConnection } from "@/lib/types";

type RepoConnectionDocument = Omit<RepoConnection, "_id"> & {
  _id?: ObjectId;
};

export type RepoConnectionUpdate = Partial<
  Pick<
    RepoConnection,
    | "status"
    | "installationId"
    | "defaultBranch"
    | "owner"
    | "repo"
    | "disabledReason"
    | "capabilities"
    | "updatedAt"
  >
>;

function serializeRepoConnection(doc: RepoConnectionDocument): RepoConnection {
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

export async function createRepoConnection(conn: Omit<RepoConnection, "_id">): Promise<RepoConnection> {
  const db = await getSignalGenDb();
  const result = await db.collection<Omit<RepoConnection, "_id">>("repo_connections").insertOne(conn);

  return {
    ...conn,
    _id: result.insertedId.toString(),
  };
}

export async function findRepoConnectionById(id: string): Promise<RepoConnection | null> {
  if (!ObjectId.isValid(id)) return null;

  const db = await getSignalGenDb();
  const doc = await db.collection<RepoConnectionDocument>("repo_connections").findOne({ _id: new ObjectId(id) });

  return doc ? serializeRepoConnection(doc) : null;
}

export async function listRepoConnectionsByWorkspace(workspaceId: string): Promise<RepoConnection[]> {
  const db = await getSignalGenDb();
  const docs = await db
    .collection<RepoConnectionDocument>("repo_connections")
    .find({ workspaceId })
    .sort({ updatedAt: -1 })
    .toArray();

  return docs.map((doc) => serializeRepoConnection(doc));
}

export async function updateRepoConnection(id: string, update: RepoConnectionUpdate): Promise<RepoConnection | null> {
  if (!ObjectId.isValid(id)) return null;

  const db = await getSignalGenDb();
  const doc = await db.collection<RepoConnectionDocument>("repo_connections").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" },
  );

  return doc ? serializeRepoConnection(doc) : null;
}

import { ObjectId } from "mongodb";

import { getSignalGenDb } from "@/lib/mongodb";
import type { AuditLog } from "@/lib/types";

type AuditLogDocument = Omit<AuditLog, "_id"> & {
  _id?: ObjectId;
};

function serializeAuditLog(doc: AuditLogDocument): AuditLog {
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

export async function writeAuditLog(entry: Omit<AuditLog, "_id">): Promise<void> {
  const db = await getSignalGenDb();
  await db.collection<Omit<AuditLog, "_id">>("audit_logs").insertOne(entry);
}

export async function listAuditLogs(workspaceId: string): Promise<AuditLog[]> {
  const db = await getSignalGenDb();
  const docs = await db
    .collection<AuditLogDocument>("audit_logs")
    .find({ workspaceId })
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((doc) => serializeAuditLog(doc));
}

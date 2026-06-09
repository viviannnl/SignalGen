import { ObjectId } from "mongodb";

import { getSignalGenDb } from "@/lib/mongodb";
import type { SignalGenRun } from "@/lib/types";

type SignalGenRunDocument = Omit<SignalGenRun, "_id"> & {
  _id?: ObjectId;
};

function serializeRun(doc: SignalGenRunDocument): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

export async function findRunById(id: string): Promise<SignalGenRun | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getSignalGenDb();
  const doc = await db.collection<SignalGenRunDocument>("runs").findOne({ _id: new ObjectId(id) });
  return doc ? serializeRun(doc) : null;
}

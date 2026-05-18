import { MongoClient, ObjectId, type Document } from "mongodb";
import "dotenv/config";

import type { ProcessRunResult, SignalGenRun } from "../schemas.js";

let clientPromise: Promise<MongoClient> | undefined;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI. Copy agent/.env.example to agent/.env and set MONGODB_URI locally.");
  }
  return uri;
}

async function getClient(): Promise<MongoClient> {
  clientPromise ??= new MongoClient(getMongoUri()).connect();
  return clientPromise;
}

async function getRunsCollection() {
  const client = await getClient();
  return client.db("signalgen").collection("runs");
}

function serializeRun(doc: Document): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

export async function listPendingRuns(limit = 5): Promise<SignalGenRun[]> {
  const collection = await getRunsCollection();
  const docs = await collection
    .find({ status: { $in: ["uploaded", "signal_detected"] } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  return docs.map(serializeRun);
}

export async function getRun(runId: string): Promise<SignalGenRun | null> {
  const collection = await getRunsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(runId) });
  return doc ? serializeRun(doc) : null;
}

export async function updateRunWithAnalysis(result: ProcessRunResult): Promise<{ updated: boolean; runId: string }> {
  const collection = await getRunsCollection();
  const { runId, ...update } = result;
  const response = await collection.updateOne(
    { _id: new ObjectId(runId) },
    {
      $set: {
        ...update,
        updatedAt: new Date(),
      },
    },
  );

  return { updated: response.modifiedCount === 1, runId };
}

export async function closeMongoClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = undefined;
}

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { processAgentTick, type AgentTickStore } from "@/lib/agent-tick";
import { callHostedAgent, getHostedAgentConfig } from "@/lib/hosted-agent-client";
import { getSignalGenDb } from "@/lib/mongodb";
import { buildMongoSignalMemoryStore } from "@/lib/signal-memory-store";
import type { SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

type TickRequestBody = {
  runId?: string;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

function pendingRunQuery(runId?: string) {
  const baseQuery = { status: { $in: ["uploaded", "signal_detected"] } };

  if (!runId) return baseQuery;
  if (!ObjectId.isValid(runId)) {
    return { ...baseQuery, _id: new ObjectId() };
  }

  return { ...baseQuery, _id: new ObjectId(runId) };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as TickRequestBody;
    const runId = body.runId?.trim() || undefined;

    const hostedConfig = getHostedAgentConfig();
    if (hostedConfig && runId) {
      const result = await callHostedAgent(hostedConfig, runId);
      return NextResponse.json(result);
    }

    const db = await getSignalGenDb();
    const collection = db.collection("runs");
    const signalMemoryStore = buildMongoSignalMemoryStore(db, collection);

    const store: AgentTickStore = {
      async listPendingRuns(limit, targetRunId) {
        const docs = await collection.find(pendingRunQuery(targetRunId)).sort({ createdAt: 1 }).limit(limit).toArray();
        return docs.map((doc) => serializeRun(doc));
      },
      async updateRunAnalysis(targetRunId, update) {
        if (!ObjectId.isValid(targetRunId)) return false;

        const response = await collection.updateOne(
          { _id: new ObjectId(targetRunId), status: { $in: ["uploaded", "signal_detected"] } },
          { $set: update },
        );

        return response.modifiedCount === 1;
      },
      ...signalMemoryStore,
    };

    const result = await processAgentTick(store, { limit: 5, runId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("SignalGen agent tick failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "SignalGen agent tick failed. Check server logs for details.",
      },
      { status: 500 },
    );
  }
}

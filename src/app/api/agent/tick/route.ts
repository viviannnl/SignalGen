import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { processAgentTick, type AgentTickStore } from "@/lib/agent-tick";
import { callHostedAgent, getHostedAgentConfig } from "@/lib/hosted-agent-client";
import { getSignalGenDb } from "@/lib/mongodb";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import { buildMongoSignalMemoryStore } from "@/lib/signal-memory-store";
import type { SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

type TickRequestBody = {
  runId?: string;
  repoConnectionId?: string;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

function pendingRunQuery(runId: string | undefined, repoConnectionId: string, workspaceId: string) {
  const baseQuery = { status: { $in: ["uploaded", "signal_detected"] }, workspaceId, repoConnectionId };

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
    const repoConnectionId = body.repoConnectionId?.trim() || undefined;
    if (!repoConnectionId) {
      return NextResponse.json({ ok: false, error: "Choose a repo before running the SignalGen agent." }, { status: 400 });
    }

    const connection = await findRepoConnectionById(repoConnectionId);
    if (!connection || connection.status !== "connected") {
      return NextResponse.json({ ok: false, error: "Choose a connected repo before running the SignalGen agent." }, { status: 400 });
    }

    const db = await getSignalGenDb();
    const collection = db.collection("runs");
    if (runId) {
      if (!ObjectId.isValid(runId)) {
        return NextResponse.json({ ok: false, error: "Invalid run id." }, { status: 400 });
      }
      const scopedRun = await collection.findOne({ _id: new ObjectId(runId), workspaceId: connection.workspaceId, repoConnectionId });
      if (!scopedRun) {
        return NextResponse.json({ ok: false, error: "Run not found for the selected repo." }, { status: 404 });
      }
    }

    const hostedConfig = getHostedAgentConfig();
    if (hostedConfig && runId) {
      const result = await callHostedAgent(hostedConfig, runId);
      return NextResponse.json(result);
    }
    const signalMemoryStore = buildMongoSignalMemoryStore(db, collection);

    const store: AgentTickStore = {
      async listPendingRuns(limit, targetRunId) {
        const docs = await collection.find(pendingRunQuery(targetRunId, repoConnectionId, connection.workspaceId)).sort({ createdAt: 1 }).limit(limit).toArray();
        return docs.map((doc) => serializeRun(doc));
      },
      async updateRunAnalysis(targetRunId, update) {
        if (!ObjectId.isValid(targetRunId)) return false;

        const response = await collection.updateOne(
          { _id: new ObjectId(targetRunId), workspaceId: connection.workspaceId, repoConnectionId, status: { $in: ["uploaded", "signal_detected"] } },
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

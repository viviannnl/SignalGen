import { timingSafeEqual } from "crypto";

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { processAgentTick, type AgentTickStore } from "@/lib/agent-tick";
import { callHostedAgent, getHostedAgentConfig } from "@/lib/hosted-agent-client";
import { getSignalGenDb } from "@/lib/mongodb";
import type { SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

const PENDING_RUN_STATUSES = ["uploaded", "signal_detected"];
const CRON_LIMIT = 10;

type CronResult = {
  ok: true;
  mode: "hosted-worker" | "local-runtime";
  processedRunIds: string[];
  processedCount: number;
  checkedCount: number;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return { ...doc, _id: doc._id?.toString() } as SignalGenRun;
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  const authorization = request.headers.get("authorization")?.trim();
  const expectedAuthorization = `Bearer ${cronSecret}`;
  return authorization ? safeEqual(authorization, expectedAuthorization) : false;
}

async function listPendingRuns(limit: number) {
  const db = await getSignalGenDb();
  const collection = db.collection("runs");
  const docs = await collection
    .find({ status: { $in: PENDING_RUN_STATUSES } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  return {
    collection,
    runs: docs.map((doc) => serializeRun(doc)),
  };
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hostedConfig = getHostedAgentConfig();
    const { collection, runs } = await listPendingRuns(CRON_LIMIT);

    if (hostedConfig) {
      const processedRunIds: string[] = [];

      for (const run of runs) {
        if (!run._id) continue;
        const result = await callHostedAgent(hostedConfig, run._id);
        processedRunIds.push(...result.processedRunIds);
      }

      const result: CronResult = {
        ok: true,
        mode: "hosted-worker",
        processedRunIds,
        processedCount: processedRunIds.length,
        checkedCount: runs.length,
      };
      return NextResponse.json(result);
    }

    const store: AgentTickStore = {
      async listPendingRuns() {
        return runs;
      },
      async updateRunAnalysis(runId, update) {
        if (!ObjectId.isValid(runId)) return false;
        const response = await collection.updateOne(
          { _id: new ObjectId(runId), status: { $in: PENDING_RUN_STATUSES } },
          { $set: update },
        );
        return response.modifiedCount === 1;
      },
    };

    const localResult = await processAgentTick(store, { limit: CRON_LIMIT });
    const result: CronResult = {
      ok: true,
      mode: "local-runtime",
      processedRunIds: localResult.processedRunIds,
      processedCount: localResult.processedCount,
      checkedCount: runs.length,
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error("SignalGen cron tick failed", error);
    return NextResponse.json({ ok: false, error: "Cron tick failed." }, { status: 500 });
  }
}

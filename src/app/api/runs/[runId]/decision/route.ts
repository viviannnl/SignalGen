import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { applyFounderDecision, FounderDecisionError } from "@/lib/founder-decision";
import { getSignalGenClient, getSignalGenDb } from "@/lib/mongodb";
import type { FounderDecisionAction, SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

type DecisionRequestBody = {
  action?: FounderDecisionAction;
  note?: string;
};

type DecisionRouteContext = {
  params: Promise<{ runId: string }>;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

export async function POST(request: Request, context: DecisionRouteContext) {
  try {
    const { runId } = await context.params;
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json({ ok: false, error: "Invalid run id." }, { status: 400 });
    }

    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const body = rawBody && typeof rawBody === "object" ? (rawBody as DecisionRequestBody) : {};
    const db = await getSignalGenDb();
    const collection = db.collection("runs");
    const objectId = new ObjectId(runId);
    const doc = await collection.findOne({ _id: objectId });

    if (!doc) {
      return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
    }

    const update = applyFounderDecision(serializeRun(doc), {
      action: body.action as FounderDecisionAction,
      note: body.note,
      decidedBy: "dashboard_founder",
    });

    const client = await getSignalGenClient();
    const session = client.startSession();
    let decidedRun: SignalGenRun | null = null;
    try {
      await session.withTransaction(async () => {
        const response = await collection.findOneAndUpdate(
          { _id: objectId, status: "plan_ready" },
          { $set: update },
          { returnDocument: "after", session },
        );

        if (!response) return;

        decidedRun = serializeRun(response);
        const signalStatus = update.status;
        const planStatus = body.action === "approve" ? "approved" : "rejected";
        const signals = await db.collection("signals").find({ "evidenceItems.runId": runId }, { session }).toArray();
        const signalIds = signals.map((signal) => signal._id?.toString()).filter((id): id is string => Boolean(id));
        if (signalIds.length > 0) {
          await db.collection("signals").updateMany(
            { "evidenceItems.runId": runId },
            { $set: { status: signalStatus, updatedAt: update.updatedAt } },
            { session },
          );
          await db.collection("plans").updateMany(
            { signalId: { $in: signalIds }, status: { $ne: "rejected" } },
            { $set: { status: planStatus, approvalDecision: decidedRun.founderDecision, updatedAt: update.updatedAt } },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!decidedRun) {
      return NextResponse.json({ ok: false, error: "Run could not be decided because it is no longer plan-ready." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, run: decidedRun });
  } catch (error) {
    if (error instanceof FounderDecisionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
    }

    console.error("SignalGen founder decision failed", error);
    return NextResponse.json({ ok: false, error: "SignalGen founder decision failed. Check server logs for details." }, { status: 500 });
  }
}

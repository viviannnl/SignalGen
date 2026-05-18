import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { applyFounderDecision, FounderDecisionError } from "@/lib/founder-decision";
import { getSignalGenDb } from "@/lib/mongodb";
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

    const response = await collection.findOneAndUpdate(
      { _id: objectId, status: "plan_ready" },
      { $set: update },
      { returnDocument: "after" },
    );

    if (!response) {
      return NextResponse.json({ ok: false, error: "Run could not be decided because it is no longer plan-ready." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, run: serializeRun(response) });
  } catch (error) {
    if (error instanceof FounderDecisionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
    }

    console.error("SignalGen founder decision failed", error);
    return NextResponse.json({ ok: false, error: "SignalGen founder decision failed. Check server logs for details." }, { status: 500 });
  }
}

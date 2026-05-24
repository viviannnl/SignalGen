import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { createImplementationJob, ImplementationJobError } from "@/lib/implementation-job";
import { getSignalGenDb } from "@/lib/mongodb";
import type { SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

type ImplementRouteContext = {
  params: Promise<{ runId: string }>;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

export async function POST(_request: Request, context: ImplementRouteContext) {
  try {
    const { runId } = await context.params;
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
    }

    const db = await getSignalGenDb();
    const collection = db.collection("runs");
    const objectId = new ObjectId(runId);
    const doc = await collection.findOne({ _id: objectId });

    if (!doc) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const run = serializeRun(doc);
    if (run.status !== "approved") {
      return NextResponse.json({ error: "Implementation requires founder approval." }, { status: 400 });
    }

    if (run.implementation) {
      return NextResponse.json({ error: "Implementation already exists for this run." }, { status: 409 });
    }

    // GitHub automation is gated — requires workspace + repo connection + founder approval.
    // Real execution belongs in a future stage after all three gates exist.
    const update = createImplementationJob(run, {
      createdBy: "dashboard_founder",
    });

    const response = await collection.findOneAndUpdate(
      { _id: objectId, status: "approved", implementation: { $exists: false } },
      {
        $set: {
          ...update,
          status: "pr_created",
          updatedAt: update.updatedAt,
        },
      },
      { returnDocument: "after" },
    );

    if (!response) {
      return NextResponse.json({ error: "Implementation could not be created because the run changed." }, { status: 409 });
    }

    return NextResponse.json({ implementation: serializeRun(response).implementation });
  } catch (error) {
    if (error instanceof ImplementationJobError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error("SignalGen guarded implementation creation failed", error);
    return NextResponse.json({ error: "SignalGen guarded implementation creation failed. Check server logs for details." }, { status: 500 });
  }
}

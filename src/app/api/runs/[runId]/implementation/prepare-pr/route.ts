import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../../../../lib/api-auth";

import { ImplementationJobError, prepareImplementationPrDraft } from "@/lib/implementation-job";
import { getSignalGenDb } from "@/lib/mongodb";
import type { SignalGenRun } from "@/lib/types";

export const dynamic = "force-dynamic";

type PrepareRequestBody = {
  repoConnectionId?: string;
};

type PrepareRouteContext = {
  params: Promise<{ runId: string }>;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

export async function POST(request: Request, context: PrepareRouteContext) {
  try {
    const auth = await getApiAuthContextOrResponse(request);
    if (auth instanceof NextResponse) return auth;
    const { workspaceId } = auth;

    const body = (await request.json().catch(() => ({}))) as PrepareRequestBody;
    const { runId } = await context.params;
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json({ ok: false, error: "Invalid run id." }, { status: 400 });
    }

    const db = await getSignalGenDb();
    const collection = db.collection("runs");
    const objectId = new ObjectId(runId);
    const doc = await collection.findOne({ _id: objectId, workspaceId });

    if (!doc) {
      return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
    }

    const run = serializeRun(doc);
    if (!body.repoConnectionId || run.repoConnectionId !== body.repoConnectionId) {
      return NextResponse.json({ ok: false, error: "Choose the run's repo before preparing a PR draft." }, { status: 400 });
    }

    const update = prepareImplementationPrDraft(run);

    const response = await collection.findOneAndUpdate(
      { _id: objectId, workspaceId: run.workspaceId, repoConnectionId: run.repoConnectionId, status: "approved", "implementation.status": "queued" },
      { $set: update },
      { returnDocument: "after" },
    );

    if (!response) {
      return NextResponse.json({ ok: false, error: "Run could not prepare a PR draft because it is no longer queued." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, run: serializeRun(response) });
  } catch (error) {
    if (error instanceof ImplementationJobError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
    }

    console.error("SignalGen PR draft preparation failed", error);
    return NextResponse.json({ ok: false, error: "SignalGen PR draft preparation failed. Check server logs for details." }, { status: 500 });
  }
}

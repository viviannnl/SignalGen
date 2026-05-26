import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getSignalGenDb } from "@/lib/mongodb";
import { resolveRepoConnectionId, resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

function serializeRun(doc: Record<string, unknown>) {
  return { ...doc, _id: doc._id?.toString() };
}

export async function GET(request: Request, context: RouteContext) {
  const { runId } = await context.params;
  const repoConnectionId = resolveRepoConnectionId(request);
  if (!repoConnectionId) {
    return NextResponse.json({ error: "Choose a repo before loading this SignalGen run." }, { status: 400 });
  }

  if (!ObjectId.isValid(runId)) {
    return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
  }

  const db = await getSignalGenDb();
  const doc = await db.collection("runs").findOne({ _id: new ObjectId(runId), repoConnectionId });

  if (!doc) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const workspaceId = resolveWorkspaceId(request);
  if (doc.workspaceId && doc.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json({ run: serializeRun(doc) });
}

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../../lib/api-auth";

import { findImplementationJobByIdempotencyKey } from "@/lib/implementation-job-db";
import { getSignalGenDb } from "@/lib/mongodb";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import { chooseSignalRunId, getEvidenceRunIds, type RelatedRun, type SignalWithPlan } from "../../../../lib/signal-run-resolution";
import { serializePlan, serializeSignal } from "@/lib/signal-memory-store";
import type { SignalGenRun } from "@/lib/types";
import { buildWorkspaceRepoFilter, resolveRepoConnectionId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ signalId: string }>;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return { ...doc, _id: doc._id?.toString() } as SignalGenRun;
}

function getRunPrUrl(run: SignalGenRun, implementationJob?: { prUrl?: string } | null) {
  return run.pr?.url ?? implementationJob?.prUrl;
}

function getRunPreviewUrl(run: SignalGenRun) {
  return run.pr?.previewUrl ?? run.implementation?.prDraft?.previewUrl;
}

function serializeSourceRun(run: SignalGenRun, implementationJob?: { prUrl?: string } | null) {
  return {
    _id: run._id,
    status: run.status,
    founderDecision: run.founderDecision,
    prUrl: getRunPrUrl(run, implementationJob),
    previewUrl: getRunPreviewUrl(run),
    implementation: run.implementation,
    pr: run.pr,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { signalId } = await context.params;
  const repoConnectionId = resolveRepoConnectionId(request);
  if (!repoConnectionId) {
    return NextResponse.json({ error: "Choose a repo before loading this SignalGen signal." }, { status: 400 });
  }

  if (!ObjectId.isValid(signalId)) {
    return NextResponse.json({ error: "Invalid signal id." }, { status: 400 });
  }

  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const connection = await findRepoConnectionById(repoConnectionId);
  if (!connection || connection.workspaceId !== workspaceId || connection.status !== "connected") {
    return NextResponse.json({ error: "Choose a connected repo before loading this SignalGen signal." }, { status: 400 });
  }

  const db = await getSignalGenDb();
  const workspaceFilter = buildWorkspaceRepoFilter(workspaceId, repoConnectionId);
  const signalDoc = await db.collection("signals").findOne({ ...workspaceFilter, _id: new ObjectId(signalId) });
  if (!signalDoc) {
    return NextResponse.json({ error: "Signal not found." }, { status: 404 });
  }

  const signal = serializeSignal(signalDoc);
  const planOrClauses: Array<Record<string, unknown>> = [{ signalId: signal._id }];
  if (signal.currentPlanId && ObjectId.isValid(signal.currentPlanId)) {
    planOrClauses.push({ _id: new ObjectId(signal.currentPlanId) });
  }
  const planDocs = await db.collection("plans").find({
    ...workspaceFilter,
    $or: planOrClauses,
  }).sort({ updatedAt: -1 }).toArray();
  const plans = planDocs.map((doc) => serializePlan(doc));
  const plan = (signal._id ? plans.find((candidate) => candidate.signalId === signal._id) : undefined)
    ?? (signal.currentPlanId ? plans.find((candidate) => candidate._id === signal.currentPlanId) : undefined)
    ?? plans[0];
  const signalWithPlan: SignalWithPlan = { ...signal, currentPlan: plan };

  const relatedRunObjectIds = getEvidenceRunIds(signalWithPlan)
    .filter((runId) => ObjectId.isValid(runId))
    .map((runId) => new ObjectId(runId));
  const relatedRunDocs = relatedRunObjectIds.length > 0
    ? await db.collection("runs").find({ ...workspaceFilter, _id: { $in: relatedRunObjectIds } }).toArray()
    : [];
  const relatedRunsById = new Map(
    relatedRunDocs.map((doc) => {
      const run = serializeRun(doc) as RelatedRun;
      return [run._id, run] as const;
    }).filter((entry): entry is readonly [string, RelatedRun] => Boolean(entry[0])),
  );
  const resolvedRunId = chooseSignalRunId(signalWithPlan, relatedRunsById);
  const resolvedRun = resolvedRunId ? relatedRunsById.get(resolvedRunId) as SignalGenRun | undefined : undefined;
  const implementationJob = resolvedRun?._id ? await findImplementationJobByIdempotencyKey(`${workspaceId}:${resolvedRun._id}`, workspaceId) : null;

  return NextResponse.json({
    ok: true,
    signal,
    plan: plan ?? null,
    run: resolvedRun ? serializeSourceRun(resolvedRun, implementationJob) : null,
    implementationJob,
  });
}

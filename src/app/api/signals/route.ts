import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../lib/api-auth";

import { getSignalGenDb } from "@/lib/mongodb";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import { serializePlan, serializeSignal } from "@/lib/signal-memory-store";
import type { ProductSignal, SignalGenRun, SignalPlan } from "@/lib/types";
import { buildWorkspaceRepoFilter, resolveRepoConnectionId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type SignalWithPlan = ProductSignal & {
  currentPlan?: SignalPlan;
};

function serializeRun(doc: Record<string, unknown>): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

type RelatedRun = Pick<SignalGenRun, "_id" | "status" | "founderDecision" | "updatedAt">;

function getEvidenceRunIds(signal: SignalWithPlan): string[] {
  const runIds = [signal.runId, ...(signal.evidenceItems?.map((item) => item.runId) ?? [])].filter((id): id is string => Boolean(id));
  return Array.from(new Set(runIds));
}

function chooseSignalRunId(signal: SignalWithPlan, relatedRunsById: Map<string, RelatedRun>): string | undefined {
  const runIds = getEvidenceRunIds(signal);
  const relatedRuns = runIds.map((runId) => relatedRunsById.get(runId)).filter((run): run is RelatedRun => Boolean(run));
  const decisionAction = signal.currentPlan?.approvalDecision?.action;

  const findRun = (predicate: (run: RelatedRun) => boolean) => relatedRuns.find(predicate);
  const hasDecisionAction = (run: RelatedRun, action: "approve" | "reject") => !decisionAction || run.founderDecision?.action === action || !run.founderDecision;

  const preferredRun = (() => {
    if (signal.status === "approved") return findRun((run) => run.status === "approved" && hasDecisionAction(run, "approve"));
    if (signal.status === "rejected") return findRun((run) => run.status === "rejected" && hasDecisionAction(run, "reject"));
    if (signal.status === "implemented") return findRun((run) => run.status === "pr_created") ?? findRun((run) => run.status === "approved");
    if (signal.status === "plan_ready") return findRun((run) => run.status === "plan_ready");
    return undefined;
  })();

  if (preferredRun?._id) return preferredRun._id;

  if (["approved", "rejected", "implemented", "plan_ready"].includes(signal.status)) {
    // Decided/plan-ready signal rows are safer without navigation than linking to a run whose detail page shows the opposite state.
    return undefined;
  }

  return runIds[0];
}

function fallbackSignalFromRun(run: SignalGenRun): SignalWithPlan | null {
  if (!run.signal?.title && !run.signalClusters?.length) return null;

  const primaryCluster = run.signalClusters?.[0];
  const createdAt = run.processedAt ?? run.createdAt;
  const title = run.signal?.title ?? primaryCluster?.title ?? "Feedback signal";
  const summary = run.signal?.summary ?? primaryCluster?.summary ?? "Signal generated from uploaded feedback.";

  const signalStatus = run.status === "plan_ready"
    ? "plan_ready"
    : run.status === "approved"
      ? "approved"
      : run.status === "rejected"
        ? "rejected"
        : run.status === "pr_created"
          ? "implemented"
          : "accumulating";
  const hasActionablePlan = signalStatus === "plan_ready" || signalStatus === "approved" || signalStatus === "rejected" || signalStatus === "implemented";
  const signal: SignalWithPlan = {
    _id: run._id,
    runId: run._id,
    workspaceId: run.workspaceId,
    type: primaryCluster?.type ?? "friction",
    title,
    summary,
    signalKey: `legacy-run:${run._id ?? title}`,
    evidenceItemIds: run.evidenceItems?.map((item) => item.id) ?? [],
    evidenceItems: run.evidenceItems,
    strength: run.signal?.confidence ?? primaryCluster?.confidence ?? 0,
    confidence: run.signal?.confidence ?? primaryCluster?.confidence ?? 0,
    status: signalStatus,
    currentPlanId: hasActionablePlan ? run._id : undefined,
    createdAt,
    updatedAt: run.updatedAt,
  };

  if (hasActionablePlan && run.plan?.recommendedChange) {
    signal.currentPlan = {
      _id: run._id,
      workspaceId: run.workspaceId,
      signalId: run._id ?? "legacy-run",
      recommendedChange: run.plan.recommendedChange,
      filesToChange: run.plan.filesToChange,
      guardrails: run.plan.guardrails,
      acceptanceCriteria: run.plan.acceptanceCriteria,
      status: run.founderDecision?.action === "approve" ? "approved" : run.founderDecision?.action === "reject" ? "rejected" : "draft",
      approvalDecision: run.founderDecision,
      createdAt,
      updatedAt: run.updatedAt,
    };
  }

  return signal;
}

export async function GET(request: Request) {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const repoConnectionId = resolveRepoConnectionId(request);
  if (!repoConnectionId) {
    return NextResponse.json({ error: "Choose a repo before loading SignalGen signals." }, { status: 400 });
  }
  const connection = await findRepoConnectionById(repoConnectionId);
  if (!connection || connection.workspaceId !== workspaceId || connection.status !== "connected") {
    return NextResponse.json({ error: "Choose a connected repo before loading SignalGen signals." }, { status: 400 });
  }
  const db = await getSignalGenDb();
  const workspaceFilter = buildWorkspaceRepoFilter(workspaceId, repoConnectionId);

  const signalDocs = await db.collection("signals").find(workspaceFilter).sort({ updatedAt: -1 }).limit(100).toArray();
  const signals = signalDocs.map((doc) => serializeSignal(doc));
  const signalIds = signals.map((signal) => signal._id).filter((id): id is string => Boolean(id));

  const planDocs = signalIds.length > 0
    ? await db.collection("plans").find({ ...workspaceFilter, signalId: { $in: signalIds } }).sort({ updatedAt: -1 }).toArray()
    : [];
  const plans = planDocs.map((doc) => serializePlan(doc));
  const plansBySignalId = new Map<string, SignalPlan>();
  for (const plan of plans) {
    if (!plansBySignalId.has(plan.signalId)) {
      plansBySignalId.set(plan.signalId, plan);
    }
  }

  const rawSignalsWithPlans: SignalWithPlan[] = signals.map((signal) => ({
    ...signal,
    runId: signal.evidenceItems?.find((item) => item.runId)?.runId,
    currentPlan: (signal._id && plansBySignalId.get(signal._id)) || (signal.currentPlanId ? plans.find((plan) => plan._id === signal.currentPlanId) : undefined),
  }));

  const relatedRunObjectIds = Array.from(new Set(rawSignalsWithPlans.flatMap(getEvidenceRunIds)))
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
  const signalsWithPlans = rawSignalsWithPlans.map((signal) => ({
    ...signal,
    runId: chooseSignalRunId(signal, relatedRunsById),
  }));

  const representedRunIds = new Set(signalsWithPlans.flatMap((signal) => signal.evidenceItems?.map((item) => item.runId) ?? []));
  const legacyRuns = await db.collection("runs").find(workspaceFilter).sort({ createdAt: -1 }).limit(20).toArray();
  const fallbackSignals = legacyRuns
    .map((doc) => fallbackSignalFromRun(serializeRun(doc)))
    .filter((signal): signal is SignalWithPlan => Boolean(signal))
    .filter((signal) => !signal._id || !representedRunIds.has(signal._id));

  return NextResponse.json({
    signals: [...signalsWithPlans, ...fallbackSignals],
    source: signalsWithPlans.length > 0 ? "signals_with_runs_fallback" : "runs_fallback",
  });
}

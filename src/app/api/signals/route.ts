import { NextResponse } from "next/server";

import { getSignalGenDb } from "@/lib/mongodb";
import { serializePlan, serializeSignal } from "@/lib/signal-memory-store";
import type { ProductSignal, SignalGenRun, SignalPlan } from "@/lib/types";
import { buildWorkspaceFilter, resolveWorkspaceId } from "@/lib/workspace";

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
  const workspaceId = resolveWorkspaceId(request);
  const db = await getSignalGenDb();
  const workspaceFilter = buildWorkspaceFilter(workspaceId);

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

  const signalsWithPlans: SignalWithPlan[] = signals.map((signal) => ({
    ...signal,
    currentPlan: (signal._id && plansBySignalId.get(signal._id)) || (signal.currentPlanId ? plans.find((plan) => plan._id === signal.currentPlanId) : undefined),
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

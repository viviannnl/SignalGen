import type { EvidenceItem, ProductSignal, SignalCluster, SignalPlan, SignalStatus, SignalType } from "./types";

const HARDCODED_GUARDRAILS = [
  "No code changes before founder approval.",
  "Create a branch and PR instead of pushing directly to main.",
  "Do not touch secrets, auth, billing, or database migrations without explicit approval.",
  "Run build/tests before marking any PR ready for review.",
];

const ACTIONABLE_THRESHOLDS: Partial<Record<SignalType, number>> = {
  bug: 2,
  feature_request: 3,
  friction: 3,
  trust_objection: 3,
};

const EVIDENCE_TYPES_WITH_MORE_EVIDENCE_STATUS = new Set<SignalType>([
  "bug",
  "feature_request",
  "friction",
  "trust_objection",
  "pricing",
]);

function genericTitleFor(type: SignalType): string {
  switch (type) {
    case "bug":
      return "Repeated bug reports detected";
    case "feature_request":
      return "Repeated feature request detected";
    case "friction":
      return "Repeated product friction detected";
    case "trust_objection":
      return "Repeated trust objection detected";
    case "pricing":
      return "Pricing concern detected";
    case "praise":
      return "Positive feedback detected";
    case "noise":
      return "Low-signal feedback stored";
  }
}

export function normalizeSignalKey(type: string, title: string): string {
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return `${type}:${normalizedTitle}`;
}

export function clustersToEvidenceItems(runId: string, clusters: SignalCluster[], now = new Date().toISOString()): EvidenceItem[] {
  return clusters.map((cluster, index) => ({
    id: `evidence-${runId}-${index}`,
    runId,
    clusterType: cluster.type,
    title: cluster.title,
    summary: cluster.summary,
    commentIds: cluster.evidenceCommentIds,
    frequency: cluster.frequency,
    confidence: cluster.confidence,
    severity: cluster.severity,
    decision: cluster.decision,
    createdAt: now,
  }));
}

function signalKeyFor(signal: Pick<ProductSignal, "type" | "title" | "signalKey">): string {
  return signal.signalKey || normalizeSignalKey(signal.type, signal.title);
}

function isGenericSignal(signal: ProductSignal): boolean {
  return signal.title === genericTitleFor(signal.type);
}

export function matchEvidenceToSignals(
  evidenceItems: EvidenceItem[],
  existingSignals: ProductSignal[],
): { matched: Map<string, EvidenceItem[]>; unmatched: EvidenceItem[] } {
  const matched = new Map<string, EvidenceItem[]>();
  const unmatched: EvidenceItem[] = [];

  for (const item of evidenceItems) {
    if (item.clusterType === "noise") {
      unmatched.push(item);
      continue;
    }

    const itemKey = normalizeSignalKey(item.clusterType, item.title);
    const candidates = existingSignals.filter((signal) => signal._id && signal.type === item.clusterType);
    const exactMatch = candidates.find((signal) => signalKeyFor(signal) === itemKey);
    const genericMatch = exactMatch ? undefined : candidates.find((signal) => isGenericSignal(signal));
    const bestMatch = exactMatch ?? genericMatch;

    if (!bestMatch?._id) {
      unmatched.push(item);
      continue;
    }

    matched.set(bestMatch._id, [...(matched.get(bestMatch._id) ?? []), item]);
  }

  return { matched, unmatched };
}

export function computeSignalStatus(allEvidence: EvidenceItem[]): {
  strength: number;
  confidence: number;
  status: SignalStatus;
} {
  const totalFrequency = allEvidence.reduce((sum, item) => sum + item.frequency, 0);
  const strength = Math.min(totalFrequency / 5, 1);
  const confidence = allEvidence.length === 0 ? 0 : allEvidence.reduce((sum, item) => sum + item.confidence, 0) / allEvidence.length;
  const primaryType = allEvidence[0]?.clusterType;
  const planReadyThreshold = primaryType ? ACTIONABLE_THRESHOLDS[primaryType] : undefined;

  const hasPlanReadyEvidence = allEvidence.some((item) => item.decision === "propose_plan" || item.decision === "urgent_review");

  if (hasPlanReadyEvidence || (planReadyThreshold !== undefined && totalFrequency >= planReadyThreshold)) {
    return { strength, confidence, status: "plan_ready" };
  }

  if (primaryType && EVIDENCE_TYPES_WITH_MORE_EVIDENCE_STATUS.has(primaryType) && planReadyThreshold !== undefined && totalFrequency > 1) {
    return { strength, confidence, status: "needs_more_evidence" };
  }

  return { strength, confidence, status: "accumulating" };
}

export function createSignalFromEvidence(
  item: EvidenceItem,
  workspaceId: string | undefined,
  now: string,
): Omit<ProductSignal, "_id"> {
  return createSignalFromEvidenceItems([item], workspaceId, now);
}

function createSignalFromEvidenceItems(
  items: EvidenceItem[],
  workspaceId: string | undefined,
  now: string,
): Omit<ProductSignal, "_id"> {
  const firstItem = items[0];
  const { strength, confidence, status } = computeSignalStatus(items);

  return {
    workspaceId,
    type: firstItem.clusterType,
    title: firstItem.title,
    summary: firstItem.summary,
    signalKey: normalizeSignalKey(firstItem.clusterType, firstItem.title),
    evidenceItemIds: items.map((item) => item.id),
    evidenceItems: items,
    strength,
    confidence,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSignalUpdate(
  signal: ProductSignal,
  newEvidence: EvidenceItem[],
  now: string,
): Partial<ProductSignal> {
  const existingEvidence = signal.evidenceItems ?? [];
  const evidenceById = new Map<string, EvidenceItem>();
  for (const item of [...existingEvidence, ...newEvidence]) {
    evidenceById.set(item.id, item);
  }
  const evidenceItems = Array.from(evidenceById.values());
  const evidenceItemIds = Array.from(new Set([...signal.evidenceItemIds, ...newEvidence.map((item) => item.id)]));
  const { strength, confidence, status } = computeSignalStatus(evidenceItems);

  return {
    signalKey: signalKeyFor(signal),
    evidenceItemIds,
    evidenceItems,
    strength,
    confidence,
    status,
    updatedAt: now,
  };
}

export function buildPlanForSignal(
  signal: ProductSignal | Omit<ProductSignal, "_id">,
  signalId: string,
  workspaceId: string | undefined,
  now: string,
  sourcePlan?: Pick<SignalPlan, "recommendedChange" | "filesToChange" | "guardrails" | "acceptanceCriteria">,
): Omit<SignalPlan, "_id"> {
  return {
    workspaceId,
    signalId,
    recommendedChange: sourcePlan?.recommendedChange ?? `Draft a small, reviewable product improvement for: ${signal.title}. Cite the accumulated evidence before asking for founder approval.`,
    filesToChange: sourcePlan?.filesToChange?.length ? sourcePlan.filesToChange : ["Product UI/content file to be selected after founder approval"],
    guardrails: sourcePlan?.guardrails?.length ? sourcePlan.guardrails : HARDCODED_GUARDRAILS,
    acceptanceCriteria: sourcePlan?.acceptanceCriteria?.length
      ? sourcePlan.acceptanceCriteria
      : [
          "Plan cites the feedback evidence that triggered it.",
          "Change is limited to approved product surfaces.",
          "Founder approval is captured before any repo edit or PR.",
          "Build/tests must pass before PR is marked ready for review.",
        ],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

export type SignalMemoryProjection = {
  evidenceItems: EvidenceItem[];
  signalsToCreate: Array<Omit<ProductSignal, "_id">>;
  signalsToUpdate: Array<{ signalId: string; update: Partial<ProductSignal> }>;
  plansToCreate: Array<Omit<SignalPlan, "_id">>;
  plansToUpdate: Array<{ planId: string; update: Partial<SignalPlan> }>;
};

export function projectRunClustersToSignalMemory(
  runId: string,
  clusters: SignalCluster[],
  existingSignals: ProductSignal[],
  existingPlans: SignalPlan[],
  opts: {
    workspaceId?: string;
    now?: string;
    sourcePlan?: Pick<SignalPlan, "recommendedChange" | "filesToChange" | "guardrails" | "acceptanceCriteria">;
  },
): SignalMemoryProjection {
  const now = opts.now ?? new Date().toISOString();
  const evidenceItems = clustersToEvidenceItems(runId, clusters, now);
  const { matched, unmatched } = matchEvidenceToSignals(evidenceItems, existingSignals);

  const unmatchedBySignalKey = new Map<string, EvidenceItem[]>();
  for (const item of unmatched) {
    const signalKey = normalizeSignalKey(item.clusterType, item.title);
    unmatchedBySignalKey.set(signalKey, [...(unmatchedBySignalKey.get(signalKey) ?? []), item]);
  }

  const signalsToCreate = Array.from(unmatchedBySignalKey.values()).map((items) => createSignalFromEvidenceItems(items, opts.workspaceId, now));
  const signalsToUpdate: Array<{ signalId: string; update: Partial<ProductSignal> }> = [];
  const plansToCreate: Array<Omit<SignalPlan, "_id">> = [];

  for (const [signalId, newEvidence] of Array.from(matched.entries())) {
    const signal = existingSignals.find((item) => item._id === signalId);
    if (!signal) continue;

    const update = buildSignalUpdate(signal, newEvidence, now);
    signalsToUpdate.push({ signalId, update });

    const alreadyHasPlan = signal.currentPlanId || existingPlans.some((plan) => plan.signalId === signalId && plan.status !== "rejected");
    if (update.status === "plan_ready" && !alreadyHasPlan) {
      plansToCreate.push(buildPlanForSignal({ ...signal, ...update }, signalId, signal.workspaceId ?? opts.workspaceId, now, opts.sourcePlan));
    }
  }

  signalsToCreate.forEach((signal, index) => {
    if (signal.status !== "plan_ready") return;
    const signalId = `new-signal-${runId}-${index}`;
    plansToCreate.push(buildPlanForSignal(signal, signalId, signal.workspaceId ?? opts.workspaceId, now, opts.sourcePlan));
  });

  return {
    evidenceItems,
    signalsToCreate,
    signalsToUpdate,
    plansToCreate,
    plansToUpdate: [],
  };
}

import { MongoClient, ObjectId, type Document } from "mongodb";
import "dotenv/config";

import type { ProcessRunResult, SignalGenRun } from "../schemas.js";

type EvidenceItem = {
  id: string;
  runId: string;
  clusterType: string;
  title: string;
  summary: string;
  commentIds: string[];
  severity: string;
  frequency: number;
  confidence: number;
  decision: string;
  createdAt: string;
};

export type ProductSignalDocument = {
  _id?: ObjectId;
  workspaceId?: string;
  repoConnectionId?: string;
  signalKey: string;
  type: string;
  title: string;
  summary: string;
  evidenceItemIds: string[];
  evidenceItems?: EvidenceItem[];
  strength: number;
  confidence: number;
  status: string;
  currentPlanId?: string;
  createdAt: string;
  updatedAt: string;
};

type SignalPlanDocument = {
  _id?: ObjectId;
  workspaceId?: string;
  repoConnectionId?: string;
  signalId: string;
  recommendedChange: string;
  filesToChange: string[];
  guardrails: string[];
  acceptanceCriteria: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
};

const ACTIONABLE_THRESHOLDS: Record<string, number | undefined> = {
  bug: 2,
  feature_request: 3,
  friction: 3,
  trust_objection: 3,
};

let clientPromise: Promise<MongoClient> | undefined;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI. Copy agent/.env.example to agent/.env and set MONGODB_URI locally.");
  }
  return uri;
}

async function getClient(): Promise<MongoClient> {
  clientPromise ??= new MongoClient(getMongoUri()).connect();
  return clientPromise;
}

async function getRunsCollection() {
  const client = await getClient();
  return client.db("signalgen").collection("runs");
}

async function getSignalMemoryCollections() {
  const client = await getClient();
  const db = client.db("signalgen");
  return {
    runs: db.collection("runs"),
    signals: db.collection<ProductSignalDocument>("signals"),
    plans: db.collection<SignalPlanDocument>("plans"),
  };
}

function serializeRun(doc: Document): SignalGenRun {
  return {
    ...doc,
    _id: doc._id?.toString(),
  } as SignalGenRun;
}

export async function listPendingRuns(limit = 5): Promise<SignalGenRun[]> {
  const collection = await getRunsCollection();
  const docs = await collection
    .find({ status: { $in: ["uploaded", "signal_detected"] } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  return docs.map(serializeRun);
}

export async function getRun(runId: string): Promise<SignalGenRun | null> {
  const collection = await getRunsCollection();
  const doc = await collection.findOne({ _id: new ObjectId(runId) });
  return doc ? serializeRun(doc) : null;
}

export async function updateRunWithAnalysis(result: ProcessRunResult): Promise<{ updated: boolean; runId: string }> {
  const collection = await getRunsCollection();
  const { runId, ...update } = result;
  const response = await collection.updateOne(
    { _id: new ObjectId(runId) },
    {
      $set: {
        ...update,
        updatedAt: new Date(),
      },
    },
  );

  return { updated: response.modifiedCount === 1, runId };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "signal";
}

function buildSignalKey(type: string, title: string): string {
  return `${type}:${slugify(title)}`;
}

export function buildMemoryScopeFilter(workspaceId?: string, repoConnectionId?: string) {
  if (workspaceId && repoConnectionId) return { workspaceId, repoConnectionId };
  if (workspaceId) return { workspaceId };
  return { $or: [{ workspaceId: { $exists: false } }, { workspaceId: undefined }] };
}

export function buildSignalUpsertFilter(signal: Pick<ProductSignalDocument, "workspaceId" | "repoConnectionId" | "signalKey">) {
  return signal.repoConnectionId
    ? { workspaceId: signal.workspaceId, repoConnectionId: signal.repoConnectionId, signalKey: signal.signalKey }
    : { workspaceId: signal.workspaceId, signalKey: signal.signalKey };
}

function computeSignalStatus(evidenceItems: EvidenceItem[]) {
  const totalFrequency = evidenceItems.reduce((sum, item) => sum + Math.max(1, item.frequency), 0);
  const confidence = evidenceItems.length === 0
    ? 0
    : evidenceItems.reduce((sum, item) => sum + item.confidence, 0) / evidenceItems.length;
  const hasPlanReadyEvidence = evidenceItems.some((item) => item.decision === "propose_plan" || item.decision === "urgent_review");
  const strength = Math.min(1, Math.max(0.1, totalFrequency / 5));
  const primaryType = evidenceItems[0]?.clusterType;
  const planReadyThreshold = primaryType ? ACTIONABLE_THRESHOLDS[primaryType] : undefined;
  return {
    strength,
    confidence,
    status: hasPlanReadyEvidence || (planReadyThreshold !== undefined && totalFrequency >= planReadyThreshold) ? "plan_ready" : "accumulating",
  };
}

function clustersToEvidenceItems(runId: string, result: ProcessRunResult, now: string): EvidenceItem[] {
  return (result.signalClusters ?? []).map((cluster, index) => ({
    id: `evidence-${runId}-${index}`,
    runId,
    clusterType: cluster.type,
    title: cluster.title,
    summary: cluster.summary,
    commentIds: cluster.evidenceCommentIds,
    severity: cluster.severity,
    frequency: cluster.frequency,
    confidence: cluster.confidence,
    decision: cluster.decision,
    createdAt: now,
  }));
}

function mergeEvidence(existingEvidence: EvidenceItem[] = [], newEvidence: EvidenceItem[]) {
  const byId = new Map<string, EvidenceItem>();
  for (const item of [...existingEvidence, ...newEvidence]) byId.set(item.id, item);
  return Array.from(byId.values());
}

export async function persistSignalMemoryForRun(run: SignalGenRun, result: ProcessRunResult): Promise<void> {
  if (!run._id || !ObjectId.isValid(run._id) || !result.signalClusters?.length) return;

  const now = new Date().toISOString();
  const workspaceId = (run as { workspaceId?: string }).workspaceId;
  const repoConnectionId = (run as { repoConnectionId?: string }).repoConnectionId;
  const evidenceItems = clustersToEvidenceItems(run._id, result, now);
  const { runs, signals, plans } = await getSignalMemoryCollections();
  const existingSignals = await signals.find(buildMemoryScopeFilter(workspaceId, repoConnectionId)).toArray();

  const evidenceBySignalKey = new Map<string, EvidenceItem[]>();
  for (const evidence of evidenceItems) {
    const signalKey = buildSignalKey(evidence.clusterType, evidence.title);
    evidenceBySignalKey.set(signalKey, [...(evidenceBySignalKey.get(signalKey) ?? []), evidence]);
  }

  for (const [signalKey, groupedEvidence] of evidenceBySignalKey) {
    const representativeEvidence = groupedEvidence[0];
    const existingSignal = existingSignals.find((signal) => signal.signalKey === signalKey);
    const mergedEvidence = mergeEvidence(existingSignal?.evidenceItems, groupedEvidence);
    const status = computeSignalStatus(mergedEvidence);

    const signalToInsert: Omit<ProductSignalDocument, "_id"> = {
      workspaceId,
      repoConnectionId,
      signalKey,
      type: representativeEvidence.clusterType,
      title: representativeEvidence.title,
      summary: representativeEvidence.summary,
      evidenceItemIds: mergedEvidence.map((item) => item.id),
      evidenceItems: mergedEvidence,
      strength: status.strength,
      confidence: status.confidence,
      status: status.status,
      createdAt: now,
      updatedAt: now,
    };

    const persistedSignal = existingSignal?._id
      ? await signals.findOneAndUpdate(
        { _id: existingSignal._id },
        {
          $set: {
            evidenceItemIds: mergedEvidence.map((item) => item.id),
            evidenceItems: mergedEvidence,
            strength: status.strength,
            confidence: status.confidence,
            status: status.status,
            updatedAt: now,
          },
        },
        { returnDocument: "after" },
      )
      : await signals.findOneAndUpdate(
        buildSignalUpsertFilter(signalToInsert),
        { $setOnInsert: signalToInsert },
        { upsert: true, returnDocument: "after" },
      );

    const persistedSignalId = persistedSignal?._id;
    if (!persistedSignalId) continue;
    const signalId = persistedSignalId.toString();

    const persistedEvidence = mergeEvidence(persistedSignal.evidenceItems, groupedEvidence);
    if (persistedEvidence.length !== (persistedSignal.evidenceItems?.length ?? 0)) {
      const persistedStatus = computeSignalStatus(persistedEvidence);
      await signals.updateOne(
        { _id: persistedSignalId },
        {
          $set: {
            evidenceItemIds: persistedEvidence.map((item) => item.id),
            evidenceItems: persistedEvidence,
            strength: persistedStatus.strength,
            confidence: persistedStatus.confidence,
            status: persistedStatus.status,
            updatedAt: now,
          },
        },
      );
    }

    if (status.status === "plan_ready") {
      const existingPlan = await plans.findOne({ ...buildMemoryScopeFilter(workspaceId, repoConnectionId), signalId, status: { $ne: "rejected" } });
      const planResult = existingPlan ? undefined : await plans.insertOne({
        workspaceId,
        repoConnectionId,
        signalId,
        recommendedChange: result.plan?.recommendedChange ?? representativeEvidence.summary,
        filesToChange: result.plan?.filesToChange ?? [],
        guardrails: result.plan?.guardrails ?? ["Keep founder approval required before implementation."],
        acceptanceCriteria: result.plan?.acceptanceCriteria ?? ["Founder can review the proposed change before implementation."],
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      const currentPlanId = existingPlan?._id?.toString() ?? planResult?.insertedId.toString();
      if (currentPlanId) {
        await signals.updateOne({ _id: persistedSignalId, currentPlanId: { $exists: false } }, { $set: { currentPlanId, updatedAt: now } });
      }
    }
  }

  await runs.updateOne(
    { _id: new ObjectId(run._id) },
    {
      $set: {
        extractedComments: result.comments ?? run.comments ?? [],
        evidenceItems,
      },
    },
  );
}

export async function closeMongoClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = undefined;
}

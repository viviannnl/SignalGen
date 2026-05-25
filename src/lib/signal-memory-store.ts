import { ObjectId, type Collection, type Db, type Document } from "mongodb";

import type { AgentTickStore } from "./agent-tick";
import { computeSignalStatus } from "./signal-memory";
import type { ProductSignal, SignalGenRun, SignalPlan } from "./types";

function serializeDoc<T extends { _id?: unknown }>(doc: T): Omit<T, "_id"> & { _id?: string } {
  return { ...doc, _id: doc._id?.toString() } as Omit<T, "_id"> & { _id?: string };
}

function workspaceFilter(workspaceId?: string) {
  return workspaceId ? { workspaceId } : { $or: [{ workspaceId: { $exists: false } }, { workspaceId: undefined }] };
}

function objectIdOrNew(id: string): ObjectId {
  return ObjectId.isValid(id) ? new ObjectId(id) : new ObjectId();
}

export function serializeSignal(doc: Record<string, unknown>): ProductSignal {
  return serializeDoc(doc) as ProductSignal;
}

export function serializePlan(doc: Record<string, unknown>): SignalPlan {
  return serializeDoc(doc) as SignalPlan;
}

export function buildMongoSignalMemoryStore(db: Db, runsCollection: Collection<Document>): Pick<AgentTickStore, "listSignals" | "listPlans" | "persistSignalMemory"> {
  const signalsCollection = db.collection("signals");
  const plansCollection = db.collection("plans");

  return {
    async listSignals(workspaceId) {
      const docs = await signalsCollection.find(workspaceFilter(workspaceId)).sort({ updatedAt: -1 }).limit(200).toArray();
      return docs.map((doc) => serializeSignal(doc));
    },
    async listPlans(workspaceId) {
      const docs = await plansCollection.find(workspaceFilter(workspaceId)).sort({ updatedAt: -1 }).limit(200).toArray();
      return docs.map((doc) => serializePlan(doc));
    },
    async persistSignalMemory(run: SignalGenRun, projection) {
      if (!run._id || !ObjectId.isValid(run._id)) return;

      const insertedSignalIds = new Map<string, string>();
      for (const [index, signal] of projection.signalsToCreate.entries()) {
        const result = await signalsCollection.findOneAndUpdate(
          { workspaceId: signal.workspaceId, signalKey: signal.signalKey },
          { $setOnInsert: signal },
          { upsert: true, returnDocument: "after" },
        );
        if (result?._id) {
          const savedSignal = result as ProductSignal & { _id: ObjectId };
          const signalId = savedSignal._id.toString();
          insertedSignalIds.set(`new-signal-${run._id}-${index}`, signalId);

          const existingEvidence = savedSignal.evidenceItems ?? [];
          const evidenceById = new Map(existingEvidence.map((item) => [item.id, item]));
          for (const item of signal.evidenceItems ?? []) {
            evidenceById.set(item.id, item);
          }
          const evidenceItems = Array.from(evidenceById.values());
          if (evidenceItems.length !== existingEvidence.length) {
            const { strength, confidence, status } = computeSignalStatus(evidenceItems);
            await signalsCollection.updateOne(
              { _id: savedSignal._id },
              {
                $set: {
                  evidenceItemIds: evidenceItems.map((item) => item.id),
                  evidenceItems,
                  strength,
                  confidence,
                  status,
                  updatedAt: signal.updatedAt,
                },
              },
            );
          }
        }
      }

      for (const { signalId, update } of projection.signalsToUpdate) {
        if (!ObjectId.isValid(signalId)) continue;
        await signalsCollection.updateOne({ _id: new ObjectId(signalId) }, { $set: update });
      }

      for (const plan of projection.plansToCreate) {
        const signalId = insertedSignalIds.get(plan.signalId) ?? plan.signalId;
        const planToInsert = { ...plan, signalId };
        const existingPlan = await plansCollection.findOne({ signalId, status: { $ne: "rejected" } });
        const planId = existingPlan?._id?.toString();
        const result = planId ? undefined : await plansCollection.insertOne(planToInsert);
        const currentPlanId = planId ?? result?.insertedId.toString();
        if (ObjectId.isValid(signalId) && currentPlanId) {
          await signalsCollection.updateOne(
            { _id: new ObjectId(signalId), currentPlanId: { $exists: false } },
            { $set: { currentPlanId, updatedAt: plan.updatedAt } },
          );
        }
      }

      for (const { planId, update } of projection.plansToUpdate) {
        if (!ObjectId.isValid(planId)) continue;
        await plansCollection.updateOne({ _id: new ObjectId(planId) }, { $set: update });
      }

      await runsCollection.updateOne(
        { _id: objectIdOrNew(run._id) },
        {
          $set: {
            extractedComments: run.comments ?? [],
            evidenceItems: projection.evidenceItems,
          },
        },
      );
    },
  };
}

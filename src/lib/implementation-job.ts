import type { ImplementationPrDraft, ImplementationRecord, SignalGenRun } from "./types";

export class ImplementationJobError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImplementationJobError";
  }
}

export type CreateImplementationJobInput = {
  now?: string;
  createdBy: string;
};

export type PrepareImplementationPrDraftInput = {
  now?: string;
};

export type ImplementationUpdate = Pick<SignalGenRun, "updatedAt" | "implementation">;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function runIdForBranch(run: SignalGenRun) {
  return slugify(run._id || "new-run").slice(-32) || "new-run";
}

function branchNameFor(run: SignalGenRun) {
  return `signalgen/${runIdForBranch(run)}-${slugify(run.signal.title || "product-signal")}`;
}

function implementationGuardrails(run: SignalGenRun) {
  return Array.from(
    new Set([
      ...run.plan.guardrails,
      "Only work from this approved SignalGen run.",
      "Use a branch and PR; never push directly to main.",
      "Do not edit secrets, auth, billing, or database migrations without separate explicit approval.",
      "Run build/tests before marking the PR ready for review.",
    ]),
  );
}

export function createImplementationJob(run: SignalGenRun, input: CreateImplementationJobInput): ImplementationUpdate {
  if (run.status !== "approved" || run.founderDecision?.action !== "approve") {
    throw new ImplementationJobError("Only approved runs can start guarded implementation.", 409);
  }

  const now = input.now ?? new Date().toISOString();
  if (run.implementation) {
    return {
      updatedAt: now,
      implementation: run.implementation,
    };
  }

  const implementation: ImplementationRecord = {
    status: "queued",
    summary: `Guarded implementation queued for ${run.signal.title}: ${run.plan.recommendedChange}`,
    branchName: branchNameFor(run),
    guardrails: implementationGuardrails(run),
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
  };

  return {
    updatedAt: now,
    implementation,
  };
}

function prBodyFor(run: SignalGenRun, implementation: ImplementationRecord) {
  const evidence = run.signal.evidence.length > 0 ? run.signal.evidence.map((item) => `- ${item}`).join("\n") : "- No evidence captured.";
  const acceptanceCriteria = run.plan.acceptanceCriteria.map((item) => `- [ ] ${item}`).join("\n");
  const guardrails = implementation.guardrails.map((item) => `- ${item}`).join("\n");

  return `## SignalGen approved change\n\n${run.plan.recommendedChange}\n\n## Evidence\n\n${evidence}\n\n## Acceptance criteria\n\n${acceptanceCriteria}\n\n## Guardrails\n\n${guardrails}\n\n## Notes\n\nFounder decision: ${run.founderDecision?.note || "Approved in dashboard."}\n`;
}

export function prepareImplementationPrDraft(
  run: SignalGenRun,
  input: PrepareImplementationPrDraftInput = {},
): ImplementationUpdate {
  if (run.status !== "approved" || run.founderDecision?.action !== "approve") {
    throw new ImplementationJobError("Only approved runs can prepare a PR draft.", 409);
  }

  if (!run.implementation || run.implementation.status !== "queued") {
    throw new ImplementationJobError("A queued implementation job is required before preparing a PR draft.", 409);
  }

  const now = input.now ?? new Date().toISOString();
  const prDraft: ImplementationPrDraft = {
    title: `Implement: ${run.signal.title}`,
    body: prBodyFor(run, run.implementation),
    branchName: run.implementation.branchName,
    filesToInspect: run.plan.filesToChange,
    testCommands: ["npm test", "npm run lint", "npm run build"],
    checklist: [
      "Create a branch from the approved implementation job.",
      "Make the smallest product change that satisfies the evidence-backed plan.",
      "Run build/tests before marking the PR ready for review.",
      "Attach the Vercel preview URL when available.",
      "Wait for founder review before merging.",
    ],
    previewUrl: undefined,
  };

  return {
    updatedAt: now,
    implementation: {
      ...run.implementation,
      status: "ready_for_pr",
      updatedAt: now,
      prDraft,
    },
  };
}
